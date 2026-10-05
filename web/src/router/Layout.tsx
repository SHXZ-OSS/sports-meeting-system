import React, { useState, Suspense } from "react";
import {
  Layout as AntLayout,
  Menu,
  Button,
  Dropdown,
  Avatar,
  Typography,
  Space,
  Drawer,
} from "antd";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  TeamOutlined,
  TrophyOutlined,
  EditOutlined,
  SettingOutlined,
  BookOutlined,
  HomeOutlined,
  FormOutlined,
  FileTextOutlined,
  BarChartOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import { useWebsite } from "../contexts/WebsiteContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { PERMISSIONS } from "../types";
import { useIsMobile } from "../utils";
import LoadingSpinner from "../components/Spinner";
import NotFound from "../components/NotFound";

// Admin 懒加载组件
const AdminDashboard = React.lazy(() => import("../pages/admin/Dashboard"));
const AdminSubmitCompetition = React.lazy(
  () => import("../pages/admin/SubmitCompetition"),
);
const UserManagement = React.lazy(
  () => import("../pages/admin/UserManagement"),
);
const StudentManagement = React.lazy(
  () => import("../pages/admin/StudentManagement"),
);
const ClassManagement = React.lazy(
  () => import("../pages/admin/ClassManagement"),
);
const CompetitionManagement = React.lazy(
  () => import("../pages/admin/CompetitionManagement"),
);
const RegistrationManagement = React.lazy(
  () => import("../pages/admin/RegistrationManagement"),
);
const Progress = React.lazy(() => import("../pages/admin/Progress"));
const PointsManagement = React.lazy(
  () => import("../pages/admin/PointsManagement"),
);
const Settings = React.lazy(() => import("../pages/admin/Settings"));

// Student 懒加载组件
const StudentDashboard = React.lazy(() => import("../pages/student/Dashboard"));
const StudentCompetitions = React.lazy(
  () => import("../pages/student/Competitions"),
);
const SubmitCompetition = React.lazy(
  () => import("../pages/student/SubmitCompetition"),
);
const StudentRegistrations = React.lazy(
  () => import("../pages/student/Registrations"),
);
const StudentScores = React.lazy(() => import("../pages/student/Scores"));

const { Header, Sider, Content } = AntLayout;
const { Title, Text } = Typography;

interface LayoutProps {
  userType: "admin" | "student";
}

// 路径到页面标题的映射，包含权限要求
interface PageTitleConfig {
  title?: string; // dynamic 为 true 时无需填写
  permission?: number; // 需要的权限
  dynamic?: boolean; // 标题由页面自身根据运行时状态设置，Layout 不写入
}

const PAGE_TITLES: Record<string, PageTitleConfig> = {
  // 管理端
  "/admin": { title: "仪表板" },
  "/admin/submit-competition": { title: "提交推荐项目" },
  "/admin/users": {
    title: "用户管理",
    permission: PERMISSIONS.USER_MANAGEMENT,
  },
  "/admin/students": {
    title: "学生管理",
    permission: PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT,
  },
  "/admin/classes": {
    title: "班级管理",
    permission: PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT,
  },
  "/admin/competitions": {
    title: "项目管理",
    permission: PERMISSIONS.PROJECT_MANAGEMENT,
  },
  "/admin/registrations": {
    title: "报名管理",
    permission: PERMISSIONS.REGISTRATION_MANAGEMENT,
  },
  "/admin/progress": {
    title: "成绩与赛事进程",
    permission: PERMISSIONS.SCORE_AND_PROGRESS | PERMISSIONS.SCORE_REVIEW,
  },
  "/admin/points": {
    title: "得分管理",
    permission: PERMISSIONS.PROJECT_MANAGEMENT,
  },
  "/admin/settings": {
    title: "系统设置",
    permission: PERMISSIONS.WEBSITE_MANAGEMENT,
  },
  // 学生端
  "/student": { title: "个人中心" },
  "/student/competitions": { title: "项目总览" },
  "/student/submit": { title: "推荐项目" },
  "/student/registrations": { title: "我的报名" },
  "/student/scores": { title: "我的成绩" },
};

const Layout: React.FC<LayoutProps> = ({ userType }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const {
    name: websiteName,
    logo_url,
    allow_student_submission,
  } = useWebsite();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const isMobile = useIsMobile();
  const siderWidth = isMobile ? 0 : collapsed ? 64 : 256;
  const [drawerVisible, setDrawerVisible] = useState(false);

  // 查找当前路径对应的标题配置（支持 :id 参数模式）
  const pageTitleConfig =
    PAGE_TITLES[location.pathname] ??
    Object.entries(PAGE_TITLES).find(([pattern]) =>
      new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`).test(
        location.pathname,
      ),
    )?.[1];

  // 获取当前页面标题（带权限检查）
  const getPageTitle = (): string | undefined => {
    const config = pageTitleConfig;
    if (!config) return undefined;

    // 检查权限
    if (config.permission && !hasPermission(config.permission)) {
      return undefined;
    }

    return config.title;
  };

  // dynamic 路由交由页面自身设置标题，Layout 不写入
  usePageTitle(getPageTitle(), { skip: pageTitleConfig?.dynamic });

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // 回到角色对应的后台首页
  const goHome = () => {
    navigate(userType === "admin" ? "/admin" : "/student");
  };

  // 返回公开看板
  const handleGoHome = () => {
    navigate("/");
  };

  // 菜单项 label 使用 Link，保留中键新开与链接语义
  const navLink = (key: string, text: string) => (
    <Link to={key} onClick={() => isMobile && setDrawerVisible(false)}>
      {text}
    </Link>
  );

  // 构建管理员菜单项
  const getAdminMenuItems = () => {
    return [
      {
        key: "/admin",
        icon: <DashboardOutlined />,
        label: navLink("/admin", "仪表板"),
      },
      // 班级账号专属：代本班学生提交推荐项目
      user?.class_id && {
        key: "/admin/submit-competition",
        icon: <PlusCircleOutlined />,
        label: navLink("/admin/submit-competition", "提交推荐项目"),
      },
      hasPermission(PERMISSIONS.USER_MANAGEMENT) && {
        key: "/admin/users",
        icon: <UserOutlined />,
        label: navLink("/admin/users", "用户管理"),
      },
      hasPermission(PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT) && {
        key: "student-class",
        icon: <TeamOutlined />,
        label: "学生班级",
        children: [
          {
            key: "/admin/students",
            icon: <UserOutlined />,
            label: navLink("/admin/students", "学生管理"),
          },
          {
            key: "/admin/classes",
            icon: <BookOutlined />,
            label: navLink("/admin/classes", "班级管理"),
          },
        ],
      },
      hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && {
        key: "/admin/competitions",
        icon: <TrophyOutlined />,
        label: navLink("/admin/competitions", "项目管理"),
      },
      hasPermission(PERMISSIONS.REGISTRATION_MANAGEMENT) && {
        key: "/admin/registrations",
        icon: <FormOutlined />,
        label: navLink("/admin/registrations", "报名管理"),
      },
      (hasPermission(PERMISSIONS.SCORE_AND_PROGRESS) ||
        hasPermission(PERMISSIONS.SCORE_REVIEW)) && {
        key: "/admin/progress",
        icon: <EditOutlined />,
        label: navLink("/admin/progress", "成绩与赛事进程"),
      },
      hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && {
        key: "/admin/points",
        icon: <TrophyOutlined />,
        label: navLink("/admin/points", "得分管理"),
      },
      hasPermission(PERMISSIONS.WEBSITE_MANAGEMENT) && {
        key: "/admin/settings",
        icon: <SettingOutlined />,
        label: navLink("/admin/settings", "网站设置"),
      },
    ].filter(Boolean);
  };

  // 构建学生菜单项
  const getStudentMenuItems = () => {
    return [
      {
        key: "/student",
        icon: <DashboardOutlined />,
        label: navLink("/student", "个人中心"),
      },
      {
        key: "/student/competitions",
        icon: <TrophyOutlined />,
        label: navLink("/student/competitions", "项目总览"),
      },
      // 学生本人提交被配置关闭时隐藏入口（班级账号走管理端）
      allow_student_submission && {
        key: "/student/submit",
        icon: <FormOutlined />,
        label: navLink("/student/submit", "推荐项目"),
      },
      {
        key: "/student/registrations",
        icon: <FileTextOutlined />,
        label: navLink("/student/registrations", "我的报名"),
      },
      {
        key: "/student/scores",
        icon: <BarChartOutlined />,
        label: navLink("/student/scores", "我的成绩"),
      },
    ].filter(Boolean);
  };

  const menuItems =
    userType === "admin" ? getAdminMenuItems() : getStudentMenuItems();

  const userMenu = {
    items: [
      {
        key: "home",
        icon: <HomeOutlined />,
        label: "返回首页",
        onClick: handleGoHome,
      },
      {
        type: "divider" as const,
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: handleLogout,
      },
    ],
  };

  const getSelectedKeys = () => {
    const pathname = location.pathname;
    // 子页面 → 父菜单项 key 的显式映射，新增子路由页面时在此登记
    const subPageMap: Array<{ prefix: string; key: string }> = [
      // { prefix: "/admin/students/", key: "/admin/students" },
    ];
    for (const { prefix, key } of subPageMap) {
      if (pathname === prefix || pathname.startsWith(prefix)) {
        return [key];
      }
    }
    return [pathname];
  };

  const getDefaultOpenKeys = () => {
    const pathname = location.pathname;
    const defaultOpenKeys: string[] = [];

    if (userType === "admin") {
      // 学生班级管理子菜单
      if (
        pathname.includes("/admin/students") ||
        pathname.includes("/admin/classes")
      ) {
        defaultOpenKeys.push("student-class");
      }
    }

    return defaultOpenKeys;
  };

  // 初始化时设置默认展开的菜单
  React.useEffect(() => {
    setOpenKeys(getDefaultOpenKeys());
    // 移动端路由变化时关闭抽屉
    if (isMobile) {
      setDrawerVisible(false);
    }
  }, [location.pathname, userType, isMobile]);

  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
  };

  const handleMenuToggle = () => {
    if (isMobile) {
      setDrawerVisible(!drawerVisible);
    } else {
      setCollapsed(!collapsed);
    }
  };

  const renderRoutes = () => {
    if (userType === "admin") {
      return (
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
          {user?.class_id && (
            <Route
              path="/submit-competition"
              element={<AdminSubmitCompetition />}
            />
          )}
          {hasPermission(PERMISSIONS.USER_MANAGEMENT) && (
            <Route path="/users" element={<UserManagement />} />
          )}
          {hasPermission(PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT) && (
            <>
              <Route path="/students" element={<StudentManagement />} />
              <Route path="/classes" element={<ClassManagement />} />
            </>
          )}
          {hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && (
            <Route path="/competitions" element={<CompetitionManagement />} />
          )}
          {hasPermission(PERMISSIONS.REGISTRATION_MANAGEMENT) && (
            <Route path="/registrations" element={<RegistrationManagement />} />
          )}
          {(hasPermission(PERMISSIONS.SCORE_AND_PROGRESS) ||
            hasPermission(PERMISSIONS.SCORE_REVIEW)) && (
            <Route path="/progress" element={<Progress />} />
          )}
          {hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && (
            <Route path="/points" element={<PointsManagement />} />
          )}
          {hasPermission(PERMISSIONS.WEBSITE_MANAGEMENT) && (
            <Route path="/settings" element={<Settings />} />
          )}
          {/* 404处理 - 未匹配的管理员路由 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      );
    } else {
      return (
        <Routes>
          <Route path="/" element={<StudentDashboard />} />
          <Route path="/competitions" element={<StudentCompetitions />} />
          <Route path="/submit" element={<SubmitCompetition />} />
          <Route path="/registrations" element={<StudentRegistrations />} />
          <Route path="/scores" element={<StudentScores />} />
          {/* 404处理 - 未匹配的学生路由 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      );
    }
  };

  const roleText = userType === "admin" ? "管理员" : "学生";

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          position: "fixed",
          top: 0,
          width: "100%",
          zIndex: 1000,
          padding: "0 16px",
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* 顶栏底边线：从侧边栏右缘开始 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: siderWidth - 1,
            right: 0,
            bottom: 0,
            height: 1,
            background: "rgba(226, 232, 240, 0.8)",
            transition: "left 0.2s",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <Button
            type="text"
            icon={
              collapsed || isMobile ? (
                <MenuUnfoldOutlined />
              ) : (
                <MenuFoldOutlined />
              )
            }
            onClick={handleMenuToggle}
            aria-label={collapsed || isMobile ? "展开菜单" : "收起菜单"}
            style={{ marginRight: 16, color: "#666" }}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={goHome}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                goHome();
              }
            }}
            style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
          >
            {logo_url && (
              <img
                src={logo_url}
                alt="Logo"
                style={{
                  height: "32px",
                  marginRight: "12px",
                  objectFit: "contain",
                }}
              />
            )}
            <Title
              level={4}
              style={{
                margin: 0,
                whiteSpace: "nowrap",
                fontSize: isMobile ? "16px" : "20px",
                textAlign: "left",
                color: "#1f2937",
                fontWeight: 700,
                letterSpacing: "-0.5px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {websiteName}
            </Title>
          </div>
        </div>

        <Dropdown menu={userMenu} placement="bottomRight">
          <Space style={{ cursor: "pointer" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ lineHeight: "20px" }}>
                <Text strong style={{ fontSize: "14px", whiteSpace: "nowrap" }}>
                  {user?.full_name}
                </Text>
              </div>
              <div style={{ lineHeight: "16px" }}>
                <Text
                  type="secondary"
                  style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                >
                  {roleText}
                </Text>
              </div>
            </div>
            {isMobile ? null : <Avatar icon={<UserOutlined />} />}
          </Space>
        </Dropdown>
      </Header>

      <AntLayout style={{ marginTop: 64 }}>
        {/* 移动端抽屉菜单 */}
        {isMobile ? (
          <Drawer
            title={websiteName}
            placement="left"
            onClose={() => setDrawerVisible(false)}
            open={drawerVisible}
            width={280}
            bodyStyle={{ padding: 0 }}
          >
            <Menu
              mode="inline"
              selectedKeys={getSelectedKeys()}
              openKeys={openKeys}
              onOpenChange={handleOpenChange}
              items={menuItems as any}
              style={{ border: 0 }}
            />
          </Drawer>
        ) : (
          <Sider
            collapsible
            collapsed={collapsed}
            trigger={null}
            width={256}
            collapsedWidth={64}
            theme="light"
            style={{
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRight: "1px solid rgba(226, 232, 240, 0.8)",
              boxShadow: "none",
              height: "calc(100vh - 64px)",
              overflow: "auto",
              position: "fixed",
              left: 0,
              top: 64,
            }}
          >
            <Menu
              mode="inline"
              selectedKeys={getSelectedKeys()}
              openKeys={openKeys}
              onOpenChange={handleOpenChange}
              items={menuItems as any}
              style={{ borderRight: 0 }}
            />
          </Sider>
        )}

        <AntLayout
          style={{
            marginLeft: siderWidth,
            transition: "margin-left 0.2s",
            background: "#F7F8F9",
            minHeight: "calc(100vh - 64px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Content
            style={{
              padding: isMobile ? "16px" : "24px",
              background: "#F7F8F9",
              flex: 1,
            }}
          >
            <Suspense fallback={<LoadingSpinner />}>{renderRoutes()}</Suspense>
          </Content>
        </AntLayout>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
