import { api, callApi, callPaginatedApi } from "../config";
import type { UpdateBracketMatchRequest } from "./bracket";
import {
  Class,
  Competition,
  Registration,
  Score,
  StudentScore,
  BracketDetail,
  ApiResponse,
  PaginatedResponse,
} from "../../types";

export interface CreateScoreRequest {
  competition_id: number;
  student_scores: StudentScore[];
}

export interface ReviewScoreRequest {
  competition_id: number;
}

/**
 * 管理员-成绩录入API
 */
export const adminProgressAPI = {
  /**
   * 获取使用对阵图的项目的对阵；未启用或尚未创建时 data 为空
   */
  getBracket: async (
    competitionId: number,
  ): Promise<ApiResponse<BracketDetail | null>> => {
    return await callApi(() =>
      api.get(`/admin/progress/${competitionId}/bracket`),
    );
  },

  /**
   * 录入对阵比分；全部完赛时后端自动生成名次并完赛
   */
  updateBracketMatch: async (
    competitionId: number,
    matchId: number,
    data: UpdateBracketMatchRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.put(
        `/admin/progress/${competitionId}/bracket/matches/${matchId}`,
        data,
      ),
    );
  },

  /**
   * 按当前对阵结果生成名次并完赛（退回后未改动比分时使用）
   */
  completeFromBracket: async (
    competitionId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post(`/admin/progress/${competitionId}/bracket/complete`),
    );
  },

  /**
   * 赛事进程状态流转（body.status 为目标状态，后端校验流转合法性）
   */
  setStatus: async (id: number, status: string): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post(`/admin/progress/${id}/status`, { status }),
    );
  },

  /**
   * 对单个已报名学生发送检录提醒
   */
  remindStudent: async (
    competitionId: number,
    studentId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post("/admin/progress/remind", {
        competition_id: competitionId,
        student_id: studentId,
      }),
    );
  },

  /**
   * 获取比赛列表（用于成绩录入）
   */
  getCompetitions: async (params?: {
    status?: string;
  }): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() =>
      api.get("/admin/progress/competitions", { params }),
    );
  },

  /**
   * 获取班级列表（全校性比赛录成绩使用）
   */
  getClasses: async (): Promise<PaginatedResponse<Class[]>> => {
    return await callPaginatedApi(() => api.get("/admin/progress/classes"));
  },

  /**
   * 创建或更新成绩
   */
  createOrUpdateScores: async (
    data: CreateScoreRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/progress/scores", data));
  },

  /**
   * 获取比赛成绩
   */
  getCompetitionScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => api.get(`/admin/progress/scores/${id}`));
  },

  /**
   * 删除成绩记录
   */
  deleteScores: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/progress/scores/${id}`));
  },

  /**
   * 获取所有报名学生（用于成绩录入）
   */
  getRegisteredStudents: async (
    competitionId: number,
  ): Promise<ApiResponse<Registration[]>> => {
    return await callApi(() =>
      api.get(`/admin/progress/${competitionId}/registrations`),
    );
  },
};

/**
 * 管理员-成绩审核API
 */
export const adminReviewAPI = {
  /**
   * 获取比赛列表（用于成绩审核）
   */
  getCompetitions: async (): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() => api.get("/admin/review/competitions"));
  },

  /**
   * 获取比赛成绩
   */
  getCompetitionScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => api.get(`/admin/review/${id}`));
  },

  /**
   * 审核成绩
   */
  reviewScores: async (
    data: ReviewScoreRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/review", data));
  },
};
