package services

import (
	"errors"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
	"github.com/dgrijalva/jwt-go"
)

// UserRole 用户角色
type UserRole string

const (
	RoleAdmin   UserRole = "admin"
	RoleStudent UserRole = "student"
)

// JWTClaims JWT 的自定义声明
type JWTClaims struct {
	UserID     int      `json:"user_id"`
	Username   string   `json:"username"`
	Role       UserRole `json:"role"`
	Permission int      `json:"permission,omitempty"` // 操作员权限列表
	jwt.StandardClaims
}

// StudentData 学生数据结构，用于登录响应
type StudentData struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
	Token    string `json:"token"`
}

// GenerateToken 生成 JWT 令牌
func GenerateToken(id int, username string, role UserRole, permissions int) (string, error) {
	// 获取 JWT 密钥
	cfg := config.Get()
	jwtSecret := []byte(cfg.Security.JWTSecret)

	// 设置 token 有效期为 30 天
	expirationTime := time.Now().Add(30 * 24 * time.Hour)

	// 创建声明
	claims := &JWTClaims{
		UserID:     id,
		Username:   username,
		Role:       role,
		Permission: permissions,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expirationTime.Unix(),
		},
	}

	// 创建未签名的 token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// 签名 token
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateToken 验证 JWT 令牌
func ValidateToken(tokenString string) (*JWTClaims, error) {
	// 获取 JWT 密钥
	cfg := config.Get()
	jwtSecret := []byte(cfg.Security.JWTSecret)

	// 解析 token
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	// 验证 token
	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("无效的令牌")
}

// Login 用户登录
func Login(username, password string) (string, *types.User, error) {
	// 验证用户凭据
	user, err := models.VerifyPassword(username, password)
	if err != nil {
		return "", nil, err
	}

	// 生成 token
	token, err := GenerateToken(user.ID, user.Username, RoleAdmin, user.Permission)
	if err != nil {
		return "", nil, err
	}

	return token, user, nil
}

// StudentLogin 学生登录
func StudentLogin(username, password string) (string, *types.Student, error) {
	// 验证学生凭据
	student, err := models.VerifyStudentPassword(username, password)
	if err != nil {
		return "", nil, err
	}
	// 生成 token
	token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
	if err != nil {
		return "", nil, err
	}
	return token, student, nil
}

// DingTalkLogin 钉钉免登录
func DingTalkLogin(code string) (string, interface{}, error) {
	// 获取钉钉用户信息
	userInfo, err := utils.GetDingTalkUserInfo(code)
	if err != nil {
		return "", nil, err
	}

	if userInfo.UserID == "0" {
		return "", nil, errors.New("获取用户信息失败")
	}

	// 先尝试查找学生
	student, err := models.GetStudentByDingTalkID(userInfo.UserID)
	if err == nil {
		// 学生找到，生成学生 token
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			return "", nil, err
		}
		return token, student, nil
	}

	// 如果找不到学生，尝试查找管理员
	user, err := models.GetUserByDingTalkID(userInfo.UserID)
	if err == nil {

		// 生成 token
		token, err := GenerateToken(user.ID, user.Username, RoleAdmin, user.Permission)
		if err != nil {
			return "", nil, err
		}

		return token, user, nil
	}

	// 如果前面都找不到，可能是家长，尝试获取关联的学生
	// 直接从数据库中查询缓存的家长-学生关系
	relations, err := models.GetStudentsByParentID(userInfo.UserID)

	if err != nil || len(relations) == 0 {
		return "", nil, errors.New("未找到关联的学生或用户，请联系管理员。你的钉钉ID为：" + userInfo.UserID)
	}

	// 获取学生的详细信息
	var studentsData []StudentData
	for _, relation := range relations {
		student, err := models.GetStudentByDingTalkID(relation.StudentID)
		if err != nil {
			continue
		}

		// 为每个学生生成token
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			continue
		}

		studentsData = append(studentsData, StudentData{
			ID:       student.ID,
			Username: student.Username,
			FullName: student.FullName,
			Token:    token,
		})
	}

	if len(studentsData) == 0 {
		return "", nil, errors.New("无法生成学生登录凭证，请联系系统管理员")
	}

	// 返回所有学生信息和对应的token
	return "", studentsData, nil
}

// DingTalkSSOLogin 钉钉SSO登录（用于非钉钉客户端环境）
// 通过SSO OAuth2方式获取用户信息后进行登录
func DingTalkSSOLogin(userID, name string) (string, interface{}, error) {
	if userID == "" {
		return "", nil, errors.New("用户ID为空")
	}

	// 先尝试查找学生
	student, err := models.GetStudentByDingTalkID(userID)
	if err == nil {
		// 学生找到，生成学生 token
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			return "", nil, err
		}
		return token, student, nil
	}

	// 如果找不到学生，尝试查找管理员
	user, err := models.GetUserByDingTalkID(userID)
	if err == nil {
		// 生成 token
		token, err := GenerateToken(user.ID, user.Username, RoleAdmin, user.Permission)
		if err != nil {
			return "", nil, err
		}
		return token, user, nil
	}

	// 如果前面都找不到，可能是家长，尝试获取关联的学生
	relations, err := models.GetStudentsByParentID(userID)
	if err != nil || len(relations) == 0 {
		return "", nil, errors.New("未找到关联的学生或用户，请联系管理员。你的钉钉ID为：" + userID)
	}

	// 获取学生的详细信息
	var studentsData []StudentData
	for _, relation := range relations {
		student, err := models.GetStudentByDingTalkID(relation.StudentID)
		if err != nil {
			continue
		}

		// 为每个学生生成token
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			continue
		}

		studentsData = append(studentsData, StudentData{
			ID:       student.ID,
			Username: student.Username,
			FullName: student.FullName,
			Token:    token,
		})
	}

	if len(studentsData) == 0 {
		return "", nil, errors.New("无法生成学生登录凭证，请联系系统管理员")
	}

	// 返回所有学生信息和对应的token
	return "", studentsData, nil
}
