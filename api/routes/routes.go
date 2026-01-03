package routes

import (
	"io"
	"io/fs"
	"net/http"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/api/handlers"
	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
	"github.com/gin-gonic/gin"
)

func getStaticFSHandler(staticFS fs.FS, path string) gin.HandlerFunc {
	return func(c *gin.Context) {
		content, err := staticFS.Open(path)
		if err != nil {
			c.String(http.StatusNotFound, "Not found")
			return
		}
		defer content.Close()
		http.ServeContent(c.Writer, c.Request, path, time.Time{}, content.(io.ReadSeeker))
	}
}

// SetupRouter 设置路由
func SetupRouter(staticFS fs.FS) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// API 路由
	api := r.Group("/api")

	// 公开API路由（游客访问）
	public := api.Group("/public")
	public.GET("/website_info", handlers.GetWebsiteInfo)
	// 钉钉SSO登录路由
	public.GET("/dingtalk/sso_redirect", handlers.DingTalkSSORedirect)
	public.GET("/dingtalk/sso_callback", handlers.DingTalkSSOCallback)

	// 看板相关API路由
	dashboard := public.Group("")
	dashboard.Use(middlewares.DashboardMiddleware())
	dashboard.GET("/competitions", handlers.GetAllPublicCompetitions)
	dashboard.GET("/competitions/:id", handlers.GetPublicCompetition)
	dashboard.GET("/competitions/:id/scores", handlers.GetPublicCompetitionScores)
	dashboard.GET("/competitions/:id/registrations", handlers.GetCompetitionRegistrationsForPublic)
	dashboard.GET("/scores/student/:id", handlers.GetStudentScoresById)
	dashboard.GET("/statistics", handlers.GetStatistics)
	// 得分相关（公开）
	dashboard.GET("/points/classes/summary", handlers.GetClassPointsSummary)
	dashboard.GET("/points/students/summary", handlers.GetStudentPointsSummary)
	dashboard.GET("/points/classes/:id/details", handlers.GetClassPointDetails)
	dashboard.GET("/points/students/:id/details", handlers.GetStudentPointDetails)

	// 认证API路由
	api.POST("/login", handlers.Login)
	api.POST("/dingtalk/login", handlers.DingTalkLogin)

	// 需要身份验证的API路由
	secured := api.Group("")
	secured.Use(middlewares.AuthMiddleware())

	// 管理员API路由
	adminAPI := secured.Group("/admin")
	adminAPI.Use(middlewares.AdminMiddleware())

	// 用户管理（需要用户管理权限）
	userMgmt := adminAPI.Group("/users")
	userMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionUserManagement))
	userMgmt.GET("", handlers.GetAllUsers)
	userMgmt.POST("", handlers.CreateUser)
	userMgmt.GET("/:id", handlers.GetUser)
	userMgmt.PUT("/:id", handlers.UpdateUser)
	userMgmt.DELETE("/:id", handlers.DeleteUser)
	userMgmt.GET("/classes", handlers.GetAllClasses)

	// 学生与班级管理（需要学生管理权限）
	studentMgmt := adminAPI.Group("/students")
	studentMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionStudentAndClassManagement))
	studentMgmt.GET("", handlers.GetAllStudents)
	studentMgmt.POST("", handlers.CreateStudent)
	studentMgmt.GET("/:id", handlers.GetStudent)
	studentMgmt.PUT("/:id", handlers.UpdateStudent)
	studentMgmt.DELETE("/:id", handlers.DeleteStudent)
	studentMgmt.POST("/:id/reset_password", handlers.ResetStudentPassword)

	classMgmt := adminAPI.Group("/classes")
	classMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionStudentAndClassManagement))
	classMgmt.GET("", handlers.GetAllClasses)
	classMgmt.POST("", handlers.CreateClass)
	classMgmt.GET("/:id", handlers.GetClass)
	classMgmt.PUT("/:id", handlers.UpdateClass)
	classMgmt.DELETE("/:id", handlers.DeleteClass)

	// 项目管理（需要项目管理权限）
	projectMgmt := adminAPI.Group("/competitions")
	projectMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionProjectManagement))
	projectMgmt.POST("", handlers.CreateCompetition)
	projectMgmt.GET("", handlers.GetAllCompetitions)
	projectMgmt.GET("/:id", handlers.GetCompetition)
	projectMgmt.DELETE("/:id", handlers.DeleteCompetition)
	projectMgmt.PUT("/:id", handlers.UpdateCompetition)
	projectMgmt.POST("/:id/approve", handlers.ApproveCompetition)
	projectMgmt.POST("/:id/reject", handlers.RejectCompetition)
	projectMgmt.GET("/:id/registrations", handlers.GetCompetitionRegistrations)

	// 报名管理（需要报名管理权限）
	registrationMgmt := adminAPI.Group("/registrations")
	registrationMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionRegistrationManagement))
	registrationMgmt.GET("/competitions", handlers.GetAllCompetitions)                            // 获取项目列表
	registrationMgmt.GET("/competitions/:id/registrations", handlers.GetCompetitionRegistrations) // 获取特定项目报名
	registrationMgmt.GET("/students", handlers.GetAllStudents)                                    // 获取学生列表
	registrationMgmt.GET("/classes", handlers.GetAllClasses)                                      // 获取班级列表
	registrationMgmt.POST("/register", handlers.RegisterForCompetitionForAdmin)                   // 为学生报名
	registrationMgmt.DELETE("/unregister/:id", handlers.UnregisterFromCompetitionForAdmin)        // 取消学生报名
	registrationMgmt.GET("/checklist", handlers.GetCompetitionChecklist)                          // 检查清单

	// 成绩管理
	scoreMgmt := adminAPI.Group("/scores")

	// 成绩提交（需要成绩提交权限）
	scoreInput := scoreMgmt.Group("/input")
	scoreInput.Use(middlewares.PermissionMiddleware(utils.PermissionScoreInput))
	scoreInput.GET("/competitions", handlers.GetAllCompetitions)
	scoreInput.GET("/:id/registrations", handlers.GetCompetitionRegistrations)
	scoreInput.POST("", handlers.CreateOrUpdateScores)
	scoreInput.GET("/:id", handlers.GetCompetitionScores)
	scoreInput.DELETE("/:id", handlers.DeleteScores)

	// 成绩审核（需要成绩审核权限）
	scoreReview := scoreMgmt.Group("/review")
	scoreReview.Use(middlewares.PermissionMiddleware(utils.PermissionScoreReview))
	scoreReview.GET("/competitions", handlers.GetAllCompetitions)
	scoreReview.GET("/:id", handlers.GetCompetitionScores)
	scoreReview.POST("", handlers.ReviewScores)

	// 得分管理（需要项目管理权限）
	pointsMgmt := adminAPI.Group("/points")
	pointsMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionProjectManagement))
	pointsMgmt.POST("/classes/custom", handlers.AddCustomPointsToClass)
	pointsMgmt.DELETE("/custom/:id", handlers.DeleteCustomPoint)
	pointsMgmt.GET("/classes/summary", handlers.GetClassPointsSummary)
	pointsMgmt.GET("/students/summary", handlers.GetStudentPointsSummary)
	pointsMgmt.GET("/classes/:id/summary", handlers.GetClassPointsSummaryByID)
	pointsMgmt.GET("/students/:id/summary", handlers.GetStudentPointsSummaryByID)
	pointsMgmt.GET("/classes/:id/details", handlers.GetClassPointDetails)
	pointsMgmt.GET("/students/:id/details", handlers.GetStudentPointDetails)

	// 系统设置（需要网站管理权限）
	websiteMgmt := adminAPI.Group("/settings")
	websiteMgmt.Use(middlewares.PermissionMiddleware(utils.PermissionWebsiteManagement))
	websiteMgmt.GET("", handlers.GetSettings)
	websiteMgmt.PUT("", handlers.UpdateSettings)
	// 危险API
	websiteMgmt.POST("/rebuild-mapping", handlers.RebuildParentStudentMapping)
	websiteMgmt.GET("/rebuild-mapping/logs", handlers.GetMappingLogs)
	// 运动会届次管理
	websiteMgmt.GET("/events", handlers.GetEvents)
	websiteMgmt.POST("/events", handlers.CreateEvent)
	websiteMgmt.PUT("/events/:id", handlers.UpdateEvent)
	websiteMgmt.DELETE("/events/:id", handlers.DeleteEvent)
	websiteMgmt.POST("/events/:id/switch", handlers.SwitchEvent)

	// 学生API路由
	studentAPI := secured.Group("/student")
	studentAPI.Use(middlewares.StudentMiddleware())

	// 学生功能（学生在提交推荐项目后不能进行修改与删除）
	studentAPI.POST("/competitions", handlers.CreateCompetition)                       // 提交推荐项目
	studentAPI.GET("/competitions", handlers.GetAllEligibleCompetitions)               // 获取项目列表
	studentAPI.GET("/registrations", handlers.GetStudentRegistrations)                 // 获取报名记录
	studentAPI.POST("/register", handlers.RegisterForCompetitionForStudent)            // 报名项目
	studentAPI.DELETE("/unregister/:id", handlers.UnregisterFromCompetitionForStudent) // 取消报名
	studentAPI.GET("/scores", handlers.GetStudentScores)                               // 获取个人成绩
	studentAPI.POST("/vote", handlers.VoteCompetition)                                 // 投票
	studentAPI.GET("/votes", handlers.GetStudentVotes)                                 // 获取投票记录
	studentAPI.GET("/points/summary", handlers.GetMyPointsSummary)                     // 获取个人得分和排名

	// 静态文件服务
	rootStaticFiles := []string{
		"robots.txt",
		"favicon.svg",
		"logo192.png",
		"logo512.png",
		"asset-manifest.json",
		"apple-touch-icon.png",
		"effect.mp3",
		"SourceHanSansCN-Medium.ttf",
	}

	// 为每个静态文件注册路由
	for _, file := range rootStaticFiles {
		r.GET("/"+file, getStaticFSHandler(staticFS, file))
	}

	// 上传文件服务
	r.Static("/uploads", "./data/uploads")

	// 静态资源服务
	assetsFS, _ := fs.Sub(staticFS, "assets")
	r.GET("/assets/*filepath", gin.WrapH(http.StripPrefix("/assets/", http.FileServer(http.FS(assetsFS)))))

	// PWA manifest 服务
	r.GET("/manifest.webmanifest", handlers.GetManifest)

	// 所有其他请求都指向前端入口点
	r.NoRoute(getStaticFSHandler(staticFS, "index.html"))

	return r
}
