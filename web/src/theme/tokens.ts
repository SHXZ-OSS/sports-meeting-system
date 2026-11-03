import { theme, type ThemeConfig } from "antd";

/**
 * 全站视觉主题：照搬 RM Schedule（rm-schedule-ui，Vuetify 深色主题）
 *
 * 颜色同时以 CSS 变量形式写入 :root（见 theme/global.css），
 * 组件内联样式请使用 var(--sm-*)，不要再硬编码颜色值。
 */
export const palette = {
  // RM Schedule 画布色；页面背景为半透明赛场图叠在画布上
  bg: "#061321",
  panel: "rgba(7, 18, 36, 0.9)",
  panelSolid: "#0a1a2e",
  panelRaised: "rgba(255, 255, 255, 0.08)",
  panelHover: "rgba(255, 255, 255, 0.12)",
  line: "rgba(255, 255, 255, 0.12)",
  lineStrong: "rgba(255, 255, 255, 0.24)",

  text: "#ffffff",
  textSecondary: "rgba(220, 232, 246, 0.72)",
  textMuted: "#9d9f9f",

  // Vuetify 深色主题 primary / success / warning
  accent: "#2196f3",
  accentDeep: "#1565c0",
  gold: "#ffc857",
  red: "#f44336",
  blue: "#2196f3",
  win: "#4caf50",
  lose: "#616161",
} as const;

// RM Schedule 全站字体（汉仪雅酷黑，见 assets/rm/NOTICE）
export const displayFont = "'MyFont', sans-serif";
export const bodyFont = displayFont;

export const appTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: palette.accent,
    colorInfo: palette.blue,
    colorSuccess: palette.win,
    colorWarning: "#fb8c00",
    colorError: palette.red,
    colorBgBase: palette.bg,
    colorBgLayout: "transparent",
    colorBgContainer: palette.panel,
    colorBgElevated: palette.panelSolid,
    colorBorder: palette.lineStrong,
    colorBorderSecondary: palette.line,
    colorText: palette.text,
    colorTextSecondary: palette.textSecondary,
    colorTextTertiary: palette.textMuted,
    colorTextHeading: palette.text,
    borderRadius: 4,
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
      itemSelectedBg: "rgba(33, 150, 243, 0.2)",
      itemSelectedColor: "#ffffff",
      itemHoverBg: palette.panelHover,
    },
    Card: {
      colorBgContainer: palette.panel,
      headerBg: "transparent",
    },
    Table: {
      colorBgContainer: "transparent",
      headerBg: "rgba(255, 255, 255, 0.05)",
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
      itemSelectedBg: "rgba(120, 170, 255, 0.22)",
      trackBg: "rgba(8, 28, 72, 0.52)",
    },
    Tabs: {
      itemSelectedColor: "#ffffff",
      inkBarColor: palette.accent,
    },
  },
};
