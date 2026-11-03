import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import MatchMenu, { MatchMenuAnchor, MatchMenuItem } from "./bracket/MatchMenu";
import SelectableRow from "./bracket/SelectableRow";
import PanZoomCanvas from "./bracket/PanZoomCanvas";
import ScheduleList from "./bracket/ScheduleList";
import ScheduleViews from "./schedule/ScheduleViews";
import { bracketEntries } from "./schedule/scheduleEntries";
import {
  DEFAULT_MATCH_MINUTES,
  isSchedulable as isSchedulableMatch,
} from "../utils/bracketSchedule";
import RoundPicker, { RoundStage } from "./bracket/RoundPicker";
import {
  MatchAnalysisSheet,
  TeamAnalysisSheet,
} from "./bracket/AnalysisSheets";
import {
  getMatchRoundLabel,
  getMatchStatusText,
  hasBothSides,
  isInMatch,
} from "./bracket/analysis";
import "./BracketView.css";

interface BracketViewProps {
  detail: BracketDetail;
  // 录入结果（管理端）：出现在比赛菜单中；不传则只读
  onMatchClick?: (match: BracketMatch) => void;
  // 选中的参赛方（可选受控）：不传时组件内部管理
  selectedParticipantId?: number | null;
  onSelectParticipant?: (id: number | null) => void;
}

// ≥ 992px 使用 RM Schedule 桌面端经典对阵图（MatchGraph），否则使用移动端卡片对阵图（BracketPage）
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

// 当前全屏的是否为该元素（Fullscreen API）
const useFullscreen = (ref: React.RefObject<HTMLElement | null>) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onChange = () =>
      setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void ref.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, [ref]);
  const supported =
    typeof document !== "undefined" && !!document.fullscreenEnabled;
  return { active, toggle, supported };
};

// 元素内容宽度（ResizeObserver）；用回调 ref 以便元素挂载 / 卸载时重新监听
const useElementWidth = () => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width };
};

type Variant = "classic" | "card";
// 标题横幅：普通（青）/ 冠军（金）/ 季军、败者组（灰橙）
type Tone = "normal" | "gold" | "loser";

interface SharedProps {
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  // 选中的参赛方（RM selectedPlayer）及当前打开菜单的比赛
  selectedId: number | null;
  menuSeq: number | null;
  toggleSelect: (id: number) => void;
  // 长按：只选中不取消
  select: (id: number) => void;
  // toggle 为 true 时，菜单已在该比赛打开则关闭
  openMenu: (
    match: BracketMatch,
    anchor: MatchMenuAnchor,
    toggle?: boolean,
  ) => void;
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

const selectLabel = (p: BracketParticipant, selected: boolean) =>
  `${p.name}${p.class_name && p.class_name !== p.name ? ` ${p.class_name}` : ""}${selected ? "，已选中" : "，点击选中"}`;

// 比赛节点本身被点击（不在参赛方行上）：打开 / 关闭比赛菜单
const matchBodyClick =
  (match: BracketMatch, shared: SharedProps) =>
  (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const trigger = el.querySelector<HTMLElement>(".bv-menu-trigger");
    shared.openMenu(match, { element: el, returnFocus: trigger }, true);
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

const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const toChinese = (n: number): string => {
  if (n < 10) return CN_NUM[n];
  if (n < 20) return `十${CN_NUM[n % 10]}`;
  if (n < 100) return `${CN_NUM[Math.floor(n / 10)]}十${CN_NUM[n % 10]}`;
  return String(n);
};

// 移动端紧凑标题（RM 风格）：“第 1 轮” → “第一轮”，“败者组第 2 轮” → “败者组第二轮”
const compactTitle = (title: string) =>
  title.replace(
    /第 (\d+) 轮/g,
    (_, n: string) => `第${toChinese(Number(n))}轮`,
  );

// ==== 桌面端：经典 MatchGraph 节点 ====

// 经典节点尺寸（与 CSS 保持一致）
const CLASSIC_BLOCK = 68;
const BANNER_H = 34;

interface ClassicMatchProps extends SharedProps {
  match: BracketMatch;
  gold?: boolean;
  style?: React.CSSProperties;
}

const ClassicMatch = ({ match, gold, style, ...shared }: ClassicMatchProps) => {
  const { participants, matchesBySeq, selectedId, menuSeq } = shared;
  const menuOpen = menuSeq === match.seq;
  const meta = [formatTime(match, "MM-DD HH:mm"), match.venue]
    .filter(Boolean)
    .join(" · ");

  const renderRow = (side: 1 | 2) => {
    const info = getSide(match, side, participants, matchesBySeq);
    const p = info.participant;
    const selected = !!p && p.id === selectedId;
    // 与 RM 一致：有参赛方且不是败者时比分徽标为红/蓝方色
    const colorful = !!p && !info.isLoser;
    const className = [
      "bv-row",
      info.isLoser ? "is-loser" : "",
      p ? "" : "is-placeholder",
    ].join(" ");
    const content = (
      <>
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
          {p?.class_name && <span className="bv-sub">{p.class_name}</span>}
        </span>
      </>
    );
    if (!p) return <div className={className}>{content}</div>;
    // RM MatchGraph selectPlayerMatch：点击队伍 = 切换选中 + 打开比赛菜单
    return (
      <SelectableRow
        className={className}
        label={selectLabel(p, selected)}
        selected={selected}
        longPress={false}
        opensMenu
        menuOpen={menuOpen}
        onActivate={(el) => {
          shared.toggleSelect(p.id);
          const node = el.closest<HTMLElement>(".bv-match") ?? el;
          shared.openMenu(match, { element: node, returnFocus: el });
        }}
      >
        {content}
      </SelectableRow>
    );
  };

  const node = (
    <div
      className={[
        "bv-match",
        gold ? "is-gold" : "",
        `status-${match.status}`,
        menuOpen ? "is-menu-open" : "",
      ].join(" ")}
      style={style}
      title={meta || undefined}
      onClick={matchBodyClick(match, shared)}
    >
      <button
        type="button"
        className="bv-order bv-menu-trigger"
        aria-label={`第 ${match.seq} 场比赛菜单`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <img src={orderBg} alt="" />
        <b>{String(match.seq).padStart(2, "0")}</b>
      </button>
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
  ...shared
}: CardMatchProps) => {
  const { participants, matchesBySeq, selectedId, menuSeq } = shared;
  const menuOpen = menuSeq === match.seq;
  const finalized = match.status === "completed" || match.status === "bye";

  const renderRow = (side: 1 | 2) => {
    const info = getSide(match, side, participants, matchesBySeq);
    const p = info.participant;
    const selected = !!p && p.id === selectedId;
    // 冠军赛：金/银；季军赛：铜（与 RM 一致，奖牌行不再区分红蓝）
    let medal = "";
    if (podium === "champion" && finalized) {
      if (info.isWinner) medal = "medal-gold";
      else if (info.isLoser) medal = "medal-silver";
    }
    if (podium === "third" && finalized && info.isWinner) {
      medal = "medal-bronze";
    }
    const className = [
      "bv-team",
      podium ? "" : side === 1 ? "side-red" : "side-blue",
      !medal && finalized && info.isWinner ? "is-winner" : "",
      !medal && finalized && info.isLoser ? "is-loser" : "",
      p ? "" : "is-pending",
      medal,
    ].join(" ");
    const content = (
      <>
        <span className="bv-selection" aria-hidden="true" />
        <img className="bv-team-logo" src={avatarOf(side, info)} alt="" />
        <span className="bv-team-name" title={info.label}>
          {info.label}
          {p?.class_name && <span className="bv-sub">{p.class_name}</span>}
        </span>
        <span
          className={["bv-team-score", info.byeWin ? "is-text" : ""].join(" ")}
        >
          {info.scoreText}
        </span>
      </>
    );
    if (!p) return <div className={className}>{content}</div>;
    // RM BracketTeamRow：轻点切换选中；长按选中并在按压点打开比赛菜单
    return (
      <SelectableRow
        className={className}
        label={selectLabel(p, selected)}
        selected={selected}
        longPress
        onActivate={() => shared.toggleSelect(p.id)}
        onLongPress={(el, point) => {
          shared.select(p.id);
          const card = el.closest<HTMLElement>(".bv-card") ?? el;
          shared.openMenu(match, { element: card, point, returnFocus: el });
        }}
      >
        {content}
      </SelectableRow>
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
        menuOpen ? "is-menu-open" : "",
      ].join(" ")}
      style={style}
      onClick={matchBodyClick(match, shared)}
    >
      <div className="bv-card-head">
        <button
          type="button"
          className="bv-card-title bv-menu-trigger"
          aria-label={`${title} 第 ${match.seq} 场比赛菜单`}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          {title}
        </button>
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
      <div className="bv-card-meta" title={meta.join(" ")}>
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

const CLASSIC_LAYOUT: TreeLayout = {
  colWidth: 272,
  gap: 52,
  unit: 78,
  titleHeight: 42,
  pad: 8,
};

// 移动端卡片：列宽按容器宽度与可见列数计算（RM BracketBoard visibleSpan）
const CARD_UNIT = 154;
const CARD_GAP = 10;

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
  // 移动端：只显示 [start, start + span) 列，并按 width 均分
  range?: { start: number; span: number; width: number };
}

const EliminationTree = ({
  columns: allColumns,
  extra,
  variant,
  range,
  ...shared
}: EliminationTreeProps) => {
  const layout = useMemo(() => {
    const columns = range
      ? allColumns.slice(range.start, range.start + range.span)
      : allColumns;
    const showExtra =
      !!extra &&
      extra.matches.length > 0 &&
      columns.length > 0 &&
      columns[columns.length - 1] === allColumns[allColumns.length - 1];
    let L = CLASSIC_LAYOUT;
    if (variant === "card") {
      const span = Math.max(1, range?.span ?? columns.length);
      const width = range?.width ?? span * 172;
      L = {
        colWidth: Math.max(120, (width - CARD_GAP * (span - 1)) / span),
        gap: CARD_GAP,
        unit: CARD_UNIT,
        titleHeight: 0,
        pad: 0,
      };
    }
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
    if (extra && showExtra) {
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
    return { L, columns, placed, titles, paths, width, height };
  }, [allColumns, extra, variant, range]);

  if (layout.columns.length === 0) return null;
  const { L } = layout;

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
              title={compactTitle(col.title)}
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

// ==== 小组赛 ====

interface StandingsProps extends SharedProps {
  groupName: string;
  rows: BracketStandingRow[];
  advance: number;
}

// 桌面端：积分榜毛玻璃面板
const StandingsPanel = ({
  groupName,
  rows,
  advance,
  ...shared
}: StandingsProps) => {
  const { participants, selectedId } = shared;
  return (
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
            const selected = !!p && p.id === selectedId;
            const name = (
              <>
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
              </>
            );
            return (
              <div
                key={row.participant_id}
                className={[
                  "bv-standing",
                  promoted ? "is-promoted" : "",
                  p ? "is-selectable" : "",
                  selected ? "is-selected" : "",
                ].join(" ")}
                role="row"
                // 整行可点击切换选中；键盘焦点在参赛方名称上
                onClick={p ? () => shared.toggleSelect(p.id) : undefined}
              >
                <span role="cell">
                  <span className="bv-rank">{row.rank}</span>
                </span>
                <span role="cell" className="bv-standing-cell">
                  {p ? (
                    <SelectableRow
                      className="bv-standing-name"
                      label={selectLabel(p, selected)}
                      selected={selected}
                      longPress={false}
                      onActivate={() => shared.toggleSelect(p.id)}
                    >
                      {name}
                    </SelectableRow>
                  ) : (
                    <span className="bv-standing-name">{name}</span>
                  )}
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
  );
};

// 移动端“晋级 / 排名”列：RM 结果列的紧凑积分卡
const ResultCard = ({
  groupName,
  rows,
  advance,
  ...shared
}: StandingsProps) => {
  const { participants, selectedId } = shared;
  return (
    <article className="bv-card bv-result-card">
      <div className="bv-card-head">
        <span className="bv-card-title is-static">
          {groupName}
          {advance > 0 ? "晋级" : "排名"}
        </span>
        {advance > 0 && (
          <span className="bv-tag is-progress">前 {advance} 名</span>
        )}
      </div>
      <div className="bv-slot-stack">
        {rows.map((row) => {
          const p = participants.get(row.participant_id);
          const promoted = row.rank <= advance;
          const selected = !!p && p.id === selectedId;
          const className = [
            "bv-team",
            "bv-result-row",
            promoted ? "is-promoted" : "",
            p ? "" : "is-pending",
          ].join(" ");
          const content = (
            <>
              <span className="bv-selection" aria-hidden="true" />
              <span className="bv-result-rank">{row.rank}</span>
              <img
                className="bv-team-logo"
                src={promoted ? schoolRed : schoolGrey}
                alt=""
              />
              <span className="bv-team-name" title={p?.name}>
                {p?.name ?? "-"}
              </span>
              <span className="bv-team-score">{row.points}</span>
            </>
          );
          if (!p) {
            return (
              <div key={row.participant_id} className={className}>
                {content}
              </div>
            );
          }
          return (
            <SelectableRow
              key={row.participant_id}
              className={className}
              label={`第 ${row.rank} 名 ${row.points} 分，${selectLabel(p, selected)}`}
              selected={selected}
              longPress={false}
              onActivate={() => shared.toggleSelect(p.id)}
            >
              {content}
            </SelectableRow>
          );
        })}
      </div>
      <div className="bv-card-meta">
        <span>积分 &gt; 净胜分 &gt; 总得分 &gt; 种子</span>
      </div>
    </article>
  );
};

interface GroupProps extends SharedProps {
  groupIndex: number;
  rows: BracketStandingRow[];
  matches: BracketMatch[];
  advance: number;
}

// 桌面端：各轮对阵（MatchGraph 列）+ 积分榜
const GroupClassic = ({
  groupIndex,
  rows,
  matches,
  advance,
  ...shared
}: GroupProps) => {
  const rounds = groupByRound(matches);
  const groupName = getGroupName(groupIndex).replace(" ", "");
  return (
    <div className="bv-group-classic">
      {rounds.map(({ round, matches: list }) => (
        <div key={round} className="bv-group-round">
          <div className="bv-banner tone-normal">
            <b>
              {groupName} 第 {round} 轮
            </b>
          </div>
          <div className="bv-group-round-list">
            {list.map((m) => (
              <ClassicMatch key={m.id || m.seq} match={m} {...shared} />
            ))}
          </div>
        </div>
      ))}
      <div className="bv-group-standings">
        <div className="bv-banner tone-gold">
          <b>{advance > 0 ? "晋级" : "排名"}</b>
        </div>
        <StandingsPanel
          groupName={groupName}
          rows={rows}
          advance={advance}
          {...shared}
        />
      </div>
    </div>
  );
};

// 移动端：可见窗口内的轮次列（卡片纵向排列）+ 晋级列
const GroupCards = ({
  groupIndex,
  rows,
  matches,
  advance,
  range,
  ...shared
}: GroupProps & { range: { start: number; span: number } }) => {
  const rounds = groupByRound(matches);
  const groupName = getGroupName(groupIndex).replace(" ", "");
  const columns: React.ReactNode[] = [
    ...rounds.map(({ round, matches: list }) => (
      <div key={round} className="bv-card-col">
        {list.map((m) => (
          <CardMatch
            key={m.id || m.seq}
            match={m}
            title={`${groupName}第${toChinese(round)}轮`}
            {...shared}
          />
        ))}
      </div>
    )),
    <div key="result" className="bv-card-col">
      <ResultCard
        groupName={groupName}
        rows={rows}
        advance={advance}
        {...shared}
      />
    </div>,
  ];
  const visible = columns.slice(range.start, range.start + range.span);
  return (
    <div
      className="bv-card-cols"
      style={{ "--cols": visible.length } as React.CSSProperties}
    >
      {visible}
    </div>
  );
};

// ==== 赛段页签 ====

interface ViewTab {
  key: string;
  label: string;
  // 该页签内是否还有未完成的比赛，用于默认选中
  live: boolean;
  // 移动端轮次选择器的各轮
  stages: RoundStage[];
  // 列表类页签（赛程）：不放入可缩放画布，也不参与默认页签选择
  plain?: boolean;
  renderDesktop: () => React.ReactNode;
  renderMobile: (range: {
    start: number;
    span: number;
    width: number;
  }) => React.ReactNode;
}

const hasOpen = (list: BracketMatch[]) =>
  list.some((m) => m.status === "scheduled" || m.status === "pending");

// 淘汰赛列 → 轮次选择器：横条数为本轮实际比赛数，冠军赛为奖杯
const treeStages = (columns: TreeColumn[]): RoundStage[] =>
  columns.map((col) => ({
    label: compactTitle(col.title).replace(/ /g, ""),
    icon:
      col.podium === "champion"
        ? "trophy"
        : Math.max(1, col.matches.filter((m) => m.status !== "void").length),
  }));

// 移动端同时显示的轮数（RM 默认 2 列）
const MOBILE_SPAN = 2;
// 横向滑动切换轮次的最小距离
const SWIPE_MIN = 56;

interface MenuState {
  bracketId: number;
  seq: number;
  anchor: MatchMenuAnchor;
}

interface SheetState {
  kind: "team" | "match";
  bracketId: number;
  // 分析队伍：参赛方 ID；分析比赛：场次号
  id: number;
  open: boolean;
}

const BracketView: React.FC<BracketViewProps> = ({
  detail,
  onMatchClick,
  selectedParticipantId,
  onSelectParticipant,
}) => {
  const isDesktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(rootRef);
  const board = useElementWidth();
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
  // 移动端各页签的轮次窗口起点（键：对阵图 id + 页签）
  const [windows, setWindows] = useState<Record<string, number>>({});

  const { bracket, matches, standings } = detail;
  const { format } = bracket;

  // ==== 选中参赛方（RM selectedPlayer）：受控或内部管理，切换对阵图后清空 ====
  const [ownSelected, setOwnSelected] = useState<{
    bracketId: number;
    id: number | null;
  } | null>(null);
  const controlled = selectedParticipantId !== undefined;
  const rawSelected = controlled
    ? selectedParticipantId
    : ownSelected?.bracketId === bracket.id
      ? ownSelected.id
      : null;
  const selectedId =
    rawSelected != null && participants.has(rawSelected) ? rawSelected : null;
  const setSelected = useCallback(
    (id: number | null) => {
      if (!controlled) setOwnSelected({ bracketId: bracket.id, id });
      onSelectParticipant?.(id);
    },
    [controlled, bracket.id, onSelectParticipant],
  );
  const toggleSelect = useCallback(
    (id: number) => setSelected(selectedId === id ? null : id),
    [selectedId, setSelected],
  );

  // ==== 比赛菜单（MatchMenu）与分析弹层（AnalyzeTeam / AnalyzeMatch） ====
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const menu = menuState?.bracketId === bracket.id ? menuState : null;
  const menuMatch = menu ? matchesBySeq.get(menu.seq) : undefined;

  const openMenu = useCallback(
    (match: BracketMatch, anchor: MatchMenuAnchor, toggle = false) => {
      setMenuState((prev) => {
        if (prev && prev.bracketId === bracket.id && prev.seq === match.seq) {
          if (toggle) return null;
          // 同一比赛内重新点击队伍：保留锚点，菜单不跳动
          if (!anchor.point && prev.anchor.element === anchor.element) {
            return {
              ...prev,
              anchor: { ...prev.anchor, returnFocus: anchor.returnFocus },
            };
          }
        }
        return { bracketId: bracket.id, seq: match.seq, anchor };
      });
    },
    [bracket.id],
  );

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      const target = menu?.anchor.returnFocus;
      setMenuState(null);
      if (restoreFocus && target?.isConnected) target.focus();
    },
    [menu],
  );
  const dismissMenu = useCallback(() => setMenuState(null), []);

  const openSheet = (kind: SheetState["kind"], id: number) => {
    // 先把焦点还给队伍行，弹层关闭后焦点回到这里
    const target = menu?.anchor.returnFocus;
    if (target?.isConnected) target.focus({ preventScroll: true });
    setMenuState(null);
    setSheet({ kind, bracketId: bracket.id, id, open: true });
  };
  const closeSheet = () =>
    setSheet((prev) => (prev ? { ...prev, open: false } : prev));
  const activeSheet = sheet?.bracketId === bracket.id ? sheet : null;

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

  // 移动端横向滑动：切换轮次窗口（只响应触控 / 触控笔）
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);

  if (matches.length === 0) {
    return <Empty description="对阵尚未生成" />;
  }

  const shared: SharedProps = {
    participants,
    matchesBySeq,
    selectedId,
    menuSeq: menu?.seq ?? null,
    toggleSelect,
    select: setSelected,
    openMenu,
  };
  const advance = format === "group_knockout" ? bracket.advance_per_group : 0;

  const treeTab = (
    key: string,
    label: string,
    columns: TreeColumn[],
    live: boolean,
    extra?: TreeColumn,
  ): ViewTab => ({
    key,
    label,
    live,
    stages: treeStages(columns),
    renderDesktop: () => (
      <EliminationTree
        columns={columns}
        extra={extra}
        variant="classic"
        {...shared}
      />
    ),
    renderMobile: (range) => (
      <EliminationTree
        columns={columns}
        extra={extra}
        variant="card"
        range={range}
        {...shared}
      />
    ),
  });

  // 赛段页签：对应 RM 的分组选择器（A组 / B组 / 淘汰赛…）
  const tabs: ViewTab[] = [];
  if (format === "round_robin" || format === "group_knockout") {
    standings.forEach((standing) => {
      const groupMatches = matches.filter(
        (m) => m.stage === "group" && m.group_index === standing.group_index,
      );
      const rounds = groupByRound(groupMatches);
      const props: GroupProps = {
        groupIndex: standing.group_index,
        rows: standing.rows,
        matches: groupMatches,
        advance,
        ...shared,
      };
      tabs.push({
        key: `group-${standing.group_index}`,
        label: getGroupName(standing.group_index).replace(" ", ""),
        live: hasOpen(groupMatches),
        stages: [
          ...rounds.map(({ round, matches: list }) => ({
            label: `第${toChinese(round)}轮`,
            icon: Math.max(1, list.length),
          })),
          { label: advance > 0 ? "晋级" : "排名", icon: "result" as const },
        ],
        renderDesktop: () => <GroupClassic {...props} />,
        renderMobile: (range) => <GroupCards {...props} range={range} />,
      });
    });
  }
  if (format === "single_elimination" || format === "group_knockout") {
    tabs.push(
      treeTab(
        "main",
        "淘汰赛",
        columnsByStage.main,
        hasOpen(matches.filter((m) => m.stage !== "group")),
        thirdPlace,
      ),
    );
  }
  if (format === "double_elimination") {
    // 总决赛接在胜者组决赛之后，连线可直接引到总决赛
    tabs.push(
      treeTab(
        "main",
        "胜者组",
        [...columnsByStage.main, ...columnsByStage.grand_final],
        hasOpen(
          matches.filter(
            (m) => m.stage === "main" || m.stage === "grand_final",
          ),
        ),
        thirdPlace,
      ),
      treeTab(
        "losers",
        "败者组",
        columnsByStage.losers,
        hasOpen(matches.filter((m) => m.stage === "losers")),
      ),
    );
  }

  if (tabs.length === 0) {
    return <Empty description="对阵尚未生成" />;
  }

  // 赛程页签：有比赛排了时间才显示
  if (matches.some((m) => m.scheduled_at)) {
    const onOpenMenu = (match: BracketMatch, element: HTMLElement) =>
      openMenu(match, { element, returnFocus: element }, true);
    const renderSchedule = () => (
      <ScheduleViews
        tone="public"
        summary
        entries={bracketEntries({
          matches,
          participants,
          matchesBySeq,
          minutes:
            bracket.schedule_config?.match_minutes ?? DEFAULT_MATCH_MINUTES,
          groupName: bracket.name,
          selectedId,
          activeSeq: menu?.seq ?? null,
          onPick: onOpenMenu,
        })}
        unscheduled={
          matches.filter((m) => !m.scheduled_at && isSchedulableMatch(m)).length
        }
        renderList={() => (
          <ScheduleList
            matches={matches}
            participants={participants}
            matchesBySeq={matchesBySeq}
            selectedId={selectedId}
            menuSeq={menu?.seq ?? null}
            onOpenMenu={onOpenMenu}
          />
        )}
      />
    );
    tabs.push({
      key: "schedule",
      label: "赛程",
      live: false,
      plain: true,
      stages: [],
      renderDesktop: renderSchedule,
      renderMobile: renderSchedule,
    });
  }

  const boardTabs = tabs.filter((t) => !t.plain);
  const fallback = (
    boardTabs.find((t) => t.live) ?? boardTabs[boardTabs.length - 1]
  ).key;
  const activeKey =
    picked && picked.id === bracket.id && tabs.some((t) => t.key === picked.key)
      ? picked.key
      : fallback;
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // 移动端轮次窗口
  const windowKey = `${bracket.id}:${active.key}`;
  const span = Math.min(MOBILE_SPAN, active.stages.length);
  const maxStart = Math.max(0, active.stages.length - span);
  const windowStart = Math.min(Math.max(0, windows[windowKey] ?? 0), maxStart);
  const setWindowStart = (start: number) => {
    setMenuState(null);
    setWindows((prev) => ({
      ...prev,
      [windowKey]: Math.min(Math.max(0, start), maxStart),
    }));
  };

  const pickTab = (key: string) => {
    setMenuState(null);
    setPicked({ id: bracket.id, key });
  };

  // RM MatchMenu 副标题：双方都确定时显示名称，否则显示“红方 vs 蓝方”
  const menuSubtitle = (match: BracketMatch) => {
    const red =
      match.participant1_id != null
        ? participants.get(match.participant1_id)
        : undefined;
    const blue =
      match.participant2_id != null
        ? participants.get(match.participant2_id)
        : undefined;
    return red && blue ? `${red.name} vs ${blue.name}` : "红方 vs 蓝方";
  };

  // RM MatchMenu：分析比赛 / 分析队伍（管理端追加录入结果）
  const buildMenuItems = (match: BracketMatch): MatchMenuItem[] => {
    const team =
      selectedId != null && isInMatch(match, selectedId)
        ? participants.get(selectedId)
        : undefined;
    const items: MatchMenuItem[] = [
      {
        key: "match",
        label: `分析比赛第${match.seq}场`,
        disabled: !hasBothSides(match),
        onSelect: () => openSheet("match", match.seq),
      },
      {
        key: "team",
        label: `分析队伍${team?.name ?? ""}`,
        disabled: !team,
        onSelect: () => {
          if (team) openSheet("team", team.id);
        },
      },
    ];
    if (onMatchClick) {
      items.push({
        key: "result",
        label: "录入结果",
        disabled: !isClickable(match, onMatchClick),
        onSelect: () => {
          setMenuState(null);
          onMatchClick(match);
        },
      });
    }
    return items;
  };

  const championId = getBracketChampion(detail);
  const champion =
    championId != null ? participants.get(championId) : undefined;

  const championBanner = champion && (
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
  );

  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      swiped.current = false;
      if (e.pointerType === "mouse") return;
      swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) {
        return;
      }
      const next = windowStart + (dx < 0 ? 1 : -1);
      if (next < 0 || next > maxStart) return;
      swiped.current = true;
      setWindowStart(next);
    },
    onPointerCancel: () => {
      swipe.current = null;
    },
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => {
      // 滑动后紧随的 click 不切换选中
      if (swiped.current) {
        swiped.current = false;
        e.stopPropagation();
      }
    },
  };

  const rootClass = [
    "bracket-view",
    `is-${isDesktop ? "classic" : "card"}`,
    fullscreen.active ? "is-fullscreen" : "",
  ].join(" ");

  return (
    <div ref={rootRef} className={rootClass}>
      {isDesktop ? (
        <>
          {tabs.length > 1 && (
            // RM Situation：outlined rounded 分组按钮
            <div className="bv-chips" role="tablist" aria-label="赛段">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={t.key === active.key}
                  className={[
                    "bv-chip",
                    t.key === active.key ? "is-active" : "",
                  ].join(" ")}
                  onClick={() => pickTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {championBanner}
          <div
            className="bv-stage"
            role={tabs.length > 1 ? "tabpanel" : undefined}
          >
            {active.plain ? (
              active.renderDesktop()
            ) : (
              <PanZoomCanvas
                key={windowKey}
                label={`${bracket.name} ${active.label}对阵图`}
                exportName={`${bracket.name}-${active.label}`}
                fullscreen={fullscreen.active}
                canFullscreen={fullscreen.supported}
                onToggleFullscreen={fullscreen.toggle}
                onInteract={dismissMenu}
              >
                {active.renderDesktop()}
              </PanZoomCanvas>
            )}
          </div>
        </>
      ) : (
        <>
          {tabs.length > 1 && (
            // RM BracketPage .group-selector
            <div className="bv-selector">
              <div
                className="bv-selector-track"
                role="tablist"
                aria-label="赛段"
              >
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
                    onClick={() => pickTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {active.stages.length > span && (
            <RoundPicker
              stages={active.stages}
              start={windowStart}
              span={span}
              onChange={setWindowStart}
            />
          )}
          {championBanner}
          {active.plain ? (
            <div className="bv-stage" role="tabpanel">
              {active.renderMobile({ start: 0, span: 0, width: 0 })}
            </div>
          ) : (
            <div
              ref={board.ref}
              className="bv-stage bv-board"
              role={tabs.length > 1 ? "tabpanel" : undefined}
              {...swipeHandlers}
            >
              {board.width > 0 &&
                active.renderMobile({
                  start: windowStart,
                  span,
                  width: board.width,
                })}
            </div>
          )}
        </>
      )}

      {menu && menuMatch && (
        <MatchMenu
          anchor={menu.anchor}
          variant={isDesktop ? "plain" : "glass"}
          title={getMatchStatusText(menuMatch)}
          subtitle={menuSubtitle(menuMatch)}
          meta={`第 ${menuMatch.seq} 场 · ${getMatchRoundLabel(menuMatch, matches)}`}
          items={buildMenuItems(menuMatch)}
          onClose={closeMenu}
        />
      )}

      <TeamAnalysisSheet
        detail={detail}
        participantId={activeSheet?.kind === "team" ? activeSheet.id : null}
        open={activeSheet?.kind === "team" && activeSheet.open}
        onClose={closeSheet}
      />
      <MatchAnalysisSheet
        detail={detail}
        matchSeq={activeSheet?.kind === "match" ? activeSheet.id : null}
        open={activeSheet?.kind === "match" && activeSheet.open}
        onClose={closeSheet}
      />
    </div>
  );
};

export default BracketView;
