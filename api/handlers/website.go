package handlers

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// WebsiteInfoResponse 网站信息响应
type WebsiteInfoResponse struct {
	Name           string `json:"name"`
	ICPBeian       string `json:"icp_beian"`
	PublicSecBeian string `json:"public_sec_beian"`
	DingTalkCorpID string `json:"dingtalk_corp_id"`
	Domain         string `json:"domain"`
	LogoURL        string `json:"logo_url"`
	// 学生端功能开关，前端据此隐藏对应入口
	AllowStudentRegistration bool `json:"allow_student_registration"`
	AllowStudentSubmission   bool `json:"allow_student_submission"`
	// OIDC 登录开关，前端据此展示登录按钮
	OIDCEnabled bool `json:"oidc_enabled"`
}

// oidcLoginReady 统一认证是否已具备可用配置（与 OIDCSSORedirect 的校验保持一致）
func oidcLoginReady(cfg *config.Config) bool {
	return cfg.Oidc.Enabled && cfg.Oidc.ClientID != "" &&
		cfg.Oidc.AuthorizeURL != "" && cfg.Oidc.TokenURL != "" && cfg.Oidc.UserinfoURL != ""
}

// GetWebsiteInfo 获取网站信息（公共API）
func GetWebsiteInfo(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 构建响应
	resp := WebsiteInfoResponse{
		Name:                     cfg.Website.Name,
		ICPBeian:                 cfg.Website.ICPBeian,
		PublicSecBeian:           cfg.Website.PublicSecBeian,
		DingTalkCorpID:           cfg.DingTalk.CorpID,
		Domain:                   cfg.Website.Domain,
		LogoURL:                  logoURL(cfg),
		AllowStudentRegistration: cfg.Competition.AllowStudentRegistration,
		AllowStudentSubmission:   cfg.Competition.AllowStudentSubmission,
		OIDCEnabled:              oidcLoginReady(cfg),
	}

	// 返回响应
	utils.ResponseOK(c, resp)
}

// GetManifest 获取 manifest.webmanifest 内容。
// 配置了自定义 logo 时图标使用 logo，否则回退到默认图标
func GetManifest(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 图标列表：优先自定义 logo，回退到内置图标
	icons := `[
			{
				"src": "logo192.png",
				"type": "image/png",
				"sizes": "192x192"
			},
			{
				"src": "logo512.png",
				"type": "image/png",
				"sizes": "512x512"
			},
			{
				"src": "favicon.svg",
				"sizes": "any",
				"type": "image/svg+xml"
			}
		]`
	if cfg.Website.LogoFilepath != "" {
		logoURL := "/uploads/" + cfg.Website.LogoFilepath
		contentType := utils.ImageContentType(cfg.Website.LogoFilepath)
		// SVG 为矢量图标，无需区分尺寸
		sizes := "192x192"
		if contentType == "image/svg+xml" {
			sizes = "any"
		}
		icons = fmt.Sprintf(`[
			{
				"src": "%s",
				"type": "%s",
				"sizes": "%s"
			},
			{
				"src": "%s",
				"type": "%s",
				"sizes": "%s"
			}
		]`, logoURL, contentType, sizes, logoURL, contentType, sizes)
	}

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
