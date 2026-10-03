import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, theme, App as AntdApp } from "antd";
import {
  StyleProvider,
  legacyLogicalPropertiesTransformer,
  autoPrefixTransformer,
} from "@ant-design/cssinjs";
import zhCN from "antd/locale/zh_CN";
import { AuthProvider } from "./contexts/AuthContext";
import { WebsiteProvider } from "./contexts/WebsiteContext";
import AppRouter from "./router/AppRouter";
import "./App.css";

// 打印项目信息：D
console.log(
  "%c🏫 上海市行知中学运动会系统 %c  By Henry  %c  https://itshenryz.com/ ",
  "color: #fff; background: #4C80F8",
  "color: #fff; background: #3F3F3F",
  "",
);

console.log(
  "%c📞 Contact Me %c WeChat: itshenryz %c QQ: 2671230065 %c Email: zhr0305@outlook.com",
  "color: #fff; background: #4C80F8",
  "color: #fff; background: #3F3F3F",
  "color: #fff; background: #3F3F3F",
  "color: #fff; background: #3F3F3F",
);

console.log(
  "%c💻 GitHub %c https://github.com/itsHenry35/sports-meeting-system",
  "color: #fff; background: #4C80F8",
  "",
);

const App: React.FC = () => {
  return (
    // hashPriority="high" 降低 antd 样式优先级，便于全局 CSS 覆盖；
    // transformers 将逻辑属性/标准属性转换为旧浏览器兼容写法
    <StyleProvider
      hashPriority="high"
      transformers={[legacyLogicalPropertiesTransformer, autoPrefixTransformer]}
    >
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            borderRadius: 8,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            colorTextHeading: "#262626",
          },
          components: {
            Layout: {
              colorBgHeader: "#ffffff",
            },
            Card: {
              headerBg: "#fafafa",
            },
            Table: {
              headerBg: "#fafafa",
              headerColor: "#262626",
              headerSplitColor: "#f0f0f0",
              rowHoverBg: "#f5f5f5",
            },
            Form: {
              labelColor: "#262626",
            },
            Modal: {
              headerBg: "#fafafa",
            },
            Typography: {
              colorTextHeading: "#262626",
            },
            Empty: {
              colorTextDescription: "#999999",
            },
            Descriptions: {
              labelColor: "#595959",
            },
            Alert: {
              marginXS: 16,
            },
            Button: {
              borderRadius: 6,
              controlHeight: 36,
            },
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <WebsiteProvider>
              <AuthProvider>
                <AppRouter />
              </AuthProvider>
            </WebsiteProvider>
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  );
};

export default App;
