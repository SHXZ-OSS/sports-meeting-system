package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// UserRole 用户角色
type UserRole string

const (
	RoleAdmin   UserRole = "admin"
	RoleStudent UserRole = "student"
)

// JWTClaims JWT 的自定义声明
type JWTClaims struct {
	jwt.RegisteredClaims

	UserID     int      `json:"user_id"`
	Username   string   `json:"username"`
	Role       UserRole `json:"role"`
	Permission int      `json:"permission,omitempty"` // 操作员权限列表
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
		ExpiresAt:  jwt.NewNumericDate(expirationTime),
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

	// 解析 token（仅接受 HS256，防止算法混淆）
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(_ *jwt.Token) (any, error) {
		return jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
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

// loginByDingTalkID 通过钉钉用户 ID 登录：先匹配学生，再匹配管理员
func loginByDingTalkID(dingTalkID string) (string, any, error) {
	// 先尝试查找学生
	student, err := models.GetStudentByDingTalkID(dingTalkID)
	if err == nil {
		// 学生找到，生成学生 token
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			return "", nil, err
		}
		return token, student, nil
	}

	// 如果找不到学生，尝试查找管理员
	user, err := models.GetUserByDingTalkID(dingTalkID)
	if err == nil {
		// 生成 token
		token, err := GenerateToken(user.ID, user.Username, RoleAdmin, user.Permission)
		if err != nil {
			return "", nil, err
		}
		return token, user, nil
	}

	return "", nil, errors.New("未找到关联的学生或用户，请联系管理员。你的钉钉ID为：" + dingTalkID)
}

// DingTalkLogin 钉钉免登录
func DingTalkLogin(code string) (string, any, error) {
	// 获取钉钉用户信息
	userInfo, err := utils.GetDingTalkUserInfo(code)
	if err != nil {
		return "", nil, err
	}

	if userInfo.UserID == "0" {
		return "", nil, errors.New("获取用户信息失败")
	}

	return loginByDingTalkID(userInfo.UserID)
}

// DingTalkSSOLogin 钉钉SSO登录（用于非钉钉客户端环境）
// 通过SSO OAuth2方式获取用户信息后进行登录
func DingTalkSSOLogin(userID, _ string) (string, any, error) {
	if userID == "" {
		return "", nil, errors.New("用户ID为空")
	}

	return loginByDingTalkID(userID)
}

// OIDCLogin OIDC 登录：直接按用户名匹配本地账号，先学生后管理员（与钉钉登录的匹配顺序一致）
func OIDCLogin(username string) (string, any, error) {
	if username == "" {
		return "", nil, errors.New("OIDC 账号用户名为空")
	}

	// 先尝试匹配学生
	student, err := models.GetStudentByUsername(username)
	if err == nil {
		token, err := GenerateToken(student.ID, student.Username, RoleStudent, 0)
		if err != nil {
			return "", nil, err
		}
		return token, student, nil
	}

	// 再尝试匹配管理员
	user, err := models.GetUserByUsername(username)
	if err == nil {
		token, err := GenerateToken(user.ID, user.Username, RoleAdmin, user.Permission)
		if err != nil {
			return "", nil, err
		}
		return token, user, nil
	}

	return "", nil, errors.New("未找到关联的学生或用户，请联系管理员。你的用户名为：" + username)
}
