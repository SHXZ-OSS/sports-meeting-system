export interface User {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "student";
  permission?: number;
  class_id?: number; // 班级账号所属班级；空表示全局管理员
  class?: Class;
}

export interface Student {
  id: number;
  username: string;
  full_name: string;
  gender: number;
  class_id: number;
  class_name: string;
  dingtalk_id: string;
}

export interface Class {
  id: number;
  name: string;
}

export type CompetitionType = "individual" | "team" | "school" | "registration";

export type CustomFieldType = "string" | "int" | "float" | "bool";

export interface CompetitionCustomField {
  id: number;
  competition_id?: number;
  name: string;
  field_type: CustomFieldType;
  required: boolean;
  sort_order: number;
  has_registration_data?: boolean;
}

export interface RegistrationCustomValue {
  id?: number;
  registration_id?: number;
  field_id: number;
  value: string;
  field?: CompetitionCustomField;
}

export interface RegistrationCustomValueInput {
  field_id: number;
  value: string | number | boolean;
}

export interface Competition {
  id: number;
  name: string;
  description: string;
  venue: string; // 比赛地点
  image_path?: string;
  status:
    | "pending_approval"
    | "approved"
    | "checking_in"
    | "in_progress"
    | "rejected"
    | "pending_score_review"
    | "completed";
  ranking_mode: "higher_first" | "lower_first";
  unit: string;
  gender: number;
  competition_type: CompetitionType; // 比赛类型：个人/团体/全校性/仅报名
  min_participants_per_class: number;
  max_participants_per_class: number;
  min_female_per_class: number;
  max_female_per_class: number;
  min_male_per_class: number;
  max_male_per_class: number;
  submitter_id?: number;
  submitter_name?: string;
  reviewer_id?: number;
  reviewer_name?: string;
  score_submitter_id?: number;
  score_submitter_name?: string;
  score_reviewer_id?: number;
  score_reviewer_name?: string;
  registration_count?: number;
  vote_count: number;
  reviewed_at?: string;
  score_reviewed_at?: string;
  score_created_at?: string;
  created_at?: string;
  start_time?: string;
  end_time?: string;
  allow_concurrent?: boolean;
  bracket_enabled?: boolean; // 使用对阵图：名次由对阵结果生成
  custom_fields?: CompetitionCustomField[];
  scores?: Score[];
}

export interface Score {
  id: number;
  competition_id: number;
  competition_name: string;
  student_id?: number; // 个人比赛时使用
  class_id?: number; // 团体比赛时使用
  student_name: string;
  class_name: string;
  score: number;
  unit?: string; // 成绩单位（如 秒、米）
  bracket_enabled?: boolean; // 对阵图名次：score 即名次，展示为「第 N 名」
  ranking?: number;
  point?: number; // 分数
}

export interface Registration {
  id: number;
  student_id: number;
  class_id: number;
  competition_id: number;
  student_name: string;
  student_gender: number;
  class_name: string;
  created_at: string;
  custom_values?: RegistrationCustomValue[];
}

export interface ClassPointsSummary {
  class_id: number;
  class_name: string;
  total_points: number;
  ranking_points: number;
  custom_points: number;
  rank: number;
}

export interface StudentPointsSummary {
  student_id: number;
  student_name: string;
  class_id: number;
  class_name: string;
  total_points: number;
  ranking_points: number;
  rank: number;
}

export interface PointDetail {
  id: number;
  competition_id: number;
  competition_name: string;
  competition_type: CompetitionType;
  points: number;
  point_type: "ranking" | "custom";
  ranking?: number;
  reason?: string;
  created_by?: number;
  creator_name?: string;
  created_at: string;
}

export interface Statistics {
  latest_competition: Competition | null;
  latest_scores: Score[] | null;
  completed_competition_count: number;
  remaining_competition_count: number;
  top_classes?: ClassPointsSummary[];
  top_students?: StudentPointsSummary[];
}

export interface WebsiteInfo {
  name: string;
  event_name?: string;
  dingtalk_corp_id: string;
  domain: string;
  logo_url?: string;
  allow_student_registration?: boolean; // 是否允许学生本人报名；关闭后仅管理员与班级账号可报名
  allow_student_submission?: boolean; // 是否允许学生本人提交推荐项目；关闭后仅管理员与班级账号可提交
  oidc_enabled?: boolean; // 是否启用 OIDC 登录（如接入慧云）
  notify_manual_remind?: boolean; // 是否允许手动发送检录提醒；关闭后隐藏赛事进程页的提醒按钮
  // 各阶段时间窗口（空 = 不限制），前端据此隐藏报名/投票等操作入口
  submission_start_time?: string;
  submission_end_time?: string;
  voting_start_time?: string;
  voting_end_time?: string;
  registration_start_time?: string;
  registration_end_time?: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T> {
  total: number;
  page: number;
  size: number;
}

export interface StudentScore {
  student_id?: number; // 个人比赛时使用
  class_id?: number; // 团体/全校性比赛时使用
  score: number;
}

// 投票类型
export enum VoteType {
  Up = 1,
  Down = -1,
}

// 权限常量
export const PERMISSIONS = {
  PROJECT_MANAGEMENT: 1,
  USER_MANAGEMENT: 2,
  STUDENT_AND_CLASS_MANAGEMENT: 4,
  WEBSITE_MANAGEMENT: 8,
  SCORE_AND_PROGRESS: 16,
  SCORE_REVIEW: 32,
  REGISTRATION_MANAGEMENT: 64,
  BRACKET_MANAGEMENT: 128,
} as const;

// 后端在 index.html 中注入的初始数据（SPA 服务端注入）
declare global {
  interface Window {
    __INITIAL_DATA__?: {
      token: string | null;
      user: unknown;
      website_info: Partial<WebsiteInfo> | null;
    };
  }
}

// ==== 对阵图 ====

export type BracketFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "group_knockout";

export type BracketParticipantType = "class" | "student";

export type BracketStage =
  "group" | "main" | "losers" | "grand_final" | "third_place";

export type BracketMatchStatus =
  "pending" | "scheduled" | "completed" | "bye" | "void";

export type BracketSlotSource =
  "none" | "participant" | "winner" | "loser" | "group_rank";

export interface Bracket {
  id: number;
  event_id: number;
  competition_id?: number;
  competition_name?: string;
  competition_bracket_enabled?: boolean; // 所属项目是否启用对阵图
  competition_status?: string;
  name: string;
  description: string;
  format: BracketFormat;
  participant_type: BracketParticipantType;
  group_count: number;
  advance_per_group: number;
  third_place_match: boolean;
  points_win: number;
  points_draw: number;
  points_loss: number;
  published: boolean;
  radar_config?: RadarConfig | null; // 雷达图配置，为空表示未启用
  participant_count: number;
  match_count: number;
  created_at: string;
  updated_at: string;
}

export interface BracketParticipant {
  id: number;
  bracket_id: number;
  class_id?: number;
  student_id?: number;
  seed: number;
  group_index: number;
  name: string;
  class_name?: string;
  radar_manual?: Record<string, number>; // 管理员手动评分（维度 → 0–5）
}

export interface BracketMatch {
  id: number;
  bracket_id: number;
  stage: BracketStage;
  group_index: number;
  round: number;
  position: number;
  seq: number;
  slot1_source: BracketSlotSource;
  slot1_ref: number;
  slot2_source: BracketSlotSource;
  slot2_ref: number;
  participant1_id: number | null;
  participant2_id: number | null;
  score1: number | null;
  score2: number | null;
  winner_id: number | null;
  is_draw: boolean;
  completed: boolean;
  status: BracketMatchStatus;
  scheduled_at?: string;
  venue: string;
  note: string;
  stats1?: Record<string, number>; // 一方本场统计数据
  stats2?: Record<string, number>; // 另一方本场统计数据
}

export interface BracketStandingRow {
  participant_id: number;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  score_for: number;
  score_against: number;
  score_diff: number;
}

export interface BracketGroupStanding {
  group_index: number;
  rows: BracketStandingRow[];
}

export interface BracketDetail {
  bracket: Bracket;
  participants: BracketParticipant[];
  matches: BracketMatch[];
  standings: BracketGroupStanding[];
  radar?: BracketRadar; // 雷达图结果，按最新比赛数据计算
}

// ==== 队伍雷达图 ====

export type RadarPreset =
  | "football"
  | "basketball"
  | "table_tennis"
  | "badminton"
  | "volleyball"
  | "custom";

export interface RadarStatField {
  key: string;
  label: string;
  hint?: string;
}

export interface RadarSumConstraint {
  fields: string[];
  max: string;
  message: string;
}

export interface RadarTerm {
  side: "own" | "opp";
  field: string; // 统计字段，或内置的 score（比分）/ match（场次）
  weight: number;
}

export interface RadarFormula {
  numerator: RadarTerm[];
  denominator: RadarTerm[];
  low: number;
  high: number;
  invert?: boolean;
}

export interface RadarDimension {
  key: string;
  label: string;
  description?: string;
  formula?: RadarFormula | null; // 为空时为手动评分维度
}

export interface RadarConfig {
  preset: RadarPreset;
  fields: RadarStatField[];
  constraints?: RadarSumConstraint[];
  dimensions: RadarDimension[];
}

export interface RadarPresetInfo {
  preset: RadarPreset;
  label: string;
  description: string;
  fields: RadarStatField[];
  dimensions: RadarDimension[];
}

export interface RadarValue {
  value: number | null; // 0–5；为空表示暂无数据
  sample: number; // 参与计算的场次
  manual: boolean; // 是否为管理员手动设置
}

export interface BracketRadar {
  config: RadarConfig;
  teams: Record<string, Record<string, RadarValue>>; // 参赛方 ID（字符串）→ 维度 → 数值
  average: Record<string, number | null>;
}
