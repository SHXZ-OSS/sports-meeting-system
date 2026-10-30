import { useMemo } from "react";
import { Empty, Table, Tag, Tabs, Tooltip, Typography } from "antd";
import { TrophyOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  BracketDetail,
  BracketMatch,
  BracketParticipant,
  BracketStage,
  BracketStandingRow,
} from "../types";
import {
  getGroupName,
  getRoundTitle,
  getSlotPlaceholder,
} from "../utils/bracket";
import "./BracketView.css";

const { Text } = Typography;

interface BracketViewProps {
  detail: BracketDetail;
  // 点击比赛（管理端用于录入结果）；不传则只读
  onMatchClick?: (match: BracketMatch) => void;
}

interface MatchCardProps {
  match: BracketMatch;
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  onClick?: (match: BracketMatch) => void;
}

// 单场比赛卡片：两行参赛方 + 比分，胜者高亮
const MatchCard = ({
  match,
  participants,
  matchesBySeq,
  onClick,
}: MatchCardProps) => {
  const clickable =
    !!onClick && (match.status === "scheduled" || match.status === "completed");

  const renderSide = (side: 1 | 2) => {
    const pid = side === 1 ? match.participant1_id : match.participant2_id;
    const score = side === 1 ? match.score1 : match.score2;
    const p = pid != null ? participants.get(pid) : undefined;
    const isWinner = pid != null && match.winner_id === pid;
    const isLoser =
      match.status === "completed" &&
      !match.is_draw &&
      pid != null &&
      !isWinner;

    let label: React.ReactNode;
    if (p) {
      label = (
        <>
          <span className="bracket-seed">{p.seed}</span>
          <span className="bracket-name" title={p.name}>
            {p.name}
          </span>
          {p.class_name && <span className="bracket-sub">{p.class_name}</span>}
        </>
      );
    } else {
      const placeholder = getSlotPlaceholder(match, side, matchesBySeq);
      label = <span className="bracket-placeholder">{placeholder}</span>;
    }

    return (
      <div
        className={[
          "bracket-side",
          isWinner ? "is-winner" : "",
          isLoser ? "is-loser" : "",
        ].join(" ")}
      >
        <div className="bracket-side-label">{label}</div>
        <div className="bracket-score">
          {match.status === "bye" && isWinner ? (
            <Tag className="bracket-bye-tag">轮空晋级</Tag>
          ) : (
            (score ?? (isWinner && match.status === "completed" ? "胜" : ""))
          )}
        </div>
      </div>
    );
  };

  const meta = [
    match.scheduled_at ? dayjs(match.scheduled_at).format("MM-DD HH:mm") : "",
    match.venue,
  ]
    .filter(Boolean)
    .join(" · ");

  const card = (
    <div
      className={[
        "bracket-match",
        `status-${match.status}`,
        clickable ? "is-clickable" : "",
      ].join(" ")}
      onClick={clickable ? () => onClick?.(match) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.(match);
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `录入第 ${match.seq} 场比赛结果` : undefined}
    >
      <div className="bracket-match-head">
        <span>#{match.seq}</span>
        {meta && <span className="bracket-meta">{meta}</span>}
      </div>
      {renderSide(1)}
      {renderSide(2)}
    </div>
  );

  return match.note ? <Tooltip title={match.note}>{card}</Tooltip> : card;
};

interface EliminationTreeProps {
  matches: BracketMatch[];
  stage: BracketStage;
  totalRounds?: number;
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  onMatchClick?: (match: BracketMatch) => void;
}

// 淘汰赛树：每轮一列，按位置纵向均分；轮空/作废的首轮比赛淡化显示
const EliminationTree = ({
  matches,
  stage,
  participants,
  matchesBySeq,
  onMatchClick,
}: EliminationTreeProps) => {
  const rounds = useMemo(() => {
    const byRound = new Map<number, BracketMatch[]>();
    matches.forEach((m) => {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    });
    return [...byRound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, list]) => ({
        round,
        matches: list.sort((a, b) => a.position - b.position),
      }));
  }, [matches]);

  if (rounds.length === 0) return null;

  return (
    <div className="bracket-tree-scroll">
      <div className="bracket-tree">
        {rounds.map(({ round, matches: list }) => (
          <div className="bracket-round" key={round}>
            <div className="bracket-round-title">
              {getRoundTitle(stage, round, rounds.length)}
            </div>
            <div className="bracket-round-body">
              {list.map((m) => (
                <div
                  className={[
                    "bracket-cell",
                    stage === "losers" ? "is-losers" : "",
                    m.status === "void" ? "is-void" : "",
                  ].join(" ")}
                  key={m.id || m.seq}
                >
                  {m.status !== "void" && (
                    <MatchCard
                      match={m}
                      participants={participants}
                      matchesBySeq={matchesBySeq}
                      onClick={onMatchClick}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface GroupStageProps {
  detail: BracketDetail;
  participants: Map<number, BracketParticipant>;
  matchesBySeq: Map<number, BracketMatch>;
  onMatchClick?: (match: BracketMatch) => void;
}

// 小组赛：每组一个页签，积分榜 + 按轮次排列的对阵
const GroupStage = ({
  detail,
  participants,
  matchesBySeq,
  onMatchClick,
}: GroupStageProps) => {
  const { bracket, matches, standings } = detail;
  const advance =
    bracket.format === "group_knockout" ? bracket.advance_per_group : 0;

  const columns = [
    {
      title: "名次",
      dataIndex: "rank",
      key: "rank",
      width: 64,
      render: (rank: number) =>
        rank <= advance ? <Tag color="green">{rank}</Tag> : rank,
    },
    {
      title: "参赛方",
      key: "name",
      render: (row: BracketStandingRow) => {
        const p = participants.get(row.participant_id);
        return (
          <span>
            {p?.name ?? "-"}
            {p?.class_name && (
              <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                {p.class_name}
              </Text>
            )}
          </span>
        );
      },
    },
    { title: "场", dataIndex: "played", key: "played", width: 56 },
    { title: "胜", dataIndex: "won", key: "won", width: 56 },
    { title: "平", dataIndex: "drawn", key: "drawn", width: 56 },
    { title: "负", dataIndex: "lost", key: "lost", width: 56 },
    {
      title: "净胜分",
      dataIndex: "score_diff",
      key: "score_diff",
      width: 80,
      render: (v: number) => (v > 0 ? `+${v}` : v),
    },
    {
      title: "积分",
      dataIndex: "points",
      key: "points",
      width: 64,
      render: (v: number) => <Text strong>{v}</Text>,
    },
  ];

  const items = standings.map((standing) => {
    const groupMatches = matches.filter(
      (m) => m.stage === "group" && m.group_index === standing.group_index,
    );
    const roundNums = [...new Set(groupMatches.map((m) => m.round))].sort(
      (a, b) => a - b,
    );
    return {
      key: String(standing.group_index),
      label: getGroupName(standing.group_index),
      children: (
        <div>
          <Table
            size="small"
            rowKey="participant_id"
            columns={columns}
            dataSource={standing.rows}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
          {advance > 0 && (
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              前 {advance} 名出线（积分 &gt; 净胜分 &gt; 总得分 &gt; 种子）
            </Text>
          )}
          <div className="bracket-group-rounds">
            {roundNums.map((round) => (
              <div key={round} className="bracket-group-round">
                <div className="bracket-round-title">第 {round} 轮</div>
                <div className="bracket-group-round-list">
                  {groupMatches
                    .filter((m) => m.round === round)
                    .map((m) => (
                      <MatchCard
                        key={m.id || m.seq}
                        match={m}
                        participants={participants}
                        matchesBySeq={matchesBySeq}
                        onClick={onMatchClick}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    };
  });

  if (items.length === 1) {
    return <>{items[0].children}</>;
  }
  return <Tabs items={items} />;
};

// 冠军：淘汰赛决赛或双败总决赛的胜者；纯循环赛且全部完赛时取积分第一
const getChampion = (detail: BracketDetail): number | null => {
  const { bracket, matches, standings } = detail;
  if (bracket.format === "round_robin") {
    const done = matches.every(
      (m) => m.stage !== "group" || m.status !== "scheduled",
    );
    const pending = matches.some((m) => m.status === "pending");
    if (!done || pending || standings.length !== 1) return null;
    return standings[0].rows[0]?.participant_id ?? null;
  }
  const finalStage: BracketStage =
    bracket.format === "double_elimination" ? "grand_final" : "main";
  const finals = matches.filter((m) => m.stage === finalStage);
  if (finals.length === 0) return null;
  const last = finals.reduce((a, b) => (b.round > a.round ? b : a));
  return last.status === "completed" || last.status === "bye"
    ? last.winner_id
    : null;
};

const BracketView: React.FC<BracketViewProps> = ({ detail, onMatchClick }) => {
  const participants = useMemo(
    () => new Map(detail.participants.map((p) => [p.id, p])),
    [detail.participants],
  );
  const matchesBySeq = useMemo(
    () => new Map(detail.matches.map((m) => [m.seq, m])),
    [detail.matches],
  );

  if (detail.matches.length === 0) {
    return <Empty description="对阵尚未生成" />;
  }

  const byStage = (stage: BracketStage) =>
    detail.matches.filter((m) => m.stage === stage);
  const championId = getChampion(detail);
  const champion =
    championId != null ? participants.get(championId) : undefined;
  const { format } = detail.bracket;
  const hasGroup = format === "round_robin" || format === "group_knockout";

  const treeProps = { participants, matchesBySeq, onMatchClick };

  return (
    <div className="bracket-view">
      {champion && (
        <div className="bracket-champion">
          <TrophyOutlined /> 冠军：{champion.name}
          {champion.class_name && (
            <span className="bracket-sub">{champion.class_name}</span>
          )}
        </div>
      )}

      {hasGroup && (
        <section className="bracket-section">
          {format === "group_knockout" && <h3>小组赛</h3>}
          <GroupStage detail={detail} {...treeProps} />
        </section>
      )}

      {format !== "round_robin" && (
        <section className="bracket-section">
          {format !== "single_elimination" && (
            <h3>{format === "double_elimination" ? "胜者组" : "淘汰赛"}</h3>
          )}
          <EliminationTree
            matches={byStage("main")}
            stage="main"
            {...treeProps}
          />
        </section>
      )}

      {format === "double_elimination" && (
        <>
          <section className="bracket-section">
            <h3>败者组</h3>
            <EliminationTree
              matches={byStage("losers")}
              stage="losers"
              {...treeProps}
            />
          </section>
          <section className="bracket-section">
            <h3>总决赛</h3>
            <div className="bracket-single-row">
              {byStage("grand_final").map((m) => (
                <MatchCard
                  key={m.id || m.seq}
                  match={m}
                  {...treeProps}
                  onClick={onMatchClick}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {byStage("third_place").length > 0 && (
        <section className="bracket-section">
          <h3>季军赛</h3>
          <div className="bracket-single-row">
            {byStage("third_place").map((m) => (
              <MatchCard
                key={m.id || m.seq}
                match={m}
                {...treeProps}
                onClick={onMatchClick}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default BracketView;
