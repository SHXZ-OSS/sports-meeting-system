import { Modal, Progress, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface BatchProgressProps {
  visible: boolean;
  current: number;
  total: number;
  title?: string;
  zIndex?: number;
}

const BatchProgress: React.FC<BatchProgressProps> = ({
  visible,
  current,
  total,
  title = "批量操作进行中",
  zIndex = 1000,
}) => {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Modal
      title={
        <span>
          <LoadingOutlined style={{ marginRight: 8 }} />
          {title}
        </span>
      }
      open={visible}
      footer={null}
      closable={false}
      maskClosable={false}
      centered
      width={400}
      zIndex={zIndex}
    >
      <div style={{ padding: "20px 0" }}>
        <Progress
          percent={percent}
          status="active"
          strokeColor={{
            from: "#108ee9",
            to: "#87d068",
          }}
        />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Text type="secondary">
            已完成 {current} / {total} 项
          </Text>
        </div>
      </div>
    </Modal>
  );
};

export default BatchProgress;
