import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { adminBracketAPI } from "../../api/admin/bracket";
import { RadarConfig, RadarPreset, RadarPresetInfo } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import {
  RADAR_FORMULA_NOTE,
  RADAR_LABEL_MAX,
  RADAR_MAX_DIMENSIONS,
  RADAR_MIN_DIMENSIONS,
} from "./radarUtils";

const { Text } = Typography;

interface RadarConfigModalProps {
  open: boolean;
  bracketId: number;
  config?: RadarConfig | null;
  // 是否已有比赛录入了统计数据（此时不能更换预设）
  hasStats: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

// 预设维度行：可勾选并改名
interface PresetRow {
  key: string;
  label: string;
  description?: string;
  checked: boolean;
}

// 手动维度行：key 为已保存维度的 key（保留其手动评分），新增行为空
interface ManualRow {
  id: string;
  key?: string;
  label: string;
}

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}`;

const RadarConfigModal: React.FC<RadarConfigModalProps> = ({
  open,
  bracketId,
  config,
  hasStats,
  onCancel,
  onSaved,
}) => {
  const [presets, setPresets] = useState<RadarPresetInfo[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState<RadarPreset>("custom");
  const [presetRows, setPresetRows] = useState<PresetRow[]>([]);
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 按预设与已有配置生成维度行
  const buildRows = (
    info: RadarPresetInfo | undefined,
    existing?: RadarConfig | null,
  ) => {
    const presetKeys = new Set((info?.dimensions ?? []).map((d) => d.key));
    const saved = new Map(
      (existing?.dimensions ?? []).map((d) => [d.key, d] as const),
    );
    const rows: PresetRow[] = (info?.dimensions ?? []).map((d) => ({
      key: d.key,
      label: existing ? (saved.get(d.key)?.label ?? d.label) : d.label,
      description: d.description,
      checked: existing ? saved.has(d.key) : true,
    }));
    const manual: ManualRow[] = (existing?.dimensions ?? [])
      .filter((d) => !presetKeys.has(d.key))
      .map((d) => ({ id: newRowId(), key: d.key, label: d.label }));
    setPresetRows(rows);
    setManualRows(manual);
  };

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    setEnabled(true);
    adminBracketAPI.getRadarPresets().then((resp) =>
      handleResp(resp, (data) => {
        setPresets(data);
        const initial: RadarPreset = config?.preset ?? "basketball";
        setPreset(initial);
        buildRows(
          data.find((p) => p.preset === initial),
          config,
        );
      }),
    );
  }, [open, config]);

  const info = presets.find((p) => p.preset === preset);
  const presetChanged = !!config && config.preset !== preset;

  const changePreset = (next: RadarPreset) => {
    setPreset(next);
    setErrors([]);
    const nextInfo = presets.find((p) => p.preset === next);
    // 换回原预设时恢复已保存的配置，否则使用预设默认维度并保留手动维度
    if (config && config.preset === next) {
      buildRows(nextInfo, config);
      return;
    }
    setPresetRows(
      (nextInfo?.dimensions ?? []).map((d) => ({
        key: d.key,
        label: d.label,
        description: d.description,
        checked: true,
      })),
    );
    const oldPresetKeys = new Set(presetRows.map((r) => r.key));
    setManualRows(
      manualRows.filter((r) => !r.key || !oldPresetKeys.has(r.key)),
    );
  };

  const dimensions = [
    ...presetRows
      .filter((r) => r.checked)
      .map((r) => ({ key: r.key, label: r.label.trim() })),
    ...manualRows.map((r) => ({
      ...(r.key ? { key: r.key } : {}),
      label: r.label.trim(),
    })),
  ];

  const validate = () => {
    const list: string[] = [];
    if (dimensions.length < RADAR_MIN_DIMENSIONS) {
      list.push(`至少需要 ${RADAR_MIN_DIMENSIONS} 个维度`);
    }
    if (dimensions.length > RADAR_MAX_DIMENSIONS) {
      list.push(`最多 ${RADAR_MAX_DIMENSIONS} 个维度`);
    }
    if (dimensions.some((d) => !d.label)) list.push("维度名称不能为空");
    if (dimensions.some((d) => Array.from(d.label).length > RADAR_LABEL_MAX)) {
      list.push(`维度名称不能超过 ${RADAR_LABEL_MAX} 个字`);
    }
    const labels = dimensions.map((d) => d.label).filter(Boolean);
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
    if (dup.length > 0) {
      list.push(`维度名称重复：${[...new Set(dup)].join("、")}`);
    }
    return list;
  };

  const send = async (
    payload: Parameters<typeof adminBracketAPI.updateRadar>[1],
  ) => {
    setSubmitting(true);
    const resp = await adminBracketAPI.updateRadar(bracketId, payload);
    setSubmitting(false);
    handleRespWithNotifySuccess(resp, onSaved);
  };

  const handleOk = () => {
    if (!enabled) {
      if (!config) {
        onCancel();
        return;
      }
      Modal.confirm({
        title: "确定关闭雷达图吗？",
        content: "关闭后公开页面不再展示实力雷达",
        okButtonProps: { danger: true },
        onOk: () => send({ enabled: false }),
      });
      return;
    }
    const list = validate();
    setErrors(list);
    if (list.length > 0) return;
    send({ enabled: true, preset, dimensions });
  };

  const labelStatus = (label: string) =>
    !label.trim() || Array.from(label.trim()).length > RADAR_LABEL_MAX
      ? "error"
      : undefined;

  return (
    <Modal
      title="设置雷达图"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      width={640}
      destroyOnHidden
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Space>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            aria-label="启用雷达图"
          />
          <Text>{enabled ? "已启用" : "已关闭"}</Text>
        </Space>

        {enabled && (
          <>
            <div>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: 4 }}
              >
                预设
              </Text>
              <Select
                value={preset}
                onChange={changePreset}
                style={{ width: "100%" }}
                aria-label="雷达图预设"
                options={presets.map((p) => ({
                  value: p.preset,
                  label: p.label,
                }))}
              />
              {info?.description && (
                <Text
                  type="secondary"
                  style={{ display: "block", marginTop: 4, fontSize: 12 }}
                >
                  {info.description}
                </Text>
              )}
            </div>

            {presetChanged && hasStats && (
              <Alert
                type="warning"
                showIcon
                title="已有比赛录入了统计数据，更换预设将被拒绝；请先清除相关比赛结果。"
              />
            )}

            {info && info.fields.length > 0 && (
              <Alert
                type="info"
                showIcon
                title={
                  <span>
                    每场需统计：
                    {info.fields.map((f) => (
                      <Tooltip key={f.key} title={f.hint}>
                        <Tag style={{ marginInlineEnd: 4, marginBlock: 2 }}>
                          {f.label}
                        </Tag>
                      </Tooltip>
                    ))}
                  </span>
                }
                description="录入比赛结果时须同时填写双方的上述数据。"
              />
            )}

            <div>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: 6 }}
              >
                维度（{dimensions.length} / {RADAR_MIN_DIMENSIONS}–
                {RADAR_MAX_DIMENSIONS}）
              </Text>
              <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                {presetRows.map((r, i) => (
                  <div
                    key={r.key}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Checkbox
                      checked={r.checked}
                      aria-label={`包含维度 ${r.label}`}
                      onChange={(e) =>
                        setPresetRows(
                          presetRows.map((x, j) =>
                            j === i ? { ...x, checked: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      value={r.label}
                      disabled={!r.checked}
                      status={r.checked ? labelStatus(r.label) : undefined}
                      maxLength={RADAR_LABEL_MAX + 4}
                      aria-label="维度名称"
                      style={{ width: 140, flex: "none" }}
                      onChange={(e) =>
                        setPresetRows(
                          presetRows.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                    >
                      {r.description ?? "手动评分"}
                    </Text>
                  </div>
                ))}
                {manualRows.map((r, i) => (
                  <div
                    key={r.id}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                      手动
                    </Tag>
                    <Input
                      value={r.label}
                      status={labelStatus(r.label)}
                      placeholder="维度名称"
                      maxLength={RADAR_LABEL_MAX + 4}
                      aria-label="手动维度名称"
                      style={{ width: 140, flex: "none" }}
                      onChange={(e) =>
                        setManualRows(
                          manualRows.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                    >
                      管理员按 0–5 评分
                    </Text>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="删除维度"
                      onClick={() =>
                        setManualRows(manualRows.filter((_, j) => j !== i))
                      }
                    />
                  </div>
                ))}
                {presetRows.length === 0 && manualRows.length === 0 && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无维度"
                  />
                )}
              </Space>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                style={{ marginTop: 8 }}
                block
                disabled={dimensions.length >= RADAR_MAX_DIMENSIONS}
                onClick={() =>
                  setManualRows([...manualRows, { id: newRowId(), label: "" }])
                }
              >
                添加手动维度
              </Button>
            </div>

            {info && info.dimensions.some((d) => d.formula) && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {RADAR_FORMULA_NOTE}
                管理员可在“手动评分”中覆盖任意公式维度。
              </Text>
            )}

            {errors.length > 0 && (
              <Alert
                type="error"
                showIcon
                title={errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              />
            )}
          </>
        )}
      </Space>
    </Modal>
  );
};

export default RadarConfigModal;
