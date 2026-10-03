# 上海市行知中学运动会系统

一个功能完善的运动会管理系统，支持项目征集、投票、报名、成绩录入与审核、积分统计、公开看板等全流程功能。

Built For [上海市行知中学](https://school.bsedu.org.cn/xzhs/)

<img src="https://cdn.itshenryz.com/image-20251113233905953.png" alt="系统截图" style="zoom:25%;" />

## 功能特性

### 管理员功能

- **用户管理**：创建、编辑、删除用户账号，支持细粒度权限控制
  ![image-20251113234022015](https://cdn.itshenryz.com/image-20251113234022015.png)
- **学生与班级管理**：管理学生信息和班级信息，支持批量导入
- **项目管理**：管理比赛项目，审核学生提交的项目推荐
  ![image-20251113234055381](https://cdn.itshenryz.com/image-20251113234055381.png)
- **报名管理**：查看和管理学生报名情况，导出报名，随机抽选
  ![image-20251113234238512](https://cdn.itshenryz.com/image-20251113234238512.png)
- **成绩录入**：录入比赛成绩
- **成绩审核**：审核已提交的成绩
- **积分管理**：自动计算积分，支持自定义加分，查看班级和学生排名
  ![image-20251113234318018](https://cdn.itshenryz.com/image-20251113234318018.png)
- **系统设置**：配置网站信息、比赛时间节点、积分规则等
- **运动会届次管理**：支持多届运动会数据管理

### 学生功能

- **项目推荐**：在征集阶段提交项目建议
- **项目投票**：对推荐的项目进行投票
- **项目报名**：报名参加审核通过的比赛项目
- **成绩查询**：查看个人比赛成绩和积分排名
- **积分查询**：查看个人得分和班级排名

### 公开功能

- **实时看板**：公开展示比赛项目、成绩、排名等信息

## 技术栈

- **后端**: Go + Gin + GORM + SQLite（纯 Go 驱动，无 CGO）
- **前端**: React + TypeScript + Ant Design + Vite
- **认证**: JWT + 钉钉登录

前端构建产物通过 `go:embed` 内嵌进单个二进制，部署只需要一个可执行文件。

## 快速开始

开发前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解完整的开发规范。

### 后端

```bash
go run main.go
```

服务将在 `http://localhost:8080` 启动，首次运行会自动生成 `config.json`、初始化数据库并打印管理员账号密码。

### 前端

```bash
cd web
pnpm install
pnpm run dev
```

开发服务器将在 `http://localhost:3000` 启动，API 请求自动代理到本地后端。

### 生产构建

```bash
cd web
pnpm install
pnpm run build
cd ..
go build -o sports-meeting-system main.go
```

交叉编译同样简单（SQLite 驱动无 CGO 依赖）：

```bash
GOOS=linux GOARCH=amd64 go build -o sports-meeting-system main.go
```

## 环境要求

- Go 1.27+
- Node.js 24+ 与 pnpm 12+（版本由 `web/package.json` 的 `devEngines` 强制约束）
