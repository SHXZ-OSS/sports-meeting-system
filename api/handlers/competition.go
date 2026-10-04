package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// splitAndTrim 分割字符串并去除空格
func splitAndTrim(s, sep string) []string {
	parts := strings.Split(s, sep)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// isValidCompetitionStatus 验证比赛状态是否有效
func isValidCompetitionStatus(status types.CompetitionStatus) bool {
	switch status {
	case types.StatusPendingApproval,
		types.StatusApproved,
		types.StatusCheckingIn,
		types.StatusInProgress,
		types.StatusRejected,
		types.StatusPendingScoreReview,
		types.StatusCompleted:
		return true
	default:
		return false
	}
}

// CreateCompetitionRequest 创建比赛项目请求
type CreateCompetitionRequest struct {
	Name                    string                `json:"name"                       binding:"required"`
	Description             string                `json:"description"`
	RankingMode             types.RankingMode     `json:"ranking_mode"               binding:"required,oneof=higher_first lower_first"`
	Gender                  int                   `json:"gender"                     binding:"required,min=1,max=3"`
	CompetitionType         types.CompetitionType `json:"competition_type"           binding:"required,oneof=individual team"`
	MinParticipantsPerClass int                   `json:"min_participants_per_class" binding:"min=0"`
	MaxParticipantsPerClass int                   `json:"max_participants_per_class" binding:"min=0"`
	MinFemalePerClass       int                   `json:"min_female_per_class"       binding:"min=0"`
	MaxFemalePerClass       int                   `json:"max_female_per_class"       binding:"min=0"`
	MinMalePerClass         int                   `json:"min_male_per_class"         binding:"min=0"`
	MaxMalePerClass         int                   `json:"max_male_per_class"         binding:"min=0"`
	Image                   string                `json:"image"`
	Unit                    string                `json:"unit"                       binding:"required"`
	Venue                   string                `json:"venue"`
	StartTime               *time.Time            `json:"start_time"`
	EndTime                 *time.Time            `json:"end_time"`
	AllowConcurrent         bool                  `json:"allow_concurrent"`
}

// UpdateCompetitionRequest 更新比赛项目请求
type UpdateCompetitionRequest struct {
	Name                    string                `json:"name"                       binding:"required"`
	Description             string                `json:"description"`
	RankingMode             types.RankingMode     `json:"ranking_mode"               binding:"required,oneof=higher_first lower_first"`
	CompetitionType         types.CompetitionType `json:"competition_type"           binding:"required,oneof=individual team"`
	MinParticipantsPerClass int                   `json:"min_participants_per_class" binding:"min=0"`
	MaxParticipantsPerClass int                   `json:"max_participants_per_class" binding:"min=0"`
	MinFemalePerClass       int                   `json:"min_female_per_class"       binding:"min=0"`
	MaxFemalePerClass       int                   `json:"max_female_per_class"       binding:"min=0"`
	MinMalePerClass         int                   `json:"min_male_per_class"         binding:"min=0"`
	MaxMalePerClass         int                   `json:"max_male_per_class"         binding:"min=0"`
	Image                   string                `json:"image"`
	Unit                    string                `json:"unit"                       binding:"required"`
	Venue                   string                `json:"venue"`
	Gender                  int                   `json:"gender"                     binding:"required,min=1,max=3"`
	StartTime               *time.Time            `json:"start_time"`
	EndTime                 *time.Time            `json:"end_time"`
	AllowConcurrent         bool                  `json:"allow_concurrent"`
	NotifyChanges           bool                  `json:"notify_changes"` // 时间或地点实际发生变化时，钉钉通知已报名学生
}

// GetAllCompetitions 获取所有比赛项目
func GetAllCompetitions(c *gin.Context) {
	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	statusStr := c.Query("status")
	sortBy := c.Query("sort_by") // 排序方式：name 或 votes

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 解析状态参数（支持逗号分隔的多个状态）
	var statuses []types.CompetitionStatus
	if statusStr != "" {
		statusList := splitAndTrim(statusStr, ",")
		for _, s := range statusList {
			status := types.CompetitionStatus(s)
			if !isValidCompetitionStatus(status) {
				utils.ResponseError(c, http.StatusBadRequest, "无效的状态值: "+s)
				return
			}
			statuses = append(statuses, status)
		}
	}

	// 获取比赛列表
	competitions, total, err := models.GetAllCompetitions(page, pageSize, statuses, 0, sortBy)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取比赛列表失败："+err.Error())
		return
	}

	// 如果指定了分页，返回分页响应
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, competitions, total, page, pageSize)
	} else {
		utils.ResponseOK(c, competitions)
	}
}

// GetAllEligibleCompetitions 获取所有符合条件的比赛项目
func GetAllEligibleCompetitions(c *gin.Context) {
	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	statusStr := c.Query("status")
	sortBy := c.Query("sort_by") // 排序方式：name 或 votes

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 解析状态参数（支持逗号分隔的多个状态）
	var statuses []types.CompetitionStatus
	if statusStr != "" {
		statusList := splitAndTrim(statusStr, ",")
		for _, s := range statusList {
			status := types.CompetitionStatus(s)
			if !isValidCompetitionStatus(status) {
				utils.ResponseError(c, http.StatusBadRequest, "无效的状态值: "+s)
				return
			}
			// 学生API不允许查询待审核和已拒绝的比赛
			if status == types.StatusPendingApproval || status == types.StatusRejected {
				utils.ResponseError(c, http.StatusForbidden, "比赛项目不可见")
				return
			}
			statuses = append(statuses, status)
		}
	} else {
		// 默认显示非审核非拒绝比赛（含检录中与进行中，学生需要看到当天的比赛）
		statuses = []types.CompetitionStatus{
			types.StatusCompleted,
			types.StatusApproved,
			types.StatusCheckingIn,
			types.StatusInProgress,
			types.StatusPendingScoreReview,
		}
	}

	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	student, err := models.GetStudentByID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取学生信息失败")
		return
	}

	// 获取比赛列表
	competitions, total, err := models.GetAllCompetitions(page, pageSize, statuses, student.Gender, sortBy)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取比赛列表失败")
		return
	}

	// 如果指定了分页，返回分页响应
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, competitions, total, page, pageSize)
	} else {
		utils.ResponseOK(c, competitions)
	}
}

// GetAllPublicCompetitions 获取所有比赛项目（公共API）
func GetAllPublicCompetitions(c *gin.Context) {
	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	statusStr := c.Query("status")
	sortBy := c.Query("sort_by") // 排序方式：name 或 votes

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 解析状态参数（支持逗号分隔的多个状态）
	var statuses []types.CompetitionStatus
	if statusStr != "" {
		statusList := splitAndTrim(statusStr, ",")
		for _, s := range statusList {
			status := types.CompetitionStatus(s)
			if !isValidCompetitionStatus(status) {
				utils.ResponseError(c, http.StatusBadRequest, "无效的状态值: "+s)
				return
			}
			// 公共API不允许查询待审核和已拒绝的比赛
			if status == types.StatusPendingApproval || status == types.StatusRejected {
				utils.ResponseError(c, http.StatusForbidden, "比赛项目不可见")
				return
			}
			statuses = append(statuses, status)
		}
	} else {
		// 默认只显示已完成的比赛
		statuses = []types.CompetitionStatus{types.StatusCompleted}
	}

	// 获取比赛列表
	competitions, total, err := models.GetAllCompetitions(page, pageSize, statuses, 0, sortBy)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取比赛列表失败")
		return
	}

	// 如果指定了分页，返回分页响应
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, competitions, total, page, pageSize)
	} else {
		utils.ResponseOK(c, competitions)
	}
}

// GetPublicCompetition 获取比赛项目详情（公共API）
func GetPublicCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 获取比赛信息
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return
	}

	if competition.Status == types.StatusPendingApproval || competition.Status == types.StatusRejected {
		utils.ResponseError(c, http.StatusForbidden, "比赛项目不可见")
		return
	}

	// 返回响应
	utils.ResponseOK(c, competition)
}

// GetCompetition 获取比赛项目详情
func GetCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 获取比赛信息
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return
	}

	// 返回响应
	utils.ResponseOK(c, competition)
}

// CreateCompetition 创建比赛项目
// 学生与班级账号提交的推荐项目进入待审核状态，由全局管理员审核；全局管理员创建的项目直接生效
func CreateCompetition(c *gin.Context) {
	// 解析请求
	var req CreateCompetitionRequest
	var studentID, userID int
	var user *types.User
	fileprefix := "competition"
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	role, ok := middlewares.GetRoleFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	switch role {
	case services.RoleStudent:
		// 学生本人提交受开关限制（管理员与班级账号代提交不受限）
		if !config.Get().Competition.AllowStudentSubmission {
			utils.ResponseError(c, http.StatusForbidden, "当前未开放学生提交推荐项目，请联系管理员或班级账号代为提交")
			return
		}

		// 从上下文获取学生ID
		studentID, ok = middlewares.GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "未授权")
			return
		}
		fileprefix = "competition_" + strconv.Itoa(studentID)
	case services.RoleAdmin:
		userID, ok = middlewares.GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "未授权")
			return
		}
		fileprefix = "competition_" + strconv.Itoa(userID)

		// 加载用户信息以区分全局管理员与班级账号
		u, err := models.GetUserByID(userID)
		if err != nil {
			utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
			return
		}
		user = u
	}

	// 验证排名方式
	if req.RankingMode != types.RankingHigherFirst && req.RankingMode != types.RankingLowerFirst {
		req.RankingMode = types.RankingHigherFirst // 默认为分数高的排名靠前
	}

	// 确保图片目录存在
	uploadDir := "./data/uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建目录失败")
		return
	}

	// 保存图片
	var imagePath string
	if req.Image != "" {
		timestamp := time.Now().Unix()
		fileName, err := utils.SaveBase64Image(req.Image, uploadDir, fileprefix, timestamp)
		if err != nil {
			utils.ResponseError(c, http.StatusBadRequest, "保存图片失败: "+err.Error())
			return
		}
		if fileName != "" {
			imagePath = filepath.Join("/uploads", fileName)
		}
	}

	// 验证比赛类型，默认为个人比赛
	if req.CompetitionType != types.TypeIndividual && req.CompetitionType != types.TypeTeam {
		req.CompetitionType = types.TypeIndividual
	}

	// 创建比赛项目
	var err error
	switch {
	case role == services.RoleStudent:
		err = models.CreateCompetition(
			req.Name,
			req.Description,
			req.Venue,
			imagePath,
			req.Unit,
			req.Gender,
			req.RankingMode,
			req.CompetitionType,
			req.MinParticipantsPerClass,
			req.MaxParticipantsPerClass,
			req.MinFemalePerClass,
			req.MaxFemalePerClass,
			req.MinMalePerClass,
			req.MaxMalePerClass,
			studentID,
			0,
			req.StartTime,
			req.EndTime,
			req.AllowConcurrent,
		)
	case user != nil && models.IsClassBound(user):
		// 班级账号代学生提交推荐项目，与学生提交一致走待审核路径
		err = models.CreateCompetition(
			req.Name,
			req.Description,
			req.Venue,
			imagePath,
			req.Unit,
			req.Gender,
			req.RankingMode,
			req.CompetitionType,
			req.MinParticipantsPerClass,
			req.MaxParticipantsPerClass,
			req.MinFemalePerClass,
			req.MaxFemalePerClass,
			req.MinMalePerClass,
			req.MaxMalePerClass,
			0,
			userID,
			req.StartTime,
			req.EndTime,
			req.AllowConcurrent,
		)
	default:
		err = models.AdminCreateCompetition(
			req.Name,
			req.Description,
			req.Venue,
			imagePath,
			req.Unit,
			req.Gender,
			req.RankingMode,
			req.CompetitionType,
			req.MinParticipantsPerClass,
			req.MaxParticipantsPerClass,
			req.MinFemalePerClass,
			req.MaxFemalePerClass,
			req.MinMalePerClass,
			req.MaxMalePerClass,
			userID,
			req.StartTime,
			req.EndTime,
			req.AllowConcurrent,
		)
	}
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建比赛项目失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "创建成功")
}

// UpdateCompetition 更新比赛项目
func UpdateCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 解析请求
	var req UpdateCompetitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	fileprefix := "competition_" + strconv.Itoa(userID)

	// 获取比赛项目
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return
	}

	// 记录旧值用于变更检测
	oldStartTime := competition.StartTime
	oldEndTime := competition.EndTime
	oldVenue := competition.Venue

	// 更新比赛项目
	competition.Name = req.Name
	competition.Description = req.Description
	competition.RankingMode = req.RankingMode
	competition.Unit = req.Unit
	competition.Venue = req.Venue
	competition.Gender = req.Gender
	competition.CompetitionType = req.CompetitionType
	competition.MinParticipantsPerClass = req.MinParticipantsPerClass
	competition.MaxParticipantsPerClass = req.MaxParticipantsPerClass
	competition.MinFemalePerClass = req.MinFemalePerClass
	competition.MaxFemalePerClass = req.MaxFemalePerClass
	competition.MinMalePerClass = req.MinMalePerClass
	competition.MaxMalePerClass = req.MaxMalePerClass
	competition.StartTime = req.StartTime
	competition.EndTime = req.EndTime
	competition.AllowConcurrent = req.AllowConcurrent

	// 确保图片目录存在
	uploadDir := "./data/uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建目录失败")
		return
	}

	// 保存图片
	var imagePath string
	if req.Image != "" {
		timestamp := time.Now().Unix()
		fileName, err := utils.SaveBase64Image(req.Image, uploadDir, fileprefix, timestamp)
		if err != nil {
			utils.ResponseError(c, http.StatusBadRequest, "保存图片失败: "+err.Error())
			return
		}
		if fileName != "" {
			imagePath = filepath.Join("/uploads", fileName)
		}
		competition.ImagePath = imagePath
	}
	err = models.UpdateCompetition(competition)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新比赛项目失败: "+err.Error())
		return
	}

	// 时间（开始/结束）或地点实际发生变化时，按操作者选择钉钉通知已报名学生
	timeChanged := func(old, cur *time.Time) bool {
		if (old == nil) != (cur == nil) {
			return true
		}
		return old != nil && !old.Equal(*cur)
	}
	changed := timeChanged(oldStartTime, competition.StartTime) ||
		timeChanged(oldEndTime, competition.EndTime) ||
		oldVenue != competition.Venue
	if changed && req.NotifyChanges {
		if err := services.SendCompetitionChangeNotice(competition, oldStartTime, oldEndTime, oldVenue); err != nil {
			logger.L.Warn(fmt.Sprintf("发送比赛变更通知失败 competition=%d: %v", competition.ID, err))
		}
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteCompetition 删除比赛项目
func DeleteCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 如果是学生，检查是否为自己的项目
	if middlewares.IsStudent(c) {
		studentID, ok := middlewares.GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "未授权")
			return
		}
		competition, err := models.GetCompetitionByID(id)
		if err != nil {
			utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
			return
		}
		if competition.SubmitterID != &studentID {
			utils.ResponseError(c, http.StatusForbidden, "不能删除他人的项目")
			return
		}
	}

	// 删除比赛项目
	if err := models.DeleteCompetition(id); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "删除比赛项目失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}

// GetStatistics 获取最新比赛结果统计（看板API）
func GetStatistics(c *gin.Context) {
	results, err := models.GetStatistics()
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取统计数据失败")
		return
	}

	// 获取最新的哈希值
	currentHash := models.GetStatisticsHash()

	// 设置 ETag 响应头
	c.Header("ETag", fmt.Sprintf(`W/"%s"`, currentHash))
	c.Header("Cache-Control", "no-cache")

	// 检查客户端的 If-None-Match 头
	clientETag := c.GetHeader("If-None-Match")
	if clientETag != "" && clientETag == fmt.Sprintf(`W/"%s"`, currentHash) {
		// 数据未改变，返回 304
		c.Status(http.StatusNotModified)
		return
	}

	// 数据已改变或首次请求，返回完整数据
	utils.ResponseOK(c, results)
}

// ApproveCompetition 审核通过比赛项目
func ApproveCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 审核通过比赛项目
	if err := models.ApproveCompetitionByID(id, userID); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新比赛项目失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "审核成功")
}

// RejectCompetition 审核拒绝比赛项目
func RejectCompetition(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 审核拒绝比赛项目
	if err := models.RejectCompetitionByID(id, userID); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新比赛项目失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "审核成功")
}

// progressTransitions 赛事进程允许的状态流转（当前状态 → 可达的目标状态）
var progressTransitions = map[types.CompetitionStatus][]types.CompetitionStatus{
	types.StatusApproved:           {types.StatusCheckingIn, types.StatusInProgress},
	types.StatusCheckingIn:         {types.StatusApproved, types.StatusInProgress},
	types.StatusInProgress:         {types.StatusApproved},
	types.StatusPendingScoreReview: {types.StatusInProgress},
	types.StatusCompleted:          {types.StatusInProgress},
	types.StatusPendingApproval:    {},
	types.StatusRejected:           {},
}

// UpdateCompetitionProgressStatus 赛事进程状态流转
// body.status 为目标状态，仅允许合法流转；流转到检录中时钉钉通知全部已报名学生
func UpdateCompetitionProgressStatus(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 解析请求
	var req struct {
		Status types.CompetitionStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return
	}

	// 校验流转合法性
	allowed := slices.Contains(progressTransitions[competition.Status], req.Status)
	if !allowed {
		utils.ResponseError(c, http.StatusBadRequest,
			fmt.Sprintf("不允许从 %s 流转到 %s", competition.Status, req.Status))
		return
	}

	if err := models.UpdateCompetitionStatus(id, req.Status); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "状态流转失败: "+err.Error())
		return
	}

	// 流转后重算积分：离开已完成状态会清除其得分记录，避免看板残留旧分
	if competition.Status == types.StatusCompleted || req.Status == types.StatusCompleted {
		if err := models.RecalculatePointsByCompetitionID(id); err != nil {
			logger.L.Warn(fmt.Sprintf("重算比赛积分失败 competition=%d: %v", id, err))
		}
	}

	// 开始检录必发通知
	if req.Status == types.StatusCheckingIn {
		if err := services.SendCheckinNotice(competition); err != nil {
			logger.L.Warn(fmt.Sprintf("发送检录通知失败 competition=%d: %v", competition.ID, err))
		}
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "状态已更新")
}
