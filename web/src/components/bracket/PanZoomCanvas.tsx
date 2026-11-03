import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import {
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import "./PanZoomCanvas.css";

/**
 * 可拖动 / 缩放的对阵图画布：对应 RM Schedule MatchGraph 中 relation-graph 的画布。
 * - 默认缩放到适应视口（zoomToFit），最大 100%
 * - 鼠标在空白处拖动平移（从队伍行 / 按钮开始不拖动）；触控可从任意位置拖动
 * - Ctrl / ⌘ + 滚轮以指针为中心缩放；右侧工具栏：全屏、放大、百分比、缩小、复位
 * - 画布获得焦点时方向键平移，+ / - 缩放，0 复位
 */

interface PanZoomCanvasProps {
  // 导出图片的文件名（不含扩展名）
  exportName?: string;
  children: React.ReactNode;
  label: string;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  // 开始拖动 / 缩放：用于关闭比赛菜单（菜单按节点定位，画布移动后会错位）
  onInteract?: () => void;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.1;
const PAN_STEP = 60;
const DRAG_SLOP = 4;
const MIN_HEIGHT = 360;
// 适应视口时四周留白
const PAD = 16;
// 右侧工具栏占位（适应视口时内容不压在工具栏下）
const TOOLBAR_SPACE = 56;
// 平移时至少保留在视口内的内容尺寸
const KEEP_VISIBLE = 80;

// 鼠标从这些元素上按下时不拖动画布（保留点击选中 / 打开菜单）
const NO_PAN_SELECTOR =
  ".is-selectable, button, a, input, select, textarea, [role='button'], [role='tab']";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const PanZoomCanvas = ({
  children,
  label,
  fullscreen,
  canFullscreen,
  onToggleFullscreen,
  onInteract,
  exportName = "对阵图",
}: PanZoomCanvasProps) => {
  const [exporting, setExporting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [content, setContent] = useState({ w: 0, h: 0 });
  // 非全屏时视口的最大高度：窗口底部以上的可用空间
  const [maxHeight, setMaxHeight] = useState(MIN_HEIGHT);
  // 用户手动平移 / 缩放后的视图；为空时始终适应视口
  const [manual, setManual] = useState<View | null>(null);
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    if (!vp || !ct) return;
    const measure = () => {
      setViewport({ w: vp.clientWidth, h: vp.clientHeight });
      // offsetWidth / offsetHeight 不受 transform 影响
      setContent({ w: ct.offsetWidth, h: ct.offsetHeight });
      const top = vp.getBoundingClientRect().top + window.scrollY;
      // 同 RM：画布铺满到窗口底部；页面较下方时至少占视口 75%
      setMaxHeight(
        Math.max(
          MIN_HEIGHT,
          window.innerHeight * 0.75,
          window.innerHeight - top - 12,
        ),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    ro.observe(ct);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 适应视口：宽度优先，高度不超过可用空间；不放大到 100% 以上
  const fit = useMemo(() => {
    const cw = Math.max(1, content.w);
    const ch = Math.max(1, content.h);
    const availW = Math.max(1, viewport.w - PAD * 2 - TOOLBAR_SPACE);
    const availH = Math.max(1, (fullscreen ? viewport.h : maxHeight) - PAD * 2);
    const scale = clamp(Math.min(1, availW / cw, availH / ch), MIN_SCALE, 1);
    // 高度固定为可用空间，不随内容缩小（RM 的画布始终占满视口）
    const height = fullscreen ? viewport.h : maxHeight;
    return {
      height,
      view: {
        scale,
        x: Math.max(PAD, (viewport.w - TOOLBAR_SPACE - cw * scale) / 2),
        y: Math.max(PAD, (height - ch * scale) / 2),
      },
    };
  }, [content, viewport, maxHeight, fullscreen]);

  const view = manual ?? fit.view;
  const viewRef = useRef(view);
  const sizeRef = useRef({ content, viewport, height: fit.height });
  useEffect(() => {
    viewRef.current = view;
    sizeRef.current = { content, viewport, height: fit.height };
  });

  const clampView = (v: View): View => {
    const { content: c, viewport: vp, height } = sizeRef.current;
    const w = c.w * v.scale;
    const h = c.h * v.scale;
    const keepX = Math.min(KEEP_VISIBLE, w);
    const keepY = Math.min(KEEP_VISIBLE, h);
    return {
      scale: v.scale,
      x: clamp(v.x, keepX - w, vp.w - keepX),
      y: clamp(v.y, keepY - h, height - keepY),
    };
  };

  // 以视口内 (px, py) 为中心缩放
  const zoomAt = (next: number, px: number, py: number, animated: boolean) => {
    const cur = viewRef.current;
    const scale = clamp(next, MIN_SCALE, MAX_SCALE);
    const k = scale / cur.scale;
    setAnimate(animated);
    setManual(
      clampView({ scale, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k }),
    );
  };
  const zoomBy = (delta: number) => {
    const cur = viewRef.current.scale;
    // 按 10% 刻度对齐：71% → 80% → 90%
    const next =
      delta > 0
        ? Math.floor(cur * 10 + 1e-6) / 10 + ZOOM_STEP
        : Math.ceil(cur * 10 - 1e-6) / 10 - ZOOM_STEP;
    const { viewport: vp, height } = sizeRef.current;
    zoomAt(next, vp.w / 2, height / 2, true);
    onInteract?.();
  };
  const panBy = (dx: number, dy: number) => {
    const cur = viewRef.current;
    setAnimate(true);
    setManual(clampView({ ...cur, x: cur.x + dx, y: cur.y + dy }));
    onInteract?.();
  };
  const reset = () => {
    setAnimate(true);
    setManual(null);
    onInteract?.();
  };

  // Ctrl / ⌘ + 滚轮缩放：需要非 passive 监听才能阻止浏览器页面缩放
  const wheelRef = useRef<(e: WheelEvent) => void>(() => undefined);
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(
        viewRef.current.scale * Math.exp(-e.deltaY * 0.0015),
        e.clientX - rect.left,
        e.clientY - rect.top,
        false,
      );
      onInteract?.();
    };
  });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ==== 拖动平移 ====
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  // 拖动结束后紧随的 click 不再触发选中 / 菜单
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest(".pzc-toolbar")) return;
    if (e.pointerType === "mouse" && target.closest(NO_PAN_SELECTOR)) return;
    const cur = viewRef.current;
    drag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: cur.x,
      oy: cur.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      onInteract?.();
    }
    setAnimate(false);
    setManual(
      clampView({ scale: viewRef.current.scale, x: d.ox + dx, y: d.oy + dy }),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) suppressClick.current = true;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        panBy(PAN_STEP, 0);
        break;
      case "ArrowRight":
        panBy(-PAN_STEP, 0);
        break;
      case "ArrowUp":
        panBy(0, PAN_STEP);
        break;
      case "ArrowDown":
        panBy(0, -PAN_STEP);
        break;
      case "+":
      case "=":
        zoomBy(1);
        break;
      case "-":
      case "_":
        zoomBy(-1);
        break;
      case "0":
        reset();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const percent = `${Math.round(view.scale * 100)}%`;

  // 导出 PNG（同 RM 的 relation-graph 下载：完整画布、2 倍分辨率、透明背景）
  const exportImage = async () => {
    const ct = contentRef.current;
    if (!ct || exporting) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      // 四周留白，避免斜切横幅等溢出内容被裁掉
      const margin = 40;
      const width = ct.scrollWidth + margin * 2;
      const height = ct.scrollHeight + margin * 2;
      const canvas = await html2canvas(ct, {
        // 透明背景，便于贴到海报或其他底图上
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        // 克隆节点去掉平移缩放，按原始尺寸完整截取
        onclone: (_doc, el) => {
          el.style.transform = "none";
          el.style.visibility = "visible";
          el.style.padding = `${margin}px`;
          el.style.boxSizing = "content-box";
          el.style.overflow = "visible";
        },
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("生成图片失败");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportName}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error("导出图片失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={["pzc", fullscreen ? "is-fullscreen" : ""].join(" ")}
      style={fullscreen ? undefined : { height: fit.height }}
    >
      <div
        ref={viewportRef}
        className={["pzc-viewport", dragging ? "is-dragging" : ""].join(" ")}
        role="region"
        aria-label={`${label}。方向键平移，加号 / 减号缩放，0 复位`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div
          ref={contentRef}
          className={["pzc-content", animate ? "is-animated" : ""].join(" ")}
          style={{
            // 平移取整像素，避免亚像素偏移导致文字边缘模糊
            transform: `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.scale})`,
            // 首次测量前隐藏，避免以错误缩放闪一下
            visibility: viewport.w > 0 ? undefined : "hidden",
          }}
        >
          {children}
        </div>
      </div>

      {/* relation-graph .rel-toolbar */}
      <div className="pzc-toolbar" role="toolbar" aria-label="画布缩放">
        {canFullscreen && (
          <button
            type="button"
            className="pzc-btn"
            aria-label={fullscreen ? "退出全屏" : "全屏"}
            title={fullscreen ? "退出全屏" : "全屏"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
        )}
        <button
          type="button"
          className="pzc-btn"
          aria-label="放大"
          title="放大"
          disabled={view.scale >= MAX_SCALE - 1e-6}
          onClick={() => zoomBy(1)}
        >
          <ZoomInOutlined />
        </button>
        <span className="pzc-zoom-value" aria-live="polite">
          <span className="pzc-sr-only">当前缩放 </span>
          {percent}
        </span>
        <button
          type="button"
          className="pzc-btn"
          aria-label="缩小"
          title="缩小"
          disabled={view.scale <= MIN_SCALE + 1e-6}
          onClick={() => zoomBy(-1)}
        >
          <ZoomOutOutlined />
        </button>
        <button
          type="button"
          className="pzc-btn"
          aria-label="导出图片"
          title="导出图片"
          disabled={exporting}
          aria-busy={exporting}
          onClick={exportImage}
        >
          <DownloadOutlined />
        </button>
        <button
          type="button"
          className="pzc-btn"
          aria-label="复位（适应视口）"
          title="复位"
          onClick={reset}
        >
          <ReloadOutlined />
        </button>
      </div>
    </div>
  );
};

export default PanZoomCanvas;
