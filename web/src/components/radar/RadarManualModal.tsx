import { useEffect, useMemo, useState } from "react";
import {
  Button,
  InputNumber,
  message,
  Modal,
  Space,
  Table,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { InfoCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { adminBracketAPI } from "../../api/admin/bracket";
import { BracketDetail, BracketParticipant } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { formatRadarValue } from "./radarUtils";

const { Text } = Typography;

interface RadarManualModalProps {
  open: boolean;
  detail: BracketDetail;
  onCancel: () => void;
  // 任一参赛方保存成功后刷新详情（不关闭弹窗）
  onSaved: () => void;
}

type Draft = Record<number, Record<string, number | null>>;

const fromParticipants = (list: BracketParticipant[]): Draft =>
  Object.fromEntries(
    list.map((p) => [p.id, { ...(p.radar_manual ?? {}) }] as const),
  );

/** 手动评分：每个参赛方 × 维度，留空表示使用公式结果 */
const RadarManualModal: React.FC<RadarManualModalProps> = ({
  open,
  detail,
  onCancel,
  onSaved,
}) => {
  const config = detail.bracket.radar_config;
  const dimensions = useMemo(() => config?.dimensions ?? [], [config]);
  const participants = useMemo(
    () => [...detail.participants].sort((a, b) => a.seed - b.seed),
    [detail.participants],
  );
  // baseline 为已保存的值，draft 为编辑中的值
  const [baseline, setBaseline] = useState<Draft>({});
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState<number | "all" | null>(null);

  useEffect(() => {
    if (!open) return;
    const init = fromParticipants(detail.participants);
    setBaseline(init);
    setDraft(init);
    // 只在打开时初始化，避免保存后刷新详情覆盖其他行未保存的修改
  }, [open]);

  const changesOf = (id: number) => {
    const before = baseline[id] ?? {};
    const after = draft[id] ?? {};
    const out: Record<string, number | null> = {};
    dimensions.forEach((d) => {
      const a = before[d.key] ?? null;
      const b = after[d.key] ?? null;
      if (a !== b) out[d.key] = b;
    });
    return out;
  };

  const dirtyIds = participants
    .map((p) => p.id)
    .filter((id) => Object.keys(changesOf(id)).length > 0);

  const saveOne = async (id: number, notify = true) => {
    const values = changesOf(id);
    if (Object.keys(values).length === 0) return true;
    const resp = await adminBracketAPI.setParticipantRadar(
      detail.bracket.id,
      id,
      values,
    );
    let ok = false;
    const done = () => {
      ok = true;
      setBaseline((prev) => ({ ...prev, [id]: { ...(draft[id] ?? {}) } }));
    };
    // 批量保存时只提示错误，最后统一提示成功
    if (notify) handleRespWithNotifySuccess(resp, done);
    else handleResp(resp, done);
    return ok;
  };

  const handleSaveRow = async (id: number) => {
    setSaving(id);
    const ok = await saveOne(id);
    setSaving(null);
    if (ok) onSaved();
  };

  const handleSaveAll = async () => {
    setSaving("all");
    let saved = 0;
    for (const id of dirtyIds) {
      if (!(await saveOne(id, false))) break;
      saved++;
    }
    setSaving(null);
    if (saved > 0) {
      message.success(`已保存 ${saved} 个参赛方的评分`);
      onSaved();
    }
  };

  const setCell = (id: number, key: string, value: number | null) =>
    setDraft((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [key]: value },
    }));

  const columns: ColumnsType<BracketParticipant> = [
    {
      title: "参赛方",
      key: "name",
      fixed: "left",
      width: 128,
      render: (_, p) => (
        <span>
          {p.name}
          {p.class_name && p.class_name !== p.name && (
            <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              {p.class_name}
            </Text>
          )}
        </span>
      ),
    },
    ...dimensions.map((d) => ({
      title: (
        <Tooltip
          title={d.description || (d.formula ? undefined : "手动评分维度")}
        >
          <span style={{ cursor: "help" }}>
            {d.label}{" "}
            <InfoCircleOutlined style={{ fontSize: 11, opacity: 0.6 }} />
          </span>
        </Tooltip>
      ),
      key: d.key,
      width: 104,
      render: (_: unknown, p: BracketParticipant) => {
        const computed = detail.radar?.teams[String(p.id)]?.[d.key];
        // 公式维度显示公式结果作为占位；手动维度未评分
        const placeholder = d.formula
          ? computed && !computed.manual && computed.value != null
            ? `公式 ${formatRadarValue(computed.value)}`
            : "公式"
          : "未评分";
        return (
          <InputNumber
            size="small"
            min={0}
            max={5}
            step={0.1}
            precision={2}
            value={draft[p.id]?.[d.key] ?? null}
            placeholder={placeholder}
            aria-label={`${p.name} ${d.label}`}
            style={{ width: 92 }}
            onChange={(v) => setCell(p.id, d.key, v ?? null)}
          />
        );
      },
    })),
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 72,
      render: (_, p) => (
        <Button
          size="small"
          type="link"
          disabled={!dirtyIds.includes(p.id) || saving === "all"}
          loading={saving === p.id}
          onClick={() => handleSaveRow(p.id)}
        >
          保存
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title="手动评分"
      open={open}
      onCancel={onCancel}
      width={Math.min(1100, 260 + dimensions.length * 110)}
      style={{ maxWidth: "calc(100vw - 16px)" }}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onCancel}>关闭</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={dirtyIds.length === 0}
            loading={saving === "all"}
            onClick={handleSaveAll}
          >
            保存全部修改{dirtyIds.length > 0 ? `（${dirtyIds.length}）` : ""}
          </Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        评分范围
        0–5，可保留两位小数。公式维度留空即使用公式计算结果，填写后覆盖公式；手动维度留空表示未评分。
      </Text>
      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={participants}
        pagination={false}
        scroll={{ x: "max-content", y: 480 }}
      />
    </Modal>
  );
};

export default RadarManualModal;
