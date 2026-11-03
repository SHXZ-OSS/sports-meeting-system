package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// BracketScheduleRequest 自动排期请求
type BracketScheduleRequest struct {
	StartAt       string   `json:"start_at"       binding:"required"` // RFC3339，带时区偏移
	MatchMinutes  int      `json:"match_minutes"`
	GapMinutes    int      `json:"gap_minutes"`
	RestMinutes   int      `json:"rest_minutes"`
	Venues        []string `json:"venues"`
	DayStart      string   `json:"day_start"`
	DayEnd        string   `json:"day_end"`
	KeepScheduled bool     `json:"keep_scheduled"`
}

// ==== 对阵图管理端 ====

// PreviewBracketSchedule 预览自动排期（不保存）
func PreviewBracketSchedule(c *gin.Context) {
	if bracket, ok := loadBracket(c); ok {
		scheduleBracket(c, bracket, false)
	}
}

// ApplyBracketSchedule 自动排期并保存
func ApplyBracketSchedule(c *gin.Context) {
	if bracket, ok := loadBracket(c); ok {
		scheduleBracket(c, bracket, true)
	}
}

// ClearBracketSchedule 清除未完赛比赛的时间与场地
func ClearBracketSchedule(c *gin.Context) {
	if bracket, ok := loadBracket(c); ok {
		clearBracketSchedule(c, bracket)
	}
}

// ==== 成绩与赛事进程端 ====

// PreviewCompetitionSchedule 预览比赛项目对阵的自动排期
func PreviewCompetitionSchedule(c *gin.Context) {
	if bracket, ok := loadProgressBracket(c); ok {
		scheduleBracket(c, bracket, false)
	}
}

// ApplyCompetitionSchedule 为比赛项目对阵自动排期并保存
func ApplyCompetitionSchedule(c *gin.Context) {
	if bracket, ok := loadProgressBracket(c); ok {
		scheduleBracket(c, bracket, true)
	}
}

// ClearCompetitionSchedule 清除比赛项目对阵中未完赛比赛的排期
func ClearCompetitionSchedule(c *gin.Context) {
	if bracket, ok := loadProgressBracket(c); ok {
		clearBracketSchedule(c, bracket)
	}
}

// loadProgressBracket 取得启用对阵图的比赛项目所对应的对阵表
func loadProgressBracket(c *gin.Context) (*types.Bracket, bool) {
	competition, ok := loadProgressCompetition(c)
	if !ok {
		return nil, false
	}
	if !competition.BracketEnabled {
		utils.ResponseError(c, http.StatusBadRequest, services.ErrScheduleNotLinked.Error())
		return nil, false
	}
	bracket, err := models.GetBracketByCompetitionID(competition.ID)
	if err != nil {
		respondBracketError(c, err)
		return nil, false
	}
	return bracket, true
}

func scheduleBracket(c *gin.Context, bracket *types.Bracket, apply bool) {
	var req BracketScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}
	startAt, err := time.Parse(time.RFC3339, req.StartAt)
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的开始时间")
		return
	}
	cfg := &types.BracketScheduleConfig{
		StartAt:       startAt,
		MatchMinutes:  req.MatchMinutes,
		GapMinutes:    req.GapMinutes,
		RestMinutes:   req.RestMinutes,
		Venues:        req.Venues,
		DayStart:      req.DayStart,
		DayEnd:        req.DayEnd,
		KeepScheduled: req.KeepScheduled,
	}
	var plan *types.BracketSchedulePlan
	if apply {
		plan, err = services.ApplyBracketSchedule(bracket, cfg)
	} else {
		plan, err = services.PreviewBracketSchedule(bracket, cfg)
	}
	if err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseOK(c, plan)
}

func clearBracketSchedule(c *gin.Context, bracket *types.Bracket) {
	count, err := services.ClearBracketSchedule(bracket)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseOK(c, gin.H{"cleared": count})
}
