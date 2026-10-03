package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateEventRequest 创建运动会届次请求
type CreateEventRequest struct {
	Name string `json:"name" binding:"required"`
}

// UpdateEventRequest 更新运动会届次请求
type UpdateEventRequest struct {
	Name string `json:"name" binding:"required"`
}

// CreateEvent 创建运动会届次
func CreateEvent(c *gin.Context) {
	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	if req.Name == "" {
		utils.ResponseError(c, http.StatusBadRequest, "运动会届次名称不能为空")
		return
	}

	event, err := models.CreateEvent(req.Name)
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
		return
	}

	utils.ResponseOK(c, event)
}

// UpdateEvent 更新运动会届次
func UpdateEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的运动会ID")
		return
	}

	var req UpdateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	if req.Name == "" {
		utils.ResponseError(c, http.StatusBadRequest, "运动会届次名称不能为空")
		return
	}

	if err := models.UpdateEvent(id, req.Name); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteEvent 删除运动会届次
func DeleteEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的运动会ID")
		return
	}

	cfg := config.Get()
	if err := models.DeleteEvent(id, cfg.CurrentEventID); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
		return
	}

	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}

// SwitchEvent 切换当前运动会届次
func SwitchEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的运动会ID")
		return
	}

	// 验证 Event 是否存在
	_, err = models.GetEventByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, err.Error())
		return
	}

	cfg := config.Get()
	cfg.CurrentEventID = id

	// 保存配置
	if err := config.Save(); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "保存配置失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "切换成功")
}
