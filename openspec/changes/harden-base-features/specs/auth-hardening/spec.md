## ADDED Requirements

### Requirement: JWT v5 迁移

系统 SHALL 使用 `github.com/golang-jwt/jwt/v5` 签发和校验 access token；老 `dgrijalva/jwt-go` 依赖 MUST 从 `go.mod` 中移除。access token 载荷 SHALL 至少包含 `user_id / username / role / permission / exp / iat / nbf`。

#### Scenario: 旧 token 全部失效
- **WHEN** 版本升级完成
- **THEN** 用老密钥或老库签发的所有 token 请求受保护接口返回 HTTP 401

#### Scenario: 新 token 正确签发校验
- **WHEN** admin 通过 `POST /api/login` 成功登录
- **THEN** 返回的 access token 用新库 `Parse` 能解出正确的 `user_id / role / permission`，且 `exp - iat = access_token_ttl_seconds`

### Requirement: Access + Refresh 双 token 模型

系统 SHALL 签发短期 access token（默认 30 分钟）和 refresh token（默认 30 天）。refresh token 明文 MUST 仅通过 HttpOnly cookie 下发；数据库 SHALL 只存 `sha256_hex(refresh_token_raw)`。

`refresh_sessions` 表 SHALL 至少包含：`id / user_id / role / token_hash(unique) / user_agent / created_ip / last_used_ip / expires_at / created_at / last_used_at`。

#### Scenario: 登录同时下发两种 token
- **WHEN** 用户名密码登录成功
- **THEN** 响应 body 含 `access_token`；响应头 `Set-Cookie` 含名为 `SMS_REFRESH` 的 HttpOnly cookie，且数据库 `refresh_sessions` 多出一条 `token_hash` 记录

#### Scenario: refresh cookie 换 access token
- **WHEN** 客户端携带有效的 refresh cookie 请求 `POST /api/auth/refresh`
- **THEN** 返回新 access token；`refresh_sessions.last_used_at / last_used_ip` 更新

#### Scenario: refresh cookie 过期
- **WHEN** cookie 携带的 refresh token 对应记录 `expires_at < now`
- **THEN** 接口返回 HTTP 401，并 `Set-Cookie` 清空同名 cookie

### Requirement: 登出与会话管理

系统 SHALL 提供以下接口，都需要 `AuthMiddleware`：

- `POST /api/auth/logout`：撤销当前 refresh session，清 cookie
- `GET /api/auth/sessions`：列出当前用户所有 refresh session（不含 hash），标记 `is_current`
- `DELETE /api/auth/sessions/:id`：仅允许删除属于自己的记录

#### Scenario: 登出只清当前设备
- **WHEN** admin 从 A 设备调用 `logout`
- **THEN** A 的 cookie 被清，B 设备上的 refresh 仍然可用

#### Scenario: 撤销其它会话
- **WHEN** admin 在 A 设备查看 sessions 列表并 delete B 对应的 id
- **THEN** B 设备下次调 `/auth/refresh` 时返回 401

### Requirement: 改密后失效其它会话

`POST /api/change_password` 修改密码成功后，系统 SHALL 删除当前用户的**所有其它** refresh session；当前会话 MUST 保留（避免用户被自己踢出）。

#### Scenario: 改密踢其它设备
- **WHEN** admin 在 A 设备改密
- **THEN** B / C 设备下次 refresh 返回 401；A 仍可用

### Requirement: 登录限流与验证码

系统 SHALL 对 `POST /api/login` 做双维度限流：

- 用户名维度：5 次失败 → 5 分钟内该用户名禁止登录
- IP 维度：20 次失败 → 15 分钟内该 IP 禁止登录
- 任一维度累计失败达 3 次 SHALL 要求提交图形验证码；未通过验证码直接 400

系统 SHALL 提供 `GET /api/captcha` 返回 `{id, image}`，`image` 为 base64 PNG，5 分钟过期。

#### Scenario: 前 2 次失败不要求验证码
- **WHEN** 用户名 alice 输入错误密码 2 次
- **THEN** 响应 `captcha_required: false`

#### Scenario: 第 3 次失败起要求验证码
- **WHEN** 用户名 alice 第 3 次输错
- **THEN** 响应 `captcha_required: true`；后续 login 请求必须带 `captcha_id / captcha_value` 且 captcha 校验通过才继续做密码校验

#### Scenario: 用户名锁定
- **WHEN** alice 第 5 次输错
- **THEN** 5 分钟内即使密码正确、验证码正确，也返回 `账号已锁定，请 5 分钟后再试`

### Requirement: 生产环境 JWT secret 严格校验

当 `server.production == true` 时，系统启动 SHALL 校验 `security.jwt_secret`：

- 长度 ≥ 32
- 不等于内置默认串（`default-jwt-secret-please-change-in-production`）
- 不包含子串 `please-change` / `changeme` / `example`

任一失败 SHALL 通过 `log.Fatal` 阻止启动。

#### Scenario: 默认串阻止启动
- **WHEN** production=true 且 jwt_secret 是默认值
- **THEN** 服务打印 fatal 日志并退出，退出码非 0

#### Scenario: dev 模式放行
- **WHEN** production=false 且 jwt_secret 短或默认
- **THEN** 服务正常启动，仅打印一条 WARN

### Requirement: 审计日志

系统 SHALL 在以下事件发生时向 `audit_logs` 表写入一条记录：

- `login_success` / `login_fail`（失败时不记录密码明文）
- `change_password` / `reset_student_password`
- `create_user` / `update_user_permission` / `delete_user`
- `approve_competition` / `reject_competition` / `review_score`
- `switch_event`

记录 MUST 包含：`at / actor_id / actor_role / action / target_type / target_id / ip / user_agent / detail_json`。

#### Scenario: 登录失败也留痕
- **WHEN** alice 输错密码
- **THEN** `audit_logs` 新增一条 `action=login_fail`，`target_type=user`，`detail_json` 包含 `reason`（不含密码）
