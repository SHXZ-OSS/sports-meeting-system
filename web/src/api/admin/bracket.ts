import { api, callApi, callPaginatedApi } from "../config";
import {
  ApiResponse,
  Bracket,
  BracketDetail,
  BracketFormat,
  BracketParticipantType,
  Class,
  Competition,
  PaginatedResponse,
  Student,
} from "../../types";

export interface BracketRequest {
  name: string;
  description?: string;
  competition_id?: number | null;
  format?: BracketFormat;
  participant_type?: BracketParticipantType;
  group_count?: number;
  advance_per_group?: number;
  third_place_match?: boolean;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;
  published?: boolean;
}

export interface UpdateBracketMatchRequest {
  score1?: number | null;
  score2?: number | null;
  winner_id?: number | null;
  is_draw?: boolean;
  clear?: boolean;
  scheduled_at?: string;
  venue?: string;
  note?: string;
}

/**
 * 管理员-对阵图管理API
 */
export const adminBracketAPI = {
  /**
   * 分页获取当前届次的对阵表
   */
  getBrackets: async (params?: {
    page?: number;
    page_size?: number;
    keyword?: string;
  }): Promise<PaginatedResponse<Bracket[]>> => {
    return await callPaginatedApi(() => api.get("/admin/brackets", { params }));
  },

  /**
   * 获取对阵表完整数据
   */
  getBracket: async (id: number): Promise<ApiResponse<BracketDetail>> => {
    return await callApi(() => api.get(`/admin/brackets/${id}`));
  },

  createBracket: async (
    data: BracketRequest,
  ): Promise<ApiResponse<Bracket>> => {
    return await callApi(() => api.post("/admin/brackets", data));
  },

  updateBracket: async (
    id: number,
    data: BracketRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/brackets/${id}`, data));
  },

  deleteBracket: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/brackets/${id}`));
  },

  /**
   * 添加参赛方（班级 ID 或学生 ID，取决于对阵表的参赛方类型）
   */
  addParticipants: async (
    id: number,
    ids: number[],
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post(`/admin/brackets/${id}/participants`, { ids }),
    );
  },

  /**
   * 从关联比赛项目的报名中导入参赛方
   */
  importParticipants: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post(`/admin/brackets/${id}/participants/import`),
    );
  },

  removeParticipant: async (
    id: number,
    participantId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.delete(`/admin/brackets/${id}/participants/${participantId}`),
    );
  },

  /**
   * 保存种子顺序（order 为参赛方 ID 按种子排列）与分组
   */
  reorderParticipants: async (
    id: number,
    order: number[],
    groups?: Record<number, number>,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.put(`/admin/brackets/${id}/participants/order`, { order, groups }),
    );
  },

  autoGroup: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post(`/admin/brackets/${id}/participants/auto-group`),
    );
  },

  generate: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post(`/admin/brackets/${id}/generate`));
  },

  reset: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post(`/admin/brackets/${id}/reset`));
  },

  updateMatch: async (
    id: number,
    matchId: number,
    data: UpdateBracketMatchRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.put(`/admin/brackets/${id}/matches/${matchId}`, data),
    );
  },

  // 选择器数据源（同一权限下复用已有列表接口）
  getCompetitions: async (): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() => api.get("/admin/brackets/competitions"));
  },

  getClasses: async (params?: {
    keyword?: string;
  }): Promise<ApiResponse<Class[]>> => {
    return await callApi(() => api.get("/admin/brackets/classes", { params }));
  },

  getStudents: async (params?: {
    class_id?: number;
  }): Promise<ApiResponse<Student[]>> => {
    return await callApi(() => api.get("/admin/brackets/students", { params }));
  },
};
