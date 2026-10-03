package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// VoteRequest 投票请求
type VoteRequest struct {
	CompetitionID int            `json:"competition_id"`
	VoteType      types.VoteType `json:"vote_type"` // 1: upvote, -1: downvote
}

// VoteCompetition 学生对比赛项目投票
func VoteCompetition(c *gin.Context) {
	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 检查是否允许投票（管理员不受时间限制）
	isAdmin := middlewares.IsAdmin(c)
	if !isAdmin && !utils.IsVotingAllowed() {
		utils.ResponseError(c, http.StatusForbidden, utils.ErrVotingNotAllowed.Error())
		return
	}

	// 解析请求体
	var req VoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的请求数据")
		return
	}

	// 验证投票类型
	if req.VoteType != types.VoteTypeUp && req.VoteType != types.VoteTypeDown {
		utils.ResponseError(c, http.StatusBadRequest, "无效的投票类型")
		return
	}

	// 执行投票
	db := database.GetDB()
	if err := models.VoteCompetition(db, studentID, req.CompetitionID, req.VoteType); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "投票成功")
}

// GetStudentVotes 获取学生的投票记录
func GetStudentVotes(c *gin.Context) {
	// 从上下文获取学生ID
	studentID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 解析查询参数，获取 competition_ids
	competitionIDsStr := c.Query("competition_ids")
	if competitionIDsStr == "" {
		utils.ResponseOK(c, map[int]types.VoteType{})
		return
	}

	// 解析 competition_ids
	var competitionIDs []int
	if err := json.Unmarshal([]byte(competitionIDsStr), &competitionIDs); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的competition_ids参数")
		return
	}

	// 获取投票记录
	db := database.GetDB()
	votes, err := models.GetStudentVotesForCompetitions(db, studentID, competitionIDs)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.ResponseOK(c, votes)
}
