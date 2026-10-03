package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// RegisterCompetitionRequest 报名比赛请求
type RegisterCompetitionRequest struct {
	CompetitionID int `json:"competition_id" binding:"required"`
}

// AdminRegisterRequest 管理员替学生报名请求
type AdminRegisterRequest struct {
	StudentID     int `json:"student_id"     binding:"required"`
	CompetitionID int `json:"competition_id" binding:"required"`
}

// AdminUnregisterRequest 管理员替学生取消报名请求
type AdminUnregisterRequest struct {
	StudentID int `json:"student_id" binding:"required"`
}

// RegistrationResponse 报名响应
type RegistrationResponse struct {
	Message     string   `json:"message"`
	Exceeding   bool     `json:"exceeding"`
	Registrants []string `json:"registrants"`
}

// GetStudentRegistrations 获取学生的报名记录（学生端使用）
func GetStudentRegistrations(c *gin.Context) {
	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 获取学生报名的比赛
	competitions, err := models.GetStudentRegistrationsByStudentID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取报名记录失败")
		return
	}

	// 返回响应
	utils.ResponseOK(c, competitions)
}

// GetCompetitionRegistrationsForPublic 获取比赛的报名学生列表（公共访问）
func GetCompetitionRegistrationsForPublic(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 游客仅能查看状态为"已批准"的比赛报名列表
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取比赛状态失败")
		return
	}
	if competition.Status != types.StatusApproved && competition.Status != types.StatusCompleted &&
		competition.Status != types.StatusPendingScoreReview {
		utils.ResponseError(c, http.StatusForbidden, "仅允许查看已批准的比赛报名列表")
		return
	}

	// 获取报名列表
	registrations, err := models.GetCompetitionRegistrations(id, 0)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取报名列表失败")
		return
	}

	// 返回响应
	utils.ResponseOK(c, registrations)
}

// RegisterForCompetitionForStudent 学生报名比赛
func RegisterForCompetitionForStudent(c *gin.Context) {
	// 学生本人报名受开关限制（管理员与班级账号代报名不受限）
	if !config.Get().Competition.AllowStudentRegistration {
		utils.ResponseError(c, http.StatusForbidden, "当前未开放学生自主报名，请联系管理员或班级账号协助报名")
		return
	}

	// 解析请求
	var req RegisterCompetitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 获取学生信息
	student, err := models.GetStudentByID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取学生信息失败")
		return
	}

	// 获取比赛信息
	competition, err := models.GetCompetitionByID(req.CompetitionID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取比赛信息失败")
		return
	}

	// 报名比赛（学生报名，传入nil表示非管理员）
	if err := models.RegisterForCompetitionForStudent(&studentID, nil, req.CompetitionID, nil); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "报名失败: "+err.Error())
		return
	}

	// 检查班级报名人数是否超限
	exceeding := false
	var registrants []string

	if competition.MaxParticipantsPerClass > 0 {
		// 获取该比赛的所有报名信息
		allRegistrations, err := models.GetCompetitionRegistrations(req.CompetitionID, 0)
		if err == nil {
			// 筛选出同班的报名学生
			var classRegistrations []*types.Registration
			for _, reg := range allRegistrations {
				if reg.ClassID != nil && *reg.ClassID == student.ClassID {
					classRegistrations = append(classRegistrations, reg)
				}
			}

			// 检查是否超限或刚好满
			if len(classRegistrations) > competition.MaxParticipantsPerClass {
				exceeding = true
				// 收集已报名学生的姓名（排除自己）
				for _, reg := range classRegistrations {
					if reg.StudentID != nil && *reg.StudentID != studentID {
						registrants = append(registrants, reg.StudentName)
					}
				}
			}
		}
	}

	// 返回响应
	response := RegistrationResponse{
		Message:     "报名成功",
		Exceeding:   exceeding,
		Registrants: registrants,
	}
	utils.ResponseOK(c, response)
}

// UnregisterFromCompetitionForStudent 取消报名
func UnregisterFromCompetitionForStudent(c *gin.Context) {
	// 解析路径参数
	competitionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 取消报名（学生取消报名，传入nil表示非管理员）
	if err := models.UnregisterFromCompetition(&studentID, nil, competitionID, nil); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "取消报名失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "取消报名成功")
}

// GetCompetitionRegistrations 获取比赛报名列表
func GetCompetitionRegistrations(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 计算数据权限：班级账号只能看到自己班级的报名
	scopeClassID := 0
	if models.IsClassBound(user) {
		scopeClassID = *user.ClassID
	}

	// 获取报名列表
	registrations, err := models.GetCompetitionRegistrations(id, scopeClassID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取报名列表失败")
		return
	}

	utils.ResponseOK(c, registrations)
}

// RegisterForCompetitionForAdmin 管理员为学生报名
func RegisterForCompetitionForAdmin(c *gin.Context) {
	// 解析请求
	var req struct {
		StudentID     int `json:"student_id"`
		CompetitionID int `json:"competition_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取学生信息，检查班级
	student, err := models.GetStudentByID(req.StudentID)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 班级账号只能为本班学生报名
	if !models.CanAccessClass(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "您只能为自己班级的学生报名")
		return
	}

	// 执行报名（传入user对象，只有全局管理员可以跳过时间和数量限制）
	if err := models.RegisterForCompetitionForStudent(&req.StudentID, nil, req.CompetitionID, user); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "报名失败: "+err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "报名成功")
}

// UnregisterFromCompetitionForAdmin 管理员取消学生报名
func UnregisterFromCompetitionForAdmin(c *gin.Context) {
	// 解析路径参数（competition ID）
	competitionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 解析请求体
	var req struct {
		StudentID int `json:"student_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取学生信息，检查班级
	student, err := models.GetStudentByID(req.StudentID)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 班级账号只能取消本班学生的报名
	if !models.CanAccessClass(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "您只能取消自己班级学生的报名")
		return
	}

	// 执行取消报名（传入user对象，只有全局管理员可以跳过时间限制）
	if err := models.UnregisterFromCompetition(&req.StudentID, nil, competitionID, user); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "取消报名失败: "+err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "取消报名成功")
}

// GetCompetitionChecklist 获取比赛报名检查清单
func GetCompetitionChecklist(c *gin.Context) {
	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 计算数据权限：班级账号只能检查自己班级
	scopeClassID := 0
	if models.IsClassBound(user) {
		scopeClassID = *user.ClassID
	}

	// 获取检查清单
	results, err := models.GetCompetitionChecklist(scopeClassID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取检查清单失败")
		return
	}

	utils.ResponseOK(c, results)
}
