import {
  Alert,
  Button,
  Divider,
  Modal,
  Radio,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
} from "antd";
import type { BackgroundEffectsPreference } from "../utils/performance";
import type {
  ScoreAnnouncementScope,
  ScoreboardSettings,
} from "../utils/scoreboardSettings";

const { Paragraph, Text } = Typography;

export interface ScoreboardVoiceOption {
  label: string;
  value: string;
}

interface ScoreboardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: ScoreboardSettings;
  onChange: (next: ScoreboardSettings) => void;
  speechSupported: boolean;
  voiceOptions: ScoreboardVoiceOption[];
  onPreviewAnnouncement: () => void;
}

const ScoreboardSettingsModal: React.FC<ScoreboardSettingsModalProps> = ({
  open,
  onClose,
  settings,
  onChange,
  speechSupported,
  voiceOptions,
  onPreviewAnnouncement,
}) => {
  const updateBackgroundEffectsPreference = (
    backgroundEffectsPreference: BackgroundEffectsPreference,
  ) => {
    onChange({
      ...settings,
      backgroundEffectsPreference,
    });
  };

  const updateScoreAnnouncement = <
    K extends keyof ScoreboardSettings["scoreAnnouncement"],
  >(
    key: K,
    value: ScoreboardSettings["scoreAnnouncement"][K],
  ) => {
    onChange({
      ...settings,
      scoreAnnouncement: {
        ...settings.scoreAnnouncement,
        [key]: value,
      },
    });
  };

  const updateAutoOpenResultModal = (autoOpenResultModal: boolean) => {
    onChange({
      ...settings,
      autoOpenResultModal,
    });
  };

  return (
    <Modal
      title="看板设置"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      styles={{ body: { paddingTop: 8 } }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            背景动画
          </Text>
          <Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 12 }}
          >
            自动模式会根据设备性能决定是否开启；如果现场机器性能足够，也可以强制打开。
          </Paragraph>
          <Radio.Group
            value={settings.backgroundEffectsPreference}
            onChange={(event) =>
              updateBackgroundEffectsPreference(event.target.value)
            }
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="auto">自动</Radio.Button>
            <Radio.Button value="enabled">总是开启</Radio.Button>
            <Radio.Button value="disabled">关闭</Radio.Button>
          </Radio.Group>
        </div>

        <Divider style={{ margin: 0 }} />

        <div>
          <Space
            align="center"
            style={{
              width: "100%",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text strong style={{ fontSize: 16 }}>
              动画结束弹窗
            </Text>
            <Switch
              checked={settings.autoOpenResultModal}
              onChange={updateAutoOpenResultModal}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
          </Space>

          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            开启后，成绩公布动画结束会自动弹出该项目的成绩详情；关闭后，动画结束直接回到看板。
          </Paragraph>
        </div>

        <Divider style={{ margin: 0 }} />

        <div>
          <Space
            align="center"
            style={{
              width: "100%",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text strong style={{ fontSize: 16 }}>
              成绩播报
            </Text>
            <Switch
              checked={settings.scoreAnnouncement.enabled}
              onChange={(checked) =>
                updateScoreAnnouncement("enabled", checked)
              }
              checkedChildren="开启"
              unCheckedChildren="关闭"
              disabled={!speechSupported}
            />
          </Space>

          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            动画每一屏出现时立即播报，会依次播报“成绩公布”、项目名、名次、成绩、班级和姓名。
          </Paragraph>

          {speechSupported ? (
            <Alert
              type="info"
              showIcon
              message="使用浏览器内置语音播报"
              description="建议在大屏浏览器里提前选择中文语音，并先点一次“试播报”确认现场设备音量和发声效果。"
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="当前浏览器不支持语音播报"
              description="请使用支持 SpeechSynthesis 的现代浏览器，或仅保留动画展示。"
              style={{ marginBottom: 16 }}
            />
          )}

          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text>播报范围</Text>
              <div style={{ marginTop: 8 }}>
                <Radio.Group
                  value={settings.scoreAnnouncement.scope}
                  onChange={(event) =>
                    updateScoreAnnouncement(
                      "scope",
                      event.target.value as ScoreAnnouncementScope,
                    )
                  }
                  disabled={!speechSupported}
                >
                  <Radio value="podium">只播报前三名</Radio>
                  <Radio value="top8">播报当前动画内全部名次</Radio>
                </Radio.Group>
              </div>
            </div>

            <div>
              <Text>
                播报语速：{settings.scoreAnnouncement.speechRate.toFixed(1)} 倍
              </Text>
              <div style={{ marginTop: 12, padding: "0 8px" }}>
                <Slider
                  min={0.8}
                  max={1.6}
                  step={0.1}
                  value={settings.scoreAnnouncement.speechRate}
                  onChange={(value) =>
                    updateScoreAnnouncement("speechRate", value as number)
                  }
                  disabled={!speechSupported}
                />
              </div>
            </div>

            <div>
              <Text>播报音色</Text>
              <div style={{ marginTop: 8 }}>
                <Select
                  style={{ width: "100%" }}
                  value={settings.scoreAnnouncement.voiceURI}
                  onChange={(value) =>
                    updateScoreAnnouncement("voiceURI", value || undefined)
                  }
                  placeholder="使用浏览器默认中文语音"
                  allowClear
                  disabled={!speechSupported}
                  options={voiceOptions}
                />
              </div>
            </div>

            <Button
              onClick={onPreviewAnnouncement}
              disabled={!speechSupported}
              style={{ alignSelf: "flex-start" }}
            >
              试播报
            </Button>
          </Space>
        </div>
      </Space>
    </Modal>
  );
};

export default ScoreboardSettingsModal;
