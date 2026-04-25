import { api, callApi, callPaginatedApi } from "../config";
import { Competition, ApiResponse, PaginatedResponse } from "../../types";

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
  start_time?: string;
  end_time?: string;
}

export interface UpdateCompetitionRequest {
  name?: string;
  description?: string;
  ranking_mode?: "higher_first" | "lower_first";
  competition_type?: "individual" | "team";
  min_participants_per_class?: number;
  max_participants_per_class?: number;
  min_female_per_class?: number;
  max_female_per_class?: number;
  min_male_per_class?: number;
  max_male_per_class?: number;
  image?: string;
  unit?: string;
  gender?: number;
  start_time?: string;
  end_time?: string;
}

/**
 * 管理员-项目管理API
 */
export const adminCompetitionAPI = {
  /**
   * 获取所有比赛项目（支持分页和筛选）
   */
  getCompetitions: async (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    sort_by?: "name" | "votes" | "schedule";
  }): Promise<PaginatedResponse<Competition[]>> => {
    return await callPaginatedApi(() =>
      api.get("/admin/competitions", { params }),
    );
  },

  /**
   * 获取比赛详情
   */
  getCompetition: async (id: number): Promise<ApiResponse<Competition>> => {
    return await callApi(() => api.get(`/admin/competitions/${id}`));
  },

  /**
   * 创建比赛项目
   */
  createCompetition: async (
    data: CreateCompetitionRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/competitions", data));
  },

  /**
   * 更新比赛项目
   */
  updateCompetition: async (
    id: number,
    data: UpdateCompetitionRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/competitions/${id}`, data));
  },

  /**
   * 删除比赛项目
   */
  deleteCompetition: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/competitions/${id}`));
  },

  /**
   * 审核通过比赛项目
   */
  approveCompetition: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post(`/admin/competitions/${id}/approve`));
  },

  /**
   * 审核拒绝比赛项目
   */
  rejectCompetition: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post(`/admin/competitions/${id}/reject`));
  },
};
