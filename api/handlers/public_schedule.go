package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// GetPublicSchedule 获取当前届次的赛程（首页日历与甘特图）
func GetPublicSchedule(c *gin.Context) {
	items, err := services.BuildPublicSchedule(config.Get().CurrentEventID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取赛程失败")
		return
	}
	utils.ResponseOK(c, items)
}
