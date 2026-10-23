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
    gpuScore: number; // GPU 基准有效帧率（按实际绘制耗时折算）
  };
}

export type BackgroundEffectsPreference = "auto" | "enabled" | "disabled";

interface GpuBenchmarkResult {
  fps: number;
  gpu?: string;
}

/**
 * GPU 性能基准测试
 * 按真实渲染尺寸和 GPU 实际绘制耗时测，排除软件渲染和编译失败的假高分。
 */
async function gpuBenchmark(): Promise<GpuBenchmarkResult> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    // 与 StadiumScene 的像素比上限保持一致，按真实视口尺寸测。
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.min(
      3840,
      Math.max(1, Math.round(window.innerWidth * scale)),
    );
    canvas.height = Math.min(
      2160,
      Math.max(1, Math.round(window.innerHeight * scale)),
    );
    const contextOptions: WebGLContextAttributes = {
      antialias: true,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "low-power",
    };
    const gl =
      canvas.getContext("webgl2", contextOptions) ??
      canvas.getContext("webgl", contextOptions);

    if (!gl) return resolve({ fps: 0 });

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "")
      : "";
    // 软件渲染（SwiftShader / llvmpipe / Basic Render）直接判为不可用。
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) {
      return resolve({ fps: 0, gpu });
    }

    // 创建顶点着色器
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return resolve({ fps: 0, gpu: gpu || undefined });

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
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      return resolve({ fps: 0, gpu: gpu || undefined });
    }

    // 创建片段着色器（带复杂计算）
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) return resolve({ fps: 0, gpu: gpu || undefined });

    gl.shaderSource(
      fragmentShader,
      `
      precision mediump float;
      uniform float time;
      uniform vec2 u_resolution;
      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
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
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      return resolve({ fps: 0, gpu: gpu || undefined });
    }

    // 创建程序
    const program = gl.createProgram();
    if (!program) return resolve({ fps: 0, gpu: gpu || undefined });

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return resolve({ fps: 0, gpu: gpu || undefined });
    }
    gl.useProgram(program);

    // 创建缓冲区
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "position");
    if (position < 0) return resolve({ fps: 0, gpu: gpu || undefined });
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const timeUniform = gl.getUniformLocation(program, "time");
    const resolutionUniform = gl.getUniformLocation(program, "u_resolution");
    if (timeUniform === null || resolutionUniform === null) {
      return resolve({ fps: 0, gpu: gpu || undefined });
    }
    gl.uniform2f(resolutionUniform, canvas.width, canvas.height);

    // 预热一帧，避免首次绘制/驱动编译污染后面的耗时均值。
    gl.uniform1f(timeUniform, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();

    const start = performance.now();
    let frames = 0;
    let totalDrawMs = 0;

    function frame() {
      if (!gl) return;

      // 计时 GPU 实际绘制耗时，避免被屏幕刷新率（30Hz/60Hz）截断。
      const drawStart = performance.now();
      gl.uniform1f(timeUniform, frames * 0.1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.finish(); // 等待 GPU 完成渲染
      totalDrawMs += performance.now() - drawStart;

      frames++;

      if (performance.now() - start < 200) {
        requestAnimationFrame(frame);
      } else {
        const avgDrawMs = frames > 0 ? totalDrawMs / frames : 0;
        // 计时精度可能把极快的绘制记成 0ms，按最高档处理；上限 240 防止日志离谱。
        const fps =
          frames > 0
            ? avgDrawMs > 0
              ? Math.min(240, 1000 / avgDrawMs)
              : 240
            : 0;
        resolve({ fps: Math.round(fps), gpu: gpu || undefined });
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
  const benchmark = await gpuBenchmark();
  const gpuScore = benchmark.fps;

  const details = {
    cores: navigator.hardwareConcurrency || 2,
    gpu: benchmark.gpu,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenResolution: window.screen.width * window.screen.height,
    gpuScore,
  };

  // GPU 是硬门槛：核数只用于排除双核弱机，不能把弱 GPU 抬过线。
  // 分辨率/DPR 已经体现在基准的绘制缓冲区尺寸里，不再重复扣分。
  let level: "low" | "medium" | "high";
  if (gpuScore >= 55 && details.cores >= 4) {
    level = "high";
  } else if (gpuScore >= 45 && details.cores >= 4) {
    level = "medium";
  } else {
    level = "low";
  }

  // 分数只用于日志，和 level 保持一致的量级。
  let score = Math.round((Math.min(gpuScore, 60) / 60) * 80);
  score += Math.min(20, Math.floor(details.cores / 2) * 3);
  score = Math.max(0, Math.min(100, score));
  if (level === "low") score = Math.min(score, 35);
  else if (level === "medium") score = Math.min(score, 65);
  else score = Math.max(score, 70);

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
