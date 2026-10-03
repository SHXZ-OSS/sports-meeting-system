package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/api/routes"
	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
)

//go:embed all:web/dist
var staticFiles embed.FS

// getStaticFS 获取嵌入的静态文件系统
func getStaticFS() (fs.FS, error) {
	staticFS, err := fs.Sub(staticFiles, "web/dist")
	if err != nil {
		return nil, err
	}
	return staticFS, nil
}

func main() {
	// 加载配置
	if err := config.Load(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 初始化数据库
	if err := database.Initialize(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 确保上传目录存在
	uploadDir := "./data/uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatalf("Failed to create uploads directory: %v", err)
	}

	// 获取嵌入的静态文件系统
	staticFS, err := getStaticFS()
	if err != nil {
		log.Fatalf("Failed to get static files filesystem: %v", err)
	}

	// 设置路由
	router := routes.SetupRouter(staticFS)

	// 创建HTTP服务器
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", config.Get().Server.Port),
		Handler: router,
	}

	// 启动服务器
	go func() {
		log.Printf("Server is running on port %d", config.Get().Server.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// 关闭数据库连接
	if err := database.Close(); err != nil {
		log.Printf("Failed to close database: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

	if err := server.Shutdown(ctx); err != nil {
		cancel()
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	cancel()

	log.Println("Server exiting")
}
