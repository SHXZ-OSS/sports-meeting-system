import { api, callApi } from "../config";
import {
  Competition,
  Registration,
  Score,
  StudentScore,
  ApiResponse,
} from "../../types";

export interface CreateScoreRequest {
  competition_id: number;
  student_scores: StudentScore[];
}

export interface ReviewScoreRequest {
  competition_id: number;
  notify_published?: boolean; // 审核通过后钉钉通知有成绩的学生
}

/**
 * 管理员-成绩录入API
 */
export const adminScoreInputAPI = {
  /**
   * 获取比赛列表（用于成绩录入）
   */
  getCompetitions: async (params?: {
    status?: string;
  }): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() =>
      api.get("/admin/scores/input/competitions", { params }),
    );
  },

  /**
   * 创建或更新成绩
   */
  createOrUpdateScores: async (
    data: CreateScoreRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/scores/input", data));
  },

  /**
   * 获取比赛成绩
   */
  getCompetitionScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => api.get(`/admin/scores/input/${id}`));
  },

  /**
   * 删除成绩记录
   */
  deleteScores: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/scores/input/${id}`));
  },

  /**
   * 获取所有报名学生（用于成绩录入）
   */
  getRegisteredStudents: async (
    competitionId: number,
  ): Promise<ApiResponse<Registration[]>> => {
    return await callApi(() =>
      api.get(`/admin/scores/input/${competitionId}/registrations`),
    );
  },
};

/**
 * 管理员-成绩审核API
 */
export const adminScoreReviewAPI = {
  /**
   * 获取比赛列表（用于成绩审核）
   */
  getCompetitions: async (): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() => api.get("/admin/scores/review/competitions"));
  },

  /**
   * 获取比赛成绩
   */
  getCompetitionScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => api.get(`/admin/scores/review/${id}`));
  },

  /**
   * 审核成绩
   */
  reviewScores: async (
    data: ReviewScoreRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/scores/review", data));
  },
};
