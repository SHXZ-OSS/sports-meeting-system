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
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { adminBracketAPI } from "../api/admin/bracket";
import { BracketMatch, BracketParticipant } from "../types";
import { handleRespWithNotifySuccess } from "../utils/handleResp";

const { Text } = Typography;

interface BracketMatchModalProps {
  bracketId: number;
  match: BracketMatch | null;
  participants: Map<number, BracketParticipant>;
  onCancel: () => void;
  onSaved: () => void;
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

const BracketMatchModal: React.FC<BracketMatchModalProps> = ({
  bracketId,
  match,
  participants,
  onCancel,
  onSaved,
}) => {
  const [form] = Form.useForm<MatchFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!match) return;
    let outcome: MatchFormValues["outcome"] = "";
    if (match.completed) {
      if (match.is_draw) outcome = "draw";
      else if (match.winner_id === match.participant1_id) outcome = "1";
      else if (match.winner_id === match.participant2_id) outcome = "2";
    }
    form.setFieldsValue({
      score1: match.score1,
      score2: match.score2,
      outcome,
      scheduled_at: match.scheduled_at ? dayjs(match.scheduled_at) : null,
      venue: match.venue,
      note: match.note,
    });
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

  const submit = async (values: MatchFormValues, clear = false) => {
    setSubmitting(true);
    let winnerId: number | null = null;
    if (values.outcome === "1") winnerId = match.participant1_id;
    if (values.outcome === "2") winnerId = match.participant2_id;
    const resp = await adminBracketAPI.updateMatch(bracketId, match.id, {
      clear,
      score1: clear ? null : (values.score1 ?? null),
      score2: clear ? null : (values.score2 ?? null),
      winner_id: clear ? null : winnerId,
      is_draw: !clear && values.outcome === "draw",
      scheduled_at: values.scheduled_at ? values.scheduled_at.format() : "",
      venue: values.venue ?? "",
      note: values.note ?? "",
    });
    setSubmitting(false);
    handleRespWithNotifySuccess(resp, onSaved);
  };

  const handleClear = () => {
    Modal.confirm({
      title: "确定清除本场结果吗？",
      content: "依赖本场结果的后续比赛也会一并清空",
      onOk: () => submit(form.getFieldsValue(), true),
    });
  };

  return (
    <Modal
      title={`第 ${match.seq} 场`}
      open={!!match}
      onCancel={onCancel}
      width={520}
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
