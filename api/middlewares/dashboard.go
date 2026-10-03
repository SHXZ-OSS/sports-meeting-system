package middlewares

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// DashboardMiddleware 看板功能检查中间件
// 当看板功能被禁用时，返回403错误
func DashboardMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取配置
		cfg := config.Get()
		if cfg == nil {
			utils.ResponseError(c, http.StatusInternalServerError, "failed to load configuration")
			c.Abort()
			return
		}

		// 检查看板功能是否启用
		if !cfg.Dashboard.Enabled {
			utils.ResponseError(c, http.StatusForbidden, "看板当前未启用")
			c.Abort()
			return
		}

		// 看板功能已启用，继续处理请求
		c.Next()
	}
}
