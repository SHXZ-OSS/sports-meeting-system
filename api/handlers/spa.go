package handlers

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// ServeIndexHTML 读取嵌入的 index.html，替换站点标题并注入初始数据后返回。
// 注入的 window.__INITIAL_DATA__ 携带网站信息，
// 使前端首屏无需等待网站信息请求即可渲染
func ServeIndexHTML(staticFS fs.FS) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := staticFS.Open("index.html")
		if err != nil {
			c.String(http.StatusNotFound, "Not found")
			return
		}
		defer file.Close()

		htmlBytes, err := io.ReadAll(file)
		if err != nil {
			c.String(http.StatusInternalServerError, "Internal server error")
			return
		}

		htmlContent := string(htmlBytes)
		cfg := config.Get()

		// 替换 title 占位符
		htmlContent = strings.Replace(
			htmlContent,
			"<title>TITLE_PLACEHOLDER</title>",
			fmt.Sprintf("<title>%s</title>", html.EscapeString(cfg.Website.Name)),
			1,
		)

		// 注入自定义 logo favicon（若已配置）
		if cfg.Website.LogoFilepath != "" {
			faviconURL := "/uploads/" + cfg.Website.LogoFilepath
			faviconTags := fmt.Sprintf(
				`<link rel="icon" href="%s" type="%s"><link rel="apple-touch-icon" href="%s">`,
				faviconURL, utils.ImageContentType(cfg.Website.LogoFilepath), faviconURL,
			)
			htmlContent = strings.Replace(htmlContent, "</head>", faviconTags+"</head>", 1)
		}

		// 构建注入数据并替换脚本占位符
		jsonBytes, err := json.Marshal(buildInitialData(cfg))
		if err != nil {
			jsonBytes = []byte("{}")
		}
		scriptTag := fmt.Sprintf(`<script>window.__INITIAL_DATA__=%s;</script>`, jsonBytes)
		htmlContent = strings.Replace(htmlContent, "</head>", scriptTag+"</head>", 1)

		// 注入了站点配置，禁止缓存以保证配置变更即时生效
		c.Header("Cache-Control", "no-store")
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, htmlContent)
	}
}

// buildInitialData 构建注入到 index.html 的初始数据
func buildInitialData(cfg *config.Config) gin.H {
	return gin.H{
		"website_info": gin.H{
			"name":                       cfg.Website.Name,
			"icp_beian":                  cfg.Website.ICPBeian,
			"public_sec_beian":           cfg.Website.PublicSecBeian,
			"dingtalk_corp_id":           cfg.DingTalk.CorpID,
			"domain":                     cfg.Website.Domain,
			"logo_url":                   logoURL(cfg),
			"allow_student_registration": cfg.Competition.AllowStudentRegistration,
			"allow_student_submission":   cfg.Competition.AllowStudentSubmission,
			"oidc_enabled":               oidcLoginReady(cfg),
		},
	}
}

// logoURL 返回自定义 logo 的访问地址（未配置时为空串）
func logoURL(cfg *config.Config) string {
	if cfg.Website.LogoFilepath == "" {
		return ""
	}
	return "/uploads/" + cfg.Website.LogoFilepath
}
