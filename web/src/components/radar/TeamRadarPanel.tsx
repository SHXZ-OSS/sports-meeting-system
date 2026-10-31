import { useMemo, useState } from "react";
import { Empty, Select, Switch, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { BracketDetail, BracketParticipant } from "../../types";
import RadarChart, { RadarChartSeries } from "./RadarChart";
import {
  RADAR_COLORS,
  RADAR_FORMULA_NOTE,
  RADAR_PRESET_LABELS,
  formatRadarValue,
} from "./radarUtils";
import "./radar.css";

interface TeamRadarPanelProps {
  detail: BracketDetail;
}

const participantLabel = (p: BracketParticipant) =>
  p.class_name && p.class_name !== p.name
    ? `${p.name}（${p.class_name}）`
    : p.name;

/** 实力雷达面板：雷达图（可对比两队与平均值）+ 全部参赛方数据表 */
const TeamRadarPanel: React.FC<TeamRadarPanelProps> = ({ detail }) => {
  const radar = detail.radar;
  const participants = useMemo(
    () => [...detail.participants].sort((a, b) => a.seed - b.seed),
    [detail.participants],
  );
  // 用户选择按对阵表 id 区分，切换对阵表后回到默认（种子 1）
  const [picked, setPicked] = useState<{
    id: number;
    a: number | null;
    b: number | null;
  } | null>(null);
  const [showAverage, setShowAverage] = useState(true);

  if (!radar || participants.length === 0) {
    return <Empty description="暂无雷达图数据" />;
  }

  const { config } = radar;
  const dimensions = config.dimensions;
  const bracketId = detail.bracket.id;
  const exists = (id: number | null) =>
    id != null && participants.some((p) => p.id === id);
  const current = picked && picked.id === bracketId ? picked : null;
  const teamA =
    current && exists(current.a) ? current.a : (participants[0]?.id ?? null);
  const teamB =
    current && exists(current.b) && current.b !== teamA ? current.b : null;
  const update = (a: number | null, b: number | null) =>
    setPicked({ id: bracketId, a, b });

  const byId = new Map(participants.map((p) => [p.id, p]));
  const valuesOf = (id: number) =>
    Object.fromEntries(
      dimensions.map((d) => [
        d.key,
        radar.teams[String(id)]?.[d.key]?.value ?? null,
      ]),
    );

  const series: RadarChartSeries[] = [];
  if (showAverage) {
    series.push({
      name: "平均值",
      color: RADAR_COLORS.average,
      values: radar.average,
      dashed: true,
    });
  }
  if (teamA != null) {
    series.push({
      name: byId.get(teamA)?.name ?? "—",
      color: teamB != null ? RADAR_COLORS.red : RADAR_COLORS.single,
      values: valuesOf(teamA),
    });
  }
  if (teamB != null) {
    series.push({
      name: byId.get(teamB)?.name ?? "—",
      color: RADAR_COLORS.blue,
      values: valuesOf(teamB),
    });
  }

  const options = participants.map((p) => ({
    value: p.id,
    label: participantLabel(p),
  }));
  const hasFormula = dimensions.some((d) => d.formula);

  // 场次：取各公式维度的最大样本数（手动维度不计场次）
  const sampleOf = (id: number) => {
    const team = radar.teams[String(id)];
    if (!team) return 0;
    return Math.max(
      0,
      ...dimensions
        .filter((d) => d.formula)
        .map((d) => team[d.key]?.sample ?? 0),
    );
  };

  return (
    <div className="radar-panel">
      <div className="bv-panel radar-panel-main">
        <div className="bv-panel-head">
          <span className="bv-panel-title">实力雷达</span>
          <span className="radar-preset-tag">
            {RADAR_PRESET_LABELS[config.preset]}
          </span>
        </div>
        <div className="radar-controls">
          <div className="radar-control">
            <span className="radar-control-label">
              <i
                className="radar-dot"
                style={{
                  background:
                    teamB != null ? RADAR_COLORS.red : RADAR_COLORS.single,
                }}
              />
              队伍
            </span>
            <Select
              value={teamA ?? undefined}
              onChange={(v: number) => update(v, teamB === v ? null : teamB)}
              options={options}
              showSearch={{ optionFilterProp: "label" }}
              aria-label="选择队伍"
              className="radar-select"
            />
          </div>
          <div className="radar-control">
            <span className="radar-control-label">
              <i
                className="radar-dot"
                style={{ background: RADAR_COLORS.blue }}
              />
              对比
            </span>
            <Select
              value={teamB ?? undefined}
              placeholder="可选，选择对比队伍"
              allowClear
              onChange={(v?: number) => update(teamA, v ?? null)}
              options={options.filter((o) => o.value !== teamA)}
              showSearch={{ optionFilterProp: "label" }}
              aria-label="选择对比队伍"
              className="radar-select"
            />
          </div>
          <label className="radar-control is-inline">
            <Switch
              size="small"
              checked={showAverage}
              onChange={setShowAverage}
              aria-label="显示平均值"
            />
            <span>平均值</span>
          </label>
        </div>
        <RadarChart dimensions={dimensions} series={series} />
      </div>

      <div className="bv-panel">
        <div className="bv-panel-head">
          <span className="bv-panel-title">各队评分</span>
          <span className="radar-hint">满分 5.00</span>
        </div>
        <div className="radar-table-scroll">
          <table className="radar-table">
            <caption className="radar-sr-only">各参赛方雷达维度评分</caption>
            <thead>
              <tr>
                <th scope="col" className="is-name">
                  参赛方
                </th>
                {dimensions.map((d) => (
                  <th scope="col" key={d.key}>
                    <Tooltip
                      title={
                        d.description ||
                        (d.formula ? undefined : "由管理员手动评分")
                      }
                    >
                      <span className="radar-th" tabIndex={0}>
                        {d.label}
                        <InfoCircleOutlined className="radar-th-icon" />
                      </span>
                    </Tooltip>
                  </th>
                ))}
                {hasFormula && <th scope="col">场次</th>}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const team = radar.teams[String(p.id)];
                const tone =
                  p.id === teamA
                    ? teamB != null
                      ? "is-red"
                      : "is-single"
                    : p.id === teamB
                      ? "is-blue"
                      : "";
                return (
                  <tr key={p.id} className={tone}>
                    <th scope="row" className="is-name">
                      <span className="radar-name">{p.name}</span>
                      {p.class_name && p.class_name !== p.name && (
                        <span className="bv-sub">{p.class_name}</span>
                      )}
                    </th>
                    {dimensions.map((d) => {
                      const v = team?.[d.key];
                      return (
                        <td key={d.key}>
                          <span
                            className={v?.value == null ? "radar-empty" : ""}
                          >
                            {formatRadarValue(v?.value)}
                          </span>
                          {v?.manual && (
                            <span className="radar-manual-tag">手动</span>
                          )}
                        </td>
                      );
                    })}
                    {hasFormula && <td>{sampleOf(p.id)}</td>}
                  </tr>
                );
              })}
              <tr className="is-average">
                <th scope="row" className="is-name">
                  平均值
                </th>
                {dimensions.map((d) => (
                  <td key={d.key}>{formatRadarValue(radar.average[d.key])}</td>
                ))}
                {hasFormula && <td />}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bv-panel-note radar-note">
          {hasFormula && <p>{RADAR_FORMULA_NOTE}</p>}
          <p>
            “—” 表示暂无数据；标注“手动”的数值由管理员评分
            {hasFormula ? "，覆盖公式结果" : ""}。
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeamRadarPanel;
