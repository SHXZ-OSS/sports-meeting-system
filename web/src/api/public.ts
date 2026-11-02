import { publicApi, callApi } from "./config";
import {
  WebsiteInfo,
  Competition,
  Score,
  Statistics,
  ApiResponse,
  Registration,
} from "../types";

/**
 * 公共API - 游客可访问
 */
export const publicAPI = {
  /**
   * 获取网站信息
   */
  getWebsiteInfo: async (): Promise<ApiResponse<WebsiteInfo>> => {
    return await callApi(() => publicApi.get("/website_info"));
  },

  /**
   * 获取所有比赛项目（公共）
   */
  getCompetitions: async (params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<ApiResponse<Competition[]>> => {
    return await callApi(() => publicApi.get("/competitions", { params }));
  },

  /**
   * 获取比赛详情（公共）
   */
  getCompetition: async (id: number): Promise<ApiResponse<Competition>> => {
    return await callApi(() => publicApi.get(`/competitions/${id}`));
  },

  /**
   * 获取比赛成绩（公共）
   */
  getCompetitionScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => publicApi.get(`/competitions/${id}/scores`));
  },

  /**
   * 获取报名该比赛的学生名单（公共）
   */
  getCompetitionRegistrations: async (
    id: number,
  ): Promise<ApiResponse<Registration[]>> => {
    return await callApi(() =>
      publicApi.get(`/competitions/${id}/registrations`),
    );
  },

  /**
   * 获取学生成绩（公共）
   */
  getStudentScores: async (id: number): Promise<ApiResponse<Score[]>> => {
    return await callApi(() => publicApi.get(`/scores/student/${id}`));
  },

  /**
   * 获取数据看板统计信息（公共）
   */
  getStatistics: async (
    etag?: string,
  ): Promise<
    ApiResponse<Statistics> & { etag?: string; notModified?: boolean }
  > => {
    const headers: Record<string, string> = {};
    if (etag) {
      headers["If-None-Match"] = etag;
    }

    try {
      const response = await publicApi.get("/statistics", {
        headers,
        validateStatus: (status) => status === 200 || status === 304,
      });

      // 304 Not Modified - 数据未改变
      if (response.status === 304) {
        return {
          code: 304,
          message: "Not Modified",
          data: null as unknown as Statistics,
          etag: response.headers["etag"],
          notModified: true,
        };
      }

      // 非 JSON 响应：原样返回，由 handleResp 的运行时判断渲染原始内容
      if (typeof response.data !== "object" || response.data === null) {
        return response.data;
      }

      // 200 OK - 返回新数据和 ETag
      return {
        ...response.data,
        etag: response.headers["etag"],
        notModified: false,
      };
    } catch {
      // 处理错误情况，fallback到原先callApi的错误处理逻辑
      return await callApi(() => publicApi.get("/statistics"));
    }
  },

  /**
   * 获取班级得分明细（公共）
   */
  getClassPointDetails: async (
    classId: number,
  ): Promise<ApiResponse<any[]>> => {
    return await callApi(() =>
      publicApi.get(`/points/classes/${classId}/details`),
    );
  },

  /**
   * 获取学生得分明细（公共）
   */
  getStudentPointDetails: async (
    studentId: number,
  ): Promise<ApiResponse<any[]>> => {
    return await callApi(() =>
      publicApi.get(`/points/students/${studentId}/details`),
    );
  },
};
