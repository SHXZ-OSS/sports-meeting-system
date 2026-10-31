## ADDED Requirements

### Requirement: axios 401 统一处理与回跳

`web/src/api/client.ts` SHALL 注册 response interceptor：

- 响应 401 时清空 localStorage token / user
- 若不在 `/login` 页，则 `window.location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search))`
- 若已在 `/login`，不做跳转（避免死循环）

#### Scenario: 用户 session 失效
- **WHEN** 用户在 `/admin/users` 页操作时后端返回 401
- **THEN** 页面跳到 `/login?next=%2Fadmin%2Fusers`

#### Scenario: 已在登录页不循环
- **WHEN** 用户在 `/login` 页调用某接口拿到 401（例如钉钉 SSO 探测）
- **THEN** 不发生跳转，只清 token

### Requirement: 登录页 next 参数回跳

登录页 SHALL 读取 URL 的 `next` 参数；登录成功后，若 `next` 存在且以 `/` 开头（非绝对 URL），使用 `navigate(next, { replace: true })`；否则回到 `/`。

#### Scenario: 回跳到原路径
- **WHEN** URL 是 `/login?next=%2Fadmin%2Fscores`
- **THEN** 登录成功后自动进入 `/admin/scores`

#### Scenario: 外链 next 被忽略
- **WHEN** URL 是 `/login?next=https://evil.com`
- **THEN** 登录成功后进入 `/`，不外跳（防钓鱼）

### Requirement: 钉钉 SSO 错误 UI

DingTalk SSO 回调错误 SHALL 通过 `sessionStorage.dingtalk_error` 传递，而不是 URL query；登录页 `useEffect` 里读一次后 remove。展示方式为 antd `Modal.error({ title: '钉钉登录失败', content: err })`。

#### Scenario: 错误被 Modal 展示
- **WHEN** SSO 回调 `dingtalk_error=xxx`
- **THEN** 用户到达登录页时看到 Modal.error 弹窗，URL 地址栏不含 `dingtalk_error` 参数

### Requirement: 改密后提示其它设备已登出

修改密码成功后，前端 SHALL 展示提示 `密码修改成功，其它设备的登录状态已被清除`。

#### Scenario: 提示存在
- **WHEN** admin 在个人中心成功改密
- **THEN** 页面 antd message.success 展示上述文案，持续 3 秒

### Requirement: 会话管理页（admin）

Admin 个人中心页 SHALL 新增"登录会话"分区，展示 `refresh_sessions` 列表：`user_agent / created_ip / last_used_ip / last_used_at / expires_at`；当前会话展示 `Tag=当前`；每行有"撤销"按钮。学生 / 家长 UI 本轮不改。

#### Scenario: 撤销另一台设备
- **WHEN** admin 点击某会话的"撤销"
- **THEN** 该行从列表消失；对应设备下次请求返回 401
