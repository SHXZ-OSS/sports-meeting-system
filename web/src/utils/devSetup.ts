import { devLog } from "./devLogger";

let vconsoleInstance: { destroy: () => void } | null = null;

export const isVConsoleActive = (): boolean => vconsoleInstance !== null;

/** 开关 vConsole 调试台（DevPanel 面板控制） */
export const toggleVConsole = async (enabled: boolean): Promise<void> => {
  if (enabled && !vconsoleInstance) {
    const { default: VConsole } = await import("vconsole");
    vconsoleInstance = new VConsole();
    devLog("[dev] vConsole 已开启");
  } else if (!enabled && vconsoleInstance) {
    vconsoleInstance.destroy();
    vconsoleInstance = null;
    devLog("[dev] vConsole 已关闭");
  }
};

let reactScanLoaded = false;
let reactScanEnabled = false;

export const isReactScanActive = (): boolean => reactScanEnabled;

/** 开关 react-scan 重渲染可视化（DevPanel 面板控制） */
export const toggleReactScan = async (enabled: boolean): Promise<void> => {
  if (enabled === reactScanEnabled) return;
  const { scan, setOptions } = await import("react-scan");
  if (enabled) {
    if (!reactScanLoaded) {
      scan({ enabled: true });
      reactScanLoaded = true;
    }
    setOptions({ enabled: true });
    reactScanEnabled = true;
    devLog("[dev] react-scan 已开启");
  } else {
    setOptions({ enabled: false });
    reactScanEnabled = false;
    devLog("[dev] react-scan 已关闭");
  }
};

export const setupDevTools = (): void => {
  if (!import.meta.env.DEV) return;

  // 路由跳转日志（含浏览器前进/后退）
  const logRoute = (verb: string) =>
    devLog("[route]", verb, `${location.pathname}${location.search}`);
  const origPush = history.pushState.bind(history);
  history.pushState = (...args) => {
    const result = origPush(...args);
    logRoute("→");
    return result;
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    const result = origReplace(...args);
    logRoute("⇢");
    return result;
  };
  window.addEventListener("popstate", () => logRoute("←"));

  // 开发面板
  void import("../components/dev/DevPanel").then((m) => m.default());

  devLog("[dev] 欢迎开发 上海市行知中学运动会系统！Enjoy! 🚀");
};
