import { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Card,
  Row,
  Col,
  Tag,
  Statistic,
  Button,
  Space,
  Typography,
  List,
} from "antd";
import {
  NotificationOutlined,
  TrophyOutlined,
  FileTextOutlined,
  BarChartOutlined,
  PlusOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CrownOutlined,
  FireOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { studentAPI } from "../../api/student";
import { Competition, Score } from "../../types";
import { handleRespWithoutNotify } from "../../utils/handleResp";
import { useIsMobile } from "../../utils/mobile";
import { getRankingColor } from "../../utils/competition";

const { Title, Text } = Typography;

interface PointsSummary {
  student_id: number;
  student_name: string;
  class_id: number;
  class_name: string;
  total_points: number;
  ranking_points: number;
  rank: number;
}

const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<Competition[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [pointsSummary, setPointsSummary] = useState<PointsSummary | null>(
    null,
  );
  const [checkingIn, setCheckingIn] = useState<Competition[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [registrationData, scoresData, pointsData] = await Promise.allSettled(
      [
        studentAPI.getRegistrations(),
        studentAPI.getScores(),
        studentAPI.getPointsSummary(),
      ],
    );

    if (registrationData.status === "fulfilled") {
      handleRespWithoutNotify(registrationData.value, (data) => {
        const regs = data || [];
        setRegistrations(regs);
        // 检录提醒只针对本人已报名的比赛
        setCheckingIn(regs.filter((comp) => comp.status === "checking_in"));
      });
    }
    if (scoresData.status === "fulfilled") {
      handleRespWithoutNotify(scoresData.value, (data) => {
        setScores(data || []);
      });
    }
    if (pointsData.status === "fulfilled") {
      handleRespWithoutNotify(pointsData.value, (data) => {
        setPointsSummary(data || null);
      });
    }
  };

  const isMobile = useIsMobile();

  return (
    <div>
      {/* 欢迎信息 */}
      <Card style={{ marginBottom: isMobile ? 12 : 24 }}>
        <Title
          level={3}
          style={{ color: "#1f2937", marginBottom: 4, marginTop: 0 }}
        >
          你好，{user?.full_name}同学！
        </Title>
        <Text style={{ color: "#6b7280", fontSize: 16 }}>
          在这里提交推荐项目、管理你的比赛报名、查看你的成绩
        </Text>
      </Card>

      {/* 检录中的比赛提示 */}
      {checkingIn.length > 0 && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: "#fffbe6",
          }}
          styles={{ body: { padding: "12px 16px" } }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Space size={8}>
              <NotificationOutlined style={{ color: "#faad14" }} />
              <Text strong>检录提醒</Text>
            </Space>
            <Button
              size="small"
              onClick={() => navigate("/student/competitions")}
            >
              去查看
            </Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checkingIn.map((comp) => (
              <div key={comp.id}>
                <Text strong>{comp.name}</Text>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {comp.venue && <>地点：{comp.venue}</>}
                  {comp.venue && comp.start_time && " · "}
                  {comp.start_time && (
                    <>
                      计划开始：
                      {dayjs(comp.start_time).format("MM-DD HH:mm")}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 统计卡片 */}
      <Row
        gutter={isMobile ? [12, 12] : [24, 24]}
        style={{ marginBottom: isMobile ? 12 : 24 }}
      >
        <Col xs={12} sm={12} md={6}>
          <Card
            className="hover-card"
            onClick={() => navigate("/student/registrations")}
          >
            <Statistic
              title="我的报名"
              value={registrations?.length}
              prefix={<FileTextOutlined style={{ color: "#4C80F8" }} />}
              valueStyle={{ color: "#1f2937" }}
              suffix="项"
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card
            className="hover-card"
            onClick={() => navigate("/student/scores")}
          >
            <Statistic
              title="已完成比赛"
              value={scores?.length}
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#1f2937" }}
              suffix="场"
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="hover-card">
            <Statistic
              title="当前排名"
              value={pointsSummary?.rank || "-"}
              prefix={<CrownOutlined style={{ color: "#faad14" }} />}
              valueStyle={{ color: "#1f2937" }}
              suffix={pointsSummary?.rank ? "名" : ""}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="hover-card">
            <Statistic
              title="总得分"
              value={pointsSummary?.total_points?.toFixed(1) || "0"}
              prefix={<FireOutlined style={{ color: "#f5222d" }} />}
              valueStyle={{ color: "#1f2937" }}
              suffix="分"
            />
          </Card>
        </Col>
      </Row>

      {/* 最近成绩 */}
      <Card
        title={
          <Space>
            <TrophyOutlined />
            最近成绩
          </Space>
        }
        extra={
          <Button size="small" onClick={() => navigate("/student/scores")}>
            查看全部
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        {scores?.length > 0 ? (
          <List
            dataSource={scores?.slice(0, 5)}
            renderItem={(item) => (
              <List.Item>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    width: "100%",
                  }}
                >
                  <Space size={8} style={{ minWidth: 0 }}>
                    <Tag
                      style={{
                        color: getRankingColor(item.ranking),
                        borderColor: getRankingColor(item.ranking),
                        marginInlineEnd: 0,
                      }}
                    >
                      第 {item.ranking} 名
                    </Tag>
                    <span style={{ fontWeight: 500 }}>
                      {item.competition_name}
                    </span>
                  </Space>
                  <span
                    style={{
                      fontWeight: 700,
                      color: getRankingColor(item.ranking),
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.score}
                    {item.unit && (
                      <span
                        style={{ fontSize: 12, fontWeight: 500, marginLeft: 2 }}
                      >
                        {item.unit}
                      </span>
                    )}
                  </span>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "20px 0",
              color: "#999",
            }}
          >
            <TrophyOutlined style={{ fontSize: "32px", marginBottom: "8px" }} />
            <div>还没有比赛成绩</div>
            <Button
              type="link"
              onClick={() => navigate("/student/competitions")}
            >
              去报名比赛
            </Button>
          </div>
        )}
      </Card>

      {/* 快捷操作 */}
      <Card title="快捷操作">
        <Row gutter={16}>
          <Col xs={24} sm={6}>
            <Button
              block
              size="large"
              icon={<EyeOutlined />}
              onClick={() => navigate("/student/competitions")}
            >
              报名比赛项目
            </Button>
          </Col>
          <Col xs={24} sm={6}>
            <Button
              block
              size="large"
              icon={<PlusOutlined />}
              onClick={() => navigate("/student/submit")}
            >
              推荐新项目
            </Button>
          </Col>
          <Col xs={24} sm={6}>
            <Button
              block
              size="large"
              icon={<FileTextOutlined />}
              onClick={() => navigate("/student/registrations")}
            >
              查看我的报名
            </Button>
          </Col>
          <Col xs={24} sm={6}>
            <Button
              block
              size="large"
              icon={<BarChartOutlined />}
              onClick={() => navigate("/student/scores")}
            >
              查看我的成绩
            </Button>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default StudentDashboard;
