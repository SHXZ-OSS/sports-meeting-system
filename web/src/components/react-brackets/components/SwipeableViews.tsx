import React from "react";
import styled from "styled-components";

const ViewsContainer = styled.div<{ $rtl: boolean }>`
  display: flex;
  flex-direction: ${(props) => (props.$rtl ? "row-reverse" : "row")};
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  > * {
    flex: 0 0 100%;
    min-width: 0;
    scroll-snap-align: ${(props) => (props.$rtl ? "end" : "start")};
  }
`;

export interface SwipeableViewsProps {
  /** 容器样式 */
  style?: React.CSSProperties;
  /** 滑动方向，x 为从左到右，x-reverse 为从右到左（RTL） */
  axis?: "x" | "x-reverse";
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}

/** 轻量的滑动视图容器：基于 CSS scroll-snap 实现移动端整页左右滑动切换 */
const SwipeableViews: React.FC<SwipeableViewsProps> = ({
  style,
  axis,
  className,
  ref,
  children,
}) => (
  <ViewsContainer
    $rtl={axis === "x-reverse"}
    style={style}
    className={className}
    ref={ref}
  >
    {children}
  </ViewsContainer>
);

export default SwipeableViews;
