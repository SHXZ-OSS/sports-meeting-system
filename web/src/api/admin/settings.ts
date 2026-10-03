import { api, callApi } from "../config";
import { ApiResponse } from "../../types";

export interface SystemSettings {
  dingtalk: {
    app_key: string;
    app_secret: string;
    agent_id: string;
    corp_id: string;
  };
  website: {
    name: string;
    icp_beian: string;
    public_sec_beian: string;
    domain: string;
    logo_url: string;
  };
  competition: {
    submission_start_time: string;
    submission_end_time: string;
    voting_start_time: string;
    voting_end_time: string;
    registration_start_time: string;
    registration_end_time: string;
    max_registrations_per_person: number;
  };
  dashboard: {
    enabled: boolean;
  };
  scoring: {
    team_points_mapping: Record<string, number>;
    individual_points_mapping: Record<string, number>;
  };
}

export interface UpdateSettingsRequest {
  dingtalk?: {
    app_key?: string;
    app_secret?: string;
    agent_id?: string;
    corp_id?: string;
  };
  website?: {
    name?: string;
    icp_beian?: string;
    public_sec_beian?: string;
    domain?: string;
  };
  competition?: {
    submission_start_time?: string;
    submission_end_time?: string;
    voting_start_time?: string;
    voting_end_time?: string;
    registration_start_time?: string;
    registration_end_time?: string;
  };
  scoring?: {
    team_points_mapping?: Record<string, number>;
    individual_points_mapping?: Record<string, number>;
  };
}

export interface Event {
  id: number;
  name: string;
}

export interface EventListResponse {
  list: Event[];
  current_event_id: number;
}

export interface CreateEventRequest {
  name: string;
}

export interface UpdateEventRequest {
  name: string;
}

/**
 * 管理员-系统设置API
 */
export const adminSettingsAPI = {
  /**
   * 获取系统设置
   */
  getSettings: async (): Promise<ApiResponse<SystemSettings>> => {
    return await callApi(() => api.get("/admin/settings"));
  },

  /**
   * 上传自定义 logo（Base64 图片）
   */
  uploadLogo: async (
    image: string,
  ): Promise<ApiResponse<{ logo_url: string }>> => {
    return await callApi(() => api.post("/admin/settings/logo", { image }));
  },

  /**
   * 更新系统设置
   */
  updateSettings: async (
    data: UpdateSettingsRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put("/admin/settings", data));
  },

  /**
   * 获取运动会届次列表
   */
  getEvents: async (): Promise<ApiResponse<EventListResponse>> => {
    return await callApi(() => api.get("/admin/settings/events"));
  },

  /**
   * 创建运动会届次
   */
  createEvent: async (
    data: CreateEventRequest,
  ): Promise<ApiResponse<Event>> => {
    return await callApi(() => api.post("/admin/settings/events", data));
  },

  /**
   * 更新运动会届次
   */
  updateEvent: async (
    id: number,
    data: UpdateEventRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/settings/events/${id}`, data));
  },

  /**
   * 删除运动会届次
   */
  deleteEvent: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/settings/events/${id}`));
  },

  /**
   * 切换当前运动会届次
   */
  switchEvent: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post(`/admin/settings/events/${id}/switch`));
  },
};
