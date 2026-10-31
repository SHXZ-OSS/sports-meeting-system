## ADDED Requirements

### Requirement: web/dist 可选嵌入

`main.go` SHALL 支持"不嵌入前端"模式：默认 `go build` / `go run` MUST 成功，即使 `web/dist` 目录不存在。仅当传入 `-tags embed` 时才嵌入 `web/dist`。

#### Scenario: 首次 clone 后可直接跑
- **WHEN** 新贡献者 `git clone && go run main.go`
- **THEN** 后端启动成功，无 `pattern all:web/dist: no matching files` 报错

#### Scenario: 发行版走 embed
- **WHEN** `go build -tags embed`
- **THEN** 生成的二进制内嵌 `web/dist`；`GET /` 返回 index.html

#### Scenario: API-only 模式路由行为
- **WHEN** 无嵌入模式启动
- **THEN** `/api/*` 正常；未匹配路径返回 404 JSON `{code:404,message:"not found"}`，而不是尝试渲染 index.html

### Requirement: Makefile 提供基础任务

仓库根 SHALL 提供 `Makefile`，至少支持：

- `make dev`：前后端并起（并发运行 `go run main.go` 和 `pnpm --dir web dev`）
- `make build`：`pnpm --dir web build && go build -tags embed -o bin/sports-meeting-system main.go`
- `make test`：`go test ./...`
- `make lint`：`go vet ./...` 和 `pnpm --dir web lint`

Windows 无 `make` 环境 SHALL 在 README 提供等价 PowerShell 命令。

#### Scenario: 单条命令跑测试
- **WHEN** 开发者 `make test`
- **THEN** 后端所有 `_test.go` 依次执行；退出码反映测试结果

### Requirement: 后端关键包单测

`utils/permissions_test.go` / `utils/validation_test.go` / `services/auth_service_test.go` MUST 存在，覆盖：

- 权限位组合与判定
- 时间窗（IsSubmissionAllowed / IsVotingAllowed / IsRegistrationAllowed）在给定 config 下的边界
- JWT v5 生成、校验、过期、错密钥、错签名方法

CI 或 `make test` 中执行时 SHALL 全部通过。

#### Scenario: govet 通过
- **WHEN** `go vet ./...`
- **THEN** 无 `Errorf format` 类告警（含修复 `mapping_service.go` 里 `fmt.Errorf(errMsg)`）

### Requirement: 生产模式配置 hot-reload 白名单

`server.production=true` 时，`config.Save()` 与 `POST /api/admin/settings` 仅允许改动以下字段，其它字段若与磁盘不一致 SHALL 返回 400：

- `website.*`
- `competition.*`
- `dashboard.*`
- `scoring.*`
- `current_event_id`

`security.*`、`server.*`、`database.*`、`dingtalk.*` 只能通过重启 + 编辑 `config.json` 修改。

#### Scenario: 生产模式不允许改 JWT 密钥
- **WHEN** production=true 且 admin 尝试 PATCH `security.jwt_secret`
- **THEN** 响应 400，body 消息 `生产模式下该配置不可通过 API 修改`

#### Scenario: dev 模式全开
- **WHEN** production=false
- **THEN** 所有字段均可通过 API 更新（与现状一致）
