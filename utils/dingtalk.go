package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
)

// DingTalkToken 钉钉访问令牌结构
type DingTalkToken struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ExpiresAt   time.Time
}

var dingTalkToken *DingTalkToken

// GetDingTalkToken 获取钉钉访问令牌
func GetDingTalkToken() (string, error) {
	// 检查令牌是否存在且有效
	if dingTalkToken != nil && time.Now().Before(dingTalkToken.ExpiresAt) {
		return dingTalkToken.AccessToken, nil
	}

	// 获取配置
	cfg := config.Get()
	appKey := cfg.DingTalk.AppKey
	appSecret := cfg.DingTalk.AppSecret

	// 检查配置是否完整
	if appKey == "" || appSecret == "" {
		return "", errors.New("钉钉配置不完整")
	}

	// 请求URL
	url := fmt.Sprintf("https://oapi.dingtalk.com/gettoken?appkey=%s&appsecret=%s", appKey, appSecret)

	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := range maxRetries {
		// 如果不是第一次尝试，等待一段时间再重试
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			logger.L.Warn(fmt.Sprintf("重试获取钉钉访问令牌，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime))
		}

		// 发送请求
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
		if err != nil {
			lastErr = fmt.Errorf("failed to create DingTalk token request: %w", err)
			continue
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("failed to request DingTalk token: %w", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %w", err)
			continue
		}

		// 解析响应
		var result struct {
			ErrCode     int    `json:"errcode"`
			ErrMsg      string `json:"errmsg"`
			AccessToken string `json:"access_token"`
			ExpiresIn   int    `json:"expires_in"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			lastErr = fmt.Errorf("failed to parse response: %w", err)
			continue
		}

		// 如果是QPS超限错误，进行重试
		if result.ErrCode == 88 || result.ErrCode == -1 {
			lastErr = fmt.Errorf("DingTalk API QPS limit: %s (code: %d)", result.ErrMsg, result.ErrCode)
			continue
		}

		// 检查响应是否成功
		if result.ErrCode != 0 {
			return "", fmt.Errorf("DingTalk API error: %s (code: %d)", result.ErrMsg, result.ErrCode)
		}

		// 保存令牌
		dingTalkToken = &DingTalkToken{
			AccessToken: result.AccessToken,
			ExpiresIn:   result.ExpiresIn,
			ExpiresAt:   time.Now().Add(time.Second * time.Duration(result.ExpiresIn-60)), // 提前60秒过期
		}

		return dingTalkToken.AccessToken, nil
	}

	return "", fmt.Errorf("获取钉钉访问令牌失败，已重试 %d 次: %w", maxRetries, lastErr)
}

// GetDingTalkUserInfo 获取钉钉用户信息
func GetDingTalkUserInfo(code string) (*DingTalkUserInfo, error) {
	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := range maxRetries {
		// 如果不是第一次尝试，等待一段时间再重试
		// 等待时间随着重试次数增加而增加 (500ms, 1000ms, 2000ms)
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			logger.L.Warn(fmt.Sprintf("重试获取钉钉用户信息，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime))
		}

		// 获取访问令牌
		accessToken, err := GetDingTalkToken()
		if err != nil {
			lastErr = err
			continue
		}

		// 请求URL
		url := fmt.Sprintf("https://oapi.dingtalk.com/user/getuserinfo?access_token=%s&code=%s", accessToken, code)

		// 发送请求
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
		if err != nil {
			lastErr = fmt.Errorf("failed to create DingTalk user info request: %w", err)
			continue
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("failed to request DingTalk user info: %w", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %w", err)
			continue
		}

		// 解析响应
		var result struct {
			ErrCode  int    `json:"errcode"`
			ErrMsg   string `json:"errmsg"`
			UserID   string `json:"userid"`
			Name     string `json:"name"`
			DeviceID string `json:"deviceId"`
		}

		if err := json.Unmarshal(body, &result); err != nil {
			lastErr = fmt.Errorf("failed to parse response: %w", err)
			continue
		}

		// 如果是QPS超限错误，进行重试
		if result.ErrCode == 88 || result.ErrCode == -1 {
			lastErr = fmt.Errorf("DingTalk API QPS limit: %s (code: %d)", result.ErrMsg, result.ErrCode)
			continue
		}

		// 检查响应是否成功
		if result.ErrCode != 0 {
			return nil, fmt.Errorf("DingTalk API error: %s (code: %d)", result.ErrMsg, result.ErrCode)
		}

		// 返回用户信息
		return &DingTalkUserInfo{
			UserID:   result.UserID,
			Name:     result.Name,
			DeviceID: result.DeviceID,
		}, nil
	}

	return nil, fmt.Errorf("获取钉钉用户信息失败，已重试 %d 次: %w", maxRetries, lastErr)
}

// DingTalkUserInfo 钉钉用户信息结构
type DingTalkUserInfo struct {
	UserID   string `json:"userid"`
	Name     string `json:"name"`
	DeviceID string `json:"deviceId"`
}

// ActionCardMessage 定义钉钉卡片消息结构
type ActionCardMessage struct {
	Title       string `json:"title"`
	Markdown    string `json:"markdown"`
	SingleTitle string `json:"single_title"`
	SingleURL   string `json:"single_url"`
}

// SendDingTalkActionCard 发送钉钉卡片消息
func SendDingTalkActionCard(userIDs []string, card ActionCardMessage) error {
	// 获取访问令牌
	accessToken, err := GetDingTalkToken()
	if err != nil {
		return err
	}

	// 获取配置
	cfg := config.Get()
	agentID := cfg.DingTalk.AgentID

	// 如果userIDs长度超过100，需要分批发送
	if len(userIDs) > 100 {
		var batches [][]string
		for i := 0; i < len(userIDs); i += 100 {
			end := min(i+100, len(userIDs))
			batches = append(batches, userIDs[i:end])
		}

		// 分批发送
		for _, batch := range batches {
			err := sendDingTalkActionCardBatch(accessToken, agentID, batch, card)
			if err != nil {
				return err
			}
			time.Sleep(1000 * time.Millisecond) // 避免触发QPS限制
		}
		return nil
	}

	// 单批发送
	return sendDingTalkActionCardBatch(accessToken, agentID, userIDs, card)
}

// sendDingTalkActionCardBatch 按批次发送钉钉卡片消息
func sendDingTalkActionCardBatch(accessToken, agentID string, userIDs []string, card ActionCardMessage) error {
	// 构建请求数据
	data := map[string]any{
		"agent_id":    agentID,
		"userid_list": strings.Join(userIDs, ","),
		"msg": map[string]any{
			"msgtype": "action_card",
			"action_card": map[string]string{
				"title":        card.Title,
				"markdown":     card.Markdown,
				"single_title": card.SingleTitle,
				"single_url":   card.SingleURL,
			},
		},
	}

	// 编码请求数据
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to encode request: %w", err)
	}

	// 请求URL
	url := fmt.Sprintf(
		"https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=%s",
		accessToken,
	)

	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := range maxRetries {
		// 如果不是第一次尝试，等待一段时间再重试
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			logger.L.Warn(fmt.Sprintf("重试发送钉钉卡片消息，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime))
		}

		// 发送请求
		req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewBuffer(jsonData))
		if err != nil {
			lastErr = fmt.Errorf("failed to create DingTalk action card request: %w", err)
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("failed to send DingTalk action card: %w", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %w", err)
			continue
		}

		// 解析响应
		var result struct {
			ErrCode int    `json:"errcode"`
			ErrMsg  string `json:"errmsg"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			lastErr = fmt.Errorf("failed to parse response: %w", err)
			continue
		}

		// 如果是QPS超限错误，进行重试
		if result.ErrCode == 88 || result.ErrCode == -1 {
			lastErr = fmt.Errorf("DingTalk API QPS limit: %s (code: %d)", result.ErrMsg, result.ErrCode)
			continue
		}

		// 检查响应是否成功
		if result.ErrCode != 0 {
			return fmt.Errorf("DingTalk API error: %s (code: %d)", result.ErrMsg, result.ErrCode)
		}

		return nil
	}

	return fmt.Errorf("发送钉钉卡片消息失败，已重试 %d 次: %w", maxRetries, lastErr)
}

// GetDingTalkSSOUserInfo 通过SSO OAuth2授权码获取钉钉用户信息
// 用于非钉钉客户端环境下的登录
func GetDingTalkSSOUserInfo(code string) (*DingTalkUserInfo, error) {
	cfg := config.Get()
	clientID := cfg.DingTalk.AppKey        // AppKey 即为 ClientID
	clientSecret := cfg.DingTalk.AppSecret // AppSecret 即为 ClientSecret

	if clientID == "" || clientSecret == "" {
		return nil, errors.New("钉钉SSO配置不完整")
	}

	// Step 1: 获取用户访问令牌
	tokenURL := "https://api.dingtalk.com/v1.0/oauth2/userAccessToken"
	tokenBody := map[string]string{
		"clientId":     clientID,
		"clientSecret": clientSecret,
		"code":         code,
		"grantType":    "authorization_code",
	}
	tokenBodyBytes, _ := json.Marshal(tokenBody)

	req, err := http.NewRequest(http.MethodPost, tokenURL, bytes.NewBuffer(tokenBodyBytes))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求用户令牌失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var tokenResult struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
		ExpireIn     int    `json:"expireIn"`
		CorpID       string `json:"corpId"`
	}
	if err := json.Unmarshal(body, &tokenResult); err != nil {
		return nil, fmt.Errorf("解析令牌响应失败: %w", err)
	}

	if tokenResult.AccessToken == "" {
		// 检查是否有错误信息
		var errResult struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(body, &errResult); err == nil && errResult.Message != "" {
			return nil, fmt.Errorf("获取访问令牌失败: %s", errResult.Message)
		}
		return nil, errors.New("获取访问令牌失败")
	}

	// Step 2: 获取用户信息
	userURL := "https://api.dingtalk.com/v1.0/contact/users/me"
	userReq, err := http.NewRequest(http.MethodGet, userURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建用户请求失败: %w", err)
	}
	userReq.Header.Set("X-Acs-Dingtalk-Access-Token", tokenResult.AccessToken)

	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, fmt.Errorf("请求用户信息失败: %w", err)
	}
	defer userResp.Body.Close()

	userBody, err := io.ReadAll(userResp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取用户信息响应失败: %w", err)
	}

	var userResult struct {
		Nick    string `json:"nick"`
		UnionID string `json:"unionId"`
		OpenID  string `json:"openId"`
	}
	if err := json.Unmarshal(userBody, &userResult); err != nil {
		return nil, fmt.Errorf("解析用户信息失败: %w", err)
	}

	if userResult.UnionID == "" {
		return nil, errors.New("获取用户信息失败: unionId为空")
	}

	return &DingTalkUserInfo{
		UserID: userResult.UnionID,
		Name:   userResult.Nick,
	}, nil
}
