import { useCallback, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, Select } from "antd";
import type { MenuProps } from "antd";
import { Bracket, BracketDetail } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { useWebsite } from "../../contexts/WebsiteContext";
import { MDI, MdiIcon } from "./mdi";
import { AboutDialog, GraphCommentDialog } from "./PublicDialogs";
import PublicSearchDialog, { ParticipantPick } from "./PublicSearchDialog";
import "./PublicTopBar.css";

/**
 * 公开页顶栏：移植 RM Schedule 的 Situation.vue / BracketPage.vue 顶栏
 * - 左侧：Vuetify filled 选择框（届次；对阵图页另有对阵表选择，对应 Season / Zone）
 * - 右侧：品牌（校徽 + 站点名，窄屏只留校徽）、搜索按钮、“更多”菜单
 */

export const SCHOOL_NAME = "上海市行知中学";

export interface PublicTopBarProps {
  brackets: Bracket[];
  // 当前页面：不传时有 currentBracketId 为对阵图页，否则为成绩看板
  page?: "home" | "bracket" | "schedule";
  // 对阵图页当前的对阵表
  currentBracketId?: number;
  currentDetail?: BracketDetail | null;
  // “分析队伍”：不可用时为 undefined
  analyzeLabel?: string;
  onAnalyze?: () => void;
  // 搜索框“选中”与“分析”
  onPickParticipant: (pick: ParticipantPick) => void;
  onAnalyzeParticipant: (detail: BracketDetail, participantId: number) => void;
  // 对阵图页的刷新
  onRefresh?: () => void;
  // 登录 / 进入系统：不传则跳转首页打开登录弹窗
  onLogin?: () => void;
  // 关于弹窗中的隐藏入口（连续点击校徽）；返回 true 表示已打开其他弹窗
  onSecretClick?: () => boolean;
  // 顶栏下方的附加行（对阵图信息等）
  children?: React.ReactNode;
}

type MenuKey = "analyze" | "comment" | "refresh" | "account" | "about";

export default function PublicTopBar({
  page: pageProp,
  brackets,
  currentBracketId,
  currentDetail,
  analyzeLabel,
  onAnalyze,
  onPickParticipant,
  onAnalyzeParticipant,
  onRefresh,
  onLogin,
  onSecretClick,
  children,
}: PublicTopBarProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin } = useAuth();
  const { name, event_name: eventName, loading } = useWebsite();
  const siteName = loading ? "" : name;
  const eventLabel = eventName?.trim() || "运动会";
  const eventFieldId = useId();
  const pageFieldId = useId();
  const [searchOpen, setSearchOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 对阵图、赛程为独立入口：对阵图页才有对阵表选择
  const page = pageProp ?? (currentBracketId != null ? "bracket" : "home");
  const onBracketPage = page === "bracket";
  const bracketOptions = useMemo(
    () => brackets.map((b) => ({ value: String(b.id), label: b.name })),
    [brackets],
  );

  const handleAccount = useCallback(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? "/admin" : "/student");
      return;
    }
    if (onLogin) onLogin();
    else navigate("/", { state: { openLogin: true } });
  }, [isAdmin, isAuthenticated, navigate, onLogin]);

  const accountLabel = isAuthenticated ? "进入系统" : "登录";
  const menuItems: MenuProps["items"] = [
    {
      key: "analyze",
      icon: <MdiIcon path={MDI.analytics} />,
      label: "分析队伍",
      title: analyzeLabel,
      disabled: !onAnalyze,
    },
    {
      key: "comment",
      icon: <MdiIcon path={MDI.commentText} />,
      label: "查看注释",
    },
    ...(onRefresh
      ? [
          {
            key: "refresh",
            icon: <MdiIcon path={MDI.refresh} />,
            label: "刷新数据",
          },
        ]
      : []),
    {
      key: "account",
      icon: <MdiIcon path={isAuthenticated ? MDI.account : MDI.login} />,
      label: accountLabel,
    },
    {
      key: "about",
      icon: <MdiIcon path={MDI.information} />,
      label: "关于软件",
    },
  ];

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    setMenuOpen(false);
    switch (key as MenuKey) {
      case "analyze":
        onAnalyze?.();
        break;
      case "comment":
        setCommentOpen(true);
        break;
      case "refresh":
        onRefresh?.();
        break;
      case "account":
        handleAccount();
        break;
      case "about":
        setAboutOpen(true);
        break;
    }
  };

  return (
    <header className="pt-bar">
      <div className="pt-row">
        <div className="pt-field pt-field--event">
          <span className="pt-field-label" id={eventFieldId}>
            届次
          </span>
          <Select
            variant="borderless"
            aria-labelledby={eventFieldId}
            value="current"
            options={[{ value: "current", label: eventLabel }]}
            suffixIcon={<MdiIcon path={MDI.menuDown} />}
            popupMatchSelectWidth={false}
            classNames={{ popup: { root: "pt-select-popup" } }}
          />
        </div>
        {onBracketPage && (
          <div className="pt-field pt-field--page">
            <span className="pt-field-label" id={pageFieldId}>
              对阵图
            </span>
            <Select
              variant="borderless"
              aria-labelledby={pageFieldId}
              value={String(currentBracketId)}
              onChange={(value: string) => navigate(`/brackets/${value}`)}
              options={bracketOptions}
              suffixIcon={<MdiIcon path={MDI.menuDown} />}
              popupMatchSelectWidth={false}
              classNames={{ popup: { root: "pt-select-popup" } }}
            />
          </div>
        )}

        <div className="pt-spacer" />

        <div className="pt-actions">
          {page !== "home" && (
            <button
              type="button"
              className="pt-entry-btn"
              onClick={() => navigate("/")}
              aria-label="返回成绩看板"
              title="成绩看板"
            >
              <MdiIcon path={MDI.dashboard} />
              <span className="pt-entry-text">成绩看板</span>
            </button>
          )}
          {page !== "schedule" && (
            <button
              type="button"
              className="pt-entry-btn"
              onClick={() => navigate("/schedule")}
              aria-label="赛程"
              title="赛程"
            >
              <MdiIcon path={MDI.calendar} />
              <span className="pt-entry-text">赛程</span>
            </button>
          )}
          {page !== "bracket" && brackets.length > 0 && (
            <button
              type="button"
              className="pt-entry-btn"
              onClick={() => navigate(`/brackets/${brackets[0].id}`)}
              aria-label="对阵图"
              title="对阵图"
            >
              <MdiIcon path={MDI.tournament} />
              <span className="pt-entry-text">对阵图</span>
            </button>
          )}
          <button
            type="button"
            className="pt-brand"
            onClick={() => setAboutOpen(true)}
            aria-label={`关于 ${siteName || "本系统"}`}
          >
            <span className="pt-brand-logo">
              <img src="/school-emblem.svg" alt="" />
            </span>
            {siteName && (
              <span className="pt-brand-text" aria-hidden="true">
                {siteName}
              </span>
            )}
          </button>
          <button
            type="button"
            className="pt-icon-btn"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索队伍"
            title="搜索队伍"
            aria-haspopup="dialog"
          >
            <MdiIcon path={MDI.magnify} />
          </button>
          <Dropdown
            menu={{ items: menuItems, onClick: onMenuClick }}
            trigger={["click"]}
            placement="bottomRight"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            rootClassName="pt-more-menu"
          >
            <button
              type="button"
              className={`pt-icon-btn pt-more-btn${menuOpen ? " is-open" : ""}`}
              aria-label="更多"
              title="更多"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MdiIcon path={MDI.more} />
            </button>
          </Dropdown>
        </div>
      </div>
      {children}

      <PublicSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        brackets={brackets}
        currentBracketId={currentBracketId}
        currentDetail={currentDetail}
        onPick={onPickParticipant}
        onAnalyze={onAnalyzeParticipant}
      />
      <GraphCommentDialog
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
      />
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        siteName={siteName || "运动会管理系统"}
        schoolName={SCHOOL_NAME}
        onEmblemClick={
          onSecretClick
            ? () => {
                if (onSecretClick()) setAboutOpen(false);
              }
            : undefined
        }
      />
    </header>
  );
}
