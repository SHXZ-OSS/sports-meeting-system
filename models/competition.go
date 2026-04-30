package models

import (
	"errors"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
	"gorm.io/gorm"
)

// CreateCompetition 创建比赛项目（学生提交）
func CreateCompetition(name, description, imagePath, unit string, gender int, rankingMode types.RankingMode, competitionType types.CompetitionType, minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, submitterID int, startTime, endTime *time.Time) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewCompetitionValidator(db)

	// 使用验证器验证比赛项目提交（学生提交）
	if err := validator.ValidateCompetitionSubmission(name, unit, gender, rankingMode, minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, startTime, endTime, false); err != nil {
		return err
	}

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 创建比赛
	competition := &types.Competition{
		EventID:                 currentEventID,
		Name:                    name,
		Description:             description,
		ImagePath:               imagePath,
		Unit:                    unit,
		Gender:                  gender,
		RankingMode:             rankingMode,
		CompetitionType:         competitionType,
		MinParticipantsPerClass: minParticipantsPerClass,
		MaxParticipantsPerClass: maxParticipantsPerClass,
		MinFemalePerClass:       minFemalePerClass,
		MaxFemalePerClass:       maxFemalePerClass,
		MinMalePerClass:         minMalePerClass,
		MaxMalePerClass:         maxMalePerClass,
		Status:                  types.StatusPendingApproval,
		SubmitterID:             &submitterID,
		StartTime:               startTime,
		EndTime:                 endTime,
	}

	// 使用事务插入比赛数据
	return db.Transaction(func(tx *gorm.DB) error {
		return tx.Create(competition).Error
	})
}

func UpdateCompetition(competition *types.Competition) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewCompetitionValidator(db)

	// 验证排名方式
	if !utils.IsRankingModeValid(competition.RankingMode) {
		competition.RankingMode = types.RankingHigherFirst // 默认为分数高的排名靠前
	}

	// 使用验证器验证比赛项目更新
	if err := validator.ValidateCompetitionUpdate(competition); err != nil {
		return err
	}

	// 使用事务更新比赛数据
	err := db.Transaction(func(tx *gorm.DB) error {
		return tx.Model(competition).Select("name", "description", "image_path", "unit", "gender", "ranking_mode", "competition_type", "min_participants_per_class", "max_participants_per_class", "min_female_per_class", "max_female_per_class", "min_male_per_class", "max_male_per_class", "start_time", "end_time").Updates(map[string]interface{}{
			"name":                       competition.Name,
			"description":                competition.Description,
			"image_path":                 competition.ImagePath,
			"unit":                       competition.Unit,
			"gender":                     competition.Gender,
			"ranking_mode":               competition.RankingMode,
			"competition_type":           competition.CompetitionType,
			"min_participants_per_class": competition.MinParticipantsPerClass,
			"max_participants_per_class": competition.MaxParticipantsPerClass,
			"min_female_per_class":       competition.MinFemalePerClass,
			"max_female_per_class":       competition.MaxFemalePerClass,
			"min_male_per_class":         competition.MinMalePerClass,
			"max_male_per_class":         competition.MaxMalePerClass,
			"start_time":                 competition.StartTime,
			"end_time":                   competition.EndTime,
		}).Error
	})
	if err != nil {
		return err
	}

	// 重新计算排名（如果已经有成绩）
	if err = CalculateRankingByCompetitionID(competition.ID); err != nil {
		return err
	}

	// 重新计算得分
	return RecalculatePointsByCompetitionID(competition.ID)
}

// ApproveCompetitionByID 审核通过比赛项目
func ApproveCompetitionByID(id, reviewerID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用验证器检查比赛项目是否存在
	validator := utils.NewCompetitionValidator(db)
	if _, err := validator.CheckCompetitionExists(id); err != nil {
		return err
	}

	// 更新比赛状态
	now := time.Now()
	return db.Model(&types.Competition{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":      types.StatusApproved,
		"reviewed_at": now,
		"reviewer_id": reviewerID,
	}).Error
}

// RejectCompetitionByID 审核拒绝比赛项目
func RejectCompetitionByID(id, reviewerID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用验证器检查比赛项目是否存在
	validator := utils.NewCompetitionValidator(db)
	if _, err := validator.CheckCompetitionExists(id); err != nil {
		return err
	}

	// 更新比赛状态
	now := time.Now()
	return db.Model(&types.Competition{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":      types.StatusRejected,
		"reviewed_at": now,
		"reviewer_id": reviewerID,
	}).Error
}

// AdminCreateCompetition 管理员创建比赛项目（不受时间限制）
func AdminCreateCompetition(name, description, imagePath, unit string, gender int, rankingMode types.RankingMode, competitionType types.CompetitionType, minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, submitterID int, startTime, endTime *time.Time) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewCompetitionValidator(db)

	// 使用验证器验证比赛项目提交（管理员提交）
	if err := validator.ValidateCompetitionSubmission(name, unit, gender, rankingMode, minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, startTime, endTime, true); err != nil {
		return err
	}

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 创建比赛
	now := time.Now()
	competition := &types.Competition{
		EventID:                 currentEventID,
		Name:                    name,
		Description:             description,
		ImagePath:               imagePath,
		Unit:                    unit,
		Gender:                  gender,
		RankingMode:             rankingMode,
		CompetitionType:         competitionType,
		MinParticipantsPerClass: minParticipantsPerClass,
		MaxParticipantsPerClass: maxParticipantsPerClass,
		MinFemalePerClass:       minFemalePerClass,
		MaxFemalePerClass:       maxFemalePerClass,
		MinMalePerClass:         minMalePerClass,
		MaxMalePerClass:         maxMalePerClass,
		Status:                  types.StatusApproved,
		ReviewedAt:              &now,
		ReviewerID:              &submitterID,
		StartTime:               startTime,
		EndTime:                 endTime,
	}

	// 使用事务插入比赛数据
	return db.Transaction(func(tx *gorm.DB) error {
		return tx.Create(competition).Error
	})
}

// GetCompetitionByID 通过ID获取比赛项目
func GetCompetitionByID(id int) (*types.Competition, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 查询比赛项目，包含关联数据
	var comp types.Competition
	err := db.Preload("Submitter.Class").
		Preload("Reviewer").
		Preload("ScoreSubmitter").
		Preload("ScoreReviewer").
		Where("event_id = ?", currentEventID).
		First(&comp, id).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, utils.ErrCompetitionNotFound
		}
		return nil, err
	}

	// 设置衍生字段
	if comp.Submitter != nil {
		submitterName := comp.Submitter.Class.Name + " " + comp.Submitter.FullName
		comp.SubmitterName = &submitterName
	}

	if comp.Reviewer != nil {
		comp.ReviewerName = comp.Reviewer.FullName
	}

	if comp.ScoreSubmitter != nil {
		comp.ScoreSubmitterName = comp.ScoreSubmitter.FullName
	}

	if comp.ScoreReviewer != nil {
		comp.ScoreReviewerName = comp.ScoreReviewer.FullName
	}

	// 获取报名数量
	var registrationCount int64
	if err := db.Model(&types.Registration{}).Where("competition_id = ?", id).Count(&registrationCount).Error; err != nil {
		return nil, err
	}
	comp.RegistrationCount = int(registrationCount)

	return &comp, nil
}

// GetAllCompetitions 获取所有比赛项目，支持分页和状态筛选
func GetAllCompetitions(page, pageSize int, statuses []types.CompetitionStatus, gender int, sortBy string) ([]*types.Competition, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 构建基础查询
	query := db.Model(&types.Competition{}).
		Where("event_id = ?", currentEventID).
		Preload("Submitter.Class").
		Preload("Reviewer").
		Preload("ScoreSubmitter").
		Preload("ScoreReviewer")

	// 添加过滤条件
	if gender > 0 {
		query = query.Where("gender = ? OR gender = 3", gender)
	}

	if len(statuses) > 0 {
		query = query.Where("status IN ?", statuses)
	}

	// 获取总数
	var total int64
	countQuery := db.Model(&types.Competition{}).Where("event_id = ?", currentEventID)
	if gender > 0 {
		countQuery = countQuery.Where("gender = ? OR gender = 3", gender)
	}
	if len(statuses) > 0 {
		countQuery = countQuery.Where("status IN ?", statuses)
	}
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 添加排序
	switch sortBy {
	case "votes":
		query = query.Order("vote_count DESC")
	case "name":
		query = query.Order("name ASC")
	case "schedule":
		query = query.Order("start_time ASC")
	default:
		query = query.Order("start_time ASC") // 默认按日程排序
	}

	// 添加分页
	if page > 0 && pageSize > 0 {
		offset := (page - 1) * pageSize
		query = query.Offset(offset).Limit(pageSize)
	}

	// 执行查询
	var competitions []*types.Competition
	if err := query.Find(&competitions).Error; err != nil {
		return nil, 0, err
	}

	// 为每个比赛项目设置衍生字段和获取报名数量
	for _, comp := range competitions {
		// 设置提交者名称
		if comp.Submitter != nil && comp.Submitter.Class.Name != "" {
			submitterName := comp.Submitter.Class.Name + " " + comp.Submitter.FullName
			comp.SubmitterName = &submitterName
		}

		// 设置审核者名称
		if comp.Reviewer != nil {
			comp.ReviewerName = comp.Reviewer.FullName
		}

		// 设置成绩提交者名称
		if comp.ScoreSubmitter != nil {
			comp.ScoreSubmitterName = comp.ScoreSubmitter.FullName
		}

		// 设置成绩审核者名称
		if comp.ScoreReviewer != nil {
			comp.ScoreReviewerName = comp.ScoreReviewer.FullName
		}

		// 获取报名数量
		var registrationCount int64
		if err := db.Model(&types.Registration{}).Where("competition_id = ?", comp.ID).Count(&registrationCount).Error; err == nil {
			comp.RegistrationCount = int(registrationCount)
		}
	}

	return competitions, int(total), nil
}

// DeleteCompetition 删除比赛项目
func DeleteCompetition(id int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务删除
	return db.Transaction(func(tx *gorm.DB) error {
		// 删除相关的报名记录
		if err := tx.Where("competition_id = ?", id).Delete(&types.Registration{}).Error; err != nil {
			return err
		}

		// 删除相关的成绩记录
		if err := tx.Where("competition_id = ?", id).Delete(&types.Score{}).Error; err != nil {
			return err
		}

		// 删除相关的投票记录
		if err := tx.Where("competition_id = ?", id).Delete(&types.Vote{}).Error; err != nil {
			return err
		}

		// 删除比赛项目
		return tx.Delete(&types.Competition{}, id).Error
	})
}

// 获取最新完成的比赛
func getLatestCompletedCompetition() (*types.Competition, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	var comp types.Competition
	err := db.Where("status = ? AND event_id = ?", types.StatusCompleted, currentEventID).
		Order("score_reviewed_at DESC").
		First(&comp).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // 没有找到已完成的比赛
		}
		return nil, err
	}

	return GetCompetitionByID(comp.ID)
}
