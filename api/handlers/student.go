package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// CreateStudentRequest 创建学生请求
type CreateStudentRequest struct {
	FullName   string `json:"full_name"   binding:"required"`
	ClassName  string `json:"class_name"  binding:"required"`
	Gender     int    `json:"gender"      binding:"required,min=1,max=2"`
	DingTalkID string `json:"dingtalk_id"`
}

// UpdateStudentRequest 更新学生请求
type UpdateStudentRequest struct {
	FullName   string `json:"full_name"   binding:"required"`
	ClassName  string `json:"class_name"  binding:"required"`
	Gender     int    `json:"gender"      binding:"required,min=1,max=2"`
	DingTalkID string `json:"dingtalk_id"`
}

// GetAllStudents 获取所有学生
func GetAllStudents(c *gin.Context) {
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

	// 解析分页参数
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	classID, _ := strconv.Atoi(c.Query("class_id"))

	if page <= 0 {
		page = 0
	}
	if pageSize <= 0 {
		pageSize = 0
	}

	// 计算scope
	var scopeClassIDs *[]int
	if !models.IsGlobalAdmin(user) {
		ids := models.GetClassScopeIDs(user)
		scopeClassIDs = &ids

		// 如果指定了classID，检查权限
		if classID > 0 && !models.HasClassScope(user, classID) {
			utils.ResponseError(c, http.StatusForbidden, "没有权限查看该班级的学生")
			return
		}
	}

	// 获取学生列表
	students, total, err := models.GetAllStudents(page, pageSize, scopeClassIDs, classID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取学生列表失败: "+err.Error())
		return
	}

	// 返回响应
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, students, total, page, pageSize)
	} else {
		utils.ResponseOK(c, students)
	}
}

// GetStudent 获取学生信息
func GetStudent(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
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

	// 获取学生信息
	student, err := models.GetStudentByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 权限验证：全局管理员或有该学生所在班级权限的用户可以查看
	if !models.HasClassScope(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 返回响应
	utils.ResponseOK(c, student)
}

// CreateStudent 创建学生
func CreateStudent(c *gin.Context) {
	// 解析请求
	var req CreateStudentRequest
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

	// 获取或创建班级
	class, isCreated, err := models.GetOrCreateClassByName(req.ClassName)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取或创建班级失败")
		return
	}

	// 权限验证：全局管理员或有该班级权限的用户可以创建学生
	if !models.HasClassScope(user, class) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		if isCreated {
			if err := models.DeleteClass(class); err != nil {
				logger.L.Warn("回滚新建班级失败", "error", err)
			}
		}
		return
	}

	// 创建学生
	student, password, err := models.CreateStudent(req.FullName, req.Gender, class, req.DingTalkID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建学生失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseOK(c, map[string]any{
		"student":  student,
		"password": password, // 返回初始密码
	})
}

// UpdateStudent 更新学生信息
func UpdateStudent(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
		return
	}

	// 解析请求
	var req UpdateStudentRequest
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

	// 获取学生信息
	student, err := models.GetStudentByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 权限验证：全局管理员或有该学生所在班级权限的用户可以更新
	if !models.HasClassScope(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 班级名称修改
	class, isCreated, err := models.GetOrCreateClassByName(req.ClassName)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取或创建班级失败")
		return
	}
	// 如果更改班级，需要检查新班级的权限
	if !models.HasClassScope(user, class) {
		utils.ResponseError(c, http.StatusForbidden, "没有权限将学生转移到该班级")
		if isCreated {
			if err := models.DeleteClass(class); err != nil {
				logger.L.Warn("回滚新建班级失败", "error", err)
			}
		}
		return
	}

	// 更新学生信息
	student.FullName = req.FullName
	student.ClassID = class
	student.Gender = req.Gender
	student.DingTalkID = req.DingTalkID

	if err := models.UpdateStudent(student); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "更新学生失败: "+err.Error())
		return
	}

	// 返回响应
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteStudent 删除学生
func DeleteStudent(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
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

	// 获取学生信息
	student, err := models.GetStudentByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 权限验证：全局管理员或有该学生所在班级权限的用户可以删除
	if !models.HasClassScope(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 删除学生
	if err := models.DeleteStudent(id); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "删除学生失败")
		return
	}

	// 返回响应
	utils.ResponseOK(c, map[string]bool{"success": true})
}

// ResetStudentPassword 重置学生密码
func ResetStudentPassword(c *gin.Context) {
	// 解析路径参数
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的学生ID")
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

	// 获取学生
	student, err := models.GetStudentByID(id)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "学生不存在")
		return
	}

	// 权限验证：全局管理员或有该学生所在班级权限的用户可以重置密码
	if !models.HasClassScope(user, student.ClassID) {
		utils.ResponseError(c, http.StatusForbidden, "权限不足")
		return
	}

	// 重置密码
	randomPassword, err := utils.GenerateRandomPassword(8)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "生成随机密码失败")
		return
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(randomPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "生成密码哈希失败")
		return
	}
	// 更新学生密码
	student.Password = string(hashedPassword)
	if err := models.UpdateStudent(student); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "重置密码失败")
		return
	}
	// 返回新密码
	utils.ResponseOK(c, map[string]string{"new_password": randomPassword})
}
