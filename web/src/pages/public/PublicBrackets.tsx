import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Empty, Spin } from "antd";
import { publicAPI } from "../../api/public";
import { Bracket, BracketDetail } from "../../types";
import { handleRespWithoutAuthAndNotify } from "../../utils/handleResp";
import { BRACKET_FORMAT_LABELS, getBracketChampion } from "../../utils/bracket";
import { usePageTitle } from "../../hooks/usePageTitle";
import BracketView from "../../components/BracketView";
import { TeamAnalysisSheet } from "../../components/bracket/AnalysisSheets";
import PublicTopBar from "../../components/public/PublicTopBar";
import type { ParticipantPick } from "../../components/public/PublicSearchDialog";

// 比赛进行中时定时刷新
const REFRESH_INTERVAL_MS = 30_000;

// 从首页搜索“选中”跳转过来时携带的参赛方
interface PickState {
  pick?: ParticipantPick;
}

interface SheetState {
  detail: BracketDetail;
  participantId: number;
  open: boolean;
}

const PublicBrackets: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [detail, setDetail] = useState<BracketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 对阵图中选中的参赛方（RM selectedPlayer），按对阵图 id 区分
  const [selected, setSelected] = useState<{
    bracketId: number;
    id: number | null;
  } | null>(() => {
    const pick = (location.state as PickState | null)?.pick;
    return pick ? { bracketId: pick.bracketId, id: pick.participantId } : null;
  });
  // 队伍分析弹层：记录所属对阵图（搜索结果可来自其他对阵图）
  const [sheet, setSheet] = useState<SheetState | null>(null);

  usePageTitle(detail?.bracket.name ?? "对阵图");

  const selectedId = id ? Number(id) : brackets[0]?.id;

  useEffect(() => {
    publicAPI.getBrackets().then((resp) =>
      handleRespWithoutAuthAndNotify(
        resp,
        (data) => {
          setBrackets(data);
          if (data.length === 0) setLoading(false);
        },
        (message) => {
          setError(message);
          setLoading(false);
        },
      ),
    );
  }, []);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!selectedId) return;
      if (!silent) setLoading(true);
      const resp = await publicAPI.getBracket(selectedId);
      handleRespWithoutAuthAndNotify(
        resp,
        (data) => {
          setDetail(data);
          setError("");
          setLoading(false);
        },
        (message) => {
          setError(message);
          setLoading(false);
        },
      );
    },
    [selectedId],
  );

  useEffect(() => {
    fetchDetail();
    const timer = window.setInterval(
      () => fetchDetail(true),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [fetchDetail]);

  // 选中状态已在初始化时读入，清掉路由 state，避免刷新页面后重复选中
  useEffect(() => {
    if ((location.state as PickState | null)?.pick) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const selectedParticipantId =
    detail && selected?.bracketId === detail.bracket.id ? selected.id : null;
  const selectedParticipant =
    selectedParticipantId != null
      ? detail?.participants.find((p) => p.id === selectedParticipantId)
      : undefined;
  const onSelectParticipant = useCallback(
    (participantId: number | null) => {
      if (detail)
        setSelected({ bracketId: detail.bracket.id, id: participantId });
    },
    [detail],
  );

  // 搜索“选中”：选中参赛方，不在当前对阵图时切换过去
  const handlePick = useCallback(
    (pick: ParticipantPick) => {
      setSelected({ bracketId: pick.bracketId, id: pick.participantId });
      if (pick.bracketId !== selectedId) {
        navigate(`/brackets/${pick.bracketId}`);
      }
    },
    [navigate, selectedId],
  );

  // 搜索“分析”：当前对阵图内的队伍同时选中，关闭弹层后可在图中定位
  const handleAnalyzeParticipant = useCallback(
    (target: BracketDetail, participantId: number) => {
      if (target.bracket.id === detail?.bracket.id) {
        setSelected({ bracketId: target.bracket.id, id: participantId });
      }
      setSheet({ detail: target, participantId, open: true });
    },
    [detail],
  );

  // 弹层所属对阵图正在展示时使用最新数据
  const sheetDetail =
    sheet && detail && sheet.detail.bracket.id === detail.bracket.id
      ? detail
      : sheet?.detail;

  return (
    <div
      className={`sm-app-bg pb-page${detail && getBracketChampion(detail) != null ? " sm-app-bg--final" : ""}`}
    >
      {/* 顶栏：RM Schedule 的毛玻璃 Season / Zone 选择栏 */}
      <PublicTopBar
        brackets={brackets}
        currentBracketId={selectedId}
        currentDetail={detail}
        analyzeLabel={
          selectedParticipant
            ? `分析队伍 ${selectedParticipant.name}`
            : "请先在对阵图中点击选择队伍"
        }
        onAnalyze={
          detail && selectedParticipant
            ? () =>
                setSheet({
                  detail,
                  participantId: selectedParticipant.id,
                  open: true,
                })
            : undefined
        }
        onPickParticipant={handlePick}
        onAnalyzeParticipant={handleAnalyzeParticipant}
        onRefresh={selectedId ? () => fetchDetail() : undefined}
      >
        {detail && (
          <div className="pt-info">
            <span className="pt-info-tag">
              {BRACKET_FORMAT_LABELS[detail.bracket.format]}
            </span>
            <span className="pt-info-tag is-count">
              {detail.participants.length} 个参赛方
            </span>
            <span className="pt-info-name">{detail.bracket.name}</span>
            {detail.bracket.description && (
              <span className="pt-info-desc">{detail.bracket.description}</span>
            )}
          </div>
        )}
      </PublicTopBar>

      <main className="pb-content">
        {error ? (
          <Empty description={error} />
        ) : loading ? (
          <div className="pb-state">
            <Spin />
          </div>
        ) : !detail ? (
          <Empty description="暂无公开的对阵图" />
        ) : (
          <BracketView
            detail={detail}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={onSelectParticipant}
          />
        )}
      </main>

      {sheet && sheetDetail && (
        <TeamAnalysisSheet
          detail={sheetDetail}
          participantId={sheet.participantId}
          open={sheet.open}
          onClose={() => setSheet({ ...sheet, open: false })}
        />
      )}
    </div>
  );
};

export default PublicBrackets;
