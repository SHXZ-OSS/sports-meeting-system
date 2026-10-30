import { theme, type ThemeConfig } from "antd";

/**
 * 全站视觉主题（参考 RM Schedule 的深色赛事风格）
 *
 * 颜色同时以 CSS 变量形式写入 :root（见 theme/global.css），
 * 组件内联样式请使用 var(--sm-*)，不要再硬编码浅色值。
 */
export const palette = {
  // 背景层级：页面 → 面板 → 抬升面板
  bg: "#0b1220",
  bgDeep: "#060a14",
  panel: "rgba(17, 26, 44, 0.78)",
  panelSolid: "#111a2c",
  panelRaised: "#18243b",
  panelHover: "#1f2d48",
  line: "rgba(148, 178, 214, 0.16)",
  lineStrong: "rgba(148, 178, 214, 0.32)",

  // 文字
  text: "#e8eef7",
  textSecondary: "#a3b1c6",
  textMuted: "#6f7f97",

  // 强调色：标题横幅的青蓝渐变与冠军金
  accent: "#21b8c9",
  accentDeep: "#137b8c",
  gold: "#f5a623",
  goldDeep: "#c77a12",

  // 红蓝方与胜负
  red: "#e5484d",
  blue: "#3e8bff",
  win: "#3ecf8e",
  lose: "#5b6678",
} as const;

// 标题展示字体（Noto Sans SC Black，OFL 授权，见 @fontsource/noto-sans-sc），仅用于标题与横幅
export const displayFont =
  "'Noto Sans SC', 'Source Han Sans CN', 'PingFang SC', 'Microsoft YaHei', sans-serif";

export const bodyFont =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const appTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: palette.accent,
    colorInfo: palette.blue,
    colorSuccess: palette.win,
    colorWarning: palette.gold,
    colorError: palette.red,
    colorBgBase: palette.bg,
    colorBgLayout: "transparent",
    colorBgContainer: palette.panelSolid,
    colorBgElevated: palette.panelRaised,
    colorBorder: palette.lineStrong,
    colorBorderSecondary: palette.line,
    colorText: palette.text,
    colorTextSecondary: palette.textSecondary,
    colorTextTertiary: palette.textMuted,
    colorTextHeading: palette.text,
    borderRadius: 6,
    fontFamily: bodyFont,
  },
  components: {
    Layout: {
      headerBg: "transparent",
      siderBg: "transparent",
      bodyBg: "transparent",
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemSelectedBg: "rgba(33, 184, 201, 0.16)",
      itemSelectedColor: palette.accent,
      itemHoverBg: palette.panelHover,
    },
    Card: {
      colorBgContainer: palette.panel,
      headerBg: "transparent",
    },
    Table: {
      colorBgContainer: "transparent",
      headerBg: "rgba(33, 184, 201, 0.10)",
      headerColor: palette.text,
      headerSplitColor: palette.line,
      rowHoverBg: palette.panelHover,
      borderColor: palette.line,
    },
    Modal: {
      contentBg: palette.panelSolid,
      headerBg: palette.panelSolid,
    },
    Drawer: {
      colorBgElevated: palette.panelSolid,
    },
    Descriptions: {
      labelColor: palette.textSecondary,
    },
    Alert: {
      marginXS: 16,
    },
    Button: {
      borderRadius: 4,
      controlHeight: 36,
      primaryShadow: "none",
    },
    Segmented: {
      itemSelectedBg: palette.accentDeep,
      trackBg: palette.panelSolid,
    },
    Tabs: {
      itemSelectedColor: palette.accent,
      inkBarColor: palette.accent,
    },
  },
};

// 打印/导出（成绩单、证书）始终使用浅色，避免深色背景被打印出来
export const printTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: { borderRadius: 8, fontFamily: bodyFont },
};
