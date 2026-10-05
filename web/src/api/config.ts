import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { ApiResponse, PaginatedResponse } from "../types";

// 创建axios实例
const createApiInstance = (baseURL = "/api"): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // 请求拦截器
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // 添加认证token
      const token = localStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );

  // 响应拦截器
  instance.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      // 直接返回响应，让 handleResp 来处理业务逻辑
      return response;
    },
    (error) => {
      // 只处理网络错误和HTTP错误
      if (error.response) {
        const { status, data } = error.response;
        const contentType: string =
          error.response.headers?.["content-type"] || "";
        if (typeof data === "string" || contentType.includes("text/html")) {
          return Promise.resolve({ ...error.response, data });
        }
        // 返回标准的错误响应格式
        return Promise.resolve({
          ...error.response,
          data: {
            code: status,
            message: data?.message || `请求失败 (${status})`,
            data: null,
          },
        });
      } else if (error.request) {
        // 网络错误
        return Promise.resolve({
          data: {
            code: 0,
            message: "网络连接失败，请检查网络",
            data: null,
          },
        });
      } else {
        // 其他错误
        return Promise.resolve({
          data: {
            code: 0,
            message: error.message || "未知错误",
            data: null,
          },
        });
      }
    },
  );

  return instance;
};

// 创建API实例
export const api = createApiInstance();
export const publicApi = createApiInstance("/api/public");

// API调用工具函数 - 普通响应
export const callApi = async <T>(
  apiCall: () => Promise<AxiosResponse<ApiResponse<T>>>,
): Promise<ApiResponse<T>> => {
  const response = await apiCall();
  return response.data;
};

// API调用工具函数 - 分页响应
export const callPaginatedApi = async <T>(
  apiCall: () => Promise<AxiosResponse<PaginatedResponse<T>>>,
): Promise<PaginatedResponse<T>> => {
  const response = await apiCall();
  return response.data;
};
