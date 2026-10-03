import { api, callApi, callPaginatedApi } from "../config";
import { User, ApiResponse, PaginatedResponse, Class } from "../../types";

export interface CreateUserRequest {
  username: string;
  password: string;
  full_name: string;
  permission: number;
  dingtalk_id?: string;
  class_id?: number; // 班级账号所属班级；空表示全局管理员
}

export interface UpdateUserRequest {
  full_name?: string;
  permission?: number;
  password?: string;
  dingtalk_id?: string;
  class_id?: number; // 班级账号所属班级；空表示全局管理员
}

/**
 * 管理员-用户管理API
 */
export const adminUserAPI = {
  /**
   * 获取所有用户（支持分页）
   */
  getUsers: async (params?: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<User[]>> => {
    return await callPaginatedApi(() => api.get("/admin/users", { params }));
  },

  /**
   * 获取用户详情
   */
  getUser: async (id: number): Promise<ApiResponse<User>> => {
    return await callApi(() => api.get(`/admin/users/${id}`));
  },

  /**
   * 创建用户
   */
  createUser: async (data: CreateUserRequest): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/users", data));
  },

  /**
   * 更新用户
   */
  updateUser: async (
    id: number,
    data: UpdateUserRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/users/${id}`, data));
  },

  /**
   * 删除用户
   */
  deleteUser: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/users/${id}`));
  },

  /**
   * 获取所有班级（用于设置班级scope）
   */
  getClasses: async (): Promise<ApiResponse<Class[]>> => {
    return await callApi(() => api.get("/admin/users/classes"));
  },
};
