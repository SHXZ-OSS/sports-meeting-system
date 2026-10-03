package utils

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// imageExtByMIME data URL 的 MIME 类型到文件扩展名的映射
var imageExtByMIME = map[string]string{
	"image/png":     ".png",
	"image/jpeg":    ".jpg",
	"image/webp":    ".webp",
	"image/gif":     ".gif",
	"image/svg+xml": ".svg",
}

// ImageContentType 根据文件扩展名返回图片的 Content-Type（未知类型按 JPEG 处理）
func ImageContentType(fileName string) string {
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	default:
		return "image/jpeg"
	}
}

// SaveBase64Image 保存Base64编码的图片。
// 扩展名根据 data URL 中的 MIME 类型推断（无前缀时按 JPEG 处理），
// 以保证静态文件服务返回正确的 Content-Type（SVG 等格式对 MIME 敏感）
func SaveBase64Image(base64Data, directory, prefix string, timestamp any) (string, error) {
	// 未传入图片
	if base64Data == "" {
		return "", nil
	}

	// 移除可能的Base64前缀，并据此推断扩展名
	encodedData := base64Data
	ext := ".jpg" // 无 data URL 前缀时保持旧行为
	if idx := strings.Index(base64Data, ";base64,"); idx > 0 {
		if e, ok := imageExtByMIME[base64Data[:idx]]; ok {
			ext = e
		}
		encodedData = base64Data[idx+8:]
	}

	// 解码Base64数据
	decodedData, err := base64.StdEncoding.DecodeString(encodedData)
	if err != nil {
		return "", err
	}

	// 判断文件大小
	if len(decodedData) > 10*1024*1024 { // 限制为10MB
		return "", errors.New("图片大小超过限制大小10MB")
	}

	// 创建目录
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", err
	}

	// 创建文件名
	fileName := fmt.Sprintf("%s_%v%s", prefix, timestamp, ext)
	filePath := filepath.Join(directory, fileName)

	// 保存图片
	if err := os.WriteFile(filePath, decodedData, 0o644); err != nil {
		return "", err
	}

	return fileName, nil
}
