package database

import (
	"fmt"
	"reflect"
	"regexp"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"

	"github.com/SHXZ-OSS/sports-meeting-system/logger"
)

// fkDef 一个外键约束的定义。def 为规范化后的完整定义，比对以它为准，
// 因此模型侧新增任何外键属性都会自动纳入，无需在此枚举。
type fkDef struct {
	table      string // 约束所在表，many2many 为中间表
	name       string
	def        string
	columns    []string
	refTable   string
	refColumns []string
	pk         string // 子表单列主键，用于展示孤立行；复合主键为空
	model      any    // 传给 Migrator 用于定位该约束
}

// checkForeignKeysMigratable 在迁移前确认缺失的外键不会因孤立数据创建失败，
// 否则 AutoMigrate 中途报错中断启动，且错误不指向具体清理方法。
func checkForeignKeysMigratable() error {
	declared, err := declaredFKs()
	if err != nil {
		return err
	}
	live, err := sqliteLiveFKs()
	if err != nil {
		return err
	}

	var problems []string
	for _, fk := range declared {
		if _, ok := live[fk.table+"."+fk.name]; ok {
			continue // 已存在的行为校正由 syncForeignKeys 处理
		}
		// 表尚未创建（新库/新增表）时不存在孤立数据，由随后的 AutoMigrate 建表
		if !db.Migrator().HasTable(fk.table) || !db.Migrator().HasTable(fk.refTable) {
			continue
		}
		// 外键列尚未创建（本次新增的列）时同样不可能有孤立数据：列由随后的 AutoMigrate 补上且全为 NULL
		if !hasAllColumns(fk) {
			continue
		}
		orphans, err := countOrphans(fk)
		if err != nil {
			return fmt.Errorf("检查孤立行失败 %s.%s: %w", fk.table, fk.name, err)
		}
		if orphans > 0 {
			rows, err := orphanRows(fk, 10)
			if err != nil {
				return fmt.Errorf("查询孤立数据失败 %s.%s: %w", fk.table, fk.name, err)
			}
			detail := ""
			if len(rows) > 0 {
				more := ""
				if orphans > int64(len(rows)) {
					more = fmt.Sprintf("（其余 %d 行略）", orphans-int64(len(rows)))
				}
				detail = fmt.Sprintf("\n    受影响数据%s：%s",
					more, strings.Join(rows, "\n    "))
			}
			problems = append(problems, fmt.Sprintf("  %s.%s：%d 行孤立数据。清理语句：%s%s",
				fk.table, fk.name, orphans, orphanCleanupSQL(fk), detail))
		}
	}
	if len(problems) > 0 {
		return fmt.Errorf("%d 个待创建外键被孤立数据阻塞，按以下语句清理后重启：\n%s",
			len(problems), strings.Join(problems, "\n"))
	}
	return nil
}

// hasAllColumns 判断约束所在表上是否已存在该外键引用的全部列
func hasAllColumns(fk fkDef) bool {
	for _, col := range fk.columns {
		if !db.Migrator().HasColumn(fk.table, col) {
			return false
		}
	}
	return true
}

// orphanCleanupSQL 生成孤立数据清理语句。
func orphanCleanupSQL(fk fkDef) string {
	var notNull []string
	for _, col := range fk.columns {
		notNull = append(notNull, fmt.Sprintf("%s.%s IS NOT NULL", quoteIdent(fk.table), quoteIdent(col)))
	}
	noParent := noMatchingParentCond(fk)
	if strings.Contains(fk.def, "SET NULL") {
		sets := make([]string, 0, len(fk.columns))
		for _, col := range fk.columns {
			sets = append(sets, fmt.Sprintf("%s = NULL", quoteIdent(col)))
		}
		return fmt.Sprintf("UPDATE %s SET %s WHERE %s AND %s",
			quoteIdent(fk.table), strings.Join(sets, ", "),
			strings.Join(notNull, " AND "), noParent)
	}
	return fmt.Sprintf("DELETE FROM %s WHERE %s AND %s",
		quoteIdent(fk.table), strings.Join(notNull, " AND "), noParent)
}

// noMatchingParentCond 生成"引用的父行不存在"条件；
// 自引用外键改用派生表物化的 NOT IN，规避方言对子查询引用目标表的限制
func noMatchingParentCond(fk fkDef) string {
	if fk.table == fk.refTable {
		outer, inner := quotedTuple(fk.columns), quotedTuple(fk.refColumns)
		return fmt.Sprintf("%s NOT IN (SELECT %s FROM (SELECT %s FROM %s) AS _refs)",
			outer, inner, inner, quoteIdent(fk.table))
	}
	var on []string
	for i, col := range fk.columns {
		on = append(on, fmt.Sprintf("%s.%s = %s.%s",
			quoteIdent(fk.table), quoteIdent(col),
			quoteIdent(fk.refTable), quoteIdent(fk.refColumns[i])))
	}
	return fmt.Sprintf("NOT EXISTS (SELECT 1 FROM %s WHERE %s)",
		quoteIdent(fk.refTable), strings.Join(on, " AND "))
}

// quotedTuple 生成带引号的列元组，多列时加括号
func quotedTuple(cols []string) string {
	parts := make([]string, 0, len(cols))
	for _, c := range cols {
		parts = append(parts, quoteIdent(c))
	}
	t := strings.Join(parts, ", ")
	if len(parts) > 1 {
		t = "(" + t + ")"
	}
	return t
}

// syncForeignKeys 重建定义与模型声明不一致的外键。
//
// AutoMigrate 仅按约束名判断外键是否存在，从不比对定义本身，因此任何标签改动
// （引用目标、ON DELETE、ON UPDATE 等）对已建表的库都不生效，需在此校正。
func syncForeignKeys() error {
	declared, err := declaredFKs()
	if err != nil {
		return err
	}
	live, err := sqliteLiveFKs()
	if err != nil {
		return err
	}

	var fixed, skipped int
	for _, fk := range declared {
		cur, ok := live[fk.table+"."+fk.name]
		if ok && cur == fk.def {
			continue
		}

		// 孤立行会使创建或重建失败，而此时旧约束可能已删除、启动随即中断，故先行检查
		orphans, err := countOrphans(fk)
		if err != nil {
			return fmt.Errorf("检查孤立行失败 %s.%s: %w", fk.table, fk.name, err)
		}
		if orphans > 0 {
			detail := ""
			if rows, err := orphanRows(fk, 10); err == nil && len(rows) > 0 {
				detail = "\n  受影响数据: " + strings.Join(rows, "\n    ")
			}
			logger.L.Warn(fmt.Sprintf("外键 %s.%s 有 %d 行孤立数据，跳过处理；请先清理 %s 中引用不存在 %s 记录的行\n  当前: %s\n  期望: %s%s",
				fk.table, fk.name, orphans, fk.table, fk.refTable, cur, fk.def, detail))
			skipped++
			continue
		}

		if !ok {
			if err := createFK(fk); err != nil {
				return err
			}
			logger.L.Info(fmt.Sprintf("外键 %s.%s 已创建", fk.table, fk.name))
		} else {
			if err := rebuildFK(fk); err != nil {
				return err
			}
			logger.L.Info(fmt.Sprintf("外键 %s.%s 已校正\n  原: %s\n  新: %s", fk.table, fk.name, cur, fk.def))
		}
		fixed++
	}

	if fixed > 0 || skipped > 0 {
		logger.L.Info(fmt.Sprintf("外键对账完成：校正 %d 个，跳过 %d 个", fixed, skipped))
	}
	return nil
}

// rebuildFK 删除后按模型声明重建，重建 DDL 由 GORM 依标签生成
func rebuildFK(fk fkDef) error {
	return runWithoutSQLiteFKChecks(func() error {
		if err := db.Migrator().DropConstraint(fk.model, fk.name); err != nil {
			return fmt.Errorf("删除外键 %s.%s 失败: %w", fk.table, fk.name, err)
		}
		if err := db.Migrator().CreateConstraint(fk.model, fk.name); err != nil {
			return fmt.Errorf("重建外键 %s.%s 失败（旧约束已删除，该表当前缺少此外键）: %w",
				fk.table, fk.name, err)
		}
		return nil
	})
}

// createFK 按模型声明创建缺失的外键（SQLite 上 AutoMigrate 不建外键，由此补齐）
func createFK(fk fkDef) error {
	return runWithoutSQLiteFKChecks(func() error {
		if err := db.Migrator().CreateConstraint(fk.model, fk.name); err != nil {
			return fmt.Errorf("创建外键 %s.%s 失败: %w", fk.table, fk.name, err)
		}
		return nil
	})
}

// runWithoutSQLiteFKChecks SQLite 加外键需经 gormlite 整表重建，期间必须关闭外键检查，
// 否则 DROP 旧表会因子表引用数据触发约束错误
func runWithoutSQLiteFKChecks(fn func() error) error {
	if err := db.Exec("PRAGMA foreign_keys = OFF").Error; err != nil {
		return fmt.Errorf("关闭外键检查失败: %w", err)
	}
	defer db.Exec("PRAGMA foreign_keys = ON")
	return fn()
}

// declaredFKs 汇总模型声明的外键，含 many2many 中间表两侧
func declaredFKs() ([]fkDef, error) {
	var out []fkDef
	seen := map[string]bool{}

	collect := func(s *schema.Schema, model any) {
		for _, rel := range s.Relationships.Relations {
			if rel.Field.IgnoreMigration {
				continue
			}
			c := rel.ParseConstraint()
			if c == nil {
				continue
			}
			key := c.Schema.Table + "." + c.Name
			if seen[key] {
				continue
			}
			seen[key] = true

			cols := make([]string, 0, len(c.ForeignKeys))
			for _, f := range c.ForeignKeys {
				cols = append(cols, f.DBName)
			}
			refCols := make([]string, 0, len(c.References))
			for _, f := range c.References {
				refCols = append(refCols, f.DBName)
			}
			var pk string
			if f := c.Schema.PrioritizedPrimaryField; f != nil {
				pk = f.DBName
			}
			out = append(out, fkDef{
				table:      c.Schema.Table,
				name:       c.Name,
				def:        buildFKDef(c),
				columns:    cols,
				refTable:   c.ReferenceSchema.Table,
				refColumns: refCols,
				pk:         pk,
				model:      model,
			})
		}
	}

	for _, m := range allModels() {
		stmt := &gorm.Statement{DB: db}
		if err := stmt.Parse(m); err != nil {
			return nil, fmt.Errorf("解析模型失败: %w", err)
		}
		collect(stmt.Schema, m)

		// 中间表两侧的约束定义在 JoinTable 自身的关系上，需以中间表为操作对象
		for _, rel := range stmt.Schema.Relationships.Relations {
			if rel.JoinTable == nil {
				continue
			}
			collect(rel.JoinTable, reflect.New(rel.JoinTable.ModelType).Interface())
		}
	}
	return out, nil
}

// buildFKDef 取 GORM 实际会执行的约束 DDL 作为比对基准。
// 用 DryRun 让 GORM 自己渲染 Constraint.Build 的模板，模型侧新增的任何属性
// 都会自动出现在结果中，无需在此枚举。
func buildFKDef(c *schema.Constraint) string {
	sql, vars := c.Build()
	tx := db.Session(&gorm.Session{DryRun: true, NewDB: true}).Exec(sql, vars...)
	return normalizeFKDef(tx.Statement.SQL.String())
}

var (
	fkIdentRe = regexp.MustCompile("[`\"\\[\\]]")
	fkSpaceRe = regexp.MustCompile(`\s+`)
)

// normalizeFKDef 去掉标识符引号与多余空白，消除方言差异后再比对
func normalizeFKDef(s string) string {
	s = fkIdentRe.ReplaceAllString(s, "")
	s = fkSpaceRe.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "( ", "(")
	s = strings.ReplaceAll(s, " (", "(")
	s = strings.ReplaceAll(s, " )", ")")
	s = strings.ReplaceAll(s, " ,", ",")
	s = strings.TrimSpace(strings.ToUpper(s))
	s = strings.ReplaceAll(s, " ON DELETE RESTRICT", "")
	s = strings.ReplaceAll(s, " ON UPDATE RESTRICT", "")
	s = strings.ReplaceAll(s, " ON DELETE NO ACTION", "")
	s = strings.ReplaceAll(s, " ON UPDATE NO ACTION", "")
	return s
}

var sqliteFKRe = regexp.MustCompile(
	`(?is)CONSTRAINT\s+[` + "`" + `"\[]?([^` + "`" + `"\]\s]+)[` + "`" + `"\]]?\s+FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+[` + "`" + `"\[]?([^` + "`" + `"\]\s(]+)[` + "`" + `"\]]?\s*\(([^)]*)\)([^,)]*)`,
)

// sqliteLiveFKs 解析 sqlite_master 的建表语句获取外键定义
func sqliteLiveFKs() (map[string]string, error) {
	var tables []struct{ Name, SQL string }
	if err := db.Raw("SELECT name, sql FROM sqlite_master WHERE type='table'").Scan(&tables).Error; err != nil {
		return nil, fmt.Errorf("读取现有外键失败: %w", err)
	}

	live := map[string]string{}
	for _, t := range tables {
		for _, m := range sqliteFKRe.FindAllStringSubmatch(t.SQL, -1) {
			live[t.Name+"."+strings.Trim(m[1], "`\"[]")] = normalizeFKDef(fmt.Sprintf(
				"CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s) %s",
				m[1], m[2], m[3], m[4], strings.TrimSpace(m[5]),
			))
		}
	}
	return live, nil
}

// orphanJoinQuery 生成孤立数据的 LEFT JOIN 查询，selectExpr 由调用方决定（COUNT 或列清单）
func orphanJoinQuery(fk fkDef, selectExpr string) string {
	var on, notNull []string
	for i, col := range fk.columns {
		on = append(on, fmt.Sprintf("c.%s = p.%s",
			quoteIdent(col), quoteIdent(fk.refColumns[i])))
		notNull = append(notNull, fmt.Sprintf("c.%s IS NOT NULL", quoteIdent(col)))
	}
	return fmt.Sprintf(
		"SELECT %s FROM %s c LEFT JOIN %s p ON %s WHERE %s AND p.%s IS NULL",
		selectExpr, quoteIdent(fk.table), quoteIdent(fk.refTable),
		strings.Join(on, " AND "), strings.Join(notNull, " AND "),
		quoteIdent(fk.refColumns[0]),
	)
}

// countOrphans 统计引用了不存在父行的子行，复合外键逐列判空
func countOrphans(fk fkDef) (int64, error) {
	if len(fk.columns) != len(fk.refColumns) || len(fk.columns) == 0 {
		return 0, nil
	}

	var n int64
	err := db.Raw(orphanJoinQuery(fk, "COUNT(*)")).Row().Scan(&n)
	return n, err
}

// orphanRows 取最多 limit 行孤立数据，格式为"主键=值, FK列=值"
func orphanRows(fk fkDef, limit int) ([]string, error) {
	if len(fk.columns) != len(fk.refColumns) || len(fk.columns) == 0 {
		return nil, nil
	}
	selectCols := fk.columns
	if fk.pk != "" {
		selectCols = append([]string{fk.pk}, selectCols...)
	}
	exprs := make([]string, 0, len(selectCols))
	for _, col := range selectCols {
		exprs = append(exprs, fmt.Sprintf("c.%s", quoteIdent(col)))
	}
	var results []map[string]any
	err := db.Raw(fmt.Sprintf("%s LIMIT %d",
		orphanJoinQuery(fk, strings.Join(exprs, ", ")), limit)).Scan(&results).Error
	if err != nil {
		return nil, err
	}

	out := make([]string, 0, len(results))
	for _, r := range results {
		parts := make([]string, 0, len(selectCols))
		for _, col := range selectCols {
			parts = append(parts, fmt.Sprintf("%s=%v", col, r[col]))
		}
		out = append(out, strings.Join(parts, ", "))
	}
	return out, nil
}

// quoteIdent 按方言引用标识符
func quoteIdent(name string) string {
	stmt := &gorm.Statement{DB: db, Table: name}
	return stmt.Quote(clause.Column{Name: name})
}
