import { useLayoutEffect, useRef, useState } from "react";
import championImg from "../../assets/rm/champion.png";
import "./RoundPicker.css";

/**
 * 轮次选择器：移植 RM Schedule 的 StageRangeSelector。
 * 轨道内每格为一轮的缩略图（横条数 = 比赛场数 / 决赛奖杯 / 晋级旗），
 * 白色括号形选区覆盖相邻的 span 轮，对阵图只显示这几轮。
 * 拖动选区、点击 ‹ › 或点击任意一轮切换；聚焦轨道后方向键切换。
 */

export interface RoundStage {
  label: string;
  // 横条数（本轮比赛数）/ 冠军奖杯 / 结果（晋级）
  icon: number | "trophy" | "result";
}

interface RoundPickerProps {
  stages: RoundStage[];
  start: number;
  span: number;
  onChange: (start: number) => void;
}

// 与 RM stage_label_layout 一致：按赛制语义断成两行
const LABEL_SUFFIXES = [
  "第一轮",
  "第二轮",
  "第三轮",
  "第四轮",
  "第五轮",
  "第六轮",
  "胜者组",
  "败者组",
  "决赛",
];

const splitLabel = (label: string, maxChars: number): string[] => {
  if (label.length <= maxChars) return [label];
  for (const suffix of LABEL_SUFFIXES) {
    if (label.endsWith(suffix) && label.length > suffix.length) {
      return [label.slice(0, -suffix.length), suffix];
    }
  }
  const mid = Math.ceil(label.length / 2);
  return [label.slice(0, mid), label.slice(mid)];
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const Bars = ({ count }: { count: number }) => {
  const cols = count >= 8 ? 2 : 1;
  const rows = Math.ceil(Math.max(count, 1) / cols);
  const className = [
    "rp-bars",
    count <= 4 && cols === 1 ? "is-thick" : "",
    rows > 6 && rows <= 8 ? "is-thin" : "",
    rows > 8 ? "is-xthin" : "",
    cols > 1 ? "is-cols" : "",
    cols > 1 && rows <= 5 ? "is-roomy" : "",
  ].join(" ");
  // 太多时只画前 16 条，并叠加数字
  const shown = Math.min(count, 16);
  return (
    <div
      className={className}
      style={{ "--bar-rows": Math.ceil(shown / cols) } as React.CSSProperties}
    >
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="rp-bar" />
      ))}
      {count > 8 && <span className="rp-count">{count}</span>}
    </div>
  );
};

const RoundPicker = ({ stages, start, span, onChange }: RoundPickerProps) => {
  const n = stages.length;
  const width = Math.min(span, n);
  const maxStart = Math.max(0, n - width);
  const cur = clamp(start, 0, maxStart);
  const trackRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // 拖动中的选区左边缘（以格为单位，允许小数）
  const [dragLeft, setDragLeft] = useState<number | null>(null);
  const [maxChars, setMaxChars] = useState(8);
  const drag = useRef<{
    id: number;
    sx: number;
    origin: number;
    moved: boolean;
  } | null>(null);

  // 按每格宽度决定标签折行（约 13px 一个字）
  useLayoutEffect(() => {
    const el = labelsRef.current;
    if (!el || n === 0) return;
    const measure = () =>
      setMaxChars(Math.max(2, Math.floor(el.clientWidth / n / 13.5)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  const cellWidth = () => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect && n > 0 ? rect.width / n : 0;
  };
  const indexAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp(
      Math.floor(((clientX - rect.left) / rect.width) * n),
      0,
      n - 1,
    );
  };
  // 点击某一轮：以它为起点（末端贴边时左移）
  const selectAt = (index: number) => onChange(clamp(index, 0, maxStart));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      sx: e.clientX,
      origin: cur,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const cw = cellWidth();
    if (!d || d.id !== e.pointerId || cw <= 0) return;
    const dx = e.clientX - d.sx;
    if (!d.moved && Math.abs(dx) <= 4) return;
    d.moved = true;
    setDragLeft(clamp(d.origin + dx / cw, 0, maxStart));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d.moved && dragLeft != null) {
      onChange(clamp(Math.round(dragLeft), 0, maxStart));
    } else if (!d.moved) {
      selectAt(indexAt(e.clientX));
    }
    setDragLeft(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = maxStart;
    if (next == null) return;
    e.preventDefault();
    onChange(clamp(next, 0, maxStart));
  };

  if (n === 0) return null;
  const left = dragLeft ?? cur;
  const activeStart = Math.round(left);
  const isActive = (i: number) => i >= activeStart && i < activeStart + width;
  const shown = stages
    .slice(cur, cur + width)
    .map((s) => s.label)
    .join(" – ");

  return (
    <div
      className={["rp", dragLeft != null ? "is-dragging" : ""].join(" ")}
      style={{ "--stage-count": n } as React.CSSProperties}
    >
      <div ref={labelsRef} className="rp-labels">
        {stages.map((s, i) => (
          <button
            key={`${s.label}-${i}`}
            type="button"
            className={["rp-label", isActive(i) ? "is-active" : ""].join(" ")}
            aria-label={`切换到${s.label}`}
            aria-pressed={isActive(i)}
            onClick={() => selectAt(i)}
          >
            {splitLabel(s.label, maxChars).map((line) => (
              <span key={line} className="rp-label-line">
                {line}
              </span>
            ))}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        className="rp-track"
        role="slider"
        tabIndex={0}
        aria-label="显示的轮次"
        aria-valuemin={0}
        aria-valuemax={maxStart}
        aria-valuenow={cur}
        aria-valuetext={shown}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if ((e.target as Element).closest(".rp-selection")) return;
          selectAt(indexAt(e.clientX));
        }}
      >
        <div className="rp-icons" aria-hidden="true">
          {stages.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className={["rp-icon", isActive(i) ? "is-active" : ""].join(" ")}
            >
              {s.icon === "trophy" ? (
                <img className="rp-trophy" src={championImg} alt="" />
              ) : s.icon === "result" ? (
                <span className="rp-result">🏁</span>
              ) : (
                <Bars count={s.icon} />
              )}
            </div>
          ))}
        </div>

        <div
          className="rp-selection"
          style={{
            left: `${(left / n) * 100}%`,
            width: `${(width / n) * 100}%`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <button
            type="button"
            className="rp-handle is-start"
            aria-label="上一轮"
            tabIndex={-1}
            disabled={cur <= 0}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onChange(clamp(cur - 1, 0, maxStart));
            }}
          >
            <span className="rp-chevron" aria-hidden="true">
              ‹
            </span>
          </button>
          <button
            type="button"
            className="rp-handle is-end"
            aria-label="下一轮"
            tabIndex={-1}
            disabled={cur >= maxStart}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onChange(clamp(cur + 1, 0, maxStart));
            }}
          >
            <span className="rp-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoundPicker;
