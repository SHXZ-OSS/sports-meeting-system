import { formatRadarValue } from "./radarUtils";
import "./radar.css";

export interface RadarChartDimension {
  key: string;
  label: string;
}

export interface RadarChartSeries {
  name: string;
  color: string;
  values: Record<string, number | null>;
  dashed?: boolean;
}

interface RadarChartProps {
  dimensions: RadarChartDimension[];
  series: RadarChartSeries[];
}

// 画布尺寸（viewBox 坐标，实际大小随容器缩放）
const WIDTH = 460;
const HEIGHT = 400;
const CX = WIDTH / 2;
const CY = HEIGHT / 2 + 4;
const RADIUS = 128;
const LABEL_GAP = 16;
const MAX_VALUE = 5;
const RINGS = [1, 2, 3, 4, 5];
const LABEL_LINE_CHARS = 6;

/** 第 i 个维度的角度：从正上方开始顺时针 */
const angleOf = (i: number, count: number) =>
  -Math.PI / 2 + (2 * Math.PI * i) / count;

const pointAt = (i: number, count: number, r: number) => {
  const a = angleOf(i, count);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};

const toPoints = (list: { x: number; y: number }[]) =>
  list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

const ringPoints = (count: number, ring: number) =>
  Array.from({ length: count }, (_, i) =>
    pointAt(i, count, (RADIUS * ring) / MAX_VALUE),
  );

// 环带（外环减内环，evenodd 填充），与 ECharts splitArea 一致
const bandPath = (count: number, ring: number) => {
  const toD = (list: { x: number; y: number }[]) =>
    `M${list.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;
  const outer = toD(ringPoints(count, ring));
  return ring > 1 ? outer + toD(ringPoints(count, ring - 1)) : outer;
};

const clamp = (v: number) => Math.min(MAX_VALUE, Math.max(0, v));

/** 长标签按字数折成两行 */
const splitLabel = (label: string) => {
  const chars = Array.from(label);
  if (chars.length <= LABEL_LINE_CHARS) return [label];
  const half = Math.ceil(chars.length / 2);
  return [chars.slice(0, half).join(""), chars.slice(half).join("")];
};

/**
 * 无依赖的 SVG 雷达图：网格 1–5 环、轴线、维度标签，各系列为半透明填充多边形。
 * 空值按 0 绘制并以空心点标出。
 */
const RadarChart: React.FC<RadarChartProps> = ({ dimensions, series }) => {
  const count = dimensions.length;
  if (count < 3) return null;

  const summary = series
    .map(
      (s) =>
        `${s.name}：${dimensions
          .map(
            (d) =>
              `${d.label} ${s.values[d.key] == null ? "暂无数据" : formatRadarValue(s.values[d.key])}`,
          )
          .join("，")}`,
    )
    .join("；");

  return (
    <figure className="radar-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`实力雷达图（满分 5 分）。${summary}`}
        className="radar-chart-svg"
      >
        {/* 网格：ECharts radar splitArea 交替灰带 + splitLine */}
        {RINGS.map((ring) => (
          <path
            key={`band-${ring}`}
            d={bandPath(count, ring)}
            fillRule="evenodd"
            className={`radar-band${ring % 2 === 0 ? " is-alt" : ""}`}
          />
        ))}
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={toPoints(ringPoints(count, ring))}
            className="radar-ring"
          />
        ))}
        {dimensions.map((d, i) => {
          const end = pointAt(i, count, RADIUS);
          return (
            <line
              key={d.key}
              x1={CX}
              y1={CY}
              x2={end.x}
              y2={end.y}
              className="radar-spoke"
            />
          );
        })}

        {series.map((s) => {
          const points = dimensions.map((d, i) =>
            pointAt(
              i,
              count,
              (RADIUS * clamp(s.values[d.key] ?? 0)) / MAX_VALUE,
            ),
          );
          return (
            <g key={s.name} className="radar-series">
              <polygon
                points={toPoints(points)}
                fill={s.color}
                fillOpacity={0.2}
                stroke={s.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "6 4" : undefined}
              />
              {dimensions.map((d, i) => {
                const value = s.values[d.key];
                const empty = value == null;
                return (
                  <circle
                    key={d.key}
                    cx={points[i].x}
                    cy={points[i].y}
                    r={empty ? 3.5 : 3}
                    fill={empty ? "#212121" : s.color}
                    stroke={s.color}
                    strokeWidth={empty ? 1.5 : 0}
                  >
                    <title>
                      {`${s.name} · ${d.label}：${empty ? "暂无数据" : formatRadarValue(value)}`}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {dimensions.map((d, i) => {
          const a = angleOf(i, count);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          const p = pointAt(i, count, RADIUS + LABEL_GAP);
          const anchor =
            Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
          const lines = splitLabel(d.label);
          const lineHeight = 17;
          // 上方标签整体上移，下方标签下移，左右居中对齐
          const baseY =
            sin < -0.2
              ? p.y - (lines.length - 1) * lineHeight
              : sin > 0.2
                ? p.y + 12
                : p.y + 5 - ((lines.length - 1) * lineHeight) / 2;
          return (
            <text
              key={d.key}
              x={p.x}
              y={baseY}
              textAnchor={anchor}
              className="radar-axis-label"
            >
              {lines.map((line, li) => (
                <tspan key={li} x={p.x} dy={li === 0 ? 0 : lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
      {series.length > 0 && (
        <figcaption className="radar-legend">
          {series.map((s) => (
            <span key={s.name} className="radar-legend-item">
              <span
                className={`radar-legend-swatch${s.dashed ? " is-dashed" : ""}`}
                style={{ borderColor: s.color, background: s.color }}
                aria-hidden
              />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
};

export default RadarChart;
