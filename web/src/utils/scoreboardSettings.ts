import type { Competition, Score } from "../types";
import type { BackgroundEffectsPreference } from "./performance";

export type ScoreAnnouncementScope = "podium" | "top8";

export interface ScoreAnnouncementSettings {
  enabled: boolean;
  scope: ScoreAnnouncementScope;
  speechRate: number;
  voiceURI?: string;
}

export interface ScoreboardSettings {
  backgroundEffectsPreference: BackgroundEffectsPreference;
  autoOpenResultModal: boolean;
  scoreAnnouncement: ScoreAnnouncementSettings;
}

const STORAGE_KEY = "public_scoreboard_settings";

export const defaultScoreboardSettings: ScoreboardSettings = {
  backgroundEffectsPreference: "auto",
  autoOpenResultModal: true,
  scoreAnnouncement: {
    enabled: false,
    scope: "top8",
    speechRate: 1,
    voiceURI: undefined,
  },
};

const isValidBackgroundEffectsPreference = (
  value: unknown,
): value is BackgroundEffectsPreference => {
  return value === "auto" || value === "enabled" || value === "disabled";
};

const isValidAnnouncementScope = (
  value: unknown,
): value is ScoreAnnouncementScope => {
  return value === "podium" || value === "top8";
};

export function getScoreboardSettings(): ScoreboardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ScoreboardSettings>) : {};

    return {
      backgroundEffectsPreference: isValidBackgroundEffectsPreference(
        parsed.backgroundEffectsPreference,
      )
        ? parsed.backgroundEffectsPreference
        : defaultScoreboardSettings.backgroundEffectsPreference,
      autoOpenResultModal:
        typeof parsed.autoOpenResultModal === "boolean"
          ? parsed.autoOpenResultModal
          : defaultScoreboardSettings.autoOpenResultModal,
      scoreAnnouncement: {
        enabled:
          typeof parsed.scoreAnnouncement?.enabled === "boolean"
            ? parsed.scoreAnnouncement.enabled
            : defaultScoreboardSettings.scoreAnnouncement.enabled,
        scope: isValidAnnouncementScope(parsed.scoreAnnouncement?.scope)
          ? parsed.scoreAnnouncement.scope
          : defaultScoreboardSettings.scoreAnnouncement.scope,
        speechRate:
          typeof parsed.scoreAnnouncement?.speechRate === "number"
            ? parsed.scoreAnnouncement.speechRate
            : defaultScoreboardSettings.scoreAnnouncement.speechRate,
        voiceURI:
          typeof parsed.scoreAnnouncement?.voiceURI === "string"
            ? parsed.scoreAnnouncement.voiceURI
            : defaultScoreboardSettings.scoreAnnouncement.voiceURI,
      },
    };
  } catch (error) {
    console.warn("读取看板设置失败:", error);
    return defaultScoreboardSettings;
  }
}

export function saveScoreboardSettings(settings: ScoreboardSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("保存看板设置失败:", error);
  }
}

export function shouldAnnounceScore(
  settings: ScoreboardSettings,
  score: Score,
): boolean {
  if (!settings.scoreAnnouncement.enabled) {
    return false;
  }

  if (settings.scoreAnnouncement.scope === "top8") {
    return true;
  }

  return typeof score.ranking === "number" && score.ranking <= 3;
}

export function buildCompetitionAnnouncementIntro(
  competition: Competition,
): string {
  return competition.name;
}

const getRankingAnnouncementText = (ranking?: number): string => {
  if (ranking === 1) return "冠军";
  if (ranking === 2) return "亚军";
  if (ranking === 3) return "季军";
  if (typeof ranking === "number") return `第${ranking}名`;
  return "获奖选手";
};

const getContestantAnnouncementText = (score: Score): string => {
  const parts = [score.class_name, score.student_name].filter(Boolean);
  const uniqueParts = parts.filter(
    (part, index) => parts.indexOf(part) === index,
  );
  return uniqueParts.join("，");
};

export function buildScoreAnnouncementText(
  competition: Competition,
  score: Score,
): string {
  const contestantText = getContestantAnnouncementText(score);
  const unitText = competition.unit
    ? `${score.score}${competition.unit}`
    : `${score.score}`;

  return `${getRankingAnnouncementText(score.ranking)}，${contestantText}，成绩${unitText}。`;
}

export function buildAnimationOpeningAnnouncement(): string {
  return "成绩公布";
}

export function buildAnimationStepAnnouncement(
  competition: Competition,
  score: Score,
  stepInScore: number,
): string {
  if (stepInScore === 0) {
    return typeof score.ranking === "number" ? `第${score.ranking}名` : "";
  }

  if (stepInScore === 1) {
    return competition.unit
      ? `${score.score}${competition.unit}`
      : `${score.score}`;
  }

  if (stepInScore === 2) {
    return score.class_name;
  }

  if (stepInScore === 3) {
    return score.student_name;
  }

  return "";
}
