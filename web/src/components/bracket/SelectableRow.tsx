import { useEffect, useRef } from "react";

/**
 * 可选中的参赛方行：移植 RM Schedule BracketTeamRow 的指针逻辑。
 * - 点击 / Enter / Space：onActivate（选中或取消选中，桌面端同时打开比赛菜单）
 * - longPress 开启时长按 LONG_PRESS_MS：onLongPress（选中并在按压点打开菜单）；
 *   手指移动超过点击容差或判定为横向拖动时取消长按
 */

// 与 RM 一致：长按 500ms，点击容差 10px，横向拖动判定
const LONG_PRESS_MS = 500;
const POINTER_TAP_SLOP_PX = 10;
const POINTER_PAN_AXIS_SLOP_PX = 3;
const POINTER_PAN_X_BIAS = 1.35;

const isPointerTap = (sx: number, sy: number, ex: number, ey: number) =>
  Math.hypot(ex - sx, ey - sy) <= POINTER_TAP_SLOP_PX;

const isHorizontalPointerPan = (
  sx: number,
  sy: number,
  ex: number,
  ey: number,
) => {
  const dx = ex - sx;
  const dy = ey - sy;
  if (
    Math.abs(dx) < POINTER_PAN_AXIS_SLOP_PX &&
    Math.abs(dy) < POINTER_PAN_AXIS_SLOP_PX
  ) {
    return false;
  }
  return Math.abs(dx) * POINTER_PAN_X_BIAS >= Math.abs(dy);
};

interface SelectableRowProps {
  className: string;
  label: string;
  selected: boolean;
  longPress: boolean;
  // 点击后会打开比赛菜单（桌面端）
  opensMenu?: boolean;
  menuOpen?: boolean;
  onActivate: (el: HTMLDivElement) => void;
  onLongPress?: (el: HTMLDivElement, point: { x: number; y: number }) => void;
  children: React.ReactNode;
}

const SelectableRow = ({
  className,
  label,
  selected,
  longPress,
  opensMenu,
  menuOpen,
  onActivate,
  onLongPress,
  children,
}: SelectableRowProps) => {
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  // 长按触发后，紧随其后的 click 不再切换选中
  const suppressClick = useRef(false);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (!longPress || !onLongPress || e.button !== 0) return;
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    clearTimer();
    const el = e.currentTarget;
    const point = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (press.current?.id !== e.pointerId) return;
      suppressClick.current = true;
      onLongPress(el, point);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    if (!start || start.id !== e.pointerId) return;
    if (
      isHorizontalPointerPan(start.x, start.y, e.clientX, e.clientY) ||
      !isPointerTap(start.x, start.y, e.clientX, e.clientY)
    ) {
      clearTimer();
    }
  };

  const endPress = (e: React.PointerEvent<HTMLDivElement>) => {
    if (press.current?.id !== e.pointerId) return;
    clearTimer();
    press.current = null;
  };

  return (
    <div
      className={[className, "is-selectable", selected ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      aria-haspopup={opensMenu ? "dialog" : undefined}
      aria-expanded={opensMenu ? !!menuOpen : undefined}
      onClick={(e) => {
        // 不冒泡到比赛节点（节点本身的点击用于打开菜单）
        e.stopPropagation();
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onActivate(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onActivate(e.currentTarget);
        } else if (
          onLongPress &&
          (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
        ) {
          // 键盘等效于长按：选中并打开菜单
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          onLongPress(e.currentTarget, { x: rect.right, y: rect.top });
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={longPress ? (e) => e.preventDefault() : undefined}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
};

export default SelectableRow;
