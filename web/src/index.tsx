// 旧浏览器 polyfill（目标见 package.json 的 browserslist）
import "core-js/stable";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import React from "react";
import { setupDevTools } from "./utils/devSetup";

// 动态 import 的 chunk 加载失败时重载（发版后旧页面加载新 chunk 404 的场景）
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

// 开发环境工具集：路由日志 + 开发面板（vConsole / react-scan），生产构建自动跳过
setupDevTools();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Failed to find the root element");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
