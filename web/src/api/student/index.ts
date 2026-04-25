import { api, callApi, callPaginatedApi } from "../config";
import {
  Competition,
  Score,
  ApiResponse,
  PaginatedResponse,
  VoteType,
} from "../../types";

export interface CreateCompetitionRequest {
  name: string;
  description: string;
  ranking_mode: "higher_first" | "lower_first";
  gender: number;
  competition_type: "individual" | "team";
  min_participants_per_class: number;
  max_participants_per_class: number;
  min_female_per_class?: number;
  max_female_per_class?: number;
  min_male_per_class?: number;
  max_male_per_class?: number;
  image?: string;
  unit: string;
}

export interface RegisterCompetitionRequest {
  competition_id: number;
}

export interface RegistrationResponse {
  message: string;
  exceeding: boolean;
  registrants?: string[];
}

/**
 * 学生端API
 */
export const studentAPI = {
  /**
   * 创建推荐项目
   */
  createCompetition: async (
    data: CreateCompetitionRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/student/competitions", data));
  },

  /**
   * 获取符合条件的比赛项目（支持分页和搜索）
   */
  getEligibleCompetitions: async (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    sort_by?: "name" | "votes";
  }): Promise<PaginatedResponse<Competition[]>> => {
    return await callPaginatedApi(() =>
      api.get("/student/competitions", { params }),
    );
  },

  /**
   * 获取学生报名记录
   */
  getRegistrations: async (): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() => api.get("/student/registrations"));
  },

  /**
   * 报名比赛
   */
  registerCompetition: async (
    data: RegisterCompetitionRequest,
  ): Promise<ApiResponse<RegistrationResponse>> => {
    return await callApi(() => api.post("/student/register", data));
  },

  /**
   * 取消报名
   */
  unregisterCompetition: async (
    competitionId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.delete(`/student/unregister/${competitionId}`),
    );
  },

  /**
   * 获取个人成绩
   */
  getScores: async (): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => api.get("/student/scores"));
  },

  /**
   * 对比赛项目投票
   */
  voteCompetition: async (
    competitionId: number,
    voteType: VoteType,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post("/student/vote", {
        competition_id: competitionId,
        vote_type: voteType,
      }),
    );
  },

  /**
   * 获取学生投票记录
   */
  getStudentVotes: async (
    competitionIds: number[],
  ): Promise<ApiResponse<Record<number, VoteType>>> => {
    return await callApi(() =>
      api.get("/student/votes", {
        params: { competition_ids: JSON.stringify(competitionIds) },
      }),
    );
  },

  /**
   * 获取当前学生的得分和排名汇总
   */
  getPointsSummary: async (): Promise<
    ApiResponse<{
      student_id: number;
      student_name: string;
      class_id: number;
      class_name: string;
      total_points: number;
      ranking_points: number;
      rank: number;
    }>
  > => {
    return await callApi(() => api.get("/student/points/summary"));
  },
};
