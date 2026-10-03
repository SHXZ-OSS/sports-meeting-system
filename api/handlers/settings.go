package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// UpdateSettingsRequest 更新设置请求
type UpdateSettingsRequest struct {
	DingTalk struct {
		AppKey    string `json:"app_key"`
		AppSecret string `json:"app_secret"`
		AgentID   string `json:"agent_id"`
		CorpID    string `json:"corp_id"`
	} `json:"dingtalk"`
	Website struct {
		Name           string `json:"name"`
		ICPBeian       string `json:"icp_beian"`
		PublicSecBeian string `json:"public_sec_beian"`
		Domain         string `json:"domain"`
	} `json:"website"`
	Competition struct {
		SubmissionStartTime       string `json:"submission_start_time"`
		SubmissionEndTime         string `json:"submission_end_time"`
		VotingStartTime           string `json:"voting_start_time"`
		VotingEndTime             string `json:"voting_end_time"`
		RegistrationStartTime     string `json:"registration_start_time"`
		RegistrationEndTime       string `json:"registration_end_time"`
		MaxRegistrationsPerPerson int    `json:"max_registrations_per_person"`
	} `json:"competition"`
	Dashboard struct {
		Enabled *bool `json:"enabled"`
	} `json:"dashboard"`
	Scoring struct {
		TeamPointsMapping       map[string]float64 `json:"team_points_mapping"`
		IndividualPointsMapping map[string]float64 `json:"individual_points_mapping"`
	} `json:"scoring"`
}

// GetSettings 获取系统设置
func GetSettings(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 构建响应
	settings := map[string]any{
		"dingtalk": map[string]any{
			"app_key":    cfg.DingTalk.AppKey,
			"app_secret": cfg.DingTalk.AppSecret,
			"agent_id":   cfg.DingTalk.AgentID,
			"corp_id":    cfg.DingTalk.CorpID,
		},
		"website": map[string]any{
			"name":             cfg.Website.Name,
			"icp_beian":        cfg.Website.ICPBeian,
			"public_sec_beian": cfg.Website.PublicSecBeian,
			"domain":           cfg.Website.Domain,
			"logo_url":         logoURL(cfg),
		},
		"competition": map[string]any{
			"submission_start_time":        cfg.Competition.SubmissionStartTime,
			"submission_end_time":          cfg.Competition.SubmissionEndTime,
			"voting_start_time":            cfg.Competition.VotingStartTime,
			"voting_end_time":              cfg.Competition.VotingEndTime,
			"registration_start_time":      cfg.Competition.RegistrationStartTime,
			"registration_end_time":        cfg.Competition.RegistrationEndTime,
			"max_registrations_per_person": cfg.Competition.MaxRegistrationsPerPerson,
		},
		"dashboard": map[string]any{
			"enabled": cfg.Dashboard.Enabled,
		},
		"scoring": map[string]any{
			"team_points_mapping":       cfg.Scoring.TeamPointsMapping,
			"individual_points_mapping": cfg.Scoring.IndividualPointsMapping,
		},
	}

	// 返回响应
	utils.ResponseOK(c, settings)
}

// UpdateSettings 更新系统设置
func UpdateSettings(c *gin.Context) {
	// 解析请求
	var req UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取配置
	cfg := config.Get()

	// 更新配置
	cfg.DingTalk.AppKey = req.DingTalk.AppKey
	cfg.DingTalk.AppSecret = req.DingTalk.AppSecret
	cfg.DingTalk.AgentID = req.DingTalk.AgentID
	cfg.DingTalk.CorpID = req.DingTalk.CorpID

	cfg.Website.Name = req.Website.Name
	cfg.Website.ICPBeian = req.Website.ICPBeian
	cfg.Website.PublicSecBeian = req.Website.PublicSecBeian
	cfg.Website.Domain = req.Website.Domain

	cfg.Competition.SubmissionStartTime = req.Competition.SubmissionStartTime
	cfg.Competition.SubmissionEndTime = req.Competition.SubmissionEndTime
	cfg.Competition.VotingStartTime = req.Competition.VotingStartTime
	cfg.Competition.VotingEndTime = req.Competition.VotingEndTime
	cfg.Competition.RegistrationStartTime = req.Competition.RegistrationStartTime
	cfg.Competition.RegistrationEndTime = req.Competition.RegistrationEndTime
	cfg.Competition.MaxRegistrationsPerPerson = req.Competition.MaxRegistrationsPerPerson

	if req.Dashboard.Enabled != nil {
		cfg.Dashboard.Enabled = *req.Dashboard.Enabled
	}

	cfg.Scoring.TeamPointsMapping = req.Scoring.TeamPointsMapping
	cfg.Scoring.IndividualPointsMapping = req.Scoring.IndividualPointsMapping

	// 保存配置
	if err := config.Save(); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "保存配置失败")
		return
	}

	// 重新计算所有有分数的比赛的分数
	completedCompetitions, _, err := models.GetAllCompetitions(0, 0, nil, 0, "")
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取已完成比赛列表失败")
		return
	}

	// 重新计算每个比赛的分数
	for _, comp := range completedCompetitions {
		if err := models.RecalculatePointsByCompetitionID(comp.ID); err != nil {
			utils.ResponseError(c, http.StatusInternalServerError, "重新计算分数失败: "+err.Error())
			return
		}
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// UploadLogo 上传自定义 logo（Base64 图片），保存后写入配置并持久化
func UploadLogo(c *gin.Context) {
	// 解析请求
	var req struct {
		Image string `json:"image" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 保存图片到 uploads 目录
	fileName, err := utils.SaveBase64Image(req.Image, "./data/uploads", "logo", time.Now().Unix())
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "保存 logo 失败: "+err.Error())
		return
	}
	if fileName == "" {
		utils.ResponseError(c, http.StatusBadRequest, "图片数据为空")
		return
	}

	// 更新并持久化配置
	cfg := config.Get()
	cfg.Website.LogoFilepath = fileName
	if err := config.Save(); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "保存配置失败")
		return
	}

	// 返回访问地址
	utils.ResponseOK(c, map[string]any{
		"logo_url": "/uploads/" + fileName,
	})
}

// GetEvents 获取运动会届次列表
func GetEvents(c *gin.Context) {
	events, err := models.GetAllEvents()
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取运动会届次列表失败")
		return
	}

	cfg := config.Get()
	response := map[string]any{
		"list":             events,
		"current_event_id": cfg.CurrentEventID,
	}

	utils.ResponseOK(c, response)
}
