import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type {
  ClassPointsSummary,
  Competition,
  StudentPointsSummary,
} from "../types";
import "./PublicHomeBoard.css";

const UPCOMING_WINDOW_MS = 60 * 60 * 1000;

const FIELD_STATUS = [
  { key: "in_progress", label: "进行中", color: "#e66652" },
  { key: "checking_in", label: "检录中", color: "#2196ea" },
  { key: "pending_score_review", label: "成绩审核中", color: "#7f6acb" },
] as const;

const formatPoints = (points: number) =>
  String(Number(points.toFixed(1))).replace(/\.0$/, "");

const getBarPercent = (points: number, maxPoints: number) => {
  if (points <= 0 || maxPoints <= 0) return 0;
  return Math.max(4, Math.min(100, (points / maxPoints) * 100));
};

// 名次分档：冠军金色、亚季军奖牌色、其余中性色，具体颜色由 CSS 决定
const getRankTier = (rank: number) => {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "rest";
};

// RM Schedule 队伍行：比分徽标 + 白色圆形校徽 + 单行名称
function RankBadge({ rank }: { rank: number }) {
  return (
    <>
      <span className="ph-rank-badge" aria-hidden="true">
        {rank}
      </span>
      <span className="ph-avatar" aria-hidden="true">
        <img src="/school-emblem.svg" alt="" />
      </span>
    </>
  );
}

interface PublicHomeBoardProps {
  // 共用的 RM 顶栏（PublicTopBar）
  topBar: React.ReactNode;
  topClasses: ClassPointsSummary[];
  topStudents: StudentPointsSummary[];
  completedCount: number;
  pendingCount: number;
  pendingCompetitions: Competition[];
  pendingLoading: boolean;
  onViewClass: (classId: number, className: string) => void;
  onViewStudent: (studentId: number, studentName: string) => void;
  onViewCompetition: (competition: Competition) => void;
  onOpenCompleted: () => void;
  onOpenPending: () => void;
}

export default function PublicHomeBoard({
  topBar,
  topClasses,
  topStudents,
  completedCount,
  pendingCount,
  pendingCompetitions,
  pendingLoading,
  onViewClass,
  onViewStudent,
  onViewCompetition,
  onOpenCompleted,
  onOpenPending,
}: PublicHomeBoardProps) {
  const totalCount = completedCount + pendingCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const maxClassPoints = topClasses[0]?.total_points || 1;
  const maxStudentPoints = topStudents[0]?.total_points || 1;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const startTimeValue = (competition: Competition) =>
    competition.start_time ? dayjs(competition.start_time).valueOf() : NaN;

  const upcomingCompetitions = pendingCompetitions
    .filter((competition) => {
      if (competition.status !== "approved") {
        return false;
      }
      const start = startTimeValue(competition);
      return (
        Number.isFinite(start) &&
        start >= now &&
        start <= now + UPCOMING_WINDOW_MS
      );
    })
    .sort((left, right) => startTimeValue(left) - startTimeValue(right))
    .slice(0, 3);

  return (
    <div className="ph-shell">
      {topBar}

      <main className="ph-layout">
        <div className="ph-pair">
          <section
            className="ph-board ph-board--class"
            aria-labelledby="ph-class-title"
          >
            <header className="ph-heading">
              <h2 id="ph-class-title">
                班级分数榜
                <span className="ph-heading-note">TOP 10</span>
              </h2>
            </header>
            {topClasses.length > 0 ? (
              <ol className="ph-rank-list" aria-label="班级分数榜前十名">
                {topClasses.slice(0, 10).map((entry, index) => {
                  const rank = entry.rank || index + 1;
                  return (
                    <li
                      className="ph-rank-row"
                      key={entry.class_id}
                      data-tier={getRankTier(rank)}
                    >
                      <RankBadge rank={rank} />
                      <div className="ph-rank-body">
                        <div className="ph-rank-line">
                          <button
                            type="button"
                            className="ph-entry"
                            onClick={() =>
                              onViewClass(entry.class_id, entry.class_name)
                            }
                          >
                            {entry.class_name}
                          </button>
                          <span className="ph-points">
                            {formatPoints(entry.total_points)}
                            <span className="ph-points-unit">分</span>
                          </span>
                        </div>
                        <div className="ph-bar" aria-hidden="true">
                          <span
                            style={{
                              width: `${getBarPercent(
                                entry.total_points,
                                maxClassPoints,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="ph-empty">暂无班级积分数据</p>
            )}
          </section>

          <section
            className="ph-board ph-board--student"
            aria-labelledby="ph-student-title"
          >
            <header className="ph-heading">
              <h2 id="ph-student-title">
                个人分数榜
                <span className="ph-heading-note">TOP 10</span>
              </h2>
            </header>
            {topStudents.length > 0 ? (
              <ol className="ph-rank-list" aria-label="个人分数榜前十名">
                {topStudents.slice(0, 10).map((entry, index) => {
                  const rank = entry.rank || index + 1;
                  return (
                    <li
                      className="ph-rank-row"
                      key={entry.student_id}
                      data-tier={getRankTier(rank)}
                    >
                      <RankBadge rank={rank} />
                      <div className="ph-rank-body">
                        <div className="ph-rank-line">
                          <span className="ph-entry-group">
                            <button
                              type="button"
                              className="ph-entry"
                              onClick={() =>
                                onViewStudent(
                                  entry.student_id,
                                  entry.student_name,
                                )
                              }
                            >
                              {entry.student_name}
                            </button>
                            <span className="ph-inline-sub">
                              {entry.class_name}
                            </span>
                          </span>
                          <span className="ph-points">
                            {formatPoints(entry.total_points)}
                            <span className="ph-points-unit">分</span>
                          </span>
                        </div>
                        <div className="ph-bar" aria-hidden="true">
                          <span
                            style={{
                              width: `${getBarPercent(
                                entry.total_points,
                                maxStudentPoints,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="ph-empty">暂无个人积分数据</p>
            )}
          </section>
        </div>

        <aside className="ph-field" aria-labelledby="ph-field-title">
          <header className="ph-heading">
            <h2 id="ph-field-title">赛场动态</h2>
          </header>

          {pendingLoading ? (
            <p className="ph-loading">正在加载赛况…</p>
          ) : (
            <div className="ph-event-groups">
              {upcomingCompetitions.length > 0 && (
                <section className="ph-event-group" aria-label="即将开始">
                  <h3>
                    <span
                      className="ph-status-dot"
                      style={{ background: "#d48806" }}
                    />
                    即将开始
                  </h3>
                  <ul className="ph-event-list">
                    {upcomingCompetitions.map((competition) => (
                      <li key={competition.id}>
                        <button
                          type="button"
                          className="ph-event"
                          onClick={() => onViewCompetition(competition)}
                        >
                          <h4>{competition.name}</h4>
                          <p>
                            {competition.start_time
                              ? `${dayjs(competition.start_time).format(
                                  "HH:mm",
                                )} 开始`
                              : "时间待定"}
                            {competition.venue ? ` · ${competition.venue}` : ""}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {FIELD_STATUS.map((group) => {
                const events = pendingCompetitions
                  .filter((competition) => competition.status === group.key)
                  .slice(0, 3);
                if (events.length === 0) return null;
                return (
                  <section
                    className="ph-event-group"
                    key={group.key}
                    aria-label={group.label}
                  >
                    <h3>
                      <span
                        className="ph-status-dot"
                        style={{ background: group.color }}
                      />
                      {group.label}
                    </h3>
                    <ul className="ph-event-list">
                      {events.map((competition) => (
                        <li key={competition.id}>
                          <button
                            type="button"
                            className="ph-event"
                            onClick={() => onViewCompetition(competition)}
                          >
                            <h4>{competition.name}</h4>
                            <p>{competition.venue || "场地待定"}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {pendingCompetitions.length === 0 && (
                <p className="ph-empty">暂无进行中的比赛</p>
              )}
            </div>
          )}

          <div className="ph-progress">
            <div className="ph-progress-row">
              <span>赛事进度</span>
              <span>
                已完成 <strong>{completedCount}</strong> / {totalCount} 项
              </span>
            </div>
            <progress
              value={progress}
              max={100}
              aria-label={`赛事进度：已完成${completedCount}项，共${totalCount}项`}
            />
          </div>

          <div className="ph-field-actions">
            <button
              type="button"
              className="ph-action"
              onClick={onOpenCompleted}
            >
              查看历史成绩
            </button>
            <button type="button" className="ph-action" onClick={onOpenPending}>
              查看待完成比赛
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
