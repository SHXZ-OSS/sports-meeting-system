import { useEffect } from "react";
import { useWebsite } from "../contexts/WebsiteContext";

/**
 * 设置页面标题的 Hook
 * @param pageTitle 当前页面标题，如果为空则只显示网站名称
 * @param options.skip 为 true 时不修改标题，交由页面自身设置
 */
export function usePageTitle(pageTitle?: string, options?: { skip?: boolean }) {
  const { name: websiteName } = useWebsite();
  const skip = options?.skip ?? false;

  useEffect(() => {
    if (skip) return;

    if (pageTitle) {
      document.title = `${pageTitle} - ${websiteName}`;
    } else {
      document.title = websiteName;
    }

    // 组件卸载时恢复默认标题
    return () => {
      document.title = websiteName;
    };
  }, [pageTitle, websiteName, skip]);
}
