## Why

`sports-meeting-system` 目前是一份能跑的 MVP：登录、项目/报名/成绩/积分/看板都在，但**基础功能里有一批和生产可用度直接相关的短板**，一旦人多起来或者被外部扫端口就会露出问题：

- JWT 用的是**已归档、有已知 CVE 的 `dgrijalva/jwt-go`**（作者本人建议迁移）；token 一签 30 天且没有刷新/撤销机制，改密后老 token 仍然有效
- 登录接口**没有任何限流 / 验证码**，只要拿到用户名就能穷举密码
- **首启的初始管理员密码只出现在标准输出一次**：日志被覆盖就无法找回；`config.json` 里的 `JWTSecret` 只在首启生成、之后不会告警强度
- **没有健康检查 / 结构化日志 / 全局 recover**：panic 会带崩整个进程；发生问题时看不到调用链
- **`web/dist` 是硬编码嵌入的**：clone 后不先 `pnpm build` 就会 `go run main.go` 直接失败
- 上传 base64 图片**没有大小 / MIME 限制**，也没做速率控制
- 敏感操作（改密、审核、成绩改写）**没有审计日志**
- 后端没有一行单测；`services/mapping_service.go` 里 `fmt.Errorf(errMsg)` 触发 `govet` 告警但没人跑过 vet
- 前端 axios 401 后**没有统一"跳登录 + 保留回跳"**的处理；DingTalk SSO 错误反馈通过 URL query 传，无提示 UI

这些问题不改，系统就一直卡在"能跑给校内看，扛不住真上线"的状态。这轮基础加固要把它们一次收紧。

## What Changes

### 认证与安全
- **BREAKING**：`services/auth_service.go` 从 `dgrijalva/jwt-go` 迁到 `github.com/golang-jwt/jwt/v5`；老 token 会立即失效
- Access token TTL 从 30 天缩到 30 分钟；新增 `refresh_sessions` 表落库 refresh token（sha256 存 hash），走 HttpOnly cookie
- 新增 `POST /api/auth/refresh` / `POST /api/auth/logout` / `GET /api/auth/sessions` / `DELETE /api/auth/sessions/:id`
- `POST /api/change_password` 修改密码后**撤销当前用户其它所有会话**
- **登录限流**：`(username, ip)` 双维度内存计数；超过阈值触发图形验证码；15 min 内 IP 累计失败次数上限阻断
- 新增 `GET /api/captcha` 图形验证码
- 生产环境如果 `JWTSecret` 仍是默认串或长度 <32，直接**拒绝启动**

### 稳定性与可运维性
- 引入 `github.com/rs/zerolog`；所有 handler 用结构化日志替换 `log.Println`
- `main.go` 加 `gin.Recovery()` + zerolog request logger
- 新增 `GET /healthz`：DB ping + 版本号；无鉴权
- **`web/dist` 变成可选**：`main.go` 在没有嵌入内容时启动一个"仅 API"的分支；前端另起 dev server
- 全局错误处理：所有 handler 走同一份 `utils.ResponseError`；panic 兜底转 500 + 请求 id
- `services/mapping_service.go` 里 `fmt.Errorf(errMsg)` 修成 `fmt.Errorf("%s", errMsg)` 消除 govet 告警
- 补 backend 关键包单测：`utils/permissions`、`utils/validation`、`services/auth_service`（迁移后新算法）
- `Makefile` 提供 `make dev/build/test/lint`
- config **在生产模式下** hot-reload 只对白名单字段生效（scoring / competition / dashboard / website），JWT/DingTalk/DB 不允许运行时改

### 上传 & 输入校验
- `utils/image.go`：图片 base64 上限 5 MB；解出 MIME 后只允许 `image/png|jpeg|webp`；文件名走 uuid 而不是 timestamp（避免同秒冲突）
- 每场 change_password / user create / competition approve 走 audit log（新表 `audit_logs`）

### 前端体验
- axios interceptor 统一 401 处理：清 token → 跳 `/login?next=<原路径>`
- 登录页读 `?next=` 完成回跳
- DingTalk SSO 错误从 URL query 改成 antd `Modal.error`，不再需要用户手动清 URL
- 修改密码页：改完立即弹"其它设备已被登出"提示

## Capabilities

### New Capabilities
- `auth-hardening`：JWT v5 迁移、refresh session、限流、验证码、审计
- `observability`：健康检查、结构化日志、panic recover、request id
- `input-safety`:  上传大小/MIME 校验、审计日志
- `dev-experience`：`web/dist` 可选嵌入、Makefile、后端单测骨架
- `frontend-auth-ux`:  统一 401 处理、SSO 错误 UI、改密提示

### Modified Capabilities

（本仓库当前 `openspec/specs/` 不存在，全部走 ADDED。）

## Impact

- **BREAKING**：迁 JWT v5 后所有在线用户被强制重新登录一次
- 数据库新增两张表：`refresh_sessions`、`audit_logs`；AutoMigrate 自动建
- 依赖：`+ github.com/golang-jwt/jwt/v5`、`+ github.com/rs/zerolog`、`+ github.com/mojocn/base64Captcha`、`+ github.com/google/uuid`；移除 `github.com/dgrijalva/jwt-go`
- 配置新增：`security.access_token_ttl_seconds`（默认 1800）、`security.refresh_token_ttl_seconds`（默认 2592000）、`security.refresh_cookie_name`（默认 `SMS_REFRESH`）、`security.allow_insecure_cookie`（dev only）、`server.production`（bool，控制 secret 严格校验与 hot-reload 白名单）
- 前端：`api/client.ts` interceptor 逻辑改写；登录页新增 next 参数处理；管理员/学生页个人中心新增会话列表
- 文档：`README.md`、`docs/security.md`（新）
