import {
  BracketDetail,
  BracketFormat,
  BracketMatch,
  BracketMatchStatus,
  BracketParticipantType,
  BracketStage,
} from "../types";

// 与后端 types.GroupRankRefBase 保持一致
const GROUP_RANK_REF_BASE = 1000;

export const BRACKET_FORMAT_OPTIONS: Array<{
  value: BracketFormat;
  label: string;
  description: string;
}> = [
  {
    value: "single_elimination",
    label: "单败淘汰",
    description: "输一场即淘汰，人数不足 2 的幂时高种子轮空",
  },
  {
    value: "double_elimination",
    label: "双败淘汰",
    description: "胜者组失利掉入败者组，输两场才淘汰",
  },
  {
    value: "round_robin",
    label: "小组循环赛",
    description: "组内两两对决，按积分排名",
  },
  {
    value: "group_knockout",
    label: "小组赛 + 淘汰赛",
    description: "小组循环后各组前几名进入单败淘汰",
  },
];

export const BRACKET_FORMAT_LABELS: Record<BracketFormat, string> =
  Object.fromEntries(
    BRACKET_FORMAT_OPTIONS.map((o) => [o.value, o.label]),
  ) as Record<BracketFormat, string>;

export const PARTICIPANT_TYPE_LABELS: Record<BracketParticipantType, string> = {
  class: "班级",
  student: "学生",
};

export const MATCH_STATUS_LABELS: Record<BracketMatchStatus, string> = {
  pending: "待定",
  scheduled: "待比赛",
  completed: "已完赛",
  bye: "轮空",
  void: "不进行",
};

export const isGroupFormat = (format: BracketFormat) =>
  format === "round_robin" || format === "group_knockout";

// 小组名称：0 → A 组，26 起退化为数字
export const getGroupName = (index: number) =>
  index < 26 ? `${String.fromCharCode(65 + index)} 组` : `第 ${index + 1} 组`;

// 轮次标题：淘汰赛按剩余轮数命名（决赛/半决赛/…）
export const getRoundTitle = (
  stage: BracketStage,
  round: number,
  totalRounds: number,
) => {
  if (stage === "losers") {
    return round === totalRounds ? "败者组决赛" : `败者组第 ${round} 轮`;
  }
  if (stage !== "main") return `第 ${round} 轮`;
  const remaining = totalRounds - round;
  if (remaining === 0) return "决赛";
  if (remaining === 1) return "半决赛";
  if (remaining === 2) return "四分之一决赛";
  return `第 ${round} 轮`;
};

// 参赛方未定时的签位说明
export const getSlotPlaceholder = (
  match: BracketMatch,
  side: 1 | 2,
  matchesBySeq: Map<number, BracketMatch>,
) => {
  const source = side === 1 ? match.slot1_source : match.slot2_source;
  const ref = side === 1 ? match.slot1_ref : match.slot2_ref;
  const from = matchesBySeq.get(ref);
  switch (source) {
    case "winner":
      if (from?.status === "void") return "轮空";
      return from ? `#${ref} 胜者` : "待定";
    case "loser":
      // 轮空或不进行的比赛没有败者
      if (from?.status === "bye" || from?.status === "void") return "轮空";
      return from ? `#${ref} 败者` : "待定";
    case "group_rank": {
      const group = Math.floor(ref / GROUP_RANK_REF_BASE);
      const rank = ref % GROUP_RANK_REF_BASE;
      return `${getGroupName(group).replace(" ", "")}第 ${rank} 名`;
    }
    case "none":
      return "轮空";
    default:
      return "待定";
  }
};

// 冠军：淘汰赛决赛或双败总决赛的胜者；纯循环赛且全部完赛时取积分第一
export const getBracketChampion = (detail: BracketDetail): number | null => {
  const { bracket, matches, standings } = detail;
  if (bracket.format === "round_robin") {
    const done = matches.every(
      (m) => m.stage !== "group" || m.status !== "scheduled",
    );
    const pending = matches.some((m) => m.status === "pending");
    if (!done || pending || standings.length !== 1) return null;
    return standings[0].rows[0]?.participant_id ?? null;
  }
  const finalStage: BracketStage =
    bracket.format === "double_elimination" ? "grand_final" : "main";
  const finals = matches.filter((m) => m.stage === finalStage);
  if (finals.length === 0) return null;
  const last = finals.reduce((a, b) => (b.round > a.round ? b : a));
  return last.status === "completed" || last.status === "bye"
    ? last.winner_id
    : null;
};
