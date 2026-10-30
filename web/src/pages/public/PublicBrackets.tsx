import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Empty, Segmented, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { publicAPI } from "../../api/public";
import { Bracket, BracketDetail } from "../../types";
import { handleRespWithoutAuthAndNotify } from "../../utils/handleResp";
import { BRACKET_FORMAT_LABELS } from "../../utils/bracket";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useWebsite } from "../../contexts/WebsiteContext";
import BracketView from "../../components/BracketView";

const { Title, Text, Paragraph } = Typography;

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

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/")}
            style={{ paddingLeft: 0 }}
          >
            返回{websiteName ? ` ${websiteName}` : "看板"}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchDetail()}
            disabled={!selectedId}
          >
            刷新
          </Button>
        </div>

        {brackets.length > 1 && (
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <Segmented
              value={selectedId}
              onChange={(value) => navigate(`/brackets/${value}`)}
              options={brackets.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}

        <Card>
          {error ? (
            <Empty description={error} />
          ) : loading ? (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Spin />
            </div>
          ) : !detail ? (
            <Empty description="暂无公开的对阵图" />
          ) : (
            <>
              <Title level={3} style={{ marginTop: 0 }}>
                {detail.bracket.name}
              </Title>
              <div style={{ marginBottom: 16 }}>
                <Tag color="blue">
                  {BRACKET_FORMAT_LABELS[detail.bracket.format]}
                </Tag>
                <Text type="secondary">
                  {detail.participants.length} 个参赛方
                </Text>
              </div>
              {detail.bracket.description && (
                <Paragraph type="secondary" style={{ whiteSpace: "pre-wrap" }}>
                  {detail.bracket.description}
                </Paragraph>
              )}
              <BracketView detail={detail} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PublicBrackets;
