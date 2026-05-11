export interface User {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "student";
  permission?: number;
  class_scopes?: Class[]; // 班级权限范围，空表示全局管理员
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

export interface Competition {
  id: number;
  name: string;
  description: string;
  image_path?: string;
  status:
    | "pending_approval"
    | "approved"
    | "rejected"
    | "pending_score_review"
    | "completed";
  ranking_mode: "higher_first" | "lower_first";
  unit: string;
  gender: number;
  competition_type: "individual" | "team"; // 比赛类型：个人或团体
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
  competition_type: "individual" | "team";
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
  icp_beian: string;
  public_sec_beian: string;
  dingtalk_corp_id: string;
  domain: string;
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
  class_id?: number; // 团体比赛时使用
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
  SCORE_INPUT: 16,
  SCORE_REVIEW: 32,
  REGISTRATION_MANAGEMENT: 64,
} as const;
