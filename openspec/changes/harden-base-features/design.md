## Context

`sports-meeting-system` 是学校内部单实例部署的 Go 服务，SQLite 单库、Gin + GORM + 嵌入前端。这次基础加固不重写业务，只把**认证 / 可观测性 / 输入安全 / 开发体验 / 前端登录 UX** 五条主线上的漏补齐。约束：

- 部署环境是校内单机（往往是一台学生管的服务器），不能引入 Redis / MySQL / 集群依赖
- 库里已有大量线上数据，`AutoMigrate` 加字段/表可以，但不能重命名或删列
- 前端已经用 antd 6 + React 19 + 自研 `HandleResp`，UX 改动要尊重既有 pattern
- 学生 / 家长 / 管理员三种身份共用 `/api/login` 与钉钉 SSO；本轮不改身份模型

## Goals / Non-Goals

**Goals:**
- 干掉已归档的 JWT 依赖，把认证升级到"短 access + refresh 落库 + 会话可查可撤销"标准姿势
- 让登录接口对暴力破解有基本抵抗力（限流 + 验证码）
- 让线上出问题能看得见（结构化日志、请求 id、健康检查、panic 兜底）
- 让新贡献者 `git clone` 后能一条命令跑起来（不再被"没有 web/dist"卡住）
- 敏感操作留下审计
- 前端登录态失效有明确的用户反馈，而不是静默 401

**Non-Goals:**
- 不重写身份模型（学生/家长/管理员/钉钉 SSO 保持现状）
- 不引入 Redis / MySQL / 消息队列（限流 / nonce 全部内存实现）
- 不做多租户 / 多校
- 不做端到端 e2e 测试（本轮只补关键包单测）
- 不重构前端组件树，只改 `api/client.ts` + 登录页 + 个人中心/改密页

## Decisions

### 1. JWT v5 迁移 + refresh session 落库
- **Decision**：access token TTL 30 min；refresh token 走 HttpOnly cookie，明文只发给浏览器，DB 里存 `sha256(raw)`；`refresh_sessions(id, user_id, role, token_hash, ua, ip, expires_at, last_used_at)`
- **Rationale**：JWT 无法主动吊销；30 min 内即使泄露也自动过期；改密后一句 `DELETE FROM refresh_sessions WHERE user_id=? AND id<>current` 就能踢掉其它设备
- **备选**：只延长 TTL / 加 revoke list —— 前者不解决"改密后老 token 仍活"，后者需要全表扫描

### 2. 登录限流用**内存**做而不是 Redis
- **Decision**：`sync.Map<key,{count,expiresAt}>`；`(username)` 5 次锁 5 min，`(ip)` 20 次锁 15 min；≥3 次失败要求提交验证码
- **Rationale**：单机部署 Redis 属于过度设计；重启失效可以接受（重启本身就意味着人工介入）
- **保留升级路径**：`Limiter` 定义为 interface，日后换 Redis 只加实现

### 3. 图形验证码用 `mojocn/base64Captcha` 内存 store
- 与 `campus-sports-system` 同款，减少心智负担；默认 4 位数字，5 min 过期

### 4. 生产模式 JWT secret 严格校验
- **Decision**：`server.production=true` 时启动检查：`JWTSecret` 长度 ≥32 且不含 `"default-jwt-secret"` / `"please-change"`；失败直接 `log.Fatal`
- 首启已经会自动生成 32 位随机 secret，只是老实例需要**主动改一下**才能过检查

### 5. `web/dist` 变可选嵌入
- **Decision**：把 `//go:embed all:web/dist` 移到独立 build tag 文件 `main_embed.go` (`//go:build embed`)；默认 `main.go` 提供 stub `getStaticFS() (fs.FS, error) { return nil, nil }`；无静态文件时不注册 `NoRoute`，只跑 API
- **构建时**：`go build -tags embed`；CI 会先 `pnpm build` 再 `go build -tags embed`
- **开发**：`go run main.go` 直接跑，不用管前端

### 6. 结构化日志与 request id
- **Decision**：`rs/zerolog` 全局 logger + gin middleware：给每个请求生成 `X-Request-ID`（若客户端已带就复用），塞进 ctx；错误响应 body 里也带 `request_id` 方便查
- Handler 里 `logger := logCtx(c)` 一行拿到带 request_id 的 logger

### 7. 上传大小 / MIME 白名单
- **Decision**：`utils.SaveBase64Image` 先看头 `data:image/xxx;base64,`；只放行 `png/jpeg/webp`；base64 解码后 >5 MB 拒收；文件名 `uuid.ext` 而非 `prefix_ts.ext`
- **Rationale**：`competition_<userID>_<ts>` 存在同秒并发覆盖风险（校园赛事流量峰值 + 学生同时提交）；uuid 无冲突

### 8. 审计日志设计
- **Decision**：`audit_logs(id, at, actor_id, actor_role, action, target_type, target_id, ip, ua, detail_json)`；`action` 枚举：`login_success/login_fail/change_password/reset_student_password/create_user/update_user_permission/delete_user/approve_competition/reject_competition/review_score/switch_event`
- 不做前端 UI 展示（本轮），但**结构确定**便于后续 `docs/audit.md` 直接对接

### 9. 前端 401 处理集中化
- **Decision**：axios response interceptor 拿到 401 → 清 token / user → `navigate('/login?next=' + encodeURIComponent(pathname+search))`；登录成功后如果有 `next` 就 replace 过去
- 钉钉 SSO 错误从 URL query 改为 sessionStorage + 登录页 `useEffect` 里读一次并 Modal.error 展示，避免地址栏残留

### 10. Refresh token cookie 策略
- `HttpOnly=true, SameSite=Lax`；`Secure` 走 `isSecureRequest(c)` 判断（跟 xzzx-sis 一致），dev 场景 `security.allow_insecure_cookie=true` 关掉

## Risks / Trade-offs

- **[风险] JWT 迁移导致全体强制重登** → 缓解：迁移在低峰做；README 里加"升级须知"，钉钉里发通知
- **[风险] 限流用内存，多实例部署时不均衡** → 缓解：Limiter 定义 interface；本轮只提供 in-memory 实现，接 Redis 版留位
- **[权衡] `web/dist` 可选让 `//go:embed` 变复杂** → 换取贡献者第一次 `go run` 不再报错，值
- **[权衡] `refresh_sessions` 与 `audit_logs` 让 SQLite 有更多写** → 已知每次 refresh 一次 UPDATE，改密一次 DELETE，登录一次 INSERT；对 SQLite WAL 模式压力可忽略
- **[风险] 图形验证码 in-memory store 不能跨实例** → 与限流同处一境，本轮接受

## Migration Plan

1. `go get github.com/golang-jwt/jwt/v5 github.com/rs/zerolog github.com/mojocn/base64Captcha github.com/google/uuid && go mod tidy`
2. 新建 `refresh_sessions` / `audit_logs` 表（AutoMigrate 自动完成）
3. 部署新版本 → 老 access token 立即失效 → 所有用户重新登录（钉钉 SSO 无感知，普通密码用户需要重登一次）
4. 检查 `security.jwt_secret` 是不是默认串；如果是，手工替换后再重启
5. 前端一并部署（axios 401 → /login 需要新逻辑跟后端匹配）
6. 观察 24h：`SELECT count(*) FROM refresh_sessions` 应稳定增长；`audit_logs` 里有登录成功/失败记录

回滚：git revert；老 `dgrijalva/jwt-go` 与老 token 逻辑保留在 tag `pre-harden`；数据库层面新表可保留（不影响老代码）。

## Open Questions

- 需不需要给学生 / 家长身份也提供 "登录会话列表" UI？本轮先只给 admin 提供（学生用户群体没有理解和管理多设备的需求）；如果实际反馈需要再加
- 审计日志要不要设 TTL？暂不设，`audit_logs` 每年几万行 SQLite 撑得住；等 200 万行以上再考虑
