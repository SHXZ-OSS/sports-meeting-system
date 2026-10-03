package utils

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SaveBase64Image 保存Base64编码的图片
func SaveBase64Image(base64Data, directory, prefix string, timestamp any) (string, error) {
	// 未传入图片
	if base64Data == "" {
		return "", nil
	}

	// 移除可能的Base64前缀
	encodedData := base64Data
	if idx := strings.Index(base64Data, ";base64,"); idx > 0 {
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
	fileName := fmt.Sprintf("%s_%v.jpg", prefix, timestamp)
	filePath := filepath.Join(directory, fileName)

	// 保存图片
	if err := os.WriteFile(filePath, decodedData, 0o644); err != nil {
		return "", err
	}

	return fileName, nil
}
