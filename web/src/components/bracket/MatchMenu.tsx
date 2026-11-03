import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseOutlined } from "@ant-design/icons";
import "./MatchMenu.css";

/**
 * 比赛菜单：移植 RM Schedule 的 MatchMenu。
 * - plain：桌面端 MatchGraph 的 v-menu（Vuetify 暗色卡片），锚定在比赛节点下方
 * - glass：移动端 BracketPage 的 .bracket-glass-menu 毛玻璃，长按时以按下点为锚，避开手指弹出
 */

export interface MatchMenuAnchor {
  // 触发元素（比赛节点 / 卡片），用于定位与关闭后归还焦点
  element: HTMLElement;
  // 长按位置（视口坐标）；为空时按元素定位
  point?: { x: number; y: number };
  // 关闭菜单后归还焦点的元素（队伍行 / 菜单按钮）
  returnFocus?: HTMLElement | null;
}

export interface MatchMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface MatchMenuProps {
  anchor: MatchMenuAnchor;
  variant: "plain" | "glass";
  // RM：标题为比赛状态（比赛已结束 / 预计…开始），副标题为对阵双方
  title: string;
  subtitle: string;
  // 场次与轮次
  meta: string;
  items: MatchMenuItem[];
  onClose: (restoreFocus: boolean) => void;
}

const MENU_GAP = 8;
const VIEWPORT_PAD = 8;
// 手指按压处与菜单之间预留的距离，避免松手时落到菜单项上
const FINGER_GAP = 28;

const computePosition = (anchor: MatchMenuAnchor, menu: HTMLElement) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { width, height } = menu.getBoundingClientRect();
  const clampX = (x: number) =>
    Math.min(Math.max(VIEWPORT_PAD, x), vw - width - VIEWPORT_PAD);
  const clampY = (y: number) =>
    Math.min(Math.max(VIEWPORT_PAD, y), vh - height - VIEWPORT_PAD);

  if (anchor.point) {
    const { x, y } = anchor.point;
    // RM location="end"：优先在按压点右侧，其次左侧，最后上 / 下方
    if (x + FINGER_GAP + width + VIEWPORT_PAD <= vw) {
      return { left: x + FINGER_GAP, top: clampY(y - height / 2) };
    }
    if (x - FINGER_GAP - width >= VIEWPORT_PAD) {
      return { left: x - FINGER_GAP - width, top: clampY(y - height / 2) };
    }
    const below = y + FINGER_GAP;
    const top =
      below + height + VIEWPORT_PAD <= vh
        ? below
        : Math.max(VIEWPORT_PAD, y - FINGER_GAP - height);
    return { left: clampX(x - width / 2), top };
  }

  const rect = anchor.element.getBoundingClientRect();
  const below = rect.bottom + MENU_GAP;
  const top =
    below + height + VIEWPORT_PAD <= vh
      ? below
      : rect.top - MENU_GAP - height >= VIEWPORT_PAD
        ? rect.top - MENU_GAP - height
        : clampY(below);
  return { left: clampX(rect.left), top };
};

const MatchMenu: React.FC<MatchMenuProps> = ({
  anchor,
  variant,
  title,
  subtitle,
  meta,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // 首次渲染时隐藏测量，定位后再显示
  useLayoutEffect(() => {
    const update = () => {
      if (menuRef.current) setPos(computePosition(anchor, menuRef.current));
    };
    update();
    // 按压点坐标不随滚动变化：长按菜单在滚动时直接关闭
    const onScroll = () => {
      if (anchor.point) onCloseRef.current(false);
      else update();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  // 打开时聚焦第一个可用菜单项
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)",
    );
    (first ?? menuRef.current)?.focus({ preventScroll: true });
  }, [anchor]);

  // 点击菜单与触发元素以外的位置、按 Esc 时关闭
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      // 触发元素内的点击交给其自身处理（切换选中 / 重新锚定）
      if (anchor.element.contains(target)) return;
      onCloseRef.current(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);

  // 方向键在可用菜单项间移动；Tab 关闭菜单并回到触发元素
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      onClose(true);
      return;
    }
    const list = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ) ?? [],
    );
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (index + 1) % list.length;
    else if (e.key === "ArrowUp") {
      next = (index - 1 + list.length) % list.length;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    if (next >= 0) {
      e.preventDefault();
      list[next].focus();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className={`bracket-glass-menu is-${variant}`}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {variant === "glass" && (
        <button
          type="button"
          className="bracket-menu-close"
          aria-label="关闭菜单"
          onClick={() => onClose(true)}
        >
          <CloseOutlined />
        </button>
      )}
      <div className="bgm-head">
        {/* mdi-sword-cross */}
        <svg className="bgm-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.2 2.44L18.1 14.34L20.22 12.22L21.63 13.63L19.16 16.1L22.34 19.28C22.73 19.67 22.73 20.3 22.34 20.69L21.63 21.4C21.24 21.79 20.61 21.79 20.22 21.4L17 18.23L14.56 20.7L13.15 19.29L15.27 17.17L3.37 5.27V2.44H6.2M15.89 10L20.63 5.26V2.44H17.8L13.06 7.18L15.89 10M10.94 15L8.11 12.13L5.9 14.34L3.78 12.22L2.37 13.63L4.84 16.1L1.66 19.29C1.27 19.68 1.27 20.31 1.66 20.7L2.37 21.41C2.76 21.8 3.39 21.8 3.78 21.41L7 18.23L9.42 20.7L10.83 19.29L8.71 17.17L10.94 15Z" />
        </svg>
        <div className="bgm-titles">
          <div className="bgm-title" id={titleId}>
            {title}
          </div>
          <div className="bgm-subtitle">{subtitle}</div>
          <div className="bgm-status">{meta}</div>
        </div>
      </div>
      <div className="bgm-list" role="menu" aria-labelledby={titleId}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className="bgm-item"
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    // 对阵图全屏时菜单需渲染在全屏元素内才可见
    document.fullscreenElement ?? document.body,
  );
};

export default MatchMenu;
