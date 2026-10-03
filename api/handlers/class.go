package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateClassRequest 创建班级请求
type CreateClassRequest struct {
	Name string `json:"name" binding:"required"`
}

// UpdateClassRequest 更新班级请求
type UpdateClassRequest struct {
	Name string `json:"name" binding:"required"`
}

// GetAllClasses 获取所有班级
func GetAllClasses(c *gin.Context) {
	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 如果是全局管理员，返回所有班级
	if models.IsGlobalAdmin(user) {
		classes, _, err := models.GetAllClasses(page, pageSize)
		if err != nil {
			utils.ResponseError(c, http.StatusInternalServerError, "获取班级列表失败")
			return
		}
		utils.ResponseOK(c, classes)
		return
	}

	// 否则只返回用户有权限的班级
	utils.ResponseOK(c, user.ClassScopes)
}

// GetClass 获取班级信息
func GetClass(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的班级ID")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取班级信息
	class, err := models.GetClassByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "班级不存在")
		return
	}

	// 权限验证：全局管理员或有该班级权限的用户可以查看
	if !models.HasClassScope(user, id) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 返回响应
	utils.ResponseOK(c, class)
}

// CreateClass 创建班级
func CreateClass(c *gin.Context) {
	// 解析请求
	var req CreateClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 如果不是全局管理员，拒绝操作
	if !models.IsGlobalAdmin(user) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 创建班级
	_, err = models.CreateClass(req.Name)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建班级失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "创建成功")
}

// UpdateClass 更新班级信息
func UpdateClass(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的班级ID")
		return
	}

	// 解析请求
	var req UpdateClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取班级信息
	class, err := models.GetClassByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "班级不存在")
		return
	}

	// 权限验证：全局管理员或有该班级权限的用户可以更新
	if !models.HasClassScope(user, id) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 更新班级信息
	class.Name = req.Name

	if err := models.UpdateClass(class); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新班级失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteClass 删除班级
func DeleteClass(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的班级ID")
		return
	}

	// 获取当前用户信息
	userID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	user, err := models.GetUserByID(userID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 权限验证：只有全局管理员可以删除班级
	if !models.IsGlobalAdmin(user) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 删除班级
	if err := models.DeleteClass(id); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "删除班级失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}
