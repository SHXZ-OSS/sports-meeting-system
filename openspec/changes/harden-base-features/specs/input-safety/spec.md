## ADDED Requirements

### Requirement: base64 图片上传大小与 MIME 校验

`utils.SaveBase64Image` SHALL 校验：

- 输入必须以 `data:image/<subtype>;base64,` 前缀，`subtype` 限定为 `png` / `jpeg` / `webp`（其它一律拒绝）
- base64 解码后原始字节 ≤ 5 MB
- 输出文件名使用 `uuid.NewString() + "." + ext`；不再拼接 prefix + timestamp

#### Scenario: 非图片 MIME 被拒绝
- **WHEN** 前端提交 `data:application/pdf;base64,...`
- **THEN** 函数返回 `"", err`；err 消息包含 `不支持的图片格式`

#### Scenario: 超大文件被拒绝
- **WHEN** 提交超过 5 MB 的 base64 图片
- **THEN** 函数返回 `"", err`；err 包含 `图片过大`

#### Scenario: 文件名 uuid 化
- **WHEN** 同一秒内并发保存 100 张图片
- **THEN** 100 个文件名互不相同（uuid 无冲突）

### Requirement: 关键动作产生审计记录

以下端点 SHALL 在成功执行后同步写入 `audit_logs`：

| 端点 | action |
| ---- | ------ |
| `POST /api/change_password` | change_password |
| `POST /api/admin/students/:id/reset_password` | reset_student_password |
| `POST /api/admin/users` | create_user |
| `PUT /api/admin/users/:id` | update_user_permission |
| `DELETE /api/admin/users/:id` | delete_user |
| `POST /api/admin/competitions/:id/approve` | approve_competition |
| `POST /api/admin/competitions/:id/reject` | reject_competition |
| `POST /api/admin/scores/review` | review_score |
| `POST /api/admin/settings/events/:id/switch` | switch_event |

写入失败 MUST 只记 WARN 日志，不阻断主流程。

#### Scenario: 审计写入失败不影响主逻辑
- **WHEN** 审计表被人工 DROP 后 admin 改密
- **THEN** 改密仍然成功；日志出现 `msg="write audit log failed"` 一条 WARN
