import dayjs from "dayjs";
import {
  BracketDetail,
  BracketMatch,
  BracketParticipant,
  BracketStandingRow,
} from "../../types";
import { getGroupName, getRoundTitle } from "../../utils/bracket";

// 对阵图队伍分析（移植 RM Schedule 的 MatchMenu / AnalyzeTeam / AnalyzeMatch）共用的工具函数

/** 比赛双方参赛方 ID */
export const matchSides = (match: BracketMatch) =>
  [match.participant1_id, match.participant2_id] as const;

/** 参赛方是否出现在该场比赛中 */
export const isInMatch = (match: BracketMatch, participantId: number | null) =>
  participantId != null &&
  (match.participant1_id === participantId ||
    match.participant2_id === participantId);

/** 双方都已确定的比赛才可分析 */
export const hasBothSides = (match: BracketMatch) =>
  match.participant1_id != null && match.participant2_id != null;

/** 比赛所在轮次的标题（小组 / 淘汰赛轮次 / 季军赛 / 总决赛） */
export const getMatchRoundLabel = (
  match: BracketMatch,
  matches: BracketMatch[],
) => {
  switch (match.stage) {
    case "group":
      return `${getGroupName(match.group_index).replace(" ", "")} 第 ${match.round} 轮`;
    case "third_place":
      return "季军赛";
    case "grand_final":
      return match.round === 1 ? "总决赛" : `总决赛第 ${match.round} 场`;
    default: {
      const total = Math.max(
        1,
        ...matches.filter((m) => m.stage === match.stage).map((m) => m.round),
      );
      const isLastMain = match.stage === "main" && match.round === total;
      if (isLastMain && matches.some((m) => m.stage === "grand_final")) {
        return "胜者组决赛";
      }
      return getRoundTitle(match.stage, match.round, total);
    }
  }
};

/** 比赛状态说明（对应 RM MatchMenu 的 matchTooltip） */
export const getMatchStatusText = (match: BracketMatch) => {
  switch (match.status) {
    case "scheduled":
      return match.scheduled_at
        ? `预计 ${dayjs(match.scheduled_at).format("M月D日 HH:mm")} 开始`
        : "比赛未开始";
    case "pending":
      return "等待对阵确定";
    case "completed":
      return "比赛已结束";
    case "bye":
      return "轮空晋级";
    default:
      return "比赛不进行";
  }
};

/** 比分文本：两边都有比分时为 “a:b”，否则按胜负显示 */
export const formatMatchScore = (match: BracketMatch) => {
  if (match.score1 != null && match.score2 != null) {
    return `${match.score1}:${match.score2}`;
  }
  if (match.status === "completed") {
    if (match.is_draw) return "平";
    if (match.winner_id != null) {
      return match.winner_id === match.participant1_id ? "胜:负" : "负:胜";
    }
  }
  if (match.status === "scheduled") return "未开始";
  return "-";
};

/** 已完赛的一方是否落败（平局双方都不算） */
export const isMatchLoser = (match: BracketMatch, side: 1 | 2) => {
  if (match.status !== "completed" || match.is_draw) return false;
  const pid = side === 1 ? match.participant1_id : match.participant2_id;
  return pid != null && match.winner_id != null && match.winner_id !== pid;
};

/** 该参赛方已完赛的比赛（RM MatchRecord：比赛战绩），按场次排序 */
export const getParticipantRecord = (
  matches: BracketMatch[],
  participantId: number,
) =>
  matches
    .filter((m) => m.status === "completed" && isInMatch(m, participantId))
    .sort((a, b) => a.seq - b.seq);

/** 两个参赛方在本对阵图中的全部交手（不含不进行的比赛） */
export const getHeadToHead = (matches: BracketMatch[], a: number, b: number) =>
  matches
    .filter(
      (m) =>
        m.status !== "void" &&
        ((m.participant1_id === a && m.participant2_id === b) ||
          (m.participant1_id === b && m.participant2_id === a)),
    )
    .sort((x, y) => x.seq - y.seq);

export interface StandingInfo {
  groupIndex: number;
  row: BracketStandingRow;
  total: number;
}

/** 参赛方所在小组的积分行 */
export const getStandingOf = (
  detail: BracketDetail,
  participantId: number,
): StandingInfo | null => {
  for (const standing of detail.standings) {
    const row = standing.rows.find((r) => r.participant_id === participantId);
    if (row) {
      return {
        groupIndex: standing.group_index,
        row,
        total: standing.rows.length,
      };
    }
  }
  return null;
};

/** 参赛方显示名（附带班级） */
export const participantFullName = (p?: BracketParticipant) => {
  if (!p) return "待定";
  return p.class_name && p.class_name !== p.name
    ? `${p.name}（${p.class_name}）`
    : p.name;
};
