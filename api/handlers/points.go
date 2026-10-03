package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// AddCustomPointsToClass 为班级添加自定义得分
func AddCustomPointsToClass(c *gin.Context) {
	// 获取当前用户ID（必须是教师）
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 解析请求
	var req struct {
		ClassID int     `json:"class_id"`
		Points  float64 `json:"points"`
		Reason  string  `json:"reason"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "请求参数错误")
		return
	}

	if req.ClassID == 0 || req.Reason == "" {
		utils.ResponseError(c, http.StatusBadRequest, "缺少必要参数")
		return
	}

	// 添加自定义得分
	if err := models.AddCustomPointsToClass(req.ClassID, req.Points, req.Reason, userID); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "添加得分成功")
}

// GetClassPointsSummary 获取班级得分汇总
func GetClassPointsSummary(c *gin.Context) {
	summaries, err := models.GetClassPointsSummary()
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, summaries)
}

// GetStudentPointsSummary 获取学生得分汇总
func GetStudentPointsSummary(c *gin.Context) {
	summaries, err := models.GetStudentPointsSummary()
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, summaries)
}

// GetClassPointDetails 获取班级得分明细
func GetClassPointDetails(c *gin.Context) {
	classID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的班级ID")
		return
	}

	details, err := models.GetClassPointDetails(classID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, details)
}

// GetStudentPointDetails 获取学生得分明细
func GetStudentPointDetails(c *gin.Context) {
	studentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
		return
	}

	details, err := models.GetStudentPointDetails(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, details)
}

// DeleteCustomPoint 删除自定义得分记录
func DeleteCustomPoint(c *gin.Context) {
	pointID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的得分记录ID")
		return
	}

	if err := models.DeleteCustomPoint(pointID); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "删除得分记录成功")
}

// GetClassPointsSummaryByID 获取指定班级的得分汇总
func GetClassPointsSummaryByID(c *gin.Context) {
	classID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的班级ID")
		return
	}

	summary, err := models.GetClassPointsSummaryByID(classID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, summary)
}

// GetStudentPointsSummaryByID 获取指定学生的得分汇总
func GetStudentPointsSummaryByID(c *gin.Context) {
	studentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
		return
	}

	summary, err := models.GetStudentPointsSummaryByID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, summary)
}

// GetMyPointsSummary 获取当前登录学生的得分汇总（学生端使用）
func GetMyPointsSummary(c *gin.Context) {
	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	summary, err := models.GetStudentPointsSummaryByID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, summary)
}
