package utils

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
)

// OIDCTokenResponse 令牌响应（仅取本系统用到的字段）
type OIDCTokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
}

// OIDCUserInfo 用户信息响应（标准 claim 子集）
type OIDCUserInfo struct {
	Sub               string `json:"sub"`
	PreferredUsername string `json:"preferred_username"`
	Name              string `json:"name"`
}

// BuildOIDCAuthURL 构建授权码流程的授权 URL（PKCE S256）
func BuildOIDCAuthURL(redirectURI, state, codeChallenge, scopes string) string {
	values := url.Values{}
	values.Set("response_type", "code")
	values.Set("client_id", config.Get().Oidc.ClientID)
	values.Set("redirect_uri", redirectURI)
	values.Set("scope", scopes)
	values.Set("state", state)
	values.Set("code_challenge", codeChallenge)
	values.Set("code_challenge_method", "S256")
	return config.Get().Oidc.AuthorizeURL + "?" + values.Encode()
}

// ExchangeOIDCCode 用授权码换取访问令牌
func ExchangeOIDCCode(ctx context.Context, code, redirectURI, codeVerifier string) (*OIDCTokenResponse, error) {
	cfg := config.Get()

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", cfg.Oidc.ClientID)
	form.Set("client_secret", cfg.Oidc.ClientSecret)
	form.Set("code_verifier", codeVerifier)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.Oidc.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 OIDC 令牌端点失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("换取 OIDC 令牌失败，状态码 %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	token := &OIDCTokenResponse{}
	if err := json.NewDecoder(resp.Body).Decode(token); err != nil {
		return nil, fmt.Errorf("解析 OIDC 令牌响应失败: %w", err)
	}
	if token.AccessToken == "" {
		return nil, errors.New("OIDC 令牌响应缺少 access_token")
	}
	return token, nil
}

// GetOIDCUserInfo 通过访问令牌获取用户信息
func GetOIDCUserInfo(ctx context.Context, accessToken string) (*OIDCUserInfo, error) {
	cfg := config.Get()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.Oidc.UserinfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 OIDC 用户信息端点失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("获取 OIDC 用户信息失败，状态码 %d", resp.StatusCode)
	}

	userInfo := &OIDCUserInfo{}
	if err := json.NewDecoder(resp.Body).Decode(userInfo); err != nil {
		return nil, fmt.Errorf("解析 OIDC 用户信息失败: %w", err)
	}
	if userInfo.PreferredUsername == "" {
		return nil, errors.New("OIDC 用户信息缺少 preferred_username")
	}
	return userInfo, nil
}

// GenerateOIDCPKCE 生成 PKCE 的 state 与 code_verifier，及 S256 code_challenge
func GenerateOIDCPKCE() (string, string, string, error) {
	state, err := GenerateSecureToken(16)
	if err != nil {
		return "", "", "", err
	}
	verifier, err := GenerateSecureToken(32)
	if err != nil {
		return "", "", "", err
	}
	challengeHash := sha256.Sum256([]byte(verifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(challengeHash[:])
	return state, verifier, codeChallenge, nil
}
