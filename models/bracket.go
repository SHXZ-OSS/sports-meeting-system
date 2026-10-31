package models

import (
	"errors"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// 对阵表相关错误
var (
	ErrBracketNotFound            = errors.New("对阵表不存在")
	ErrBracketMatchNotFound       = errors.New("比赛不存在")
	ErrBracketParticipantNotFound = errors.New("参赛方不存在")
	ErrBracketParticipantExists   = errors.New("参赛方已在对阵表中")
	ErrBracketStudentMissing      = errors.New("存在不存在的学生")
	ErrBracketCompetitionTaken    = errors.New("该比赛项目已关联其他对阵表")
	ErrBracketClassMissing        = errors.New("存在不存在的班级")
)

// CreateBracket 创建对阵表
func CreateBracket(bracket *types.Bracket) error {
	return database.GetDB().Create(bracket).Error
}

// UpdateBracket 更新对阵表基本信息（不含赛制与参赛方类型）
func UpdateBracket(bracket *types.Bracket) error {
	return database.GetDB().Model(bracket).Select(
		"Name", "Description", "CompetitionID", "GroupCount", "AdvancePerGroup",
		"ThirdPlaceMatch", "PointsWin", "PointsDraw", "PointsLoss", "Published",
	).Updates(bracket).Error
}

// UpdateBracketRadarConfig 保存雷达图配置（为空表示关闭）
func UpdateBracketRadarConfig(bracket *types.Bracket) error {
	return database.GetDB().Model(bracket).Select("RadarConfig").Updates(bracket).Error
}

// SaveParticipantRadarManual 保存参赛方的手动雷达评分（为空表示清除）
func SaveParticipantRadarManual(participantID int, manual map[string]float64) error {
	return database.GetDB().Model(&types.BracketParticipant{ID: participantID}).
		Select("RadarManual").
		Updates(&types.BracketParticipant{RadarManual: manual}).Error
}

// DeleteBracket 删除对阵表及其参赛方与比赛
func DeleteBracket(id int) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("bracket_id = ?", id).Delete(&types.BracketMatch{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bracket_id = ?", id).Delete(&types.BracketParticipant{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&types.Bracket{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrBracketNotFound
		}
		return nil
	})
}

// GetBracketByID 根据 ID 获取对阵表
func GetBracketByID(id int) (*types.Bracket, error) {
	var bracket types.Bracket
	if err := database.GetDB().First(&bracket, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBracketNotFound
		}
		return nil, err
	}
	fillBracketCompetitionNames([]*types.Bracket{&bracket})
	return &bracket, nil
}

// ListBrackets 分页获取届次下的对阵表，keyword 按名称模糊匹配；publishedOnly 仅返回已公开的
func ListBrackets(eventID, page, pageSize int, keyword string, publishedOnly bool) ([]*types.Bracket, int, error) {
	db := database.GetDB()

	// Count 与 Find 使用完全相同的筛选条件
	buildQuery := func() *gorm.DB {
		query := db.Model(&types.Bracket{}).Where("event_id = ?", eventID)
		if keyword != "" {
			query = query.Where("name LIKE ?", "%"+keyword+"%")
		}
		if publishedOnly {
			// 关联了比赛项目的对阵表跟随项目：项目须启用对阵图且已审核通过
			query = query.Where("published = ?", true).Where(
				"competition_id IS NULL OR competition_id IN (?)",
				db.Model(&types.Competition{}).Select("id").Where(
					"bracket_enabled = ? AND status NOT IN ?", true,
					[]types.CompetitionStatus{types.StatusPendingApproval, types.StatusRejected},
				),
			)
		}
		return query
	}

	var total int64
	if err := buildQuery().Count(&total).Error; err != nil {
		return nil, 0, err
	}

	query := buildQuery().Order("id DESC")
	if page > 0 && pageSize > 0 {
		query = query.Offset((page - 1) * pageSize).Limit(pageSize)
	}

	var brackets []*types.Bracket
	if err := query.Find(&brackets).Error; err != nil {
		return nil, 0, err
	}
	if err := fillBracketCounts(brackets); err != nil {
		return nil, 0, err
	}
	fillBracketCompetitionNames(brackets)
	return brackets, int(total), nil
}

// fillBracketCounts 填充参赛方数量与有效比赛数量
func fillBracketCounts(brackets []*types.Bracket) error {
	if len(brackets) == 0 {
		return nil
	}
	ids := make([]int, len(brackets))
	for i, b := range brackets {
		ids[i] = b.ID
	}

	type countRow struct {
		BracketID int
		Num       int
	}
	db := database.GetDB()

	var participantCounts []countRow
	if err := db.Model(&types.BracketParticipant{}).
		Select("bracket_id, COUNT(*) AS num").
		Where("bracket_id IN ?", ids).
		Group("bracket_id").Scan(&participantCounts).Error; err != nil {
		return err
	}
	var matchCounts []countRow
	if err := db.Model(&types.BracketMatch{}).
		Select("bracket_id, COUNT(*) AS num").
		Where("bracket_id IN ? AND status NOT IN ?", ids,
			[]types.BracketMatchStatus{types.MatchStatusBye, types.MatchStatusVoid}).
		Group("bracket_id").Scan(&matchCounts).Error; err != nil {
		return err
	}

	pc := make(map[int]int, len(participantCounts))
	for _, r := range participantCounts {
		pc[r.BracketID] = r.Num
	}
	mc := make(map[int]int, len(matchCounts))
	for _, r := range matchCounts {
		mc[r.BracketID] = r.Num
	}
	for _, b := range brackets {
		b.ParticipantNum = pc[b.ID]
		b.MatchNum = mc[b.ID]
	}
	return nil
}

// fillBracketCompetitionNames 填充关联比赛项目名称（查询失败时保留空串）
func fillBracketCompetitionNames(brackets []*types.Bracket) {
	ids := make([]int, 0, len(brackets))
	for _, b := range brackets {
		if b.CompetitionID != nil {
			ids = append(ids, *b.CompetitionID)
		}
	}
	if len(ids) == 0 {
		return
	}
	var competitions []types.Competition
	if err := database.GetDB().Select("id", "name", "bracket_enabled", "status").
		Where("id IN ?", ids).Find(&competitions).Error; err != nil {
		return
	}
	byID := make(map[int]types.Competition, len(competitions))
	for _, c := range competitions {
		byID[c.ID] = c
	}
	for _, b := range brackets {
		if b.CompetitionID == nil {
			continue
		}
		c := byID[*b.CompetitionID]
		b.CompetitionName = c.Name
		b.CompetitionBracketEnabled = c.BracketEnabled
		b.CompetitionStatus = c.Status
	}
}

// GetBracketByCompetitionID 获取比赛项目关联的对阵表；未关联时返回 ErrBracketNotFound
func GetBracketByCompetitionID(competitionID int) (*types.Bracket, error) {
	var bracket types.Bracket
	if err := database.GetDB().Where("competition_id = ?", competitionID).First(&bracket).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBracketNotFound
		}
		return nil, err
	}
	fillBracketCompetitionNames([]*types.Bracket{&bracket})
	return &bracket, nil
}

// EnsureCompetitionUnlinked 校验比赛项目未被其他对阵表关联（excludeBracketID 为当前对阵表，可为 0）
func EnsureCompetitionUnlinked(competitionID, excludeBracketID int) error {
	var count int64
	if err := database.GetDB().Model(&types.Bracket{}).
		Where("competition_id = ? AND id != ?", competitionID, excludeBracketID).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrBracketCompetitionTaken
	}
	return nil
}

// DeleteBracketsByCompetition 在事务中删除比赛项目关联的对阵表（比赛项目删除时调用）
func DeleteBracketsByCompetition(tx *gorm.DB, competitionID int) error {
	sub := tx.Model(&types.Bracket{}).Select("id").Where("competition_id = ?", competitionID)
	if err := tx.Where("bracket_id IN (?)", sub).Delete(&types.BracketMatch{}).Error; err != nil {
		return err
	}
	if err := tx.Where("bracket_id IN (?)", sub).Delete(&types.BracketParticipant{}).Error; err != nil {
		return err
	}
	return tx.Where("competition_id = ?", competitionID).Delete(&types.Bracket{}).Error
}

// ==== 参赛方 ====

// GetBracketParticipants 获取参赛方列表（按种子排序），并填充展示名称
func GetBracketParticipants(bracketID int) ([]*types.BracketParticipant, error) {
	var participants []*types.BracketParticipant
	if err := database.GetDB().
		Preload("Class").
		Preload("Student.Class").
		Where("bracket_id = ?", bracketID).
		Order("seed ASC, id ASC").
		Find(&participants).Error; err != nil {
		return nil, err
	}
	for _, p := range participants {
		switch {
		case p.Student != nil && p.Student.ID > 0:
			p.Name = p.Student.FullName
			p.ClassName = p.Student.Class.Name
		case p.Class != nil && p.Class.ID > 0:
			p.Name = p.Class.Name
		}
	}
	return participants, nil
}

// GetBracketParticipantByID 获取单个参赛方
func GetBracketParticipantByID(bracketID, id int) (*types.BracketParticipant, error) {
	var participant types.BracketParticipant
	if err := database.GetDB().Where("bracket_id = ? AND id = ?", bracketID, id).First(&participant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBracketParticipantNotFound
		}
		return nil, err
	}
	return &participant, nil
}

// AddBracketParticipants 批量添加参赛方（班级或学生 ID），已存在的报错；新参赛方的种子排在末尾
func AddBracketParticipants(bracket *types.Bracket, refIDs []int) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		column := "class_id"
		if bracket.ParticipantType == types.ParticipantTypeStudent {
			column = "student_id"
		}

		var existing int64
		if err := tx.Model(&types.BracketParticipant{}).
			Where("bracket_id = ? AND "+column+" IN ?", bracket.ID, refIDs).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrBracketParticipantExists
		}

		if err := ensureRefsExist(tx, bracket.ParticipantType, refIDs); err != nil {
			return err
		}

		var maxSeed int
		if err := tx.Model(&types.BracketParticipant{}).
			Where("bracket_id = ?", bracket.ID).
			Select("COALESCE(MAX(seed), 0)").Scan(&maxSeed).Error; err != nil {
			return err
		}

		rows := make([]types.BracketParticipant, len(refIDs))
		for i, refID := range refIDs {
			rows[i] = types.BracketParticipant{BracketID: bracket.ID, Seed: maxSeed + i + 1}
			if bracket.ParticipantType == types.ParticipantTypeStudent {
				rows[i].StudentID = &refID
			} else {
				rows[i].ClassID = &refID
			}
		}
		return tx.Create(&rows).Error
	})
}

// ensureRefsExist 校验班级/学生全部存在
func ensureRefsExist(tx *gorm.DB, participantType types.BracketParticipantType, refIDs []int) error {
	var count int64
	var err error
	if participantType == types.ParticipantTypeStudent {
		err = tx.Model(&types.Student{}).Where("id IN ?", refIDs).Count(&count).Error
	} else {
		err = tx.Model(&types.Class{}).Where("id IN ?", refIDs).Count(&count).Error
	}
	if err != nil {
		return err
	}
	if int(count) != len(uniqueInts(refIDs)) {
		if participantType == types.ParticipantTypeStudent {
			return ErrBracketStudentMissing
		}
		return ErrBracketClassMissing
	}
	return nil
}

// RemoveBracketParticipant 移除参赛方，并将后续种子前移
func RemoveBracketParticipant(bracketID, id int) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var participant types.BracketParticipant
		if err := tx.Where("bracket_id = ? AND id = ?", bracketID, id).First(&participant).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrBracketParticipantNotFound
			}
			return err
		}
		if err := tx.Delete(&participant).Error; err != nil {
			return err
		}
		return tx.Model(&types.BracketParticipant{}).
			Where("bracket_id = ? AND seed > ?", bracketID, participant.Seed).
			Update("seed", gorm.Expr("seed - 1")).Error
	})
}

// SaveBracketParticipantOrder 保存参赛方的种子与分组
func SaveBracketParticipantOrder(participants []*types.BracketParticipant) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for _, p := range participants {
			if err := tx.Model(&types.BracketParticipant{}).Where("id = ?", p.ID).
				Updates(map[string]any{"seed": p.Seed, "group_index": p.GroupIndex}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ==== 比赛 ====

// GetBracketMatches 获取对阵表全部比赛（按拓扑序）
func GetBracketMatches(bracketID int) ([]*types.BracketMatch, error) {
	var matches []*types.BracketMatch
	if err := database.GetDB().Where("bracket_id = ?", bracketID).Order("seq ASC").Find(&matches).Error; err != nil {
		return nil, err
	}
	return matches, nil
}

// HasBracketMatches 对阵表是否已生成比赛
func HasBracketMatches(bracketID int) (bool, error) {
	var count int64
	if err := database.GetDB().Model(&types.BracketMatch{}).Where("bracket_id = ?", bracketID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// ReplaceBracketMatches 删除旧比赛并写入新生成的比赛
func ReplaceBracketMatches(bracketID int, matches []*types.BracketMatch) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("bracket_id = ?", bracketID).Delete(&types.BracketMatch{}).Error; err != nil {
			return err
		}
		if len(matches) == 0 {
			return nil
		}
		return tx.CreateInBatches(matches, 100).Error
	})
}

// DeleteBracketMatches 清空对阵表的比赛
func DeleteBracketMatches(bracketID int) error {
	return database.GetDB().Where("bracket_id = ?", bracketID).Delete(&types.BracketMatch{}).Error
}

// SaveBracketMatches 保存比赛的推导结果与录入信息
func SaveBracketMatches(matches []*types.BracketMatch) error {
	if len(matches) == 0 {
		return nil
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for _, m := range matches {
			if err := tx.Model(m).Select(
				"P1ID", "P2ID", "Score1", "Score2", "WinnerID", "IsDraw", "Completed",
				"Status", "ScheduledAt", "Venue", "Note", "Stats1", "Stats2",
			).Updates(m).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// IsClassInAnyBracket 班级是否作为参赛方出现在任意对阵表中
func IsClassInAnyBracket(classID int) (bool, error) {
	var count int64
	if err := database.GetDB().Model(&types.BracketParticipant{}).Where("class_id = ?", classID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func uniqueInts(values []int) []int {
	seen := make(map[int]bool, len(values))
	out := make([]int, 0, len(values))
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
