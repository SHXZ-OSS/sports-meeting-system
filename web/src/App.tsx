import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import {
  StyleProvider,
  legacyLogicalPropertiesTransformer,
  autoPrefixTransformer,
} from "@ant-design/cssinjs";
import zhCN from "antd/locale/zh_CN";
import { AuthProvider } from "./contexts/AuthContext";
import { WebsiteProvider } from "./contexts/WebsiteContext";
import AppRouter from "./router/AppRouter";
import { appTheme } from "./theme/tokens";
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
      <ConfigProvider locale={zhCN} theme={appTheme}>
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
