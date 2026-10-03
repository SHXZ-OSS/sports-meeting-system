import { api, callApi, callPaginatedApi } from "../config";
import { Student, Class, ApiResponse, PaginatedResponse } from "../../types";

export interface CreateStudentRequest {
  full_name: string;
  class_name: string;
  gender: number;
  dingtalk_id?: string;
  username?: string; // 预定义用户名；留空自动生成
}

export interface UpdateStudentRequest {
  full_name?: string;
  class_name?: string;
  gender?: number;
  dingtalk_id?: string;
}

export interface CreateClassRequest {
  name: string;
}

export interface UpdateClassRequest {
  name: string;
}

/**
 * 管理员-学生管理API
 */
export const adminStudentAPI = {
  /**
   * 获取所有学生（支持分页和筛选）
   */
  getStudents: async (params?: {
    page?: number;
    page_size?: number;
    class_id?: number;
  }): Promise<PaginatedResponse<Student[]>> => {
    return await callPaginatedApi(() => api.get("/admin/students", { params }));
  },

  /**
   * 获取学生详情
   */
  getStudent: async (id: number): Promise<ApiResponse<Student>> => {
    return await callApi(() => api.get(`/admin/students/${id}`));
  },

  /**
   * 创建学生
   */
  createStudent: async (
    data: CreateStudentRequest,
  ): Promise<ApiResponse<{ student: Student; password: string }>> => {
    return await callApi(() => api.post("/admin/students", data));
  },

  /**
   * 更新学生
   */
  updateStudent: async (
    id: number,
    data: UpdateStudentRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/students/${id}`, data));
  },

  /**
   * 删除学生
   */
  deleteStudent: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/students/${id}`));
  },

  /**
   * 重置学生密码
   */
  resetStudentPassword: async (
    id: number,
  ): Promise<ApiResponse<{ new_password: string }>> => {
    return await callApi(() =>
      api.post(`/admin/students/${id}/reset_password`),
    );
  },
};

/**
 * 管理员-班级管理API
 */
export const adminClassAPI = {
  /**
   * 获取所有班级（支持分页和筛选）
   */
  getClasses: async (params?: {
    page?: number;
    page_size?: number;
    name?: string;
  }): Promise<PaginatedResponse<Class[]>> => {
    return await callPaginatedApi(() => api.get("/admin/classes", { params }));
  },

  /**
   * 获取班级详情
   */
  getClass: async (id: number): Promise<ApiResponse<Class>> => {
    return await callApi(() => api.get(`/admin/classes/${id}`));
  },

  /**
   * 创建班级
   */
  createClass: async (data: CreateClassRequest): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/classes", data));
  },

  /**
   * 更新班级
   */
  updateClass: async (
    id: number,
    data: UpdateClassRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.put(`/admin/classes/${id}`, data));
  },

  /**
   * 删除班级
   */
  deleteClass: async (id: number): Promise<ApiResponse<void>> => {
    return await callApi(() => api.delete(`/admin/classes/${id}`));
  },
};
