import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Layout,
  Card,
  Table,
  Spin,
  Typography,
  Button,
  Row,
  Col,
  Image,
  Modal,
  Divider,
  Statistic,
  Space,
  Tag,
  Avatar,
  message,
} from "antd";
import {
  TrophyOutlined,
  EyeOutlined,
  UserOutlined,
  LoginOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import confetti from "canvas-confetti";
import dayjs from "dayjs";
import FadeContent from "../../components/FadeContent";
import BlurText from "../../components/BlurText";
import LightRays from "../../components/LightRays";
import ScoreboardSettingsModal from "../../components/ScoreboardSettingsModal";
import type { ScoreboardVoiceOption } from "../../components/ScoreboardSettingsModal";
import { publicAPI } from "../../api/public";
import { Competition, Score, Registration } from "../../types";
import { handleResp, handleRespWithoutNotify } from "../../utils/handleResp";
import {
  getRankingDisplayForTable,
  getGenderText,
  getRankingColor,
  getStatusTag,
  getCompetitionTypeTag,
} from "../../utils/competition";
import { useWebsite } from "../../contexts/WebsiteContext";
import { useIsMobile } from "../../utils";
import { shouldEnableBackgroundEffects } from "../../utils/performance";
import {
  buildAnimationOpeningAnnouncement,
  buildAnimationStepAnnouncement,
  buildCompetitionAnnouncementIntro,
  getScoreboardSettings,
  saveScoreboardSettings,
  shouldAnnounceScore,
} from "../../utils/scoreboardSettings";
import type { ScoreboardSettings } from "../../utils/scoreboardSettings";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface SpeakTextOptions {
  onEnd?: () => void;
  onError?: () => void;
}

const PublicScoreboard: React.FC = () => {
  const isMobile = useIsMobile();

  // 背景特效控制
  const [enableBackgroundEffects, setEnableBackgroundEffects] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [scoreboardSettings, setScoreboardSettings] =
    useState<ScoreboardSettings>(getScoreboardSettings);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const announcementMarkerRef = useRef<string | null>(null);
  const speechRequestIdRef = useRef(0);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSavedSettingsRef = useRef(false);

  const handleTitleClick = useCallback(() => {
    clickCountRef.current += 1;

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    if (clickCountRef.current >= 5) {
      setSettingsModalOpen(true);
      clickCountRef.current = 0;
      clickTimerRef.current = null;
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      clickTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasSavedSettingsRef.current) {
      hasSavedSettingsRef.current = true;
      return;
    }

    saveScoreboardSettings(scoreboardSettings);
  }, [scoreboardSettings]);

  useEffect(() => {
    let cancelled = false;

    shouldEnableBackgroundEffects(
      scoreboardSettings.backgroundEffectsPreference,
    ).then((shouldEnable) => {
      if (!cancelled) {
        setEnableBackgroundEffects(shouldEnable);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [scoreboardSettings.backgroundEffectsPreference]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const voices = synth.getVoices();
      setAvailableVoices(
        [...voices].sort((left, right) => {
          const leftZh = left.lang.toLowerCase().startsWith("zh") ? 1 : 0;
          const rightZh = right.lang.toLowerCase().startsWith("zh") ? 1 : 0;
          return rightZh - leftZh || left.name.localeCompare(right.name);
        }),
      );
    };

    setSpeechSupported(true);
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);

    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
      synth.cancel();
    };
  }, []);

  const voiceOptions = useMemo<ScoreboardVoiceOption[]>(
    () =>
      availableVoices.map((voice) => ({
        label: `${voice.name} (${voice.lang})`,
        value: voice.voiceURI,
      })),
    [availableVoices],
  );

  // 动态导入 Hyperspeed
  const HyperspeedComponent = useMemo(() => {
    if (!enableBackgroundEffects) return null;
    return lazy(() => import("../../components/Hyperspeed"));
  }, [enableBackgroundEffects]);

  const hyperSpeedElement = useMemo(() => {
    if (!HyperspeedComponent) return null;

    return (
      <HyperspeedComponent
        effectOptions={{
          onSpeedUp: () => {},
          onSlowDown: () => {},
          distortion: "LongRaceDistortion",
          length: 400,
          roadWidth: 10,
          islandWidth: 5,
          lanesPerRoad: 2,
          fov: 90,
          fovSpeedUp: 150,
          speedUp: 2,
          carLightsFade: 0.4,
          totalSideLightSticks: 50,
          lightPairsPerRoadWay: 70,
          shoulderLinesWidthPercentage: 0.05,
          brokenLinesWidthPercentage: 0.1,
          brokenLinesLengthPercentage: 0.5,
          lightStickWidth: [0.12, 0.5],
          lightStickHeight: [1.3, 1.7],
          movingAwaySpeed: [60, 80],
          movingCloserSpeed: [-120, -160],
          carLightsLength: [400 * 0.05, 400 * 0.15],
          carLightsRadius: [0.05, 0.14],
          carWidthPercentage: [0.3, 0.5],
          carShiftX: [-0.2, 0.2],
          carFloorSeparation: [0.05, 1],
          colors: {
            roadColor: 0x080808,
            islandColor: 0x0a0a0a,
            background: 0x000000,
            shoulderLines: 0x131318,
            brokenLines: 0x131318,
            leftCars: [0xff5f73, 0xe74d60, 0xff102a],
            rightCars: [0xa4e3e6, 0x80d1d4, 0x53c2c6],
            sticks: 0xa4e3e6,
          },
        }}
      />
    );
  }, [HyperspeedComponent]);

  const navigate = useNavigate();
  const [lastNotifiedCompetitionId, setLastNotifiedCompetitionId] = useState<
    number | null
  >(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationQueue, setAnimationQueue] = useState<Score[]>([]);
  const [animatingCompetition, setAnimatingCompetition] =
    useState<Competition | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [isManualReplay, setIsManualReplay] = useState(false); // 标记是否是手动重播

  // 网站名称
  const {
    name: websiteName,
    icp_beian: icp_beian,
    public_sec_beian: public_sec_beian,
  } = useWebsite();

  const stopAnnouncement = useCallback(() => {
    speechRequestIdRef.current += 1;

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
  }, []);

  const speakText = useCallback(
    (text: string, options?: SpeakTextOptions) => {
      if (
        !speechSupported ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        !text.trim()
      ) {
        return false;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const selectedVoice = availableVoices.find(
        (voice) =>
          voice.voiceURI === scoreboardSettings.scoreAnnouncement.voiceURI,
      );

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = "zh-CN";
      }

      utterance.rate = scoreboardSettings.scoreAnnouncement.speechRate;

      const synth = window.speechSynthesis;
      const requestId = speechRequestIdRef.current + 1;
      speechRequestIdRef.current = requestId;

      const finalize = (callback?: () => void) => {
        if (speechRequestIdRef.current !== requestId) {
          return;
        }

        callback?.();
      };

      utterance.onend = () => finalize(options?.onEnd);
      utterance.onerror = () => finalize(options?.onError);
      synth.cancel();
      synth.speak(utterance);

      return true;
    },
    [
      availableVoices,
      scoreboardSettings.scoreAnnouncement.speechRate,
      scoreboardSettings.scoreAnnouncement.voiceURI,
      speechSupported,
    ],
  );

  const previewAnnouncement = useCallback(() => {
    if (!speechSupported) {
      message.warning("当前浏览器不支持成绩播报");
      return;
    }

    speakText("成绩公布。男子一百米。第1名。十二秒三四。高一一班。张三。");
  }, [speakText, speechSupported]);

  // 动画队列管理
  const [animationTaskQueue, setAnimationTaskQueue] = useState<
    Array<{
      competition: Competition;
      scores: Score[];
    }>
  >([]);
  const [isProcessingAnimation, setIsProcessingAnimation] = useState(false);

  // 主Modal状态
  const [
    completedCompetitionsModalVisible,
    setCompletedCompetitionsModalVisible,
  ] = useState(false);
  const [pendingCompetitionsModalVisible, setPendingCompetitionsModalVisible] =
    useState(false);
  const [completedCompetitions, setCompletedCompetitions] = useState<
    Competition[]
  >([]);
  const [pendingCompetitions, setPendingCompetitions] = useState<Competition[]>(
    [],
  );
  const [completedLoading, setCompletedLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Modal zIndex 状态
  const [completedModalZIndex, setCompletedModalZIndex] = useState(0);
  const [pendingModalZIndex, setPendingModalZIndex] = useState(0);

  // 学生成绩 Modal 列表
  const [studentModals, setStudentModals] = useState<
    Array<{
      id: number; // 使用递增 ID 作为唯一标识
      studentId: number;
      studentName: string;
      scores: Score[];
      loading: boolean;
      zIndex: number;
      competitionUnits: Record<number, string>;
      open: boolean; // 控制打开/关闭状态，用于动画
      pointsDetails: Record<number, number>; // 每个比赛对应的得分
    }>
  >([]);

  // 比赛详情 Modal 列表
  const [detailModals, setDetailModals] = useState<
    Array<{
      id: number; // 使用递增 ID 作为唯一标识
      competitionId: number;
      competition: Competition;
      scores: Score[];
      registrations: Registration[];
      loading: boolean;
      zIndex: number;
      open: boolean; // 控制打开/关闭状态，用于动画
    }>
  >([]);

  // 班级得分明细 Modal 列表
  const [classPointsModals, setClassPointsModals] = useState<
    Array<{
      id: number;
      classId: number;
      className: string;
      pointsDetails: any[];
      loading: boolean;
      zIndex: number;
      open: boolean;
    }>
  >([]);

  // Modal 管理 - 使用全局递增的 ID 和 zIndex
  const baseZIndex = 1;
  const globalZIndexRef = useRef(baseZIndex);
  const modalIdCounterRef = useRef(0);

  // 获取下一个 zIndex
  const getNextZIndex = () => {
    globalZIndexRef.current += 1;
    return globalZIndexRef.current;
  };

  // 获取下一个 modal ID
  const getNextModalId = () => {
    modalIdCounterRef.current += 1;
    return modalIdCounterRef.current;
  };

  // 统计数据
  const [stats, setStats] = useState({
    completedCount: 0,
    pendingCount: 0,
    topClasses: [] as any[],
    topStudents: [] as any[],
  });

  // ETag 缓存管理
  const [statisticsEtag, setStatisticsEtag] = useState<string | null>(null);

  const getPlayedCompetitions = useCallback(() => {
    const playedCompetitionsRaw =
      localStorage.getItem("played_competitions") || "[]";

    try {
      const parsed = JSON.parse(playedCompetitionsRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  // 清理超过10分钟的播放记录
  const cleanExpiredPlayedCompetitions = useCallback(() => {
    const playedCompetitions = getPlayedCompetitions();

    const now = Date.now();
    const validPlayedCompetitions = playedCompetitions.filter((item) => {
      return now - item.timestamp <= 10 * 60 * 1000; // 保留10分钟内的记录
    });

    if (validPlayedCompetitions.length !== playedCompetitions.length) {
      localStorage.setItem(
        "played_competitions",
        JSON.stringify(validPlayedCompetitions),
      );
    }
  }, []);

  // 处理最新成绩的逻辑
  const processLatestResult = useCallback(
    (data: {
      latest_competition?: Competition | null;
      latest_scores?: Score[] | null;
    }) => {
      if (
        !data?.latest_competition ||
        !data.latest_scores ||
        data.latest_scores.length === 0 ||
        data.latest_competition.id === lastNotifiedCompetitionId
      ) {
        return;
      }

      const comp = data.latest_competition;

      // 检查localStorage是否已存在该比赛id，并且审核时间匹配
      const playedCompetitions = getPlayedCompetitions();

      // 获取当前比赛的审核时间戳
      const currentReviewedTimestamp = comp.score_reviewed_at
        ? new Date(comp.score_reviewed_at).getTime()
        : 0;

      // 检查是否已经播放过相同审核时间的成绩
      const alreadyPlayed = playedCompetitions.some(
        (item) =>
          item.id === comp.id && item.timestamp === currentReviewedTimestamp,
      );

      if (alreadyPlayed) {
        return;
      }

      // 检查成绩审核时间是否超过10分钟
      if (comp.score_reviewed_at) {
        const reviewedAt = new Date(comp.score_reviewed_at).getTime();
        const now = Date.now();
        if (now - reviewedAt > 10 * 60 * 1000) {
          return;
        }
      }

      // 使用函数形式的setState来检查重复，确保访问最新的队列状态
      setAnimationTaskQueue((prev) => {
        // 检查队列中是否已经有相同的比赛
        const isDuplicate = prev.some(
          (task) => task.competition.id === comp.id,
        );
        if (!isDuplicate && data.latest_scores) {
          return [...prev, { competition: comp, scores: data.latest_scores }];
        }
        return prev;
      });
    },
    [getPlayedCompetitions, lastNotifiedCompetitionId],
  );

  // 获取统计数据并检查最新成绩
  const fetchStatsAndCheckLatest = useCallback(async () => {
    // 先清理过期记录
    cleanExpiredPlayedCompetitions();

    const statistics = await publicAPI.getStatistics(
      statisticsEtag || undefined,
    );

    // 处理 304 Not Modified - 数据未改变，忽略
    if (statistics.notModified) {
      return;
    }

    // 处理新数据
    handleResp(
      statistics,
      (data) => {
        if (data) {
          // 更新统计数据
          setStats({
            completedCount: data.completed_competition_count,
            pendingCount: data.remaining_competition_count,
            topClasses: data.top_classes || [],
            topStudents: data.top_students || [],
          });

          // 缓存所有统计数据
          const newCache = {
            latest_competition: data.latest_competition,
            latest_scores: data.latest_scores,
            completed_competition_count: data.completed_competition_count,
            remaining_competition_count: data.remaining_competition_count,
            top_classes: data.top_classes,
            top_students: data.top_students,
          };

          // 保存新的 ETag
          if (statistics.etag) {
            setStatisticsEtag(statistics.etag);
          }

          // 检查最新成绩
          processLatestResult(newCache);
        }
      },
      (_, code) => {
        // 如果返回403错误，说明看板功能已关闭，跳转到登录页面
        if (code === 403) {
          navigate("/login");
        }
      },
    );
  }, [cleanExpiredPlayedCompetitions, processLatestResult, navigate]);

  // 获取已完成比赛
  const fetchCompletedCompetitions = async () => {
    setCompletedLoading(true);
    const data = await publicAPI.getCompetitions({ status: "completed" });
    handleRespWithoutNotify(
      data,
      (data) => {
        setCompletedCompetitions(data || []);
        setCompletedLoading(false);
      },
      () => {
        setCompletedLoading(false);
      },
    );
  };

  // 获取待完成比赛
  const fetchPendingCompetitions = async () => {
    setPendingLoading(true);
    const data = await publicAPI.getCompetitions({
      status: "approved,pending_score_review",
    });
    handleRespWithoutNotify(
      data,
      (data) => {
        setPendingCompetitions(data || []);
        setPendingLoading(false);
      },
      () => {
        setPendingLoading(false);
      },
    );
  };

  // 获取学生成绩
  const fetchStudentScores = async (studentId: number) => {
    const [scoresResp, pointsResp] = await Promise.all([
      publicAPI.getStudentScores(studentId),
      publicAPI.getStudentPointDetails(studentId),
    ]);

    const result: {
      scores: Score[];
      units: Record<number, string>;
      points: Record<number, number>;
    } = {
      scores: [],
      units: {},
      points: {},
    };

    await handleRespWithoutNotify(
      scoresResp,
      async (data) => {
        result.scores = data || [];

        // 获取每个比赛的单位信息
        if (data && data.length > 0) {
          const units: Record<number, string> = {};
          for (const score of data) {
            if (!units[score.competition_id]) {
              const competition = await publicAPI.getCompetition(
                score.competition_id,
              );
              await handleRespWithoutNotify(competition, (compData) => {
                if (compData) {
                  units[score.competition_id] = compData.unit;
                }
              });
            }
          }
          result.units = units;
        }
      },
      () => {},
    );

    // 处理得分明细
    await handleRespWithoutNotify(
      pointsResp,
      (pointsData: any[]) => {
        if (pointsData) {
          const pointsMap: Record<number, number> = {};
          pointsData.forEach((detail: any) => {
            if (detail.competition_id && detail.points) {
              pointsMap[detail.competition_id] = detail.points;
            }
          });
          result.points = pointsMap;
        }
      },
      () => {},
    );

    return result;
  };

  // 获取比赛报名信息
  const fetchCompetitionRegistrations = async (competitionId: number) => {
    const registrations =
      await publicAPI.getCompetitionRegistrations(competitionId);
    let result: Registration[] = [];

    handleRespWithoutNotify(
      registrations,
      (data) => {
        result = data || [];
      },
      () => {},
    );

    return result;
  };

  useEffect(() => {
    fetchStatsAndCheckLatest();
    const interval = setInterval(() => {
      fetchStatsAndCheckLatest();
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchStatsAndCheckLatest]);

  // 处理动画队列
  useEffect(() => {
    if (!isProcessingAnimation && animationTaskQueue.length > 0) {
      const nextTask = animationTaskQueue[0];
      setIsProcessingAnimation(true);
      setAnimatingCompetition(nextTask.competition);
      announcementMarkerRef.current = null;
      // 只显示前8名
      setAnimationQueue(nextTask.scores.slice(0, 8));
      setShowAnimation(true);
      setCurrentIndex(0);
      setLightRaysColor("#FFD700"); // 重置光线颜色为默认值
      setIsManualReplay(false); // 自动播放，不是手动重播

      // 在开始处理动画时就设置lastNotifiedCompetitionId，防止重复添加
      setLastNotifiedCompetitionId(nextTask.competition.id);
      // 从队列中移除当前任务
      setAnimationTaskQueue((prev) => prev.slice(1));
    }
  }, [animationTaskQueue, isProcessingAnimation]);

  // 结束动画（复用此函数处理动画结束逻辑）
  const endAnimation = () => {
    if (!animatingCompetition) return;

    announcementMarkerRef.current = null;
    stopAnnouncement();

    // 标记为已播放
    const compId = animatingCompetition.id;
    const reviewedTimestamp = animatingCompetition.score_reviewed_at
      ? new Date(animatingCompetition.score_reviewed_at).getTime()
      : Date.now();

    const playedCompetitions = getPlayedCompetitions();

    const existingIndex = playedCompetitions.findIndex(
      (item) => item.id === compId && item.timestamp === reviewedTimestamp,
    );

    if (existingIndex === -1) {
      playedCompetitions.push({ id: compId, timestamp: reviewedTimestamp });
      localStorage.setItem(
        "played_competitions",
        JSON.stringify(playedCompetitions),
      );
    }

    setShowAnimation(false);
    setIsProcessingAnimation(false);
    // 只有在非手动重播且设置允许时才打开模态框
    if (!isManualReplay && scoreboardSettings.autoOpenResultModal) {
      handleViewScores(animatingCompetition);
    }
    setCurrentIndex(0);
    setAnimatingCompetition(null);
  };

  // 重播动画
  const replayAnimation = (competition: Competition, modalId?: number) => {
    // 关闭模态框（如果提供了 modalId）
    if (modalId !== undefined) {
      closeDetailModal(modalId);
    }

    // 获取该比赛的成绩
    publicAPI.getCompetitionScores(competition.id).then((response) => {
      handleResp(response, (scores) => {
        announcementMarkerRef.current = null;
        stopAnnouncement();
        setAnimatingCompetition(competition);
        setAnimationQueue(scores.slice(0, 8)); // 只显示前8名
        setShowAnimation(true);
        setCurrentIndex(0);
        setLightRaysColor("#FFD700");
        setIsProcessingAnimation(true); // 标记为正在处理动画
        setIsManualReplay(true); // 标记为手动重播
      });
    });
  };

  // 长按开始
  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      endAnimation();
    }, 800); // 长按800ms后结束动画
    setLongPressTimer(timer);
  };

  // 长按取消
  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // 处理查看已完成比赛
  const handleViewCompletedCompetitions = async () => {
    setCompletedModalZIndex(getNextZIndex());
    setCompletedCompetitionsModalVisible(true);
    await fetchCompletedCompetitions();
  };

  // 处理查看待完成比赛
  const handleViewPendingCompetitions = async () => {
    setPendingModalZIndex(getNextZIndex());
    setPendingCompetitionsModalVisible(true);
    await fetchPendingCompetitions();
  };

  // 处理查看比赛详情
  const handleViewCompetitionDetail = async (competition: Competition) => {
    // 每次都创建新的 modal 实例
    const modalId = getNextModalId();
    const newModal = {
      id: modalId,
      competitionId: competition.id,
      competition,
      scores: [] as Score[],
      registrations: [] as Registration[],
      loading: true,
      zIndex: getNextZIndex(),
      open: true,
    };

    setDetailModals((prev) => [...prev, newModal]);

    // 异步加载数据
    if (competition.status === "completed") {
      const scores = await publicAPI.getCompetitionScores(competition.id);
      await handleRespWithoutNotify(
        scores,
        (data) => {
          setDetailModals((prev) =>
            prev.map((m) =>
              m.id === modalId
                ? { ...m, scores: data || [], loading: false }
                : m,
            ),
          );
        },
        () => {
          setDetailModals((prev) =>
            prev.map((m) => (m.id === modalId ? { ...m, loading: false } : m)),
          );
        },
      );
    } else {
      const registrations = await fetchCompetitionRegistrations(competition.id);
      setDetailModals((prev) =>
        prev.map((m) =>
          m.id === modalId ? { ...m, registrations, loading: false } : m,
        ),
      );
    }
  };

  // 处理查看比赛成绩（从动画或其他地方调用）
  const handleViewScores = async (competition: Competition) => {
    // 直接调用查看比赛详情
    handleViewCompetitionDetail(competition);
  };

  // 处理查看学生成绩
  const handleViewStudentScores = async (
    studentId: number,
    studentName: string,
  ) => {
    // 每次都创建新的 modal 实例
    const modalId = getNextModalId();
    const newModal = {
      id: modalId,
      studentId,
      studentName,
      scores: [] as Score[],
      loading: true,
      zIndex: getNextZIndex(),
      competitionUnits: {},
      open: true,
      pointsDetails: {},
    };

    setStudentModals((prev) => [...prev, newModal]);

    // 异步加载数据
    const result = await fetchStudentScores(studentId);
    setStudentModals((prev) =>
      prev.map((m) =>
        m.id === modalId
          ? {
              ...m,
              scores: result.scores,
              competitionUnits: result.units,
              pointsDetails: result.points,
              loading: false,
            }
          : m,
      ),
    );
  };

  // 关闭学生成绩 modal - 先设置 open 为 false 触发关闭动画
  const closeStudentModal = (modalId: number) => {
    // 先将 open 设置为 false，触发关闭动画
    setStudentModals((prev) =>
      prev.map((m) => (m.id === modalId ? { ...m, open: false } : m)),
    );
    // 等待动画结束后再从列表中移除
    setTimeout(() => {
      setStudentModals((prev) => prev.filter((m) => m.id !== modalId));
    }, 300);
  };

  // 处理查看班级得分明细
  const handleViewClassPoints = async (classId: number, className: string) => {
    const modalId = getNextModalId();
    const newModal = {
      id: modalId,
      classId,
      className,
      pointsDetails: [],
      loading: true,
      zIndex: getNextZIndex(),
      open: true,
    };

    setClassPointsModals((prev) => [...prev, newModal]);

    // 异步加载数据
    const pointsResp = await publicAPI.getClassPointDetails(classId);
    await handleRespWithoutNotify(
      pointsResp,
      (data: any[]) => {
        setClassPointsModals((prev) =>
          prev.map((m) =>
            m.id === modalId
              ? { ...m, pointsDetails: data || [], loading: false }
              : m,
          ),
        );
      },
      () => {
        setClassPointsModals((prev) =>
          prev.map((m) => (m.id === modalId ? { ...m, loading: false } : m)),
        );
      },
    );
  };

  // 关闭班级得分明细 modal
  const closeClassPointsModal = (modalId: number) => {
    setClassPointsModals((prev) =>
      prev.map((m) => (m.id === modalId ? { ...m, open: false } : m)),
    );
    setTimeout(() => {
      setClassPointsModals((prev) => prev.filter((m) => m.id !== modalId));
    }, 300);
  };

  // 关闭比赛详情 modal - 先设置 open 为 false 触发关闭动画
  const closeDetailModal = (modalId: number) => {
    // 先将 open 设置为 false，触发关闭动画
    setDetailModals((prev) =>
      prev.map((m) => (m.id === modalId ? { ...m, open: false } : m)),
    );
    // 等待动画结束后再从列表中移除
    setTimeout(() => {
      setDetailModals((prev) => prev.filter((m) => m.id !== modalId));
    }, 300);
  };

  // 获取排名图标
  const getRankingIcon = (ranking: number | null) => {
    if (!ranking) return null;
    if (ranking <= 3) return <TrophyOutlined />;
    return null;
  };

  // 移动端 - 比赛卡片列表
  const renderCompetitionCards = (
    competitions: Competition[],
    onView: (comp: Competition) => void,
  ) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {competitions.map((comp) => (
          <Card
            key={comp.id}
            hoverable
            onClick={() => onView(comp)}
            bodyStyle={{ padding: 16 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  {comp.name}
                </div>
                <Space size="small" wrap>
                  <Tag color="blue">{getGenderText(comp.gender)}</Tag>
                  {getStatusTag(comp.status)}
                </Space>
              </div>
              <Button type="primary" icon={<EyeOutlined />} size="small">
                查看
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // 移动端 - 成绩卡片列表
  const renderScoreCards = (scores: Score[], unit: string) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {scores.map((score) => (
          <Card
            key={score.id}
            bodyStyle={{ padding: 16 }}
            style={{
              borderLeft:
                score.ranking && score.ranking <= 3
                  ? `4px solid ${getRankingColor(score.ranking)}`
                  : undefined,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div>
                      <Button
                        type="link"
                        onClick={() => {
                          if (score.student_id) {
                            handleViewStudentScores(
                              score.student_id,
                              score.student_name,
                            );
                          }
                        }}
                        style={{
                          padding: 0,
                          height: "auto",
                          fontWeight: 600,
                          fontSize: 16,
                        }}
                      >
                        {score.student_name}
                      </Button>
                      <div style={{ color: "#666", fontSize: 13 }}>
                        <TeamOutlined /> {score.class_name}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: "bold",
                          color: "#1677ff",
                        }}
                      >
                        {score.score} {unit}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: "bold",
                          color: "#ff4d4f",
                        }}
                      >
                        (
                        {score.point !== undefined && score.point !== null
                          ? score.point
                          : 0}
                        分)
                      </span>
                    </div>
                    {score.ranking && (
                      <Tag
                        color={getRankingColor(score.ranking)}
                        icon={getRankingIcon(score.ranking)}
                        style={{
                          fontSize: 14,
                          fontWeight: "bold",
                          padding: "4px 12px",
                        }}
                      >
                        第 {score.ranking} 名
                      </Tag>
                    )}
                  </div>
                </Space>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // 移动端 - 学生成绩卡片列表
  const renderStudentScoreCards = (
    scores: Score[],
    competitionUnits: Record<number, string>,
  ) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {scores.map((score) => {
          const unit = competitionUnits[score.competition_id] || "";
          return (
            <Card
              key={score.id}
              bodyStyle={{ padding: 16 }}
              style={{
                borderLeft:
                  score.ranking && score.ranking <= 3
                    ? `4px solid ${getRankingColor(score.ranking)}`
                    : undefined,
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <Button
                  type="link"
                  onClick={async () => {
                    const competition = await publicAPI.getCompetition(
                      score.competition_id,
                    );
                    handleRespWithoutNotify(competition, (data) => {
                      if (data) {
                        handleViewScores(data);
                      }
                    });
                  }}
                  style={{
                    padding: 0,
                    height: "auto",
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  {score.competition_name}
                </Button>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: "bold",
                      color: "#1677ff",
                    }}
                  >
                    {score.score} {unit}
                  </span>
                </div>
                {score.ranking && (
                  <Tag
                    color={getRankingColor(score.ranking)}
                    icon={getRankingIcon(score.ranking)}
                    style={{
                      fontSize: 14,
                      fontWeight: "bold",
                      padding: "4px 12px",
                    }}
                  >
                    第 {score.ranking} 名
                  </Tag>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  // 移动端 - 报名信息卡片列表
  const renderRegistrationCards = (registrations: Registration[]) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {registrations.map((reg) => (
          <Card
            key={reg.id}
            bodyStyle={{ padding: 16 }}
            hoverable
            onClick={() => {
              if (reg.student_id && reg.student_name) {
                handleViewStudentScores(reg.student_id, reg.student_name);
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar
                size={48}
                icon={<UserOutlined />}
                style={{ backgroundColor: "#1677ff" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                  {reg.student_name}
                </div>
                <div style={{ color: "#666", fontSize: 14 }}>
                  <TeamOutlined /> {reg.class_name}
                </div>
              </div>
              <Button type="link" icon={<EyeOutlined />} size="small">
                查看
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // 动画逻辑 - 逐步显示成绩
  const [currentIndex, setCurrentIndex] = useState(0);
  const animationRef = useRef<HTMLDivElement>(null);

  // 光线颜色状态
  const [lightRaysColor, setLightRaysColor] = useState("#FFD700");

  // 音效预加载
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    // 预加载音效
    audioRef.current = new Audio("/effect.mp3");
    audioRef.current.preload = "auto";
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 播放音效的函数
  const playEffect = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; // 重置到开始位置
      audioRef.current.play().catch((err) => {
        console.warn("音效播放失败:", err);
      });
    }
  };

  useEffect(() => {
    if (!showAnimation || !animatingCompetition) return;

    if (currentIndex === 0) {
      if (scoreboardSettings.scoreAnnouncement.enabled) {
        const announcementKey = "animation-opening";
        if (announcementMarkerRef.current !== announcementKey) {
          announcementMarkerRef.current = announcementKey;
          speakText(buildAnimationOpeningAnnouncement());
        }
      }

      const timer = setTimeout(() => setCurrentIndex(1), 2000);
      return () => clearTimeout(timer);
    }
    if (currentIndex === 1) {
      if (scoreboardSettings.scoreAnnouncement.enabled) {
        const announcementKey = `${animatingCompetition.id}-intro`;
        if (announcementMarkerRef.current !== announcementKey) {
          announcementMarkerRef.current = announcementKey;
          speakText(buildCompetitionAnnouncementIntro(animatingCompetition));
        }
      }

      const timer = setTimeout(() => setCurrentIndex(2), 2000);
      return () => clearTimeout(timer);
    }

    // 从第2步开始是选手成绩展示
    const scoreIndex = Math.floor((currentIndex - 2) / 4); // 每个选手占4步
    const stepInScore = (currentIndex - 2) % 4; // 当前是该选手的第几步

    // 更新光线颜色
    if (scoreIndex < animationQueue.length && animationQueue[scoreIndex]) {
      const score = animationQueue[scoreIndex];
      const ranking = score.ranking || 0;
      setLightRaysColor(getRankingColor(ranking));
    }

    if (scoreIndex >= animationQueue.length) {
      // 动画播放完成，复用 endAnimation 处理结束逻辑
      endAnimation();
      return;
    }

    // 在展示成绩的最后一步触发 confetti 并播放音效
    const currentScore = animationQueue[scoreIndex];
    let playedEffectAfterAnnouncement = false;
    if (shouldAnnounceScore(scoreboardSettings, currentScore)) {
      const announcementKey = `${animatingCompetition.id}-${currentScore.id}-${currentIndex}`;
      if (announcementMarkerRef.current !== announcementKey) {
        announcementMarkerRef.current = announcementKey;
        const announcementText = buildAnimationStepAnnouncement(
          animatingCompetition,
          currentScore,
          stepInScore,
        );

        if (stepInScore === 3) {
          playedEffectAfterAnnouncement = speakText(announcementText, {
            onEnd: playEffect,
            onError: playEffect,
          });
        } else {
          speakText(announcementText);
        }
      }
    }

    if (stepInScore === 3) {
      const ranking = currentScore.ranking;

      if (!playedEffectAfterAnnouncement) {
        playEffect();
      }

      if (ranking === 1) {
        confetti({
          particleCount: 500,
          ticks: 100,
          spread: 100,
          origin: { y: 0.6, x: 0.5 },
          colors: ["#FFD700", "#FFFACD", "#FFA500"], // 金色系
          zIndex: 1999,
        });
      } else if (ranking === 2) {
        confetti({
          particleCount: 300,
          ticks: 100,
          spread: 80,
          origin: { y: 0.6, x: 0.5 },
          colors: ["#C0C0C0", "#DCDCDC", "#A9A9A9"], // 银色系
          zIndex: 1999,
        });
      } else if (ranking === 3) {
        confetti({
          particleCount: 200,
          ticks: 100,
          spread: 70,
          origin: { y: 0.6, x: 0.5 },
          colors: ["#CD7F32", "#8B4513", "#A0522D"], // 铜色系
          zIndex: 1999,
        });
      } else {
        confetti({
          particleCount: 80,
          ticks: 100,
          spread: 50,
          origin: { y: 0.6, x: 0.5 },
          colors: ["#1677ff", "#52c41a", "#faad14"],
          zIndex: 1999,
        });
      }
    }

    // 下一步定时
    const timer = setTimeout(() => setCurrentIndex(currentIndex + 1), 3000);
    return () => clearTimeout(timer);
  }, [currentIndex, showAnimation, animationQueue, animatingCompetition]);

  useEffect(() => {
    if (!showAnimation) {
      announcementMarkerRef.current = null;
      stopAnnouncement();
    }
  }, [showAnimation, stopAnnouncement]);

  // 比赛表格列（用于已完成比赛模态框）
  const completedCompetitionColumns = [
    {
      title: "项目",
      key: "name",
      render: (record: Competition) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 16 }}>{record.name}</div>
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (record: Competition) => (
        <Button
          type="primary"
          icon={<EyeOutlined />}
          onClick={() => handleViewCompetitionDetail(record)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  // 待完成比赛表格列（用于待完成比赛模态框）
  const pendingCompetitionColumns = [
    {
      title: "项目",
      key: "name",
      render: (record: Competition) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 16 }}>{record.name}</div>
          {record.start_time && record.end_time && (
            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              {dayjs(record.start_time).format("MM-DD HH:mm")} -{" "}
              {dayjs(record.end_time).format("HH:mm")}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (record: Competition) => (
        <Button
          type="primary"
          icon={<EyeOutlined />}
          onClick={() => handleViewCompetitionDetail(record)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  // 成绩列
  const getScoresColumns = (unit: string, competition?: Competition) => {
    const isTeamCompetition = competition?.competition_type === "team";
    const cols: Array<{
      title: string;
      dataIndex: string;
      key: string;
      render?: (value: unknown, record: Score) => React.ReactNode;
    }> = [
      {
        title: "排名",
        dataIndex: "ranking",
        key: "ranking",
        render: (ranking: unknown) =>
          getRankingDisplayForTable(ranking as number | undefined),
      },
    ];

    // 团体比赛不显示学生姓名列
    if (!isTeamCompetition) {
      cols.push({
        title: "姓名",
        dataIndex: "student_name",
        key: "student_name",
        render: (name: unknown, record: Score) => (
          <Button
            type="link"
            icon={<UserOutlined />}
            onClick={() => {
              if (record.student_id) {
                handleViewStudentScores(record.student_id, name as string);
              }
            }}
            style={{
              padding: 0,
              height: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {name as string}
          </Button>
        ),
      });
    }

    cols.push(
      {
        title: "班级",
        dataIndex: "class_name",
        key: "class_name",
        render: (className: unknown) => className as string,
      },
      {
        title: "成绩",
        dataIndex: "score",
        key: "score",
        render: (score: unknown) => (
          <span
            style={{
              padding: 0,
              height: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {score as number} {unit}
          </span>
        ),
      },
      {
        title: "分数",
        dataIndex: "point",
        key: "point",
        render: (point: unknown) => (
          <span
            style={{
              padding: 0,
              height: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {point as number}
          </span>
        ),
      },
    );

    return cols;
  };

  // 学生成绩列
  const getStudentScoresColumns = (
    competitionUnits: Record<number, string>,
    pointsDetails: Record<number, number> = {},
  ): Array<{
    title: string;
    dataIndex: string;
    key: string;
    render?: (value: unknown, record: Score) => React.ReactNode;
  }> => [
    {
      title: "比赛项目",
      dataIndex: "competition_name",
      key: "competition_name",
      render: (name: unknown, record: Score) => (
        <Button
          type="link"
          onClick={async () => {
            const competition = await publicAPI.getCompetition(
              record.competition_id,
            );
            handleRespWithoutNotify(competition, (data) => {
              if (data) {
                handleViewScores(data);
              }
            });
          }}
          style={{ padding: 0, height: "auto", textAlign: "left" }}
        >
          {name as string}
        </Button>
      ),
    },
    {
      title: "成绩",
      dataIndex: "score",
      key: "score",
      render: (score: unknown, record: Score) => {
        const unit = competitionUnits[record.competition_id] || "";
        return (
          <span style={{ fontWeight: "bold", fontSize: 16 }}>
            {score as number} {unit}
          </span>
        );
      },
    },
    {
      title: "排名",
      dataIndex: "ranking",
      key: "ranking",
      render: (ranking: unknown) =>
        getRankingDisplayForTable(ranking as number | undefined),
    },
    {
      title: "得分",
      dataIndex: "competition_id",
      key: "points",
      render: (competitionId: unknown) => {
        const points = pointsDetails[competitionId as number];
        if (points === undefined || points === 0) {
          return <span style={{ color: "#999" }}>-</span>;
        }
        return (
          <span style={{ fontWeight: "bold", fontSize: 16, color: "#ff4d4f" }}>
            {points.toFixed(1)}
          </span>
        );
      },
    },
  ];

  // 报名信息表格列
  const registrationsColumns: Array<{
    title: string;
    dataIndex: string;
    key: string;
    render?: (value: unknown, record: Registration) => React.ReactNode;
  }> = [
    {
      title: "姓名",
      dataIndex: "student_name",
      key: "student_name",
      render: (name: unknown, record: Registration) => (
        <Button
          type="link"
          icon={<UserOutlined />}
          onClick={() => {
            if (record.student_id) {
              handleViewStudentScores(record.student_id, name as string);
            }
          }}
          style={{
            padding: 0,
            height: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {name as string}
        </Button>
      ),
    },
    {
      title: "班级",
      dataIndex: "class_name",
      key: "class_name",
      render: (className: unknown) => className as string,
    },
  ];

  return (
    <Layout
      style={{ minHeight: "100vh", background: "#000", overflow: "hidden" }}
    >
      {/* 背景动画 */}
      {enableBackgroundEffects && (
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
          <Suspense
            fallback={
              <div
                style={{ background: "#000", width: "100%", height: "100%" }}
              />
            }
          >
            {hyperSpeedElement}
          </Suspense>
        </div>
      )}

      {/* 页面内容 */}
      <Header
        style={{
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          zIndex: 10,
        }}
      >
        <Title
          onClick={handleTitleClick}
          style={{
            color: "#fff",
            margin: 0,
            whiteSpace: "nowrap",
            fontSize: "clamp(8px, 5vw, 24px)", // 最小8px，最大24px，随屏幕宽度缩放
            cursor: "default",
            userSelect: "none",
          }}
        >
          {websiteName}
        </Title>
        <div style={{ display: "flex", gap: 12 }}>
          <Button
            type="default"
            icon={<LoginOutlined />}
            onClick={() => navigate("/login")}
          >
            登录
          </Button>
        </div>
      </Header>

      <ScoreboardSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={scoreboardSettings}
        onChange={setScoreboardSettings}
        speechSupported={speechSupported}
        voiceOptions={voiceOptions}
        onPreviewAnnouncement={previewAnnouncement}
      />

      <Content style={{ padding: "16px" }}>
        {/* 统计卡片 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12}>
            <Card
              style={{
                backdropFilter: "blur(10px)",
                background: "rgba(0,0,0,0.6)",
                borderRadius: 12,
                border: "none",
              }}
            >
              <Statistic
                title={<span style={{ color: "#ffffffff" }}>已完成比赛</span>}
                value={stats.completedCount}
                prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                valueStyle={{ color: "#52c41a" }}
                // 自定义渲染
                formatter={(value) => (
                  <span style={{ color: "#ffffffff" }}>{value}</span>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card
              style={{
                backdropFilter: "blur(10px)",
                background: "rgba(0,0,0,0.6)",
                borderRadius: 12,
                border: "none",
              }}
            >
              <Statistic
                title={<span style={{ color: "#ffffffff" }}>待完成比赛</span>}
                value={stats.pendingCount}
                prefix={<ClockCircleOutlined style={{ color: "#fa8c16" }} />}
                valueStyle={{ color: "#fa8c16" }}
                // 自定义渲染
                formatter={(value) => (
                  <span style={{ color: "#ffffffff" }}>{value}</span>
                )}
              />
            </Card>
          </Col>
        </Row>

        {/* 操作按钮 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card
              style={{
                backdropFilter: "blur(10px)",
                background: "rgba(0,0,0,0.6)",
                borderRadius: 12,
                border: "none",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <TrophyOutlined
                  style={{
                    fontSize: "2.5rem",
                    color: "#faad14",
                    marginBottom: 16,
                  }}
                />
                <Title level={4} style={{ color: "#fff", marginBottom: 16 }}>
                  历史成绩
                </Title>
                <Text
                  style={{
                    color: "#d9d9d9",
                    display: "block",
                    marginBottom: 16,
                  }}
                >
                  查看已完成比赛的详细成绩和排名
                </Text>
                <Button
                  type="primary"
                  size="large"
                  icon={<BarChartOutlined />}
                  onClick={handleViewCompletedCompetitions}
                  style={{ width: "100%" }}
                >
                  查看历史成绩
                </Button>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card
              style={{
                backdropFilter: "blur(10px)",
                background: "rgba(0,0,0,0.6)",
                borderRadius: 12,
                border: "none",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <ClockCircleOutlined
                  style={{
                    fontSize: "2.5rem",
                    color: "#fa8c16",
                    marginBottom: 16,
                  }}
                />
                <Title level={4} style={{ color: "#fff", marginBottom: 16 }}>
                  待完成比赛
                </Title>
                <Text
                  style={{
                    color: "#d9d9d9",
                    display: "block",
                    marginBottom: 16,
                  }}
                >
                  查看即将开始和正在进行的比赛项目
                </Text>
                <Button
                  type="primary"
                  size="large"
                  icon={<EyeOutlined />}
                  onClick={handleViewPendingCompetitions}
                  style={{ width: "100%" }}
                >
                  查看待完成比赛
                </Button>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Top8 班级和学生排行榜 */}
        {(stats.topClasses.length > 0 || stats.topStudents.length > 0) && (
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            {stats.topClasses.length > 0 && (
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <span style={{ color: "#fff", fontSize: 18 }}>
                      <TeamOutlined style={{ marginRight: 8 }} />
                      班级分数榜 TOP10
                    </span>
                  }
                  style={{
                    backdropFilter: "blur(10px)",
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: 12,
                    border: "none",
                  }}
                  headStyle={{
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    {stats.topClasses.map((cls: any) => {
                      const barColor = getRankingColor(cls.rank);
                      const maxPoints = stats.topClasses[0]?.total_points || 1;
                      const percentage = (cls.total_points / maxPoints) * 100;

                      return (
                        <div
                          key={cls.class_id}
                          style={{
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: barColor,
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "bold",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {cls.rank}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 4,
                              }}
                            >
                              <Button
                                type="link"
                                onClick={() =>
                                  handleViewClassPoints(
                                    cls.class_id,
                                    cls.class_name,
                                  )
                                }
                                style={{
                                  padding: 0,
                                  height: "auto",
                                  color: "#fff",
                                  fontWeight: "bold",
                                  fontSize: 14,
                                  textAlign: "left",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {cls.class_name}
                              </Button>
                              <Text
                                strong
                                style={{ color: barColor, fontSize: 14 }}
                              >
                                {cls.total_points.toFixed(1)}分
                              </Text>
                            </div>
                            <div
                              style={{
                                height: 8,
                                background: "rgba(255,255,255,0.1)",
                                borderRadius: 4,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${percentage}%`,
                                  background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`,
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </Col>
            )}

            {stats.topStudents.length > 0 && (
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <span style={{ color: "#fff", fontSize: 18 }}>
                      <UserOutlined style={{ marginRight: 8 }} />
                      个人分数榜 TOP10
                    </span>
                  }
                  style={{
                    backdropFilter: "blur(10px)",
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: 12,
                    border: "none",
                  }}
                  headStyle={{
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    {stats.topStudents.map((student: any, index: number) => {
                      const barColor = getRankingColor(index + 1);
                      const maxPoints = stats.topStudents[0]?.total_points || 1;
                      const percentage =
                        (student.total_points / maxPoints) * 100;

                      return (
                        <div
                          key={student.student_id}
                          style={{
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: barColor,
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "bold",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {index + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <Button
                                  type="link"
                                  onClick={() =>
                                    handleViewStudentScores(
                                      student.student_id,
                                      student.student_name,
                                    )
                                  }
                                  style={{
                                    padding: 0,
                                    height: "auto",
                                    color: "#fff",
                                    fontWeight: "bold",
                                    fontSize: 14,
                                  }}
                                >
                                  {student.student_name}
                                </Button>
                                <Text
                                  style={{
                                    color: "rgba(255,255,255,0.6)",
                                    fontSize: 12,
                                    marginLeft: 8,
                                  }}
                                >
                                  {student.class_name}
                                </Text>
                              </div>
                              <Text
                                strong
                                style={{
                                  color: barColor,
                                  fontSize: 14,
                                  flexShrink: 0,
                                }}
                              >
                                {student.total_points.toFixed(1)}分
                              </Text>
                            </div>
                            <div
                              style={{
                                height: 8,
                                background: "rgba(255,255,255,0.1)",
                                borderRadius: 4,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${percentage}%`,
                                  background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`,
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </Col>
            )}
          </Row>
        )}
      </Content>

      {/* Footer容器 */}
      {(icp_beian || public_sec_beian) && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            margin: 16,
          }}
        >
          <div
            style={{
              backdropFilter: "blur(10px)",
              background: "rgba(0,0,0,0.6)",
              borderRadius: 12,
              border: "none",
              padding: 16,
              display: "inline-block",
              maxWidth: "fit-content",
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "#fff",
                fontSize: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "24px",
                  flexWrap: "wrap",
                }}
              >
                {icp_beian && (
                  <a
                    href="https://beian.miit.gov.cn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#fff",
                      fontWeight: "normal",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {icp_beian}
                  </a>
                )}
                {public_sec_beian && (
                  <a
                    href={`https://beian.mps.gov.cn/#/query/webSearch?code=${public_sec_beian.match(/\d+/g)?.join("") || ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <img
                      src="https://www.beian.gov.cn/img/new/gongan.png"
                      alt="公安备案图标"
                      style={{ marginRight: "5px", height: "16px" }}
                    />
                    {public_sec_beian}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 成绩动画 */}
      {showAnimation && animatingCompetition && (
        <div
          ref={animationRef}
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            color: "#fff",
            textAlign: "center",
            padding: 16,
            cursor: "default",
          }}
        >
          {/* 光线特效背景层 */}
          {currentIndex >= 2 && animationQueue.length > 0 && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
              }}
            >
              <LightRays
                raysOrigin="top-center"
                raysColor={lightRaysColor}
                lightSpread={3}
                rayLength={4}
                saturation={2}
                followMouse={false}
                mouseInfluence={0.1}
                fadeDistance={1.5}
                noiseAmount={0.1}
              />
            </div>
          )}
          {currentIndex === 0 && (
            <FadeContent
              blur={true}
              duration={800}
              easing="ease-out"
              initialOpacity={0}
            >
              <div
                style={{
                  fontSize: "4rem",
                  fontWeight: "bold",
                  marginBottom: "2rem",
                  color: "#fff",
                }}
              >
                成绩公布
              </div>
            </FadeContent>
          )}
          {currentIndex === 1 && (
            <div
              style={{
                fontSize: "4rem",
                fontWeight: "bold",
                marginBottom: "2rem",
                color: "#fff",
              }}
            >
              <BlurText
                text={animatingCompetition.name}
                delay={200}
                animateBy="words"
                direction="top"
                className=""
              />
            </div>
          )}
          {currentIndex >= 2 &&
            animationQueue.length > 0 &&
            (() => {
              const scoreIndex = Math.floor((currentIndex - 2) / 4);
              const stepInScore = (currentIndex - 2) % 4;
              const score = animationQueue[scoreIndex];

              // 检查 scoreIndex 是否有效，防止访问数组越界
              if (!score || scoreIndex >= animationQueue.length) {
                return null;
              }

              return (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "100%",
                    color: "#fff",
                    height: "20rem", // 四行总高度
                  }}
                >
                  {/* 第1行：排名 */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      height: "5rem", // 固定高度
                      fontSize: "4rem",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      whiteSpace: "nowrap", // 强制单行显示
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stepInScore >= 0 && (
                      <BlurText
                        key={`ranking-${scoreIndex}`}
                        text={`第 ${score.ranking} 名`}
                        delay={200}
                        animateBy="letters"
                        direction="top"
                      />
                    )}
                  </div>

                  {/* 第2行：成绩 */}
                  <div
                    style={{
                      position: "absolute",
                      top: "5rem", // 紧接第一行
                      height: "5rem",
                      fontSize: "4rem",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      whiteSpace: "nowrap", // 强制单行显示
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stepInScore >= 1 && (
                      <BlurText
                        key={`score-${scoreIndex}`}
                        text={`${score.score} ${animatingCompetition.unit}`}
                        delay={200}
                        animateBy="letters"
                        direction="top"
                      />
                    )}
                  </div>

                  {/* 第3行：班级 */}
                  <div
                    style={{
                      position: "absolute",
                      top: "10rem", // 紧接第二行
                      height: "5rem",
                      fontSize: "4rem",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      whiteSpace: "nowrap", // 强制单行显示
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stepInScore >= 2 && (
                      <BlurText
                        key={`class-${scoreIndex}`}
                        text={`${score.class_name}`}
                        delay={200}
                        animateBy="letters"
                        direction="top"
                      />
                    )}
                  </div>

                  {/* 第4行：姓名 */}
                  <div
                    style={{
                      position: "absolute",
                      top: "15rem", // 紧接第三行
                      height: "5rem",
                      fontSize: "4rem",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      whiteSpace: "nowrap", // 强制单行显示
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stepInScore >= 3 && (
                      <BlurText
                        key={`name-${scoreIndex}`}
                        text={`${score.student_name}`}
                        delay={200}
                        animateBy="letters"
                        direction="top"
                      />
                    )}
                  </div>
                </div>
              );
            })()}

          {/* 长按提示 */}
          <div
            style={{
              position: "fixed",
              bottom: 40,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: 10,
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            长按屏幕跳过动画
          </div>
        </div>
      )}

      {/* 已完成比赛模态框 */}
      <Modal
        title={
          <>
            <TrophyOutlined style={{ marginRight: 8 }} />
            已完成比赛
          </>
        }
        open={completedCompetitionsModalVisible}
        onCancel={() => setCompletedCompetitionsModalVisible(false)}
        footer={null}
        width={isMobile ? "95%" : 1000}
        zIndex={completedModalZIndex}
        styles={{
          mask: { backdropFilter: "blur(8px)" },
        }}
      >
        <Spin spinning={completedLoading}>
          {isMobile ? (
            completedCompetitions.length > 0 ? (
              renderCompetitionCards(
                completedCompetitions,
                handleViewCompetitionDetail,
              )
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#999",
                }}
              >
                暂无已完成的比赛
              </div>
            )
          ) : (
            <Table
              columns={completedCompetitionColumns}
              dataSource={completedCompetitions}
              rowKey="id"
              tableLayout="auto"
              pagination={{ pageSize: 8 }}
              locale={{ emptyText: "暂无已完成的比赛" }}
            />
          )}
        </Spin>
      </Modal>

      {/* 待完成比赛模态框 */}
      <Modal
        title={
          <>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            待完成比赛
          </>
        }
        open={pendingCompetitionsModalVisible}
        onCancel={() => setPendingCompetitionsModalVisible(false)}
        footer={null}
        width={isMobile ? "95%" : 1000}
        zIndex={pendingModalZIndex}
        styles={{
          mask: { backdropFilter: "blur(8px)" },
        }}
      >
        <Spin spinning={pendingLoading}>
          {isMobile ? (
            pendingCompetitions.length > 0 ? (
              renderCompetitionCards(
                pendingCompetitions,
                handleViewCompetitionDetail,
              )
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#999",
                }}
              >
                暂无待完成的比赛
              </div>
            )
          ) : (
            <Table
              columns={pendingCompetitionColumns}
              dataSource={pendingCompetitions}
              rowKey="id"
              tableLayout="auto"
              pagination={{ pageSize: 8 }}
              locale={{ emptyText: "暂无待完成的比赛" }}
            />
          )}
        </Spin>
      </Modal>

      {/* 学生成绩模态框 */}
      {studentModals.map((modal) => (
        <Modal
          key={modal.id}
          title={
            <>
              <UserOutlined style={{ marginRight: 8 }} />
              {modal.studentName} - 个人成绩
            </>
          }
          open={modal.open}
          onCancel={() => closeStudentModal(modal.id)}
          footer={null}
          width={isMobile ? "95%" : 800}
          zIndex={modal.zIndex}
          styles={{
            mask: { backdropFilter: "blur(8px)" },
          }}
        >
          <Spin spinning={modal.loading}>
            {isMobile ? (
              modal.scores.length > 0 ? (
                renderStudentScoreCards(modal.scores, modal.competitionUnits)
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: "#999",
                  }}
                >
                  该学生暂无成绩数据
                </div>
              )
            ) : (
              <Table
                columns={getStudentScoresColumns(
                  modal.competitionUnits,
                  modal.pointsDetails,
                )}
                dataSource={modal.scores}
                rowKey="id"
                tableLayout="auto"
                pagination={false}
                size="middle"
                locale={{ emptyText: "该学生暂无成绩数据" }}
              />
            )}
          </Spin>
        </Modal>
      ))}

      {/* 班级得分明细模态框 */}
      {classPointsModals.map((modal) => (
        <Modal
          key={modal.id}
          title={
            <>
              <TeamOutlined style={{ marginRight: 8 }} />
              {modal.className} - 得分明细
            </>
          }
          open={modal.open}
          onCancel={() => closeClassPointsModal(modal.id)}
          footer={null}
          width={isMobile ? "95%" : 800}
          zIndex={modal.zIndex}
          styles={{
            mask: { backdropFilter: "blur(8px)" },
          }}
          destroyOnClose
          afterClose={() => {
            setClassPointsModals((prev) =>
              prev.filter((m) => m.id !== modal.id),
            );
          }}
        >
          <Spin spinning={modal.loading}>
            {!modal.loading &&
            (!modal.pointsDetails || modal.pointsDetails.length === 0) ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#999",
                }}
              >
                该班级暂无得分数据
              </div>
            ) : (
              <Table
                columns={[
                  {
                    title: "比赛项目",
                    dataIndex: "competition_name",
                    key: "competition_name",
                  },
                  {
                    title: "得分类型",
                    dataIndex: "point_type",
                    key: "point_type",
                    render: (type: string) =>
                      type === "ranking" ? (
                        <Tag color="blue">排名得分</Tag>
                      ) : (
                        <Tag color="green">自定义得分</Tag>
                      ),
                  },
                  {
                    title: "排名",
                    dataIndex: "ranking",
                    key: "ranking",
                    render: (ranking: number | undefined) =>
                      ranking ? `第${ranking}名` : "-",
                  },
                  {
                    title: "得分",
                    dataIndex: "points",
                    key: "points",
                    render: (points: number) => (
                      <span
                        style={{
                          fontWeight: "bold",
                          fontSize: 16,
                          color: "#ff4d4f",
                        }}
                      >
                        {points.toFixed(1)}
                      </span>
                    ),
                  },
                  {
                    title: "说明",
                    dataIndex: "reason",
                    key: "reason",
                    render: (reason: string) => reason || "-",
                  },
                  {
                    title: "时间",
                    dataIndex: "created_at",
                    key: "created_at",
                    render: (date: string) =>
                      new Date(date).toLocaleString("zh-CN"),
                  },
                ]}
                dataSource={modal.pointsDetails}
                rowKey="id"
                pagination={false}
                size="middle"
                locale={{ emptyText: "该班级暂无得分数据" }}
              />
            )}
          </Spin>
        </Modal>
      ))}

      {/* 比赛详情模态框 */}
      {detailModals.map((modal) => (
        <Modal
          key={modal.id}
          title={
            <>
              <TrophyOutlined style={{ marginRight: 8 }} />
              {modal.competition.name} - 比赛详情
            </>
          }
          open={modal.open}
          onCancel={() => closeDetailModal(modal.id)}
          footer={
            modal.competition.status === "completed" ? (
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => replayAnimation(modal.competition)}
                >
                  重播动画
                </Button>
              </Space>
            ) : null
          }
          width={isMobile ? "95%" : 1000}
          zIndex={modal.zIndex}
          styles={{
            mask: { backdropFilter: "blur(8px)" },
          }}
        >
          <>
            {/* 比赛基本信息 */}
            <div
              style={{
                marginBottom: 16,
                padding: 16,
                background: "#f5f5f5",
                borderRadius: 8,
              }}
            >
              {/* 项目图片 */}
              {modal.competition.image_path && (
                <div style={{ marginBottom: 12, textAlign: "center" }}>
                  <Image
                    src={modal.competition.image_path}
                    alt={modal.competition.name}
                    width={120}
                    height={120}
                    style={{ borderRadius: 8, objectFit: "cover" }}
                  />
                </div>
              )}

              {/* 项目描述 */}
              {modal.competition.description && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>项目描述：</Text>
                  <div
                    style={{
                      marginTop: 4,
                      padding: 8,
                      background: "#fff",
                      borderRadius: 4,
                      border: "1px solid #d9d9d9",
                    }}
                  >
                    <Text>{modal.competition.description}</Text>
                  </div>
                </div>
              )}

              <Row gutter={16}>
                <Col span={isMobile ? 24 : 8}>
                  <Text strong>比赛类型：</Text>
                  {getCompetitionTypeTag(modal.competition.competition_type)}
                </Col>
                <Col span={isMobile ? 24 : 8}>
                  <Text strong>性别要求：</Text>
                  <Text>{getGenderText(modal.competition.gender)}</Text>
                </Col>
                {modal.competition.submitter_name && (
                  <Col span={isMobile ? 24 : 8}>
                    <Text strong>比赛推荐人：</Text>
                    <Text>{modal.competition.submitter_name}</Text>
                  </Col>
                )}
              </Row>
            </div>

            <Divider />

            {/* 根据比赛状态显示不同内容 */}
            {modal.competition.status === "completed" ? (
              <>
                {/* 成绩信息 */}
                <div style={{ marginBottom: 16 }}>
                  <Title level={5}>比赛成绩</Title>
                  <Row
                    gutter={16}
                    style={{ marginBottom: 12, fontSize: "14px" }}
                  >
                    <Col span={isMobile ? 24 : 12}>
                      <Text strong>成绩提交人：</Text>
                      {modal.competition.score_submitter_name || "未提交"}
                    </Col>
                    <Col span={isMobile ? 24 : 12}>
                      <Text strong>成绩审核人：</Text>
                      {modal.competition.score_reviewer_name || "未审核"}
                    </Col>
                    <Col span={isMobile ? 24 : 12}>
                      <Text strong>成绩提交时间：</Text>
                      {modal.competition.score_created_at
                        ? new Date(
                            modal.competition.score_created_at,
                          ).toLocaleString()
                        : "未提交"}
                    </Col>
                    <Col span={isMobile ? 24 : 12}>
                      <Text strong>成绩审核时间：</Text>
                      {modal.competition.score_reviewed_at
                        ? new Date(
                            modal.competition.score_reviewed_at,
                          ).toLocaleString()
                        : "未审核"}
                    </Col>
                  </Row>
                </div>
                <Spin spinning={modal.loading}>
                  {isMobile ? (
                    modal.scores.length > 0 ? (
                      renderScoreCards(modal.scores, modal.competition.unit)
                    ) : (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "40px 0",
                          color: "#999",
                        }}
                      >
                        暂无成绩数据
                      </div>
                    )
                  ) : (
                    <Table
                      columns={getScoresColumns(
                        modal.competition.unit,
                        modal.competition,
                      )}
                      dataSource={modal.scores}
                      rowKey="id"
                      tableLayout="auto"
                      pagination={false}
                      size="middle"
                      locale={{ emptyText: "暂无成绩数据" }}
                    />
                  )}
                </Spin>
              </>
            ) : (
              <>
                {/* 报名信息 */}
                <div style={{ marginBottom: 16 }}>
                  <Title level={5}>报名名单</Title>
                  <div
                    style={{
                      marginBottom: 12,
                      color: "#1677ff",
                      fontWeight: "bold",
                    }}
                  >
                    报名总数：{modal.registrations.length} 人
                  </div>
                </div>
                <Spin spinning={modal.loading}>
                  {isMobile ? (
                    modal.registrations.length > 0 ? (
                      renderRegistrationCards(modal.registrations)
                    ) : (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "40px 0",
                          color: "#999",
                        }}
                      >
                        该比赛暂无报名数据
                      </div>
                    )
                  ) : (
                    <Table
                      columns={registrationsColumns}
                      dataSource={modal.registrations}
                      rowKey="id"
                      tableLayout="auto"
                      pagination={false}
                      size="middle"
                      locale={{ emptyText: "该比赛暂无报名数据" }}
                    />
                  )}
                </Spin>
              </>
            )}
          </>
        </Modal>
      ))}
    </Layout>
  );
};

export default PublicScoreboard;
