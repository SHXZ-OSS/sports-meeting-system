import { useId } from "react";
import { Drawer, Tooltip } from "antd";
import {
  CloseOutlined,
  InfoCircleOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  BracketDetail,
  BracketMatch,
  BracketParticipant,
  BracketRadar,
} from "../../types";
import { getGroupName } from "../../utils/bracket";
import RadarChart, { RadarChartSeries } from "../radar/RadarChart";
import {
  RADAR_COLORS,
  RADAR_FORMULA_NOTE,
  formatRadarValue,
} from "../radar/radarUtils";
import {
  formatMatchScore,
  getHeadToHead,
  getMatchRoundLabel,
  getParticipantRecord,
  getStandingOf,
  isMatchLoser,
} from "./analysis";
import schoolRed from "../../assets/rm/school_red.png";
import schoolBlue from "../../assets/rm/school_blue.png";
import "../radar/radar.css";
import "./AnalysisSheets.css";

/**
 * 队伍 / 比赛分析底部弹层：移植 RM Schedule 的 v-bottom-sheet + AnalyzeTeam / AnalyzeMatch。
 */

// ==== 通用：底部弹层、信息标签、队伍头部 ====

interface SheetProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}

const AnalysisSheet = ({ open, onClose, labelledBy, children }: SheetProps) => (
  <Drawer
    open={open}
    onClose={onClose}
    placement="bottom"
    size="auto"
    closable={false}
    aria-labelledby={labelledBy}
    classNames={{ root: "as-drawer" }}
    // 对阵图全屏时弹层需渲染在全屏元素内才可见
    getContainer={() =>
      (document.fullscreenElement as HTMLElement | null) ?? document.body
    }
  >
    <button
      type="button"
      className="as-close"
      aria-label="关闭"
      onClick={onClose}
    >
      <CloseOutlined />
    </button>
    {children}
  </Drawer>
);

/** RM 的 <v-chip color="info" label><h3>标题</h3></v-chip> */
const InfoChip = ({ id, children }: { id: string; children: string }) => (
  <h3 className="as-chip" id={id}>
    {children}
  </h3>
);

const Section = ({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) => {
  const id = useId();
  return (
    <section
      className={["as-section", wide ? "is-wide" : ""].join(" ")}
      aria-labelledby={id}
    >
      <InfoChip id={id}>{title}</InfoChip>
      {children}
    </section>
  );
};

// RM TeamHeader 第三行“RoboMaster 高校积分榜第 N 名 (分)”：这里为种子与小组名次
const rankLineOf = (detail: BracketDetail, p: BracketParticipant) => {
  const parts = [`种子 ${p.seed}`];
  const standing = getStandingOf(detail, p.id);
  if (standing) {
    parts.push(
      `${getGroupName(standing.groupIndex)}第 ${standing.row.rank} 名 (${standing.row.points} 分)`,
    );
  }
  return parts.join(" · ");
};

/** RM TeamHeader：头像 + 名称 + 排名；right 为镜像布局（蓝方） */
const TeamHeader = ({
  detail,
  participant,
  side,
  right,
  nameId,
}: {
  detail: BracketDetail;
  participant: BracketParticipant;
  side: "red" | "blue";
  right?: boolean;
  nameId?: string;
}) => (
  <div className={["as-header", right ? "is-right" : ""].join(" ")}>
    <img
      className="as-avatar"
      src={side === "red" ? schoolRed : schoolBlue}
      alt=""
    />
    <div className="as-header-text">
      <h2 className="as-header-name" id={nameId}>
        {participant.name}
      </h2>
      {participant.class_name &&
        participant.class_name !== participant.name && (
          <h4 className="as-header-sub">{participant.class_name}</h4>
        )}
      <p className="as-header-rank">{rankLineOf(detail, participant)}</p>
    </div>
  </div>
);

// ==== 比赛战绩 / 交手记录表 ====

const NameCell = ({ p }: { p?: BracketParticipant }) => (
  <>
    {p?.name ?? "待定"}
    {p?.class_name && p.class_name !== p.name && (
      <>
        <br />
        <span className="as-sub">{p.class_name}</span>
      </>
    )}
  </>
);

const MatchTable = ({
  list,
  detail,
  participants,
  caption,
  withRound,
}: {
  list: BracketMatch[];
  detail: BracketDetail;
  participants: Map<number, BracketParticipant>;
  caption: string;
  withRound?: boolean;
}) => {
  if (list.length === 0) {
    return <p className="as-empty">暂无比赛记录</p>;
  }
  const nameOf = (id: number | null) =>
    id != null ? participants.get(id) : undefined;
  return (
    <div className="as-table-scroll">
      <table className="as-table">
        <caption className="radar-sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">场次</th>
            {withRound && <th scope="col">轮次</th>}
            <th scope="col">红方</th>
            <th scope="col">蓝方</th>
            <th scope="col">比分</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.id || m.seq}>
              <td>{m.seq}</td>
              {withRound && <td>{getMatchRoundLabel(m, detail.matches)}</td>}
              <td className={isMatchLoser(m, 1) ? "is-loser" : ""}>
                <NameCell p={nameOf(m.participant1_id)} />
              </td>
              <td className={isMatchLoser(m, 2) ? "is-loser" : ""}>
                <NameCell p={nameOf(m.participant2_id)} />
              </td>
              <td className="as-score">{formatMatchScore(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ==== 实力雷达 ====

const RadarAlert = () => (
  <div className="as-alert" role="note">
    <WarningFilled aria-hidden="true" />
    该对阵表未开启实力雷达
  </div>
);

const valuesOf = (radar: BracketRadar, id: number) =>
  Object.fromEntries(
    radar.config.dimensions.map((d) => [
      d.key,
      radar.teams[String(id)]?.[d.key]?.value ?? null,
    ]),
  );

const DimensionHead = ({
  label,
  description,
  manualOnly,
}: {
  label: string;
  description?: string;
  manualOnly: boolean;
}) => (
  <Tooltip title={description || (manualOnly ? "由管理员手动评分" : undefined)}>
    <span className="radar-th" tabIndex={0}>
      {label}
      <InfoCircleOutlined className="radar-th-icon" />
    </span>
  </Tooltip>
);

interface RadarTeam {
  participant: BracketParticipant;
  color: string;
}

const RadarSection = ({
  radar,
  teams,
}: {
  radar?: BracketRadar;
  teams: RadarTeam[];
}) => {
  if (!radar) return <RadarAlert />;
  const { dimensions } = radar.config;
  const series: RadarChartSeries[] = [
    {
      name: "平均值",
      color: RADAR_COLORS.average,
      values: radar.average,
    },
    ...teams.map((t) => ({
      name: t.participant.name,
      color: t.color,
      values: valuesOf(radar, t.participant.id),
    })),
  ];
  const single = teams.length === 1;
  const hasFormula = dimensions.some((d) => d.formula);
  const cell = (id: number, key: string) => {
    const v = radar.teams[String(id)]?.[key];
    return (
      <>
        <span className={v?.value == null ? "radar-empty" : ""}>
          {formatRadarValue(v?.value)}
        </span>
        {v?.manual && <span className="radar-manual-tag">手动</span>}
      </>
    );
  };

  return (
    <>
      {/* RM RobotDataRadar 的 title.subtext */}
      <div className="as-subtext">
        <p>* 各维度满分 5 分，平均值为本对阵表内有数据的参赛方均值</p>
        {hasFormula && <p>** {RADAR_FORMULA_NOTE}</p>}
      </div>
      <RadarChart dimensions={dimensions} series={series} />
      <div className="as-table-scroll">
        <table className="as-table is-center">
          <caption className="radar-sr-only">实力雷达各维度评分</caption>
          <thead>
            <tr>
              <th scope="col" className="is-start">
                维度
              </th>
              {teams.map((t) => (
                <th scope="col" key={t.participant.id}>
                  <span className="as-dot" style={{ background: t.color }} />
                  {single ? "本队" : t.participant.name}
                </th>
              ))}
              <th scope="col">平均</th>
              {single && hasFormula && <th scope="col">场次</th>}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => (
              <tr key={d.key}>
                <th scope="row" className="is-start">
                  <DimensionHead
                    label={d.label}
                    description={d.description}
                    manualOnly={!d.formula}
                  />
                </th>
                {teams.map((t) => (
                  <td key={t.participant.id}>
                    {cell(t.participant.id, d.key)}
                  </td>
                ))}
                <td className="as-muted">
                  {formatRadarValue(radar.average[d.key])}
                </td>
                {single && hasFormula && (
                  <td className="as-muted">
                    {d.formula
                      ? (radar.teams[String(teams[0].participant.id)]?.[d.key]
                          ?.sample ?? 0)
                      : "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="as-note">
        <p>
          “—” 表示暂无数据；标注“手动”的数值由管理员评分
          {hasFormula ? "，覆盖公式结果" : ""}。
        </p>
      </div>
    </>
  );
};

// ==== 分析队伍（AnalyzeTeam） ====

interface TeamSheetProps {
  detail: BracketDetail;
  participantId: number | null;
  open: boolean;
  onClose: () => void;
}

export const TeamAnalysisSheet: React.FC<TeamSheetProps> = ({
  detail,
  participantId,
  open,
  onClose,
}) => {
  const nameId = useId();
  const participants = new Map(detail.participants.map((p) => [p.id, p]));
  const participant =
    participantId != null ? participants.get(participantId) : undefined;
  const standing = participant ? getStandingOf(detail, participant.id) : null;

  return (
    <AnalysisSheet open={open} onClose={onClose} labelledBy={nameId}>
      {participant ? (
        <div className="as-card">
          <TeamHeader
            detail={detail}
            participant={participant}
            side="red"
            nameId={nameId}
          />
          <div className="as-grid">
            <Section title="比赛战绩">
              <MatchTable
                list={getParticipantRecord(detail.matches, participant.id)}
                detail={detail}
                participants={participants}
                caption={`${participant.name}比赛战绩`}
              />
            </Section>

            {standing && (
              <Section
                title={`${getGroupName(standing.groupIndex).replace(" ", "")}小组积分 ${standing.row.rank}/${standing.total}`}
              >
                <div className="as-table-scroll">
                  <table className="as-table">
                    <caption className="radar-sr-only">小组积分</caption>
                    <thead>
                      <tr>
                        <th scope="col">项目名称</th>
                        <th scope="col">数值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["场次", standing.row.played],
                        ["胜", standing.row.won],
                        ["平", standing.row.drawn],
                        ["负", standing.row.lost],
                        ["得分", standing.row.score_for],
                        ["失分", standing.row.score_against],
                        [
                          "净胜分",
                          standing.row.score_diff > 0
                            ? `+${standing.row.score_diff}`
                            : standing.row.score_diff,
                        ],
                        ["积分", standing.row.points],
                      ].map(([label, value]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section title="雷达图">
              <RadarSection
                radar={detail.radar}
                teams={[{ participant, color: RADAR_COLORS.single }]}
              />
            </Section>
          </div>
        </div>
      ) : (
        <div className="as-card">
          <h2 className="radar-sr-only" id={nameId}>
            分析队伍
          </h2>
          <div className="as-alert is-error" role="note">
            <WarningFilled aria-hidden="true" />
            未找到该队伍的信息
          </div>
        </div>
      )}
    </AnalysisSheet>
  );
};

// ==== 分析比赛（AnalyzeMatch） ====

interface MatchSheetProps {
  detail: BracketDetail;
  matchSeq: number | null;
  open: boolean;
  onClose: () => void;
}

export const MatchAnalysisSheet: React.FC<MatchSheetProps> = ({
  detail,
  matchSeq,
  open,
  onClose,
}) => {
  const titleId = useId();
  const participants = new Map(detail.participants.map((p) => [p.id, p]));
  const match =
    matchSeq != null
      ? detail.matches.find((m) => m.seq === matchSeq)
      : undefined;
  const red =
    match?.participant1_id != null
      ? participants.get(match.participant1_id)
      : undefined;
  const blue =
    match?.participant2_id != null
      ? participants.get(match.participant2_id)
      : undefined;

  // 本场统计：字段名称取雷达配置，未配置时直接显示字段键
  const statKeys = (() => {
    if (!match) return [];
    const configured = detail.radar?.config.fields ?? [];
    const present = new Set([
      ...Object.keys(match.stats1 ?? {}),
      ...Object.keys(match.stats2 ?? {}),
    ]);
    if (present.size === 0) return [];
    const list = configured
      .filter((f) => present.has(f.key))
      .map((f) => ({ key: f.key, label: f.label }));
    present.forEach((key) => {
      if (!list.some((f) => f.key === key)) list.push({ key, label: key });
    });
    return list;
  })();

  return (
    <AnalysisSheet open={open} onClose={onClose} labelledBy={titleId}>
      {match && red && blue ? (
        <div className="as-card">
          <h2 className="radar-sr-only" id={titleId}>
            分析比赛第 {match.seq} 场：{red.name} 对 {blue.name}
          </h2>
          <div className="as-versus">
            <TeamHeader detail={detail} participant={red} side="red" />
            <div className="as-versus-meta">
              <span className="as-versus-order">
                {getMatchRoundLabel(match, detail.matches)} · 第 {match.seq} 场
              </span>
              <b className="as-versus-score">{formatMatchScore(match)}</b>
            </div>
            <TeamHeader detail={detail} participant={blue} side="blue" right />
          </div>
          <div className="as-grid">
            <Section title="雷达图">
              <RadarSection
                radar={detail.radar}
                teams={[
                  { participant: red, color: RADAR_COLORS.red },
                  { participant: blue, color: RADAR_COLORS.blue },
                ]}
              />
            </Section>

            <Section title="历史战绩">
              <MatchTable
                list={getHeadToHead(detail.matches, red.id, blue.id)}
                detail={detail}
                participants={participants}
                caption={`${red.name}与${blue.name}交手记录`}
                withRound
              />
            </Section>

            {statKeys.length > 0 && (
              <Section title="本场统计" wide>
                <div className="as-table-scroll">
                  <table className="as-table is-center">
                    <caption className="radar-sr-only">本场统计</caption>
                    <thead>
                      <tr>
                        <th scope="col">
                          <span
                            className="as-dot"
                            style={{ background: RADAR_COLORS.red }}
                          />
                          {red.name}
                        </th>
                        <th scope="col">数据项</th>
                        <th scope="col">
                          <span
                            className="as-dot"
                            style={{ background: RADAR_COLORS.blue }}
                          />
                          {blue.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statKeys.map((f) => (
                        <tr key={f.key}>
                          <td>{match.stats1?.[f.key] ?? "-"}</td>
                          <th scope="row" className="as-muted">
                            {f.label}
                          </th>
                          <td>{match.stats2?.[f.key] ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        </div>
      ) : (
        <div className="as-card">
          <h2 className="radar-sr-only" id={titleId}>
            分析比赛
          </h2>
          <div className="as-alert is-error" role="note">
            <WarningFilled aria-hidden="true" />
            对阵双方尚未确定
          </div>
        </div>
      )}
    </AnalysisSheet>
  );
};
