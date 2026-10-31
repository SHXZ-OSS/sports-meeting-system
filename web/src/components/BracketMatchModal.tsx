import { useEffect, useState } from "react";
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import {
  adminBracketAPI,
  UpdateBracketMatchRequest,
} from "../api/admin/bracket";
import {
  ApiResponse,
  BracketMatch,
  BracketParticipant,
  RadarConfig,
} from "../types";
import { handleRespWithNotifySuccess } from "../utils/handleResp";
import { RADAR_STAT_MAX } from "./radar/radarUtils";
import "./radar/radar.css";

const { Text } = Typography;

interface BracketMatchModalProps {
  bracketId: number;
  match: BracketMatch | null;
  participants: Map<number, BracketParticipant>;
  onCancel: () => void;
  onSaved: () => void;
  // 自定义提交接口（成绩与赛事进程页按比赛项目提交）；默认走对阵图管理接口
  submit?: (
    matchId: number,
    data: UpdateBracketMatchRequest,
  ) => Promise<ApiResponse<void>>;
  // 对阵表的雷达图配置；有统计字段时，录入结果需同时填写双方统计数据
  radarConfig?: RadarConfig | null;
}

interface MatchFormValues {
  score1?: number | null;
  score2?: number | null;
  // "1" / "2" 为对应参赛方胜，"draw" 为平局，"" 为按比分判定
  outcome?: "" | "1" | "2" | "draw";
  scheduled_at?: Dayjs | null;
  venue?: string;
  note?: string;
}

type Side = 1 | 2;
type StatsDraft = Record<Side, Record<string, number | null>>;
interface StatsPayload {
  stats1: Record<string, number>;
  stats2: Record<string, number>;
}

const SIDES: Side[] = [1, 2];
const cellKey = (side: Side, key: string) => `${side}:${key}`;

// 比赛已有结果对应的“结果”选项
const outcomeOf = (match: BracketMatch): MatchFormValues["outcome"] => {
  if (!match.completed) return "";
  if (match.is_draw) return "draw";
  if (match.winner_id === match.participant1_id) return "1";
  if (match.winner_id === match.participant2_id) return "2";
  return "";
};

const BracketMatchModal: React.FC<BracketMatchModalProps> = ({
  bracketId,
  submit: submitOverride,
  match,
  participants,
  onCancel,
  onSaved,
  radarConfig,
}) => {
  const [form] = Form.useForm<MatchFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<StatsDraft>({ 1: {}, 2: {} });
  const [statErrors, setStatErrors] = useState<string[]>([]);
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
  const fields = radarConfig?.fields ?? [];

  useEffect(() => {
    if (!match) return;
    form.setFieldsValue({
      score1: match.score1,
      score2: match.score2,
      outcome: outcomeOf(match),
      scheduled_at: match.scheduled_at ? dayjs(match.scheduled_at) : null,
      venue: match.venue,
      note: match.note,
    });
    setStats({ 1: { ...match.stats1 }, 2: { ...match.stats2 } });
    setStatErrors([]);
    setErrorCells(new Set());
  }, [match, form]);

  if (!match) return null;

  const p1 =
    match.participant1_id != null
      ? participants.get(match.participant1_id)
      : undefined;
  const p2 =
    match.participant2_id != null
      ? participants.get(match.participant2_id)
      : undefined;
  const allowDraw = match.stage === "group";
  const sideName = (side: Side) =>
    (side === 1 ? p1?.name : p2?.name) || (side === 1 ? "一方" : "另一方");

  const toPayload = (): StatsPayload => {
    const pick = (side: Side) =>
      Object.fromEntries(fields.map((f) => [f.key, stats[side][f.key] ?? 0]));
    return { stats1: pick(1), stats2: pick(2) };
  };

  const report = (errors: string[], cells: Set<string>) => {
    setStatErrors(errors);
    setErrorCells(cells);
  };

  /**
   * 校验统计数据：录入或修改结果时，双方全部字段必填（0–9999 的整数）且满足约束。
   * 返回 undefined 表示本次不提交统计数据，false 表示校验未通过。
   */
  const checkStats = (
    values: MatchFormValues,
  ): StatsPayload | undefined | false => {
    if (fields.length === 0) return undefined;
    const complete = SIDES.every((side) =>
      fields.every((f) => stats[side][f.key] != null),
    );
    const resultPresent =
      values.score1 != null || values.score2 != null || !!values.outcome;
    const resultChanged = match.completed
      ? (values.score1 ?? null) !== match.score1 ||
        (values.score2 ?? null) !== match.score2 ||
        (values.outcome ?? "") !== outcomeOf(match)
      : resultPresent;
    const statsChanged = SIDES.some((side) => {
      const saved = (side === 1 ? match.stats1 : match.stats2) ?? {};
      return fields.some(
        (f) => (stats[side][f.key] ?? null) !== (saved[f.key] ?? null),
      );
    });

    if (!resultPresent) {
      if (statsChanged) {
        report(["请先填写比分，再录入统计数据"], new Set());
        return false;
      }
      report([], new Set());
      return undefined;
    }
    // 只修改时间、地点或备注：沿用已保存的统计数据
    if (!resultChanged && !statsChanged) {
      report([], new Set());
      return complete ? toPayload() : undefined;
    }

    const errors: string[] = [];
    const cells = new Set<string>();
    if (values.score1 == null || values.score2 == null) {
      errors.push("启用雷达图统计时需填写双方比分");
    }
    SIDES.forEach((side) => {
      const invalid = fields.filter((f) => {
        const v = stats[side][f.key];
        const bad =
          v == null || !Number.isInteger(v) || v < 0 || v > RADAR_STAT_MAX;
        if (bad) cells.add(cellKey(side, f.key));
        return bad;
      });
      if (invalid.length > 0) {
        errors.push(
          `${sideName(side)}：请填写${invalid.map((f) => f.label).join("、")}`,
        );
      }
      // 约束只在涉及的字段都已填写时检查
      (radarConfig?.constraints ?? []).forEach((c) => {
        const keys = [...c.fields, c.max];
        if (keys.some((k) => stats[side][k] == null)) return;
        const sum = c.fields.reduce((acc, k) => acc + (stats[side][k] ?? 0), 0);
        if (sum > (stats[side][c.max] ?? 0)) {
          errors.push(`${sideName(side)}：${c.message}`);
          [...c.fields, c.max].forEach((k) => cells.add(cellKey(side, k)));
        }
      });
    });
    report(errors, cells);
    return errors.length > 0 ? false : toPayload();
  };

  const setStat = (side: Side, key: string, value: number | null) => {
    setStats((prev) => ({ ...prev, [side]: { ...prev[side], [key]: value } }));
    const k = cellKey(side, key);
    if (errorCells.has(k)) {
      const next = new Set(errorCells);
      next.delete(k);
      setErrorCells(next);
    }
  };

  const submit = async (values: MatchFormValues, clear = false) => {
    // 清除结果时一并清除统计数据，无需提交
    const statsPayload = clear ? undefined : checkStats(values);
    if (statsPayload === false) return;
    setSubmitting(true);
    let winnerId: number | null = null;
    if (values.outcome === "1") winnerId = match.participant1_id;
    if (values.outcome === "2") winnerId = match.participant2_id;
    const send =
      submitOverride ??
      ((matchId: number, data: UpdateBracketMatchRequest) =>
        adminBracketAPI.updateMatch(bracketId, matchId, data));
    const resp = await send(match.id, {
      clear,
      score1: clear ? null : (values.score1 ?? null),
      score2: clear ? null : (values.score2 ?? null),
      winner_id: clear ? null : winnerId,
      is_draw: !clear && values.outcome === "draw",
      scheduled_at: values.scheduled_at ? values.scheduled_at.format() : "",
      venue: values.venue ?? "",
      note: values.note ?? "",
      ...statsPayload,
    });
    setSubmitting(false);
    handleRespWithNotifySuccess(resp, onSaved);
  };

  const handleClear = () => {
    Modal.confirm({
      title: "确定清除本场结果吗？",
      content:
        fields.length > 0
          ? "本场统计数据会一并清除，依赖本场结果的后续比赛也会一并清空"
          : "依赖本场结果的后续比赛也会一并清空",
      onOk: () => submit(form.getFieldsValue(), true),
    });
  };

  return (
    <Modal
      title={`第 ${match.seq} 场`}
      open={!!match}
      onCancel={onCancel}
      width={fields.length > 0 ? 560 : 520}
      destroyOnHidden
      footer={
        <Space>
          {match.completed && (
            <Button danger onClick={handleClear} loading={submitting}>
              清除结果
            </Button>
          )}
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={submitting}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => submit(v)}
        autoComplete="off"
      >
        <Space align="end" size="middle" wrap>
          <Form.Item label={p1?.name ?? "待定"} name="score1">
            <InputNumber min={0} placeholder="比分" style={{ width: 120 }} />
          </Form.Item>
          <Text style={{ display: "inline-block", marginBottom: 30 }}>:</Text>
          <Form.Item label={p2?.name ?? "待定"} name="score2">
            <InputNumber min={0} placeholder="比分" style={{ width: 120 }} />
          </Form.Item>
        </Space>

        <Form.Item
          label="结果"
          name="outcome"
          extra={
            allowDraw
              ? "不选择时按比分判定，比分相同记为平局"
              : "不选择时按比分判定；淘汰赛不允许平局"
          }
        >
          <Radio.Group>
            <Radio.Button value="">按比分</Radio.Button>
            <Radio.Button value="1">{p1?.name ?? "一方"} 胜</Radio.Button>
            <Radio.Button value="2">{p2?.name ?? "另一方"} 胜</Radio.Button>
            {allowDraw && <Radio.Button value="draw">平局</Radio.Button>}
          </Radio.Group>
        </Form.Item>

        {fields.length > 0 && (
          <section className="radar-stats" aria-label="本场统计数据">
            <div className="radar-stats-title">
              本场统计
              <Text type="secondary" className="radar-stats-sub">
                录入或修改结果时双方必填，用于计算实力雷达
              </Text>
            </div>
            <div className="radar-stats-grid">
              <span />
              {SIDES.map((side) => (
                <span key={side} className="radar-stats-head">
                  {sideName(side)}
                </span>
              ))}
              {fields.map((f) => (
                <div key={f.key} className="radar-stats-row">
                  <span className="radar-stats-label">
                    {f.label}
                    {f.hint && (
                      <Tooltip title={f.hint}>
                        <InfoCircleOutlined
                          className="radar-th-icon"
                          aria-label={f.hint}
                          tabIndex={0}
                        />
                      </Tooltip>
                    )}
                  </span>
                  {SIDES.map((side) => (
                    <InputNumber
                      key={side}
                      size="small"
                      min={0}
                      max={RADAR_STAT_MAX}
                      precision={0}
                      value={stats[side][f.key] ?? null}
                      status={
                        errorCells.has(cellKey(side, f.key))
                          ? "error"
                          : undefined
                      }
                      aria-label={`${sideName(side)} ${f.label}`}
                      style={{ width: "100%" }}
                      onChange={(v) => setStat(side, f.key, v ?? null)}
                    />
                  ))}
                </div>
              ))}
            </div>
            {statErrors.length > 0 && (
              <ul className="radar-stats-errors" role="alert">
                {statErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <Form.Item label="比赛时间" name="scheduled_at">
          <DatePicker
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item
          label="地点"
          name="venue"
          rules={[{ max: 200, message: "不能超过 200 个字符" }]}
        >
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item
          label="备注"
          name="note"
          rules={[{ max: 200, message: "不能超过 200 个字符" }]}
        >
          <Input placeholder="可选，公开对阵图中悬停可见" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BracketMatchModal;
