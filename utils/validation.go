package utils

import (
	"errors"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"gorm.io/gorm"
)

// 验证相关的错误定义
var (
	ErrSubmissionNotAllowed         = errors.New("当前不在项目征集时间内")
	ErrVotingNotAllowed             = errors.New("当前不在项目投票时间内")
	ErrRegistrationNotAllowed       = errors.New("当前不在报名时间内")
	ErrInvalidGender                = errors.New("无效的性别")
	ErrCompetitionNameExists        = errors.New("项目名称已存在")
	ErrCompetitionNotFound          = errors.New("比赛项目不存在")
	ErrStudentNotFound              = errors.New("学生不存在")
	ErrAlreadyRegistered            = errors.New("已报名该项目")
	ErrNotRegistered                = errors.New("未报名该项目")
	ErrGenderMismatch               = errors.New("不符合比赛性别限制")
	ErrMaxRegistrationsReached      = errors.New("已达到个人报名项目数量上限")
	ErrInvalidRankingMode           = errors.New("比赛项目排名方式无效")
	ErrMaxLessThanMin               = errors.New("最大报名人数不能小于最小报名人数")
	ErrFemaleMaxLessThanMin         = errors.New("女生最大人数不能小于最小人数")
	ErrMaleMaxLessThanMin           = errors.New("男生最大人数不能小于最小人数")
	ErrInvalidStatusForRegistration = errors.New("当前比赛状态不允许报名或取消报名")
	ErrEndTimeBeforeStartTime       = errors.New("结束时间不能早于开始时间")
)

// 性别常量
const (
	GenderMale   = 1 // 男
	GenderFemale = 2 // 女
	GenderMixed  = 3 // 混合
)

// CompetitionValidator 比赛验证器
type CompetitionValidator struct {
	db *gorm.DB
}

// RegistrationValidator 报名验证器
type RegistrationValidator struct {
	db *gorm.DB
}

// NewCompetitionValidator 创建比赛验证器
func NewCompetitionValidator(db *gorm.DB) *CompetitionValidator {
	return &CompetitionValidator{db: db}
}

// NewRegistrationValidator 创建报名验证器
func NewRegistrationValidator(db *gorm.DB) *RegistrationValidator {
	return &RegistrationValidator{db: db}
}

// ==== 时间相关验证函数 ====

// IsTimeInRange 检查当前时间是否在指定范围内
func IsTimeInRange(startTime, endTime string) bool {
	if startTime == "" || endTime == "" {
		return true // 如果没有配置时间限制，默认允许
	}

	now := time.Now()
	start, err := time.Parse("2006-01-02 15:04:05", startTime)
	if err != nil {
		return true // 解析失败时默认允许
	}
	end, err := time.Parse("2006-01-02 15:04:05", endTime)
	if err != nil {
		return true // 解析失败时默认允许
	}

	return now.After(start) && now.Before(end)
}

// IsSubmissionAllowed 检查是否允许项目征集提交
func IsSubmissionAllowed() bool {
	cfg := config.Get()
	if cfg == nil {
		return true
	}
	return IsTimeInRange(cfg.Competition.SubmissionStartTime, cfg.Competition.SubmissionEndTime)
}

// IsVotingAllowed 检查是否允许投票
func IsVotingAllowed() bool {
	cfg := config.Get()
	if cfg == nil {
		return true
	}
	return IsTimeInRange(cfg.Competition.VotingStartTime, cfg.Competition.VotingEndTime)
}

// IsRegistrationAllowed 检查是否允许报名
func IsRegistrationAllowed() bool {
	cfg := config.Get()
	if cfg == nil {
		return true
	}
	return IsTimeInRange(cfg.Competition.RegistrationStartTime, cfg.Competition.RegistrationEndTime)
}

// ==== 比赛相关验证函数 ====

// IsGenderValid 检查性别是否有效
func IsGenderValid(gender int) bool {
	return gender == GenderFemale || gender == GenderMale || gender == GenderMixed
}

// IsRankingModeValid 检查排名方式是否有效
func IsRankingModeValid(mode types.RankingMode) bool {
	return mode == types.RankingHigherFirst || mode == types.RankingLowerFirst
}

// ValidateParticipantsLimit 验证参与人数限制
func ValidateParticipantsLimit(minParticipants, maxParticipants int) error {
	// 如果最大人数和最小人数都大于0，检查最大人数是否小于最小人数
	if maxParticipants > 0 && minParticipants > 0 && maxParticipants < minParticipants {
		return ErrMaxLessThanMin
	}
	return nil
}

// ValidateGenderLimits 验证性别人数限制
func ValidateGenderLimits(minFemale, maxFemale, minMale, maxMale int) error {
	if maxFemale > 0 && minFemale > 0 && maxFemale < minFemale {
		return ErrFemaleMaxLessThanMin
	}
	if maxMale > 0 && minMale > 0 && maxMale < minMale {
		return ErrMaleMaxLessThanMin
	}
	return nil
}

// ValidateCompetitionTime 验证比赛时间
func ValidateCompetitionTime(startTime, endTime *time.Time) error {
	// 如果都提供了时间，检查结束时间是否早于开始时间
	if startTime != nil && endTime != nil && endTime.Before(*startTime) {
		return ErrEndTimeBeforeStartTime
	}
	return nil
}

// IsCompetitionStatusValidForRegistration 检查比赛状态是否允许报名
func IsCompetitionStatusValidForRegistration(status types.CompetitionStatus) bool {
	return status == types.StatusApproved
}

// ValidateCompetitionStatus 验证比赛状态
func ValidateCompetitionStatus(status types.CompetitionStatus) bool {
	validStatuses := []types.CompetitionStatus{
		types.StatusPendingApproval,
		types.StatusApproved,
		types.StatusRejected,
		types.StatusPendingScoreReview,
		types.StatusCompleted,
	}

	for _, validStatus := range validStatuses {
		if status == validStatus {
			return true
		}
	}
	return false
}

// ValidateCompetitionSubmission 验证比赛项目提交
func (cv *CompetitionValidator) ValidateCompetitionSubmission(name, unit string, gender int, rankingMode types.RankingMode, minParticipants, maxParticipants, minFemale, maxFemale, minMale, maxMale int, startTime, endTime *time.Time, isAdmin bool) error {
	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 检查项目征集时间限制（管理员无此限制）
	if !isAdmin && !IsSubmissionAllowed() {
		return ErrSubmissionNotAllowed
	}

	// 检查性别是否合法
	if !IsGenderValid(gender) {
		return ErrInvalidGender
	}

	// 验证排名方式
	if !IsRankingModeValid(rankingMode) {
		return ErrInvalidRankingMode
	}

	// 验证参与人数限制
	if err := ValidateParticipantsLimit(minParticipants, maxParticipants); err != nil {
		return err
	}

	// 验证性别人数限制
	if err := ValidateGenderLimits(minFemale, maxFemale, minMale, maxMale); err != nil {
		return err
	}

	// 验证比赛时间
	if err := ValidateCompetitionTime(startTime, endTime); err != nil {
		return err
	}

	// 检查项目名称是否已存在
	var count int64
	if err := cv.db.Model(&types.Competition{}).Where("name = ? AND event_id = ?", name, currentEventID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrCompetitionNameExists
	}

	return nil
}

// ValidateCompetitionUpdate 验证比赛项目更新
func (cv *CompetitionValidator) ValidateCompetitionUpdate(competition *types.Competition) error {
	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 检查性别是否合法
	if !IsGenderValid(competition.Gender) {
		return ErrInvalidGender
	}

	// 验证排名方式
	if !IsRankingModeValid(competition.RankingMode) {
		return ErrInvalidRankingMode
	}

	// 验证参与人数限制
	if err := ValidateParticipantsLimit(competition.MinParticipantsPerClass, competition.MaxParticipantsPerClass); err != nil {
		return err
	}

	// 验证性别人数限制
	if err := ValidateGenderLimits(competition.MinFemalePerClass, competition.MaxFemalePerClass, competition.MinMalePerClass, competition.MaxMalePerClass); err != nil {
		return err
	}

	// 验证比赛时间
	if err := ValidateCompetitionTime(competition.StartTime, competition.EndTime); err != nil {
		return err
	}

	// 验证项目名称是否已存在且不属于当前项目
	var count int64
	if err := cv.db.Model(&types.Competition{}).Where("name = ? AND id != ? AND event_id = ?", competition.Name, competition.ID, currentEventID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrCompetitionNameExists
	}

	// 验证要更新的项目是否存在
	var existing types.Competition
	if err := cv.db.First(&existing, competition.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCompetitionNotFound
		}
		return err
	}

	return nil
}

// CheckCompetitionExists 检查比赛是否存在
func (cv *CompetitionValidator) CheckCompetitionExists(id int) (*types.Competition, error) {
	var competition types.Competition
	if err := cv.db.First(&competition, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCompetitionNotFound
		}
		return nil, err
	}
	return &competition, nil
}

// ==== 报名相关验证函数 ====

// ValidateRegistration 验证报名请求
func (rv *RegistrationValidator) ValidateRegistration(studentID *int, classID *int, competitionID int, user *types.User) error {
	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 检查报名时间限制（学生报名时需要检查，非全局管理员也需要检查）
	// 全局管理员的判断标准：user不为空且ClassScopes为空（没有班级范围限制）
	isGlobalAdmin := user != nil && len(user.ClassScopes) == 0
	if !isGlobalAdmin && !IsRegistrationAllowed() {
		return ErrRegistrationNotAllowed
	}

	// 检查比赛是否存在
	var competition types.Competition
	if err := rv.db.Select("status, gender, competition_type").Where("id = ? AND event_id = ?", competitionID, currentEventID).First(&competition).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCompetitionNotFound
		}
		return err
	}

	if !IsCompetitionStatusValidForRegistration(competition.Status) {
		return ErrInvalidStatusForRegistration
	}

	// 个人和团体比赛都以学生为单位报名
	if studentID == nil || *studentID <= 0 {
		return ErrStudentNotFound
	}

	// 检查学生是否存在
	var student types.Student
	if err := rv.db.Select("gender").First(&student, *studentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrStudentNotFound
		}
		return err
	}

	// 检查比赛性别限制（管理员无此限制）
	if student.Gender != competition.Gender && competition.Gender != GenderMixed {
		return ErrGenderMismatch
	}

	// 检查是否已经报名
	var count int64
	if err := rv.db.Model(&types.Registration{}).Where("student_id = ? AND competition_id = ?", *studentID, competitionID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrAlreadyRegistered
	}

	// 检查学生报名数量限制（全局管理员无此限制，非全局管理员需要检查，仅统计个人比赛）
	// 团体比赛不受个人报名数量限制
	if !isGlobalAdmin && competition.CompetitionType == types.TypeIndividual {
		cfg := config.Get()
		if cfg != nil && cfg.Competition.MaxRegistrationsPerPerson > 0 {
			var studentRegistrationCount int64
			// 只统计个人比赛的报名数量，团体比赛不计入限制
			if err := rv.db.Model(&types.Registration{}).
				Joins("JOIN competitions ON registrations.competition_id = competitions.id").
				Where("registrations.student_id = ? AND competitions.competition_type = ? AND competitions.event_id = ?", *studentID, types.TypeIndividual, currentEventID).
				Count(&studentRegistrationCount).Error; err != nil {
				return err
			}
			if int(studentRegistrationCount) >= cfg.Competition.MaxRegistrationsPerPerson {
				return ErrMaxRegistrationsReached
			}
		}
	}

	return nil
}

// ValidateUnregistration 验证取消报名请求
func (rv *RegistrationValidator) ValidateUnregistration(studentID *int, classID *int, competitionID int, user *types.User) error {
	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 检查报名时间限制（学生报名时需要检查，非全局管理员也需要检查）
	// 全局管理员的判断标准：user不为空且ClassScopes为空（没有班级范围限制）
	isGlobalAdmin := user != nil && len(user.ClassScopes) == 0
	if !isGlobalAdmin && !IsRegistrationAllowed() {
		return ErrRegistrationNotAllowed
	}

	// 检查比赛是否存在
	var competition types.Competition
	if err := rv.db.Select("status").Where("id = ? AND event_id = ?", competitionID, currentEventID).First(&competition).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCompetitionNotFound
		}
		return err
	}

	if !IsCompetitionStatusValidForRegistration(competition.Status) {
		return ErrInvalidStatusForRegistration
	}

	// 检查学生是否存在
	if studentID == nil || *studentID <= 0 {
		return ErrStudentNotFound
	}

	var student types.Student
	if err := rv.db.Select("full_name").First(&student, *studentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrStudentNotFound
		}
		return err
	}

	return nil
}

// CheckRegistrationExists 检查报名记录是否存在
func (rv *RegistrationValidator) CheckRegistrationExists(studentID, competitionID int) error {
	var count int64
	if err := rv.db.Model(&types.Registration{}).Where("student_id = ? AND competition_id = ?", studentID, competitionID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrNotRegistered
	}
	return nil
}

// CheckStudentExists 检查学生是否存在
func (rv *RegistrationValidator) CheckStudentExists(studentID int) (*types.Student, error) {
	var student types.Student
	if err := rv.db.First(&student, studentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrStudentNotFound
		}
		return nil, err
	}
	return &student, nil
}

// ==== 用户管理相关验证函数 ====

var (
	ErrScopeNotAllowedForPermissions    = errors.New("用户拥有学生管理和报名管理以外的权限时不能指定班级scope")
	ErrPermissionExceedsOperator        = errors.New("不能创建/修改超出自己权限范围的用户")
	ErrCannotModifyHigherPermissionUser = errors.New("不能修改权限更高的用户")
	ErrNoPermissionsAssigned            = errors.New("必须为用户分配至少一种权限")
)

// ValidateUserCreateOrUpdate 验证用户创建或更新操作
func ValidateUserCreateOrUpdate(operatorPermission, targetPermission, originalPermission int, classScopes []int) error {
	// 检查是否设置超出自己权限范围的权限
	if HasMorePermissions(targetPermission, operatorPermission) {
		return ErrPermissionExceedsOperator
	}

	// 检查原始用户权限是否高于操作者
	if originalPermission != 0 && HasMorePermissions(originalPermission, operatorPermission) {
		return ErrCannotModifyHigherPermissionUser
	}

	// 验证权限和scope的配置
	hasNonScopedPermissions := HasPermission(targetPermission, PermissionProjectManagement) ||
		HasPermission(targetPermission, PermissionScoreInput) ||
		HasPermission(targetPermission, PermissionScoreReview) ||
		HasPermission(targetPermission, PermissionUserManagement) ||
		HasPermission(targetPermission, PermissionWebsiteManagement)

	hasScope := len(classScopes) > 0

	// 如果有其他权限（不支持scope的权限），但指定了scope，返回错误
	if hasNonScopedPermissions && hasScope {
		return ErrScopeNotAllowedForPermissions
	}

	// 不能创建没有任何权限的用户
	if targetPermission == 0 {
		return ErrNoPermissionsAssigned
	}

	return nil
}
