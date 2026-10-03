# 贡献指南 (Contributing Guide)

本文档描述运动会系统的开发规范。提交 PR 前，请务必阅读本文档。

## 目录

- [项目结构](#项目结构)
- [构建与运行命令](#构建与运行命令)
- [提交规范](#提交规范)
- [前端开发规范](#前端开发规范)
- [后端开发规范](#后端开发规范)
- [权限系统规范](#权限系统规范)
- [重要约束](#重要约束)
- [常用文件位置](#常用文件位置)
- [代码风格](#代码风格)
- [测试要求](#测试要求)
- [安全要求](#安全要求)
- [开发环境配置](#开发环境配置)

## 项目结构

```
/
├── main.go              # 程序入口（//go:embed 内嵌前端产物）
├── api/
│   ├── handlers/        # HTTP handlers（按功能域分文件）
│   ├── middlewares/     # 认证、角色、权限中间件
│   └── routes/          # 路由注册（SetupRouter）
├── models/              # 数据库操作（GORM，每域一个文件）
├── services/            # 业务逻辑层（认证、成绩、积分、钉钉同步等）
├── types/               # Go 类型定义与数据库模型
├── utils/               # 统一响应、权限位运算、校验、图片、钉钉工具
├── config/              # 配置管理（config.json）
├── database/            # 数据库初始化与迁移
├── logger/              # 全局结构化日志器（slog 实例）
└── web/                 # 前端 React 应用
    └── src/
        ├── api/         # API 客户端模块
        ├── components/  # 可复用组件
        ├── contexts/    # React Context（认证等）
        ├── pages/       # 页面组件（admin/auth/public/student）
        ├── router/      # 路由配置
        ├── types/       # TypeScript 类型
        └── utils/       # 工具函数（handleResp 等）
```

## 构建与运行命令

### 后端

```bash
go run main.go                                # 开发（首次运行自动生成 config.json 并打印管理员密码）
go build -o sports-meeting-system main.go     # 构建（需先构建前端，产物内嵌）
golangci-lint run --fix                       # Lint（配置见 .golangci.yml）
```

### 前端

```bash
cd web
pnpm install               # 构建前必跑
pnpm run dev               # 开发（端口 3000，API 代理到 localhost:8080）
pnpm run lint              # 检查问题
pnpm run lint:fix          # 自动修复
pnpm run format            # Prettier 格式化
pnpm run jscpd             # 重复代码检查
pnpm run react-doctor      # React 反模式检查
pnpm run build             # 生产构建（先 tsc --noEmit 类型检查，输出 web/dist/）
pnpm run build:visualize   # 构建并打开依赖体积图
```

## 提交规范

### Conventional Commits

提交信息必须遵循 Conventional Commits 格式，CI 会对 PR 标题做正则校验：

```
<type>(<scope>?): <描述>
```

### 类型 (Type)

| 类型       | 说明                             |
| ---------- | -------------------------------- |
| `feat`     | 新功能                           |
| `fix`      | 修复 Bug                         |
| `docs`     | 文档变更                         |
| `style`    | 代码格式（不影响逻辑）           |
| `refactor` | 重构（既不是新增也不是修复）     |
| `perf`     | 性能优化                         |
| `test`     | 测试相关                         |
| `build`    | 构建系统或外部依赖变更           |
| `ci`       | CI 配置变更                      |
| `chore`    | 其他杂项                         |
| `revert`   | 回滚提交                         |

### 示例

```
feat: 看板添加播报功能
fix: 修复搜索态下保存的错误刷新逻辑
chore: 更新依赖
```

## 前端开发规范

### 1. 必须使用 handleResp 处理所有 API 响应

位于 `web/src/utils/handleResp.ts`，所有 API 调用必须通过它处理响应。

#### 响应处理函数选择指南

| 函数                                           | 使用场景             | 特点                           |
| ---------------------------------------------- | -------------------- | ------------------------------ |
| `handleResp<T>()`                              | 数据获取操作         | 错误通知 + 401 处理，无成功通知 |
| `handleRespWithNotifySuccess<T>()`             | 创建、更新、删除操作 | 错误通知 + 成功通知 + 401 处理  |
| `handleRespWithoutNotify<T>()`                 | 仪表盘、轮询请求     | 静默处理，无任何通知            |
| `handleRespWithoutAuthAndNotify<T>()`          | 登录页、公共 API     | 无 401 处理，无通知             |
| `handleRespWithoutAuthButNotifySuccess<T>()`   | 公共 API 的写操作    | 成功通知，无 401 处理           |
| `handleBatchResp()`                            | 批量操作             | 支持进度回调，分批处理          |

#### 为什么必须使用 handleResp？

后端响应约定为 HTTP 恒 200、业务码在 body 的 `code` 字段。`handleResp` 统一处理：

- 错误自动 `message.error` 通知
- 401 自动登出并跳转
- 分页信息（`total`/`page`/`size`）自动解析
- 批量操作进度回调

**禁止**在页面里直接判断 `response.data.code === 200`。

### 2. API 调用必须收敛到 `web/src/api/` 模块

页面组件不允许直接使用 axios。按角色域组织模块（admin/student/public），复用 `src/api/config.ts` 中的 axios 实例（自带 Bearer token 注入）。

### 3. 表格的搜索与筛选必须走后端

分页表格的搜索、筛选、分页都由后端接口完成，前端只传 `page`/`page_size`/`keyword` 查询参数，不要把全量数据拉到前端过滤。

### 4. 组件规范

- 优先使用 Ant Design 组件，保持 UI 一致性
- 用户可见的文案使用中文
- 类型安全：新代码避免 `any`（lint 会警告）

## 后端开发规范

### 1. 使用 Middleware 中的核心功能

位于 `api/middlewares/auth.go`：

| 中间件                        | 说明                             |
| ----------------------------- | -------------------------------- |
| `AuthMiddleware()`            | JWT 认证                         |
| `AdminMiddleware()`           | 管理员角色校验                   |
| `StudentMiddleware()`         | 学生身份校验                     |
| `PermissionMiddleware(perm)`  | 要求持有指定权限位               |
| `PermissionAnyMiddleware(...)` | 满足任一权限位即可              |
| `DashboardMiddleware()`       | 公开看板访问（受配置开关控制）   |

上下文辅助函数：`GetUserIDFromContext`、`GetRoleFromContext`、`GetPermissionsFromContext`、`GetFullnameFromContext`、`IsAdmin`/`IsStudent`/`IsGuest`。

### 2. 必须使用标准化响应格式

位于 `utils/response.go`：

| 函数                                            | 使用场景         |
| ----------------------------------------------- | ---------------- |
| `ResponseOK(c, data)`                           | 成功返回数据     |
| `ResponseSuccessWithCustomMessage(c, message)`  | 自定义成功消息   |
| `ResponsePaginated(c, data, total, page, size)` | 分页数据         |
| `ResponseError(c, httpStatus, message)`         | 返回错误         |

响应格式规范：

- **HTTP 状态码**：始终返回 200（即使业务逻辑失败）
- **业务状态码**：通过响应体中的 `code` 字段表示（200 = 成功）
- **错误信息**：通过 `message` 字段返回用户友好的中文描述
- **数据**：通过 `data` 字段返回

### 3. 列表接口的搜索与分页

所有支撑分页表格的接口都接受同样的三个查询参数：

| 参数        | 含义                               |
| ----------- | ---------------------------------- |
| `page`      | 从 1 开始的页码；`0`/不传 = 不分页 |
| `page_size` | 每页条数；`0`/不传 = 不分页        |
| `keyword`   | 模糊搜索关键词；`""`/不传 = 不筛选 |

Model 侧签名统一为 `ListXxx(page, pageSize int, keyword string) ([]*types.Xxx, int, error)`。**`Count` 和 `Find` 必须套用完全相同的过滤条件**，否则 `total` 和实际返回行数对不上。

### 4. 数据库操作规范

- 数据库只使用 SQLite（驱动为 `github.com/ncruces/go-sqlite3/gormlite`，纯 Go 实现，无 CGO）
- 连接池固定 `MaxOpenConns(1)`/`MaxIdleConns(1)`（SQLite WAL 模式下单写者）
- 初始化时统一设置 `PRAGMA foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=10000`、`synchronous=NORMAL`，不要在业务代码里重复设置
- 表结构变更：在 `types/` 修改模型后，于 `database/db.go` 的 `autoMigrate()` 注册
- 环境变量：项目不使用 dotenv，运行时配置集中在 `config.json`（已 gitignore，首次运行自动生成）

### 5. 日志

使用 `logger.L`（`logger/` 包提供的 slog 实例）输出结构化日志：

```go
logger.L.Info("同步完成", "count", n)
logger.L.Warn(fmt.Sprintf("重试第 %d 次", attempt+1))
```

不要使用全局 `log`/`slog` 包级函数（golangci-lint 的 depguard/sloglint 会拦截）。

## 权限系统规范

### 权限常量

位于 `utils/permissions.go`，使用二进制位运算：

| 常量                                    | 值 | 说明             |
| --------------------------------------- | -- | ---------------- |
| `PermissionProjectManagement`           | 1  | 项目管理         |
| `PermissionUserManagement`              | 2  | 用户管理         |
| `PermissionStudentAndClassManagement`   | 4  | 学生与班级管理   |
| `PermissionWebsiteManagement`           | 8  | 网站信息与设置管理 |
| `PermissionScoreInput`                  | 16 | 成绩提交         |
| `PermissionScoreReview`                 | 32 | 成绩审核         |
| `PermissionRegistrationManagement`      | 64 | 报名管理         |

### 权限检查

```go
// Handler 里声明所需权限
router.Use(middlewares.PermissionMiddleware(utils.PermissionScoreInput))

// 业务代码里组合判断
if user.Permission&utils.PermissionScoreReview != 0 { ... }
```

## 重要约束

- **仅 SQLite**——没有 MySQL/PostgreSQL/Redis，不要引入额外存储组件
- **无 session**——认证走 JWT（`Authorization: Bearer`），不要引入 session 架构
- **没有测试文件**——不要运行 `go test`，也不要新建测试；改动靠本地完整构建验证
- **中文**——所有面向用户的字符串、注释和文档都用中文
- **前端内嵌**——`web/dist` 通过 `main.go` 的 `//go:embed` 内嵌进二进制，构建后端前必须先构建前端

## 常用文件位置

| 内容             | 位置                          |
| ---------------- | ----------------------------- |
| 统一响应函数     | `utils/response.go`           |
| 权限常量         | `utils/permissions.go`        |
| 认证中间件       | `api/middlewares/auth.go`     |
| 路由注册         | `api/routes/routes.go`        |
| 数据库初始化     | `database/db.go`              |
| 响应处理（前端） | `web/src/utils/handleResp.ts` |
| axios 实例       | `web/src/api/config.ts`       |
| 配置结构体       | `config/`                     |
| Lint 配置        | `.golangci.yml`、`web/eslint.config.js` |

## 代码风格

### Go 代码风格

- 由 `.golangci.yml` 强制：gofumpt/gci/goimports/golines 格式化，errcheck/staticcheck/revive 等 50+ linter 检查
- 提交前运行 `golangci-lint run --fix`

### TypeScript 代码风格

- 由 Prettier（`.prettierrc`）+ ESLint（`web/eslint.config.js`）强制
- `strict` TypeScript（`tsconfig.json`），build 前自动 `tsc --noEmit`
- 提交前运行 `pnpm run format && pnpm run lint:fix`

### 通用规范

- 缩进：Go 用 tab，前端用 2 空格
- 行尾：LF（见下方 Windows 配置）

## 测试要求

### PR 自动检查

CI（`.github/workflows/pr-check.yml`）在 PR 上运行以下检查：

1. 前端：`pnpm install` → `pnpm run build`（含类型检查）→ `pnpm run format` → `pnpm run lint:fix`
2. 后端：`golangci-lint run --fix` → `go build` → `go mod tidy`
3. PR 标题是否符合 Conventional Commits
4. **格式化后产生代码变更即失败**——强制贡献者在本地完成格式化，CI 用 diff 做裁判
5. 失败时机器人会在 PR 下发中文评论，附折叠日志与修复命令

### 本地验证

```bash
cd web && pnpm run build && pnpm run format && pnpm run lint && cd ..
golangci-lint run --fix
go build -o sports-meeting-system main.go
```

## 安全要求

### 必须遵守

- 不提交任何密钥、密码、`config.json`
- JWT 密钥仅在 `config.json` 中保存（首次运行自动生成随机值）
- 新增接口必须挂载认证 + 权限中间件，公开接口只能放在 `/api/public` 组
- 用户输入必须校验（参考 `utils/validation.go`）

## 开发环境配置

### 环境要求

- Go 1.27+
- Node.js 24+ / pnpm 12+（`web/package.json` 的 `devEngines` 会在版本不符时报错）

### Git 配置（Windows 用户必读）

**禁用自动 CRLF 转换**，避免格式化工具与 Git 的行尾符冲突：

```bash
git config core.autocrlf false
```

### Git Hooks 自动化（推荐）

安装 pre-commit hook，提交时自动格式化前端代码并执行 `go mod tidy`：

**Windows**：

```cmd
scripts\install-hooks.cmd
```

**Linux/macOS**：

```bash
bash scripts/install-hooks.sh
```
