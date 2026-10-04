import { useState, useEffect } from "react";
import {
  Card,
  Tag,
  Typography,
  Button,
  Space,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  TrophyOutlined,
  ReloadOutlined,
  StarOutlined,
  FireOutlined,
} from "@ant-design/icons";
import { studentAPI } from "../../api/student";
import { Score } from "../../types";
import { handleResp, handleRespWithoutNotify } from "../../utils/handleResp";
import {
  getRankingColor,
  getWinningCount,
  getBestRanking,
} from "../../utils/competition";

const { Title } = Typography;

const StudentScores: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [pointsSummary, setPointsSummary] = useState<{
    total_points: number;
    rank: number;
  } | null>(null);

  useEffect(() => {
    fetchScores();
  }, []);

  const fetchScores = async () => {
    setLoading(true);
    const [scoresData, pointsData] = await Promise.all([
      studentAPI.getScores(),
      studentAPI.getPointsSummary(),
    ]);
    handleResp(
      scoresData,
      (data) => {
        setScores(data || []);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    handleRespWithoutNotify(pointsData, (data) => {
      setPointsSummary(data || null);
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={2}>我的成绩</Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchScores}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      {/* 成绩统计 */}
      {scores?.length > 0 && (
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="参赛项目"
                value={scores.length}
                prefix={<TrophyOutlined />}
                valueStyle={{ color: "#1677ff" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="获奖次数"
                value={getWinningCount(scores)}
                prefix={<StarOutlined />}
                valueStyle={{ color: "#52c41a" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="最佳排名"
                value={getBestRanking(scores) || "-"}
                prefix={
                  getBestRanking(scores) === 1 ? (
                    "🥇"
                  ) : getBestRanking(scores) === 2 ? (
                    "🥈"
                  ) : getBestRanking(scores) === 3 ? (
                    "🥉"
                  ) : (
                    <TrophyOutlined />
                  )
                }
                valueStyle={{
                  color: getBestRanking(scores)
                    ? getRankingColor(getBestRanking(scores) ?? undefined)
                    : "#666",
                }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="总得分"
                value={pointsSummary?.total_points?.toFixed(1) || "0"}
                prefix={<FireOutlined />}
                valueStyle={{ color: "#f5222d" }}
                suffix="分"
              />
            </Card>
          </Col>
        </Row>
      )}

      {scores?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scores.map((score) => (
            <Card
              key={score.id}
              size="small"
              styles={{ body: { padding: "12px 16px" } }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {score.competition_name}
                  </div>
                  <Space size={6} wrap>
                    <Tag
                      style={{
                        color: getRankingColor(score.ranking),
                        borderColor: getRankingColor(score.ranking),
                        marginInlineEnd: 0,
                      }}
                    >
                      第 {score.ranking} 名
                    </Tag>
                    <Tag style={{ marginInlineEnd: 0 }}>
                      得分 {score.point ?? 0} 分
                    </Tag>
                  </Space>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: getRankingColor(score.ranking),
                      lineHeight: 1.2,
                    }}
                  >
                    {score.score}
                    {score.unit && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          marginLeft: 3,
                        }}
                      >
                        {score.unit}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#999" }}>成绩</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentScores;
