import { api, callApi, callPaginatedApi } from "../config";
import {
  Registration,
  Student,
  Class,
  ApiResponse,
  PaginatedResponse,
  Competition,
} from "../../types";

export interface AdminRegisterRequest {
  student_id: number;
  competition_id: number;
}

export interface AdminUnregisterRequest {
  student_id: number;
}

/**
 * 管理员-报名管理API
 */
export const adminRegistrationAPI = {
  /**
   * 对单个已报名学生发送检录提醒
   */
  remindStudent: async (
    competitionId: number,
    studentId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.post("/admin/registrations/remind", {
        competition_id: competitionId,
        student_id: studentId,
      }),
    );
  },

  /**
   * 获取所有比赛项目（用于报名管理）
   */
  getCompetitions: async (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    sort_by?: "name" | "votes";
  }): Promise<PaginatedResponse<Competition[]>> => {
    return await callPaginatedApi(() =>
      api.get("/admin/registrations/competitions", { params }),
    );
  },

  /**
   * 获取比赛报名学生列表
   */
  getCompetitionRegistrations: async (
    id: number,
  ): Promise<ApiResponse<Registration[]>> => {
    return await callApi(() =>
      api.get(`/admin/registrations/competitions/${id}/registrations`),
    );
  },

  /**
   * 获取学生列表（用于报名管理）
   */
  getStudents: async (params?: {
    page?: number;
    page_size?: number;
    class_id?: number;
  }): Promise<PaginatedResponse<Student[]>> => {
    return await callPaginatedApi(() =>
      api.get("/admin/registrations/students", { params }),
    );
  },

  /**
   * 获取班级列表（用于报名管理）
   */
  getClasses: async (): Promise<ApiResponse<Class[]>> => {
    return await callApi(() => api.get("/admin/registrations/classes"));
  },

  /**
   * 管理员替学生报名
   */
  registerStudent: async (
    data: AdminRegisterRequest,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() => api.post("/admin/registrations/register", data));
  },

  /**
   * 管理员替学生取消报名
   */
  unregisterStudent: async (
    competitionId: number,
    studentId: number,
  ): Promise<ApiResponse<void>> => {
    return await callApi(() =>
      api.delete(`/admin/registrations/unregister/${competitionId}`, {
        data: { student_id: studentId },
      }),
    );
  },

  /**
   * 获取项目检查清单
   */
  getCompetitionChecklist: async (): Promise<
    ApiResponse<
      Array<{
        competition_id: number;
        competition_name: string;
        status: "ok" | "warning" | "error";
        message: string;
      }>
    >
  > => {
    return await callApi(() => api.get("/admin/registrations/checklist"));
  },
};
