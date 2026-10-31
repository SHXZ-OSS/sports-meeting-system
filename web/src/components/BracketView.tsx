import { useMemo, useState, useSyncExternalStore } from "react";
import { Empty, Tooltip } from "antd";
import dayjs from "dayjs";
import {
  BracketDetail,
  BracketMatch,
  BracketParticipant,
  BracketStage,
  BracketStandingRow,
} from "../types";
import {
  getGroupName,
  getBracketChampion,
  getRoundTitle,
  getSlotPlaceholder,
} from "../utils/bracket";
import schoolRed from "../assets/rm/school_red.png";
import schoolBlue from "../assets/rm/school_blue.png";
import schoolGrey from "../assets/rm/school_grey.png";
import orderBg from "../assets/rm/order_bg.png";
import championImg from "../assets/rm/champion.png";
import "./BracketView.css";

interface BracketViewProps {
  detail: BracketDetail;
  // 点击比赛（管理端用于录入结果）；不传则只读
  onMatchClick?: (match: BracketMatch) => void;
}

// ≥ 992px 使用 RM Schedule 桌面端经典对阵图（MatchGraph），否则使用移动端卡片对阵图
const DESKTOP_QUERY = "(min-width: 992px)";

const subscribeDesktop = (onChange: () => void) => {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

const useIsDesktop = () =>
  useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );

type Variant = "classic" | "card";
// 标题横幅：普通（青）/ 冠军（金）/ 季军、败者组（灰橙）
type Tone = "normal" | "gold" | "loser";

interface SharedProps {
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  onMatchClick?: (match: BracketMatch) => void;
}

interface SideInfo {
  participant?: BracketParticipant;
  label: string;
  isWinner: boolean;
  isLoser: boolean;
  // 未比赛时比分徽标显示“-”，轮空晋级显示“轮空晋级”
  scoreText: string;
  byeWin: boolean;
}

const getSide = (
  match: BracketMatch,
  side: 1 | 2,
  participants: Map<number, BracketParticipant>,
  matchesBySeq: Map<number, BracketMatch>,
): SideInfo => {
  const pid = side === 1 ? match.participant1_id : match.participant2_id;
  const score = side === 1 ? match.score1 : match.score2;
  const participant = pid != null ? participants.get(pid) : undefined;
  const isWinner = pid != null && match.winner_id === pid;
  const isLoser =
    match.status === "completed" && !match.is_draw && pid != null && !isWinner;
  const byeWin = match.status === "bye" && isWinner;
  let scoreText = "-";
  if (byeWin) scoreText = "轮空晋级";
  else if (score != null) scoreText = String(score);
  else if (isWinner && match.status === "completed") scoreText = "胜";
  return {
    participant,
    label: participant
      ? participant.name
      : getSlotPlaceholder(match, side, matchesBySeq),
    isWinner,
    isLoser,
    scoreText,
    byeWin,
  };
};

const isClickable = (
  match: BracketMatch,
  onClick?: (match: BracketMatch) => void,
) =>
  !!onClick && (match.status === "scheduled" || match.status === "completed");

// 可点击比赛的无障碍属性（role=button、键盘 Enter/Space）
const clickProps = (
  match: BracketMatch,
  onClick?: (match: BracketMatch) => void,
) => {
  if (!isClickable(match, onClick)) return {};
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `录入第 ${match.seq} 场比赛结果`,
    onClick: () => onClick?.(match),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(match);
      }
    },
  };
};

const formatTime = (match: BracketMatch, fmt: string) =>
  match.scheduled_at ? dayjs(match.scheduled_at).format(fmt) : "";

const withNote = (match: BracketMatch, node: React.ReactElement) =>
  match.note ? <Tooltip title={match.note}>{node}</Tooltip> : node;

// 参赛方没有校徽：红方/蓝方用 RM 的占位 R 标，未定或轮空用灰标
const avatarOf = (side: 1 | 2, info: SideInfo) => {
  if (!info.participant) return schoolGrey;
  return side === 1 ? schoolRed : schoolBlue;
};

// ==== 桌面端：经典 MatchGraph 节点 ====

// 经典节点尺寸（与 CSS 保持一致）
const CLASSIC_BLOCK = 68;
const BANNER_H = 34;

interface ClassicMatchProps extends SharedProps {
  match: BracketMatch;
  gold?: boolean;
  style?: React.CSSProperties;
}

const ClassicMatch = ({
  match,
  gold,
  style,
  participants,
  matchesBySeq,
  onMatchClick,
}: ClassicMatchProps) => {
  const clickable = isClickable(match, onMatchClick);
  const meta = [formatTime(match, "MM-DD HH:mm"), match.venue]
    .filter(Boolean)
    .join(" · ");

  const renderRow = (side: 1 | 2) => {
    const info = getSide(match, side, participants, matchesBySeq);
    // 与 RM 一致：有参赛方且不是败者时比分徽标为红/蓝方色
    const colorful = !!info.participant && !info.isLoser;
    return (
      <div
        className={[
          "bv-row",
          info.isLoser ? "is-loser" : "",
          info.participant ? "" : "is-placeholder",
        ].join(" ")}
      >
        <div
          className={[
            "bv-badge",
            info.byeWin ? "is-text" : "",
            colorful ? (side === 1 ? "is-red" : "is-blue") : "",
          ].join(" ")}
        >
          {info.scoreText}
        </div>
        <img className="bv-avatar" src={avatarOf(side, info)} alt="" />
        <span className="bv-name" title={info.label}>
          {info.label}
          {info.participant?.class_name && (
            <span className="bv-sub">{info.participant.class_name}</span>
          )}
        </span>
      </div>
    );
  };

  const node = (
    <div
      className={[
        "bv-match",
        gold ? "is-gold" : "",
        `status-${match.status}`,
        clickable ? "is-clickable" : "",
      ].join(" ")}
      style={style}
      title={meta || undefined}
      {...clickProps(match, onMatchClick)}
    >
      <div className="bv-order">
        <img src={orderBg} alt="" />
        <b>{String(match.seq).padStart(2, "0")}</b>
      </div>
      <div className="bv-rows">
        {renderRow(1)}
        {renderRow(2)}
      </div>
    </div>
  );
  return withNote(match, node);
};

// ==== 移动端：BracketMatchCard / BracketTeamRow ====

interface CardMatchProps extends SharedProps {
  match: BracketMatch;
  title: string;
  tag?: string;
  podium?: "champion" | "third";
  style?: React.CSSProperties;
}

const MATCH_STATUS_TEXT: Record<BracketMatch["status"], string> = {
  pending: "待定",
  scheduled: "未开始",
  completed: "已结束",
  bye: "轮空",
  void: "不进行",
};

const CardMatch = ({
  match,
  title,
  tag,
  podium,
  style,
  participants,
  matchesBySeq,
  onMatchClick,
}: CardMatchProps) => {
  const clickable = isClickable(match, onMatchClick);
  const finalized = match.status === "completed" || match.status === "bye";

  const renderRow = (side: 1 | 2) => {
    const info = getSide(match, side, participants, matchesBySeq);
    // 冠军赛：金/银；季军赛：铜（与 RM 一致，奖牌行不再区分红蓝）
    let medal = "";
    if (podium === "champion" && finalized) {
      if (info.isWinner) medal = "medal-gold";
      else if (info.isLoser) medal = "medal-silver";
    }
    if (podium === "third" && finalized && info.isWinner) {
      medal = "medal-bronze";
    }
    return (
      <div
        className={[
          "bv-team",
          podium ? "" : side === 1 ? "side-red" : "side-blue",
          !medal && finalized && info.isWinner ? "is-winner" : "",
          !medal && finalized && info.isLoser ? "is-loser" : "",
          info.participant ? "" : "is-pending",
          medal,
        ].join(" ")}
      >
        <img className="bv-team-logo" src={avatarOf(side, info)} alt="" />
        <span className="bv-team-name" title={info.label}>
          {info.label}
          {info.participant?.class_name && (
            <span className="bv-sub">{info.participant.class_name}</span>
          )}
        </span>
        <span
          className={["bv-team-score", info.byeWin ? "is-text" : ""].join(" ")}
        >
          {info.scoreText}
        </span>
      </div>
    );
  };

  const meta = [
    MATCH_STATUS_TEXT[match.status],
    `第${match.seq}场`,
    formatTime(match, "M/D HH:mm"),
    match.venue,
  ].filter(Boolean);

  const node = (
    <article
      className={[
        "bv-card",
        podium ? `podium-${podium}` : "",
        clickable ? "is-clickable" : "",
      ].join(" ")}
      style={style}
      {...clickProps(match, onMatchClick)}
    >
      <div className="bv-card-head">
        <span className="bv-card-title">{title}</span>
        {tag && (
          <span className={["bv-tag", podium ? "" : "is-progress"].join(" ")}>
            {tag}
          </span>
        )}
      </div>
      <div className="bv-slot-stack">
        {renderRow(1)}
        {renderRow(2)}
      </div>
      <div className="bv-card-meta">
        {meta.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </div>
    </article>
  );
  return withNote(match, node);
};

// ==== 淘汰赛树（两种外观共用的绝对定位布局） ====

interface TreeColumn {
  key: string;
  title: string;
  tone: Tone;
  matches: BracketMatch[];
  // 卡片头部右侧标签（十六强 / 八强 / 冠亚…）
  tag?: string;
  podium?: "champion" | "third";
}

const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const toChinese = (n: number): string => {
  if (n < 10) return CN_NUM[n];
  if (n < 20) return `十${CN_NUM[n % 10]}`;
  if (n < 100) return `${CN_NUM[Math.floor(n / 10)]}十${CN_NUM[n % 10]}`;
  return String(n);
};

const groupByRound = (matches: BracketMatch[]) => {
  const byRound = new Map<number, BracketMatch[]>();
  matches.forEach((m) => {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  });
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, list]) => ({
      round,
      matches: [...list].sort((a, b) => a.position - b.position),
    }));
};

const buildColumns = (
  matches: BracketMatch[],
  stage: BracketStage,
  // 双败淘汰：胜者组最后一轮不是真正的决赛（之后还有总决赛）
  hasGrandFinal = false,
): TreeColumn[] => {
  const rounds = groupByRound(matches.filter((m) => m.stage === stage));
  return rounds.map(({ round, matches: list }) => {
    const lastMain = stage === "main" && round === rounds.length;
    const isFinal = (lastMain && !hasGrandFinal) || stage === "grand_final";
    let title = getRoundTitle(stage, round, rounds.length);
    if (lastMain && hasGrandFinal) title = "胜者组决赛";
    if (stage === "grand_final") {
      title = round === 1 ? "总决赛" : `总决赛第 ${round} 场`;
    }
    let tag: string | undefined;
    if (isFinal) tag = "冠亚";
    else if (stage === "main") tag = `${toChinese(list.length * 2)}强`;
    else if (stage === "losers") tag = "败者组";
    let tone: Tone = "normal";
    if (isFinal) tone = "gold";
    else if (stage === "losers") tone = "loser";
    return {
      key: `${stage}-${round}`,
      title,
      tone,
      matches: list,
      tag,
      podium: isFinal ? "champion" : undefined,
    };
  });
};

interface TreeLayout {
  colWidth: number;
  gap: number;
  unit: number; // 每场比赛占用的纵向高度
  titleHeight: number; // 横幅高度 + 与比赛间距
  pad: number;
}

const LAYOUTS: Record<Variant, TreeLayout> = {
  classic: { colWidth: 272, gap: 52, unit: 78, titleHeight: 42, pad: 8 },
  card: { colWidth: 172, gap: 16, unit: 166, titleHeight: 0, pad: 4 },
};

interface PlacedMatch {
  match: BracketMatch;
  col: TreeColumn;
  x: number;
  y: number; // 比赛中心纵坐标
}

interface EliminationTreeProps extends SharedProps {
  columns: TreeColumn[];
  // 季军赛：放在最后一列决赛下方
  extra?: TreeColumn;
  variant: Variant;
}

const EliminationTree = ({
  columns,
  extra,
  variant,
  ...shared
}: EliminationTreeProps) => {
  const L = LAYOUTS[variant];

  const layout = useMemo(() => {
    const top = L.pad + L.titleHeight;
    const maxCount = Math.max(1, ...columns.map((c) => c.matches.length));
    const treeHeight = maxCount * L.unit;
    const placed: PlacedMatch[] = [];
    const titles: Array<{ col: TreeColumn; x: number; y: number }> = [];
    columns.forEach((col, ci) => {
      const slot = treeHeight / Math.max(1, col.matches.length);
      const x = L.pad + ci * (L.colWidth + L.gap);
      let firstY: number | null = null;
      col.matches.forEach((m, mi) => {
        const y = top + slot * (mi + 0.5);
        // 首轮作废的比赛（人数不足 2 的幂时产生）不显示
        if (m.status === "void") return;
        if (firstY == null) firstY = y;
        placed.push({ match: m, col, x, y });
      });
      if (firstY != null) titles.push({ col, x, y: firstY });
    });
    let height = top + treeHeight + L.pad;
    if (extra && extra.matches.length > 0 && columns.length > 0) {
      const lastCol = columns[columns.length - 1];
      const x = L.pad + (columns.length - 1) * (L.colWidth + L.gap);
      const lastY = Math.max(
        top + treeHeight / 2,
        ...placed.filter((p) => p.col === lastCol).map((p) => p.y),
      );
      const base = lastY + L.unit + L.titleHeight;
      extra.matches.forEach((m, i) => {
        const y = base + i * L.unit;
        if (i === 0) titles.push({ col: extra, x, y });
        placed.push({ match: m, col: extra, x, y });
      });
      height = Math.max(
        height,
        base + (extra.matches.length - 0.5) * L.unit + L.pad,
      );
    }
    // 连接线：从来源比赛右侧引出，在列间距中点折向本场比赛左侧
    const bySeq = new Map(placed.map((p) => [p.match.seq, p]));
    const paths: string[] = [];
    placed.forEach((p) => {
      const refs: number[] = [];
      const { slot1_source, slot2_source } = p.match;
      if (slot1_source === "winner" || slot1_source === "loser") {
        refs.push(p.match.slot1_ref);
      }
      if (slot2_source === "winner" || slot2_source === "loser") {
        refs.push(p.match.slot2_ref);
      }
      refs.forEach((ref) => {
        const from = bySeq.get(ref);
        if (!from || from.x >= p.x) return;
        const x1 = from.x + L.colWidth;
        const mid = p.x - L.gap / 2;
        const end = p.x - (variant === "classic" ? 3 : 0);
        paths.push(`M${x1} ${from.y}H${mid}V${p.y}H${end}`);
      });
    });
    const width =
      L.pad * 2 + columns.length * L.colWidth + (columns.length - 1) * L.gap;
    return { placed, titles, paths, width, height };
  }, [columns, extra, L, variant]);

  if (columns.length === 0) return null;

  return (
    <div className={`bv-tree-scroll is-${variant}`}>
      <div
        className="bv-tree"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="bv-lines"
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
        >
          {variant === "classic" && (
            <defs>
              <marker
                id="bv-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M1 1L7 4L1 7" className="bv-arrow" />
              </marker>
            </defs>
          )}
          {layout.paths.map((d) => (
            <path
              key={d}
              d={d}
              markerEnd={variant === "classic" ? "url(#bv-arrow)" : undefined}
            />
          ))}
        </svg>
        {variant === "classic" &&
          layout.titles.map(({ col, x, y }) => (
            <div
              key={`t-${col.key}`}
              className={`bv-banner tone-${col.tone}`}
              style={{
                position: "absolute",
                left: x,
                top: y - CLASSIC_BLOCK / 2 - 6 - BANNER_H,
                width: L.colWidth,
              }}
            >
              <b>{col.title}</b>
            </div>
          ))}
        {layout.placed.map(({ match, col, x, y }) => {
          const style: React.CSSProperties = {
            position: "absolute",
            left: x,
            top: y,
            width: L.colWidth,
            transform: "translateY(-50%)",
          };
          return variant === "classic" ? (
            <ClassicMatch
              key={match.id || match.seq}
              match={match}
              gold={col.tone === "gold" || col.podium === "third"}
              style={style}
              {...shared}
            />
          ) : (
            <CardMatch
              key={match.id || match.seq}
              match={match}
              title={col.title}
              tag={col.tag}
              podium={col.podium}
              style={style}
              {...shared}
            />
          );
        })}
      </div>
    </div>
  );
};

// ==== 小组赛：积分榜 + 各轮对阵 ====

interface GroupPanelProps extends SharedProps {
  groupIndex: number;
  rows: BracketStandingRow[];
  matches: BracketMatch[];
  advance: number;
  variant: Variant;
}

const GroupPanel = ({
  groupIndex,
  rows,
  matches,
  advance,
  variant,
  ...shared
}: GroupPanelProps) => {
  const { participants } = shared;
  const rounds = groupByRound(matches);
  const groupName = getGroupName(groupIndex).replace(" ", "");

  return (
    <div className="bv-group">
      <div className="bv-panel">
        <div className="bv-panel-head">
          <span className="bv-panel-title">{groupName}积分榜</span>
          {advance > 0 && (
            <span className="bv-tag is-progress">前 {advance} 名出线</span>
          )}
        </div>
        <div className="bv-standings-scroll">
          <div
            className="bv-standings"
            role="table"
            aria-label={`${groupName}积分榜`}
          >
            <div className="bv-standing is-head" role="row">
              <span role="columnheader">名次</span>
              <span role="columnheader">参赛方</span>
              <span role="columnheader">场</span>
              <span role="columnheader">胜</span>
              <span role="columnheader">平</span>
              <span role="columnheader">负</span>
              <span role="columnheader">净胜分</span>
              <span role="columnheader">积分</span>
            </div>
            {rows.map((row) => {
              const p = participants.get(row.participant_id);
              const promoted = row.rank <= advance;
              return (
                <div
                  key={row.participant_id}
                  className={[
                    "bv-standing",
                    promoted ? "is-promoted" : "",
                  ].join(" ")}
                  role="row"
                >
                  <span role="cell">
                    <span className="bv-rank">{row.rank}</span>
                  </span>
                  <span role="cell" className="bv-standing-name">
                    <img
                      className="bv-team-logo"
                      src={promoted ? schoolRed : schoolGrey}
                      alt=""
                    />
                    <span className="bv-team-name" title={p?.name}>
                      {p?.name ?? "-"}
                      {p?.class_name && (
                        <span className="bv-sub">{p.class_name}</span>
                      )}
                    </span>
                  </span>
                  <span role="cell">{row.played}</span>
                  <span role="cell">{row.won}</span>
                  <span role="cell">{row.drawn}</span>
                  <span role="cell">{row.lost}</span>
                  <span role="cell">
                    {row.score_diff > 0 ? `+${row.score_diff}` : row.score_diff}
                  </span>
                  <span role="cell" className="bv-points">
                    {row.points}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {advance > 0 && (
          <div className="bv-panel-note">
            前 {advance} 名出线（积分 &gt; 净胜分 &gt; 总得分 &gt; 种子）
          </div>
        )}
      </div>

      <div className={`bv-group-rounds is-${variant}`}>
        {rounds.map(({ round, matches: list }) => (
          <div key={round} className="bv-group-round">
            {variant === "classic" && (
              <div className="bv-banner tone-normal">
                <b>第 {round} 轮</b>
              </div>
            )}
            <div className="bv-group-round-list">
              {list.map((m) =>
                variant === "classic" ? (
                  <ClassicMatch key={m.id || m.seq} match={m} {...shared} />
                ) : (
                  <CardMatch
                    key={m.id || m.seq}
                    match={m}
                    title={`${groupName} 第 ${round} 轮`}
                    {...shared}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ViewTab {
  key: string;
  label: string;
  // 该页签内是否还有未完成的比赛，用于默认选中
  live: boolean;
  render: () => React.ReactNode;
}

const hasOpen = (list: BracketMatch[]) =>
  list.some((m) => m.status === "scheduled" || m.status === "pending");

const BracketView: React.FC<BracketViewProps> = ({ detail, onMatchClick }) => {
  const isDesktop = useIsDesktop();
  const variant: Variant = isDesktop ? "classic" : "card";
  const participants = useMemo(
    () => new Map(detail.participants.map((p) => [p.id, p])),
    [detail.participants],
  );
  const matchesBySeq = useMemo(
    () => new Map(detail.matches.map((m) => [m.seq, m])),
    [detail.matches],
  );
  // 用户选中的赛段页签（按对阵图 id 区分，切换对阵图后回到默认页签）
  const [picked, setPicked] = useState<{ id: number; key: string } | null>(
    null,
  );

  const { bracket, matches, standings } = detail;
  const { format } = bracket;

  const columnsByStage = useMemo(
    () => ({
      main: buildColumns(
        matches,
        "main",
        matches.some((m) => m.stage === "grand_final"),
      ),
      losers: buildColumns(matches, "losers"),
      grand_final: buildColumns(matches, "grand_final"),
    }),
    [matches],
  );
  const thirdPlace = useMemo<TreeColumn | undefined>(() => {
    const list = matches.filter((m) => m.stage === "third_place");
    if (list.length === 0) return undefined;
    return {
      key: "third_place",
      title: "季军赛",
      tone: "loser",
      matches: list,
      tag: "季殿",
      podium: "third",
    };
  }, [matches]);

  if (matches.length === 0) {
    return <Empty description="对阵尚未生成" />;
  }

  const shared: SharedProps = { participants, matchesBySeq, onMatchClick };
  const advance = format === "group_knockout" ? bracket.advance_per_group : 0;

  // 赛段页签：对应 RM 的分组选择器（A组 / B组 / 淘汰赛…）
  const tabs: ViewTab[] = [];
  if (format === "round_robin" || format === "group_knockout") {
    standings.forEach((standing) => {
      const groupMatches = matches.filter(
        (m) => m.stage === "group" && m.group_index === standing.group_index,
      );
      tabs.push({
        key: `group-${standing.group_index}`,
        label: getGroupName(standing.group_index).replace(" ", ""),
        live: hasOpen(groupMatches),
        render: () => (
          <GroupPanel
            groupIndex={standing.group_index}
            rows={standing.rows}
            matches={groupMatches}
            advance={advance}
            variant={variant}
            {...shared}
          />
        ),
      });
    });
  }
  if (format === "single_elimination" || format === "group_knockout") {
    tabs.push({
      key: "main",
      label: "淘汰赛",
      live: hasOpen(matches.filter((m) => m.stage !== "group")),
      render: () => (
        <EliminationTree
          columns={columnsByStage.main}
          extra={thirdPlace}
          variant={variant}
          {...shared}
        />
      ),
    });
  }
  if (format === "double_elimination") {
    // 总决赛接在胜者组决赛之后，连线可直接引到总决赛
    tabs.push(
      {
        key: "main",
        label: "胜者组",
        live: hasOpen(
          matches.filter(
            (m) => m.stage === "main" || m.stage === "grand_final",
          ),
        ),
        render: () => (
          <EliminationTree
            columns={[...columnsByStage.main, ...columnsByStage.grand_final]}
            extra={thirdPlace}
            variant={variant}
            {...shared}
          />
        ),
      },
      {
        key: "losers",
        label: "败者组",
        live: hasOpen(matches.filter((m) => m.stage === "losers")),
        render: () => (
          <EliminationTree
            columns={columnsByStage.losers}
            variant={variant}
            {...shared}
          />
        ),
      },
    );
  }

  if (tabs.length === 0) {
    return <Empty description="对阵尚未生成" />;
  }

  const fallback = (tabs.find((t) => t.live) ?? tabs[tabs.length - 1]).key;
  const activeKey =
    picked && picked.id === bracket.id && tabs.some((t) => t.key === picked.key)
      ? picked.key
      : fallback;
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  const championId = getBracketChampion(detail);
  const champion =
    championId != null ? participants.get(championId) : undefined;

  return (
    <div className={`bracket-view is-${variant}`}>
      {champion && (
        <div className="bv-champion">
          <img src={championImg} alt="" />
          <div className="bv-champion-text">
            <span className="bv-champion-label">冠军</span>
            <b>{champion.name}</b>
            {champion.class_name && (
              <span className="bv-sub">{champion.class_name}</span>
            )}
          </div>
        </div>
      )}

      {tabs.length > 1 && (
        <div className="bv-selector">
          <div className="bv-selector-track" role="tablist" aria-label="赛段">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === active.key}
                className={[
                  "bv-selector-item",
                  t.key === active.key ? "is-active" : "",
                ].join(" ")}
                onClick={() => setPicked({ id: bracket.id, key: t.key })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bv-stage" role={tabs.length > 1 ? "tabpanel" : undefined}>
        {active.render()}
      </div>
    </div>
  );
};

export default BracketView;
