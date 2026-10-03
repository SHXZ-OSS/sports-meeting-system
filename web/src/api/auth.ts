import { api, callApi } from "./config";
import { User, ApiResponse } from "../types";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface DingTalkLoginRequest {
  code: string;
}

/**
 * 认证相关API
 */
export const authAPI = {
  /**
   * 用户登录
   */
  login: async (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
    return await callApi(() => api.post("/login", data));
  },

  /**
   * 钉钉登录
   */
  dingTalkLogin: async (
    data: DingTalkLoginRequest,
  ): Promise<ApiResponse<LoginResponse>> => {
    return await callApi(() => api.post("/dingtalk/login", data));
  },
};

// 为了兼容性，导出单独的函数
export const login = authAPI.login;
export const dingTalkLogin = authAPI.dingTalkLogin;
