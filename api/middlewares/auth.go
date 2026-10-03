package middlewares

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// 上下文键
const (
	UserIDKey      string = "user_id"
	UsernameKey    string = "username"
	RoleKey        string = "role"
	PermissionsKey string = "permission"
)

// AuthMiddleware 身份验证中间件
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从请求头获取令牌
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.ResponseError(c, http.StatusUnauthorized, "authorization header is required")
			c.Abort()
			return
		}

		// 解析令牌
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.ResponseError(c, http.StatusUnauthorized, "无效的授权格式")
			c.Abort()
			return
		}
		tokenString := parts[1]

		// 验证令牌
		claims, err := services.ValidateToken(tokenString)
		if err != nil {
			utils.ResponseError(c, http.StatusUnauthorized, "无效的令牌")
			c.Abort()
			return
		}

		// 验证用户存在（根据角色验证不同的表）
		switch claims.Role {
		case services.RoleAdmin:
			_, err = models.GetUserByID(claims.UserID)
		case services.RoleStudent:
			_, err = models.GetStudentByID(claims.UserID)
		}

		if err != nil {
			utils.ResponseError(c, http.StatusUnauthorized, "user not found")
			c.Abort()
			return
		}

		// 将用户信息存储在上下文中
		c.Set(UserIDKey, claims.UserID)
		c.Set(UsernameKey, claims.Username)
		c.Set(RoleKey, claims.Role)
		c.Set(PermissionsKey, claims.Permission)

		// 调用下一个处理程序
		c.Next()
	}
}

// AdminMiddleware 管理员验证中间件
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从上下文获取用户角色
		role, ok := GetRoleFromContext(c)
		if !ok || role != services.RoleAdmin {
			utils.ResponseError(c, http.StatusForbidden, "admin access required")
			c.Abort()
			return
		}

		c.Next()
	}
}

// PermissionMiddleware 权限验证中间件
func PermissionMiddleware(requiredPermission int) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从上下文获取用户ID
		userID, ok := GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "unauthorized")
			c.Abort()
			return
		}

		// 获取用户信息
		user, err := models.GetUserByID(userID)
		if err != nil {
			utils.ResponseError(c, http.StatusUnauthorized, "user not found")
			c.Abort()
			return
		}

		// 检查权限
		if !models.HasPermission(user, requiredPermission) {
			utils.ResponseError(c, http.StatusForbidden, "insufficient permissions")
			c.Abort()
			return
		}

		c.Next()
	}
}

// ClassBoundOrProjectPermission 班级账号或持有项目管理权限的中间件
// 用于班级账号代提交推荐项目路由：班级账号放行，未绑定班级的管理员需持有项目管理权限
func ClassBoundOrProjectPermission() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取用户信息
		userID, ok := GetUserIDFromContext(c)
		if !ok {
			utils.ResponseError(c, http.StatusUnauthorized, "unauthorized")
			c.Abort()
			return
		}

		user, err := models.GetUserByID(userID)
		if err != nil {
			utils.ResponseError(c, http.StatusUnauthorized, "user not found")
			c.Abort()
			return
		}

		if models.IsClassBound(user) || models.HasPermission(user, utils.PermissionProjectManagement) {
			c.Next()
			return
		}

		utils.ResponseError(c, http.StatusForbidden, "insufficient permissions")
		c.Abort()
	}
}

// StudentMiddleware 学生验证中间件
func StudentMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从上下文获取用户角色
		role, ok := GetRoleFromContext(c)
		if !ok || role != services.RoleStudent {
			utils.ResponseError(c, http.StatusForbidden, "student access required")
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetUserIDFromContext 从上下文获取用户ID
func GetUserIDFromContext(c *gin.Context) (int, bool) {
	userID, ok := c.Get(UserIDKey)
	if !ok {
		return 0, false
	}
	id, ok := userID.(int)
	return id, ok
}

// GetRoleFromContext 从上下文获取用户角色
func GetRoleFromContext(c *gin.Context) (services.UserRole, bool) {
	role, ok := c.Get(RoleKey)
	if !ok {
		return "", false
	}
	r, ok := role.(services.UserRole)
	return r, ok
}

// IsAdmin 判断用户是否为管理员
func IsAdmin(c *gin.Context) bool {
	role, ok := GetRoleFromContext(c)
	return ok && role == services.RoleAdmin
}

// IsStudent 判断用户是否为学生
func IsStudent(c *gin.Context) bool {
	role, ok := GetRoleFromContext(c)
	return ok && role == services.RoleStudent
}
