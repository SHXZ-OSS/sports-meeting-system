import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

/** 开发服务器代理的后端地址，默认本地 Go 服务，可用 .env.local 的 VITE_BACKEND_URL 覆盖 */
const DEFAULT_BACKEND = "http://localhost:8080";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const backend = env.VITE_BACKEND_URL || DEFAULT_BACKEND;

  /** 代理到后端的公共配置 */
  const proxyToBackend = {
    target: backend,
    changeOrigin: true,
    secure: false,
  };

  return {
    plugins: [
      react(),
      // 仅在传入 --visualize 参数时生成依赖关系图
      ...(process.argv.includes("--visualize")
        ? [
            visualizer({
              open: true,
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
    build: {
      sourcemap: false,
      target: "es2018",
    },
    server: {
      proxy: {
        "/api": proxyToBackend,
        "/uploads": proxyToBackend,
      },
      port: 3000,
    },
  };
});
