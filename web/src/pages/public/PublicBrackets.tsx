import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Empty, Select, Spin } from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { publicAPI } from "../../api/public";
import { Bracket, BracketDetail } from "../../types";
import { handleRespWithoutAuthAndNotify } from "../../utils/handleResp";
import { BRACKET_FORMAT_LABELS, getBracketChampion } from "../../utils/bracket";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useWebsite } from "../../contexts/WebsiteContext";
import BracketView from "../../components/BracketView";

// 比赛进行中时定时刷新
const REFRESH_INTERVAL_MS = 30_000;

const PublicBrackets: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { name: websiteName } = useWebsite();
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [detail, setDetail] = useState<BracketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const current = brackets.find((b) => b.id === selectedId);
  const bracketName = detail?.bracket.name ?? current?.name ?? "对阵图";

  return (
    <div
      className={`sm-app-bg pb-page${detail && getBracketChampion(detail) != null ? " sm-app-bg--final" : ""}`}
    >
      {/* 顶栏：照搬 RM Schedule 的毛玻璃 Season / Zone 选择栏 */}
      <header className="pb-bar">
        <div className="pb-bar-row">
          <button
            type="button"
            className="pb-back"
            onClick={() => navigate("/")}
            aria-label={`返回${websiteName ? ` ${websiteName}` : "看板"}`}
            title={`返回${websiteName ? ` ${websiteName}` : "看板"}`}
          >
            <ArrowLeftOutlined />
          </button>
          <div className="pb-field is-format">
            <span className="pb-field-label">赛制</span>
            <span className="pb-field-value">
              {detail ? BRACKET_FORMAT_LABELS[detail.bracket.format] : "-"}
            </span>
          </div>
          <div className="pb-field">
            <span className="pb-field-label" id="pb-bracket-label">
              对阵图
            </span>
            {brackets.length > 1 ? (
              <Select
                variant="borderless"
                aria-labelledby="pb-bracket-label"
                value={selectedId}
                onChange={(value) => navigate(`/brackets/${value}`)}
                options={brackets.map((b) => ({ value: b.id, label: b.name }))}
                popupMatchSelectWidth={false}
              />
            ) : (
              <span className="pb-field-value">{bracketName}</span>
            )}
          </div>
          <div className="pb-spacer" />
          {websiteName && (
            <div className="pb-brand">
              <span className="pb-brand-text">{websiteName}</span>
            </div>
          )}
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => fetchDetail()}
            disabled={!selectedId}
            aria-label="刷新"
            title="刷新"
          >
            <ReloadOutlined />
          </button>
        </div>
        {detail && (
          <div className="pb-info">
            <span className="bv-tag pb-info-format">
              {BRACKET_FORMAT_LABELS[detail.bracket.format]}
            </span>
            <span className="bv-tag is-progress">
              {detail.participants.length} 个参赛方
            </span>
            <span>{detail.bracket.name}</span>
            {detail.bracket.description && (
              <span className="pb-info-desc">{detail.bracket.description}</span>
            )}
          </div>
        )}
      </header>

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
          <BracketView detail={detail} />
        )}
      </main>
    </div>
  );
};

export default PublicBrackets;
