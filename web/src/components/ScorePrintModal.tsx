import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Modal, QRCode, Space } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Competition, Score } from "../types";
import { useWebsite } from "../contexts/WebsiteContext";
import { isClassScoredType } from "../utils/competition";
import { compareClassThenName } from "../utils/sort";
import "./ScorePrintModal.css";

interface ScorePrintModalProps {
  open: boolean;
  onClose: () => void;
  competition: Competition;
  scores: Score[];
}

const formatScore = (value: number) =>
  String(Number(value.toFixed(2))).replace(/\.?0+$/, "");

const formatTimestamp = (value?: string) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";

const LivePrintTime: React.FC = () => {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="score-print-printed-at">
      打印时间 {now.format("YYYY-MM-DD HH:mm")}
    </span>
  );
};

const ScorePrintModal: React.FC<ScorePrintModalProps> = ({
  open,
  onClose,
  competition,
  scores,
}) => {
  const sheet = <ScorePrintSheet competition={competition} scores={scores} />;

  return (
    <>
      <Modal
        title={
          <Space>
            <PrinterOutlined />
            打印成绩
          </Space>
        }
        open={open}
        onCancel={onClose}
        width={1040}
        zIndex={1100}
        footer={
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => window.print()}
            >
              打印 / 另存为 PDF
            </Button>
          </Space>
        }
        styles={{
          body: {
            padding: 20,
            maxHeight: "80vh",
            overflow: "auto",
            background: "#eef1f6",
          },
        }}
      >
        {open && <div className="score-print-preview">{sheet}</div>}
      </Modal>
      {open &&
        createPortal(
          <div className="score-print-portal">{sheet}</div>,
          document.body,
        )}
    </>
  );
};

const ScorePrintSheet: React.FC<{
  competition: Competition;
  scores: Score[];
}> = ({ competition, scores }) => {
  const website = useWebsite();
  const isClassCompetition = isClassScoredType(competition.competition_type);

  const scoreboardUrl = useMemo(() => {
    const configured = website.domain?.trim();
    const base = configured
      ? /^https?:\/\//i.test(configured)
        ? configured
        : `https://${configured}`
      : window.location.origin;
    return `${base.replace(/\/$/, "")}/?id=${competition.id}`;
  }, [competition.id, website.domain]);

  const sortedScores = useMemo(
    () =>
      [...scores].sort((a, b) => {
        const rankA = a.ranking ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.ranking ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return compareClassThenName(
          a.class_name,
          a.student_name ?? "",
          b.class_name,
          b.student_name ?? "",
        );
      }),
    [scores],
  );

  const submitter = competition.score_submitter_name || "—";
  const submittedAt = formatTimestamp(competition.score_created_at);
  const reviewer = competition.score_reviewer_name || "—";
  const reviewedAt = formatTimestamp(competition.score_reviewed_at);

  return (
    <div className="score-print-sheet">
      <header className="score-print-masthead">
        <div className="score-print-brand">
          <img
            className="score-print-logo"
            src={website.logo_url || "/school-emblem.svg"}
            alt=""
          />
          <div>
            <div className="score-print-site">
              {website.name || "校园运动会"}
            </div>
            <div className="score-print-event">
              {website.event_name || "校园运动会"}
            </div>
          </div>
        </div>
        <LivePrintTime />
      </header>

      <section className="score-print-heading">
        <div>
          <div className="score-print-kicker">成绩公示</div>
          <h1 className="score-print-title">{competition.name}</h1>
        </div>
      </section>

      <section className="score-print-table-wrap">
        {sortedScores.length === 0 ? (
          <div className="score-print-empty">暂无成绩数据</div>
        ) : (
          <table className="score-print-table">
            <thead>
              <tr>
                <th>名次</th>
                {isClassCompetition ? (
                  <th>班级</th>
                ) : (
                  <>
                    <th>班级</th>
                    <th>姓名</th>
                  </>
                )}
                <th>成绩</th>
                <th>得分</th>
              </tr>
            </thead>
            <tbody>
              {sortedScores.map((score, index) => (
                <tr
                  key={`${score.student_id ?? score.class_id ?? index}-${index}`}
                >
                  <td className="is-rank">
                    <span
                      className={`score-print-rank rank-${score.ranking ?? ""}`}
                    >
                      {score.ranking ?? "—"}
                    </span>
                  </td>
                  {isClassCompetition ? (
                    <td>{score.class_name || "—"}</td>
                  ) : (
                    <>
                      <td>{score.class_name || "—"}</td>
                      <td className="is-name">{score.student_name || "—"}</td>
                    </>
                  )}
                  <td className="is-score">
                    {formatScore(score.score)}{" "}
                    <span>{score.unit || competition.unit}</span>
                  </td>
                  <td className="is-point">
                    {score.point !== undefined && score.point !== null
                      ? score.point
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="score-print-footer">
        <div className="score-print-signoff">
          <div className="score-print-signoff-item">
            <span className="score-print-signoff-label">成绩提交人</span>
            <span className="score-print-signoff-value">{submitter}</span>
          </div>
          <div className="score-print-signoff-item">
            <span className="score-print-signoff-label">成绩提交时间</span>
            <span className="score-print-signoff-value">{submittedAt}</span>
          </div>
          <div className="score-print-signoff-item">
            <span className="score-print-signoff-label">成绩审核人</span>
            <span className="score-print-signoff-value">{reviewer}</span>
          </div>
          <div className="score-print-signoff-item">
            <span className="score-print-signoff-label">成绩审核时间</span>
            <span className="score-print-signoff-value">{reviewedAt}</span>
          </div>
        </div>

        <div className="score-print-qr">
          <QRCode
            type="svg"
            value={scoreboardUrl}
            size={96}
            bordered={false}
            color="#102a46"
            bgColor="#ffffff"
          />
          <div className="score-print-qr-label">扫码查看看板</div>
          <div className="score-print-qr-url">{scoreboardUrl}</div>
        </div>
      </footer>
    </div>
  );
};

export default ScorePrintModal;
