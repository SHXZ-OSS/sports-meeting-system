import { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Select,
  Image,
  Modal,
  Divider,
  Input,
  message,
  Pagination,
  Empty,
} from "antd";
import {
  TrophyOutlined,
  ReloadOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { studentAPI } from "../../api/student";
import { useWebsite } from "../../contexts/WebsiteContext";
import { Competition, VoteType } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import {
  getStatusTag,
  getGenderText,
  getRankingModeText,
  getCompetitionTypeTag,
} from "../../utils/competition";
import { useIsMobile } from "../../utils/mobile";
import { isTimeInRange } from "../../utils/windows";
import VoteButtons from "../../components/VoteButtons";

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

const StudentCompetitions: React.FC = () => {
  const isMobile = useIsMobile();
  const {
    allow_student_registration,
    registration_start_time,
    registration_end_time,
    voting_start_time,
    voting_end_time,
  } = useWebsite();
  // 时间窗口（空 = 不限制），与后端校验一致
  const registrationOpen = isTimeInRange(
    registration_start_time,
    registration_end_time,
  );
  const votingOpen = isTimeInRange(voting_start_time, voting_end_time);
  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [registrations, setRegistrations] = useState<Competition[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedCompetition, setSelectedCompetition] =
    useState<Competition | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "votes">("name");
  const [userVotes, setUserVotes] = useState<Record<number, VoteType>>({});

  useEffect(() => {
    if (searchText) {
      fetchCompetitions(currentPage, pageSize, true);
    } else {
      fetchCompetitions();
    }
    fetchRegistrations();
  }, [currentPage, pageSize, statusFilter, searchText]);

  // 当排序方式改变时，重新获取数据
  useEffect(() => {
    fetchCompetitions();
  }, [sortBy]);

  // 获取用户投票记录
  useEffect(() => {
    if (competitions.length > 0) {
      fetchUserVotes();
    }
  }, [competitions]);

  const fetchCompetitions = async (
    page = currentPage,
    size = pageSize,
    isSearch = false,
  ) => {
    setLoading(true);
    const params: {
      status?: string;
      sort_by?: "name" | "votes";
      page?: number;
      page_size?: number;
    } = {};

    // 添加排序参数
    params.sort_by = sortBy;

    // 如果是搜索，不指定分页参数以获取全部数据
    if (isSearch) {
      if (searchText) {
        // 搜索时获取所有数据，在前端过滤
        const response = await studentAPI.getEligibleCompetitions({
          status: statusFilter,
          sort_by: sortBy,
        });
        handleResp(
          response,
          (data) => {
            // 前端过滤搜索结果
            const filteredData = data.filter((competition: Competition) =>
              competition.name.toLowerCase().includes(searchText.toLowerCase()),
            );
            setCompetitions(filteredData);
            setTotal(filteredData.length);
            setLoading(false);
          },
          () => {
            setLoading(false);
          },
        );
        return;
      }
    }

    // 正常分页请求
    params.page = page;
    params.page_size = size;
    if (statusFilter) params.status = statusFilter;

    const response = await studentAPI.getEligibleCompetitions(params);
    handleResp(
      response,
      (data, pagination) => {
        setCompetitions(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const fetchRegistrations = async () => {
    const response = await studentAPI.getRegistrations();
    handleResp(response, (data) => {
      setRegistrations(data || []);
    });
  };

  const fetchUserVotes = async () => {
    const competitionIds = competitions.map((c) => c.id);
    if (competitionIds.length === 0) return;

    const response = await studentAPI.getStudentVotes(competitionIds);
    handleResp(response, (data) => {
      setUserVotes(data || {});
    });
  };

  const handleVote = async (competitionId: number, voteType: VoteType) => {
    const response = await studentAPI.voteCompetition(competitionId, voteType);
    handleResp(response, () => {
      // 更新本地状态
      const currentVote = userVotes[competitionId];
      const newVotes = { ...userVotes };

      if (currentVote === voteType) {
        // 取消投票
        delete newVotes[competitionId];
        message.success("已取消投票");
      } else {
        // 更新投票
        newVotes[competitionId] = voteType;
        message.success(voteType === VoteType.Up ? "已投赞成票" : "已投反对票");
      }

      setUserVotes(newVotes);

      // 更新competition的vote_count
      setCompetitions((prev) =>
        prev.map((comp) => {
          if (comp.id === competitionId) {
            let newVoteCount = comp.vote_count || 0;
            if (currentVote === voteType) {
              // 取消投票
              newVoteCount -= voteType;
            } else if (currentVote) {
              // 更改投票
              newVoteCount = newVoteCount - currentVote + voteType;
            } else {
              // 新投票
              newVoteCount += voteType;
            }
            return { ...comp, vote_count: newVoteCount };
          }
          return comp;
        }),
      );
    });
  };

  const fetchData = async () => {
    await Promise.all([fetchCompetitions(), fetchRegistrations()]);
  };

  const isRegistered = (competitionId: number) => {
    return registrations?.some((reg) => reg.id === competitionId);
  };

  const handleRegister = async (competition: Competition) => {
    const response = await studentAPI.registerCompetition({
      competition_id: competition.id,
    });

    handleRespWithNotifySuccess(response, (data) => {
      // 刷新数据
      fetchData();

      // 检查是否超限
      if (data.exceeding && data.registrants && data.registrants.length > 0) {
        // 显示超限提示
        Modal.info({
          title: "报名成功",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: (
            <div>
              <p>您已成功报名！</p>
              <p style={{ color: "#faad14", fontWeight: "bold" }}>
                温馨提示：该项目每班最多{" "}
                {competition.max_participants_per_class} 人报名， 您的班级已有{" "}
                {data.registrants.length} 人报名，已达到或超过限制。
              </p>
              <p>
                <strong>本班已报名学生：</strong>
              </p>
              <p>{data.registrants.join("、")}</p>
            </div>
          ),
          okText: "知道了",
        });
      }
    });
  };

  const handleUnregister = async (competition: Competition) => {
    const response = await studentAPI.unregisterCompetition(competition.id);
    handleRespWithNotifySuccess(response, () => {
      fetchData();
    });
  };

  const showDetail = (competition: Competition) => {
    setSelectedCompetition(competition);
    setDetailModalVisible(true);
  };

  const canRegister = (competition: Competition) => {
    // 学生本人报名被配置关闭时，不展示报名入口（仅管理员与班级账号可报名）
    if (!allow_student_registration) {
      return false;
    }
    // 报名时间窗口外不展示报名入口
    if (!registrationOpen) {
      return false;
    }
    // 仅已审核（未开始）的比赛开放报名，检录开始后关闭
    return competition.status === "approved" && !isRegistered(competition.id);
  };

  const canUnregister = (competition: Competition) => {
    // 团体比赛学生不能取消报名
    if (competition.competition_type === "team") {
      return false;
    }
    // 报名时间窗口外不展示取消入口
    if (!registrationOpen) {
      return false;
    }
    return competition.status === "approved" && isRegistered(competition.id);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>项目总览</Title>
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
              placeholder="筛选状态"
              allowClear
              size="large"
              style={{ width: "100%" }}
              value={statusFilter || undefined}
              onChange={setStatusFilter}
            >
              <Option value="approved">已通过</Option>
              <Option value="checking_in">检录中</Option>
              <Option value="in_progress">进行中</Option>
              <Option value="completed">已完成</Option>
              <Option value="pending_score_review">待成绩审核</Option>
            </Select>
            <Select
              placeholder="排序方式"
              size="large"
              style={{ width: "100%" }}
              value={sortBy}
              onChange={setSortBy}
            >
              <Option value="name">按名称排序</Option>
              <Option value="votes">按票数排序</Option>
            </Select>
            <Search
              placeholder="搜索项目名称"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1);
              }}
              size="large"
              style={{ width: "100%" }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              刷新
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space>
              <Select
                placeholder="筛选状态"
                allowClear
                style={{ width: 150 }}
                value={statusFilter || undefined}
                onChange={setStatusFilter}
              >
                <Option value="pending">待审核</Option>
                <Option value="approved">已通过</Option>
                <Option value="rejected">已拒绝</Option>
              </Select>
              <Select
                placeholder="排序方式"
                style={{ width: 150 }}
                value={sortBy}
                onChange={setSortBy}
              >
                <Option value="name">按名称排序</Option>
                <Option value="votes">按票数排序</Option>
              </Select>
              <Search
                placeholder="搜索项目名称"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1);
                }}
                style={{ width: 250 }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchData}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>
        )}
      </div>

      {competitions.length === 0 ? (
        <Empty description="暂无符合条件的比赛项目" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {competitions.map((comp) => {
            const registered = isRegistered(comp.id);
            return (
              <Card
                key={comp.id}
                size="small"
                hoverable
                onClick={() => showDetail(comp)}
                styles={{ body: { padding: isMobile ? 12 : 16 } }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {comp.name}
                    </div>
                    <Space size={[4, 4]} wrap style={{ marginBottom: 4 }}>
                      {getStatusTag(comp.status)}
                      {getCompetitionTypeTag(comp.competition_type)}
                      <Tag>{getGenderText(comp.gender)}</Tag>
                      {registered && <Tag color="success">已报名</Tag>}
                    </Space>
                    <div style={{ fontSize: 12, color: "#999" }}>
                      {comp.start_time && comp.end_time
                        ? `${dayjs(comp.start_time).format("MM-DD HH:mm")} - ${dayjs(comp.end_time).format("HH:mm")}`
                        : "时间待定"}
                      {comp.venue ? ` · ${comp.venue}` : ""}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    flexShrink: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {comp.status === "approved" && votingOpen && (
                    <VoteButtons
                      voteCount={comp.vote_count || 0}
                      userVote={userVotes[comp.id]}
                      onVote={(voteType) => handleVote(comp.id, voteType)}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                  <Space size={4} style={{ marginTop: 8 }} wrap>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => showDetail(comp)}
                    >
                      详情
                    </Button>
                    {canRegister(comp) && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => handleRegister(comp)}
                      >
                        报名
                      </Button>
                    )}
                    {canUnregister(comp) && (
                      <Button
                        size="small"
                        danger
                        icon={<UserDeleteOutlined />}
                        onClick={() => handleUnregister(comp)}
                      >
                        取消
                      </Button>
                    )}
                  </Space>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <div
        style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}
      >
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          simple={isMobile}
          size={isMobile ? "small" : undefined}
          showSizeChanger={!isMobile}
          showQuickJumper={!isMobile}
          showTotal={(t) => `共 ${t} 个项目`}
          onChange={(page, size) => {
            setCurrentPage(page);
            setPageSize(size || 10);
          }}
        />
      </div>

      {/* 项目详情模态框 */}
      <Modal
        title={
          <Space>
            <TrophyOutlined />
            项目详情
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          selectedCompetition && (
            <Space>
              <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
              {canRegister(selectedCompetition) && (
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  onClick={() => {
                    handleRegister(selectedCompetition);
                    setDetailModalVisible(false);
                  }}
                >
                  立即报名
                </Button>
              )}
              {canUnregister(selectedCompetition) && (
                <Button
                  danger
                  icon={<UserDeleteOutlined />}
                  onClick={() => {
                    handleUnregister(selectedCompetition);
                    setDetailModalVisible(false);
                  }}
                >
                  取消报名
                </Button>
              )}
            </Space>
          )
        }
        width={600}
      >
        {selectedCompetition && (
          <div>
            {selectedCompetition.image_path && (
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <Image
                  src={selectedCompetition.image_path}
                  alt={selectedCompetition.name}
                  style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}
                />
              </div>
            )}

            <Title level={4}>{selectedCompetition.name}</Title>

            {selectedCompetition.description && (
              <>
                <Text strong>项目描述：</Text>
                <Divider style={{ margin: "8px 0" }} />
                <Text>{selectedCompetition.description}</Text>
                <Divider />
              </>
            )}

            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text strong>项目状态：</Text>
                <br />
                {getStatusTag(selectedCompetition.status)}
              </Col>
              <Col span={12}>
                <Text strong>性别要求：</Text>
                <br />
                <Text>{getGenderText(selectedCompetition.gender)}</Text>
              </Col>
              <Col span={12}>
                <Text strong>成绩单位：</Text>
                <br />
                <Text>{selectedCompetition.unit}</Text>
              </Col>
              <Col span={12}>
                <Text strong>排名方式：</Text>
                <br />
                <Text>
                  {getRankingModeText(selectedCompetition.ranking_mode)}
                </Text>
              </Col>
              <Col span={12}>
                <Text strong>报名人数：</Text>
                <br />
                <Text>{selectedCompetition.registration_count || 0} 人</Text>
              </Col>
              <Col span={12}>
                <Text strong>报名状态：</Text>
                <br />
                {isRegistered(selectedCompetition.id) ? (
                  <Tag color="success">已报名</Tag>
                ) : (
                  <Tag color="default">未报名</Tag>
                )}
              </Col>
              <Col span={12}>
                <Text strong>投票数：</Text>
                <br />
                <Text>{selectedCompetition.vote_count || 0}</Text>
              </Col>
              {selectedCompetition.status === "approved" && votingOpen && (
                <Col span={12}>
                  <Text strong>我的投票：</Text>
                  <br />
                  <VoteButtons
                    voteCount={selectedCompetition.vote_count || 0}
                    userVote={userVotes[selectedCompetition.id]}
                    onVote={(voteType) =>
                      handleVote(selectedCompetition.id, voteType)
                    }
                    size="medium"
                  />
                </Col>
              )}
            </Row>

            {selectedCompetition.submitter_name && (
              <>
                <Divider />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <InfoCircleOutlined /> 推荐人：
                  {selectedCompetition.submitter_name}
                </Text>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StudentCompetitions;
