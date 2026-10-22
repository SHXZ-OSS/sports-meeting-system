import React, { useEffect, useRef, useState } from "react";

interface CompetitionDescriptionProps {
  description?: string;
  clampLines?: number;
  expandable?: boolean;
  compact?: boolean;
}

/**
 * 比赛项目说明：默认折叠到指定行数，超长时提供展开/收起；
 * compact 用于卡片内只显示两行且不带展开按钮。
 */
const CompetitionDescription: React.FC<CompetitionDescriptionProps> = ({
  description,
  clampLines = 4,
  expandable = true,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const text = description?.trim();

  useEffect(() => {
    setExpanded(false);
  }, [description]);

  useEffect(() => {
    if (expanded) {
      return;
    }
    const element = textRef.current;
    if (!element) {
      return;
    }
    setOverflowing(element.scrollHeight > element.clientHeight + 1);
  }, [description, expanded, clampLines]);

  if (!text) {
    return null;
  }

  const canExpand =
    expandable && (overflowing || text.length > clampLines * 36);

  return (
    <div
      style={{
        marginBottom: compact ? 8 : 14,
        padding: compact ? 0 : "10px 12px",
        borderRadius: compact ? 0 : 8,
        background: compact ? undefined : "rgba(127, 127, 127, 0.09)",
        color: "inherit",
      }}
    >
      {!compact && (
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
          项目说明
        </div>
      )}
      <div
        ref={textRef}
        style={{
          fontSize: compact ? 12 : 13,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          opacity: compact ? 0.7 : 0.85,
          display: expanded ? "block" : "-webkit-box",
          WebkitLineClamp: expanded ? undefined : clampLines,
          WebkitBoxOrient: "vertical",
          overflow: expanded ? "visible" : "hidden",
          maxHeight: expanded ? "40vh" : undefined,
          overflowY: expanded ? "auto" : "hidden",
          minHeight: compact ? `${clampLines * 20}px` : undefined,
        }}
      >
        {text}
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          style={{
            marginTop: 6,
            padding: 0,
            border: "none",
            background: "none",
            color: "inherit",
            opacity: 0.65,
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
};

export default CompetitionDescription;
