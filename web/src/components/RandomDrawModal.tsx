import { useState, useRef } from "react";
import { Modal, Select, Button, Space, Radio, Typography, message } from "antd";
import {
  DownloadOutlined,
  ReloadOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import html2canvas from "html2canvas-pro";
import {
  Bracket,
  IRenderSeedProps,
  IRoundProps,
  Seed,
  SeedItem,
  SeedTeam,
} from "./react-brackets";
import { Competition, Registration } from "../types";

const { Option } = Select;
const { Text } = Typography;

// 签位名称：轮空用灰色虚线徽标区分，空签位显示"待定"
const SeedName = ({ name }: { name?: string }) => {
  if (!name) {
    return <span style={{ color: "#999" }}>待定</span>;
  }
  if (name === "轮空") {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "0 10px",
          border: "1px dashed #bfbfbf",
          borderRadius: 999,
          backgroundColor: "#f5f5f5",
          color: "#999",
          fontSize: "0.65em",
          fontWeight: "normal",
          letterSpacing: 2,
          lineHeight: 1.8,
        }}
      >
        轮空
      </span>
    );
  }
  return <>{name}</>;
};

// 自定义种子渲染组件
const CustomSeed = ({ seed, breakpoint }: IRenderSeedProps) => {
  return (
    <Seed
      mobileBreakpoint={breakpoint}
      style={{ fontSize: 24, fontWeight: "bold" }}
      id={seed.id}
      teams={seed.teams}
    >
      <SeedItem>
        <div>
          <SeedTeam>
            <SeedName name={seed.teams[0]?.name} />
          </SeedTeam>
          <SeedTeam>
            <SeedName name={seed.teams[1]?.name} />
          </SeedTeam>
        </div>
      </SeedItem>
    </Seed>
  );
};

interface RandomDrawModalProps {
  visible: boolean;
  onCancel: () => void;
  competitions: Competition[];
  onFetchRegistrations: (competitionId: number) => Promise<Registration[]>;
}

// 抽选单位：按学生（每名学生一个签位）或按班级（每个报名班级一个签位，仅团体赛）
type DrawMode = "student" | "class";

const RandomDrawModal: React.FC<RandomDrawModalProps> = ({
  visible,
  onCancel,
  competitions,
  onFetchRegistrations,
}) => {
  const [selectedCompetitions, setSelectedCompetitions] = useState<number[]>(
    [],
  );
  const [drawMode, setDrawMode] = useState<DrawMode>("student");
  const [currentCompetitionIndex, setCurrentCompetitionIndex] = useState(0);
  const [bracketData, setBracketData] = useState<IRoundProps[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const bracketRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 生成淘汰赛 bracket 数据（正确的轮空分配：首轮每场最多一个轮空）
  const generateBracket = (participants: string[]): IRoundProps[] => {
    const p = participants.length;
    // 没人或仅一人特殊处理
    if (p === 0) return [];
    if (p === 1) {
      return [
        {
          title: "决赛",
          seeds: [
            {
              id: 1,
              teams: [{ name: participants[0] }, { name: "" }],
            },
          ],
        },
      ];
    }

    // 随机打乱参赛者
    const shuffled = [...participants].sort(() => Math.random() - 0.5);

    // 总轮次 & 总签位（2 的幂）
    const totalRounds = Math.ceil(Math.log2(p));
    const M = Math.pow(2, totalRounds); // 总签位数
    const byes = M - p; // 轮空数量
    const firstRoundMatches = M / 2; // 首轮比赛场数

    // 构建首轮对阵，每场两侧；确保每场最多一个轮空
    const matches: { a: string | null; b: string | null }[] = Array.from(
      { length: firstRoundMatches },
      () => ({ a: null, b: null }),
    );

    // 在不同场次随机分配轮空位置（每场最多一个）
    const matchIndices = Array.from(
      { length: firstRoundMatches },
      (_, i) => i,
    ).sort(() => Math.random() - 0.5);
    for (let i = 0; i < byes; i++) {
      const m = matchIndices[i];
      const side: "a" | "b" = Math.random() < 0.5 ? "a" : "b";
      matches[m][side] = "轮空"; // 显式标注为轮空
    }

    // 收集剩余空位（应当正好等于参赛人数 p）并填入选手
    const emptySlots: Array<{ match: number; side: "a" | "b" }> = [];
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].a === null) emptySlots.push({ match: i, side: "a" });
      if (matches[i].b === null) emptySlots.push({ match: i, side: "b" });
    }

    // 将选手填入空位
    for (let i = 0; i < shuffled.length; i++) {
      const slot = emptySlots[i];
      matches[slot.match][slot.side] = shuffled[i];
    }

    // 生成首轮种子
    const round1Seeds = matches.map((m, idx) => ({
      id: idx + 1,
      teams: [{ name: m.a || "" }, { name: m.b || "" }],
    }));

    // 轮次标题
    const titleFor = (roundIndex: number): string => {
      if (totalRounds === 1) return "决赛";
      if (roundIndex === totalRounds - 1) return "决赛";
      if (roundIndex === totalRounds - 2) return "半决赛";
      return `第${roundIndex + 1}轮`;
    };

    const rounds: IRoundProps[] = [
      {
        title: titleFor(0),
        seeds: round1Seeds,
      },
    ];

    // 后续轮次：占位（胜者待定）
    let seedId = round1Seeds.length + 1;
    for (let r = 1; r < totalRounds; r++) {
      const matchesInRound = M / Math.pow(2, r + 1);
      const seeds = Array.from({ length: matchesInRound }, () => ({
        id: seedId++,
        teams: [{ name: "" }, { name: "" }],
      }));
      rounds.push({ title: titleFor(r), seeds });
    }

    // 自动晋级：如果第一轮某场比赛有一方是轮空，将另一方晋级到第二轮
    if (totalRounds > 1) {
      round1Seeds.forEach((seed, index) => {
        const team1 = seed.teams[0]?.name || "";
        const team2 = seed.teams[1]?.name || "";

        // 检查是否有一方轮空，另一方是选手
        let winner: string | null = null;
        if (team1 === "轮空" && team2 && team2 !== "" && team2 !== "轮空") {
          winner = team2;
        } else if (
          team2 === "轮空" &&
          team1 &&
          team1 !== "" &&
          team1 !== "轮空"
        ) {
          winner = team1;
        }

        // 如果有自动晋级的选手，填入第二轮对应位置
        if (winner) {
          const nextRoundMatchIndex = Math.floor(index / 2);
          const nextRoundPosition = index % 2; // 0 = 上方，1 = 下方

          if (rounds[1] && rounds[1].seeds[nextRoundMatchIndex]) {
            rounds[1].seeds[nextRoundMatchIndex].teams[nextRoundPosition] = {
              name: winner,
            };
          }
        }
      });
    }

    return rounds;
  };

  // 是否为团体赛（集体项目）
  const isTeamCompetition = (competitionId: number) =>
    competitions.find((comp) => comp.id === competitionId)?.competition_type ===
    "team";

  // 选中的比赛里是否包含团体赛，决定是否展示抽选单位
  const hasTeamCompetition = selectedCompetitions.some(isTeamCompetition);

  // 生成签位：按学生为每人一个签位；按班级仅对团体赛生效，每个报名班级一个签位
  const buildParticipants = (
    competitionId: number,
    registrations: Registration[],
    mode: DrawMode,
  ): string[] => {
    if (mode === "class" && isTeamCompetition(competitionId)) {
      const seen = new Set<number>();
      const participants: string[] = [];
      registrations.forEach((registration) => {
        if (seen.has(registration.class_id)) return;
        seen.add(registration.class_id);
        participants.push(registration.class_name);
      });
      return participants;
    }

    return registrations.map(
      (registration) =>
        `${registration.class_name} ${registration.student_name}`,
    );
  };

  // 拉取报名数据并按指定抽选单位生成对阵表
  const loadAndDraw = async (
    index: number,
    mode: DrawMode,
  ): Promise<boolean> => {
    const competitionId = selectedCompetitions[index];
    if (!competitionId) return false;

    setLoading(true);
    try {
      const registrations = await onFetchRegistrations(competitionId);

      if (!registrations || registrations.length === 0) {
        message.warning("该比赛没有报名数据");
        return false;
      }

      const participants = buildParticipants(
        competitionId,
        registrations,
        mode,
      );

      setBracketData(generateBracket(participants));
      setCurrentCompetitionIndex(index);
      return true;
    } catch (error) {
      message.error("抽选失败：" + (error as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 执行随机抽选
  const handleRandomDraw = async () => {
    if (selectedCompetitions.length === 0) {
      message.warning("请至少选择一个比赛项目");
      return;
    }

    if (await loadAndDraw(0, drawMode)) {
      message.success("抽选完成！");
    }
  };

  // 切换比赛
  const handleSwitchCompetition = async (index: number) => {
    if (index < 0 || index >= selectedCompetitions.length) return;

    await loadAndDraw(index, drawMode);
  };

  // 切换抽选单位：当前展示的是团体赛对阵表时按新单位重新抽选
  const handleDrawModeChange = async (mode: DrawMode) => {
    setDrawMode(mode);
    const competitionId = selectedCompetitions[currentCompetitionIndex];
    if (bracketData && competitionId && isTeamCompetition(competitionId)) {
      await loadAndDraw(currentCompetitionIndex, mode);
    }
  };

  // 导出为图片
  const handleExportImage = async () => {
    if (!bracketRef.current || !bracketData) {
      message.error("没有可导出的对阵表");
      return;
    }

    setExporting(true);
    try {
      const container = bracketRef.current;

      // 计算需要的完整尺寸
      const paddings = window.getComputedStyle(container);
      const paddingY =
        parseFloat(paddings.paddingTop || "0") +
        parseFloat(paddings.paddingBottom || "0");

      const width = container.scrollWidth;
      const height = container.scrollHeight + paddingY;

      const canvas = await html2canvas(container, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: width,
        height: height,
        windowWidth: width,
        windowHeight: height,
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          message.error("生成图片失败");
          setExporting(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const competitionName =
          competitions.find(
            (c) => c.id === selectedCompetitions[currentCompetitionIndex],
          )?.name || "比赛";
        link.href = url;
        link.download = `${competitionName}_对阵表_${new Date().toLocaleDateString().replace(/\//g, "-")}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        message.success("导出成功");
        setExporting(false);
      }, "image/png");
    } catch (error) {
      console.error("导出图片错误:", error);
      message.error("导出图片失败：" + (error as Error).message);
      setExporting(false);
    }
  };

  // 关闭模态框时重置状态
  const handleClose = () => {
    setSelectedCompetitions([]);
    setDrawMode("student");
    setBracketData(null);
    setCurrentCompetitionIndex(0);
    onCancel();
  };

  const currentCompetition = selectedCompetitions[currentCompetitionIndex]
    ? competitions.find(
        (c) => c.id === selectedCompetitions[currentCompetitionIndex],
      )
    : null;

  return (
    <Modal
      title={
        <>
          <TrophyOutlined style={{ marginRight: 8 }} />
          随机抽选对阵
        </>
      }
      open={visible}
      onCancel={handleClose}
      width={1200}
      footer={null}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    >
      <div style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <div style={{ marginBottom: 8 }}>
              <strong>选择比赛项目（可多选）</strong>
            </div>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              placeholder="请选择比赛项目"
              value={selectedCompetitions}
              onChange={setSelectedCompetitions}
              disabled={loading}
            >
              {competitions
                .filter(
                  (comp) =>
                    comp.status === "approved" ||
                    comp.status === "checking_in" ||
                    comp.status === "in_progress" ||
                    comp.status === "pending_score_review" ||
                    comp.status === "completed",
                )
                .map((comp) => (
                  <Option key={comp.id} value={comp.id}>
                    {comp.name}
                  </Option>
                ))}
            </Select>
          </div>

          {hasTeamCompetition && (
            <div>
              <div style={{ marginBottom: 8 }}>
                <strong>抽选单位</strong>
              </div>
              <Radio.Group
                value={drawMode}
                onChange={(event) =>
                  handleDrawModeChange(event.target.value as DrawMode)
                }
                disabled={loading}
              >
                <Radio value="student">按学生（每名报名学生一个签位）</Radio>
                <Radio value="class">按班级（每个报名班级一个签位）</Radio>
              </Radio.Group>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  按班级抽选仅对团体赛生效；个人赛始终按学生抽选。
                </Text>
              </div>
            </div>
          )}

          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRandomDraw}
              loading={loading}
              disabled={selectedCompetitions.length === 0}
            >
              {bracketData ? "重新抽选" : "开始抽选"}
            </Button>

            {bracketData && (
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportImage}
                loading={exporting}
              >
                导出图片
              </Button>
            )}
          </Space>
        </Space>
      </div>

      {bracketData && (
        <div>
          {/* 比赛切换按钮 */}
          {selectedCompetitions.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <Space wrap>
                {selectedCompetitions.map((compId, index) => {
                  const comp = competitions.find((c) => c.id === compId);
                  return (
                    <Button
                      key={compId}
                      type={
                        index === currentCompetitionIndex
                          ? "primary"
                          : "default"
                      }
                      onClick={() => handleSwitchCompetition(index)}
                      loading={loading && index !== currentCompetitionIndex}
                      disabled={loading}
                    >
                      {comp?.name}
                    </Button>
                  );
                })}
              </Space>
            </div>
          )}

          {/* 对阵表 */}
          <div
            ref={bracketRef}
            style={{
              backgroundColor: "#ffffff",
              padding: "20px",
              borderRadius: "8px",
              overflow: "visible",
              display: "inline-block",
            }}
          >
            <div
              style={{
                marginBottom: 16,
                fontSize: 20,
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {currentCompetition?.name} - 对阵表
            </div>
            <div
              style={{
                minHeight: "400px",
                overflow: "visible",
              }}
              ref={scrollRef}
            >
              <Bracket
                rounds={bracketData}
                twoSided={true}
                renderSeedComponent={CustomSeed}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default RandomDrawModal;
