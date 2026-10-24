import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TableProps } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { adminRegistrationAPI } from "../api/admin/registration";
import { Class, Competition, Registration, Student } from "../types";
import {
  BatchRequestItem,
  handleBatchResp,
  handleRespWithoutNotify,
} from "../utils/handleResp";
import { getCompetitionTypeTag, getGenderTag } from "../utils/competition";
import {
  planRandomFill,
  RandomFillAssignment,
  RandomFillCompetitionResult,
  RandomFillPlan,
} from "../utils/randomRegistration";
import { BatchResult } from "./BatchResults";

const { Text } = Typography;

const MAX_VISIBLE_STUDENTS = 8;

const STATUS_CONFIG = {
  satisfied: { color: "default", text: "已满足" },
  filled: { color: "green", text: "可补足" },
  partial: { color: "orange", text: "部分补足" },
  skipped: { color: "default", text: "未参与" },
} as const;

interface RandomFillRegistrationModalProps {
  open: boolean;
  classes: Class[];
  onClose: () => void;
  onCompleted: () => void;
}

const RandomFillRegistrationModal: React.FC<
  RandomFillRegistrationModalProps
> = ({ open, classes, onClose, onCompleted }) => {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [plan, setPlan] = useState<RandomFillPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [failures, setFailures] = useState<BatchResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedClassId(classes.length === 1 ? classes[0].id : null);
    setPlan(null);
    setCommitted(false);
    setSuccessCount(0);
    setFailures([]);
    setProgress({ current: 0, total: 0 });
  }, [open]);

  const visibleCompetitions = useMemo(
    () =>
      plan
        ? plan.competitions.filter(
            (competition) => competition.status !== "satisfied",
          )
        : [],
    [plan],
  );

  const assignedStudentCount = useMemo(
    () =>
      plan
        ? new Set(plan.assignments.map((assignment) => assignment.studentId))
            .size
        : 0,
    [plan],
  );

  const affectedCompetitionCount = plan
    ? plan.competitions.filter((competition) => competition.plannedTotal > 0)
        .length
    : 0;
  const partialCount = plan
    ? plan.competitions.filter(
        (competition) => competition.status === "partial",
      ).length
    : 0;
  const skippedCount = plan
    ? plan.competitions.filter(
        (competition) => competition.status === "skipped",
      ).length
    : 0;

  const handleClose = () => {
    if (!committing) {
      onClose();
    }
  };

  const handleClassChange = (classId: number) => {
    setSelectedClassId(classId);
    setPlan(null);
    setCommitted(false);
    setSuccessCount(0);
    setFailures([]);
    setProgress({ current: 0, total: 0 });
  };

  const handlePlan = async () => {
    if (!selectedClassId) {
      message.warning("请先选择班级");
      return;
    }
    const classInfo = classes.find((item) => item.id === selectedClassId);
    if (!classInfo) {
      message.warning("班级信息不存在，请关闭后重试");
      return;
    }

    setPlanning(true);
    setPlan(null);
    setCommitted(false);
    setSuccessCount(0);
    setFailures([]);
    setProgress({ current: 0, total: 0 });

    try {
      const competitions = await fetchCompetitions();
      if (competitions.length === 0) {
        message.warning("当前没有可报名的比赛项目");
        return;
      }

      const [students, registrations] = await Promise.all([
        fetchClassStudents(classInfo.id),
        fetchRegistrations(competitions),
      ]);

      const result = planRandomFill({
        classInfo,
        students,
        competitions,
        registrations,
      });
      setPlan(result);

      if (result.studentCount === 0) {
        message.info("该班级暂无学生");
      } else if (result.totalAssigned === 0) {
        message.info("没有需要补足的项目");
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "随机分配失败，请稍后重试",
      );
    } finally {
      setPlanning(false);
    }
  };

  const handleCommit = async () => {
    if (!plan || plan.assignments.length === 0) {
      return;
    }

    setCommitting(true);
    setCommitted(false);
    setSuccessCount(0);
    setFailures([]);
    setProgress({ current: 0, total: plan.assignments.length });

    const items: BatchRequestItem[] = plan.assignments.map((assignment) => ({
      id: `${assignment.competitionId}-${assignment.studentId}`,
      name: `${assignment.studentName} · ${assignment.competitionName}`,
      request: () =>
        adminRegistrationAPI.registerStudent({
          student_id: assignment.studentId,
          competition_id: assignment.competitionId,
        }),
    }));

    try {
      const results = await handleBatchResp(items, {
        onProgress: (current, total) => setProgress({ current, total }),
      });
      const failed = results.filter((result) => !result.success);
      const succeeded = results.length - failed.length;

      setFailures(failed);
      setSuccessCount(succeeded);
      setCommitted(true);

      if (succeeded > 0) {
        message.success(`已成功报名 ${succeeded} 人次`);
        onCompleted();
      }
      if (failed.length > 0) {
        message.warning(`${failed.length} 条报名失败，请查看失败原因`);
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "批量报名失败，请稍后重试",
      );
    } finally {
      setCommitting(false);
    }
  };

  const commitAlertMessage =
    successCount > 0
      ? failures.length > 0
        ? `已成功报名 ${successCount} 人次，${failures.length} 条失败`
        : `已成功报名 ${successCount} 人次`
      : "报名未能提交";

  const columns: TableProps<RandomFillCompetitionResult>["columns"] = [
    {
      title: "项目",
      dataIndex: "competitionName",
      key: "competitionName",
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.competitionName}</Text>
          <Space size={4}>
            {getGenderTag(record.gender)}
            {getCompetitionTypeTag(record.competitionType)}
          </Space>
        </Space>
      ),
    },
    {
      title: "人数变化",
      key: "counts",
      width: 250,
      render: (_, record) => <CompetitionCounts record={record} />,
    },
    {
      title: "本次分配",
      key: "planned",
      width: 130,
      render: (_, record) => <PlannedCount record={record} />,
    },
    {
      title: "分配学生",
      key: "students",
      render: (_, record) => (
        <AssignmentTags assignments={record.assignments} />
      ),
    },
    {
      title: "结果",
      key: "status",
      width: 190,
      render: (_, record) => (
        <StatusCell record={record} committed={committed} />
      ),
    },
  ];

  return (
    <Modal
      title={
        <>
          <SwapOutlined style={{ marginRight: 8 }} />
          随机补足报名
        </>
      }
      open={open}
      onCancel={handleClose}
      footer={
        <Space>
          <Button onClick={handleClose} disabled={committing}>
            {committed ? "关闭" : "取消"}
          </Button>
          {committed ? (
            <Button type="primary" onClick={handleClose}>
              完成
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleCommit}
              loading={committing}
              disabled={!plan || plan.totalAssigned === 0 || planning}
            >
              确认并提交报名
            </Button>
          )}
        </Space>
      }
      width={1000}
      closable={!committing}
      maskClosable={false}
      keyboard={!committing}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      zIndex={1002}
    >
      <Alert
        type="info"
        showIcon
        message="分配规则"
        description="系统会为所选班级补足各项目的最低报名人数。在符合性别、班级人数上限和时间安排的学生中随机选择，优先安排已报名项目较少的学生，使每名同学的报名项目数量尽量均衡；多轮模拟后取负担最均衡的一轮。点击「预览分配」只生成方案，不会写入报名；确认后才会提交。含必填自定义字段的项目请手动报名。"
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="请选择班级"
            style={{ width: 260 }}
            value={selectedClassId ?? undefined}
            onChange={handleClassChange}
            options={classes.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            showSearch
            optionFilterProp="label"
            disabled={planning || committing}
          />
          <Button
            type="primary"
            icon={<SwapOutlined />}
            onClick={handlePlan}
            loading={planning}
            disabled={!selectedClassId || committing}
          >
            {plan ? "重新预览" : "预览分配"}
          </Button>
        </Space>
        {classes.length === 0 && (
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            暂无可用班级，请关闭后重试。
          </Text>
        )}
      </div>

      {committing && (
        <div style={{ marginBottom: 16 }}>
          <Progress
            percent={
              progress.total > 0
                ? Math.round((progress.current / progress.total) * 100)
                : 0
            }
            status="active"
          />
          <div style={{ textAlign: "center", color: "#666", fontSize: 12 }}>
            正在报名 {progress.current} / {progress.total}
          </div>
        </div>
      )}

      {plan && (
        <Alert
          type={plan.totalAssigned > 0 ? "success" : "warning"}
          showIcon
          message={
            plan.totalAssigned > 0
              ? `拟为 ${assignedStudentCount} 名学生增加 ${plan.totalAssigned} 人次报名`
              : "没有可自动补足的报名"
          }
          description={
            plan.totalAssigned > 0
              ? `班级共 ${plan.studentCount} 人。以下为预览结果，确认后才会写入报名。覆盖 ${affectedCompetitionCount} 个项目${
                  partialCount > 0 ? `，${partialCount} 个项目仍有人数缺口` : ""
                }${
                  skippedCount > 0 ? `，${skippedCount} 个项目需人工处理` : ""
                }。`
              : `班级共 ${plan.studentCount} 人。所有项目均已满足最低人数，或剩余缺口需手动填写、受性别/时间冲突/人数上限限制。`
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {committed && (
        <Alert
          type={failures.length > 0 ? "warning" : "success"}
          showIcon
          message={commitAlertMessage}
          description={
            failures.length > 0 ? (
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {failures.map((failure) => (
                  <div
                    key={failure.id}
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    {failure.name}：{failure.error || "未知错误"}
                  </div>
                ))}
              </div>
            ) : undefined
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {planning && !plan && (
        <div
          style={{
            textAlign: "center",
            color: "#666",
            padding: "32px 0",
          }}
        >
          正在读取报名数据并计算…
        </div>
      )}

      {plan && (
        <Table<RandomFillCompetitionResult>
          rowKey="competitionId"
          size="small"
          columns={columns}
          dataSource={visibleCompetitions}
          pagination={false}
          scroll={{ x: 960 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该班级所有项目均已达到最低人数，无需补足"
              />
            ),
          }}
        />
      )}
    </Modal>
  );
};

const CompetitionCounts: React.FC<{
  record: RandomFillCompetitionResult;
}> = ({ record }) => {
  const showGender =
    record.gender === 3 &&
    (record.minFemale > 0 ||
      record.maxFemale > 0 ||
      record.minMale > 0 ||
      record.maxMale > 0);

  return (
    <Space direction="vertical" size={2} style={{ fontSize: 13 }}>
      {(record.minTotal > 0 || record.maxTotal > 0) && (
        <span>
          总 {record.beforeTotal} → {record.afterTotal}
          <Text type="secondary" style={{ marginLeft: 4 }}>
            （{formatLimit(record.minTotal, record.maxTotal)}）
          </Text>
        </span>
      )}
      {showGender && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          女 {record.beforeFemale} → {record.afterFemale}（
          {formatLimit(record.minFemale, record.maxFemale)}） · 男{" "}
          {record.beforeMale} → {record.afterMale}（
          {formatLimit(record.minMale, record.maxMale)}）
        </Text>
      )}
    </Space>
  );
};

const PlannedCount: React.FC<{
  record: RandomFillCompetitionResult;
}> = ({ record }) => {
  if (record.plannedTotal === 0) {
    return <Text type="secondary">—</Text>;
  }

  const showGender =
    record.gender === 3 && (record.plannedFemale > 0 || record.plannedMale > 0);

  return (
    <span>
      +{record.plannedTotal}
      {showGender && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          （女 {record.plannedFemale} / 男 {record.plannedMale}）
        </Text>
      )}
    </span>
  );
};

const AssignmentTags: React.FC<{
  assignments: RandomFillAssignment[];
}> = ({ assignments }) => {
  if (assignments.length === 0) {
    return <Text type="secondary">—</Text>;
  }

  return (
    <Space size={[4, 4]} wrap>
      {assignments.slice(0, MAX_VISIBLE_STUDENTS).map((assignment) => (
        <Tag key={assignment.studentId} style={{ marginInlineEnd: 0 }}>
          {assignment.studentName}
        </Tag>
      ))}
      {assignments.length > MAX_VISIBLE_STUDENTS && (
        <Tooltip
          title={assignments
            .slice(MAX_VISIBLE_STUDENTS)
            .map((assignment) => assignment.studentName)
            .join("、")}
        >
          <Tag style={{ marginInlineEnd: 0 }}>
            +{assignments.length - MAX_VISIBLE_STUDENTS}
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
};

const StatusCell: React.FC<{
  record: RandomFillCompetitionResult;
  committed: boolean;
}> = ({ record, committed }) => {
  const config = STATUS_CONFIG[record.status];
  const text = record.status === "filled" && committed ? "已提交" : config.text;

  return (
    <Space direction="vertical" size={2}>
      <Tag color={config.color}>{text}</Tag>
      {record.reason && (
        <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
          {record.reason}
        </Text>
      )}
    </Space>
  );
};

function formatLimit(min: number, max: number): string {
  if (min > 0 && max > 0) {
    return `最少 ${min}，最多 ${max}`;
  }
  if (min > 0) {
    return `最少 ${min}`;
  }
  if (max > 0) {
    return `最多 ${max}`;
  }
  return "未限制";
}

async function fetchCompetitions(): Promise<Competition[]> {
  let competitions: Competition[] = [];
  let failed = false;

  const response = await adminRegistrationAPI.getCompetitions({
    status: "approved,checking_in,in_progress,pending_score_review,completed",
  });
  handleRespWithoutNotify(
    response,
    (data) => {
      competitions = data;
    },
    () => {
      failed = true;
    },
  );

  if (failed) {
    throw new Error("获取比赛项目失败");
  }
  return competitions.filter(
    (competition) => competition.competition_type !== "school",
  );
}

async function fetchClassStudents(classId: number): Promise<Student[]> {
  let students: Student[] = [];
  let failed = false;

  const response = await adminRegistrationAPI.getStudents({
    class_id: classId,
  });
  handleRespWithoutNotify(
    response,
    (data) => {
      students = data;
    },
    () => {
      failed = true;
    },
  );

  if (failed) {
    throw new Error("获取班级学生失败");
  }
  return students;
}

async function fetchRegistrations(
  competitions: Competition[],
): Promise<Registration[]> {
  const responses = await Promise.all(
    competitions.map((competition) =>
      adminRegistrationAPI.getCompetitionRegistrations(competition.id),
    ),
  );

  const registrations: Registration[] = [];
  let failed = false;

  for (const response of responses) {
    handleRespWithoutNotify(
      response,
      (data) => {
        registrations.push(...data);
      },
      () => {
        failed = true;
      },
    );
  }

  if (failed) {
    throw new Error("获取报名数据失败，请稍后重试");
  }
  return registrations;
}

export default RandomFillRegistrationModal;
