package logger

import (
	"io"
	"log/slog"
)

// GinWriter 返回一个实现 [io.Writer] 的对象，用于接管 Gin 的日志输出
func GinWriter() io.Writer {
	return &ginWriter{l: L}
}

type ginWriter struct {
	l *slog.Logger
}

func (w *ginWriter) Write(p []byte) (int, error) {
	// 去掉末尾换行符，交由 slog 统一结构化输出
	msg := string(p)
	if len(msg) > 0 && msg[len(msg)-1] == '\n' {
		msg = msg[:len(msg)-1]
	}
	w.l.Info(msg)
	return len(p), nil
}
