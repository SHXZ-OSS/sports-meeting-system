package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateScoreRequest 创建成绩请求
type CreateScoreRequest struct {
	CompetitionID int                  `json:"competition_id" binding:"required"`
	StudentScores []types.StudentScore `json:"student_scores" binding:"required,dive"`
}

// ReviewScoreRequest 审核成绩请求
type ReviewScoreRequest struct {
	CompetitionID   int  `json:"competition_id"   binding:"required"`
	NotifyPublished bool `json:"notify_published"` // 审核通过后钉钉通知有成绩的学生
}

// GetPublicCompetitionScores 获取比赛的所有成绩（游客）
func GetPublicCompetitionScores(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 检查比赛是否存在
	competition, err := models.GetCompetitionByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "比赛不存在")
		return
	}
	// 游客只能查看status为completed的比赛成绩
	if competition.Status != types.StatusCompleted {
		utils.ResponseError(c, http.StatusForbidden, "比赛结果未出或在审核中")
		return
	}

	// 获取成绩列表
	scores, err := models.GetScoresByCompetitionID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取成绩列表失败")
		return
	}

	// 如果指定了分页，返回分页响应
	utils.ResponseOK(c, scores)
}

// GetCompetitionScores 获取比赛的所有成绩（管理员）
func GetCompetitionScores(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}

	// 获取成绩信息
	score, err := models.GetScoresByCompetitionID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "成绩记录不存在")
		return
	}

	// 返回响应
	utils.ResponseOK(c, score)
}

// GetStudentScores 获取学生成绩（学生端使用）
func GetStudentScores(c *gin.Context) {
	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 获取学生成绩
	scores, err := models.GetScoresByStudentID(studentID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取成绩失败")
		return
	}

	// 返回响应
	utils.ResponseOK(c, scores)
}

// GetStudentScoresByID 获取指定学生的成绩
func GetStudentScoresByID(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
		return
	}

	// 获取学生成绩
	scores, err := models.GetScoresByStudentID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取成绩失败")
		return
	}
	// 返回响应
	utils.ResponseOK(c, scores)
}

// CreateOrUpdateScores 创建或更新成绩记录
func CreateOrUpdateScores(c *gin.Context) {
	// 解析请求
	var req CreateScoreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取提交人ID
	submitterID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 创建或更新成绩
	err := models.CreateOrUpdateScores(req.CompetitionID, req.StudentScores, submitterID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "提交成绩失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "上传成功")
}

// ReviewScores 审核成绩
func ReviewScores(c *gin.Context) {
	// 解析请求
	var req ReviewScoreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取审核人ID
	reviewerID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 审核成绩
	if err := models.ReviewCompetitionScoresByID(req.CompetitionID, reviewerID); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "审核成绩失败: "+err.Error())
		return
	}

	// 按操作者选择钉钉通知成绩公布（个人赛只发有成绩的学生，团体赛发全部报名学生）
	if req.NotifyPublished {
		competition, err := models.GetCompetitionByID(req.CompetitionID)
		if err == nil {
			if err := services.SendScorePublishedNotice(competition); err != nil {
				logger.L.Warn(fmt.Sprintf("发送成绩公布通知失败 competition=%d: %v", competition.ID, err))
			}
		}
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "审核成功")
}

// DeleteScores 删除成绩记录
func DeleteScores(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的成绩ID")
		return
	}

	// 删除成绩记录
	if err := models.DeleteCompetitionScoresByID(id); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "删除成绩记录失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}
