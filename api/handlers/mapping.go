package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// RebuildParentStudentMapping 重建家长-学生映射关系
func RebuildParentStudentMapping(c *gin.Context) {
	// 检查是否已经在重建中
	if services.IsRebuildingMapping() {
		utils.ResponseError(c, http.StatusConflict, "家长-学生映射关系重建任务已在进行中，请等待完成")
		return
	}

	// 启动一个 goroutine 来异步执行重建操作
	go func() {
		err := services.RebuildParentStudentMapping()
		if err != nil {
			// 记录错误日志
			utils.LogError("重建家长-学生映射失败: " + err.Error())
		}
	}()

	// 立即返回成功响应，表示任务已启动
	utils.ResponseSuccessWithCustomMessage(c, "家长-学生映射关系重建任务已启动")
}

// GetMappingLogs 获取家长-学生映射关系重建的日志
func GetMappingLogs(c *gin.Context) {
	// 获取所有日志
	logs := services.GetMappingLogs()

	// 构造响应
	response := map[string]any{
		"logs": logs,
	}

	// 返回响应
	utils.ResponseOK(c, response)
}
