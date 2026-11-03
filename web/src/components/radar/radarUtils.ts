import { RadarConfig, RadarPreset } from "../../types";

// 预设名称（与后端 RadarPresetInfo.label 保持一致，用于未加载预设列表时展示）
export const RADAR_PRESET_LABELS: Record<RadarPreset, string> = {
  football: "足球",
  basketball: "篮球",
  table_tennis: "乒乓球",
  badminton: "羽毛球",
  volleyball: "排球",
  custom: "自定义",
};

// 公式维度的统一计算规则说明
export const RADAR_FORMULA_NOTE =
  "各项在该队全部已统计的比赛中累加后计算比值，按区间线性映射到 0–5（标注越少越好的维度反向）；场次少时向 2.5 收缩：分数 =（n × 映射值 + 0.5 × 2.5）÷（n + 0.5）。";

// 参照 RM Schedule 机器人数据雷达图配色
export const RADAR_COLORS = {
  single: "#FFB300",
  red: "#E53935",
  blue: "#1E88E5",
  average: "#FFFFFF",
} as const;

export const RADAR_MIN_DIMENSIONS = 3;
export const RADAR_MAX_DIMENSIONS = 10;
export const RADAR_LABEL_MAX = 12;
export const RADAR_STAT_MAX = 9999;

/** 保留两位小数，空值显示为 — */
export const formatRadarValue = (value: number | null | undefined) =>
  value == null ? "—" : value.toFixed(2);

/** 是否需要在比赛中统计数据（存在统计字段） */
export const radarHasFields = (config?: RadarConfig | null) =>
  !!config && config.fields.length > 0;
