import dayjs from "dayjs";
import {
  BracketMatch,
  BracketParticipant,
  PublicScheduleItem,
} from "../../types";
import {
  ScheduleConflict,
  conflictText,
  isSchedulable,
  matchSideNames,
} from "../../utils/bracketSchedule";
import {
  formatMatchScore,
  getMatchRoundLabel,
  isInMatch,
} from "../bracket/analysis";
import { ScheduleEntry, ScheduleTone } from "./ScheduleViews";

// 当前时间落在时段内：视为进行中
const isOngoing = (start: string, end: string) => {
  const now = dayjs();
  return !now.isBefore(dayjs(start)) && now.isBefore(dayjs(end));
};

const matchTone = (
  status: BracketMatch["status"],
  start: string,
  end: string,
): { tone: ScheduleTone; text: string } => {
  if (status === "completed") return { tone: "completed", text: "已结束" };
  if (status === "pending") return { tone: "pending", text: "对阵待定" };
  if (isOngoing(start, end)) return { tone: "live", text: "进行中" };
  return { tone: "scheduled", text: "待比赛" };
};

interface BracketEntryOptions {
  matches: BracketMatch[];
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  minutes: number;
  groupName: string;
  conflicts?: Map<number, ScheduleConflict>;
  selectedId?: number | null;
  activeSeq?: number | null;
  onPick?: (match: BracketMatch, element: HTMLElement) => void;
}

/** 对阵中已排期的比赛 → 排期条目 */
export const bracketEntries = ({
  matches,
  participants,
  matchesBySeq,
  minutes,
  groupName,
  conflicts,
  selectedId,
  activeSeq,
  onPick,
}: BracketEntryOptions): ScheduleEntry[] =>
  matches
    .filter((m) => m.scheduled_at && isSchedulable(m))
    .map((m) => {
      const start = m.scheduled_at ?? "";
      const end = dayjs(start).add(minutes, "minute").format();
      const [red, blue] = matchSideNames(m, participants, matchesBySeq);
      const { tone, text } = matchTone(m.status, start, end);
      const conflict = conflicts?.get(m.id);
      return {
        key: `m-${m.id}`,
        start,
        end,
        venue: m.venue,
        group: groupName,
        title: `${red} vs ${blue}`,
        meta: `第 ${m.seq} 场 · ${getMatchRoundLabel(m, matches)}`,
        tag: `#${m.seq}`,
        tone,
        statusText:
          m.status === "completed" ? `${text} ${formatMatchScore(m)}` : text,
        conflict: conflict ? conflictText(conflict) : undefined,
        related: isInMatch(m, selectedId ?? null),
        active: activeSeq === m.seq,
        onPick: onPick ? (el) => onPick(m, el) : undefined,
      };
    });

const COMPETITION_TONE: Record<
  string,
  { tone: ScheduleTone; text: string } | undefined
> = {
  checking_in: { tone: "live", text: "检录中" },
  in_progress: { tone: "live", text: "进行中" },
  pending_score_review: { tone: "review", text: "成绩审核中" },
  completed: { tone: "completed", text: "已结束" },
};

const scoreText = (item: PublicScheduleItem) => {
  if (item.score1 != null && item.score2 != null) {
    return `${item.score1}:${item.score2}`;
  }
  if (item.winner_side === 1) return "胜:负";
  if (item.winner_side === 2) return "负:胜";
  return "";
};

/** 首页赛程：项目整体时段 / 对阵中的一场比赛 → 排期条目 */
export const publicScheduleEntries = (
  items: PublicScheduleItem[],
  onPick: (item: PublicScheduleItem) => void,
): ScheduleEntry[] =>
  items.map((item) => {
    if (item.kind === "match") {
      const { tone, text } = matchTone(
        item.match_status ?? "scheduled",
        item.start_at,
        item.end_at,
      );
      const score = item.match_status === "completed" ? scoreText(item) : "";
      return {
        key: `m-${item.match_id}`,
        start: item.start_at,
        end: item.end_at,
        venue: item.venue,
        group: item.competition_name,
        title: `${item.side1 ?? "待定"} vs ${item.side2 ?? "待定"}`,
        meta: `${item.competition_name} · 第 ${item.match_seq} 场 · ${item.round_label ?? ""}`,
        tag: `#${item.match_seq}`,
        tone,
        statusText: score ? `${text} ${score}` : text,
        description: "点击查看对阵图",
        onPick: () => onPick(item),
      };
    }
    // 未开始的项目：当前时间落在时段内也视为进行中
    const known = COMPETITION_TONE[item.competition_status];
    const state =
      known ??
      (isOngoing(item.start_at, item.end_at)
        ? { tone: "live" as const, text: "进行中" }
        : { tone: "scheduled" as const, text: "待开始" });
    return {
      key: `c-${item.competition_id}`,
      start: item.start_at,
      end: item.end_at,
      venue: item.venue,
      group: item.competition_name,
      title: item.competition_name,
      meta: item.end_estimated ? "结束时间待定" : "",
      tag: state.text,
      tone: state.tone,
      statusText: state.text,
      description: "点击查看项目详情",
      onPick: () => onPick(item),
    };
  });
