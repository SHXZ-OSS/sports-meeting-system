import { useEffect, useId, useMemo, useState } from "react";
import { Modal, Select, Switch } from "antd";
import { publicAPI } from "../../api/public";
import { Bracket, BracketDetail } from "../../types";
import { handleRespWithoutNotify } from "../../utils/handleResp";
import { MDI, MdiIcon } from "./mdi";

/**
 * 搜索队伍：移植 RM Schedule 的 SearchPlayer.vue
 * 毛玻璃卡片 + “仅限当前对阵图”开关 + 带校徽的自动补全 + 关闭 / 选中 / 分析
 */

export interface ParticipantPick {
  bracketId: number;
  participantId: number;
}

interface SearchOption {
  value: string;
  bracketId: number;
  participantId: number;
  name: string;
  sub: string;
  // 用于过滤：名称、班级、对阵图名（小写）
  haystack: string;
}

interface PublicSearchDialogProps {
  open: boolean;
  onClose: () => void;
  brackets: Bracket[];
  // 当前页面展示的对阵图（首页为空）
  currentBracketId?: number;
  currentDetail?: BracketDetail | null;
  onPick: (pick: ParticipantPick) => void;
  onAnalyze: (detail: BracketDetail, participantId: number) => void;
}

const optionKey = (pick: ParticipantPick) =>
  `${pick.bracketId}:${pick.participantId}`;

export default function PublicSearchDialog({
  open,
  onClose,
  brackets,
  currentBracketId,
  currentDetail,
  onPick,
  onAnalyze,
}: PublicSearchDialogProps) {
  const titleId = useId();
  const subtitleId = useId();
  const hintId = useId();
  // 已请求过的对阵图：null 表示加载失败（不再重试，避免一直显示加载中）
  const [fetched, setFetched] = useState<Record<number, BracketDetail | null>>(
    {},
  );
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [value, setValue] = useState<string | undefined>();

  // 打开时按需加载其他已公开对阵图的参赛方（当前对阵图直接复用页面数据）
  useEffect(() => {
    if (!open) return;
    const missing = brackets.filter(
      (b) => b.id !== currentDetail?.bracket.id && !(b.id in fetched),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((b) => publicAPI.getBracket(b.id))).then(
      (resps) => {
        if (cancelled) return;
        const next: Record<number, BracketDetail | null> = {};
        resps.forEach((resp, index) => {
          next[missing[index].id] = null;
          handleRespWithoutNotify(resp, (data) => {
            next[missing[index].id] = data;
          });
        });
        setFetched((prev) => ({ ...prev, ...next }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, brackets, currentDetail, fetched]);

  const details = useMemo(() => {
    const map = new Map<number, BracketDetail>();
    brackets.forEach((b) => {
      const d =
        currentDetail?.bracket.id === b.id ? currentDetail : fetched[b.id];
      if (d) map.set(b.id, d);
    });
    return map;
  }, [brackets, currentDetail, fetched]);

  const hasCurrent = currentBracketId != null;
  const scoped = hasCurrent && onlyCurrent;

  const options = useMemo<SearchOption[]>(() => {
    const list: SearchOption[] = [];
    // 当前对阵图排在最前
    const ordered = [...details.values()].sort(
      (a, b) =>
        Number(b.bracket.id === currentBracketId) -
        Number(a.bracket.id === currentBracketId),
    );
    ordered.forEach((d) => {
      if (scoped && d.bracket.id !== currentBracketId) return;
      d.participants.forEach((p) => {
        const className =
          p.class_name && p.class_name !== p.name ? p.class_name : "";
        list.push({
          value: optionKey({ bracketId: d.bracket.id, participantId: p.id }),
          bracketId: d.bracket.id,
          participantId: p.id,
          name: p.name,
          sub: [className, d.bracket.name].filter(Boolean).join(" · "),
          haystack: `${p.name} ${className} ${d.bracket.name}`.toLowerCase(),
        });
      });
    });
    return list;
  }, [details, scoped, currentBracketId]);

  const selected = options.find((o) => o.value === value);
  const loading =
    open &&
    brackets.some(
      (b) => b.id !== currentDetail?.bracket.id && !(b.id in fetched),
    );

  const pick = (fn: (option: SearchOption) => void) => {
    if (!selected) return;
    fn(selected);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      centered
      width={480}
      rootClassName="pt-dialog-root pt-search-root"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
    >
      <div className="pt-search-glow" aria-hidden="true" />
      <div className="pt-search-title">
        <span className="pt-search-title-icon">
          <MdiIcon path={MDI.magnify} size={20} />
        </span>
        <h3 id={titleId}>搜索队伍</h3>
        <button
          type="button"
          className="pt-search-close"
          aria-label="关闭搜索"
          onClick={onClose}
        >
          <MdiIcon path={MDI.close} size={20} />
        </button>
      </div>
      <p className="pt-search-subtitle" id={subtitleId}>
        通过班级或姓名搜索对阵图中的队伍
      </p>

      <div className="pt-search-body">
        <label className="pt-search-switch">
          <Switch
            size="small"
            checked={scoped}
            disabled={!hasCurrent}
            onChange={setOnlyCurrent}
          />
          <span>仅限当前对阵图</span>
        </label>

        <div className="pt-search-field">
          <Select<string, SearchOption>
            showSearch={{
              filterOption: (input, option) =>
                !!option &&
                option.haystack.includes(input.trim().toLowerCase()),
            }}
            allowClear
            value={value}
            onChange={setValue}
            options={options}
            loading={loading}
            notFoundContent={loading ? "正在加载队伍…" : "没有匹配的队伍"}
            prefix={<MdiIcon path={MDI.school} size={22} />}
            suffixIcon={<MdiIcon path={MDI.chevronDown} size={22} />}
            labelRender={() =>
              selected ? (
                <span className="pt-search-chip">
                  <span className="pt-search-avatar is-small">
                    <img src="/school-emblem.svg" alt="" />
                  </span>
                  <span className="pt-search-chip-text">{selected.name}</span>
                </span>
              ) : null
            }
            optionRender={(option) => (
              <span className="pt-search-option">
                <span className="pt-search-avatar">
                  <img src="/school-emblem.svg" alt="" />
                </span>
                <span className="pt-search-option-text">
                  <span className="pt-search-option-title">
                    {option.data.name}
                  </span>
                  {option.data.sub && (
                    <span className="pt-search-option-sub">
                      {option.data.sub}
                    </span>
                  )}
                </span>
              </span>
            )}
            classNames={{ popup: { root: "pt-search-popup" } }}
            aria-label="搜索队伍"
            aria-describedby={hintId}
          />
          <p className="pt-search-hint" id={hintId}>
            请输入班级或队伍名称
          </p>
        </div>
      </div>

      <div className="pt-search-actions">
        <button type="button" className="pt-text-btn" onClick={onClose}>
          关闭
        </button>
        <span className="pt-search-spacer" />
        <button
          type="button"
          className="pt-text-btn is-secondary"
          disabled={!selected}
          onClick={() => pick((o) => onPick(o))}
        >
          选中
        </button>
        <button
          type="button"
          className="pt-text-btn is-primary"
          disabled={!selected}
          onClick={() =>
            pick((o) => {
              const d = details.get(o.bracketId);
              if (d) onAnalyze(d, o.participantId);
            })
          }
        >
          分析
        </button>
      </div>
    </Modal>
  );
}
