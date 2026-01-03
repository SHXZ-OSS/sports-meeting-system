package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
)

// DingTalkToken 钉钉访问令牌结构
type DingTalkToken struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ExpiresAt   time.Time
}

var (
	dingTalkToken *DingTalkToken
)

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
		return "", fmt.Errorf("钉钉配置不完整")
	}

	// 请求URL
	url := fmt.Sprintf("https://oapi.dingtalk.com/gettoken?appkey=%s&appsecret=%s", appKey, appSecret)

	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		// 如果不是第一次尝试，等待一段时间再重试
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			log.Printf("重试获取钉钉访问令牌，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime)
		}

		// 发送请求
		resp, err := http.Get(url)
		if err != nil {
			lastErr = fmt.Errorf("failed to request DingTalk token: %v", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %v", err)
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
			lastErr = fmt.Errorf("failed to parse response: %v", err)
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

	return "", fmt.Errorf("获取钉钉访问令牌失败，已重试 %d 次: %v", maxRetries, lastErr)
}

// GetDingTalkUserInfo 获取钉钉用户信息
func GetDingTalkUserInfo(code string) (*DingTalkUserInfo, error) {
	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		// 如果不是第一次尝试，等待一段时间再重试
		// 等待时间随着重试次数增加而增加 (500ms, 1000ms, 2000ms)
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			log.Printf("重试获取钉钉用户信息，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime)
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
		resp, err := http.Get(url)
		if err != nil {
			lastErr = fmt.Errorf("failed to request DingTalk user info: %v", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %v", err)
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
			lastErr = fmt.Errorf("failed to parse response: %v", err)
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

	return nil, fmt.Errorf("获取钉钉用户信息失败，已重试 %d 次: %v", maxRetries, lastErr)
}

// DingTalkUserInfo 钉钉用户信息结构
type DingTalkUserInfo struct {
	UserID   string `json:"userid"`
	Name     string `json:"name"`
	DeviceID string `json:"deviceId"`
}

// DingTalkGuardianStudentRel 家长学生关系结构
type DingTalkGuardianStudentRel struct {
	GuardianUserID string `json:"guardian_userid"`
	Relation       string `json:"relation"`
	StudentUserId  string `json:"student_userid"`
}

// GetAllClassIDs 获取所有班级的ID
func GetAllClassIDs(addMappingLog func(string)) ([]string, error) {
	// 获取访问令牌
	accessToken, err := GetDingTalkToken()
	if err != nil {
		return nil, err
	}

	// 存储所有班级ID
	var classIDs []string

	// 从根部门开始递归查找班级
	err = findClassDepartments(accessToken, 0, &classIDs, addMappingLog)
	if err != nil {
		return nil, err
	}

	return classIDs, nil
}

// findClassDepartments 递归查找班级部门
func findClassDepartments(accessToken string, superID int, classIDs *[]string, addMappingLog func(string)) error {
	// 请求URL
	url := "https://oapi.dingtalk.com/topapi/edu/dept/list"

	// 构建请求数据
	data := map[string]interface{}{
		"page_size": 30,
		"page_no":   1,
	}

	// 只有非0的superID才需要添加
	if superID > 0 {
		data["super_id"] = superID
	}

	// 处理分页
	hasMore := true
	pageNo := 1

	for hasMore {
		data["page_no"] = pageNo
		jsonData, err := json.Marshal(data)
		if err != nil {
			return fmt.Errorf("编码请求失败: %v", err)
		}

		// 最大重试次数
		maxRetries := 3
		var lastErr error
		var result struct {
			ErrCode int    `json:"errcode"`
			ErrMsg  string `json:"errmsg"`
			Success bool   `json:"success"`
			Result  struct {
				HasMore bool `json:"has_more"`
				SuperID int  `json:"super_id"`
				Details []struct {
					DeptID   int    `json:"dept_id"`
					DeptType string `json:"dept_type"`
					Name     string `json:"name"`
				} `json:"details"`
			} `json:"result"`
		}

		// 重试逻辑
		for attempt := 0; attempt < maxRetries; attempt++ {
			// 如果不是第一次尝试，等待一段时间再重试
			if attempt > 0 {
				backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
				time.Sleep(backoffTime)
				log.Printf("重试获取部门列表，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime)
			} else {
				// 第一次请求也要有延迟，避免QPS限制
				time.Sleep(500 * time.Millisecond)
			}

			// 发送请求
			req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
			if err != nil {
				lastErr = fmt.Errorf("创建请求失败: %v", err)
				continue
			}

			req.Header.Set("Content-Type", "application/json")
			q := req.URL.Query()
			q.Add("access_token", accessToken)
			req.URL.RawQuery = q.Encode()

			client := &http.Client{}
			resp, err := client.Do(req)
			if err != nil {
				lastErr = fmt.Errorf("发送请求失败: %v", err)
				continue
			}

			// 读取响应
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				lastErr = fmt.Errorf("读取响应失败: %v", err)
				continue
			}

			// 解析响应
			if err := json.Unmarshal(body, &result); err != nil {
				lastErr = fmt.Errorf("解析响应失败: %v", err)
				continue
			}

			// 如果是QPS超限错误，进行重试
			if result.ErrCode == 88 || result.ErrCode == -1 {
				lastErr = fmt.Errorf("DingTalk API QPS limit: %s (code: %d)", result.ErrMsg, result.ErrCode)
				continue
			}

			// 检查响应是否成功
			if !result.Success || result.ErrCode != 0 {
				// 如果是无数据，直接返回
				if result.ErrCode == 60123 {
					return nil
				}
				return fmt.Errorf("钉钉API错误: %s (代码: %d)", result.ErrMsg, result.ErrCode)
			}

			// 成功，跳出重试循环
			break
		}

		// 如果重试后仍然失败
		if result.ErrCode != 0 && result.ErrCode != 60123 {
			return fmt.Errorf("获取部门列表失败，已重试 %d 次: %v", maxRetries, lastErr)
		}

		// 处理当前页的部门
		for _, dept := range result.Result.Details {
			if dept.DeptType == "class" {
				// 如果是班级，添加到班级列表
				*classIDs = append(*classIDs, strconv.Itoa(dept.DeptID))
				addMappingLog(fmt.Sprintf("发现班级: ID=%d, 名称=%s", dept.DeptID, dept.Name))
			} else {
				// 如果不是班级，递归查找子部门
				addMappingLog(fmt.Sprintf("发现部门: ID=%d, 名称=%s, 类型=%s", dept.DeptID, dept.Name, dept.DeptType))
				err = findClassDepartments(accessToken, dept.DeptID, classIDs, addMappingLog)
				if err != nil {
					addMappingLog(fmt.Sprintf("获取部门ID=%d的子部门失败: %v", dept.DeptID, err))
					// 继续处理其他部门，不中断整个过程
				}
			}
		}

		// 检查是否有更多页
		hasMore = result.Result.HasMore
		pageNo++
	}

	return nil
}

// GetClassParentStudentRelations 获取指定班级的所有家长-学生关系
func GetClassParentStudentRelations(classID string) ([]DingTalkGuardianStudentRel, error) {
	// 获取访问令牌
	accessToken, err := GetDingTalkToken()
	if err != nil {
		return nil, err
	}

	// 存储所有找到的关系
	var allRelations []DingTalkGuardianStudentRel

	// 分页获取数据
	pageNo := 1
	hasMore := true

	for hasMore {
		// 请求URL
		url := "https://oapi.dingtalk.com/topapi/edu/user/relation/list"

		// 构建请求数据
		data := map[string]interface{}{
			"class_id":  classID,
			"page_size": 30,
			"page_no":   pageNo,
		}

		jsonData, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("编码请求失败: %v", err)
		}

		// 最大重试次数
		maxRetries := 3
		var lastErr error
		var result struct {
			ErrCode int    `json:"errcode"`
			ErrMsg  string `json:"errmsg"`
			Success bool   `json:"success"`
			Result  struct {
				HasMore   bool `json:"has_more"`
				Relations []struct {
					ClassID      int    `json:"class_id"`
					FromUserid   string `json:"from_userid"`
					RelationCode string `json:"relation_code"`
					RelationName string `json:"relation_name"`
					ToUserid     string `json:"to_userid"`
				} `json:"relations"`
			} `json:"result"`
		}

		// 重试逻辑
		for attempt := 0; attempt < maxRetries; attempt++ {
			// 如果不是第一次尝试，等待一段时间再重试
			if attempt > 0 {
				backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
				time.Sleep(backoffTime)
				log.Printf("重试获取家长-学生关系，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime)
			} else {
				// 第一次请求也要有延迟，避免QPS限制
				time.Sleep(500 * time.Millisecond)
			}

			// 发送请求
			req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
			if err != nil {
				lastErr = fmt.Errorf("创建请求失败: %v", err)
				continue
			}

			req.Header.Set("Content-Type", "application/json")
			q := req.URL.Query()
			q.Add("access_token", accessToken)
			req.URL.RawQuery = q.Encode()

			client := &http.Client{}
			resp, err := client.Do(req)
			if err != nil {
				lastErr = fmt.Errorf("发送请求失败: %v", err)
				continue
			}

			// 读取响应
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				lastErr = fmt.Errorf("读取响应失败: %v", err)
				continue
			}

			// 解析响应
			if err := json.Unmarshal(body, &result); err != nil {
				lastErr = fmt.Errorf("解析响应失败: %v", err)
				continue
			}

			// 如果是QPS超限错误，进行重试
			if result.ErrCode == 88 || result.ErrCode == -1 {
				lastErr = fmt.Errorf("DingTalk API QPS limit: %s (code: %d)", result.ErrMsg, result.ErrCode)
				continue
			}

			// 检查响应是否成功
			if !result.Success || result.ErrCode != 0 {
				// 如果是无数据，直接返回空结果
				if result.ErrCode == 60123 {
					return []DingTalkGuardianStudentRel{}, nil
				}
				return nil, fmt.Errorf("钉钉API错误: %s (代码: %d)", result.ErrMsg, result.ErrCode)
			}

			// 成功，跳出重试循环
			break
		}

		// 如果重试后仍然失败
		if result.ErrCode != 0 && result.ErrCode != 60123 {
			return nil, fmt.Errorf("获取家长-学生关系失败，已重试 %d 次: %v", maxRetries, lastErr)
		}

		// 添加获取到的关系
		for _, rel := range result.Result.Relations {
			relation := DingTalkGuardianStudentRel{
				GuardianUserID: rel.FromUserid,
				Relation:       rel.RelationName,
				StudentUserId:  rel.ToUserid,
			}
			allRelations = append(allRelations, relation)
		}

		// 检查是否有更多数据
		hasMore = result.Result.HasMore
		if hasMore {
			pageNo++
		}
	}

	return allRelations, nil
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
			end := i + 100
			if end > len(userIDs) {
				end = len(userIDs)
			}
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
	data := map[string]interface{}{
		"agent_id":    agentID,
		"userid_list": strings.Join(userIDs, ","),
		"msg": map[string]interface{}{
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
		return fmt.Errorf("failed to encode request: %v", err)
	}

	// 请求URL
	url := fmt.Sprintf("https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=%s", accessToken)

	// 最大重试次数
	maxRetries := 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		// 如果不是第一次尝试，等待一段时间再重试
		if attempt > 0 {
			backoffTime := time.Duration(500*1<<uint(attempt-1)) * time.Millisecond
			time.Sleep(backoffTime)
			log.Printf("重试发送钉钉卡片消息，第 %d 次尝试, 等待时间: %v", attempt+1, backoffTime)
		}

		// 发送请求
		resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
		if err != nil {
			lastErr = fmt.Errorf("failed to send DingTalk action card: %v", err)
			continue
		}

		// 读取响应
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %v", err)
			continue
		}

		// 解析响应
		var result struct {
			ErrCode int    `json:"errcode"`
			ErrMsg  string `json:"errmsg"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			lastErr = fmt.Errorf("failed to parse response: %v", err)
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

	return fmt.Errorf("发送钉钉卡片消息失败，已重试 %d 次: %v", maxRetries, lastErr)
}

// GetDingTalkSSOUserInfo 通过SSO OAuth2授权码获取钉钉用户信息
// 用于非钉钉客户端环境下的登录
func GetDingTalkSSOUserInfo(code string) (*DingTalkUserInfo, error) {
	cfg := config.Get()
	clientID := cfg.DingTalk.AppKey       // AppKey 即为 ClientID
	clientSecret := cfg.DingTalk.AppSecret // AppSecret 即为 ClientSecret

	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("钉钉SSO配置不完整")
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

	req, err := http.NewRequest("POST", tokenURL, bytes.NewBuffer(tokenBodyBytes))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求用户令牌失败: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %v", err)
	}

	var tokenResult struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
		ExpireIn     int    `json:"expireIn"`
		CorpId       string `json:"corpId"`
	}
	if err := json.Unmarshal(body, &tokenResult); err != nil {
		return nil, fmt.Errorf("解析令牌响应失败: %v", err)
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
		return nil, fmt.Errorf("获取访问令牌失败")
	}

	// Step 2: 获取用户信息
	userURL := "https://api.dingtalk.com/v1.0/contact/users/me"
	userReq, err := http.NewRequest("GET", userURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建用户请求失败: %v", err)
	}
	userReq.Header.Set("x-acs-dingtalk-access-token", tokenResult.AccessToken)

	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, fmt.Errorf("请求用户信息失败: %v", err)
	}
	defer userResp.Body.Close()

	userBody, err := io.ReadAll(userResp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取用户信息响应失败: %v", err)
	}

	var userResult struct {
		Nick    string `json:"nick"`
		UnionId string `json:"unionId"`
		OpenId  string `json:"openId"`
	}
	if err := json.Unmarshal(userBody, &userResult); err != nil {
		return nil, fmt.Errorf("解析用户信息失败: %v", err)
	}

	if userResult.UnionId == "" {
		return nil, fmt.Errorf("获取用户信息失败: unionId为空")
	}

	return &DingTalkUserInfo{
		UserID: userResult.UnionId,
		Name:   userResult.Nick,
	}, nil
}

// LogError 记录错误信息到日志
func LogError(message string) {
	log.Printf("ERROR: %s", message)
}
