// Package logger 提供全局结构化日志器
package logger

import (
	"log/slog"
	"os"
)

// L 全局日志器实例（不使用 slog 默认全局 logger，便于统一配置输出格式与级别）
var L = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))
