import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  App as AntdApp,
  Button,
  Card,
  ConfigProvider,
  Space,
  Switch,
  Typography,
} from "antd";
import { CloseOutlined, ToolOutlined } from "@ant-design/icons";
import {
  isReactScanActive,
  isVConsoleActive,
  toggleReactScan,
  toggleVConsole,
} from "../../utils/devSetup";

const { Text } = Typography;

const SwitchRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    <Text>{label}</Text>
    <Switch size="small" checked={checked} onChange={onChange} />
  </div>
);

const DevPanel = () => {
  const [open, setOpen] = useState(false);
  const [vcOn, setVcOn] = useState(isVConsoleActive());
  const [scanOn, setScanOn] = useState(isReactScanActive());

  if (!open) {
    return (
      <Button
        shape="circle"
        size="large"
        icon={<ToolOutlined />}
        aria-label="打开开发面板"
        title="开发面板"
        onClick={() => setOpen(true)}
        style={{ position: "fixed", left: 16, bottom: 16, zIndex: 99999 }}
      />
    );
  }

  return (
    <Card
      size="small"
      title="开发面板"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 99999,
        width: 280,
      }}
      extra={
        <Button
          size="small"
          type="text"
          icon={<CloseOutlined />}
          aria-label="收起开发面板"
          onClick={() => setOpen(false)}
        />
      }
    >
      <Space direction="vertical" style={{ width: "100%" }} size={8}>
        <SwitchRow
          label="vConsole 调试台"
          checked={vcOn}
          onChange={(v) => {
            setVcOn(v);
            void toggleVConsole(v);
          }}
        />
        <SwitchRow
          label="react-scan 重渲染可视化"
          checked={scanOn}
          onChange={(v) => {
            setScanOn(v);
            void toggleReactScan(v);
          }}
        />
      </Space>
    </Card>
  );
};

/** 动态挂载入口：创建独立容器渲染 */
export default function mountDevPanel(): void {
  const container = document.createElement("div");
  container.id = "sports-meeting-dev-panel";
  document.body.appendChild(container);
  createRoot(container).render(
    <ConfigProvider theme={{ token: { borderRadius: 8 } }}>
      <AntdApp>
        <DevPanel />
      </AntdApp>
    </ConfigProvider>,
  );
}
