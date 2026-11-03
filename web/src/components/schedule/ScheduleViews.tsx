import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import { formatDayTitle } from "../../utils/bracketSchedule";
import "./ScheduleViews.css";

/**
 * 排期的三种视图：列表 / 日历 / 甘特图
 * 日历按月展示每天的条目，点击某天切到该天的甘特图；甘特图按场地（或项目）分行展示当天各条目的时间段。
 * 条目与业务无关（对阵中的一场比赛、或整个比赛项目），由调用方转换为 ScheduleEntry。
 */

export type ScheduleViewMode = "list" | "calendar" | "gantt";

// 条目状态：决定颜色
export type ScheduleTone =
  | "scheduled" // 待开始
  | "live" // 进行中 / 检录中
  | "pending" // 对阵待定
  | "review" // 成绩审核中
  | "completed"; // 已结束

export interface ScheduleEntry {
  key: string;
  start: string;
  end: string;
  venue: string;
  // 所属项目（甘特图按项目分行时使用）
  group: string;
  // 主文本：对阵双方或项目名称
  title: string;
  // 副文本：场次、轮次等
  meta: string;
  // 甘特条上的短标签（如 “#3” 或状态）
  tag?: string;
  tone: ScheduleTone;
  // 状态文字（列表中显示）
  statusText: string;
  conflict?: string;
  related?: boolean;
  active?: boolean;
  // 屏幕阅读器与悬停提示补充
  description?: string;
  onPick?: (element: HTMLElement) => void;
}

export interface ScheduleViewsProps {
  entries: ScheduleEntry[];
  // 列表视图；不传时使用内置的简单列表
  renderList?: () => React.ReactNode;
  // 未排期的条目数（只在列表中出现）
  unscheduled?: number;
  // 外观：admin 为管理端卡片，public 为公开端（RM 暗色）
  tone?: "admin" | "public";
  defaultMode?: ScheduleViewMode;
  // 甘特图分行：按场地或按项目；不传时只按场地
  groupOptions?: boolean;
  // 甘特图每分钟最小宽度（px）；容器更宽时自动拉伸铺满
  pxPerMinute?: number;
  // 侧栏概览（进行中 / 即将开始 / 当天概况），宽屏在右侧，窄屏在下方
  summary?: boolean;
  emptyText?: string;
}

const VIEW_LABELS: Record<ScheduleViewMode, string> = {
  list: "列表",
  calendar: "日历",
  gantt: "甘特图",
};

const TONE_LABELS: Record<ScheduleTone, string> = {
  scheduled: "待开始",
  live: "进行中",
  pending: "对阵待定",
  review: "成绩审核中",
  completed: "已结束",
};

const dayKey = (t: string | Dayjs) => dayjs(t).format("YYYY-MM-DD");
const byText = (a: string, b: string) =>
  a.localeCompare(b, "zh-CN", { numeric: true });

const entryLabel = (e: ScheduleEntry) => {
  const s = dayjs(e.start);
  const end = dayjs(e.end);
  const range = `${s.format("M月D日 HH:mm")}–${end.isSame(s, "day") ? end.format("HH:mm") : end.format("M月D日 HH:mm")}`;
  return [
    range,
    e.venue || "未定场地",
    e.meta,
    e.title,
    e.statusText,
    e.description,
    e.conflict ? `时间冲突：${e.conflict}` : "",
  ]
    .filter(Boolean)
    .join("，");
};

const entryClass = (base: string, e: ScheduleEntry) =>
  [
    base,
    `is-${e.tone}`,
    e.related ? "is-related" : "",
    e.conflict ? "is-conflict" : "",
    e.active ? "is-open" : "",
    e.onPick ? "" : "is-static",
  ]
    .filter(Boolean)
    .join(" ");

const ScheduleViews: React.FC<ScheduleViewsProps> = ({
  entries,
  renderList,
  unscheduled = 0,
  tone = "public",
  defaultMode = "list",
  groupOptions = false,
  pxPerMinute = 4,
  summary = false,
  emptyText = "暂无排期",
}) => {
  const [mode, setMode] = useState<ScheduleViewMode>(defaultMode);
  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          dayjs(a.start).valueOf() - dayjs(b.start).valueOf() ||
          byText(a.venue, b.venue) ||
          byText(a.key, b.key),
      ),
    [entries],
  );
  const days = useMemo(
    () => Array.from(new Set(sorted.map((e) => dayKey(e.start)))),
    [sorted],
  );
  // 默认显示今天；今天没有条目时显示第一个还有未结束条目的日期
  const defaultDay = useMemo(() => {
    const today = dayKey(dayjs());
    if (days.includes(today)) return today;
    const open = sorted.find((e) => e.tone !== "completed");
    return open ? dayKey(open.start) : (days[0] ?? today);
  }, [days, sorted]);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : defaultDay;

  const main = (
    <>
      <div className="sv-toolbar">
        <div className="sv-switch" role="tablist" aria-label="排期视图">
          {(Object.keys(VIEW_LABELS) as ScheduleViewMode[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={`sv-switch-btn${mode === key ? " is-active" : ""}`}
              onClick={() => setMode(key)}
            >
              {VIEW_LABELS[key]}
            </button>
          ))}
        </div>
        {mode !== "list" && unscheduled > 0 && (
          <span className="sv-hint">另有 {unscheduled} 场未排期，见列表</span>
        )}
      </div>

      {mode === "list" &&
        (renderList ? (
          renderList()
        ) : sorted.length === 0 ? (
          <div className="sv-empty">{emptyText}</div>
        ) : (
          <ScheduleSimpleList entries={sorted} />
        ))}
      {mode !== "list" && days.length === 0 && (
        <div className="sv-empty">{emptyText}</div>
      )}
      {mode === "calendar" && days.length > 0 && (
        <ScheduleCalendar
          entries={sorted}
          day={day}
          onPickDay={(d) => {
            setPickedDay(d);
            setMode("gantt");
          }}
        />
      )}
      {mode === "gantt" && days.length > 0 && (
        <ScheduleGantt
          entries={sorted}
          days={days}
          day={day}
          onPickDay={setPickedDay}
          groupOptions={groupOptions}
          pxPerMinute={pxPerMinute}
        />
      )}
    </>
  );

  if (!summary || sorted.length === 0) {
    return <div className={`sv-root is-${tone}`}>{main}</div>;
  }
  return (
    <div className={`sv-root is-${tone} has-summary`}>
      <div className="sv-main">{main}</div>
      <ScheduleSummary entries={sorted} day={day} />
    </div>
  );
};

// ==== 侧栏概览 ====

// 每组最多列出的条目
const SUMMARY_LIMIT = 6;

const SummaryItem: React.FC<{ entry: ScheduleEntry }> = ({ entry: e }) => (
  <li>
    <EntryButton entry={e} className="sv-sum-item">
      <span className="sv-sum-time">
        {dayjs(e.start).format("HH:mm")}
        {!dayjs(e.start).isSame(dayjs(), "day") && (
          <span className="sv-sum-date">{dayjs(e.start).format("M/D")}</span>
        )}
      </span>
      <span className="sv-sum-main">
        <span className="sv-sum-title">{e.title}</span>
        <span className="sv-sum-meta">
          {[e.group !== e.title ? e.group : "", e.venue]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </EntryButton>
  </li>
);

const ScheduleSummary: React.FC<{ entries: ScheduleEntry[]; day: string }> = ({
  entries,
  day,
}) => {
  // 每分钟刷新“即将开始”
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const live = entries.filter((e) => e.tone === "live");
  const upcoming = entries.filter(
    (e) =>
      (e.tone === "scheduled" || e.tone === "pending") &&
      dayjs(e.start).isAfter(now),
  );
  const dayList = entries.filter((e) => dayKey(e.start) === day);
  const done = dayList.filter((e) => e.tone === "completed").length;
  const venues = new Set(dayList.map((e) => e.venue).filter(Boolean));
  const projectMap = new Map<string, { total: number; done: number }>();
  for (const e of dayList) {
    const row = projectMap.get(e.group) ?? { total: 0, done: 0 };
    row.total += 1;
    if (e.tone === "completed") row.done += 1;
    projectMap.set(e.group, row);
  }
  const projects = Array.from(projectMap).sort(
    (a, b) => b[1].total - a[1].total || byText(a[0], b[0]),
  );
  const first = dayList[0];
  let last: ScheduleEntry | undefined;
  for (const e of dayList) {
    if (!last || dayjs(e.end).isAfter(dayjs(last.end))) last = e;
  }

  return (
    <aside className="sv-summary" aria-label="赛程概览">
      <section className="sv-sum-card">
        <h3 className="sv-sum-head">
          <span className="sv-sum-dot is-live" aria-hidden="true" />
          正在进行
          <span className="sv-sum-count">{live.length}</span>
        </h3>
        {live.length === 0 ? (
          <p className="sv-sum-empty">当前没有进行中的比赛</p>
        ) : (
          <ul className="sv-sum-list">
            {live.slice(0, SUMMARY_LIMIT).map((e) => (
              <SummaryItem key={e.key} entry={e} />
            ))}
          </ul>
        )}
      </section>

      <section className="sv-sum-card">
        <h3 className="sv-sum-head">
          <span className="sv-sum-dot is-scheduled" aria-hidden="true" />
          即将开始
          {upcoming.length > 0 && (
            <span className="sv-sum-count">{upcoming.length}</span>
          )}
        </h3>
        {upcoming.length === 0 ? (
          <p className="sv-sum-empty">后续没有待开始的比赛</p>
        ) : (
          <ul className="sv-sum-list">
            {upcoming.slice(0, SUMMARY_LIMIT).map((e) => (
              <SummaryItem key={e.key} entry={e} />
            ))}
          </ul>
        )}
      </section>

      <section className="sv-sum-card">
        <h3 className="sv-sum-head">{formatDayTitle(day)} 概况</h3>
        <dl className="sv-sum-stats">
          <div>
            <dt>安排</dt>
            <dd>{dayList.length}</dd>
          </div>
          <div>
            <dt>已结束</dt>
            <dd>{done}</dd>
          </div>
          <div>
            <dt>场地</dt>
            <dd>{venues.size}</dd>
          </div>
        </dl>
        {first && last && (
          <p className="sv-sum-range">
            {dayjs(first.start).format("HH:mm")} 开始，预计{" "}
            {dayjs(last.end).isSame(dayjs(day), "day")
              ? dayjs(last.end).format("HH:mm")
              : dayjs(last.end).format("M月D日 HH:mm")}{" "}
            结束
          </p>
        )}
        {projects.length > 0 && (
          <ul className="sv-sum-projects">
            {projects.map(([name, row]) => (
              <li key={name}>
                <span className="sv-sum-project-name" title={name}>
                  {name}
                </span>
                <span className="sv-sum-progress" aria-hidden="true">
                  <span style={{ width: `${(row.done / row.total) * 100}%` }} />
                </span>
                <span className="sv-sum-project-count">
                  {row.done}/{row.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
};

// ==== 内置列表（按日期分组） ====

const ScheduleSimpleList: React.FC<{ entries: ScheduleEntry[] }> = ({
  entries,
}) => {
  const groups: { day: string; items: ScheduleEntry[] }[] = [];
  for (const e of entries) {
    const d = dayKey(e.start);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <div className="sv-list">
      {groups.map((g) => (
        <section key={g.day} aria-label={formatDayTitle(g.day)}>
          <h3 className="sv-list-day">
            {formatDayTitle(g.day)}
            <span className="sv-list-count">{g.items.length} 项</span>
          </h3>
          <ul className="sv-list-items">
            {g.items.map((e) => {
              const content = (
                <>
                  <span className="sv-list-time">
                    {dayjs(e.start).format("HH:mm")}
                    <span className="sv-list-end">
                      –{dayjs(e.end).format("HH:mm")}
                    </span>
                  </span>
                  <span className="sv-list-main">
                    <span className="sv-list-title">{e.title}</span>
                    <span className="sv-list-meta">
                      {[e.meta, e.venue].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`sv-list-status is-${e.tone}`}>
                    {e.statusText}
                  </span>
                </>
              );
              return (
                <li key={e.key}>
                  {e.onPick ? (
                    <button
                      type="button"
                      className={entryClass("sv-list-item", e)}
                      aria-label={entryLabel(e)}
                      onClick={(ev) => e.onPick?.(ev.currentTarget)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={entryClass("sv-list-item", e)}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};

const NavButton: React.FC<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    className="sv-nav-btn"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    <span aria-hidden="true">{children}</span>
  </button>
);

// 条目按钮（日历条目、甘特条）；不可点击时为普通元素
const EntryButton: React.FC<{
  entry: ScheduleEntry;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ entry, className, style, children }) => {
  const label = entryLabel(entry);
  return entry.onPick ? (
    <button
      type="button"
      className={entryClass(className, entry)}
      style={style}
      title={label}
      aria-label={label}
      onClick={(e) => entry.onPick?.(e.currentTarget)}
    >
      {children}
    </button>
  ) : (
    <div
      className={entryClass(className, entry)}
      style={style}
      title={label}
      role="img"
      aria-label={label}
    >
      {children}
    </div>
  );
};

// ==== 日历 ====

const WEEK_HEAD = ["一", "二", "三", "四", "五", "六", "日"];
// 每个日期格至少列出的条目数，以及计算格内可容纳条目数用的尺寸（px）
const CELL_LIMIT = 3;
const CELL_MIN_H = 112;
const CELL_HEAD_H = 34;
const CELL_ITEM_H = 22;

const ScheduleCalendar: React.FC<{
  entries: ScheduleEntry[];
  day: string;
  onPickDay: (day: string) => void;
}> = ({ entries, day, onPickDay }) => {
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.start);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [entries]);
  const [month, setMonth] = useState(() => dayjs(day).startOf("month"));
  const today = dayKey(dayjs());
  const [viewportH, setViewportH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 周一开始的日期格
  const first = month.startOf("month");
  const offset = (first.day() + 6) % 7;
  const weeks = Math.ceil((offset + month.daysInMonth()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) =>
    first.add(i - offset, "day"),
  );

  // 有条目的月份范围，超出时禁用翻页
  const firstMonth = dayjs(entries[0]?.start).startOf("month");
  const lastMonth = dayjs(entries[entries.length - 1]?.start).startOf("month");
  const title = month.format("YYYY年M月");
  // 日期格铺满窗口剩余高度（扣除顶栏、工具栏与星期行），条目数随格高增加
  const cellH = Math.max(CELL_MIN_H, Math.floor((viewportH - 300) / weeks));
  const cellLimit = Math.max(
    CELL_LIMIT,
    Math.floor((cellH - CELL_HEAD_H) / CELL_ITEM_H) - 1,
  );

  return (
    <div className="sv-calendar">
      <div className="sv-cal-head">
        <NavButton
          label="上个月"
          disabled={!month.isAfter(firstMonth)}
          onClick={() => setMonth(month.subtract(1, "month"))}
        >
          ‹
        </NavButton>
        <h3 className="sv-cal-title" aria-live="polite">
          {title}
        </h3>
        <NavButton
          label="下个月"
          disabled={!month.isBefore(lastMonth)}
          onClick={() => setMonth(month.add(1, "month"))}
        >
          ›
        </NavButton>
      </div>
      <div className="sv-cal-grid" aria-label={title}>
        {WEEK_HEAD.map((w) => (
          <div key={w} className="sv-cal-week" aria-hidden="true">
            周{w}
          </div>
        ))}
        {cells.map((d) => {
          const key = dayKey(d);
          const list = byDay.get(key) ?? [];
          const done = list.filter((e) => e.tone === "completed").length;
          return (
            <div
              key={key}
              style={{ minHeight: cellH }}
              className={[
                "sv-cal-cell",
                d.month() === month.month() ? "" : "is-outside",
                key === today ? "is-today" : "",
                list.length > 0 ? "has-matches" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {list.length > 0 ? (
                <button
                  type="button"
                  className="sv-cal-date"
                  onClick={() => onPickDay(key)}
                  aria-label={`${formatDayTitle(key)}，${list.length} 项，已结束 ${done} 项，查看当天甘特图`}
                >
                  <span>{d.date()}</span>
                  <span className="sv-cal-count">{list.length} 项</span>
                </button>
              ) : (
                <span className="sv-cal-date is-plain">{d.date()}</span>
              )}
              {list.length > 0 && (
                <ul className="sv-cal-list">
                  {list.slice(0, cellLimit).map((e) => (
                    <li key={e.key}>
                      <EntryButton entry={e} className="sv-cal-item">
                        <span className="sv-cal-time">
                          {dayjs(e.start).format("HH:mm")}
                        </span>
                        <span className="sv-cal-teams">{e.title}</span>
                      </EntryButton>
                    </li>
                  ))}
                  {list.length > cellLimit && (
                    <li>
                      <button
                        type="button"
                        className="sv-cal-more"
                        onClick={() => onPickDay(key)}
                      >
                        还有 {list.length - cellLimit} 项
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==== 甘特图 ====

// 时间轴最短跨度（分钟）
const MIN_SPAN = 120;
// 泳道高度（px）：最小值，宽屏下拉高到铺满窗口，不超过最大值
const LANE_H = 52;
const LANE_H_MAX = 120;
// 泳道够高时条目显示第三行（轮次 / 项目）
const LANE_H_META = 76;
// 拉伸高度只在宽屏生效（窄屏下方还有概览）
const FILL_QUERY = "(min-width: 1200px)";
// 甘特图下方图例与页面留白（px）
const LEGEND_SPACE = 56;
// 时间轴行高度（px）
const AXIS_H = 28;
// 条目最小宽度（px），保证短条目也能点击
const MIN_BAR = 28;
// 左侧行标题宽度（px，与 CSS 一致；窄屏 80）
const LABEL_W = 112;
const LABEL_W_NARROW = 80;

interface Bar {
  entry: ScheduleEntry;
  start: number; // 距时间轴起点的分钟数
  length: number; // 分钟
  lane: number;
}

type GroupBy = "venue" | "group";

const ScheduleGantt: React.FC<{
  entries: ScheduleEntry[];
  days: string[];
  day: string;
  onPickDay: (day: string) => void;
  groupOptions: boolean;
  pxPerMinute: number;
}> = ({ entries, days, day, onPickDay, groupOptions, pxPerMinute }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>("venue");
  // 滚动容器宽度：时间轴放得下时拉伸铺满，放不下时按最小刻度横向滚动
  const scrollRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  // 宽屏下甘特图到窗口底部的可用高度，用于拉高泳道铺满（窄屏下方还有概览，不拉伸）
  const [fillH, setFillH] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setBoxW(el.clientWidth);
      const wide = window.matchMedia(FILL_QUERY).matches;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFillH(wide ? window.innerHeight - top - LEGEND_SPACE : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const layout = useMemo(() => {
    const base = dayjs(day);
    const dayEnd = 24 * 60;
    const list = entries.filter((e) => dayKey(e.start) === day);
    const startOf = (e: ScheduleEntry) => dayjs(e.start).diff(base, "minute");
    // 跨天的条目在当天截止到 24:00
    const endOf = (e: ScheduleEntry) =>
      Math.min(
        dayEnd,
        Math.max(startOf(e) + 1, dayjs(e.end).diff(base, "minute")),
      );
    // 时间轴：当天最早一项所在整点到最晚一项结束后的整点
    const firstMin = Math.min(...list.map(startOf));
    const lastMin = Math.max(...list.map(endOf));
    const axisStart = Math.floor(firstMin / 60) * 60;
    const axisEnd = Math.min(
      dayEnd,
      Math.max(axisStart + MIN_SPAN, Math.ceil(lastMin / 60) * 60),
    );

    // 分行；同一行时间重叠的条目放到下一条泳道
    const rowsMap = new Map<string, Bar[]>();
    for (const e of list) {
      const rowKey =
        (groupBy === "group" ? e.group : e.venue) ||
        (groupBy === "group" ? "其他" : "未定场地");
      const start = startOf(e) - axisStart;
      const length = endOf(e) - startOf(e);
      const bars = rowsMap.get(rowKey) ?? [];
      const laneEnds: number[] = [];
      for (const b of bars) {
        laneEnds[b.lane] = Math.max(laneEnds[b.lane] ?? 0, b.start + b.length);
      }
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane < 0) lane = laneEnds.length;
      bars.push({ entry: e, start, length, lane });
      rowsMap.set(rowKey, bars);
    }
    const rows = Array.from(rowsMap, ([label, bars]) => ({
      label,
      bars,
      lanes: Math.max(1, ...bars.map((b) => b.lane + 1)),
    })).sort((a, b) => byText(a.label, b.label));

    // 当前时间线（仅当天）
    const nowMin = dayjs().diff(base, "minute") - axisStart;
    return {
      rows,
      axisStart,
      span: axisEnd - axisStart,
      nowMin:
        dayKey(dayjs()) === day && nowMin >= 0 && nowMin <= axisEnd - axisStart
          ? nowMin
          : null,
      tones: new Set(list.map((e) => e.tone)),
      hasConflict: list.some((e) => e.conflict),
    };
  }, [entries, day, groupBy]);

  const { rows, axisStart, span, nowMin, tones, hasConflict } = layout;
  const labelW = window.matchMedia("(max-width: 600px)").matches
    ? LABEL_W_NARROW
    : LABEL_W;
  const px = Math.max(pxPerMinute, (boxW - labelW - 2) / span);
  const width = Math.floor(span * px);
  // 泳道高度：按可用高度平分给全部泳道（每行另有 8px 内边距）
  const totalLanes = rows.reduce((sum, r) => sum + r.lanes, 0);
  const laneH =
    fillH > 0 && totalLanes > 0
      ? Math.min(
          LANE_H_MAX,
          Math.max(
            LANE_H,
            Math.floor((fillH - AXIS_H - rows.length * 9) / totalLanes),
          ),
        )
      : LANE_H;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => i * 60);
  // 刻度足够宽时加半点刻度
  const halfHours = px * 60 >= 160 ? hours.slice(0, -1).map((h) => h + 30) : [];
  const dayIndex = days.indexOf(day);
  const rowTitle = groupBy === "group" ? "项目" : "场地";

  return (
    <div className="sv-gantt">
      <div className="sv-gantt-head">
        <NavButton
          label="前一天"
          disabled={dayIndex <= 0}
          onClick={() => onPickDay(days[dayIndex - 1])}
        >
          ‹
        </NavButton>
        <div className="sv-day-chips" role="tablist" aria-label="比赛日">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === day}
              className={`sv-day-chip${d === day ? " is-active" : ""}`}
              onClick={() => onPickDay(d)}
            >
              {formatDayTitle(d)}
            </button>
          ))}
        </div>
        <NavButton
          label="后一天"
          disabled={dayIndex >= days.length - 1}
          onClick={() => onPickDay(days[dayIndex + 1])}
        >
          ›
        </NavButton>
      </div>
      {groupOptions && (
        <div className="sv-group-by" role="radiogroup" aria-label="甘特图分行">
          <span className="sv-group-label">分行</span>
          {(
            [
              ["venue", "按场地"],
              ["group", "按项目"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={groupBy === key}
              className={`sv-day-chip${groupBy === key ? " is-active" : ""}`}
              onClick={() => setGroupBy(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="sv-gantt-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${formatDayTitle(day)}各${rowTitle}时间安排，可横向滚动`}
      >
        <div className="sv-gantt-table" style={{ width: width + labelW }}>
          <div className="sv-gantt-row is-axis" aria-hidden="true">
            <div className="sv-gantt-label">{rowTitle}</div>
            <div className="sv-gantt-track" style={{ width }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="sv-gantt-hour"
                  style={{ left: h * px }}
                >
                  {String(Math.floor((axisStart + h) / 60) % 24).padStart(
                    2,
                    "0",
                  )}
                  :00
                </span>
              ))}
              {halfHours.map((h) => (
                <span
                  key={h}
                  className="sv-gantt-hour is-half"
                  style={{ left: h * px }}
                >
                  {String(Math.floor((axisStart + h) / 60) % 24).padStart(
                    2,
                    "0",
                  )}
                  :30
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="sv-gantt-row"
              role="group"
              aria-label={row.label}
            >
              <div className="sv-gantt-label" title={row.label}>
                {row.label}
              </div>
              <div
                className="sv-gantt-track"
                style={{ width, height: row.lanes * laneH + 8 }}
              >
                {hours.map((h) => (
                  <span
                    key={h}
                    className="sv-gantt-grid"
                    style={{ left: h * px }}
                  />
                ))}
                {halfHours.map((h) => (
                  <span
                    key={h}
                    className="sv-gantt-grid is-half"
                    style={{ left: h * px }}
                  />
                ))}
                {nowMin != null && (
                  <span
                    className="sv-gantt-now"
                    style={{ left: nowMin * px }}
                    title="当前时间"
                  />
                )}
                {row.bars.map(({ entry: e, start, length, lane }) => (
                  <EntryButton
                    key={e.key}
                    entry={e}
                    className="sv-bar"
                    style={{
                      left: start * px,
                      width: Math.max(length * px - 2, MIN_BAR),
                      top: 4 + lane * laneH,
                      height: laneH - 8,
                    }}
                  >
                    <span className="sv-bar-time">
                      {dayjs(e.start).format("HH:mm")}
                      {e.tag ? ` · ${e.tag}` : ""}
                    </span>
                    <span className="sv-bar-teams">{e.title}</span>
                    {laneH >= LANE_H_META && e.meta && (
                      <span className="sv-bar-meta">{e.meta}</span>
                    )}
                  </EntryButton>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ul className="sv-legend" aria-label="图例">
        {(Object.keys(TONE_LABELS) as ScheduleTone[])
          .filter((t) => tones.has(t))
          .map((t) => (
            <li key={t}>
              <span className={`sv-swatch is-${t}`} />
              {TONE_LABELS[t]}
            </li>
          ))}
        {hasConflict && (
          <li>
            <span className="sv-swatch is-conflict" />
            时间冲突
          </li>
        )}
        {nowMin != null && (
          <li>
            <span className="sv-swatch is-now" />
            当前时间
          </li>
        )}
      </ul>
    </div>
  );
};

export default ScheduleViews;
