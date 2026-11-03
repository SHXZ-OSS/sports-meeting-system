import { Modal, List, Typography, Tag, Space, Button } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export interface BatchResult {
  id: number | string;
  name: string;
  success: boolean;
  error?: string;
}

interface BatchResultsProps {
  visible: boolean;
  onClose: () => void;
  results: BatchResult[];
  title?: string;
  operationType?: string;
  zIndex?: number;
}

const BatchResults: React.FC<BatchResultsProps> = ({
  visible,
  onClose,
  results,
  title = "批量操作结果",
  operationType = "操作",
  zIndex = 1000,
}) => {
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;
  const failureResults = results.filter((r) => !r.success);

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          确定
        </Button>
      }
      width={600}
      centered
      zIndex={zIndex}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Space size="large">
            <div>
              <CheckCircleOutlined
                style={{ color: "#52c41a", marginRight: 8 }}
              />
              <Text strong style={{ color: "#52c41a" }}>
                成功: {successCount} 项
              </Text>
            </div>
            <div>
              <CloseCircleOutlined
                style={{ color: "#ff4d4f", marginRight: 8 }}
              />
              <Text strong style={{ color: "#ff4d4f" }}>
                失败: {failureCount} 项
              </Text>
            </div>
          </Space>
        </div>

        {failureResults.length > 0 && (
          <div>
            <Title level={5} style={{ color: "#ff4d4f", marginBottom: 8 }}>
              <CloseCircleOutlined style={{ marginRight: 8 }} />
              失败详情
            </Title>
            <List
              size="small"
              bordered
              dataSource={failureResults}
              renderItem={(item) => (
                <List.Item>
                  <div style={{ width: "100%" }}>
                    <div style={{ marginBottom: 4 }}>
                      <Space>
                        <Tag color="error">失败</Tag>
                        <Text strong>{item.name}</Text>
                      </Space>
                    </div>
                    {item.error && (
                      <div style={{ marginLeft: 16 }}>
                        <Text type="secondary" style={{ fontSize: "12px" }}>
                          错误原因: {item.error}
                        </Text>
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
              style={{ maxHeight: 200, overflowY: "auto" }}
            />
          </div>
        )}

        {results.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "var(--sm-text-muted)",
            }}
          >
            暂无{operationType}结果
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BatchResults;
