/**
 * 设备性能检测工具
 */

export interface DevicePerformance {
  score: number; // 性能分数 0-100
  level: "low" | "medium" | "high"; // 性能等级
  details: {
    cores: number;
    gpu?: string;
    devicePixelRatio: number;
    screenResolution: number; // 像素总数
    gpuScore: number; // GPU 基准测试分数
  };
}

export type BackgroundEffectsPreference = "auto" | "enabled" | "disabled";

/**
 * GPU 性能基准测试
 * 通过实际渲染几何图形和执行计算来测试真实 GPU 性能
 */
async function gpuBenchmark(): Promise<number> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const gl = canvas.getContext("webgl");

    if (!gl) return resolve(0);

    // 创建顶点着色器
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return resolve(0);

    gl.shaderSource(
      vertexShader,
      `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `,
    );
    gl.compileShader(vertexShader);

    // 创建片段着色器（带复杂计算）
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) return resolve(0);

    gl.shaderSource(
      fragmentShader,
      `
      precision mediump float;
      uniform float time;
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(1920.0, 1080.0);
        float color = 0.0;
        // 添加一些计算密集型操作
        for (int i = 0; i < 20; i++) {
          color += sin(uv.x * float(i) + time) * cos(uv.y * float(i) + time);
        }
        gl_FragColor = vec4(vec3(color * 0.01), 1.0);
      }
    `,
    );
    gl.compileShader(fragmentShader);

    // 创建程序
    const program = gl.createProgram();
    if (!program) return resolve(0);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // 创建缓冲区
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const timeUniform = gl.getUniformLocation(program, "time");

    const start = performance.now();
    let frames = 0;

    function frame() {
      if (!gl) return;

      // 执行实际的渲染操作
      gl.uniform1f(timeUniform, frames * 0.1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.finish(); // 等待 GPU 完成渲染

      frames++;

      if (performance.now() - start < 200) {
        requestAnimationFrame(frame);
      } else {
        const elapsed = performance.now() - start;
        const fps = (frames / elapsed) * 1000;
        resolve(Math.round(fps)); // 返回 FPS
      }
    }

    frame();
  });
}

/**
 * 检测设备性能
 */
export async function detectDevicePerformance(): Promise<DevicePerformance> {
  // GPU 性能测试
  const gpuScore = await gpuBenchmark();

  const details = {
    cores: navigator.hardwareConcurrency || 2,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenResolution: window.screen.width * window.screen.height,
    gpuScore,
  };

  let score = 20; // 基础分

  // CPU 核心数评分 (0-25分)
  // 2核: +6, 4核: +12, 6核: +18, 8核: +24, 8核以上: +25
  score += Math.min(25, Math.floor(details.cores / 2) * 6);

  // GPU 性能评分 (0-50分) - 这是最重要的指标
  // 现代独显通常能跑到 60+ FPS，集显通常 20-40 FPS
  if (gpuScore >= 60)
    score += 50; // 高性能独显
  else if (gpuScore >= 40)
    score += 40; // 中端独显/高性能集显
  else if (gpuScore >= 25)
    score += 28; // 普通集显
  else if (gpuScore >= 15)
    score += 18; // 低性能集显
  else score += 8; // 极弱 GPU

  // 屏幕分辨率影响 (0到-15分)
  // 高分辨率会增加渲染负担
  const megapixels = details.screenResolution / 1_000_000;
  if (megapixels > 8)
    score -= 15; // 4K 以上
  else if (megapixels > 4)
    score -= 10; // 2K-4K
  else if (megapixels > 2.5) score -= 5; // 1440p

  // 高 DPI 屏幕额外影响
  if (details.devicePixelRatio >= 3) score -= 5;
  else if (details.devicePixelRatio >= 2) score -= 3;

  // 限制范围
  score = Math.max(0, Math.min(100, score));

  let level: "low" | "medium" | "high";
  if (score >= 70)
    level = "high"; // 高性能设备
  else if (score >= 45)
    level = "medium"; // 中等性能
  else level = "low"; // 低性能

  console.log("设备性能检测结果:", { score, level, details });

  return { score, level, details };
}

/**
 * 本地存储键名
 */
const STORAGE_KEY = "background_effects_disabled";

/**
 * 检查背景特效是否被禁用
 */
export function isBackgroundEffectsDisabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * 设置背景特效开关状态
 */
export function setBackgroundEffectsDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn("无法保存背景特效设置:", e);
  }
}

/**
 * 切换背景特效状态
 */
export function toggleBackgroundEffects(): boolean {
  const current = isBackgroundEffectsDisabled();
  setBackgroundEffectsDisabled(!current);
  return !current;
}

/**
 * 判断是否应该启用背景特效
 * 考虑性能和用户设置
 */
export async function shouldEnableBackgroundEffects(
  preference: BackgroundEffectsPreference = isBackgroundEffectsDisabled()
    ? "disabled"
    : "auto",
): Promise<boolean> {
  if (preference === "enabled") {
    return true;
  }

  // 如果用户明确禁用，则返回 false
  if (preference === "disabled") {
    return false;
  }

  // 检测设备性能
  const performance = await detectDevicePerformance();

  // 只有性能良好（medium 及以上）才启用
  return performance.level === "high" || performance.level === "medium";
}
