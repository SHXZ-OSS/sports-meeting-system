import { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  Space,
  Button,
  Spin,
  Typography,
} from "antd";
import {
  TrophyOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { adminCompetitionAPI } from "../../api/admin/competition";
import { PERMISSIONS } from "../../types";
import { handleRespWithoutNotify } from "../../utils/handleResp";

const { Title, Text } = Typography;

interface DashboardStats {
  totalUsers: number;
  totalStudents: number;
  totalCompetitions: number;
  pendingApproval: number;
  pendingScoreReview: number;
  completedCompetitions: number;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalStudents: 0,
    totalCompetitions: 0,
    pendingApproval: 0,
    pendingScoreReview: 0,
    completedCompetitions: 0,
  });

  // 获取统计数据
  const fetchStats = async () => {
    setLoading(true);
    const promises: Promise<any>[] = [];

    // 根据权限获取不同的数据
    if (hasPermission(PERMISSIONS.PROJECT_MANAGEMENT)) {
      // 请求总比赛数，以及按状态的统计
      promises.push(
        adminCompetitionAPI.getCompetitions({}), // total competitions
        adminCompetitionAPI.getCompetitions({ status: "pending_approval" }),
        adminCompetitionAPI.getCompetitions({ status: "pending_score_review" }),
        adminCompetitionAPI.getCompetitions({ status: "completed" }),
      );
    }

    const results = await Promise.allSettled(promises);
    let resultIndex = 0;
    const newStats = { ...stats };

    // 解析项目统计
    if (hasPermission(PERMISSIONS.PROJECT_MANAGEMENT)) {
      const totalResult = results[resultIndex++];
      const pendingApprovalResult = results[resultIndex++];
      const pendingScoreReviewResult = results[resultIndex++];
      const completedResult = results[resultIndex];

      if (totalResult && totalResult.status === "fulfilled") {
        handleRespWithoutNotify(totalResult.value, (_, pagination) => {
          newStats.totalCompetitions = pagination?.total || 0;
        });
      }

      if (
        pendingApprovalResult &&
        pendingApprovalResult.status === "fulfilled"
      ) {
        handleRespWithoutNotify(
          pendingApprovalResult.value,
          (_, pagination) => {
            newStats.pendingApproval = pagination?.total || 0;
          },
        );
      }

      if (
        pendingScoreReviewResult &&
        pendingScoreReviewResult.status === "fulfilled"
      ) {
        handleRespWithoutNotify(
          pendingScoreReviewResult.value,
          (_, pagination) => {
            newStats.pendingScoreReview = pagination?.total || 0;
          },
        );
      }

      if (completedResult && completedResult.status === "fulfilled") {
        handleRespWithoutNotify(completedResult.value, (_, pagination) => {
          newStats.completedCompetitions = pagination?.total || 0;
        });
      }
    }

    setStats(newStats);
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div>
      <Spin spinning={loading}>
        {/* 欢迎信息 */}
        <Card style={{ marginBottom: 12 }}>
          <Title
            level={3}
            style={{ color: "#1f2937", marginBottom: 4, marginTop: 0 }}
          >
            你好，{user?.full_name}
          </Title>
          <Text style={{ color: "#6b7280", fontSize: 16 }}>
            在这里管理比赛项目、审核成绩、掌握运动会整体进展
          </Text>
        </Card>

        {/* 统计卡片 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          {hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && (
            <>
              <Col xs={12} sm={12} lg={6}>
                <Card className="hover-card">
                  <Statistic
                    title="比赛项目"
                    value={stats.totalCompetitions}
                    prefix={<TrophyOutlined style={{ color: "#4C80F8" }} />}
                    valueStyle={{ color: "#1f2937" }}
                    suffix="个"
                  />
                </Card>
              </Col>

              <Col xs={12} sm={12} lg={6}>
                <Card className="hover-card">
                  <Statistic
                    title="已完成项目"
                    value={stats.completedCompetitions}
                    prefix={
                      <CheckCircleOutlined style={{ color: "#52c41a" }} />
                    }
                    valueStyle={{ color: "#1f2937" }}
                    suffix="个"
                  />
                </Card>
              </Col>

              <Col xs={12} sm={12} lg={6}>
                <Card className="hover-card">
                  <Statistic
                    title="待审核成绩项目"
                    value={stats.pendingScoreReview}
                    prefix={
                      <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
                    }
                    valueStyle={{ color: "#1f2937" }}
                  />
                </Card>
              </Col>
            </>
          )}
        </Row>

        {/* 待处理事项 */}
        {hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12}>
              <Card
                title={
                  <Space>
                    <ClockCircleOutlined />
                    待审核项目
                  </Space>
                }
                extra={
                  stats.pendingApproval > 0 && (
                    <Button
                      size="small"
                      onClick={() => navigate("/admin/competitions")}
                    >
                      查看全部
                    </Button>
                  )
                }
              >
                <Statistic
                  value={stats.pendingApproval}
                  suffix="个项目待审核"
                  valueStyle={{
                    color: stats.pendingApproval > 0 ? "#faad14" : "#666",
                  }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12}>
              <Card
                title={
                  <Space>
                    <ExclamationCircleOutlined />
                    待审核成绩
                  </Space>
                }
                extra={
                  stats.pendingScoreReview > 0 && (
                    <Button
                      size="small"
                      onClick={() => navigate("/admin/progress")}
                    >
                      查看全部
                    </Button>
                  )
                }
              >
                <Statistic
                  value={stats.pendingScoreReview}
                  suffix="个成绩待审核"
                  valueStyle={{
                    color: stats.pendingScoreReview > 0 ? "#ff4d4f" : "#666",
                  }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 快捷操作 */}
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col span={24}>
            <Card title="快捷操作">
              <Row gutter={[12, 12]}>
                {hasPermission(PERMISSIONS.USER_MANAGEMENT) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      type="primary"
                      block
                      size="large"
                      onClick={() => navigate("/admin/users")}
                    >
                      用户管理
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/students")}
                    >
                      学生管理
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/competitions")}
                    >
                      项目管理
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.REGISTRATION_MANAGEMENT) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/registrations")}
                    >
                      报名管理
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.SCORE_AND_PROGRESS) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/progress")}
                    >
                      成绩录入
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.SCORE_REVIEW) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/progress")}
                    >
                      成绩审核
                    </Button>
                  </Col>
                )}
                {hasPermission(PERMISSIONS.WEBSITE_MANAGEMENT) && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Button
                      block
                      size="large"
                      onClick={() => navigate("/admin/settings")}
                    >
                      系统设置
                    </Button>
                  </Col>
                )}
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default Dashboard;
