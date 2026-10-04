import { message, Modal } from "antd";
import React from "react";
import { ApiResponse, PaginatedResponse } from "../types";
import { BatchResult } from "../components/BatchResults";

// 全局的导航和登出函数，需要在应用启动时设置
let globalLogout: () => void = () => {};
let globalNavigate: (path: string) => void = () => {};

export const setGlobalHandlers = (
  logout: () => void,
  navigate: (path: string) => void,
) => {
  globalLogout = logout;
  globalNavigate = navigate;
};

/**
 * 统一处理API响应的核心函数
 */
const handleRespCore = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
  options: {
    auth?: boolean;
    notifyError?: boolean;
    notifySuccess?: boolean;
  } = {},
) => {
  const { auth = true, notifyError = true, notifySuccess = false } = options;

  // 检测到非 JSON 响应（HTML 错误页等），弹窗用 iframe srcdoc 渲染原始内容
  if (
    resp == null ||
    typeof resp === "string" ||
    (typeof resp === "object" &&
      !("code" in (resp as unknown as Record<string, unknown>)))
  ) {
    const raw =
      typeof resp === "string"
        ? resp
        : resp == null
          ? "响应为空"
          : JSON.stringify(resp, null, 2);
    Modal.info({
      title: "服务器返回异常",
      width: 900,
      icon: null,
      content: React.createElement("iframe", {
        srcDoc: raw,
        style: {
          width: "100%",
          height: "60vh",
          maxHeight: 640,
          border: "none",
          borderRadius: 8,
          background: "#fff",
        },
        sandbox: "allow-scripts",
        title: "错误详情",
      }),
    });
    fail?.("服务器返回异常", 500);
    return;
  }

  if (resp.code === 200) {
    if (notifySuccess && resp.message) {
      message.success(resp.message);
    }

    if (resp.data !== undefined) {
      // 检查是否是分页响应
      if ("total" in resp && "page" in resp && "size" in resp) {
        const paginatedResp = resp as PaginatedResponse<T>;
        success?.(resp.data, {
          page: paginatedResp.page,
          total: paginatedResp.total,
          size: paginatedResp.size,
        });
      } else {
        success?.(resp.data, {
          page: 0,
          total: resp.data instanceof Array ? resp.data.length : 1,
          size: 0,
        });
      }
    } else {
      // 没有data时也调用success回调，传入undefined作为data
      success?.(undefined as T, {
        page: 0,
        total: 0,
        size: 0,
      });
    }
  } else {
    if (notifyError && resp.message) {
      message.error(resp.message);
    }

    if (auth && resp.code === 401) {
      globalLogout();
      globalNavigate("/login");
      return;
    }

    fail?.(resp.message, resp.code);
  }
};

/**
 * 标准响应处理
 */
export const handleResp = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
) => {
  return handleRespCore(resp, success, fail, {
    auth: true,
    notifyError: true,
    notifySuccess: false,
  });
};

/**
 * 不显示通知的响应处理（用于看板等静默获取数据的场景）
 */
export const handleRespWithoutNotify = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
) => {
  return handleRespCore(resp, success, fail, {
    auth: true,
    notifyError: false,
    notifySuccess: false,
  });
};

/**
 * 不处理权限认证且不显示通知的响应处理
 */
export const handleRespWithoutAuthAndNotify = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
) => {
  return handleRespCore(resp, success, fail, {
    auth: false,
    notifyError: false,
    notifySuccess: false,
  });
};

/**
 * 显示成功通知的响应处理（用于创建、更新、删除等操作）
 */
export const handleRespWithNotifySuccess = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
) => {
  return handleRespCore(resp, success, fail, {
    auth: true,
    notifyError: true,
    notifySuccess: true,
  });
};

/**
 * 不处理权限认证但显示成功通知的响应处理
 */
export const handleRespWithoutAuthButNotifySuccess = <T>(
  resp: ApiResponse<T> | PaginatedResponse<T>,
  success?: (
    data: T,
    pagination?: { page: number; total: number; size: number },
  ) => void,
  fail?: (message: string, code: number) => void,
) => {
  return handleRespCore(resp, success, fail, {
    auth: false,
    notifyError: true,
    notifySuccess: true,
  });
};

export interface BatchRequestItem {
  id: number | string;
  name: string;
  request: () => Promise<unknown>;
}

export interface BatchResponseOptions {
  showResults?: boolean;
  onSuccess?: (results: BatchResult[]) => void;
  onComplete?: (results: BatchResult[]) => void;
  batchSize?: number; // 每批处理的数量，默认50
  delayBetweenBatches?: number; // 批次之间的延迟时间（毫秒），默认500ms
  onProgress?: (completed: number, total: number) => void; // 进度回调
}

/**
 * 处理批量请求并返回结果（支持分批处理）
 * @param items 批量请求项目列表
 * @param options 选项配置
 * @returns Promise<BatchResult[]>
 */
export const handleBatchResp = async (
  items: BatchRequestItem[],
  options: BatchResponseOptions = {},
): Promise<BatchResult[]> => {
  const { batchSize = 50, onProgress, onSuccess, onComplete } = options;

  const results: BatchResult[] = [];
  const totalItems = items.length;

  // 辅助函数：执行单个请求
  const executeRequest = async (
    item: BatchRequestItem,
  ): Promise<BatchResult> => {
    try {
      const response = await item.request();

      if (response && typeof response === "object" && "code" in response) {
        let hasError = false;
        let errorMessage = "请求失败";

        handleRespCore(
          response as ApiResponse<unknown>,
          undefined,
          (message) => {
            hasError = true;
            errorMessage = message;
          },
          {
            auth: true,
            notifyError: false,
            notifySuccess: false,
          },
        );

        if (hasError) {
          throw new Error(errorMessage || "请求失败");
        }
      }

      return {
        id: item.id,
        name: item.name,
        success: true,
      } as BatchResult;
    } catch (error) {
      return {
        id: item.id,
        name: item.name,
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      } as BatchResult;
    }
  };

  // 分批处理
  for (let i = 0; i < totalItems; i += batchSize) {
    // 获取当前批次的项目
    const batchItems = items.slice(i, Math.min(i + batchSize, totalItems));

    // 并行执行当前批次的所有请求
    const batchPromises = batchItems.map((item) => executeRequest(item));
    const batchResults = await Promise.allSettled(batchPromises);

    // 处理当前批次的结果
    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Promise.allSettled 捕获的错误
        const itemIndex = i + index;
        results.push({
          id: items[itemIndex].id,
          name: items[itemIndex].name,
          success: false,
          error:
            result.reason instanceof Error ? result.reason.message : "请求失败",
        });
      }
    });

    // 触发进度回调
    if (onProgress) {
      onProgress(results.length, totalItems);
    }
  }

  // 执行回调
  if (onSuccess) {
    const successResults = results.filter((r) => r.success);
    if (successResults.length > 0) {
      onSuccess(successResults);
    }
  }

  if (onComplete) {
    onComplete(results);
  }

  return results;
};
