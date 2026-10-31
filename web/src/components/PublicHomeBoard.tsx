import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type {
  ClassPointsSummary,
  Competition,
  StudentPointsSummary,
} from "../types";
import { useIsMobile } from "../utils/mobile";
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

// 顶栏图标（Material Design Icons 路径，与 RM Schedule 的 mdi 图标同源）
const MDI_TOURNAMENT =
  "M2 2v2h5v4H2v2h5c1.11 0 2-.89 2-2V7h5v10H9v-1c0-1.11-.89-2-2-2H2v2h5v4H2v2h5c1.11 0 2-.89 2-2v-1h5c1.11 0 2-.89 2-2v-4h6v-2h-6V7c0-1.11-.89-2-2-2H9V4c0-1.11-.89-2-2-2H2Z";
const MDI_LOGIN =
  "M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5m9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14Z";
const MDI_ACCOUNT =
  "M12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2M7.07 18.28c.43-.9 3.05-1.78 4.93-1.78s4.5.88 4.93 1.78A7.893 7.893 0 0 1 12 20c-1.86 0-3.57-.64-4.93-1.72m11.29-1.45c-1.43-1.74-4.9-2.33-6.36-2.33s-4.93.59-6.36 2.33A7.95 7.95 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 1.82-.62 3.5-1.64 4.83M12 6c-1.94 0-3.5 1.56-3.5 3.5S10.06 13 12 13s3.5-1.56 3.5-3.5S13.94 6 12 6m0 5a1.5 1.5 0 0 1-1.5-1.5A1.5 1.5 0 0 1 12 8a1.5 1.5 0 0 1 1.5 1.5A1.5 1.5 0 0 1 12 11Z";

interface PublicHomeBoardProps {
  eventName?: string;
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
  onTitleClick: () => void;
  isLoggedIn: boolean;
  onAccountClick: () => void;
  // 有公开对阵图时展示入口
  onOpenBrackets?: () => void;
}

export default function PublicHomeBoard({
  eventName,
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
  onTitleClick,
  isLoggedIn,
  onAccountClick,
  onOpenBrackets,
}: PublicHomeBoardProps) {
  const totalCount = completedCount + pendingCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const maxClassPoints = topClasses[0]?.total_points || 1;
  const maxStudentPoints = topStudents[0]?.total_points || 1;
  const isMobile = useIsMobile();
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
      <header className="ph-header sm-glass">
        <div className="ph-brand" onClick={onTitleClick} role="presentation">
          <img className="ph-emblem" src="/school-emblem.svg" alt="行知校徽" />
          {isMobile ? (
            <div className="ph-field-block ph-field-block--grow">
              <span className="ph-field-label">上海市行知中学</span>
              <h1 className="ph-field-value">
                {eventName?.trim() || "运动会"}
              </h1>
            </div>
          ) : (
            <>
              <div className="ph-field-block">
                <span className="ph-field-label">学校</span>
                <span className="ph-field-value ph-school">上海市行知中学</span>
              </div>
              <div className="ph-field-block ph-field-block--grow">
                <span className="ph-field-label">赛事</span>
                <h1 className="ph-field-value">
                  {eventName?.trim() || "运动会"}
                </h1>
              </div>
            </>
          )}
        </div>
        <div className="ph-side">
          {onOpenBrackets && (
            <button
              type="button"
              className={`ph-login${isMobile ? " ph-login--compact" : ""}`}
              onClick={onOpenBrackets}
              aria-label="对阵图"
              title={isMobile ? "对阵图" : undefined}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={MDI_TOURNAMENT} />
              </svg>
              {!isMobile && "对阵图"}
            </button>
          )}
          <button
            type="button"
            className={`ph-login${isMobile ? " ph-login--compact" : ""}`}
            onClick={onAccountClick}
            title={isLoggedIn ? "进入系统" : "登录"}
            aria-label={isLoggedIn ? "进入系统" : "登录"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={isLoggedIn ? MDI_ACCOUNT : MDI_LOGIN} />
            </svg>
            {!isMobile && (
              <span className="ph-login-label">
                {isLoggedIn ? "进入系统" : "登录"}
              </span>
            )}
          </button>
        </div>
      </header>

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
