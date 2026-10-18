import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LoadingSpinner from "../components/Spinner";

// 懒加载组件
const PublicScoreboard = React.lazy(
  () => import("../pages/public/PublicScoreboard"),
);
const DingtalkAuth = React.lazy(() => import("../pages/auth/DingtalkAuth"));
const Layout = React.lazy(() => import("./Layout"));

// 路由守卫组件
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requirePermission?: number;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = false,
  requireAdmin = false,
  requirePermission,
}) => {
  const { isAuthenticated, isAdmin, hasPermission } = useAuth();

  // 需要认证但未登录
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/" state={{ openLogin: true }} replace />;
  }

  // 需要管理员权限但不是管理员
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // 需要特定权限但没有权限
  if (requirePermission && !hasPermission(requirePermission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRouter: React.FC = () => {
  const { isStudent, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* 公共路由 - 游客访问的成绩看板，已认证用户重定向到对应首页 */}
        <Route path="/" element={<PublicScoreboard />} />

        {/* 钉钉登录页面 */}
        <Route path="/auth/dingtalk" element={<DingtalkAuth />} />

        {/* 管理员路由 */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requireAuth requireAdmin>
              <Layout userType="admin" />
            </ProtectedRoute>
          }
        />

        {/* 学生路由 */}
        <Route
          path="/student/*"
          element={
            <ProtectedRoute requireAuth>
              {isStudent ? (
                <Layout userType="student" />
              ) : (
                <Navigate to="/" replace />
              )}
            </ProtectedRoute>
          }
        />

        {/* 404处理 - 重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
