package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username      string `json:"username"        binding:"required"`
	Password      string `json:"password"        binding:"required"`
	FullName      string `json:"full_name"       binding:"required"`
	Permission    int    `json:"permission"      binding:"required"`
	DingTalkID    string `json:"dingtalk_id"`
	ClassScopeIDs []int  `json:"class_scope_ids" binding:"required"`
}

// UpdateUserRequest 更新用户请求
type UpdateUserRequest struct {
	FullName      string `json:"full_name"          binding:"required"`
	Permission    int    `json:"permission"         binding:"required"`
	Password      string `json:"password,omitempty"`
	DingTalkID    string `json:"dingtalk_id"`
	ClassScopeIDs []int  `json:"class_scope_ids"    binding:"required"`
}

// GetAllUsers 获取所有用户
func GetAllUsers(c *gin.Context) {
	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 获取用户列表
	users, total, err := models.GetAllUsers(page, pageSize)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "failed to get users")
		return
	}

	// 如果指定了分页，返回分页响应
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, users, total, page, pageSize)
	} else {
		utils.ResponseOK(c, users)
	}
}

// GetUser 获取用户信息
func GetUser(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的用户ID")
		return
	}

	// 获取用户信息
	user, err := models.GetUserByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "用户不存在")
		return
	}

	// 返回响应
	utils.ResponseOK(c, user)
}

// CreateUser 创建用户
func CreateUser(c *gin.Context) {
	// 解析请求
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息以检查权限
	currentUserID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	currentUser, err := models.GetUserByID(currentUserID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 验证用户创建操作
	if err := utils.ValidateUserCreateOrUpdate(
		currentUser.Permission,
		req.Permission,
		0,
		req.ClassScopeIDs,
	); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
		return
	}

	user, err := models.CreateUser(req.Username, req.Password, req.FullName, req.Permission, req.DingTalkID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "用户创建失败: "+err.Error())
		return
	}

	// 更新班级权限
	if err := models.UpdateUserClassScopes(user.ID, req.ClassScopeIDs); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新班级权限失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "创建成功")
}

// UpdateUser 更新用户信息
func UpdateUser(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的用户ID")
		return
	}

	// 解析请求
	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 获取当前用户信息以检查权限
	currentUserID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	currentUser, err := models.GetUserByID(currentUserID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取要更新的用户信息
	user, err := models.GetUserByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "用户不存在")
		return
	}

	// 验证用户更新操作
	if err := utils.ValidateUserCreateOrUpdate(
		currentUser.Permission,
		req.Permission,
		user.Permission,
		req.ClassScopeIDs,
	); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
		return
	}

	// 更新用户信息
	user.FullName = req.FullName
	user.Permission = req.Permission
	user.DingTalkID = req.DingTalkID

	// 更新班级权限
	if err := models.UpdateUserClassScopes(user.ID, req.ClassScopeIDs); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新班级权限失败")
		return
	}

	// 重新加载user以获取更新后的ClassScopes
	user, err = models.GetUserByID(user.ID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "重新加载用户信息失败")
		return
	}

	// 如果提供了新密码，更新密码
	if req.Password != "" {
		if err := models.UpdatePassword(user.ID, req.Password); err != nil {
			utils.ResponseError(c, http.StatusInternalServerError, "更新密码失败")
			return
		}
	}

	// 写入数据库
	if err := models.UpdateUser(user); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新用户失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteUser 删除用户
func DeleteUser(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的用户ID")
		return
	}

	// 获取当前用户信息以检查权限
	currentUserID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}

	// 不能删除自己
	if currentUserID == id {
		utils.ResponseError(c, http.StatusForbidden, "不能删除自己")
		return
	}

	currentUser, err := models.GetUserByID(currentUserID)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, "用户信息获取失败")
		return
	}

	// 获取要删除的用户信息
	user, err := models.GetUserByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "用户不存在")
		return
	}

	// 检查权限：不能删除比自己权限更高的用户
	if utils.HasMorePermissions(user.Permission, currentUser.Permission) {
		utils.ResponseError(c, http.StatusForbidden, "不能删除权限更高的用户")
		return
	}

	// 删除用户
	if err := models.DeleteUser(id); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "删除用户失败")
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}
