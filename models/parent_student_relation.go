package models

import (
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// ParentStudentRelation 家长学生关系模型
type ParentStudentRelation struct {
	ID          int    `json:"id"           gorm:"primaryKey;autoIncrement"`
	ParentID    string `json:"parent_id"    gorm:"not null;index"` // 家长钉钉ID
	StudentID   string `json:"student_id"   gorm:"not null;index"` // 学生钉钉ID
	Relation    string `json:"relation"     gorm:"not null"`       // 关系描述
	StudentName string `json:"student_name" gorm:"-"`              // 忽略该字段，通过join获取

	// 唯一索引：同一家长和学生的同一种关系只能有一条记录
	// gorm的uniqueIndex需要在迁移时处理
}

// GetStudentsByParentID 根据家长ID获取所有关联的学生
func GetStudentsByParentID(parentID string) ([]*ParentStudentRelation, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 执行查询
	var relations []*ParentStudentRelation
	err := db.Raw(`
        SELECT psr.id, psr.parent_id, psr.student_id, psr.relation, s.full_name as student_name
        FROM parent_student_relations psr
        JOIN students s ON psr.student_id = s.dingtalk_id
        WHERE psr.parent_id = ?
    `, parentID).Scan(&relations).Error
	if err != nil {
		return nil, err
	}

	return relations, nil
}

// SaveParentStudentRelation 保存家长学生关系
func SaveParentStudentRelation(parentID string, studentID string, relation string) error {
	// 获取数据库连接
	db := database.GetDB()

	// 检查关系是否已存在
	var count int64
	if err := db.Model(&ParentStudentRelation{}).
		Where("parent_id = ? AND student_id = ? AND relation = ?", parentID, studentID, relation).
		Count(&count).
		Error; err != nil {
		return err
	}

	// 如果关系已存在，不需要再次添加
	if count > 0 {
		return nil
	}

	// 创建新的关系
	newRelation := &ParentStudentRelation{
		ParentID:  parentID,
		StudentID: studentID,
		Relation:  relation,
	}

	return db.Create(newRelation).Error
}

// ClearAllParentStudentRelations 清空所有家长-学生关系
func ClearAllParentStudentRelations() error {
	// 获取数据库连接
	db := database.GetDB()

	// 删除所有关系
	return db.Where("1 = 1").Delete(&ParentStudentRelation{}).Error
}

// GetParentsByStudentID 根据学生ID获取所有家长的钉钉ID
func GetParentsByStudentID(studentID int) ([]string, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 首先获取学生的钉钉ID
	var student types.Student
	if err := db.Select("dingtalk_id").First(&student, studentID).Error; err != nil {
		return nil, err
	}

	// 如果学生没有钉钉ID或钉钉ID为0，则返回空列表
	if student.DingTalkID == "" || student.DingTalkID == "0" {
		return []string{}, nil
	}

	// 执行查询获取关联的家长ID
	var relations []ParentStudentRelation
	if err := db.Select("parent_id").Where("student_id = ?", student.DingTalkID).Find(&relations).Error; err != nil {
		return nil, err
	}

	// 收集家长ID
	var parentIDs []string
	for _, relation := range relations {
		parentIDs = append(parentIDs, relation.ParentID)
	}

	return parentIDs, nil
}
