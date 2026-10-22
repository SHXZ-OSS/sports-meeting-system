import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Select,
  Typography,
  Row,
  Col,
  InputNumber,
  Popconfirm,
  Steps,
  Alert,
  message,
} from "antd";
import {
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  FormOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  RollbackOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { adminProgressAPI, adminReviewAPI } from "../../api/admin/progress";
import { useAuth } from "../../contexts/AuthContext";
import { PERMISSIONS } from "../../types";
import {
  Class,
  Competition,
  Score,
  StudentScore,
  Registration,
} from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { getRankingDisplayForTable } from "../../utils";
import {
  isClassScoredType,
  isRegistrationOnlyType,
  isSchoolWideType,
} from "../../utils/competition";
import {
  formatCustomFieldValue,
  getCustomFieldValue,
} from "../../utils/customFields";
import { useIsMobile } from "../../utils/mobile";
import { chineseSort } from "../../utils/sort";
import { adminRegistrationAPI } from "../../api/admin/registration";
import CertificateExport from "../../components/CertificateExport";

const { Title } = Typography;
const { Option } = Select;
const SCORE_PAGE_SIZE_OPTIONS = ["10", "30", "50", "100"];

// 赛事进程状态机（审核通过后的生命周期）
const STATUS_STEP_ITEMS: { status: Competition["status"]; title: string }[] = [
  { status: "approved", title: "已审核" },
  { status: "checking_in", title: "检录中" },
  { status: "in_progress", title: "进行中" },
  { status: "pending_score_review", title: "成绩待审核" },
  { status: "completed", title: "已完成" },
];

// 各状态允许流转到的目标状态（与后端 progressTransitions 对应）
const legalTargets: Record<string, string[]> = {
  approved: ["checking_in", "in_progress"],
  checking_in: ["approved", "in_progress"],
  in_progress: ["approved"],
  pending_score_review: ["in_progress"],
  completed: ["in_progress"],
};

interface ScoreFormData {
  competition_id: number;
  student_scores: { student_id?: number; class_id?: number; score?: number }[];
}

const Progress: React.FC = () => {
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] =
    useState<Competition | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const { hasPermission } = useAuth();

  // 页面内按权限显隐：录入/流转需「成绩与赛事进程」，审核需「成绩审核」
  const canManageProgress = hasPermission(PERMISSIONS.SCORE_AND_PROGRESS);
  const canReview = hasPermission(PERMISSIONS.SCORE_REVIEW);
  const [scoreFormData, setScoreFormData] = useState<ScoreFormData>({
    competition_id: 0,
    student_scores: [],
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [certificateModalVisible, setCertificateModalVisible] = useState(false);
  const [allCompletedScores, setAllCompletedScores] = useState<Score[]>([]);
  const [scoreTablePage, setScoreTablePage] = useState(1);
  const [scoreTablePageSize, setScoreTablePageSize] = useState(30);

  const fetchCompetitions = async () => {
    setLoading(true);
    const data = await adminProgressAPI.getCompetitions();
    handleResp(
      data,
      (data) => {
        // 赛事进程页覆盖审核通过后的全部状态；仅报名项目不录成绩
        setCompetitions(
          (data || []).filter(
            (c) =>
              c.competition_type !== "registration" &&
              (c.status === "approved" ||
                c.status === "checking_in" ||
                c.status === "in_progress" ||
                c.status === "pending_score_review" ||
                c.status === "completed"),
          ),
        );
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const fetchScores = async (competitionId: number) => {
    setLoading(true);
    const data = await adminProgressAPI.getCompetitionScores(competitionId);
    handleResp(
      data,
      (data) => {
        setScores(data || []);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const fetchRegistrations = async (
    competitionId: number,
  ): Promise<Registration[]> => {
    setLoading(true);
    const data = await adminProgressAPI.getRegisteredStudents(competitionId);
    let result: Registration[] = [];
    handleResp(
      data,
      (list) => {
        result = list || [];
        setRegistrations(result);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return result;
  };

  const fetchClasses = async (): Promise<Class[]> => {
    const data = await adminProgressAPI.getClasses();
    let result: Class[] = [];
    handleResp(data, (list) => {
      result = [...(list || [])].sort((a, b) => chineseSort(a.name, b.name));
      setClasses(result);
    });
    return result;
  };

  useEffect(() => {
    fetchCompetitions();
    fetchClasses();
  }, []);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(scores.length / scoreTablePageSize));
    if (scoreTablePage > maxPage) {
      setScoreTablePage(maxPage);
    }
  }, [scoreTablePage, scoreTablePageSize, scores.length]);

  const handleCompetitionChange = async (competitionId: number) => {
    const competition = competitions.find((c) => c.id === competitionId);
    setSelectedCompetition(competition || null);
    setScoreTablePage(1);
    if (competitionId) {
      await Promise.all([
        fetchScores(competitionId),
        fetchRegistrations(competitionId),
      ]);
    }
  };

  // 根据比赛类型生成成绩录入行：个人按学生、团体按报名班级、全校性按全部班级
  const buildInitialScores = (
    competition: Competition,
    registrationList: Registration[],
    classList: Class[],
    scoreList: Score[],
  ): { student_id?: number; class_id?: number; score?: number }[] => {
    if (isSchoolWideType(competition.competition_type)) {
      return classList.map((cls) => ({
        class_id: cls.id,
        score: scoreList.find((score) => score.class_id === cls.id)?.score,
      }));
    }

    if (competition.competition_type === "team") {
      const classMap = new Map<number, { class_id: number; score?: number }>();
      registrationList.forEach((registration) => {
        if (!registration.class_id || classMap.has(registration.class_id)) {
          return;
        }
        classMap.set(registration.class_id, {
          class_id: registration.class_id,
          score: scoreList.find(
            (score) => score.class_id === registration.class_id,
          )?.score,
        });
      });
      return Array.from(classMap.values());
    }

    return registrationList.map((registration) => ({
      student_id: registration.student_id,
      score: scoreList.find(
        (score) => score.student_id === registration.student_id,
      )?.score,
    }));
  };

  // 初始化成绩录入表单数据，已有成绩则预填写
  const initScoreForm = async () => {
    if (!selectedCompetition) {
      return;
    }

    let registrationList = registrations;
    let classList = classes;

    if (isSchoolWideType(selectedCompetition.competition_type)) {
      if (classList.length === 0) {
        classList = await fetchClasses();
      }
    } else if (registrationList.length === 0) {
      registrationList = await fetchRegistrations(selectedCompetition.id);
    }

    setScoreFormData({
      competition_id: selectedCompetition.id,
      student_scores: buildInitialScores(
        selectedCompetition,
        registrationList,
        classList,
        scores,
      ),
    });
  };

  const updateStudentScore = (
    studentId: number | undefined,
    classId: number | undefined,
    score: number | null,
  ) => {
    setScoreFormData((prev) => ({
      ...prev,
      student_scores: prev.student_scores.map((s) => {
        if (studentId !== undefined && s.student_id === studentId) {
          return { ...s, score: score ?? undefined };
        }
        if (classId !== undefined && s.class_id === classId) {
          return { ...s, score: score ?? undefined };
        }
        return s;
      }),
    }));
  };

  const handleSubmit = async () => {
    if (!selectedCompetition || scoreFormData.student_scores.length === 0) {
      return;
    }

    // 检查是否已有成绩数据
    const hasExistingScores = scores && scores.length > 0;

    const confirmSubmit = () => {
      // 只提交有成绩的数据（过滤掉 undefined 和 null）
      const studentScores: StudentScore[] = scoreFormData.student_scores
        .filter((s) => s.score !== undefined && s.score !== null)
        .map((s) => {
          if (s.class_id !== undefined) {
            return {
              class_id: s.class_id,
              score: s.score!,
            };
          } else {
            return {
              student_id: s.student_id,
              score: s.score!,
            };
          }
        });

      adminProgressAPI
        .createOrUpdateScores({
          competition_id: selectedCompetition.id,
          student_scores: studentScores,
        })
        .then((response) => {
          handleRespWithNotifySuccess(response, async () => {
            // 提交成功：进入成绩待审核，刷新成绩并关闭模态框
            applyStatus("pending_score_review");
            await fetchScores(selectedCompetition.id);
            closeModal();
          });
        });
    };

    if (hasExistingScores) {
      Modal.confirm({
        title: "确认重新提交成绩",
        content: `该比赛项目已存在成绩数据，确定要重新提交吗？这将覆盖原有的成绩记录。`,
        okText: "确定提交",
        cancelText: "取消",
        onOk: confirmSubmit,
      });
    } else {
      confirmSubmit();
    }
  };

  const handleDeleteScores = async () => {
    if (!selectedCompetition) return;

    const response = await adminProgressAPI.deleteScores(
      selectedCompetition.id,
    );
    handleRespWithNotifySuccess(response, async () => {
      await fetchScores(selectedCompetition.id);
    });
  };

  const handleExportCertificates = async () => {
    try {
      setLoading(true);

      // 获取所有已完成的比赛
      const competitionsResponse = await adminProgressAPI.getCompetitions({
        status: "completed",
      });
      let completedCompetitions: Competition[] = [];
      handleResp(competitionsResponse, (data) => {
        completedCompetitions = data;
      });

      // 全校性比赛没有学生个人成绩，仅报名项目没有成绩，均不导出奖状
      completedCompetitions = completedCompetitions.filter(
        (competition) =>
          !isSchoolWideType(competition.competition_type) &&
          !isRegistrationOnlyType(competition.competition_type),
      );

      if (completedCompetitions.length === 0) {
        message.warning("没有已完成的比赛可导出奖状");
        setLoading(false);
        return;
      }

      let allScores: Score[] = [];
      for (const competition of completedCompetitions) {
        const scoresResponse = await adminProgressAPI.getCompetitionScores(
          competition.id,
        );
        handleResp(scoresResponse, (data) => {
          allScores = allScores.concat(
            data.map((score) => ({
              ...score,
              competition_id: competition.id,
            })),
          );
        });
      }
      setAllCompletedScores(allScores);

      setCertificateModalVisible(true);
      setLoading(false);
    } catch (error) {
      console.error("获取成绩数据失败:", error);
      message.error("获取成绩数据失败");
      setLoading(false);
    }
  };

  // 导出全部成绩（按比赛完整模式）
  const handleExportScores = async () => {
    setExportLoading(true);
    try {
      // 获取所有已完成的比赛
      const competitionsResponse = await adminProgressAPI.getCompetitions({
        status: "completed",
      });
      let completedCompetitions: Competition[] = [];
      handleResp(competitionsResponse, (data) => {
        completedCompetitions = data;
      });

      if (completedCompetitions.length === 0) {
        throw new Error("没有已完成的比赛");
      }

      // 获取每个比赛的报名和成绩数据
      const competitionsWithData = await Promise.all(
        completedCompetitions.map(async (comp) => {
          // 获取报名数据
          const regResponse =
            await adminRegistrationAPI.getCompetitionRegistrations(comp.id);
          let registrations: Registration[] = [];
          await new Promise<void>((resolveReg) => {
            handleResp(
              regResponse,
              (data) => {
                registrations = data;
                resolveReg();
              },
              () => {
                resolveReg();
              },
            );
          });

          // 获取成绩数据
          const scoresResponse = await adminProgressAPI.getCompetitionScores(
            comp.id,
          );
          let scores: Score[] = [];
          await new Promise<void>((resolveScore) => {
            handleResp(
              scoresResponse,
              (data) => {
                scores = data;
                resolveScore();
              },
              () => {
                resolveScore();
              },
            );
          });

          // 按班级和姓名排序报名数据
          registrations.sort((a, b) => {
            const classCompare = chineseSort(a.class_name, b.class_name);
            if (classCompare !== 0) return classCompare;
            return a.student_name.localeCompare(b.student_name, "zh-CN");
          });

          // 创建成绩映射表（用于快速查找）
          const scoreMap = new Map<number, Score>();
          scores.forEach((score) => {
            if (score.student_id) {
              scoreMap.set(score.student_id, score);
            }
          });

          return {
            competition: comp,
            registrations,
            scores,
            scoreMap,
          };
        }),
      );

      // 使用 excel 工具导出
      const { exportExcel, createMerge } = await import("../../utils/excel");

      const sheets = competitionsWithData.map(
        ({ competition, registrations, scores, scoreMap }) => {
          const sheetData: any[][] = [];
          const merges: any[] = [];
          const isSchoolWide = isSchoolWideType(competition.competition_type);
          const isClassCompetition = isClassScoredType(
            competition.competition_type,
          );

          // 根据比赛类型决定合并列数
          const headerColCount = isClassCompetition ? 5 : 6;

          // 添加比赛名称作为标题
          const titleRow = [competition.name];
          for (let i = 1; i < headerColCount; i++) {
            titleRow.push("");
          }
          sheetData.push(titleRow);
          merges.push(createMerge(0, 0, 0, headerColCount - 1));

          // 添加表头（团体/全校性比赛不显示"姓名"列）
          if (isClassCompetition) {
            sheetData.push(["序号", "班级", "成绩", "名次", "得分"]);
          } else {
            sheetData.push(["序号", "班级", "姓名", "成绩", "名次", "得分"]);
          }

          // 处理数据行
          if (isSchoolWide) {
            // 全校性比赛：成绩直接按班级记录
            const sortedScores = [...scores].sort((a, b) =>
              chineseSort(a.class_name, b.class_name),
            );
            sortedScores.forEach((score, index) => {
              sheetData.push([
                index + 1,
                score.class_name,
                `${score.score} ${competition.unit}`,
                score.ranking || "",
                score.point !== undefined && score.point !== null
                  ? score.point
                  : "",
              ]);
            });
          } else if (isClassCompetition) {
            // 团体比赛：按班级去重，每个班级只显示一次
            const classMap = new Map<number, Registration>();
            registrations.forEach((reg) => {
              if (reg.class_id && !classMap.has(reg.class_id)) {
                classMap.set(reg.class_id, reg);
              }
            });

            // 获取去重后的班级列表并按班级名称排序
            const uniqueClasses = Array.from(classMap.values()).sort((a, b) =>
              chineseSort(a.class_name, b.class_name),
            );

            // 为每个班级添加一行数据
            uniqueClasses.forEach((reg, index) => {
              // 团体赛的成绩是按 class_id 存储的
              const score = scores.find((s) => s.class_id === reg.class_id);
              sheetData.push([
                index + 1,
                reg.class_name,
                score ? `${score.score} ${competition.unit}` : "",
                score && score.ranking ? score.ranking : "",
                score && score.point !== undefined && score.point !== null
                  ? score.point
                  : "",
              ]);
            });
          } else {
            // 个人比赛：显示每个学生的数据
            registrations.forEach((reg, index) => {
              const score = reg.student_id
                ? scoreMap.get(reg.student_id)
                : null;
              sheetData.push([
                index + 1,
                reg.class_name,
                reg.student_name,
                score ? `${score.score} ${competition.unit}` : "",
                score && score.ranking ? score.ranking : "",
                score && score.point !== undefined && score.point !== null
                  ? score.point
                  : "",
              ]);
            });
          }

          return {
            name: competition.name.substring(0, 31), // Excel sheet 名称限制31字符
            data: sheetData,
            merges: merges,
            colWidths: isClassCompetition
              ? [5, 10, 10, 5, 5]
              : [5, 10, 10, 10, 5, 5],
          };
        },
      );

      const filename = `成绩数据_${new Date().toLocaleDateString()}.xlsx`;
      exportExcel(sheets, filename);

      message.success("导出成功");
    } catch (error) {
      message.error("导出失败：" + (error as Error).message);
    } finally {
      setExportLoading(false);
    }
  };

  const getColumns = () => {
    const isClassCompetition = isClassScoredType(
      selectedCompetition?.competition_type,
    );

    const baseColumns = [
      {
        title: "排名",
        dataIndex: "ranking",
        key: "ranking",
        render: getRankingDisplayForTable,
      },
    ];

    // 团体/全校性比赛不显示学生姓名列
    if (!isClassCompetition) {
      baseColumns.push({
        title: "学生姓名",
        dataIndex: "student_name",
        key: "student_name",
        render: (name: unknown) => name as string,
      });
    }

    baseColumns.push(
      {
        title: "班级",
        dataIndex: "class_name",
        key: "class_name",
        render: (classname: unknown) => classname as string,
      },
      {
        title: "成绩",
        dataIndex: "score",
        key: "score",
        render: (score: unknown) => (
          <span>
            {score as number} {selectedCompetition?.unit}
          </span>
        ),
      },
      {
        title: "分数",
        dataIndex: "point",
        key: "point",
        render: (point: unknown) => <span>{point as number}</span>,
      },
    );

    return baseColumns;
  };

  // 状态流转后同步本地列表与当前选中项
  const applyStatus = (status: Competition["status"]) => {
    setSelectedCompetition((prev) =>
      prev ? ({ ...prev, status } as Competition) : prev,
    );
    setCompetitions((prev) =>
      prev.map((c) =>
        selectedCompetition && c.id === selectedCompetition.id
          ? { ...c, status }
          : c,
      ),
    );
  };

  const handleSetStatus = (
    target: Competition["status"],
    title: string,
    content: string,
  ) => {
    if (!selectedCompetition) return;
    Modal.confirm({
      title,
      content,
      onOk: async () => {
        const response = await adminProgressAPI.setStatus(
          selectedCompetition.id,
          target,
        );
        handleRespWithNotifySuccess(response, () => {
          applyStatus(target);
        });
      },
    });
  };

  const handleStartCheckin = () =>
    handleSetStatus(
      "checking_in",
      `开始检录「${selectedCompetition?.name ?? ""}」？`,
      "将比赛状态切换为“检录中”，并钉钉通知已报名学生。",
    );

  const handleStartCompetition = () =>
    handleSetStatus(
      "in_progress",
      `开始比赛「${selectedCompetition?.name ?? ""}」？`,
      "将比赛状态切换为“进行中”，之后可在本页录入成绩。",
    );

  const openModal = async () => {
    if (!selectedCompetition) {
      return;
    }

    let registrationList = registrations;
    let classList = classes;

    if (isSchoolWideType(selectedCompetition.competition_type)) {
      if (classList.length === 0) {
        classList = await fetchClasses();
      }
    } else if (registrationList.length === 0) {
      registrationList = await fetchRegistrations(selectedCompetition.id);
    }

    setModalVisible(true);
    setScoreFormData({
      competition_id: selectedCompetition.id,
      student_scores: buildInitialScores(
        selectedCompetition,
        registrationList,
        classList,
        scores,
      ),
    });
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  // 点击 Steps 节点流转状态（仅合法目标可点，确认后提交）
  const handleStepChange = (idx: number) => {
    if (!selectedCompetition || idx === statusStepIndex) return;
    const target = STATUS_STEP_ITEMS[idx];
    if (
      !canManageProgress ||
      (isSchoolWideType(selectedCompetition.competition_type) &&
        target.status === "checking_in") ||
      !legalTargets[selectedCompetition.status]?.includes(target.status)
    ) {
      return;
    }
    Modal.confirm({
      title: `切换「${selectedCompetition.name}」为「${target.title}」？`,
      content:
        target.status === "checking_in"
          ? "将钉钉通知已报名学生。"
          : "确定将比赛切换到该状态？",
      okText: "确定切换",
      cancelText: "取消",
      onOk: async () => {
        const response = await adminProgressAPI.setStatus(
          selectedCompetition.id,
          target.status,
        );
        handleRespWithNotifySuccess(response, () => {
          applyStatus(target.status);
        });
      },
    });
  };

  const handleReturnToCompletedInput = () =>
    handleSetStatus(
      "in_progress",
      `退回「${selectedCompetition?.name ?? ""}」重新录入？`,
      "比赛将回到“进行中”状态，已提交的成绩可重新录入覆盖。",
    );

  const handleApproveScores = async () => {
    if (!selectedCompetition) return;
    const response = await adminReviewAPI.reviewScores({
      competition_id: selectedCompetition.id,
    });
    handleRespWithNotifySuccess(response, () => {
      applyStatus("completed");
      fetchScores(selectedCompetition.id);
    });
  };

  const handleRemindStudent = async (studentId: number) => {
    if (!selectedCompetition) return;
    setRemindingId(studentId);
    try {
      const response = await adminProgressAPI.remindStudent(
        selectedCompetition.id,
        studentId,
      );
      handleRespWithNotifySuccess(response, () => {});
    } finally {
      setRemindingId(null);
    }
  };

  // 可录入状态下自动初始化录入表单
  useEffect(() => {
    if (
      canManageProgress &&
      selectedCompetition &&
      (selectedCompetition.status === "in_progress" ||
        selectedCompetition.status === "completed")
    ) {
      void initScoreForm();
    }
  }, [
    selectedCompetition?.id,
    registrations.length,
    scores.length,
    classes.length,
  ]);

  const statusStepIndex = selectedCompetition
    ? STATUS_STEP_ITEMS.findIndex(
        (s) => s.status === selectedCompetition.status,
      )
    : -1;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>成绩与赛事进程</Title>
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: 16,
            }}
          >
            <Select
              placeholder="请选择比赛项目"
              onChange={handleCompetitionChange}
              allowClear
              showSearch
              optionFilterProp="children"
              size="large"
              style={{ width: "100%" }}
              filterOption={(input, option) => {
                const children = option?.children;
                if (children && typeof children === "string") {
                  return (children as string)
                    .toLowerCase()
                    .includes(input.toLowerCase());
                }
                if (
                  children &&
                  typeof children === "object" &&
                  "toString" in children
                ) {
                  return children
                    .toString()
                    .toLowerCase()
                    .includes(input.toLowerCase());
                }
                return false;
              }}
            >
              {competitions.map((competition) => (
                <Option key={competition.id} value={competition.id}>
                  {competition.name}
                </Option>
              ))}
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchCompetitions}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              刷新
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleExportScores}
              loading={exportLoading}
              size="large"
              style={{ width: "100%" }}
            >
              导出成绩
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              onClick={handleExportCertificates}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              导出奖状
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Select
                placeholder="请选择比赛项目"
                style={{ width: 300 }}
                onChange={handleCompetitionChange}
                allowClear
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) => {
                  const children = option?.children;
                  if (children && typeof children === "string") {
                    return (children as string)
                      .toLowerCase()
                      .includes(input.toLowerCase());
                  }
                  if (
                    children &&
                    typeof children === "object" &&
                    "toString" in children
                  ) {
                    return children
                      .toString()
                      .toLowerCase()
                      .includes(input.toLowerCase());
                  }
                  return false;
                }}
              >
                {competitions.map((competition) => (
                  <Option key={competition.id} value={competition.id}>
                    {competition.name}
                  </Option>
                ))}
              </Select>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchCompetitions}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportScores}
                loading={exportLoading}
              >
                导出成绩
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={handleExportCertificates}
                loading={loading}
              >
                导出奖状
              </Button>
            </Space>
          </div>
        )}
      </div>

      {selectedCompetition && statusStepIndex >= 0 && (
        <Card
          title={`${selectedCompetition.name} - 赛事进程`}
          style={{ marginBottom: 24 }}
          extra={
            canManageProgress ? (
              <Space wrap>
                {selectedCompetition.status === "approved" && (
                  <>
                    {!isSchoolWideType(
                      selectedCompetition.competition_type,
                    ) && (
                      <Button
                        type="primary"
                        icon={<NotificationOutlined />}
                        onClick={handleStartCheckin}
                      >
                        开始检录
                      </Button>
                    )}
                    <Button
                      icon={<PlayCircleOutlined />}
                      onClick={handleStartCompetition}
                    >
                      {isSchoolWideType(selectedCompetition.competition_type)
                        ? "开始录入成绩"
                        : "直接开始比赛（跳过检录）"}
                    </Button>
                  </>
                )}
                {selectedCompetition.status === "checking_in" && (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartCompetition}
                  >
                    开始比赛
                  </Button>
                )}
                {selectedCompetition.status === "completed" && (
                  <Button
                    icon={<RollbackOutlined />}
                    onClick={handleReturnToCompletedInput}
                  >
                    退回重新录入
                  </Button>
                )}
                {selectedCompetition.status === "pending_score_review" &&
                  canReview && (
                    <Popconfirm
                      title="确定审核通过这些成绩吗？"
                      description="审核通过后，成绩将正式发布，无法撤回"
                      onConfirm={handleApproveScores}
                      okText="确定审核通过"
                      cancelText="取消"
                    >
                      <Button type="primary" icon={<CheckOutlined />}>
                        审核通过本项目
                      </Button>
                    </Popconfirm>
                  )}
                {["in_progress", "pending_score_review", "completed"].includes(
                  selectedCompetition.status,
                ) &&
                  scores?.length > 0 && (
                    <Popconfirm
                      title="确定删除所有成绩吗？"
                      onConfirm={handleDeleteScores}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button danger icon={<DeleteOutlined />}>
                        删除成绩
                      </Button>
                    </Popconfirm>
                  )}
                {selectedCompetition.status === "in_progress" && (
                  <Button
                    type="primary"
                    icon={<FormOutlined />}
                    onClick={openModal}
                  >
                    录入成绩
                  </Button>
                )}
              </Space>
            ) : undefined
          }
        >
          <Steps
            items={STATUS_STEP_ITEMS.map((s) => ({
              title: s.title,
              disabled:
                !canManageProgress ||
                !legalTargets[selectedCompetition.status]?.includes(s.status) ||
                (isSchoolWideType(selectedCompetition.competition_type) &&
                  s.status === "checking_in"),
            }))}
            current={statusStepIndex}
            onChange={handleStepChange}
          />
          <div style={{ marginTop: 16 }}>
            {canReview &&
              !canManageProgress &&
              selectedCompetition.status !== "pending_score_review" && (
                <Alert
                  type="info"
                  showIcon
                  message="您不负责此流程，请等待成绩审核开始。"
                />
              )}
            {selectedCompetition.status === "pending_score_review" &&
              !canReview && (
                <Alert
                  type="warning"
                  showIcon
                  message="您不负责此流程，请等待成绩审核。"
                />
              )}
            {selectedCompetition.status === "pending_score_review" &&
              canReview && (
                <Alert
                  type="warning"
                  showIcon
                  message="成绩已提交，请核对下方成绩后审核通过。"
                />
              )}
          </div>

          {canManageProgress &&
            !isSchoolWideType(selectedCompetition.competition_type) &&
            (selectedCompetition.status === "approved" ||
              selectedCompetition.status === "checking_in") && (
              <Card type="inner" title="报名名单" style={{ marginTop: 16 }}>
                {registrations.length === 0 ? (
                  <div
                    style={{ color: "#999", textAlign: "center", padding: 12 }}
                  >
                    暂无报名学生
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {[...registrations]
                      .sort((a, b) => {
                        const classCompare = chineseSort(
                          a.class_name,
                          b.class_name,
                        );
                        if (classCompare !== 0) return classCompare;
                        return a.student_name.localeCompare(
                          b.student_name,
                          "zh-CN",
                        );
                      })
                      .map((reg) => (
                        <div
                          key={reg.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "4px 0",
                          }}
                        >
                          <Space size={12} wrap>
                            <span style={{ fontWeight: 500 }}>
                              {reg.student_name}
                            </span>
                            <span style={{ fontSize: 12, color: "#666" }}>
                              {reg.class_name}
                            </span>
                            {(selectedCompetition.custom_fields ?? []).map(
                              (field) => {
                                const value = getCustomFieldValue(
                                  reg.custom_values,
                                  field.id,
                                );
                                return (
                                  <span
                                    key={field.id}
                                    style={{ fontSize: 12, color: "#666" }}
                                  >
                                    {field.name}：
                                    {formatCustomFieldValue(field, value) ||
                                      "未填写"}
                                  </span>
                                );
                              },
                            )}
                          </Space>
                          <Button
                            size="small"
                            icon={<NotificationOutlined />}
                            loading={remindingId === reg.student_id}
                            onClick={() => handleRemindStudent(reg.student_id)}
                          >
                            提醒
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            )}

          {["in_progress", "pending_score_review", "completed"].includes(
            selectedCompetition.status,
          ) && (
            <div style={{ marginTop: 16 }}>
              <Typography.Title level={5}>成绩</Typography.Title>
              <Table
                columns={getColumns()}
                dataSource={scores}
                rowKey="id"
                loading={loading}
                tableLayout="auto"
                pagination={{
                  current: scoreTablePage,
                  pageSize: scoreTablePageSize,
                  total: scores.length,
                  showSizeChanger: true,
                  pageSizeOptions: SCORE_PAGE_SIZE_OPTIONS,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 条成绩`,
                  onChange: (page, size) => {
                    setScoreTablePage(page);
                    setScoreTablePageSize(size || 30);
                  },
                }}
                locale={{
                  emptyText: "暂无成绩数据",
                }}
              />
            </div>
          )}
        </Card>
      )}

      <Modal
        title={scores && scores.length > 0 ? "编辑比赛成绩" : "录入比赛成绩"}
        open={modalVisible}
        onCancel={closeModal}
        width={800}
        footer={
          <Space>
            <Button onClick={closeModal}>取消</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSubmit}
            >
              {scores && scores.length > 0 ? "更新成绩" : "保存成绩"}
            </Button>
          </Space>
        }
      >
        {(() => {
          const competitionType = selectedCompetition?.competition_type;
          const isSchoolWide = isSchoolWideType(competitionType);
          const isTeamCompetition = competitionType === "team";
          const isClassCompetition = isClassScoredType(competitionType);

          type EntryRow = {
            key: string;
            class_id?: number;
            student_id?: number;
            class_name: string;
            student_name?: string;
          };

          let rows: EntryRow[];
          if (isSchoolWide) {
            rows = classes.map((cls) => ({
              key: `class-${cls.id}`,
              class_id: cls.id,
              class_name: cls.name,
            }));
          } else if (isTeamCompetition) {
            const classMap = new Map<number, Registration>();
            registrations.forEach((registration) => {
              if (
                registration.class_id &&
                !classMap.has(registration.class_id)
              ) {
                classMap.set(registration.class_id, registration);
              }
            });
            rows = Array.from(classMap.values())
              .sort((a, b) => chineseSort(a.class_name, b.class_name))
              .map((registration) => ({
                key: `class-${registration.class_id}`,
                class_id: registration.class_id,
                class_name: registration.class_name,
              }));
          } else {
            rows = [...registrations]
              .sort((a, b) => {
                const classCompare = chineseSort(a.class_name, b.class_name);
                if (classCompare !== 0) return classCompare;
                return a.student_name.localeCompare(b.student_name, "zh-CN");
              })
              .map((registration) => ({
                key: `student-${registration.id}`,
                student_id: registration.student_id,
                class_name: registration.class_name,
                student_name: registration.student_name,
              }));
          }

          if (rows.length === 0) {
            return (
              <div>
                {isSchoolWide
                  ? "暂无班级"
                  : isTeamCompetition
                    ? "该比赛暂无报名班级"
                    : "该比赛暂无报名学生"}
              </div>
            );
          }

          return (
            <>
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px",
                  background: "#fafafa",
                  borderRadius: "6px",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                共有 {rows.length}{" "}
                {isClassCompetition
                  ? isSchoolWide
                    ? "个班级"
                    : "个班级报名参赛"
                  : "名学生报名参赛"}
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {rows.map((row) => {
                  const currentScore = scoreFormData.student_scores.find(
                    (score) =>
                      isClassCompetition
                        ? score.class_id === row.class_id
                        : score.student_id === row.student_id,
                  );
                  return (
                    <Card
                      key={row.key}
                      size="small"
                      style={{ marginBottom: 8 }}
                      title={
                        <div>
                          {isClassCompetition ? (
                            <strong>{row.class_name}</strong>
                          ) : (
                            <>
                              <strong>{row.student_name}</strong>
                              <span> ({row.class_name})</span>
                            </>
                          )}
                        </div>
                      }
                    >
                      <Row gutter={16} align="middle">
                        <Col span={12}>
                          <span>成绩:</span>
                        </Col>
                        <Col span={12}>
                          <InputNumber
                            placeholder="请输入成绩"
                            style={{ width: "100%" }}
                            step={0.01}
                            value={currentScore?.score}
                            onChange={(value) =>
                              updateStudentScore(
                                isClassCompetition ? undefined : row.student_id,
                                isClassCompetition ? row.class_id : undefined,
                                value,
                              )
                            }
                            addonAfter={selectedCompetition?.unit}
                          />
                        </Col>
                      </Row>
                    </Card>
                  );
                })}
              </div>
            </>
          );
        })()}
      </Modal>

      {/* 奖状导出模态框 */}
      <CertificateExport
        visible={certificateModalVisible}
        onClose={() => setCertificateModalVisible(false)}
        scores={allCompletedScores}
      />
    </div>
  );
};

export default Progress;
