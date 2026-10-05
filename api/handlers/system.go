package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// APINotFound 未匹配 API 路由的统一处理：以 HTML Alert 弹窗提示并回退历史
func APINotFound(c *gin.Context) {
	utils.ResponseErrorByHTMLAlert(
		c,
		http.StatusNotFound,
		"接口不存在。若你认为这是错误，请联系技术支持。",
	)
}
