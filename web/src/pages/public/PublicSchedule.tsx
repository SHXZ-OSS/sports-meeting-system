import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, Spin } from "antd";
import { publicAPI } from "../../api/public";
import { Bracket, BracketDetail, PublicScheduleItem } from "../../types";
import { handleRespWithoutAuthAndNotify } from "../../utils/handleResp";
import { usePageTitle } from "../../hooks/usePageTitle";
import PublicTopBar from "../../components/public/PublicTopBar";
import type { ParticipantPick } from "../../components/public/PublicSearchDialog";
import { TeamAnalysisSheet } from "../../components/bracket/AnalysisSheets";
import ScheduleViews from "../../components/schedule/ScheduleViews";
import { publicScheduleEntries } from "../../components/schedule/scheduleEntries";
import "./PublicSchedule.css";

// 定时刷新，跟上进行中的比赛
const REFRESH_INTERVAL_MS = 60_000;

interface SheetState {
  detail: BracketDetail;
  participantId: number;
  open: boolean;
}

/**
 * 赛程：当前届次全部项目的日历与甘特图
 * 使用对阵图并已排期的项目按场次展示，其余项目按项目开始、结束时间展示
 */
const PublicSchedule: React.FC = () => {
  const navigate = useNavigate();
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [items, setItems] = useState<PublicScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<SheetState | null>(null);

  usePageTitle("赛程");

  useEffect(() => {
    publicAPI
      .getBrackets()
      .then((resp) => handleRespWithoutAuthAndNotify(resp, setBrackets));
  }, []);

  const fetchSchedule = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const resp = await publicAPI.getSchedule();
    handleRespWithoutAuthAndNotify(
      resp,
      (data) => {
        setItems(data);
        setError("");
        setLoading(false);
      },
      (message) => {
        setError(message);
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    void fetchSchedule();
    const timer = window.setInterval(
      () => void fetchSchedule(true),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [fetchSchedule]);

  // 点击条目：对阵比赛进入对阵图，项目在成绩看板中打开详情
  const entries = useMemo(
    () =>
      publicScheduleEntries(items, (item) => {
        if (item.kind === "match" && item.bracket_id) {
          navigate(`/brackets/${item.bracket_id}`);
        } else {
          navigate(`/?id=${item.competition_id}`);
        }
      }),
    [items, navigate],
  );

  const handlePick = useCallback(
    (pick: ParticipantPick) =>
      navigate(`/brackets/${pick.bracketId}`, { state: { pick } }),
    [navigate],
  );

  return (
    <div className="sm-app-bg" style={{ minHeight: "100vh" }}>
      <PublicTopBar
        page="schedule"
        brackets={brackets}
        analyzeLabel="请先通过搜索选择队伍"
        onPickParticipant={handlePick}
        onAnalyzeParticipant={(detail, participantId) =>
          setSheet({ detail, participantId, open: true })
        }
        onRefresh={() => void fetchSchedule()}
      >
        <div className="pt-info">
          <span className="pt-info-name">赛程</span>
          <span className="pt-info-desc">
            使用对阵图的项目按场次显示，其余项目按项目时间显示
          </span>
        </div>
      </PublicTopBar>

      <main className="ps-content">
        {error ? (
          <Empty description={error} />
        ) : loading ? (
          <div className="ps-state">
            <Spin />
          </div>
        ) : (
          <ScheduleViews
            tone="public"
            entries={entries}
            defaultMode="gantt"
            groupOptions
            pxPerMinute={3}
            summary
            emptyText="暂无已安排时间的项目"
          />
        )}
      </main>

      {sheet && (
        <TeamAnalysisSheet
          detail={sheet.detail}
          participantId={sheet.participantId}
          open={sheet.open}
          onClose={() => setSheet({ ...sheet, open: false })}
        />
      )}
    </div>
  );
};

export default PublicSchedule;
