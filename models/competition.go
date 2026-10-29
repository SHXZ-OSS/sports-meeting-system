package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateCompetition 创建待审核比赛项目（学生提交或班级账号代提交，班级账号归属记录在 classSubmitterUserID）
func CreateCompetition(
	name, description, venue, imagePath, unit string,
	gender int,
	rankingMode types.RankingMode,
	competitionType types.CompetitionType,
	minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, submitterStudentID, classSubmitterUserID int,
	startTime, endTime *time.Time,
	allowConcurrent bool,
	customFields []types.CompetitionCustomField,
) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewCompetitionValidator(db)

	// 使用验证器验证比赛项目提交（受项目征集时间限制）
	if err := validator.ValidateCompetitionSubmission(
		name,
		unit,
		gender,
		rankingMode,
		minParticipantsPerClass,
		maxParticipantsPerClass,
		minFemalePerClass,
		maxFemalePerClass,
		minMalePerClass,
		maxMalePerClass,
		startTime,
		endTime,
		false,
	); err != nil {
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
		Venue:                   venue,
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
		StartTime:               startTime,
		EndTime:                 endTime,
		AllowConcurrent:         allowConcurrent,
	}
	// 提交者归属二选一：学生提交记 submitter_id（students.id），班级账号代提交记 class_submitter_id（users.id）
	if submitterStudentID > 0 {
		competition.SubmitterID = &submitterStudentID
	}
	if classSubmitterUserID > 0 {
		competition.ClassSubmitterID = &classSubmitterUserID
	}

	// 使用事务插入比赛数据
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(competition).Error; err != nil {
			return err
		}
		return createCustomFields(tx, competition.ID, customFields)
	})
}

func UpdateCompetition(competition *types.Competition, customFields []types.CompetitionCustomField) error {
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

	// 已有报名或成绩时禁止修改比赛类型，避免历史数据与类型不一致
	var existing types.Competition
	if err := db.Select("competition_type").First(&existing, competition.ID).Error; err != nil {
		return err
	}
	if existing.CompetitionType != competition.CompetitionType {
		var registrationCount int64
		if err := db.Model(&types.Registration{}).Where("competition_id = ?", competition.ID).
			Count(&registrationCount).Error; err != nil {
			return err
		}
		var scoreCount int64
		if err := db.Model(&types.Score{}).Where("competition_id = ?", competition.ID).
			Count(&scoreCount).Error; err != nil {
			return err
		}
		if registrationCount > 0 || scoreCount > 0 {
			return errors.New("该项目已有报名或成绩，不能修改比赛类型")
		}
	}

	// 使用事务更新比赛数据
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(competition).
			Select("name", "description", "venue", "image_path", "unit", "gender", "ranking_mode", "competition_type", "min_participants_per_class", "max_participants_per_class", "min_female_per_class", "max_female_per_class", "min_male_per_class", "max_male_per_class", "start_time", "end_time", "allow_concurrent").
			Updates(map[string]any{
				"name":                       competition.Name,
				"description":                competition.Description,
				"venue":                      competition.Venue,
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
				"allow_concurrent":           competition.AllowConcurrent,
			}).
			Error; err != nil {
			return err
		}
		return syncCustomFields(tx, competition.ID, customFields)
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
	return db.Model(&types.Competition{}).Where("id = ?", id).Updates(map[string]any{
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
	return db.Model(&types.Competition{}).Where("id = ?", id).Updates(map[string]any{
		"status":      types.StatusRejected,
		"reviewed_at": now,
		"reviewer_id": reviewerID,
	}).Error
}

// AdminCreateCompetition 管理员创建比赛项目（不受时间限制）
func AdminCreateCompetition(
	name, description, venue, imagePath, unit string,
	gender int,
	rankingMode types.RankingMode,
	competitionType types.CompetitionType,
	minParticipantsPerClass, maxParticipantsPerClass, minFemalePerClass, maxFemalePerClass, minMalePerClass, maxMalePerClass, submitterID int,
	startTime, endTime *time.Time,
	allowConcurrent bool,
	customFields []types.CompetitionCustomField,
) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewCompetitionValidator(db)

	// 使用验证器验证比赛项目提交（管理员提交）
	if err := validator.ValidateCompetitionSubmission(
		name,
		unit,
		gender,
		rankingMode,
		minParticipantsPerClass,
		maxParticipantsPerClass,
		minFemalePerClass,
		maxFemalePerClass,
		minMalePerClass,
		maxMalePerClass,
		startTime,
		endTime,
		true,
	); err != nil {
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
		Venue:                   venue,
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
		AllowConcurrent:         allowConcurrent,
	}

	// 使用事务插入比赛数据
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(competition).Error; err != nil {
			return err
		}
		return createCustomFields(tx, competition.ID, customFields)
	})
}

// validateCustomFields 校验报名自定义字段定义
func validateCustomFields(fields []types.CompetitionCustomField) error {
	seen := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		name := strings.TrimSpace(field.Name)
		if name == "" {
			return errors.New("自定义字段名称不能为空")
		}
		if len([]rune(name)) > 50 {
			return fmt.Errorf("自定义字段名称过长：%s", name)
		}
		if strings.ContainsAny(name, "|;；") {
			return fmt.Errorf("自定义字段名称不能包含 | 或 ;：%s", name)
		}
		if !isValidCustomFieldType(field.FieldType) {
			return fmt.Errorf("自定义字段「%s」类型无效", name)
		}
		if _, ok := seen[name]; ok {
			return fmt.Errorf("自定义字段名称重复：%s", name)
		}
		seen[name] = struct{}{}
	}
	return nil
}

// isValidCustomFieldType 判断自定义字段类型是否合法
func isValidCustomFieldType(fieldType string) bool {
	switch fieldType {
	case types.CustomFieldTypeString, types.CustomFieldTypeInt, types.CustomFieldTypeFloat, types.CustomFieldTypeBool:
		return true
	default:
		return false
	}
}

// createCustomFields 创建比赛的报名自定义字段
func createCustomFields(tx *gorm.DB, competitionID int, fields []types.CompetitionCustomField) error {
	if len(fields) == 0 {
		return nil
	}
	if err := validateCustomFields(fields); err != nil {
		return err
	}

	records := make([]types.CompetitionCustomField, 0, len(fields))
	for i, field := range fields {
		sortOrder := field.SortOrder
		if sortOrder == 0 {
			sortOrder = i
		}
		records = append(records, types.CompetitionCustomField{
			CompetitionID: competitionID,
			Name:          strings.TrimSpace(field.Name),
			FieldType:     field.FieldType,
			Required:      field.Required,
			SortOrder:     sortOrder,
		})
	}
	return tx.Create(&records).Error
}

// syncCustomFields 同步比赛的自定义字段定义；已有报名值的字段禁止修改或删除
func syncCustomFields(tx *gorm.DB, competitionID int, fields []types.CompetitionCustomField) error {
	if err := validateCustomFields(fields); err != nil {
		return err
	}

	var existing []types.CompetitionCustomField
	if err := tx.Where("competition_id = ?", competitionID).Find(&existing).Error; err != nil {
		return err
	}

	existingByID := make(map[int]types.CompetitionCustomField, len(existing))
	for _, field := range existing {
		existingByID[field.ID] = field
	}

	incomingByID := make(map[int]types.CompetitionCustomField, len(fields))
	newFields := make([]types.CompetitionCustomField, 0)
	for i, field := range fields {
		field.Name = strings.TrimSpace(field.Name)
		if field.ID > 0 {
			if _, ok := existingByID[field.ID]; !ok {
				return fmt.Errorf("自定义字段不存在：%d", field.ID)
			}
			incomingByID[field.ID] = field
			continue
		}
		if field.SortOrder == 0 {
			field.SortOrder = i
		}
		field.CompetitionID = competitionID
		newFields = append(newFields, field)
	}

	for _, oldField := range existing {
		incoming, ok := incomingByID[oldField.ID]
		if !ok {
			count, err := countCustomFieldValues(tx, oldField.ID)
			if err != nil {
				return err
			}
			if count > 0 {
				return fmt.Errorf("字段「%s」已有报名数据，不能删除", oldField.Name)
			}
			if err := tx.Delete(&types.CompetitionCustomField{}, oldField.ID).Error; err != nil {
				return err
			}
			continue
		}

		if incoming.Name == oldField.Name &&
			incoming.FieldType == oldField.FieldType &&
			incoming.Required == oldField.Required &&
			incoming.SortOrder == oldField.SortOrder {
			continue
		}

		count, err := countCustomFieldValues(tx, oldField.ID)
		if err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("字段「%s」已有报名数据，不能修改", oldField.Name)
		}

		if err := tx.Model(&types.CompetitionCustomField{}).Where("id = ?", oldField.ID).Updates(map[string]any{
			"name":       incoming.Name,
			"field_type": incoming.FieldType,
			"required":   incoming.Required,
			"sort_order": incoming.SortOrder,
		}).Error; err != nil {
			return err
		}
	}

	if len(newFields) > 0 {
		if err := tx.Create(&newFields).Error; err != nil {
			return err
		}
	}
	return nil
}

// countCustomFieldValues 统计字段已有多少报名值
func countCustomFieldValues(tx *gorm.DB, fieldID int) (int64, error) {
	var count int64
	err := tx.Model(&types.RegistrationCustomValue{}).Where("field_id = ?", fieldID).Count(&count).Error
	return count, err
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
		Preload("ClassSubmitter").
		Preload("Reviewer").
		Preload("ScoreSubmitter").
		Preload("ScoreReviewer").
		Preload("CustomFields", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Where("event_id = ?", currentEventID).
		First(&comp, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, utils.ErrCompetitionNotFound
		}
		return nil, err
	}

	// 标记已有报名值的自定义字段，供前端禁用编辑
	if len(comp.CustomFields) > 0 {
		fieldIDs := make([]int, 0, len(comp.CustomFields))
		for _, field := range comp.CustomFields {
			fieldIDs = append(fieldIDs, field.ID)
		}

		var rows []struct {
			FieldID int
			Count   int64
		}
		if err := db.Model(&types.RegistrationCustomValue{}).
			Select("field_id, COUNT(*) AS count").
			Where("field_id IN ?", fieldIDs).
			Group("field_id").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		counts := make(map[int]int64, len(rows))
		for _, row := range rows {
			counts[row.FieldID] = row.Count
		}
		for i := range comp.CustomFields {
			comp.CustomFields[i].HasRegistrationData = counts[comp.CustomFields[i].ID] > 0
		}
	}

	// 设置衍生字段
	if comp.Submitter != nil {
		submitterName := comp.Submitter.Class.Name + " " + comp.Submitter.FullName
		comp.SubmitterName = &submitterName
	} else if comp.ClassSubmitter != nil {
		// 班级账号代提交，展示账号姓名便于审核追溯
		submitterName := comp.ClassSubmitter.FullName + "（班级账号提交）"
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
	if err := db.Model(&types.Registration{}).
		Where("competition_id = ?", id).
		Count(&registrationCount).
		Error; err != nil {
		return nil, err
	}
	comp.RegistrationCount = int(registrationCount)

	return &comp, nil
}

// GetAllCompetitions 获取所有比赛项目，支持分页和状态筛选
func GetAllCompetitions(
	page, pageSize int,
	statuses []types.CompetitionStatus,
	gender int,
	sortBy string,
) ([]*types.Competition, int, error) {
	return getAllCompetitions(page, pageSize, statuses, gender, sortBy, false)
}

// GetPublicCompetitions 获取公开比赛列表（排除仅报名项目）
func GetPublicCompetitions(
	page, pageSize int,
	statuses []types.CompetitionStatus,
	sortBy string,
) ([]*types.Competition, int, error) {
	return getAllCompetitions(page, pageSize, statuses, 0, sortBy, true)
}

func getAllCompetitions(
	page, pageSize int,
	statuses []types.CompetitionStatus,
	gender int,
	sortBy string,
	excludeRegistration bool,
) ([]*types.Competition, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 构建基础查询
	query := db.Model(&types.Competition{}).
		Where("event_id = ?", currentEventID).
		Preload("Submitter.Class").
		Preload("ClassSubmitter").
		Preload("Reviewer").
		Preload("ScoreSubmitter").
		Preload("ScoreReviewer").
		Preload("CustomFields", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		})

	// 添加过滤条件
	if gender > 0 {
		query = query.Where("gender = ? OR gender = 3", gender)
	}

	if len(statuses) > 0 {
		query = query.Where("status IN ?", statuses)
	}

	if excludeRegistration {
		query = query.Where("competition_type <> ?", types.TypeRegistration)
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
	if excludeRegistration {
		countQuery = countQuery.Where("competition_type <> ?", types.TypeRegistration)
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
		} else if comp.ClassSubmitter != nil {
			// 班级账号代提交，展示账号姓名便于审核追溯
			submitterName := comp.ClassSubmitter.FullName + "（班级账号提交）"
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
		if err := db.Model(&types.Registration{}).
			Where("competition_id = ?", comp.ID).
			Count(&registrationCount).
			Error; err == nil {
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
		// 删除该比赛报名的自定义字段值（必须在删除报名之前）
		if err := tx.Where(
			"registration_id IN (SELECT id FROM registrations WHERE competition_id = ?)", id,
		).Delete(&types.RegistrationCustomValue{}).Error; err != nil {
			return err
		}

		// 删除自定义字段定义
		if err := tx.Where("competition_id = ?", id).Delete(&types.CompetitionCustomField{}).Error; err != nil {
			return err
		}

		// 删除该比赛的排名积分（points.competition_id 外键要求先清理）
		if err := tx.Where("competition_id = ?", id).Delete(&types.Points{}).Error; err != nil {
			return err
		}

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

// UpdateCompetitionStatus 更新比赛状态（检录/进行中等手动流转）
func UpdateCompetitionStatus(id int, status types.CompetitionStatus) error {
	// 获取数据库连接
	db := database.GetDB()

	return db.Model(&types.Competition{}).Where("id = ?", id).Update("status", status).Error
}

// GetCompetitionsDueCheckinReminder 获取进入检录提醒时间窗且尚未提醒过的比赛
// 仅当前届次、已审核通过、有开始时间且需要检录的比赛参与提醒
func GetCompetitionsDueCheckinReminder(now time.Time, ahead time.Duration) ([]*types.Competition, error) {
	db := database.GetDB()

	var competitions []*types.Competition
	err := db.Model(&types.Competition{}).
		Where("event_id = ?", config.Get().CurrentEventID).
		Where("status = ?", types.StatusApproved).
		Where("competition_type NOT IN ?", []types.CompetitionType{types.TypeRegistration, types.TypeSchool}).
		Where("start_time IS NOT NULL").
		Where("start_time > ?", now).
		Where("start_time <= ?", now.Add(ahead)).
		Where("checkin_reminder_sent_at IS NULL").
		Order("start_time ASC").
		Find(&competitions).Error
	if err != nil {
		return nil, err
	}
	return competitions, nil
}

// ClaimCheckinReminder 原子领取检录前定时提醒的发送权，返回是否领取成功
// 先占位再发送，避免多个实例同时扫描时重复推送
func ClaimCheckinReminder(id int, claimedAt time.Time) (bool, error) {
	result := database.GetDB().Model(&types.Competition{}).
		Where("id = ? AND checkin_reminder_sent_at IS NULL", id).
		Update("checkin_reminder_sent_at", claimedAt)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// ResetCheckinReminderSent 重置检录前定时提醒状态（开始时间变化后按新时间重新提醒）
func ResetCheckinReminderSent(id int) error {
	return database.GetDB().Model(&types.Competition{}).
		Where("id = ?", id).
		Update("checkin_reminder_sent_at", nil).Error
}
