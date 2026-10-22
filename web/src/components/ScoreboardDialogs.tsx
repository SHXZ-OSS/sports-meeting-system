import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import type { Competition, PointDetail, Registration, Score } from "../types";
import {
  getGenderText,
  getScoreboardRankingColor,
  isClassScoredType,
} from "../utils/competition";
import CompetitionDescription from "./CompetitionDescription";
import "./ScoreboardDialogs.css";

export interface StudentModalState {
  id: number;
  studentId: number;
  studentName: string;
  scores: Score[];
  loading: boolean;
  zIndex: number;
  competitionUnits: Record<number, string>;
  open: boolean;
  pointsDetails: Record<number, number>;
  pointDetails: PointDetail[];
}

export interface ClassPointsModalState {
  id: number;
  classId: number;
  className: string;
  pointsDetails: PointDetail[];
  loading: boolean;
  zIndex: number;
  open: boolean;
}

export interface DetailModalState {
  id: number;
  competitionId: number;
  competition: Competition;
  scores: Score[];
  registrations: Registration[];
  loading: boolean;
  zIndex: number;
  open: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  completed: "已完成",
  approved: "未开始",
  checking_in: "检录中",
  in_progress: "进行中",
  pending_score_review: "成绩审核中",
  rejected: "已驳回",
  pending_approval: "待审核",
};

const formatScore = (score: number) =>
  String(Number(score.toFixed(2))).replace(/\.?0+$/, "");

const formatPoints = (points: number) =>
  String(Number(points.toFixed(1))).replace(/\.0$/, "");

const formatSignedPoints = (points: number) =>
  `${points > 0 ? "+" : ""}${formatPoints(points)}`;

const formatTime = (value: string) => {
  const date = dayjs(value);
  return date.isValid() ? date.format("HH:mm") : "时间未记录";
};

const formatMoment = (value?: string) => {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY/MM/DD HH:mm") : null;
};

const formatSchedule = (start?: string, end?: string) => {
  if (!start) return "时间待定";
  const startDate = dayjs(start);
  if (!startDate.isValid()) return "时间待定";
  const date = startDate.format("YYYY/MM/DD");
  const startTime = startDate.format("HH:mm");
  if (!end) return `${date} ${startTime}`;
  const endDate = dayjs(end);
  if (!endDate.isValid()) return `${date} ${startTime}`;
  if (endDate.isSame(startDate, "day")) {
    return `${date} ${startTime}–${endDate.format("HH:mm")}`;
  }
  return `${date} ${startTime} – ${endDate.format("MM/DD HH:mm")}`;
};

const formatClock = (value?: string) => {
  if (!value) return "待定";
  const date = dayjs(value);
  return date.isValid() ? date.format("HH:mm") : "待定";
};

function RankChip({ ranking }: { ranking?: number }) {
  if (!ranking) {
    return <span className="sd-rank-chip sd-rank-chip--empty">—</span>;
  }
  const color = getScoreboardRankingColor(ranking);
  return (
    <span
      className="sd-rank-chip"
      style={
        color
          ? { color, background: `${color}14`, borderColor: `${color}33` }
          : undefined
      }
    >
      第 {ranking} 名
    </span>
  );
}

function StatusLabel({ status }: { status: string }) {
  return (
    <span className="sd-status" data-status={status}>
      <span className="sd-status-dot" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  if (!onClick) return <span className="sd-link-static">{children}</span>;
  return (
    <button type="button" className="sd-link" onClick={onClick}>
      {children}
    </button>
  );
}

interface DemoDialogProps {
  open: boolean;
  title: string;
  zIndex: number;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

interface EscapeCloseEntry {
  id: number;
  zIndex: number;
  onClose: () => void;
}

// 多个弹窗叠加时只允许 zIndex 最高的弹窗响应 ESC，避免一次按键关闭全部弹窗
const escapeCloseEntries = new Map<number, EscapeCloseEntry>();
let nextEscapeCloseId = 1;
let escapeCloseListening = false;

const handleEscapeClose = (event: KeyboardEvent) => {
  if (event.key !== "Escape") {
    return;
  }

  let topmost: EscapeCloseEntry | undefined;
  escapeCloseEntries.forEach((entry) => {
    if (!topmost || entry.zIndex >= topmost.zIndex) {
      topmost = entry;
    }
  });
  topmost?.onClose();
};

const listenEscapeClose = () => {
  if (escapeCloseListening) {
    return;
  }
  window.addEventListener("keydown", handleEscapeClose);
  escapeCloseListening = true;
};

const unlistenEscapeClose = () => {
  if (!escapeCloseListening || escapeCloseEntries.size > 0) {
    return;
  }
  window.removeEventListener("keydown", handleEscapeClose);
  escapeCloseListening = false;
};

function DemoDialog({
  open,
  title,
  zIndex,
  size = "md",
  onClose,
  children,
  footer,
}: DemoDialogProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escapeIdRef = useRef<number | null>(null);
  if (escapeIdRef.current === null) {
    escapeIdRef.current = nextEscapeCloseId;
    nextEscapeCloseId += 1;
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || escapeIdRef.current === null) return;

    const id = escapeIdRef.current;
    escapeCloseEntries.set(id, {
      id,
      zIndex,
      onClose: () => onCloseRef.current(),
    });
    listenEscapeClose();

    return () => {
      escapeCloseEntries.delete(id);
      unlistenEscapeClose();
    };
  }, [open, zIndex]);

  if (!open) return null;

  return createPortal(
    <div
      className="sd-overlay"
      style={{ zIndex }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`sd-modal sd-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sd-head">
          <h2 className="sd-title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="sd-close"
            aria-label="关闭"
            onClick={onClose}
            autoFocus
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>
        <div className="sd-body">{children}</div>
        {footer && <footer className="sd-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

interface CompetitionListDialogProps {
  open: boolean;
  title: string;
  items: Competition[];
  loading: boolean;
  zIndex: number;
  showStatus?: boolean;
  onClose: () => void;
  onSelect: (competition: Competition) => void;
}

function CompetitionListDialog({
  open,
  title,
  items,
  loading,
  zIndex,
  showStatus = false,
  onClose,
  onSelect,
}: CompetitionListDialogProps) {
  return (
    <DemoDialog
      open={open}
      title={title}
      size="sm"
      zIndex={zIndex}
      onClose={onClose}
    >
      {loading ? (
        <p className="sd-loading">正在加载…</p>
      ) : items.length > 0 ? (
        <div className="sd-list">
          {items.map((competition) => (
            <button
              type="button"
              className="sd-row"
              key={competition.id}
              onClick={() => onSelect(competition)}
            >
              <span className="sd-row-name">{competition.name}</span>
              <span className="sd-row-side">
                {showStatus && <StatusLabel status={competition.status} />}
                <svg
                  className="sd-chevron"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M7.5 4.5 13 10l-5.5 5.5" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="sd-empty">暂无记录</p>
      )}
    </DemoDialog>
  );
}

function CompetitionTimelineDialog({
  open,
  title,
  items,
  loading,
  zIndex,
  onClose,
  onSelect,
}: CompetitionListDialogProps) {
  const sorted = [...items].sort((a, b) => {
    const aTime = a.start_time
      ? dayjs(a.start_time).valueOf()
      : Number.MAX_SAFE_INTEGER;
    const bTime = b.start_time
      ? dayjs(b.start_time).valueOf()
      : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const groups: Array<{
    key: string;
    label: string;
    items: Competition[];
  }> = [];
  const groupIndex = new Map<string, number>();
  sorted.forEach((competition) => {
    const date = competition.start_time ? dayjs(competition.start_time) : null;
    const validDate = date && date.isValid() ? date : null;
    const key = validDate ? validDate.format("YYYY-MM-DD") : "unscheduled";
    const label = validDate ? validDate.format("M月D日") : "时间待定";
    let index = groupIndex.get(key);
    if (index === undefined) {
      index = groups.length;
      groupIndex.set(key, index);
      groups.push({ key, label, items: [] });
    }
    groups[index].items.push(competition);
  });

  return (
    <DemoDialog
      open={open}
      title={title}
      size="md"
      zIndex={zIndex}
      onClose={onClose}
    >
      {loading ? (
        <p className="sd-loading">正在加载…</p>
      ) : groups.length === 0 ? (
        <p className="sd-empty">暂无待完成比赛</p>
      ) : (
        <div className="sd-timeline">
          {groups.map((group) => (
            <section className="sd-timeline-group" key={group.key}>
              <h3 className="sd-timeline-day">{group.label}</h3>
              <ol className="sd-timeline-list">
                {group.items.map((competition) => (
                  <li className="sd-timeline-item" key={competition.id}>
                    <time
                      className="sd-timeline-time"
                      dateTime={competition.start_time}
                    >
                      <span className="sd-timeline-clock">
                        {formatClock(competition.start_time)}
                      </span>
                    </time>
                    <span className="sd-timeline-rail" aria-hidden="true">
                      <span
                        className="sd-timeline-dot"
                        data-status={competition.status}
                      />
                    </span>
                    <button
                      type="button"
                      className="sd-timeline-body"
                      onClick={() => onSelect(competition)}
                    >
                      <span className="sd-timeline-title">
                        <span className="sd-timeline-name">
                          {competition.name}
                        </span>
                        <svg
                          className="sd-chevron"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path d="M7.5 4.5 13 10l-5.5 5.5" />
                        </svg>
                      </span>
                      <span className="sd-timeline-meta">
                        <span>{competition.venue || "场地待定"}</span>
                        <StatusLabel status={competition.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </DemoDialog>
  );
}

function StudentScoresDialog({
  modal,
  onClose,
  onViewCompetition,
}: {
  modal: StudentModalState;
  onClose: () => void;
  onViewCompetition: (competitionId: number) => void;
}) {
  const scoreByCompetition = new Map<number, Score>();
  modal.scores.forEach((score) => {
    if (!scoreByCompetition.has(score.competition_id)) {
      scoreByCompetition.set(score.competition_id, score);
    }
  });

  // 个人成绩只展示有实际成绩的排名得分，活动类自定义得分不在这里出现。
  const pointEntries = modal.pointDetails.filter(
    (detail) =>
      detail.point_type === "ranking" &&
      scoreByCompetition.has(detail.competition_id),
  );

  const entries: Array<{
    key: string;
    competitionId: number;
    competitionName: string;
    points?: number;
    ranking?: number;
    score?: Score;
  }> =
    pointEntries.length > 0
      ? pointEntries.map((detail) => ({
          key: `point-${detail.id}`,
          competitionId: detail.competition_id,
          competitionName: detail.competition_name,
          points: detail.points,
          ranking: detail.ranking,
          score: scoreByCompetition.get(detail.competition_id),
        }))
      : modal.scores.map((score) => ({
          key: `score-${score.id}`,
          competitionId: score.competition_id,
          competitionName: score.competition_name,
          points: modal.pointsDetails[score.competition_id],
          ranking: score.ranking,
          score,
        }));

  const totalPoints = Array.from(
    new Map(
      entries.map((entry) => [entry.competitionId, entry.points ?? 0]),
    ).values(),
  ).reduce((sum, points) => sum + points, 0);

  return (
    <DemoDialog
      open={modal.open}
      title={`${modal.studentName} · 个人成绩`}
      size="md"
      zIndex={modal.zIndex}
      onClose={onClose}
    >
      {modal.loading ? (
        <p className="sd-loading">正在加载…</p>
      ) : entries.length === 0 ? (
        <p className="sd-empty">该学生暂无成绩数据</p>
      ) : (
        <>
          <ul className="sd-entries">
            {entries.map((entry) => {
              const unit = entry.score
                ? modal.competitionUnits[entry.competitionId] ||
                  entry.score.unit ||
                  ""
                : "";
              const rankColor = getScoreboardRankingColor(entry.ranking);
              return (
                <li className="sd-entry" key={entry.key}>
                  <div className="sd-entry-top">
                    <LinkButton
                      onClick={() => onViewCompetition(entry.competitionId)}
                    >
                      <span className="sd-entry-name">
                        {entry.competitionName}
                      </span>
                    </LinkButton>
                    <span
                      className="sd-entry-points"
                      style={{ color: rankColor ?? "var(--sd-blue)" }}
                    >
                      {entry.points === undefined
                        ? "—"
                        : formatSignedPoints(entry.points)}
                    </span>
                  </div>
                  <div className="sd-entry-meta">
                    {entry.score && (
                      <span>
                        {formatScore(entry.score.score)} {unit}
                      </span>
                    )}
                    <RankChip ranking={entry.ranking} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sd-summary">
            <div className="sd-summary-total">
              <span>比赛得分</span>
              <span>{formatPoints(totalPoints)} 分</span>
            </div>
          </div>
        </>
      )}
    </DemoDialog>
  );
}

function ClassPointsDialog({
  modal,
  onClose,
}: {
  modal: ClassPointsModalState;
  onClose: () => void;
}) {
  const details = modal.pointsDetails ?? [];
  const rankingPoints = details
    .filter((detail) => detail.point_type === "ranking")
    .reduce((sum, detail) => sum + detail.points, 0);
  const customPoints = details
    .filter((detail) => detail.point_type === "custom")
    .reduce((sum, detail) => sum + detail.points, 0);
  const totalPoints = rankingPoints + customPoints;

  return (
    <DemoDialog
      open={modal.open}
      title={`${modal.className} · 得分明细`}
      size="lg"
      zIndex={modal.zIndex}
      onClose={onClose}
    >
      {modal.loading ? (
        <p className="sd-loading">正在加载…</p>
      ) : details.length === 0 ? (
        <p className="sd-empty">该班级暂无得分数据</p>
      ) : (
        <>
          <ul className="sd-entries">
            {details.map((detail) => {
              const isRanking = detail.point_type === "ranking";
              const rankColor = getScoreboardRankingColor(detail.ranking);
              return (
                <li className="sd-entry" key={detail.id}>
                  <div className="sd-entry-top">
                    <span className="sd-entry-name">
                      {detail.competition_name}
                    </span>
                    <span
                      className="sd-entry-points"
                      style={{
                        color: isRanking
                          ? (rankColor ?? "var(--sd-blue)")
                          : "#3a8f5f",
                      }}
                    >
                      {formatSignedPoints(detail.points)}
                    </span>
                  </div>
                  <div className="sd-entry-meta">
                    <span
                      className={`sd-type ${
                        isRanking ? "sd-type--ranking" : "sd-type--custom"
                      }`}
                    >
                      {isRanking ? "排名得分" : "自定义得分"}
                    </span>
                    <RankChip ranking={detail.ranking} />
                    <span>{formatTime(detail.created_at)}</span>
                  </div>
                  {detail.reason && (
                    <p className="sd-entry-note">说明：{detail.reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="sd-summary">
            <div className="sd-summary-row">
              <span>排名得分</span>
              <span>{formatPoints(rankingPoints)} 分</span>
            </div>
            <div className="sd-summary-row">
              <span>自定义得分</span>
              <span>{formatPoints(customPoints)} 分</span>
            </div>
            <div className="sd-summary-total">
              <span>合计</span>
              <span>{formatPoints(totalPoints)} 分</span>
            </div>
          </div>
        </>
      )}
    </DemoDialog>
  );
}

function CompetitionDetailDialog({
  modal,
  onClose,
  onReplay,
  onViewStudent,
}: {
  modal: DetailModalState;
  onClose: () => void;
  onReplay: (competition: Competition) => void;
  onViewStudent: (studentId: number, studentName: string) => void;
}) {
  const { competition } = modal;
  const isCompleted = competition.status === "completed";

  return (
    <DemoDialog
      open={modal.open}
      title={`${competition.name} · 比赛详情`}
      size="lg"
      zIndex={modal.zIndex}
      onClose={onClose}
      footer={
        isCompleted ? (
          <button
            type="button"
            className="sd-text-button"
            onClick={() => onReplay(competition)}
          >
            重播成绩动画
          </button>
        ) : undefined
      }
    >
      <div className="sd-meta-line">
        <span className="sd-meta-item">
          <span className="sd-meta-label">类型</span>
          <span className="sd-meta-value">
            {competition.competition_type === "team"
              ? "团体赛"
              : competition.competition_type === "school"
                ? "全校性"
                : "个人赛"}
          </span>
        </span>
        <span className="sd-meta-item">
          <span className="sd-meta-label">组别</span>
          <span className="sd-meta-value">
            {getGenderText(competition.gender)}
          </span>
        </span>
        <span className="sd-meta-item">
          <span className="sd-meta-label">场地</span>
          <span className="sd-meta-value">
            {competition.venue || "场地待定"}
          </span>
        </span>
        <span className="sd-meta-item">
          <span className="sd-meta-label">时间</span>
          <span className="sd-meta-value">
            {formatSchedule(competition.start_time, competition.end_time)}
          </span>
        </span>
        {competition.submitter_name && (
          <span className="sd-meta-item">
            <span className="sd-meta-label">推荐人</span>
            <span className="sd-meta-value">{competition.submitter_name}</span>
          </span>
        )}
        <span className="sd-meta-item">
          <span className="sd-meta-label">状态</span>
          <span className="sd-meta-value">
            <StatusLabel status={competition.status} />
          </span>
        </span>
      </div>

      <CompetitionDescription
        description={competition.description}
        clampLines={4}
      />

      {isCompleted && (
        <section className="sd-result-facts">
          <h3 className="sd-section-title">比赛成绩</h3>
          <dl className="sd-facts">
            <div>
              <dt>成绩提交人</dt>
              <dd>{competition.score_submitter_name || "未提交"}</dd>
            </div>
            <div>
              <dt>成绩审核人</dt>
              <dd>{competition.score_reviewer_name || "未审核"}</dd>
            </div>
            <div>
              <dt>成绩提交时间</dt>
              <dd>{formatMoment(competition.score_created_at) || "未提交"}</dd>
            </div>
            <div>
              <dt>成绩审核时间</dt>
              <dd>{formatMoment(competition.score_reviewed_at) || "未审核"}</dd>
            </div>
          </dl>
        </section>
      )}

      {isCompleted ? (
        modal.loading ? (
          <p className="sd-loading">正在加载…</p>
        ) : modal.scores.length === 0 ? (
          <p className="sd-empty">暂无成绩数据</p>
        ) : (
          <ul className="sd-results">
            {modal.scores.map((score) => {
              const rankColor = getScoreboardRankingColor(score.ranking);
              return (
                <li className="sd-result" key={score.id}>
                  <span
                    className="sd-result-rank"
                    style={rankColor ? { color: rankColor } : undefined}
                  >
                    {score.ranking || "—"}
                  </span>
                  <div className="sd-result-main">
                    <div className="sd-result-name">
                      {isClassScoredType(competition.competition_type) ? (
                        <span>{score.class_name}</span>
                      ) : (
                        <>
                          <LinkButton
                            onClick={
                              score.student_id
                                ? () =>
                                    onViewStudent(
                                      score.student_id as number,
                                      score.student_name,
                                    )
                                : undefined
                            }
                          >
                            {score.student_name}
                          </LinkButton>
                          <span className="sd-result-class">
                            {score.class_name}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="sd-result-meta">
                      <span>
                        {formatScore(score.score)} {competition.unit}
                      </span>
                    </div>
                  </div>
                  <span
                    className="sd-result-points"
                    style={{
                      color: score.point
                        ? (rankColor ?? "var(--sd-blue)")
                        : "var(--sd-muted)",
                    }}
                  >
                    {score.point ? (
                      <>
                        {formatPoints(score.point)}
                        <span>分</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : modal.loading ? (
        <p className="sd-loading">正在加载…</p>
      ) : competition.competition_type === "school" ? (
        <p className="sd-empty">全校性比赛，无需报名</p>
      ) : modal.registrations.length === 0 ? (
        <p className="sd-empty">该比赛暂无报名数据</p>
      ) : (
        <ul className="sd-entries">
          {modal.registrations.map((registration) => (
            <li className="sd-entry" key={registration.id}>
              <div className="sd-entry-top">
                <LinkButton
                  onClick={() =>
                    onViewStudent(
                      registration.student_id,
                      registration.student_name,
                    )
                  }
                >
                  <span className="sd-entry-name">
                    {registration.student_name}
                  </span>
                </LinkButton>
                <span className="sd-entry-class">
                  {registration.class_name}
                </span>
              </div>
              <div className="sd-entry-meta">
                <span>{getGenderText(registration.student_gender)}</span>
                <span>
                  {registration.created_at
                    ? `报名 ${dayjs(registration.created_at).format("MM-DD HH:mm")}`
                    : "报名时间未记录"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DemoDialog>
  );
}

interface ScoreboardDialogsProps {
  completedOpen: boolean;
  completedLoading: boolean;
  completedCompetitions: Competition[];
  completedZIndex: number;
  onCloseCompleted: () => void;
  pendingOpen: boolean;
  pendingLoading: boolean;
  pendingCompetitions: Competition[];
  pendingZIndex: number;
  onClosePending: () => void;
  studentModals: StudentModalState[];
  onCloseStudent: (id: number) => void;
  classPointsModals: ClassPointsModalState[];
  onCloseClassPoints: (id: number) => void;
  detailModals: DetailModalState[];
  onCloseDetail: (id: number) => void;
  onSelectCompetition: (competition: Competition) => void;
  onViewCompetitionById: (competitionId: number) => void;
  onViewStudent: (studentId: number, studentName: string) => void;
  onReplay: (competition: Competition) => void;
}

export default function ScoreboardDialogs({
  completedOpen,
  completedLoading,
  completedCompetitions,
  completedZIndex,
  onCloseCompleted,
  pendingOpen,
  pendingLoading,
  pendingCompetitions,
  pendingZIndex,
  onClosePending,
  studentModals,
  onCloseStudent,
  classPointsModals,
  onCloseClassPoints,
  detailModals,
  onCloseDetail,
  onSelectCompetition,
  onViewCompetitionById,
  onViewStudent,
  onReplay,
}: ScoreboardDialogsProps) {
  return (
    <>
      <CompetitionListDialog
        open={completedOpen}
        title="已完成比赛"
        items={completedCompetitions}
        loading={completedLoading}
        zIndex={completedZIndex}
        onClose={onCloseCompleted}
        onSelect={onSelectCompetition}
      />
      <CompetitionTimelineDialog
        open={pendingOpen}
        title="待完成比赛"
        items={pendingCompetitions}
        loading={pendingLoading}
        zIndex={pendingZIndex}
        onClose={onClosePending}
        onSelect={onSelectCompetition}
      />
      {studentModals.map((modal) => (
        <StudentScoresDialog
          key={modal.id}
          modal={modal}
          onClose={() => onCloseStudent(modal.id)}
          onViewCompetition={onViewCompetitionById}
        />
      ))}
      {classPointsModals.map((modal) => (
        <ClassPointsDialog
          key={modal.id}
          modal={modal}
          onClose={() => onCloseClassPoints(modal.id)}
        />
      ))}
      {detailModals.map((modal) => (
        <CompetitionDetailDialog
          key={modal.id}
          modal={modal}
          onClose={() => onCloseDetail(modal.id)}
          onReplay={onReplay}
          onViewStudent={onViewStudent}
        />
      ))}
    </>
  );
}
