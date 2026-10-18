package handlers

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// WebsiteInfoResponse 网站信息响应
type WebsiteInfoResponse struct {
	Name           string `json:"name"`
	EventName      string `json:"event_name"`
	DingTalkCorpID string `json:"dingtalk_corp_id"`
	Domain         string `json:"domain"`
	LogoURL        string `json:"logo_url"`
	// 学生端功能开关，前端据此隐藏对应入口
	AllowStudentRegistration bool `json:"allow_student_registration"`
	AllowStudentSubmission   bool `json:"allow_student_submission"`
	// OIDC 登录开关，前端据此展示登录按钮
	OIDCEnabled bool `json:"oidc_enabled"`
	// 各阶段时间窗口（空 = 不限制），前端据此隐藏报名/投票等操作入口
	SubmissionStartTime   string `json:"submission_start_time"`
	SubmissionEndTime     string `json:"submission_end_time"`
	VotingStartTime       string `json:"voting_start_time"`
	VotingEndTime         string `json:"voting_end_time"`
	RegistrationStartTime string `json:"registration_start_time"`
	RegistrationEndTime   string `json:"registration_end_time"`
}

// oidcLoginReady 统一认证是否已具备可用配置（与 OIDCSSORedirect 的校验保持一致）
func oidcLoginReady(cfg *config.Config) bool {
	return cfg.Oidc.Enabled && cfg.Oidc.ClientID != "" &&
		cfg.Oidc.AuthorizeURL != "" && cfg.Oidc.TokenURL != "" && cfg.Oidc.UserinfoURL != ""
}

// currentEventName 返回当前选中运动会届次的名称；未配置或查询失败时返回空串。
func currentEventName(cfg *config.Config) string {
	if cfg.CurrentEventID == 0 {
		return ""
	}
	event, err := models.GetEventByID(cfg.CurrentEventID)
	if err != nil || event == nil {
		return ""
	}
	return event.Name
}

// GetWebsiteInfo 获取网站信息（公共API）
func GetWebsiteInfo(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 构建响应
	resp := WebsiteInfoResponse{
		Name:                     cfg.Website.Name,
		EventName:                currentEventName(cfg),
		DingTalkCorpID:           cfg.DingTalk.CorpID,
		Domain:                   cfg.Website.Domain,
		LogoURL:                  logoURL(cfg),
		AllowStudentRegistration: cfg.Competition.AllowStudentRegistration,
		AllowStudentSubmission:   cfg.Competition.AllowStudentSubmission,
		OIDCEnabled:              oidcLoginReady(cfg),
		SubmissionStartTime:      cfg.Competition.SubmissionStartTime,
		SubmissionEndTime:        cfg.Competition.SubmissionEndTime,
		VotingStartTime:          cfg.Competition.VotingStartTime,
		VotingEndTime:            cfg.Competition.VotingEndTime,
		RegistrationStartTime:    cfg.Competition.RegistrationStartTime,
		RegistrationEndTime:      cfg.Competition.RegistrationEndTime,
	}

	// 返回响应
	utils.ResponseOK(c, resp)
}

// GetManifest 获取 manifest.webmanifest 内容，图标固定使用校徽。
func GetManifest(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	icons := `[
			{
				"src": "/school-emblem.svg",
				"type": "image/svg+xml",
				"sizes": "any"
			}
		]`

	// 构建manifest
	resp := fmt.Sprintf(`{
		"short_name": "%s",
		"name": "%s",
		"icons": %s,
		"start_url": ".",
		"display": "standalone",
		"theme_color": "#001529",
		"background_color": "#f5f5f5"
	}`, cfg.Website.Name, cfg.Website.Name, icons)

	// 返回manifest
	c.Header("Content-Type", "application/manifest+json")
	_, _ = c.Writer.Write([]byte(resp))
}
