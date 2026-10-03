# Agent Instructions for sports-meeting-system

## Project Context

sports-meeting-system is a sports meeting management system for Shanghai Xingzhi High School. It covers the full workflow: competition project collection, voting, registration, score entry & review, points calculation, and a public scoreboard.

**Stack**:
- Backend: Go 1.27+ (Gin, GORM)
- Frontend: React 19 (TypeScript, Ant Design, Vite)
- Database: SQLite only (`github.com/ncruces/go-sqlite3/gormlite`, pure Go — no CGO)
- Auth: JWT + DingTalk login
- Deployment: the frontend build is embedded into the Go binary via `//go:embed`

## Repository Structure

```
/
├── main.go              # Application entry point (//go:embed web/dist)
├── api/
│   ├── handlers/        # HTTP handlers (by feature area)
│   ├── middlewares/     # Auth, roles, permissions
│   └── routes/          # Route registration (SetupRouter)
├── models/              # Database operations (GORM)
├── services/            # Business logic layer
├── types/               # Go type definitions and database models
├── utils/               # Response helpers, permission bits, validation
├── config/              # Configuration management (config.json)
├── database/            # Database initialization & migration
├── logger/              # Global structured logger (slog instance)
└── web/                 # Frontend React application
    └── src/
        ├── api/         # API client modules
        ├── components/  # Reusable React components
        ├── contexts/    # React Context (auth, etc.)
        ├── pages/       # Page components (admin/auth/public/student)
        ├── router/      # React Router configuration
        ├── types/       # TypeScript types
        └── utils/       # Frontend utilities (handleResp, etc.)
```

## Build & Run Commands

### Backend

```bash
go run main.go                                # Development
go build -o sports-meeting-system main.go     # Build (build the frontend first!)
golangci-lint run --fix                       # Lint
```

### Frontend

```bash
cd web
pnpm install               # Always run before building
pnpm run dev               # Development (port 3000, proxies /api to :8080)
pnpm run lint              # Check for issues
pnpm run lint:fix          # Auto-fix issues
pnpm run format            # Format with Prettier
pnpm run build             # Production build (tsc --noEmit + vite build)
```

## Key Development Rules

### Backend Must-Use Patterns

#### 1. Response Format

Always use `utils/response.go`: `ResponseOK`, `ResponseSuccessWithCustomMessage`, `ResponsePaginated`, `ResponseError`. HTTP status is always 200; the business code lives in the body's `code` field (200 = success). Never invent ad-hoc response shapes.

#### 2. Authentication & Authorization

Use `api/middlewares/auth.go`: `AuthMiddleware`, `AdminMiddleware`, `StudentMiddleware`, `PermissionMiddleware(perm)`, `PermissionAnyMiddleware(...)`. New endpoints must be protected; only genuinely public endpoints go under `/api/public` (with `DashboardMiddleware` where applicable). Read identity via `GetUserIDFromContext` / `GetRoleFromContext` / `GetPermissionsFromContext`.

#### 3. List Endpoints: Search & Pagination

All list endpoints behind paginated tables accept the same three query params: `page` (1-based; 0/absent = no pagination), `page_size`, `keyword` (fuzzy search; empty = no filter). Model signature: `ListXxx(page, pageSize int, keyword string) ([]*types.Xxx, int, error)`. `Count` and `Find` MUST apply identical filter conditions.

#### 4. Database Operations

- SQLite only (`gormlite` driver). Pool is fixed at 1 connection; PRAGMAs (`foreign_keys`, `WAL`, `busy_timeout`, `synchronous`) are set once in `database/db.go` — do not set them elsewhere.
- Schema changes: edit models in `types/`, register them in `database/db.go` `autoMigrate()`.
- Runtime config lives in `config.json` (gitignored, auto-generated on first run). No dotenv/env-var system.

#### 5. Logging

Use `logger.L` from the `logger/` package (a slog instance). Do NOT use the global `log` or `slog` package-level functions — depguard/sloglint in `.golangci.yml` will reject them.

### Frontend Must-Use Patterns

#### 1. Response Handling

All API responses go through `web/src/utils/handleResp.ts`. Pick the variant by scenario:

| Function                                       | Scenario                | Behavior                          |
| ---------------------------------------------- | ----------------------- | --------------------------------- |
| `handleResp<T>()`                              | Data fetching           | error notice + 401 handling       |
| `handleRespWithNotifySuccess<T>()`             | Create/update/delete    | error + success notices + 401     |
| `handleRespWithoutNotify<T>()`                 | Dashboards, polling     | silent                            |
| `handleRespWithoutAuthAndNotify<T>()`          | Login page, public API  | no 401 handling, no notices       |
| `handleRespWithoutAuthButNotifySuccess<T>()`   | Public API write ops    | success notice, no 401 handling   |
| `handleBatchResp()`                            | Batch operations        | progress callback, chunked        |

Never check `response.data.code === 200` directly in pages.

#### 2. API Calls

API calls live in `web/src/api/` modules (organized by role area), reusing the axios instance from `src/api/config.ts`. Pages must not use axios directly.

#### 3. Tables

Table search/filter/pagination is server-side: send `page`/`page_size`/`keyword` as query params. Do not fetch everything and filter client-side.

#### 4. Components

Prefer Ant Design components. User-facing strings are Chinese. New code must pass `tsc --noEmit` (strict) — avoid `any`.

## Code Style

- Go: enforced by `.golangci.yml` (gofumpt/gci/goimports/golines + 50+ linters). Run `golangci-lint run --fix` before committing.
- TypeScript: Prettier (`.prettierrc`) + ESLint (`web/eslint.config.js`), strict mode via `web/tsconfig.json`. Run `pnpm run format && pnpm run lint:fix` before committing.
- Indentation: Go tabs; frontend 2 spaces; line endings LF.

## Commit Message Format

Conventional Commits, enforced on PR titles by CI:

```
<type>(<scope>?): <description>
```

Types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Example: `feat: 看板添加播报功能`.

## Security Requirements

### Must Follow

- Never commit secrets, passwords, or `config.json`
- New endpoints must carry auth + permission middleware
- Validate all user input (see `utils/validation.go`)

## Important Constraints

- **SQLite only** — no MySQL/PostgreSQL/Redis; do not introduce extra storage components
- **No sessions** — JWT (`Authorization: Bearer`) only; do not introduce a session architecture
- **No tests** — do not run `go test` and do not create test files; correctness is validated by full local builds
- **Chinese** — all user-facing strings, comments, and docs are in Chinese
- **Embedded frontend** — `web/dist` is embedded via `//go:embed`; always build the frontend before building the backend
- **Node/pnpm versions** — enforced by `devEngines` in `web/package.json` (Node >= 24, pnpm 12.4.2)

## Validation Before Commit

```bash
cd web && pnpm run build && pnpm run format && pnpm run lint && cd ..
golangci-lint run --fix
go build -o sports-meeting-system main.go
```

CI (`.github/workflows/pr-check.yml`) re-runs all of the above on PRs and fails if formatting (`format`/`lint:fix`/`go mod tidy`) produces any diff.

## Common File Locations

| Content                  | Location                      |
| ------------------------ | ----------------------------- |
| Response helpers         | `utils/response.go`           |
| Permission constants     | `utils/permissions.go`        |
| Auth middleware          | `api/middlewares/auth.go`     |
| Route registration       | `api/routes/routes.go`        |
| Database initialization  | `database/db.go`              |
| Frontend response helper | `web/src/utils/handleResp.ts` |
| Axios instance           | `web/src/api/config.ts`       |
| Config structs           | `config/`                     |
| Lint configs             | `.golangci.yml`, `web/eslint.config.js` |

## Development Environment

- Go 1.27+, Node.js 24+, pnpm 12+
- Windows: run `git config core.autocrlf false` to avoid CRLF churn
- Optional pre-commit hook (auto-format + `go mod tidy`): `scripts\install-hooks.cmd` (Windows) or `bash scripts/install-hooks.sh`

## Trust These Instructions

These rules mirror `CONTRIBUTING.md` (Chinese). When implementing changes, follow the Must-Use Patterns above; they are enforced by CI.
