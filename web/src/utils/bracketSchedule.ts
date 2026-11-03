import dayjs from "dayjs";
import {
  Bracket,
  BracketMatch,
  BracketScheduleConfig,
  BracketParticipant,
} from "../types";
import { getSlotPlaceholder } from "./bracket";

// 未自动排期过时，冲突检测按此时长估算每场占用
export const DEFAULT_MATCH_MINUTES = 30;

/** 需要占用场地的比赛（轮空、作废不排期） */
export const isSchedulable = (m: BracketMatch) =>
  m.status !== "bye" && m.status !== "void";

/** 排期表单默认值：沿用上次参数，否则取项目开始时间与地点 */
export const defaultScheduleConfig = (
  bracket: Bracket,
): BracketScheduleConfig => {
  if (bracket.schedule_config) return bracket.schedule_config;
  const start = bracket.competition_start_time
    ? dayjs(bracket.competition_start_time)
    : dayjs().add(1, "day").hour(8).minute(0);
  return {
    start_at: start.second(0).millisecond(0).format(),
    match_minutes: DEFAULT_MATCH_MINUTES,
    gap_minutes: 5,
    rest_minutes: 15,
    venues: [bracket.competition_venue?.trim() || "1 号场地"],
    day_start: "08:00",
    day_end: "17:00",
    keep_scheduled: false,
  };
};

export interface ScheduleConflict {
  // 同一场地时间重叠的比赛场次号
  venue: number[];
  // 同一参赛方时间重叠的比赛场次号
  participant: number[];
}

/**
 * 检测已排期比赛的冲突：同一场地或同一参赛方的时间段重叠
 * 时长取上次自动排期的每场时长，未自动排期过时按 30 分钟估算
 */
export const findScheduleConflicts = (
  matches: BracketMatch[],
  minutes: number,
): Map<number, ScheduleConflict> => {
  const list = matches
    .filter((m) => m.scheduled_at && isSchedulable(m))
    .map((m) => {
      const start = dayjs(m.scheduled_at).valueOf();
      return { m, start, end: start + minutes * 60_000 };
    })
    .sort((a, b) => a.start - b.start);
  const result = new Map<number, ScheduleConflict>();
  const add = (id: number, kind: keyof ScheduleConflict, seq: number) => {
    const entry = result.get(id) ?? { venue: [], participant: [] };
    if (!entry[kind].includes(seq)) entry[kind].push(seq);
    result.set(id, entry);
  };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
      const a = list[i].m;
      const b = list[j].m;
      if (a.venue && a.venue === b.venue) {
        add(a.id, "venue", b.seq);
        add(b.id, "venue", a.seq);
      }
      const ids = [a.participant1_id, a.participant2_id].filter(
        (p): p is number => p != null,
      );
      if (ids.some((p) => p === b.participant1_id || p === b.participant2_id)) {
        add(a.id, "participant", b.seq);
        add(b.id, "participant", a.seq);
      }
    }
  }
  return result;
};

/** 冲突说明文本 */
export const conflictText = (c: ScheduleConflict) =>
  [
    c.venue.length > 0 ? `场地与第 ${c.venue.join("、")} 场重叠` : "",
    c.participant.length > 0
      ? `参赛方与第 ${c.participant.join("、")} 场时间重叠`
      : "",
  ]
    .filter(Boolean)
    .join("；");

/** 按日期分组（已按时间排序的比赛） */
export const groupByDay = <T>(
  items: T[],
  timeOf: (item: T) => string | undefined,
): { day: string; items: T[] }[] => {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const t = timeOf(item);
    const day = t ? dayjs(t).format("YYYY-MM-DD") : "";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 日期标题：11月2日 周一 */
export const formatDayTitle = (day: string) => {
  if (!day) return "未排期";
  const d = dayjs(day);
  return `${d.format("M月D日")} 周${WEEKDAYS[d.day()]}`;
};

/** 已排期比赛按时间、场地排序；未排期的在最后按场次号排序 */
export const sortBySchedule = (matches: BracketMatch[]) =>
  [...matches].sort((a, b) => {
    if (a.scheduled_at && b.scheduled_at) {
      const diff = dayjs(a.scheduled_at).diff(dayjs(b.scheduled_at));
      if (diff !== 0) return diff;
      return a.venue.localeCompare(b.venue, "zh-CN") || a.seq - b.seq;
    }
    if (a.scheduled_at) return -1;
    if (b.scheduled_at) return 1;
    return a.seq - b.seq;
  });

/** 对阵双方名称：已确定显示名称，否则显示签位说明（如「#3 胜者」） */
export const matchSideNames = (
  match: BracketMatch,
  participants: Map<number, BracketParticipant>,
  matchesBySeq: Map<number, BracketMatch>,
): [string, string] => {
  const name = (id: number | null, side: 1 | 2) =>
    (id != null ? participants.get(id)?.name : undefined) ??
    getSlotPlaceholder(match, side, matchesBySeq);
  return [name(match.participant1_id, 1), name(match.participant2_id, 2)];
};
