## 1. 依赖与配置

- [x] 1.1 `go mod tidy` 前：`go get github.com/golang-jwt/jwt/v5 github.com/rs/zerolog github.com/mojocn/base64Captcha github.com/google/uuid`
- [x] 1.2 移除 `github.com/dgrijalva/jwt-go` 引用；`go.mod` 里删掉
- [x] 1.3 在 `config/config.go` 加入 `Server.Production`、`Security.AccessTokenTTLSeconds`、`Security.RefreshTokenTTLSeconds`、`Security.RefreshCookieName`、`Security.AllowInsecureCookie`、`Logging.Format`；补上默认值
- [ ] 1.4 `config.Save` 与 `PUT /api/admin/settings`：production 模式下走白名单校验（`ProductionAllowedSettingsKeys` 已就位，enforce 留给批 2 的 settings handler）
- [x] 1.5 启动检查：production 模式对 JWT secret 做严格校验（见 auth-hardening spec）

## 2. 数据模型

- [x] 2.1 `types/refresh_session.go` 定义 `RefreshSession` 模型
- [x] 2.2 `types/audit_log.go` 定义 `AuditLog` 模型
- [x] 2.3 `database/db.go` 的 AutoMigrate 追加两张新表；给 `refresh_sessions.token_hash` 建唯一索引
- [x] 2.4 `models/refresh_session.go` 提供 `Create/GetByHash/Touch/DeleteByHash/DeleteByUser/DeleteByUserExcept/ListByUser/DeleteExpired`
- [x] 2.5 `models/audit_log.go` 提供 `Write(ctx, action, target_type, target_id, detail)`（内部异步；写库失败仅 WARN）

## 3. 认证核心

- [x] 3.1 重写 `services/auth_service.go`：改用 jwt/v5；提取 `GenerateAccessToken / ValidateAccessToken`
- [x] 3.2 新建 `services/refresh_service.go`：`Issue(userID, role, ip, ua) → (rawToken, session)`、`Refresh(rawToken) → newAccess`、`Revoke(rawToken) / RevokeAllExcept`
- [x] 3.3 新建 `services/captcha_service.go`：封装 `mojocn/base64Captcha` 数字验证码
- [x] 3.4 新建 `services/limiter_service.go`：内存双维限流器（用户名 / IP），阈值走 spec；预留 `Limiter` interface（命名为 `ratelimit_service.go`）

## 4. Handler

- [ ] 4.1 重写 `api/handlers/auth.go`：`Login` 接入限流、验证码、写 refresh cookie；`captcha_required` 结构化返回
- [ ] 4.2 新增 `api/handlers/session.go`：`Refresh` / `Logout` / `ListSessions` / `RevokeSession`
- [ ] 4.3 新增 `GET /api/captcha` 端点（在 routes 里挂公开路由）
- [ ] 4.4 `POST /api/change_password` 成功后调 `RevokeAllExcept(currentSessionHash)` + 写 audit
- [ ] 4.5 关键管理动作 handler 里补 `audit_log.Write(...)`（列表见 input-safety spec）

## 5. 中间件与错误处理

- [x] 5.1 新增 `api/middlewares/request_id.go`：读或生成 `X-Request-ID`，绑定 zerolog logger 到 ctx
- [x] 5.2 新增 `api/middlewares/recovery.go`：panic 兜底 → 500 JSON + request_id + error 日志
- [x] 5.3 改造 `utils/response.go`：`ResponseError` 从 ctx 取 request_id 填进 body
- [x] 5.4 `api/middlewares/auth.go`：token 校验统一走新版 `ValidateAccessToken`

## 6. 日志与健康检查

- [ ] 6.1 `main.go` 初始化 zerolog（读 `logging.format`）；替换所有 `log.Println / log.Printf` 到 zerolog（保留首启初始密码打印但换成 zerolog Warn）
- [ ] 6.2 新增 `GET /healthz`：db ping + version + uptime；无鉴权
- [ ] 6.3 `main.go` 注入 build 时的 `Version` 字符串（`-ldflags "-X main.Version=..."`）

## 7. 上传安全

- [ ] 7.1 改写 `utils/image.go` 的 `SaveBase64Image`：MIME 白名单 + 5 MB 限制 + uuid 文件名
- [ ] 7.2 更新调用点（`competition.go` 里两处）：不再需要 `fileprefix`，直接接受返回值
- [ ] 7.3 单测：非图 MIME、超大、并发同秒都覆盖

## 8. dev-experience

- [ ] 8.1 拆 `main.go`：非嵌入版 `main.go` 提供 stub `getStaticFS`；`main_embed.go`（带 `//go:build embed`）走真嵌入；`main_stub.go`（带 `//go:build !embed`）返回 nil，不注册静态路由
- [ ] 8.2 `routes.SetupRouter` 接受 `staticFS fs.FS`（可为 nil）；nil 时跳过 NoRoute 与静态挂载
- [x] 8.3 修 `services/mapping_service.go` 里 `fmt.Errorf(errMsg)` 为 `errors.New(errMsg)`（等价，vet 通过）
- [ ] 8.4 `Makefile`（根目录）：`dev / build / test / lint` 目标
- [ ] 8.5 README 补 Windows PowerShell 等价命令与"升级须知"
- [ ] 8.6 生产模式配置 hot-reload 白名单校验

## 9. 后端单测

- [ ] 9.1 `utils/permissions_test.go`：AddPermission/HasPermission/HasMorePermissions/CountPermissions 边界
- [ ] 9.2 `utils/validation_test.go`：IsTimeInRange 三段窗、Validate 报名的 gender / max 等分支
- [ ] 9.3 `services/auth_service_test.go`：JWT v5 签发/校验/过期/错密钥/错签名方法
- [ ] 9.4 `services/refresh_service_test.go`：内存 SQLite 建表 → Issue/Refresh/Revoke 幂等
- [ ] 9.5 `services/limiter_service_test.go`：`(username)` / `(ip)` 双维阈值 + 过期恢复

## 10. 前端 auth-ux

- [ ] 10.1 `web/src/api/client.ts`：response interceptor 处理 401 → 清 token → `/login?next=<current>`
- [ ] 10.2 `web/src/pages/Login.tsx`：读 URL `next`；仅接受以 `/` 开头的路径；接受 `captcha_required` 字段联动图形验证码组件
- [ ] 10.3 新增 `web/src/components/CaptchaImage.tsx`：从 `/api/captcha` 拉图，点击刷新
- [ ] 10.4 SSO 回调错误改走 sessionStorage → 登录页 useEffect 里 Modal.error 展示
- [ ] 10.5 改密页 (admin/student) 成功回调：message.success 提示"其它设备已登出"
- [ ] 10.6 admin 个人中心新增"登录会话"分区：列表 + 撤销按钮，绑到 `/api/auth/sessions*`

## 11. 联调与验收

- [ ] 11.1 `go build ./...` 与 `go test ./...` 全绿
- [x] 11.2 `go vet ./...` 无告警（批 1 完成时点）
- [ ] 11.3 `pnpm --dir web build` 全绿
- [ ] 11.4 端到端手测：登录 → 刷新 → 改密 → 其它设备 401 → 会话列表撤销
- [ ] 11.5 端到端手测：连续 3 次错密码要求验证码；5 次锁 5 分钟
- [ ] 11.6 端到端手测：panic 路径返回 500 JSON 带 request_id
- [ ] 11.7 端到端手测：`go build`（无 embed tag）能成功，`/api/healthz` 可访问；`go build -tags embed` 产物内嵌前端
- [ ] 11.8 db 里 `audit_logs` 有登录 / 改密 / 审核记录；`refresh_sessions` 数量正常增减
