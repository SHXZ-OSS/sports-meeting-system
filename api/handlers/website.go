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
}

// GetWebsiteInfo 获取网站信息（公共API）
func GetWebsiteInfo(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 构建响应
	resp := WebsiteInfoResponse{
		Name:           cfg.Website.Name,
		ICPBeian:       cfg.Website.ICPBeian,
		PublicSecBeian: cfg.Website.PublicSecBeian,
		DingTalkCorpID: cfg.DingTalk.CorpID,
		Domain:         cfg.Website.Domain,
	}

	// 返回响应
	utils.ResponseOK(c, resp)
}

// GetManifest 获取 manifest.webmanifest 内容
func GetManifest(c *gin.Context) {
	// 获取配置
	cfg := config.Get()

	// 构建manifest
	resp := fmt.Sprintf(`{
		"short_name": "%s",
		"name": "%s",
		"icons": [
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
		],
		"start_url": ".",
		"display": "standalone",
		"theme_color": "#001529",
		"background_color": "#f5f5f5"
	}`, cfg.Website.Name, cfg.Website.Name)

	// 返回manifest
	c.Header("Content-Type", "application/manifest+json")
	_, _ = c.Writer.Write([]byte(resp))
}
