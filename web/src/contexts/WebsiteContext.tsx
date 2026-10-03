import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { WebsiteInfo } from "../types";
import { publicAPI } from "../api/public";
import { handleRespWithoutNotify } from "../utils";

interface WebsiteContextType extends WebsiteInfo {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const defaultWebsiteInfo: WebsiteInfo = {
  name: "正在加载...",
  icp_beian: "",
  public_sec_beian: "",
  dingtalk_corp_id: "",
  domain: "",
  // 默认放开，待接口返回后按配置收敛
  allow_student_registration: true,
  allow_student_submission: true,
  oidc_enabled: false,
};

const WebsiteContext = createContext<WebsiteContextType | undefined>(undefined);

interface WebsiteProviderProps {
  children: ReactNode;
}

export const WebsiteProvider: React.FC<WebsiteProviderProps> = ({
  children,
}) => {
  const [websiteInfo, setWebsiteInfo] =
    useState<WebsiteInfo>(defaultWebsiteInfo);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWebsiteInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const info = await publicAPI.getWebsiteInfo();
      handleRespWithoutNotify(info, (data) => {
        setWebsiteInfo(data);
        // 更新页面标题
        document.title = data.name || "正在加载...";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取网站信息失败");
      // 发生错误时使用默认信息
      setWebsiteInfo(defaultWebsiteInfo);
      document.title = defaultWebsiteInfo.name;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 优先使用后端注入的初始数据，避免额外请求
    const injected = window.__INITIAL_DATA__?.website_info;
    if (injected?.name) {
      setWebsiteInfo((prev) => ({ ...prev, ...injected }));
      document.title = injected.name;
      setLoading(false);
      return;
    }
    fetchWebsiteInfo();
  }, []);

  const value: WebsiteContextType = {
    ...websiteInfo,
    loading,
    error,
    refresh: fetchWebsiteInfo,
  };

  return (
    <WebsiteContext.Provider value={value}>{children}</WebsiteContext.Provider>
  );
};

export const useWebsite = (): WebsiteContextType => {
  const context = useContext(WebsiteContext);
  if (context === undefined) {
    throw new Error("useWebsite must be used within a WebsiteProvider");
  }
  return context;
};
