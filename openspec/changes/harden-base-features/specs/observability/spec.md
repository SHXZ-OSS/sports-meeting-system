## ADDED Requirements

### Requirement: 健康检查端点

系统 SHALL 提供 `GET /healthz`，无鉴权，返回 `{status, db, version, uptime_seconds}`：

- `status = "ok"` 当且仅当 db ping 成功且 SQLite `PRAGMA integrity_check` 未报错
- `db = "up" | "down"`
- `version` 取自 build-time ldflags 注入的 `main.Version`（未注入返回 `"dev"`）

#### Scenario: DB 正常
- **WHEN** 请求 `/healthz`
- **THEN** HTTP 200，body `{"status":"ok","db":"up",...}`

#### Scenario: DB 挂了
- **WHEN** 手动 close 掉 db 连接后请求 `/healthz`
- **THEN** HTTP 503，body `{"status":"degraded","db":"down",...}`

### Requirement: 结构化日志

系统 SHALL 使用 `github.com/rs/zerolog` 作为唯一日志出口；`log.Println / log.Printf / fmt.Println` MUST 从所有 handler / service 中移除（`main.go` 首启初始密码打印允许保留，但也应转 zerolog Warn）。

日志 MUST 至少含字段：`time` (RFC3339)、`level`、`msg`。控制台格式取自 `logging.format`（`console` / `json`）。

#### Scenario: 生产模式 JSON
- **WHEN** `logging.format=json`
- **THEN** stdout 每行是合法 JSON

#### Scenario: 开发模式彩色
- **WHEN** `logging.format=console`
- **THEN** stdout 用 zerolog ConsoleWriter，附带彩色 level 前缀

### Requirement: 请求 ID 与全局 recover

系统 SHALL 注册一个 Gin middleware：

1. 从请求头读 `X-Request-ID`，若空则用 `uuid.New()` 生成
2. 写入响应头 `X-Request-ID`
3. 用 request_id 派生一个 zerolog logger 放入 gin.Context
4. panic 时被外层 `gin.Recovery` 兜底，返回 500 JSON `{code:500, message:"内部错误", request_id:"..."}` 并记录 error 级日志

#### Scenario: 客户端不带 request id
- **WHEN** 请求不带 header
- **THEN** 响应头返回一个新生成的 UUID

#### Scenario: panic 被兜底
- **WHEN** handler 内 `panic("oops")`
- **THEN** 客户端收到 500 JSON 含 `request_id`；服务端日志包含 `panic="oops"` 和堆栈

### Requirement: 错误响应统一格式

系统 SHALL 保证所有 handler 错误路径使用 `utils.ResponseError`。错误 JSON 结构 MUST 为 `{code, message, request_id}`；`request_id` 与响应头 `X-Request-ID` 保持一致。

#### Scenario: 参数校验失败
- **WHEN** login 请求缺 username
- **THEN** 响应 400，body `{code:400, message:"...", request_id:"..."}`
