import { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Typography,
  Row,
  Col,
  Upload,
  Radio,
  Alert,
  Space,
  Modal,
  InputNumber,
  Switch,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { studentAPI } from "../../api/student";
import { message } from "antd";
import { handleRespWithNotifySuccess } from "../../utils/handleResp";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const SubmitCompetition: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const genderValue = Form.useWatch("gender", form);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [canConfirm, setCanConfirm] = useState(false);
  const [formValues, setFormValues] = useState<any>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (showConfirmModal && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (countdown === 0) {
      setCanConfirm(true);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showConfirmModal, countdown]);

  const handleSubmit = async (values: any) => {
    setFormValues(values);
    setShowConfirmModal(true);
    setCountdown(10);
    setCanConfirm(false);
  };

  const handleConfirmSubmit = async () => {
    if (!formValues) return;

    try {
      setSubmitting(true);

      let imageBase64 = "";
      if (formValues.image && formValues.image.file) {
        const file =
          formValues.image.file.originFileObj || formValues.image.file;
        imageBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const isMixed = formValues.gender === 3;
      const response = await studentAPI.createCompetition({
        name: formValues.name,
        description: formValues.description || "",
        ranking_mode: formValues.ranking_mode,
        gender: formValues.gender,
        competition_type: formValues.competition_type || "individual",
        unit: formValues.unit,
        min_participants_per_class: formValues.min_participants_per_class || 0,
        max_participants_per_class: formValues.max_participants_per_class || 0,
        min_female_per_class: isMixed ? (formValues.min_female_per_class ?? 0) : 0,
        max_female_per_class: isMixed ? (formValues.max_female_per_class ?? 0) : 0,
        min_male_per_class: isMixed ? (formValues.min_male_per_class ?? 0) : 0,
        max_male_per_class: isMixed ? (formValues.max_male_per_class ?? 0) : 0,
        image: imageBase64,
        allow_concurrent: formValues.allow_concurrent ?? false,
      });

      handleRespWithNotifySuccess(response, () => {
        form.resetFields();
        setShowConfirmModal(false);
        navigate("/student/competitions");
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    setShowConfirmModal(false);
    setFormValues(null);
    setCountdown(10);
    setCanConfirm(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title level={2} style={{ textAlign: "center", marginBottom: 32 }}>
        推荐比赛项目
      </Title>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            label="项目名称"
            name="name"
            rules={[
              { required: true, message: "请输入项目名称" },
              { min: 1, max: 20, message: "项目名称长度为1-20个字符" },
            ]}
          >
            <Input placeholder="如：男子100米跑、女子跳远等" />
          </Form.Item>

          <Form.Item
            label="项目描述"
            name="description"
            rules={[{ max: 500, message: "描述不能超过500个字符" }]}
          >
            <TextArea
              rows={4}
              placeholder="详细描述项目的规则、要求等（可选）"
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            label="比赛类型"
            name="competition_type"
            rules={[{ required: true, message: "请选择比赛类型" }]}
            initialValue="individual"
            extra="选择项目是个人赛还是团体赛"
          >
            <Radio.Group>
              <Radio value="individual">个人比赛</Radio>
              <Radio value="team">团体比赛</Radio>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="性别要求"
                name="gender"
                rules={[{ required: true, message: "请选择性别要求" }]}
              >
                <Select placeholder="选择参赛性别要求">
                  <Option value={1}>
                    <Space>
                      <span>男子</span>
                      <Text type="secondary" style={{ fontSize: "12px" }}>
                        仅限男学生参加
                      </Text>
                    </Space>
                  </Option>
                  <Option value={2}>
                    <Space>
                      <span>女子</span>
                      <Text type="secondary" style={{ fontSize: "12px" }}>
                        仅限女学生参加
                      </Text>
                    </Space>
                  </Option>
                  <Option value={3}>
                    <Space>
                      <span>不限</span>
                      <Text type="secondary" style={{ fontSize: "12px" }}>
                        男女学生均可参加
                      </Text>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="成绩单位"
                name="unit"
                rules={[
                  { required: true, message: "请输入成绩单位" },
                  { max: 10, message: "单位不能超过10个字符" },
                ]}
              >
                <Input placeholder="如：秒、米、厘米、分等" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="排名方式"
            name="ranking_mode"
            rules={[{ required: true, message: "请选择排名方式" }]}
            extra="选择成绩如何排名，这将影响最终的排名计算"
          >
            <Radio.Group>
              <Radio
                value="higher_first"
                style={{ display: "block", marginBottom: 8 }}
              >
                <strong>分数越高排名越好</strong>
                <div
                  style={{
                    color: "#666",
                    fontSize: "12px",
                    marginLeft: "24px",
                  }}
                >
                  适用于跳高、跳远、投掷等项目
                </div>
              </Radio>
              <Radio value="lower_first" style={{ display: "block" }}>
                <strong>分数越低排名越好</strong>
                <div
                  style={{
                    color: "#666",
                    fontSize: "12px",
                    marginLeft: "24px",
                  }}
                >
                  适用于跑步、时间类等项目
                </div>
              </Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="每班最少报名人数"
            name="min_participants_per_class"
            rules={[{ required: true, message: "请输入每班最少报名人数" }]}
            extra="0表示无限制"
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            label="每班最多报名人数"
            name="max_participants_per_class"
            rules={[{ required: true, message: "请输入每班最多报名人数" }]}
            extra="0表示无限制"
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          {genderValue === 3 && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="每班最少女生人数" name="min_female_per_class" initialValue={0} extra="0表示无限制">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="每班最多女生人数" name="max_female_per_class" initialValue={0} extra="0表示无限制">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="每班最少男生人数" name="min_male_per_class" initialValue={0} extra="0表示无限制">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="每班最多男生人数" name="max_male_per_class" initialValue={0} extra="0表示无限制">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Form.Item
            label="允许兼项"
            name="allow_concurrent"
            valuePropName="checked"
            initialValue={false}
            extra="开启后，该比赛与其他比赛时间冲突时不视为错误"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="项目图片"
            name="image"
            extra="上传项目相关图片（可选），大小不超过10MB"
          >
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith("image/");
                if (!isImage) {
                  message.error("只能上传图片文件");
                  return false;
                }
                const isLt10M = file.size / 1024 / 1024 < 10;
                if (!isLt10M) {
                  message.error("图片大小不能超过10MB");
                  return false;
                }
                return false; // 阻止默认上传，我们手动处理
              }}
              accept="image/*"
            >
              <div>
                <UploadOutlined />
                <div style={{ marginTop: 8 }}>上传图片</div>
              </div>
            </Upload>
          </Form.Item>

          <Alert
            message={
              <Space>
                <InfoCircleOutlined />
                温馨提示
              </Space>
            }
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>请确保项目信息准确无误，提交后将无法修改与删除</li>
                <li>请在提交前确保没有重复的比赛项目</li>
                <li>推荐的项目应该适合学生参与，且具有可操作性、安全性</li>
                <li>如有疑问，请及时联系负责老师</li>
              </ul>
            }
            type="warning"
            style={{ marginBottom: 24 }}
          />

          <Form.Item style={{ textAlign: "center", marginBottom: 0 }}>
            <Space size={16}>
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                loading={submitting}
                icon={<PlusOutlined />}
              >
                提交推荐
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: "#faad14" }} />
            <span>重要提醒</span>
          </Space>
        }
        open={showConfirmModal}
        onCancel={handleCancelSubmit}
        footer={[
          <Button key="cancel" onClick={handleCancelSubmit}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            loading={submitting}
            disabled={!canConfirm}
            onClick={handleConfirmSubmit}
          >
            {canConfirm ? "确认提交" : `请仔细阅读 (${countdown}s)`}
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
        width={500}
      >
        <Alert
          message="提交后无法修改或删除"
          description={
            <div>
              <p>
                <strong>请注意：</strong>
              </p>
              <ul className="warning-list">
                <li>
                  项目一旦提交成功，您将<strong>无法自行修改或删除</strong>
                </li>
                <li>如需修改，只能联系管理员处理</li>
                <li>请仔细核对项目信息，确保准确无误</li>
              </ul>
              <p className="confirm-text">确定要提交该项目推荐吗？</p>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      </Modal>
    </div>
  );
};

export default SubmitCompetition;
