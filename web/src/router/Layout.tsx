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
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  TeamOutlined,
  TrophyOutlined,
  EditOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  BookOutlined,
  HomeOutlined,
  FormOutlined,
  FileTextOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import { useWebsite } from "../contexts/WebsiteContext";
import { PERMISSIONS } from "../types";
import { useIsMobile } from "../utils";
import Footer from "../components/Footer";
import LoadingSpinner from "../components/Spinner";
import NotFound from "../components/NotFound";

// Admin 懒加载组件
const AdminDashboard = React.lazy(() => import("../pages/admin/Dashboard"));
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
const ScoreInput = React.lazy(() => import("../pages/admin/ScoreInput"));
const ScoreReview = React.lazy(() => import("../pages/admin/ScoreReview"));
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

const Layout: React.FC<LayoutProps> = ({ userType }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const { name: websiteName } = useWebsite();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const isMobile = useIsMobile();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleGoHome = () => {
    navigate("/");
  };

  // 构建管理员菜单项
  const getAdminMenuItems = () => {
    return [
      {
        key: "/admin",
        icon: <DashboardOutlined />,
        label: "仪表板",
      },
      hasPermission(PERMISSIONS.USER_MANAGEMENT) && {
        key: "/admin/users",
        icon: <UserOutlined />,
        label: "用户管理",
      },
      hasPermission(PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT) && {
        key: "student-class",
        icon: <TeamOutlined />,
        label: "学生班级",
        children: [
          {
            key: "/admin/students",
            icon: <UserOutlined />,
            label: "学生管理",
          },
          {
            key: "/admin/classes",
            icon: <BookOutlined />,
            label: "班级管理",
          },
        ],
      },
      hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && {
        key: "/admin/competitions",
        icon: <TrophyOutlined />,
        label: "项目管理",
      },
      hasPermission(PERMISSIONS.REGISTRATION_MANAGEMENT) && {
        key: "/admin/registrations",
        icon: <FormOutlined />,
        label: "报名管理",
      },
      (hasPermission(PERMISSIONS.SCORE_INPUT) ||
        hasPermission(PERMISSIONS.SCORE_REVIEW)) && {
        key: "score-management",
        icon: <EditOutlined />,
        label: "成绩管理",
        children: [
          hasPermission(PERMISSIONS.SCORE_INPUT) && {
            key: "/admin/score-input",
            icon: <EditOutlined />,
            label: "成绩录入",
          },
          hasPermission(PERMISSIONS.SCORE_REVIEW) && {
            key: "/admin/score-review",
            icon: <CheckCircleOutlined />,
            label: "成绩审核",
          },
        ],
      },
      hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && {
        key: "/admin/points",
        icon: <TrophyOutlined />,
        label: "得分管理",
      },
      hasPermission(PERMISSIONS.WEBSITE_MANAGEMENT) && {
        key: "/admin/settings",
        icon: <SettingOutlined />,
        label: "网站设置",
      },
    ].filter(Boolean);
  };

  // 构建学生菜单项
  const getStudentMenuItems = () => {
    return [
      {
        key: "/student",
        icon: <DashboardOutlined />,
        label: "个人中心",
      },
      {
        key: "/student/competitions",
        icon: <TrophyOutlined />,
        label: "报名项目",
      },
      {
        key: "/student/submit",
        icon: <FormOutlined />,
        label: "推荐项目",
      },
      {
        key: "/student/registrations",
        icon: <FileTextOutlined />,
        label: "我的报名",
      },
      {
        key: "/student/scores",
        icon: <BarChartOutlined />,
        label: "我的成绩",
      },
    ];
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
    return [location.pathname];
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
      // 成绩管理子菜单
      if (
        pathname.includes("/admin/score-input") ||
        pathname.includes("/admin/score-review")
      ) {
        defaultOpenKeys.push("score-management");
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

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) {
      setDrawerVisible(false);
    }
  };

  const renderRoutes = () => {
    if (userType === "admin") {
      return (
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
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
          {hasPermission(PERMISSIONS.SCORE_INPUT) && (
            <Route path="/score-input" element={<ScoreInput />} />
          )}
          {hasPermission(PERMISSIONS.SCORE_REVIEW) && (
            <Route path="/score-review" element={<ScoreReview />} />
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
          borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
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
            style={{ marginRight: 16, color: "#666" }}
          />
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
            }}
          >
            {websiteName}
          </Title>
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
              onClick={handleMenuClick}
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
              onClick={({ key }) => navigate(key)}
              style={{ borderRight: 0 }}
            />
          </Sider>
        )}

        <AntLayout
          style={{
            marginLeft: isMobile ? 0 : collapsed ? 64 : 256,
            transition: "margin-left 0.2s",
          }}
        >
          <Content
            style={{
              padding: isMobile ? "16px" : "24px",
              background: "#F7F8F9",
              minHeight: "calc(100vh - 64px - 70px)",
            }}
          >
            <Suspense fallback={<LoadingSpinner />}>{renderRoutes()}</Suspense>
          </Content>

          <Footer />
        </AntLayout>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
