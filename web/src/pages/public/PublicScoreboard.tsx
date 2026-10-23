import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout, message } from "antd";
import confetti from "canvas-confetti";
import FadeContent from "../../components/FadeContent";
import BlurText from "../../components/BlurText";
import LightRays from "../../components/LightRays";
import StadiumScene, { type StadiumShot } from "../../components/StadiumScene";
import PublicHomeBoard from "../../components/PublicHomeBoard";
import ScoreboardDialogs from "../../components/ScoreboardDialogs";
import LoginDialog from "../../components/LoginDialog";
import ScoreboardSettingsModal from "../../components/ScoreboardSettingsModal";
import type { ScoreboardVoiceOption } from "../../components/ScoreboardSettingsModal";
import { publicAPI } from "../../api/public";
import { Competition, PointDetail, Score, Registration } from "../../types";
import { handleResp, handleRespWithoutNotify } from "../../utils/handleResp";
import {
  getRankingColor,
  getScoreboardRankingColor,
  isClassScoredType,
} from "../../utils/competition";
import { useAuth } from "../../contexts/AuthContext";
import { useWebsite } from "../../contexts/WebsiteContext";
import { shouldEnableBackgroundEffects } from "../../utils/performance";
import {
  buildAnimationStepAnnouncement,
  buildCompetitionAnnouncementIntro,
  getScoreboardSettings,
  saveScoreboardSettings,
  shouldAnnounceScore,
} from "../../utils/scoreboardSettings";
import type { ScoreboardSettings } from "../../utils/scoreboardSettings";
import "./PublicScoreboard.css";

interface SpeakTextOptions {
  onEnd?: () => void;
  onError?: () => void;
}

const AUTH_CALLBACK_PARAMS = [
  "dingtalk_token",
  "dingtalk_user",
  "dingtalk_error",
  "oidc_token",
  "oidc_user",
  "oidc_error",
] as const;

const hasAuthCallback = (search: string) => {
  const params = new URLSearchParams(search);
  return AUTH_CALLBACK_PARAMS.some((key) => params.has(key));
};

// 成绩总览停留时长（秒），与 demo 的成绩公布层一致。
const OVERVIEW_SECONDS = 10;
// 总览最多展示前 8 名，保证一屏可读。
const OVERVIEW_MAX_ROWS = 8;

type AnimationPhase = "reveal" | "overview" | "closing";

const PublicScoreboard: React.FC = () => {
  // 背景特效控制
  const [enableBackgroundEffects, setEnableBackgroundEffects] = useState(false);
  const [backgroundEffectsReady, setBackgroundEffectsReady] = useState(false);
  const [stadiumTooSlow, setStadiumTooSlow] = useState(false);
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
  // 实际是否启用 3D：检测通过且运行时没有被判定为过慢。
  const backgroundEffectsActive = enableBackgroundEffects && !stadiumTooSlow;

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

    const applyResult = (shouldEnable: boolean) => {
      if (cancelled) return;
      setEnableBackgroundEffects(shouldEnable);
      setBackgroundEffectsReady(true);
    };

    shouldEnableBackgroundEffects(
      scoreboardSettings.backgroundEffectsPreference,
    )
      .then(applyResult)
      .catch(() => applyResult(false));

    return () => {
      cancelled = true;
    };
  }, [scoreboardSettings.backgroundEffectsPreference]);

  // 切换设置时允许重新尝试，避免运行时降级永久锁死。
  useEffect(() => {
    setStadiumTooSlow(false);
  }, [scoreboardSettings.backgroundEffectsPreference]);

  const handleStadiumPerformanceIssue = useCallback(() => {
    // “总是开启”是显式覆盖，不自动降级。
    if (scoreboardSettings.backgroundEffectsPreference === "enabled") return;
    console.warn("体育场背景动画持续掉帧，已自动降级。");
    setStadiumTooSlow(true);
  }, [scoreboardSettings.backgroundEffectsPreference]);

  const handleStadiumUnavailable = useCallback(() => {
    console.warn("WebGL 不可用，已降级为无 3D 看板。");
    setEnableBackgroundEffects(false);
  }, []);

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

  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAdmin } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(
    () =>
      Boolean((location.state as { openLogin?: boolean } | null)?.openLogin) ||
      hasAuthCallback(location.search),
  );

  useEffect(() => {
    const state = location.state as { openLogin?: boolean } | null;
    if (state?.openLogin || hasAuthCallback(location.search)) {
      setLoginModalOpen(true);
      if (state?.openLogin) {
        navigate(
          { pathname: location.pathname, search: location.search },
          { replace: true, state: null },
        );
      }
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const closeLoginModal = useCallback(() => {
    setLoginModalOpen(false);
    if (location.search || location.state) {
      navigate("/", { replace: true });
    }
  }, [location.search, location.state, navigate]);

  // 已登录时首页按钮直接进入对应后台，不再重复弹出登录框。
  const handleAccountClick = useCallback(() => {
    if (!isAuthenticated) {
      setLoginModalOpen(true);
      return;
    }
    navigate(isAdmin ? "/admin" : "/student");
  }, [isAdmin, isAuthenticated, navigate]);

  const [lastNotifiedCompetitionId, setLastNotifiedCompetitionId] = useState<
    number | null
  >(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationPhase, setAnimationPhase] =
    useState<AnimationPhase>("reveal");
  const [overviewScores, setOverviewScores] = useState<Score[]>([]);
  const [overviewRemaining, setOverviewRemaining] = useState(OVERVIEW_SECONDS);
  const [overviewStopped, setOverviewStopped] = useState(false);
  const endAnimationRef = useRef<() => void>(() => {});
  const [animationQueue, setAnimationQueue] = useState<Score[]>([]);
  const [animatingCompetition, setAnimatingCompetition] =
    useState<Competition | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [isManualReplay, setIsManualReplay] = useState(false); // 标记是否是手动重播

  // 当前运动会届次名称
  const { event_name: eventName } = useWebsite();

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
      pointDetails: PointDetail[]; // 完整得分明细（含类型、说明、时间）
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
        // 如果返回403错误，说明看板功能已关闭，打开登录框
        if (code === 403) {
          setLoginModalOpen(true);
        }
      },
    );
  }, [cleanExpiredPlayedCompetitions, processLatestResult]);

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
  const fetchPendingCompetitions = useCallback(async (silent = false) => {
    if (!silent) setPendingLoading(true);
    const data = await publicAPI.getCompetitions({
      status: "approved,checking_in,in_progress,pending_score_review",
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
  }, []);

  // 首页赛场动态启动时就需要待完成比赛列表，并定时刷新
  useEffect(() => {
    void fetchPendingCompetitions();
    const timer = window.setInterval(() => {
      void fetchPendingCompetitions(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchPendingCompetitions]);

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
      pointDetails: PointDetail[];
    } = {
      scores: [],
      units: {},
      points: {},
      pointDetails: [],
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
      (pointsData: PointDetail[]) => {
        if (pointsData) {
          result.pointDetails = pointsData;
          const pointsMap: Record<number, number> = {};
          pointsData.forEach((detail) => {
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
    // 等性能检测结束再决定走 3D 还是静态降级，避免中途切换。
    if (!backgroundEffectsReady) return;
    if (!isProcessingAnimation && animationTaskQueue.length > 0) {
      const nextTask = animationTaskQueue[0];
      setIsProcessingAnimation(true);
      setAnimatingCompetition(nextTask.competition);
      announcementMarkerRef.current = null;
      // 真正动画只展示前三名
      setAnimationQueue(nextTask.scores.slice(0, 3));
      setOverviewScores(nextTask.scores);
      setAnimationPhase("reveal");
      setOverviewRemaining(OVERVIEW_SECONDS);
      setOverviewStopped(false);
      setShowAnimation(true);
      setCurrentIndex(0);
      setIsManualReplay(false); // 自动播放，不是手动重播

      // 在开始处理动画时就设置lastNotifiedCompetitionId，防止重复添加
      setLastNotifiedCompetitionId(nextTask.competition.id);
      // 从队列中移除当前任务
      setAnimationTaskQueue((prev) => prev.slice(1));
    }
  }, [animationTaskQueue, isProcessingAnimation, backgroundEffectsReady]);

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
    setAnimationPhase("reveal");
    setOverviewStopped(false);
    setOverviewRemaining(OVERVIEW_SECONDS);
    // 只有在非手动重播且设置允许时才打开模态框
    if (!isManualReplay && scoreboardSettings.openResultDetailAfterOverview) {
      handleViewScores(animatingCompetition);
    }
    setCurrentIndex(0);
    setAnimatingCompetition(null);
  };

  useEffect(() => {
    endAnimationRef.current = endAnimation;
  });

  const closeOverview = useCallback(() => {
    if (animationPhase !== "overview") return;
    stopAnnouncement();
    setAnimationPhase("closing");
  }, [animationPhase, stopAnnouncement]);

  // 总览自动倒计时；暂停时保持当前画面。
  useEffect(() => {
    if (animationPhase !== "overview" || overviewStopped) return;
    if (overviewRemaining <= 0) {
      closeOverview();
      return;
    }
    const timer = window.setTimeout(
      () => setOverviewRemaining((remaining) => remaining - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [animationPhase, overviewStopped, overviewRemaining, closeOverview]);

  // 收尾：总览淡出、镜头回环绕，随后把画面交回看板。
  useEffect(() => {
    if (animationPhase !== "closing") return;
    const timer = window.setTimeout(() => endAnimationRef.current(), 900);
    return () => window.clearTimeout(timer);
  }, [animationPhase]);

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
        setAnimationQueue(scores.slice(0, 3)); // 真正动画只展示前三名
        setOverviewScores(scores);
        setAnimationPhase("reveal");
        setOverviewRemaining(OVERVIEW_SECONDS);
        setOverviewStopped(false);
        setShowAnimation(true);
        setCurrentIndex(0);
        setIsProcessingAnimation(true); // 标记为正在处理动画
        setIsManualReplay(true); // 标记为手动重播
      });
    });
  };

  // 长按开始：跳过逐条揭晓，直接进入成绩总览。
  const handleLongPressStart = () => {
    if (animationPhase !== "reveal") return;
    const timer = setTimeout(() => {
      setAnimationPhase("overview");
    }, 800);
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

  // 从学生成绩里的项目名继续下钻到比赛详情
  const handleViewCompetitionById = async (competitionId: number) => {
    const response = await publicAPI.getCompetition(competitionId);
    handleRespWithoutNotify(response, (data) => {
      if (data) void handleViewCompetitionDetail(data);
    });
  };

  // 通知链接携带 ?id= 时，进入看板后自动打开对应比赛详情
  const notificationCompetitionId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("id");
    if (!raw) {
      return null;
    }
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [location.search]);
  const autoOpenedCompetitionIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (notificationCompetitionId === null) {
      return;
    }
    if (autoOpenedCompetitionIdRef.current === notificationCompetitionId) {
      return;
    }
    autoOpenedCompetitionIdRef.current = notificationCompetitionId;
    void handleViewCompetitionById(notificationCompetitionId);
  }, [notificationCompetitionId, handleViewCompetitionById]);

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
      pointDetails: [],
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
              pointDetails: result.pointDetails,
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

  // 成绩动画：镜头推向主席台，结果表快速展开；开启播报时按名次依次播报。
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animationRevealed, setAnimationRevealed] = useState(false);
  const [lightRaysColor, setLightRaysColor] = useState("#FFD700");
  const isClassCompetition = isClassScoredType(
    animatingCompetition?.competition_type,
  );
  const stepsPerScore = isClassCompetition ? 3 : 4;
  const overviewRows = [...overviewScores]
    .sort(
      (left, right) =>
        (left.ranking ?? Number.MAX_SAFE_INTEGER) -
        (right.ranking ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, OVERVIEW_MAX_ROWS);
  // 逐条揭晓停在主席台；成绩总览时拉到全场，收尾再回到环绕。
  const stadiumShot: StadiumShot =
    showAnimation && animationPhase === "reveal"
      ? "podium"
      : showAnimation && animationPhase === "overview"
        ? "overview"
        : "ambient";

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

  // 逐条揭晓时看板与弹层淡出；进入总览收尾后再淡回，弹层只隐藏、不关闭。
  useEffect(() => {
    if (showAnimation && animationPhase !== "closing") {
      document.body.classList.add("score-animation-active");
    } else {
      document.body.classList.remove("score-animation-active");
    }
    return () => document.body.classList.remove("score-animation-active");
  }, [showAnimation, animationPhase]);

  // 有体育场时等镜头到位并淡到纯黑；没有体育场时立即开始逐条揭晓。
  useEffect(() => {
    if (!showAnimation) {
      setAnimationRevealed(false);
      return;
    }
    const timer = setTimeout(
      () => setAnimationRevealed(true),
      backgroundEffectsActive ? 4400 : 0,
    );
    return () => clearTimeout(timer);
  }, [showAnimation, backgroundEffectsActive]);

  // 逐条展示：比赛名 → 每位选手的 名次 / 成绩 / 班级 / 姓名。
  useEffect(() => {
    if (
      !showAnimation ||
      !animatingCompetition ||
      !animationRevealed ||
      animationPhase !== "reveal"
    ) {
      return;
    }

    if (currentIndex === 0) {
      if (scoreboardSettings.scoreAnnouncement.enabled) {
        const key = `${animatingCompetition.id}-intro`;
        if (announcementMarkerRef.current !== key) {
          announcementMarkerRef.current = key;
          speakText(buildCompetitionAnnouncementIntro(animatingCompetition));
        }
      }
      setLightRaysColor(getRankingColor(animationQueue[0]?.ranking || 0));
      const timer = setTimeout(() => setCurrentIndex(1), 1400);
      return () => clearTimeout(timer);
    }

    const scoreIndex = Math.floor((currentIndex - 1) / stepsPerScore);
    const stepInScore = (currentIndex - 1) % stepsPerScore;

    if (scoreIndex >= animationQueue.length) {
      setAnimationPhase("overview");
      setOverviewRemaining(OVERVIEW_SECONDS);
      setOverviewStopped(false);
      return;
    }

    const score = animationQueue[scoreIndex];
    setLightRaysColor(getRankingColor(score.ranking || 0));

    if (shouldAnnounceScore(scoreboardSettings, score)) {
      const key = `${animatingCompetition.id}-${score.id}-${stepInScore}`;
      if (announcementMarkerRef.current !== key) {
        announcementMarkerRef.current = key;
        speakText(
          buildAnimationStepAnnouncement(
            animatingCompetition,
            score,
            stepInScore,
          ),
        );
      }
    }

    if (stepInScore === stepsPerScore - 1) {
      playEffect();
      const ranking = score.ranking;
      if (ranking === 1) {
        confetti({
          particleCount: 240,
          ticks: 100,
          spread: 80,
          origin: { y: 0.74, x: 0.5 },
          colors: ["#FFD700", "#FFFACD", "#FFA500"],
          zIndex: 1999,
        });
      } else if (ranking === 2) {
        confetti({
          particleCount: 170,
          ticks: 100,
          spread: 70,
          origin: { y: 0.74, x: 0.5 },
          colors: ["#C0C0C0", "#DCDCDC", "#A9A9A9"],
          zIndex: 1999,
        });
      } else if (ranking === 3) {
        confetti({
          particleCount: 120,
          ticks: 100,
          spread: 60,
          origin: { y: 0.74, x: 0.5 },
          colors: ["#CD7F32", "#8B4513", "#A0522D"],
          zIndex: 1999,
        });
      } else {
        confetti({
          particleCount: 70,
          ticks: 100,
          spread: 45,
          origin: { y: 0.74, x: 0.5 },
          colors: ["#1677ff", "#52c41a", "#faad14"],
          zIndex: 1999,
        });
      }
    }

    const hold = stepInScore === stepsPerScore - 1 ? 2600 : 1100;
    const timer = setTimeout(() => setCurrentIndex(currentIndex + 1), hold);
    return () => clearTimeout(timer);
  }, [
    currentIndex,
    showAnimation,
    animationQueue,
    animatingCompetition,
    animationRevealed,
    animationPhase,
    stepsPerScore,
  ]);

  useEffect(() => {
    if (!showAnimation) {
      announcementMarkerRef.current = null;
      stopAnnouncement();
    }
  }, [showAnimation, stopAnnouncement]);

  return (
    <Layout
      className="public-scoreboard"
      style={{
        minHeight: "100vh",
        background: "#f7fbff",
        overflow: "hidden",
      }}
    >
      {/* 背景动画：沿跑道环绕的体育场场景 */}
      {backgroundEffectsActive && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
          }}
        >
          <StadiumScene
            key={scoreboardSettings.backgroundEffectsPreference}
            eventName={eventName}
            shot={stadiumShot}
            onPerformanceIssue={handleStadiumPerformanceIssue}
            onUnavailable={handleStadiumUnavailable}
          />
        </div>
      )}

      {/* 首页三栏看板 */}
      <PublicHomeBoard
        eventName={eventName}
        topClasses={stats.topClasses}
        topStudents={stats.topStudents}
        completedCount={stats.completedCount}
        pendingCount={stats.pendingCount}
        pendingCompetitions={pendingCompetitions}
        pendingLoading={pendingLoading}
        onViewClass={handleViewClassPoints}
        onViewStudent={handleViewStudentScores}
        onViewCompetition={handleViewCompetitionDetail}
        onOpenCompleted={handleViewCompletedCompetitions}
        onOpenPending={handleViewPendingCompetitions}
        onTitleClick={handleTitleClick}
        isLoggedIn={isAuthenticated}
        onAccountClick={handleAccountClick}
      />

      <ScoreboardSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={scoreboardSettings}
        onChange={setScoreboardSettings}
        speechSupported={speechSupported}
        voiceOptions={voiceOptions}
        onPreviewAnnouncement={previewAnnouncement}
      />

      {/* 成绩动画 */}
      {showAnimation && animatingCompetition && (
        <div
          className={`score-animation${
            animationPhase !== "reveal" ? " is-overview" : ""
          }${animationPhase === "closing" ? " is-closing" : ""}${
            backgroundEffectsActive ? "" : " is-static"
          }`}
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
        >
          <div className="score-animation__blackout" aria-hidden="true" />
          {backgroundEffectsActive && (
            <div className="score-animation__rays" aria-hidden="true">
              <LightRays
                raysOrigin="top-center"
                raysColor={lightRaysColor}
                lightSpread={2.6}
                rayLength={3.6}
                saturation={1.5}
                followMouse={false}
                mouseInfluence={0.1}
                fadeDistance={1.5}
                noiseAmount={0.1}
              />
            </div>
          )}
          <FadeContent
            blur
            duration={900}
            easing="ease-out"
            delay={backgroundEffectsActive ? 4400 : 0}
            initialOpacity={0}
            className="score-animation__fade"
          >
            <div className="score-reveal">
              <div className="score-reveal__title">
                <BlurText
                  text={animatingCompetition.name}
                  delay={70}
                  animateBy="words"
                  direction="top"
                />
              </div>
              <div className="score-card">
                {(() => {
                  const rawIndex =
                    currentIndex === 0
                      ? 0
                      : Math.floor((currentIndex - 1) / stepsPerScore);
                  const isOverflow = rawIndex >= animationQueue.length;
                  const scoreIndex = Math.min(
                    rawIndex,
                    Math.max(0, animationQueue.length - 1),
                  );
                  const stepInScore = isOverflow
                    ? stepsPerScore - 1
                    : currentIndex === 0
                      ? -1
                      : (currentIndex - 1) % stepsPerScore;
                  const score = animationQueue[scoreIndex];
                  const rankColor = getRankingColor(score?.ranking || 0);
                  const isTeam =
                    animatingCompetition.competition_type === "team";
                  const isClassBased = isClassScoredType(
                    animatingCompetition.competition_type,
                  );
                  return (
                    <>
                      <div className="score-card__row score-card__row--primary">
                        <div className="score-card__field">
                          <span className="score-card__label">名次</span>
                          <div
                            className="score-card__value score-card__value--rank"
                            style={{ color: rankColor }}
                          >
                            {score && stepInScore >= 0 && (
                              <BlurText
                                key={`${score.id}-rank`}
                                text={`第 ${score.ranking ?? "—"} 名`}
                                delay={45}
                                animateBy="words"
                                direction="top"
                              />
                            )}
                          </div>
                        </div>
                        <div className="score-card__field score-card__field--right">
                          <span className="score-card__label">成绩</span>
                          <div className="score-card__value score-card__value--result">
                            {score && stepInScore >= 1 && (
                              <BlurText
                                key={`${score.id}-result`}
                                text={`${score.score} ${animatingCompetition.unit}`}
                                delay={45}
                                animateBy="letters"
                                direction="top"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`score-card__row score-card__row--secondary${
                          isClassBased ? " score-card__row--single" : ""
                        }`}
                      >
                        <div className="score-card__field">
                          <span className="score-card__label">
                            {isTeam ? "队伍" : "班级"}
                          </span>
                          <div className="score-card__value score-card__value--meta">
                            {score && stepInScore >= 2 && (
                              <BlurText
                                key={`${score.id}-class`}
                                text={score.class_name}
                                delay={45}
                                animateBy="words"
                                direction="top"
                              />
                            )}
                          </div>
                        </div>
                        {!isClassBased && (
                          <div className="score-card__field score-card__field--right">
                            <span className="score-card__label">姓名</span>
                            <div className="score-card__value score-card__value--meta">
                              {score && stepInScore >= 3 && (
                                <BlurText
                                  key={`${score.id}-name`}
                                  text={score.student_name}
                                  delay={45}
                                  animateBy="words"
                                  direction="top"
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </FadeContent>
          <div className="score-animation__hint">长按屏幕跳过动画</div>

          {animationPhase !== "reveal" && (
            <div className="score-overview" role="dialog" aria-label="成绩公布">
              <div className="score-overview__veil" aria-hidden="true" />
              <div className="score-overview__content">
                <div className="score-overview__kicker">
                  <span />
                  成绩公布
                  <span />
                </div>
                <h2>{animatingCompetition.name}</h2>

                <div
                  className="score-overview__table"
                  role="list"
                  aria-label={`${animatingCompetition.name}比赛成绩`}
                >
                  {overviewRows.map((score, index) => {
                    const color =
                      getScoreboardRankingColor(score.ranking) ?? "#7186a0";
                    return (
                      <div
                        className="score-overview__row"
                        role="listitem"
                        key={score.id}
                        style={{ "--row-index": index } as CSSProperties}
                      >
                        <span
                          className="score-overview__rank"
                          style={{ color }}
                        >
                          {score.ranking ?? "—"}
                        </span>
                        <div className="score-overview__who">
                          <div className="score-overview__name">
                            <strong>
                              {isClassCompetition
                                ? score.class_name || "—"
                                : score.student_name || "—"}
                            </strong>
                            {!isClassCompetition && score.class_name && (
                              <small>{score.class_name}</small>
                            )}
                          </div>
                        </div>
                        <span className="score-overview__result">
                          {score.score}
                          <span className="score-overview__unit">
                            {animatingCompetition.unit}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <footer className="score-overview__footer">
                  <span>
                    {overviewStopped
                      ? "已停止自动返回"
                      : `${overviewRemaining} 秒后自动返回主页`}
                  </span>
                  <div>
                    {!overviewStopped && (
                      <button
                        type="button"
                        onClick={() => {
                          stopAnnouncement();
                          setOverviewStopped(true);
                        }}
                      >
                        停止
                      </button>
                    )}
                    <button type="button" onClick={closeOverview}>
                      返回主页 <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </footer>
                <div
                  className={`score-overview__timer${
                    overviewStopped ? " is-stopped" : ""
                  }`}
                  aria-hidden="true"
                  style={{
                    transform: `scaleX(${overviewRemaining / OVERVIEW_SECONDS})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 看板弹层：demo 设计语言 */}
      <ScoreboardDialogs
        completedOpen={completedCompetitionsModalVisible}
        completedLoading={completedLoading}
        completedCompetitions={completedCompetitions}
        completedZIndex={completedModalZIndex}
        onCloseCompleted={() => setCompletedCompetitionsModalVisible(false)}
        pendingOpen={pendingCompetitionsModalVisible}
        pendingLoading={pendingLoading}
        pendingCompetitions={pendingCompetitions}
        pendingZIndex={pendingModalZIndex}
        onClosePending={() => setPendingCompetitionsModalVisible(false)}
        studentModals={studentModals}
        onCloseStudent={closeStudentModal}
        classPointsModals={classPointsModals}
        onCloseClassPoints={closeClassPointsModal}
        detailModals={detailModals}
        onCloseDetail={closeDetailModal}
        onSelectCompetition={handleViewCompetitionDetail}
        onViewCompetitionById={handleViewCompetitionById}
        onViewStudent={handleViewStudentScores}
        onReplay={replayAnimation}
      />

      <LoginDialog open={loginModalOpen} onClose={closeLoginModal} />
    </Layout>
  );
};

export default PublicScoreboard;
