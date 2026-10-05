package utils

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response HTTP响应结构
type Response struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// PaginatedResponse 分页响应结构
type PaginatedResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	Total   int    `json:"total"`
	Page    int    `json:"page"`
	Size    int    `json:"size"`
}

// ResponseOK 成功响应
func ResponseOK(c *gin.Context, data any) {
	response := Response{
		Code:    200,
		Message: "成功",
		Data:    data,
	}
	c.JSON(http.StatusOK, response)
}

// ResponseSuccessWithCustomMessage 成功响应，带自定义消息
func ResponseSuccessWithCustomMessage(c *gin.Context, message string) {
	response := Response{
		Code:    200,
		Message: message,
	}
	c.JSON(http.StatusOK, response)
}

// ResponsePaginated 分页成功响应
func ResponsePaginated(c *gin.Context, data any, total, page, size int) {
	response := PaginatedResponse{
		Code:    200,
		Message: "成功",
		Data:    data,
		Total:   total,
		Page:    page,
		Size:    size,
	}
	c.JSON(http.StatusOK, response)
}

// ResponseError 错误响应
func ResponseError(c *gin.Context, httpStatus int, message string) {
	response := Response{
		Code:    httpStatus,
		Message: message,
	}
	c.JSON(http.StatusOK, response) // 始终返回200状态码
}

// ResponseErrorByHTMLAlert 以 HTML Alert 弹窗形式返回错误（用于浏览器直接访问的 API 404 等场景）
func ResponseErrorByHTMLAlert(c *gin.Context, httpStatus int, message string) {
	c.Header("X-App-Error", message)
	msgJSON, _ := json.Marshal(message)
	html := `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>` +
		`alert(` + string(msgJSON) + `);window.history.back();` +
		`</script></body></html>`
	c.Data(httpStatus, "text/html; charset=utf-8", []byte(html))
	c.Abort()
}
