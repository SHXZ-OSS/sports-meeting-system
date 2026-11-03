import { useMemo } from "react";
import dayjs from "dayjs";
import { BracketMatch, BracketParticipant } from "../../types";
import {
  formatDayTitle,
  groupByDay,
  isSchedulable,
  matchSideNames,
  sortBySchedule,
} from "../../utils/bracketSchedule";
import { formatMatchScore, getMatchRoundLabel, isInMatch } from "./analysis";
import "./ScheduleList.css";

interface ScheduleListProps {
  matches: BracketMatch[];
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  // 选中的参赛方：其比赛高亮
  selectedId: number | null;
  menuSeq: number | null;
  onOpenMenu: (match: BracketMatch, element: HTMLElement) => void;
}

const STATUS_TEXT: Partial<Record<BracketMatch["status"], string>> = {
  pending: "待定",
  scheduled: "未开始",
  completed: "已结束",
};

/**
 * 赛程：按日期、时间列出全部比赛（轮空与不进行的比赛不列出）
 * 点击比赛打开比赛菜单（分析比赛 / 分析队伍），与对阵图一致
 */
const ScheduleList: React.FC<ScheduleListProps> = ({
  matches,
  participants,
  matchesBySeq,
  selectedId,
  menuSeq,
  onOpenMenu,
}) => {
  const days = useMemo(
    () =>
      groupByDay(
        sortBySchedule(matches.filter(isSchedulable)),
        (m) => m.scheduled_at,
      ),
    [matches],
  );

  return (
    <div className="sl-root">
      {days.map(({ day, items }) => (
        <section
          key={day || "none"}
          className="sl-day"
          aria-label={formatDayTitle(day)}
        >
          <h3 className="sl-day-title">
            {formatDayTitle(day)}
            <span className="sl-day-count">{items.length} 场</span>
          </h3>
          <ul className="sl-list">
            {items.map((m) => {
              const [red, blue] = matchSideNames(m, participants, matchesBySeq);
              const done = m.status === "completed";
              const winner1 =
                done &&
                m.winner_id != null &&
                m.winner_id === m.participant1_id;
              const winner2 =
                done &&
                m.winner_id != null &&
                m.winner_id === m.participant2_id;
              const related = isInMatch(m, selectedId);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={[
                      "sl-item",
                      done ? "is-done" : "",
                      related ? "is-related" : "",
                      menuSeq === m.seq ? "is-open" : "",
                    ].join(" ")}
                    aria-haspopup="menu"
                    aria-expanded={menuSeq === m.seq}
                    onClick={(e) => onOpenMenu(m, e.currentTarget)}
                  >
                    <span className="sl-time">
                      {m.scheduled_at
                        ? dayjs(m.scheduled_at).format("HH:mm")
                        : "--:--"}
                    </span>
                    <span className="sl-meta">
                      <span className="sl-round">
                        第 {m.seq} 场 · {getMatchRoundLabel(m, matches)}
                      </span>
                      {m.venue && <span className="sl-venue">{m.venue}</span>}
                    </span>
                    <span className="sl-teams">
                      <span
                        className={[
                          "sl-team",
                          "is-red",
                          winner2 ? "is-loser" : "",
                          m.participant1_id === selectedId && selectedId != null
                            ? "is-selected"
                            : "",
                        ].join(" ")}
                      >
                        {red}
                      </span>
                      <span className="sl-score">
                        {done ? formatMatchScore(m) : "VS"}
                      </span>
                      <span
                        className={[
                          "sl-team",
                          "is-blue",
                          winner1 ? "is-loser" : "",
                          m.participant2_id === selectedId && selectedId != null
                            ? "is-selected"
                            : "",
                        ].join(" ")}
                      >
                        {blue}
                      </span>
                    </span>
                    <span className={`sl-status is-${m.status}`}>
                      {STATUS_TEXT[m.status] ?? ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default ScheduleList;
