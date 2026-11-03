import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  ClearOutlined,
  EditOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { ApiResponse, BracketDetail, BracketMatch } from "../../types";
import { handleRespWithNotifySuccess } from "../../utils/handleResp";
import { MATCH_STATUS_LABELS } from "../../utils/bracket";
import {
  DEFAULT_MATCH_MINUTES,
  conflictText,
  findScheduleConflicts,
  formatDayTitle,
  isSchedulable,
  matchSideNames,
  sortBySchedule,
} from "../../utils/bracketSchedule";
import { getMatchRoundLabel } from "../bracket/analysis";
import BracketScheduleModal, { ScheduleApi } from "./BracketScheduleModal";
import ScheduleViews from "./ScheduleViews";
import { bracketEntries } from "./scheduleEntries";

const { Text } = Typography;

interface BracketScheduleCardProps {
  detail: BracketDetail;
  // 为空表示只读（无排期权限）
  api?: ScheduleApi & {
    clear: () => Promise<ApiResponse<{ cleared: number }>>;
  };
  // 手动调整单场时间与场地（打开录入弹窗）
  onEditMatch?: (match: BracketMatch) => void;
  onChanged: () => void;
  style?: React.CSSProperties;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "default",
  scheduled: "blue",
  completed: "green",
};

/**
 * 排期卡片：仅对使用对阵图的比赛项目显示
 * 按时间列出全部比赛，标出场地 / 参赛方时间冲突；可自动排期或清空排期
 */
const BracketScheduleCard: React.FC<BracketScheduleCardProps> = ({
  detail,
  api,
  onEditMatch,
  onChanged,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const { bracket, matches } = detail;
  const linked =
    !!bracket.competition_id && !!bracket.competition_bracket_enabled;

  const participants = useMemo(
    () => new Map(detail.participants.map((p) => [p.id, p])),
    [detail.participants],
  );
  const matchesBySeq = useMemo(
    () => new Map(matches.map((m) => [m.seq, m])),
    [matches],
  );
  const rows = useMemo(
    () => sortBySchedule(matches.filter(isSchedulable)),
    [matches],
  );
  const minutes =
    bracket.schedule_config?.match_minutes ?? DEFAULT_MATCH_MINUTES;
  const conflicts = useMemo(
    () => findScheduleConflicts(matches, minutes),
    [matches, minutes],
  );
  const scheduledCount = rows.filter((m) => m.scheduled_at).length;
  const venues = new Set(rows.map((m) => m.venue).filter(Boolean));
  const openCount = rows.filter((m) => !m.completed).length;

  if (!linked) {
    return (
      <Card title="排期" style={style}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="仅使用对阵图的比赛项目可以排期，请先在项目管理中为关联项目开启「使用对阵图」"
        />
      </Card>
    );
  }

  const confirmClear = () => {
    if (!api) return;
    Modal.confirm({
      title: "确定清空排期吗？",
      content: "将清除所有未完赛比赛的时间与场地，已完赛的比赛不受影响",
      okButtonProps: { danger: true },
      onOk: async () => {
        const resp = await api.clear();
        handleRespWithNotifySuccess(resp, onChanged);
      },
    });
  };

  const columns = [
    {
      title: "时间",
      key: "time",
      width: 170,
      render: (m: BracketMatch) =>
        m.scheduled_at ? (
          <span style={{ whiteSpace: "nowrap" }}>
            {formatDayTitle(dayjs(m.scheduled_at).format("YYYY-MM-DD"))}{" "}
            {dayjs(m.scheduled_at).format("HH:mm")}
          </span>
        ) : (
          <Text type="secondary">未排期</Text>
        ),
    },
    {
      title: "场地",
      dataIndex: "venue",
      key: "venue",
      width: 120,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "比赛",
      key: "match",
      render: (m: BracketMatch) => {
        const [red, blue] = matchSideNames(m, participants, matchesBySeq);
        const conflict = conflicts.get(m.id);
        return (
          <span>
            <Text type="secondary">
              #{m.seq} {getMatchRoundLabel(m, matches)}
            </Text>{" "}
            {red} vs {blue}
            {conflict && (
              <Tooltip title={conflictText(conflict)}>
                <Tag
                  color="error"
                  icon={<WarningOutlined />}
                  style={{ marginLeft: 6 }}
                >
                  冲突
                </Tag>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: "状态",
      key: "status",
      width: 90,
      render: (m: BracketMatch) => (
        <Tag color={STATUS_COLORS[m.status]}>
          {MATCH_STATUS_LABELS[m.status]}
        </Tag>
      ),
    },
    ...(onEditMatch
      ? [
          {
            title: "操作",
            key: "action",
            width: 80,
            render: (m: BracketMatch) => (
              <Button
                size="small"
                type="link"
                icon={<EditOutlined />}
                // 待定比赛双方未齐，录入弹窗只对已确定的比赛开放
                disabled={m.status === "pending"}
                onClick={() => onEditMatch(m)}
                aria-label={`调整第 ${m.seq} 场`}
              >
                调整
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="排期"
      style={style}
      extra={
        api &&
        matches.length > 0 && (
          <Space wrap>
            <Button
              size="small"
              danger
              icon={<ClearOutlined />}
              disabled={scheduledCount === 0 || openCount === 0}
              onClick={confirmClear}
            >
              清空排期
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CalendarOutlined />}
              disabled={openCount === 0}
              onClick={() => setOpen(true)}
            >
              自动排期
            </Button>
          </Space>
        )
      }
    >
      {matches.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="生成对阵后即可排期"
        />
      ) : (
        <>
          <Space wrap size={[16, 4]} style={{ marginBottom: 12 }}>
            <Text>
              已排期 {scheduledCount} / {rows.length} 场
            </Text>
            {venues.size > 0 && (
              <Text type="secondary">
                场地：
                {Array.from(venues)
                  .sort((a, b) =>
                    a.localeCompare(b, "zh-CN", { numeric: true }),
                  )
                  .join("、")}
              </Text>
            )}
          </Space>
          {conflicts.size > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title={`有 ${conflicts.size} 场比赛存在时间冲突（按每场 ${minutes} 分钟估算），请调整或重新自动排期`}
            />
          )}
          <ScheduleViews
            tone="admin"
            entries={bracketEntries({
              matches,
              participants,
              matchesBySeq,
              minutes,
              groupName: bracket.name,
              conflicts,
              // 日历 / 甘特图中点击比赛：调整时间与场地（待定比赛双方未齐，不可录入）
              onPick: onEditMatch
                ? (m) => {
                    if (m.status !== "pending") onEditMatch(m);
                  }
                : undefined,
            })}
            unscheduled={rows.length - scheduledCount}
            renderList={() => (
              <Table
                size="small"
                rowKey="id"
                columns={columns}
                dataSource={rows}
                pagination={false}
                scroll={{ x: "max-content", y: 420 }}
              />
            )}
          />
        </>
      )}

      {api && (
        <BracketScheduleModal
          open={open}
          detail={detail}
          api={api}
          onCancel={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
};

export default BracketScheduleCard;
