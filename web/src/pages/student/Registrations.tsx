import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { Button, Typography, Empty, Popconfirm } from "antd";
import {
  ReloadOutlined,
  UserDeleteOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { studentAPI } from "../../api/student";
import { Competition } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { getStatusTag } from "../../utils/competition";
import { useWebsite } from "../../contexts/WebsiteContext";
import { isTimeInRange } from "../../utils/windows";

const { Title } = Typography;

// 时间轴圆点颜色：与状态语义对应
const STATUS_DOT_COLORS: Record<string, string> = {
  approved: "#bfbfbf", // 已报名未开始，暂无动作
  checking_in: "#faad14", // 检录中，需要行动
  in_progress: "#1677ff", // 进行中
  pending_score_review: "#faad14", // 待审核成绩
  completed: "#52c41a", // 已完成
};
const statusDotColor = (status: Competition["status"]) =>
  STATUS_DOT_COLORS[status] || "#d9d9d9";

const StudentRegistrations: React.FC = () => {
  const navigate = useNavigate();
  const { registration_start_time, registration_end_time } = useWebsite();
  // 报名时间窗口（空 = 不限制），与后端校验一致
  const registrationOpen = isTimeInRange(
    registration_start_time,
    registration_end_time,
  );
  const [loading, setLoading] = useState(false);
  const [registrations, setRegistrations] = useState<Competition[]>([]);

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    setLoading(true);
    const data = await studentAPI.getRegistrations();
    handleResp(
      data,
      (data) => {
        setRegistrations(data || []);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const handleUnregister = async (competition: Competition) => {
    const response = await studentAPI.unregisterCompetition(competition.id);
    handleRespWithNotifySuccess(response, () => {
      fetchRegistrations();
    });
  };

  const canUnregister = (competition: Competition) => {
    // 与后端一致：仅已审核（未开始）的比赛可以取消报名，且须在报名时间窗口内
    return competition.status === "approved" && registrationOpen;
  };

  // 按开始时间排序，无时间的排在最后
  const sortedRegistrations = [...registrations].sort((a, b) => {
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf();
  });

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
        <Title level={2}>我的报名</Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchRegistrations}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      {registrations?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sortedRegistrations.map((comp, idx) => (
            <div key={comp.id} style={{ display: "flex", gap: 12 }}>
              {/* 左侧时间列 */}
              <div
                style={{
                  width: 52,
                  flexShrink: 0,
                  textAlign: "right",
                  paddingTop: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: comp.start_time ? "#1f2937" : "#bbb",
                    lineHeight: "16px",
                  }}
                >
                  {comp.start_time
                    ? dayjs(comp.start_time).format("HH:mm")
                    : "待定"}
                </div>
                {comp.end_time && (
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                    {dayjs(comp.end_time).format("HH:mm")}
                  </div>
                )}
              </div>

              {/* 中轴：圆点 + 连线 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: statusDotColor(comp.status),
                    marginTop: 3,
                    flexShrink: 0,
                  }}
                />
                {idx < sortedRegistrations.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      background: "#e8eaed",
                      marginTop: 4,
                    }}
                  />
                )}
              </div>

              {/* 右侧内容 */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 20 }}>
                <div style={{ fontWeight: 600 }}>{comp.name}</div>
                {comp.venue && (
                  <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                    {comp.venue}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 6,
                  }}
                >
                  {getStatusTag(comp.status)}
                  {canUnregister(comp) && (
                    <Popconfirm
                      title="确定取消报名吗？"
                      description="取消后可能无法再次报名"
                      onConfirm={() => handleUnregister(comp)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<UserDeleteOutlined />}
                      >
                        取消报名
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div>还没有报名任何比赛项目</div>
              <Button
                type="primary"
                style={{ marginTop: 16 }}
                icon={<TrophyOutlined />}
                onClick={() => navigate("/student/competitions")}
              >
                去报名比赛
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
};

export default StudentRegistrations;
