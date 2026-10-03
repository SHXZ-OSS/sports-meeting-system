package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// buildBaseURL 解析对外可访问的基础地址：优先使用配置域名，否则按当前请求推断
func buildBaseURL(c *gin.Context) string {
	cfg := config.Get()
	if cfg.Website.Domain != "" {
		return cfg.Website.Domain
	}

	scheme := "https"
	if c.Request.TLS == nil {
		// 检查X-Forwarded-Proto头
		if proto := c.GetHeader("X-Forwarded-Proto"); proto != "" {
			scheme = proto
		} else {
			scheme = "http"
		}
	}
	return fmt.Sprintf("%s://%s", scheme, c.Request.Host)
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token string `json:"token"`
	User  struct {
		ID         int    `json:"id"`
		Username   string `json:"username"`
		FullName   string `json:"full_name"`
		Role       string `json:"role"`
		Permission int    `json:"permission"`
	} `json:"user"`
}

// DingTalkLoginRequest 钉钉登录请求
type DingTalkLoginRequest struct {
	Code string `json:"code"`
}

// Login 用户登录
func Login(c *gin.Context) {
	// 解析请求
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 验证用户凭据
	token, user, err := services.Login(req.Username, req.Password)
	if err != nil {
		// 尝试学生登录
		studentLogin(c, req)
		return
	}

	// 构建响应
	resp := LoginResponse{
		Token: token,
		User: struct {
			ID         int    `json:"id"`
			Username   string `json:"username"`
			FullName   string `json:"full_name"`
			Role       string `json:"role"`
			Permission int    `json:"permission"`
		}{
			ID:         user.ID,
			Username:   user.Username,
			FullName:   user.FullName,
			Role:       string(services.RoleAdmin),
			Permission: user.Permission,
		},
	}

	// 返回响应
	utils.ResponseOK(c, resp)
}

// studentLogin 学生登录
func studentLogin(c *gin.Context, req LoginRequest) {
	// 验证学生凭据
	token, student, err := services.StudentLogin(req.Username, req.Password)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, err.Error())
		return
	}
	// 构建响应
	resp := LoginResponse{
		Token: token,
		User: struct {
			ID         int    `json:"id"`
			Username   string `json:"username"`
			FullName   string `json:"full_name"`
			Role       string `json:"role"`
			Permission int    `json:"permission"`
		}{
			ID:         student.ID,
			Username:   student.Username,
			FullName:   student.FullName,
			Role:       string(services.RoleStudent),
			Permission: 0,
		},
	}
	// 返回响应
	utils.ResponseOK(c, resp)
}

// DingTalkLogin 钉钉登录
func DingTalkLogin(c *gin.Context) {
	// 解析请求
	var req DingTalkLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	// 进行钉钉免登录
	token, userObj, err := services.DingTalkLogin(req.Code)
	if err != nil {
		utils.ResponseError(c, http.StatusUnauthorized, err.Error())
		return
	}

	// 返回响应
	utils.ResponseOK(c, map[string]any{
		"token": token,
		"user":  userObj,
	})
}

// DingTalkSSORedirect 钉钉SSO登录重定向
// 用于非钉钉客户端环境下的登录
func DingTalkSSORedirect(c *gin.Context) {
	cfg := config.Get()
	clientID := cfg.DingTalk.AppKey // AppKey 即为 ClientID

	if clientID == "" {
		utils.ResponseError(c, http.StatusBadRequest, "钉钉SSO未配置")
		return
	}

	// 获取最终重定向路径（SSO完成后跳转回的页面）
	redirectPath := c.Query("redirect")
	if redirectPath == "" {
		redirectPath = "/"
	}

	redirectURI := fmt.Sprintf("%s/api/public/dingtalk/sso_callback?redirect=%s",
		buildBaseURL(c), url.QueryEscape(redirectPath))

	// 构建钉钉OAuth2授权URL
	urlValues := url.Values{}
	urlValues.Add("response_type", "code")
	urlValues.Add("client_id", clientID)
	urlValues.Add("redirect_uri", redirectURI)
	urlValues.Add("scope", "openid")
	urlValues.Add("prompt", "consent")

	authURL := "https://login.dingtalk.com/oauth2/auth?" + urlValues.Encode()
	c.Redirect(http.StatusFound, authURL)
}

// DingTalkSSOCallback 钉钉SSO登录回调
func DingTalkSSOCallback(c *gin.Context) {
	code := c.Query("authCode")
	if code == "" {
		code = c.Query("code")
	}
	redirectPath := c.Query("redirect") // 回调后重定向的路径

	baseURL := buildBaseURL(c)

	if code == "" {
		// 重定向回前端，带上错误信息
		redirectURL := fmt.Sprintf("%s%s?dingtalk_error=%s", baseURL, redirectPath, url.QueryEscape("未获取到授权码"))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// 获取用户信息
	userInfo, err := utils.GetDingTalkSSOUserInfo(code)
	if err != nil {
		redirectURL := fmt.Sprintf("%s%s?dingtalk_error=%s", baseURL, redirectPath, url.QueryEscape(err.Error()))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// 尝试登录
	token, userObj, err := services.DingTalkSSOLogin(userInfo.UserID, userInfo.Name)
	if err != nil {
		redirectURL := fmt.Sprintf("%s%s?dingtalk_error=%s", baseURL, redirectPath, url.QueryEscape(err.Error()))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// 重定向到登录页面处理
	userJSON, err := json.Marshal(userObj)
	if err != nil {
		redirectURL := fmt.Sprintf("%s/login?dingtalk_error=%s", baseURL, url.QueryEscape("用户信息序列化失败"))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	redirectURL := fmt.Sprintf("%s/login?dingtalk_token=%s&dingtalk_user=%s",
		baseURL,
		url.QueryEscape(token),
		url.QueryEscape(string(userJSON)))
	c.Redirect(http.StatusFound, redirectURL)
}

// OIDCSSORedirect OIDC SSO 登录重定向（接入慧云等 OIDC 提供方）
func OIDCSSORedirect(c *gin.Context) {
	cfg := config.Get()
	if !oidcLoginReady(cfg) {
		utils.ResponseError(c, http.StatusBadRequest, "OIDC 登录未配置")
		return
	}

	// 获取最终重定向路径（SSO完成后跳转回的页面）
	redirectPath := c.Query("redirect")
	if redirectPath == "" {
		redirectPath = "/"
	}

	redirectURI := fmt.Sprintf("%s/api/public/oidc/callback?redirect=%s",
		buildBaseURL(c), url.QueryEscape(redirectPath))

	state, verifier, codeChallenge, err := utils.GenerateOIDCPKCE()
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "生成 OIDC 随机参数失败")
		return
	}

	// state 与 code_verifier 经短期 Cookie 携带到回调，用于防 CSRF 与 PKCE 兑换
	c.SetCookie("oidc_state", state, 600, "/", "", false, true)
	c.SetCookie("oidc_verifier", verifier, 600, "/", "", false, true)

	authURL := utils.BuildOIDCAuthURL(redirectURI, state, codeChallenge, cfg.Oidc.Scopes)
	c.Redirect(http.StatusFound, authURL)
}

// OIDCSSOCallback OIDC SSO 登录回调
func OIDCSSOCallback(c *gin.Context) {
	code := c.Query("code")
	redirectPath := c.Query("redirect")
	if redirectPath == "" {
		redirectPath = "/"
	}
	baseURL := buildBaseURL(c)

	failRedirect := func(err error) {
		c.Redirect(http.StatusFound,
			fmt.Sprintf("%s%s?oidc_error=%s", baseURL, redirectPath, url.QueryEscape(err.Error())))
	}

	if code == "" {
		failRedirect(errors.New("未获取到授权码"))
		return
	}

	// 校验 state 防 CSRF
	expectedState, err := c.Cookie("oidc_state")
	if err != nil || expectedState == "" || expectedState != c.Query("state") {
		failRedirect(errors.New("state 校验失败，请重新发起登录"))
		return
	}
	verifier, err := c.Cookie("oidc_verifier")
	if err != nil || verifier == "" {
		failRedirect(errors.New("登录会话已过期，请重新发起登录"))
		return
	}
	// 一次性消费，防重放
	c.SetCookie("oidc_state", "", -1, "/", "", false, true)
	c.SetCookie("oidc_verifier", "", -1, "/", "", false, true)

	redirectURI := fmt.Sprintf("%s/api/public/oidc/callback?redirect=%s",
		baseURL, url.QueryEscape(redirectPath))

	tokenResp, err := utils.ExchangeOIDCCode(c.Request.Context(), code, redirectURI, verifier)
	if err != nil {
		failRedirect(err)
		return
	}

	userInfo, err := utils.GetOIDCUserInfo(c.Request.Context(), tokenResp.AccessToken)
	if err != nil {
		failRedirect(err)
		return
	}

	// 按用户名匹配本地账号并签发本系统的 JWT
	token, userObj, err := services.OIDCLogin(userInfo.PreferredUsername)
	if err != nil {
		failRedirect(err)
		return
	}

	userJSON, err := json.Marshal(userObj)
	if err != nil {
		failRedirect(errors.New("用户信息序列化失败"))
		return
	}

	c.Redirect(http.StatusFound, fmt.Sprintf("%s/login?oidc_token=%s&oidc_user=%s",
		baseURL,
		url.QueryEscape(token),
		url.QueryEscape(string(userJSON))))
}
