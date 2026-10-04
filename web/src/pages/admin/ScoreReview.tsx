import { useRef, useState, useEffect } from "react";
import {
  Card,
  Checkbox,
  Table,
  Button,
  Space,
  Select,
  Typography,
  Row,
  Col,
  Popconfirm,
} from "antd";
import {
  CheckOutlined,
  ReloadOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { adminScoreReviewAPI } from "../../api/admin/score";
import { Competition, Score } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import {
  getStatusTag,
  getGenderText,
  getRankingModeText,
  getRankingDisplayForTable,
} from "../../utils/competition";
import { useIsMobile } from "../../utils/mobile";

const { Title, Text } = Typography;
const { Option } = Select;

const ScoreReview: React.FC = () => {
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [reviewedCompetitions, setReviewedCompetitions] = useState<
    Competition[]
  >([]);
  const [selectedCompetition, setSelectedCompetition] =
    useState<Competition | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [allPendingScores, setAllPendingScores] = useState<{
    [key: number]: Score[];
  }>({});

  const fetchCompetitions = async () => {
    setLoading(true);
    const data = await adminScoreReviewAPI.getCompetitions();
    handleResp(
      data,
      (data) => {
        // 待审核成绩的比赛
        const pendingCompetitions = data?.filter(
          (c) => c.status === "pending_score_review",
        );
        setCompetitions(pendingCompetitions ? pendingCompetitions : []);

        // 已审核完成的比赛
        const reviewedCompetitions = data?.filter(
          (c) => c.status === "completed",
        );
        setReviewedCompetitions(
          reviewedCompetitions ? reviewedCompetitions : [],
        );
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const fetchScores = async (competitionId: number) => {
    setLoading(true);
    const data = await adminScoreReviewAPI.getCompetitionScores(competitionId);
    handleResp(
      data,
      (data) => {
        setScores(data ? data : []);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    fetchCompetitions();
  }, []);

  // 获取所有待审核比赛的成绩
  useEffect(() => {
    if (competitions.length > 0) {
      const fetchAllPendingScores = async () => {
        setLoading(true);
        const scoresMap: { [key: number]: Score[] } = {};

        for (const competition of competitions) {
          const competitionScores =
            await adminScoreReviewAPI.getCompetitionScores(competition.id);
          handleResp(competitionScores, (data) => {
            if (data) {
              scoresMap[competition.id] = data;
            }
          });
        }

        setAllPendingScores(scoresMap);
        setLoading(false);
      };

      fetchAllPendingScores();
    } else {
      setAllPendingScores({});
    }
  }, [competitions]);

  const handleCompetitionChange = async (competitionId: number) => {
    const competition = [...competitions, ...reviewedCompetitions].find(
      (c) => c.id === competitionId,
    );
    setSelectedCompetition(competition || null);
    if (competitionId) {
      await fetchScores(competitionId);
    }
  };

  // 成绩公布钉钉通知开关（由审核确认框中的勾选决定，默认开启）
  const notifyPublishedRef = useRef(true);

  const handleApproveScores = async (competitionId?: number) => {
    const competitionsToReview = competitionId
      ? competitions.filter((c) => c.id === competitionId)
      : competitions;

    if (competitionsToReview.length === 0) return;

    // 审核指定的比赛或所有待审核的比赛
    for (const competition of competitionsToReview) {
      const response = await adminScoreReviewAPI.reviewScores({
        competition_id: competition.id,
        notify_published: notifyPublishedRef.current,
      });
      handleRespWithNotifySuccess(
        response,
        () => {},
        () => {
          return; // 如果一个失败，停止执行
        },
      );
    }

    // 刷新数据
    await fetchCompetitions();
    setSelectedCompetition(null);
    setScores([]);
    setAllPendingScores({});
  };

  const handleApproveAllScores = () => handleApproveScores();

  const handleApproveCompetitionScores = (competitionId: number) => () =>
    handleApproveScores(competitionId);

  const getColumns = (competition?: Competition) => {
    const isTeamCompetition = competition?.competition_type === "team";
    const cols: Array<{
      title: string;
      dataIndex: string;
      key: string;
      render?: (value: unknown, record: Score) => React.ReactNode;
    }> = [
      {
        title: "排名",
        dataIndex: "ranking",
        key: "ranking",
        render: (ranking: unknown) =>
          getRankingDisplayForTable(ranking as number | undefined),
      },
    ];

    // 团体比赛不显示学生姓名列
    if (!isTeamCompetition) {
      cols.push({
        title: "学生姓名",
        dataIndex: "student_name",
        key: "student_name",
        render: (name: unknown) => name as string,
      });
    }

    cols.push(
      {
        title: "班级",
        dataIndex: "class_name",
        key: "class_name",
        render: (className: unknown) => className as string,
      },
      {
        title: "成绩",
        dataIndex: "score",
        key: "score",
        render: (score: unknown, record: Score) => {
          const comp = [...competitions, ...reviewedCompetitions].find(
            (c) => c.id === record.competition_id,
          );
          return (
            <span>
              {score as number} {comp?.unit}
            </span>
          );
        },
      },
      {
        title: "分数",
        dataIndex: "point",
        key: "point",
        render: (point: unknown) => <span>{point as number}</span>,
      },
    );

    return cols;
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>成绩审核</Title>
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: 16,
            }}
          >
            <Select
              placeholder="选择已审核的比赛"
              onChange={handleCompetitionChange}
              allowClear
              value={selectedCompetition?.id}
              size="large"
              style={{ width: "100%" }}
            >
              {reviewedCompetitions.map((competition) => (
                <Option key={competition.id} value={competition.id}>
                  {competition.name} {getStatusTag(competition.status)}
                </Option>
              ))}
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchCompetitions}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              刷新
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Select
                placeholder="可选择已审核成绩的比赛"
                style={{ width: 300 }}
                onChange={handleCompetitionChange}
                allowClear
                value={selectedCompetition?.id}
              >
                {reviewedCompetitions.map((competition) => (
                  <Option key={competition.id} value={competition.id}>
                    {competition.name} {getStatusTag(competition.status)}
                  </Option>
                ))}
              </Select>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchCompetitions}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>
        )}
      </div>

      {competitions.length === 0 && !loading && (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <TrophyOutlined style={{ fontSize: "64px", color: "#d9d9d9" }} />
            <Title level={4} style={{ color: "#999", marginTop: 16 }}>
              暂无待审核的成绩
            </Title>
            <Text type="secondary">当前没有需要审核的比赛成绩</Text>
          </div>
        </Card>
      )}

      {/* 按比赛分别显示待审核的成绩 */}
      {!selectedCompetition && competitions.length > 0 && (
        <div>
          <Row
            justify="space-between"
            align="middle"
            style={{ marginBottom: 16 }}
          >
            <Col>
              <Title level={3}>待审核成绩</Title>
            </Col>
          </Row>

          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {competitions.map((competition) => {
              const competitionScores = allPendingScores[competition.id] || [];

              return (
                <Card
                  key={competition.id}
                  title={
                    <Space>
                      <TrophyOutlined />
                      {competition.name}
                      {getStatusTag(competition.status)}
                    </Space>
                  }
                  extra={
                    <Popconfirm
                      title={`确定审核通过"${competition.name}"的成绩吗？`}
                      description={
                        <div>
                          <div>审核通过后，成绩将正式发布</div>
                          <Checkbox
                            defaultChecked
                            onChange={(e) =>
                              (notifyPublishedRef.current = e.target.checked)
                            }
                          >
                            钉钉通知有成绩的学生
                          </Checkbox>
                        </div>
                      }
                      onConfirm={handleApproveCompetitionScores(competition.id)}
                      onOpenChange={(open) => {
                        if (open) notifyPublishedRef.current = true;
                      }}
                      okText="确定审核通过"
                      cancelText="取消"
                    >
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        size="small"
                      >
                        审核通过本项目
                      </Button>
                    </Popconfirm>
                  }
                >
                  {/* 比赛信息 */}
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 16,
                      background: "#f5f5f5",
                      borderRadius: 8,
                    }}
                  >
                    <Row gutter={16}>
                      <Col span={6}>
                        <Text strong>性别要求：</Text>
                        <br />
                        <Text>{getGenderText(competition.gender)}</Text>
                      </Col>
                      <Col span={6}>
                        <Text strong>成绩单位：</Text>
                        <br />
                        <Text>{competition.unit}</Text>
                      </Col>
                      <Col span={6}>
                        <Text strong>排名方式：</Text>
                        <br />
                        <Text>
                          {getRankingModeText(competition.ranking_mode)}
                        </Text>
                      </Col>
                      <Col span={6}>
                        <Text strong>
                          参赛
                          {competition.competition_type === "team"
                            ? "班级"
                            : "人"}
                          数：
                        </Text>
                        <br />
                        <Text>
                          {competitionScores.length}{" "}
                          {competition.competition_type === "team"
                            ? "个班级"
                            : "人"}
                        </Text>
                      </Col>
                    </Row>
                  </div>

                  <Table
                    columns={getColumns(competition)}
                    dataSource={competitionScores}
                    rowKey="id"
                    tableLayout="auto"
                    loading={loading}
                    pagination={{
                      pageSize: 10,
                      showTotal: (total) => `共 ${total} 条成绩`,
                    }}
                    locale={{
                      emptyText: "暂无成绩数据",
                    }}
                  />
                </Card>
              );
            })}
          </Space>
        </div>
      )}

      {selectedCompetition && (
        <Card
          title={
            <Space>
              <TrophyOutlined />
              {selectedCompetition.name} - 成绩审核
            </Space>
          }
          extra={
            <Space>
              {getStatusTag(selectedCompetition.status)}
              <Popconfirm
                title="确定审核通过这些成绩吗？"
                description={
                  <div>
                    <div>审核通过后，成绩将正式发布，无法撤回</div>
                    <Checkbox
                      defaultChecked
                      onChange={(e) =>
                        (notifyPublishedRef.current = e.target.checked)
                      }
                    >
                      钉钉通知有成绩的学生
                    </Checkbox>
                  </div>
                }
                onConfirm={handleApproveAllScores}
                onOpenChange={(open) => {
                  if (open) notifyPublishedRef.current = true;
                }}
                okText="确定审核通过"
                cancelText="取消"
              >
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  disabled={competitions.length === 0}
                >
                  审核通过所有成绩
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          {/* 比赛信息 */}
          <div
            style={{
              marginBottom: 16,
              padding: 16,
              background: "#f5f5f5",
              borderRadius: 8,
            }}
          >
            <Row gutter={16}>
              <Col span={6}>
                <Text strong>性别要求：</Text>
                <br />
                <Text>{getGenderText(selectedCompetition.gender)}</Text>
              </Col>
              <Col span={6}>
                <Text strong>成绩单位：</Text>
                <br />
                <Text>{selectedCompetition.unit}</Text>
              </Col>
              <Col span={6}>
                <Text strong>排名方式：</Text>
                <br />
                <Text>
                  {getRankingModeText(selectedCompetition.ranking_mode)}
                </Text>
              </Col>
              <Col span={6}>
                <Text strong>
                  参赛
                  {selectedCompetition.competition_type === "team"
                    ? "班级"
                    : "人"}
                  数：
                </Text>
                <br />
                <Text>
                  {scores.length}{" "}
                  {selectedCompetition.competition_type === "team"
                    ? "个班级"
                    : "人"}
                </Text>
              </Col>
            </Row>
          </div>

          <Table
            columns={getColumns(selectedCompetition)}
            dataSource={scores}
            rowKey="id"
            tableLayout="auto"
            loading={loading}
            pagination={{
              pageSize: 20,
              showTotal: (total) => `共 ${total} 条成绩`,
            }}
            locale={{
              emptyText: "暂无成绩数据",
            }}
          />
        </Card>
      )}
    </div>
  );
};

export default ScoreReview;
