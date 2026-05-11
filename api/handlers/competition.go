package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
	"github.com/gin-gonic/gin"
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
	Name                    string                `json:"name" binding:"required"`
	Description             string                `json:"description"`
	RankingMode             types.RankingMode     `json:"ranking_mode" binding:"required,oneof=higher_first lower_first"`
	Gender                  int                   `json:"gender" binding:"required,min=1,max=3"`
	CompetitionType         types.CompetitionType `json:"competition_type" binding:"required,oneof=individual team"`
	MinParticipantsPerClass int                   `json:"min_participants_per_class" binding:"min=0"`
	MaxParticipantsPerClass int                   `json:"max_participants_per_class" binding:"min=0"`
	MinFemalePerClass       int                   `json:"min_female_per_class" binding:"min=0"`
	MaxFemalePerClass       int                   `json:"max_female_per_class" binding:"min=0"`
	MinMalePerClass         int                   `json:"min_male_per_class" binding:"min=0"`
	MaxMalePerClass         int                   `json:"max_male_per_class" binding:"min=0"`
	Image                   string                `json:"image"`
	Unit                    string                `json:"unit" binding:"required"`
	StartTime               *time.Time            `json:"start_time"`
	EndTime                 *time.Time            `json:"end_time"`
	AllowConcurrent         bool                  `json:"allow_concurrent"`
}

// UpdateCompetitionRequest 更新比赛项目请求
type UpdateCompetitionRequest struct {
	Name                    string                `json:"name" binding:"required"`
	Description             string                `json:"description"`
	RankingMode             types.RankingMode     `json:"ranking_mode" binding:"required,oneof=higher_first lower_first"`
	CompetitionType         types.CompetitionType `json:"competition_type" binding:"required,oneof=individual team"`
	MinParticipantsPerClass int                   `json:"min_participants_per_class" binding:"min=0"`
	MaxParticipantsPerClass int                   `json:"max_participants_per_class" binding:"min=0"`
	MinFemalePerClass       int                   `json:"min_female_per_class" binding:"min=0"`
	MaxFemalePerClass       int                   `json:"max_female_per_class" binding:"min=0"`
	MinMalePerClass         int                   `json:"min_male_per_class" binding:"min=0"`
	MaxMalePerClass         int                   `json:"max_male_per_class" binding:"min=0"`
	Image                   string                `json:"image"`
	Unit                    string                `json:"unit" binding:"required"`
	Gender                  int                   `json:"gender" binding:"required,min=1,max=3"`
	StartTime               *time.Time            `json:"start_time"`
	EndTime                 *time.Time            `json:"end_time"`
	AllowConcurrent         bool                  `json:"allow_concurrent"`
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
		// 默认显示非审核非拒绝比赛
		statuses = []types.CompetitionStatus{types.StatusCompleted, types.StatusApproved, types.StatusPendingScoreReview}
	}

	studentId, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	student, err := models.GetStudentByID(studentId)
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
func CreateCompetition(c *gin.Context) {
	// 解析请求
	var req CreateCompetitionRequest
	var studentID, ID int
	var fileprefix = "competition"
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
		// 从上下文获取学生ID
		studentID, ok = middlewares.GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "未授权")
			return
		}
		fileprefix = "competition_" + strconv.Itoa(studentID)
	case services.RoleAdmin:
		ID, ok = middlewares.GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "未授权")
			return
		}
		fileprefix = "competition_" + strconv.Itoa(ID)
	}

	// 验证排名方式
	if req.RankingMode != types.RankingHigherFirst && req.RankingMode != types.RankingLowerFirst {
		req.RankingMode = types.RankingHigherFirst // 默认为分数高的排名靠前
	}

	// 确保图片目录存在
	uploadDir := "./data/uploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
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
	if role == services.RoleStudent {
		err = models.CreateCompetition(req.Name, req.Description, imagePath, req.Unit, req.Gender, req.RankingMode, req.CompetitionType, req.MinParticipantsPerClass, req.MaxParticipantsPerClass, req.MinFemalePerClass, req.MaxFemalePerClass, req.MinMalePerClass, req.MaxMalePerClass, studentID, req.StartTime, req.EndTime, req.AllowConcurrent)
	} else {
		err = models.AdminCreateCompetition(req.Name, req.Description, imagePath, req.Unit, req.Gender, req.RankingMode, req.CompetitionType, req.MinParticipantsPerClass, req.MaxParticipantsPerClass, req.MinFemalePerClass, req.MaxFemalePerClass, req.MinMalePerClass, req.MaxMalePerClass, ID, req.StartTime, req.EndTime, req.AllowConcurrent)
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

	var fileprefix = "competition"
	ID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	fileprefix = "competition_" + strconv.Itoa(ID)

	// 获取比赛项目
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return
	}
	// 更新比赛项目
	competition.Name = req.Name
	competition.Description = req.Description
	competition.RankingMode = req.RankingMode
	competition.Unit = req.Unit
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
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
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
