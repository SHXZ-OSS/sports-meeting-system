import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import {
  ApiResponse,
  BracketDetail,
  BracketScheduleConfig,
  BracketScheduleItem,
  BracketSchedulePlan,
} from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { getMatchRoundLabel } from "../bracket/analysis";
import {
  defaultScheduleConfig,
  formatDayTitle,
  matchSideNames,
} from "../../utils/bracketSchedule";

const { Text } = Typography;

export interface ScheduleApi {
  preview: (
    data: BracketScheduleConfig,
  ) => Promise<ApiResponse<BracketSchedulePlan>>;
  apply: (
    data: BracketScheduleConfig,
  ) => Promise<ApiResponse<BracketSchedulePlan>>;
}

interface FormValues {
  start_at: Dayjs;
  match_minutes: number;
  gap_minutes: number;
  rest_minutes: number;
  venues: string[];
  day_window: [Dayjs, Dayjs] | null;
  keep_scheduled: boolean;
}

interface BracketScheduleModalProps {
  open: boolean;
  detail: BracketDetail;
  api: ScheduleApi;
  onCancel: () => void;
  onSaved: () => void;
}

const toFormValues = (cfg: BracketScheduleConfig): FormValues => ({
  start_at: dayjs(cfg.start_at),
  match_minutes: cfg.match_minutes,
  gap_minutes: cfg.gap_minutes,
  rest_minutes: cfg.rest_minutes,
  venues: cfg.venues,
  day_window:
    cfg.day_start && cfg.day_end
      ? [dayjs(cfg.day_start, "HH:mm"), dayjs(cfg.day_end, "HH:mm")]
      : null,
  keep_scheduled: cfg.keep_scheduled,
});

const toConfig = (v: FormValues): BracketScheduleConfig => ({
  start_at: v.start_at.second(0).millisecond(0).format(),
  match_minutes: v.match_minutes,
  gap_minutes: v.gap_minutes,
  rest_minutes: v.rest_minutes,
  venues: v.venues.map((s) => s.trim()).filter(Boolean),
  day_start: v.day_window ? v.day_window[0].format("HH:mm") : "",
  day_end: v.day_window ? v.day_window[1].format("HH:mm") : "",
  keep_scheduled: v.keep_scheduled,
});

/**
 * 自动排期：按对阵先后关系、参赛方休息时间与场地数量，把未完赛的比赛排入时间表
 * 先预览，确认后保存；已完赛的比赛不受影响
 */
const BracketScheduleModal: React.FC<BracketScheduleModalProps> = ({
  open,
  detail,
  api,
  onCancel,
  onSaved,
}) => {
  const [form] = Form.useForm<FormValues>();
  const [plan, setPlan] = useState<BracketSchedulePlan | null>(null);
  const [loading, setLoading] = useState<"preview" | "apply" | null>(null);

  const initialValues = useMemo(
    () => toFormValues(defaultScheduleConfig(detail.bracket)),
    [detail.bracket],
  );
  const participants = useMemo(
    () => new Map(detail.participants.map((p) => [p.id, p])),
    [detail.participants],
  );
  const matchesById = useMemo(
    () => new Map(detail.matches.map((m) => [m.id, m])),
    [detail.matches],
  );
  const matchesBySeq = useMemo(
    () => new Map(detail.matches.map((m) => [m.seq, m])),
    [detail.matches],
  );

  const run = async (kind: "preview" | "apply") => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setLoading(kind);
    const config = toConfig(values);
    if (kind === "preview") {
      const resp = await api.preview(config);
      handleResp(resp, (data) => setPlan(data));
    } else {
      const resp = await api.apply(config);
      handleRespWithNotifySuccess(resp, () => {
        setPlan(null);
        onSaved();
      });
    }
    setLoading(null);
  };

  const columns = [
    {
      title: "时间",
      key: "time",
      width: 150,
      render: (it: BracketScheduleItem) => (
        <span style={{ whiteSpace: "nowrap" }}>
          {dayjs(it.scheduled_at).format("MM-DD HH:mm")}–
          {dayjs(it.end_at).format("HH:mm")}
        </span>
      ),
    },
    { title: "场地", dataIndex: "venue", key: "venue", width: 110 },
    {
      title: "比赛",
      key: "match",
      render: (it: BracketScheduleItem) => {
        const m = matchesById.get(it.match_id);
        if (!m) return "-";
        const [red, blue] = matchSideNames(m, participants, matchesBySeq);
        return (
          <span>
            <Text type="secondary">
              #{m.seq} {getMatchRoundLabel(m, detail.matches)}
            </Text>{" "}
            {red} vs {blue}
            {it.fixed && (
              <Tag style={{ marginLeft: 6 }} color="default">
                保留
              </Tag>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      title="自动排期"
      open={open}
      onCancel={onCancel}
      width={720}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) setPlan(null);
      }}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button
            onClick={() => run("preview")}
            loading={loading === "preview"}
          >
            预览
          </Button>
          <Button
            type="primary"
            onClick={() => run("apply")}
            loading={loading === "apply"}
            disabled={!plan}
          >
            保存排期
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onValuesChange={() => setPlan(null)}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="按对阵先后顺序安排：晋级方要等来源比赛结束并休息后才开赛，多个场地同时进行。已完赛的比赛不会改动。"
        />
        <Space wrap size={[16, 0]} align="start">
          <Form.Item
            label="开始时间"
            name="start_at"
            rules={[{ required: true, message: "请选择开始时间" }]}
          >
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item
            label="每日时段"
            name="day_window"
            tooltip="比赛只安排在每天的这一时段内，放不下时顺延到次日；留空表示不限"
          >
            <TimePicker.RangePicker
              format="HH:mm"
              minuteStep={5}
              order
              style={{ width: 200 }}
              placeholder={["开始", "结束"]}
            />
          </Form.Item>
        </Space>
        <Space wrap size={[16, 0]} align="start">
          <Form.Item
            label="每场时长"
            name="match_minutes"
            rules={[{ required: true, message: "请填写每场时长" }]}
          >
            <InputNumber
              min={1}
              max={600}
              suffix="分钟"
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item
            label="场地间隔"
            name="gap_minutes"
            tooltip="同一场地两场比赛之间的整理时间"
            rules={[{ required: true, message: "请填写场地间隔" }]}
          >
            <InputNumber
              min={0}
              max={240}
              suffix="分钟"
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item
            label="最短休息"
            name="rest_minutes"
            tooltip="同一参赛方两场比赛之间至少休息的时间"
            rules={[{ required: true, message: "请填写最短休息" }]}
          >
            <InputNumber
              min={0}
              max={720}
              suffix="分钟"
              style={{ width: 140 }}
            />
          </Form.Item>
        </Space>
        <Form.Item
          label="场地"
          name="venues"
          tooltip="可同时进行比赛的场地，输入后回车添加"
          rules={[
            {
              required: true,
              type: "array",
              min: 1,
              message: "至少填写一个场地",
            },
            {
              validator: (_, value: string[] | undefined) =>
                (value ?? []).length <= 20 &&
                (value ?? []).every((v) => v.trim().length <= 30)
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error("最多 20 个场地，每个不超过 30 个字"),
                    ),
            },
          ]}
        >
          <Select
            mode="tags"
            open={false}
            suffixIcon={null}
            tokenSeparators={[",", "，"]}
            placeholder="如：1 号场地、2 号场地"
          />
        </Form.Item>
        <Form.Item
          label="保留已排期的比赛"
          name="keep_scheduled"
          valuePropName="checked"
          tooltip="开启后已有时间的比赛保持不变，只为未排期的比赛安排时间"
        >
          <Switch />
        </Form.Item>
      </Form>

      {plan && (
        <section aria-label="排期预览">
          <Space wrap size={[16, 4]} style={{ marginBottom: 8 }}>
            <Text>
              共 {plan.items.length} 场，{plan.days} 天
            </Text>
            {plan.first_at && plan.last_end && (
              <Text type="secondary">
                {dayjs(plan.first_at).format("M月D日 HH:mm")} 至{" "}
                {dayjs(plan.last_end).format("M月D日 HH:mm")}
              </Text>
            )}
          </Space>
          {plan.warnings.map((w) => (
            <Alert
              key={w}
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
              title={w}
            />
          ))}
          <Table
            size="small"
            rowKey="match_id"
            columns={columns}
            dataSource={plan.items}
            pagination={false}
            scroll={{ y: 320, x: "max-content" }}
            title={() => (
              <Text type="secondary">
                {Array.from(
                  new Set(
                    plan.items.map((it) =>
                      formatDayTitle(
                        dayjs(it.scheduled_at).format("YYYY-MM-DD"),
                      ),
                    ),
                  ),
                ).join("、")}
              </Text>
            )}
          />
        </section>
      )}
    </Modal>
  );
};

export default BracketScheduleModal;
