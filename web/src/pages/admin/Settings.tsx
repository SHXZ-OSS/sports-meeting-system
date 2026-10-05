import { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Row,
  Col,
  DatePicker,
  Space,
  Modal,
  Upload,
  Spin,
  Alert,
  InputNumber,
  Switch,
  Table,
  Popconfirm,
  message,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  UploadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { adminSettingsAPI, Event } from "../../api/admin/settings";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { useWebsite } from "../../contexts/WebsiteContext";
import { useIsMobile } from "../../utils/mobile";

const { Title } = Typography;
const { RangePicker } = DatePicker;

// Editable cell component for inline editing
interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  editing: boolean;
  dataIndex: string;
  title: any;
  record: Event;
  index: number;
  children: React.ReactNode;
}

const EditableCell: React.FC<EditableCellProps> = ({
  editing,
  dataIndex,
  children,
  ...restProps
}) => {
  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={[
            { required: true, message: "请输入届次名称" },
            { max: 100, message: "届次名称最长100个字符" },
          ]}
        >
          <Input placeholder="如：第一届运动会" />
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [eventForm] = Form.useForm();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const { refresh: refreshWebsiteInfo } = useWebsite();

  // Event management states
  const [events, setEvents] = useState<Event[]>([]);
  const [currentEventId, setCurrentEventId] = useState<number>(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [editingEventKey, setEditingEventKey] = useState<number | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    const data = await adminSettingsAPI.getSettings();
    handleResp(
      data,
      (data) => {
        // 当前 logo 预览
        setLogoUrl(data?.website.logo_url || "");

        // 设置表单值
        form.setFieldsValue({
          // 钉钉设置
          "dingtalk.app_key": data?.dingtalk.app_key,
          "dingtalk.app_secret": data?.dingtalk.app_secret,
          "dingtalk.agent_id": data?.dingtalk.agent_id,
          "dingtalk.corp_id": data?.dingtalk.corp_id,

          // 网站设置
          "website.name": data?.website.name,
          "website.domain": data?.website.domain,

          // 比赛设置
          submission_time:
            data?.competition.submission_start_time &&
            data?.competition.submission_end_time
              ? [
                  dayjs(data.competition.submission_start_time),
                  dayjs(data.competition.submission_end_time),
                ]
              : undefined,
          voting_time:
            data?.competition.voting_start_time &&
            data?.competition.voting_end_time
              ? [
                  dayjs(data.competition.voting_start_time),
                  dayjs(data.competition.voting_end_time),
                ]
              : undefined,
          registration_time:
            data?.competition.registration_start_time &&
            data?.competition.registration_end_time
              ? [
                  dayjs(data.competition.registration_start_time),
                  dayjs(data.competition.registration_end_time),
                ]
              : undefined,
          max_registrations_per_person:
            data?.competition.max_registrations_per_person || 3,
          "competition.allow_student_registration":
            data?.competition.allow_student_registration !== false,
          "competition.allow_student_submission":
            data?.competition.allow_student_submission !== false,

          // 统一认证设置
          "oidc.enabled": data?.oidc.enabled === true,
          "oidc.authorize_url": data?.oidc.authorize_url || "",
          "oidc.token_url": data?.oidc.token_url || "",
          "oidc.userinfo_url": data?.oidc.userinfo_url || "",
          "oidc.client_id": data?.oidc.client_id || "",
          "oidc.client_secret": data?.oidc.client_secret || "",
          "oidc.scopes": data?.oidc.scopes || "openid profile",

          // 看板设置
          "dashboard.enabled": data?.dashboard.enabled !== false,

          // 得分映射设置
          team_points_mapping: data?.scoring.team_points_mapping
            ? Object.entries(data.scoring.team_points_mapping).map(
                ([rank, points]) => ({
                  rank,
                  points,
                }),
              )
            : [],
          individual_points_mapping: data?.scoring.individual_points_mapping
            ? Object.entries(data.scoring.individual_points_mapping).map(
                ([rank, points]) => ({
                  rank,
                  points,
                }),
              )
            : [],
        });
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    fetchSettings();
    fetchEvents();
  }, []);

  const handleSave = async (values: any) => {
    setSaving(true);

    const updateData: any = {
      dingtalk: {
        app_key: values["dingtalk.app_key"] || "",
        app_secret: values["dingtalk.app_secret"] || "",
        agent_id: values["dingtalk.agent_id"] || "",
        corp_id: values["dingtalk.corp_id"] || "",
      },
      website: {
        name: values["website.name"] || "",
        domain: values["website.domain"] || "",
      },
      competition: {
        max_registrations_per_person:
          values["max_registrations_per_person"] || 0,
        allow_student_registration:
          values["competition.allow_student_registration"] !== false,
        allow_student_submission:
          values["competition.allow_student_submission"] !== false,
      },
      oidc: {
        enabled: values["oidc.enabled"] === true,
        authorize_url: values["oidc.authorize_url"] || "",
        token_url: values["oidc.token_url"] || "",
        userinfo_url: values["oidc.userinfo_url"] || "",
        client_id: values["oidc.client_id"] || "",
        client_secret: values["oidc.client_secret"] || "",
        scopes: values["oidc.scopes"] || "openid profile",
      },
      dashboard: {
        enabled: values["dashboard.enabled"] !== false,
      },
      scoring: {
        team_points_mapping: {},
        individual_points_mapping: {},
      },
    };

    // 处理时间范围
    if (values.submission_time) {
      updateData.competition.submission_start_time =
        values.submission_time[0].format("YYYY-MM-DD HH:mm:ss");
      updateData.competition.submission_end_time =
        values.submission_time[1].format("YYYY-MM-DD HH:mm:ss");
    }

    if (values.voting_time) {
      updateData.competition.voting_start_time = values.voting_time[0].format(
        "YYYY-MM-DD HH:mm:ss",
      );
      updateData.competition.voting_end_time = values.voting_time[1].format(
        "YYYY-MM-DD HH:mm:ss",
      );
    }

    if (values.registration_time) {
      updateData.competition.registration_start_time =
        values.registration_time[0].format("YYYY-MM-DD HH:mm:ss");
      updateData.competition.registration_end_time =
        values.registration_time[1].format("YYYY-MM-DD HH:mm:ss");
    }

    // 处理得分映射
    if (
      values.team_points_mapping &&
      Array.isArray(values.team_points_mapping)
    ) {
      values.team_points_mapping.forEach((item: any) => {
        if (item && item.rank && item.points !== undefined) {
          updateData.scoring.team_points_mapping[item.rank] = item.points;
        }
      });
    }

    if (
      values.individual_points_mapping &&
      Array.isArray(values.individual_points_mapping)
    ) {
      values.individual_points_mapping.forEach((item: any) => {
        if (item && item.rank && item.points !== undefined) {
          updateData.scoring.individual_points_mapping[item.rank] = item.points;
        }
      });
    }

    const response = await adminSettingsAPI.updateSettings(updateData);
    handleRespWithNotifySuccess(
      response,
      async () => {
        fetchSettings();
        // 在保存设置后重新获取网站信息（更新标题等）
        await refreshWebsiteInfo();
        setSaving(false);
      },
      () => {
        setSaving(false);
      },
    );
  };

  const fetchEvents = async () => {
    setEventsLoading(true);
    const response = await adminSettingsAPI.getEvents();
    handleResp(
      response,
      (data) => {
        setEvents(data?.list || []);
        setCurrentEventId(data?.current_event_id || 0);
        setEventsLoading(false);
      },
      () => {
        setEventsLoading(false);
      },
    );
  };

  const isEditingEvent = (record: Event) => record.id === editingEventKey;

  const handleEditEvent = (record: Event) => {
    eventForm.setFieldsValue({ name: record.name });
    setEditingEventKey(record.id);
  };

  const handleCancelEdit = () => {
    setEditingEventKey(null);
  };

  const handleSaveEvent = async (id: number) => {
    try {
      const values = await eventForm.validateFields();
      const response = await adminSettingsAPI.updateEvent(id, values);
      handleRespWithNotifySuccess(response, () => {
        setEditingEventKey(null);
        fetchEvents();
      });
    } catch (error) {
      console.error("Form validation failed:", error);
    }
  };

  const handleCreateEvent = async () => {
    Modal.confirm({
      title: "新增届次",
      content: (
        <Form
          layout="vertical"
          onFinish={() => {
            Modal.destroyAll();
          }}
        >
          <Form.Item
            label="届次名称"
            name="name"
            rules={[
              { required: true, message: "请输入届次名称" },
              { max: 100, message: "届次名称最长100个字符" },
            ]}
          >
            <Input placeholder="如：第一届运动会" />
          </Form.Item>
        </Form>
      ),
      okText: "确定",
      cancelText: "取消",
      onOk: async () => {
        const name = (
          document.querySelector(
            'input[placeholder="如：第一届运动会"]',
          ) as HTMLInputElement
        )?.value;
        if (!name) {
          message.error("请输入届次名称");
          return Promise.reject();
        }
        const response = await adminSettingsAPI.createEvent({ name });
        return new Promise((resolve, reject) => {
          handleRespWithNotifySuccess(
            response,
            () => {
              fetchEvents();
              resolve(true);
            },
            () => {
              reject();
            },
          );
        });
      },
    });
  };

  const handleDeleteEvent = async (id: number) => {
    const response = await adminSettingsAPI.deleteEvent(id);
    handleRespWithNotifySuccess(response, () => {
      fetchEvents();
    });
  };

  const handleSwitchEvent = async (id: number) => {
    const response = await adminSettingsAPI.switchEvent(id);
    handleRespWithNotifySuccess(response, () => {
      fetchEvents();
    });
  };

  const eventColumns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 80,
    },
    {
      title: "届次名称",
      dataIndex: "name",
      key: "name",
      editable: true,
    },
    {
      title: "操作",
      key: "actions",
      width: isMobile ? 200 : 200,
      render: (_: any, record: Event) => {
        const editable = isEditingEvent(record);
        return editable ? (
          <Space size="small" wrap>
            <Typography.Link onClick={() => handleSaveEvent(record.id)}>
              保存
            </Typography.Link>
            <Popconfirm title="确定取消编辑吗？" onConfirm={handleCancelEdit}>
              <a>取消</a>
            </Popconfirm>
          </Space>
        ) : (
          <Space size="small" wrap>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditEvent(record)}
              disabled={
                editingEventKey !== null && editingEventKey !== record.id
              }
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此届次吗？"
              description={
                record.id === currentEventId
                  ? "不能删除当前选中的运动会届次"
                  : "删除后无法恢复，且不能删除有比赛项目关联的届次"
              }
              onConfirm={() => handleDeleteEvent(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={
                record.id === currentEventId || editingEventKey !== null
              }
            >
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={
                  record.id === currentEventId || editingEventKey !== null
                }
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const mergedEventColumns = eventColumns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record: Event) => ({
        record,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditingEvent(record),
      }),
    };
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>系统设置</Title>
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: 16,
            }}
          >
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchSettings}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              刷新
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchSettings}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>
        )}
      </div>

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          autoComplete="off"
        >
          {/* 运动会届次管理 */}
          <Card
            title="运动会届次管理"
            style={{ marginBottom: 24 }}
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateEvent}
              >
                新增届次
              </Button>
            }
          >
            <Alert
              message="说明"
              description="管理运动会届次，选择单选框切换当前届次，切换后将影响比赛项目的创建和查询。点击编辑按钮可直接修改届次名称。当前选中的届次不能删除。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form form={eventForm} component={false}>
              <Table
                components={{
                  body: {
                    cell: EditableCell,
                  },
                }}
                dataSource={events}
                columns={mergedEventColumns}
                rowKey="id"
                loading={eventsLoading}
                pagination={false}
                rowClassName="editable-row"
                rowSelection={{
                  type: "radio",
                  selectedRowKeys: currentEventId ? [currentEventId] : [],
                  onChange: (selectedRowKeys) => {
                    const selectedId = selectedRowKeys[0] as number;
                    if (selectedId && selectedId !== currentEventId) {
                      handleSwitchEvent(selectedId);
                    }
                  },
                  getCheckboxProps: () => ({
                    disabled: editingEventKey !== null,
                  }),
                }}
              />
            </Form>
          </Card>

          {/* 网站设置 */}
          <Card title="网站设置" style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="网站名称"
                  name="website.name"
                  rules={[{ required: true, message: "请输入网站名称" }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="域名" name="website.domain">
                  <Input placeholder="如：example.com" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}></Col>
            </Row>

            {/* 自定义 logo */}
            <Form.Item
              label="自定义 Logo"
              help="上传后用作浏览器标签页图标与 PWA 应用图标，保存设置后生效"
            >
              <Space direction="vertical" size={8}>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="自定义 Logo"
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid #f0f0f0",
                    }}
                  />
                )}
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) {
                      message.error("图片大小不能超过 10MB");
                      return false;
                    }
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const response = await adminSettingsAPI.uploadLogo(
                        reader.result as string,
                      );
                      handleRespWithNotifySuccess(response, (data) => {
                        setLogoUrl(data.logo_url);
                        refreshWebsiteInfo();
                      });
                    };
                    reader.readAsDataURL(file);
                    return false; // 阻止 antd 自动上传，走自定义 Base64 逻辑
                  }}
                >
                  <Button icon={<UploadOutlined />}>
                    {logoUrl ? "更换 Logo" : "上传 Logo"}
                  </Button>
                </Upload>
              </Space>
            </Form.Item>
          </Card>

          {/* 钉钉设置 */}
          <Card title="钉钉设置" style={{ marginBottom: 24 }}>
            <Alert
              message="钉钉设置说明"
              description={
                <>
                  配置钉钉登录需要在
                  <a
                    href="https://open-dev.dingtalk.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    钉钉开发者后台
                  </a>
                  创建应用并获取相关参数
                </>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="App Key" name="dingtalk.app_key">
                  <Input.Password placeholder="钉钉应用的AppKey" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="App Secret" name="dingtalk.app_secret">
                  <Input.Password placeholder="钉钉应用的AppSecret" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Agent ID" name="dingtalk.agent_id">
                  <Input placeholder="钉钉应用的AgentId" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Corp ID" name="dingtalk.corp_id">
                  <Input placeholder="钉钉企业的CorpId" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 统一认证设置 */}
          <Card title="统一认证设置" style={{ marginBottom: 24 }}>
            <Alert
              message="说明"
              description="接入 OIDC 单点登录（如慧云统一认证）。三个端点地址均填完整 URL，需在认证提供方注册回调地址为「本站域名 + /api/public/oidc/callback」。登录时按用户名匹配本系统账号（先学生后管理员）。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              label="启用统一认证登录"
              name="oidc.enabled"
              valuePropName="checked"
            >
              <Switch checkedChildren="启用" unCheckedChildren="关闭" />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="授权端点" name="oidc.authorize_url">
                  <Input placeholder="如 https://sis.example.com/api/oauth/authorize" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="令牌端点" name="oidc.token_url">
                  <Input placeholder="如 https://sis.example.com/api/oauth/token" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="用户信息端点" name="oidc.userinfo_url">
                  <Input placeholder="如 https://sis.example.com/api/oauth/userinfo" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="授权范围" name="oidc.scopes">
                  <Input placeholder="openid profile" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Client ID" name="oidc.client_id">
                  <Input placeholder="认证提供方注册的客户端 ID" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Client Secret" name="oidc.client_secret">
                  <Input.Password placeholder="认证提供方注册的客户端密钥" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 比赛设置 */}
          <Card title="比赛设置" style={{ marginBottom: 24 }}>
            <Alert
              message="说明"
              description="设置项目征集、投票和报名的时间范围与最大报名人数。留空表示不限制时间。人数限制为0则表示不限制每人报名项目数。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="项目征集时间" name="submission_time">
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm:ss"
                    placeholder={["开始时间", "结束时间"]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="项目投票时间" name="voting_time">
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm:ss"
                    placeholder={["开始时间", "结束时间"]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="项目报名时间" name="registration_time">
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm:ss"
                    placeholder={["开始时间", "结束时间"]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="每人最多报名个人项目数"
                  name="max_registrations_per_person"
                  extra="仅统计个人比赛，团体比赛不计入限制。0表示无限制"
                >
                  <InputNumber min={0} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="允许学生本人报名"
                  name="competition.allow_student_registration"
                  valuePropName="checked"
                  extra="关闭后仅管理员与班级账号可为学生报名"
                >
                  <Switch checkedChildren="允许" unCheckedChildren="关闭" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="允许学生本人提交推荐项目"
                  name="competition.allow_student_submission"
                  valuePropName="checked"
                  extra="关闭后仅管理员与班级账号可提交推荐项目"
                >
                  <Switch checkedChildren="允许" unCheckedChildren="关闭" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 看板设置 */}
          <Card title="看板设置" style={{ marginBottom: 24 }}>
            <Alert
              message="说明"
              description="控制公开看板的显示状态。关闭后用户将无法访问公开看板页面。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              label="启用公开看板"
              name="dashboard.enabled"
              valuePropName="checked"
            >
              <Switch checkedChildren="启用" unCheckedChildren="关闭" />
            </Form.Item>
          </Card>

          {/* 得分映射配置 */}
          <Card title="得分映射配置" style={{ marginBottom: 24 }}>
            <Alert
              message="说明"
              description="配置不同名次对应的得分。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Title level={5}>团体赛得分映射</Title>
                <Form.List name="team_points_mapping">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space
                          key={key}
                          style={{ display: "flex", marginBottom: 8 }}
                          align="baseline"
                        >
                          <Form.Item
                            {...restField}
                            name={[name, "rank"]}
                            rules={[
                              { required: true, message: "请输入名次" },
                              {
                                pattern: /^[1-9]\d*$/,
                                message: "名次必须是正整数",
                              },
                            ]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input
                              placeholder="名次"
                              addonBefore="第"
                              addonAfter="名"
                              style={{ width: 120 }}
                            />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, "points"]}
                            rules={[{ required: true, message: "请输入得分" }]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              min={0}
                              step={0.1}
                              placeholder="得分"
                              style={{ width: 100 }}
                            />
                          </Form.Item>
                          <DeleteOutlined
                            onClick={() => remove(name)}
                            style={{ color: "#ff4d4f", cursor: "pointer" }}
                          />
                        </Space>
                      ))}
                      <Form.Item>
                        <Button
                          type="dashed"
                          onClick={() => add()}
                          block
                          icon={<PlusOutlined />}
                        >
                          添加名次映射
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Col>

              <Col xs={24} md={12}>
                <Title level={5}>个人赛得分映射</Title>
                <Form.List name="individual_points_mapping">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space
                          key={key}
                          style={{ display: "flex", marginBottom: 8 }}
                          align="baseline"
                        >
                          <Form.Item
                            {...restField}
                            name={[name, "rank"]}
                            rules={[
                              { required: true, message: "请输入名次" },
                              {
                                pattern: /^[1-9]\d*$/,
                                message: "名次必须是正整数",
                              },
                            ]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input
                              placeholder="名次"
                              addonBefore="第"
                              addonAfter="名"
                              style={{ width: 120 }}
                            />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, "points"]}
                            rules={[{ required: true, message: "请输入得分" }]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              min={0}
                              step={0.1}
                              placeholder="得分"
                              style={{ width: 100 }}
                            />
                          </Form.Item>
                          <DeleteOutlined
                            onClick={() => remove(name)}
                            style={{ color: "#ff4d4f", cursor: "pointer" }}
                          />
                        </Space>
                      ))}
                      <Form.Item>
                        <Button
                          type="dashed"
                          onClick={() => add()}
                          block
                          icon={<PlusOutlined />}
                        >
                          添加名次映射
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Col>
            </Row>
          </Card>

          {/* 危险操作 */}
          <Form.Item style={{ textAlign: "right", marginTop: 24 }}>
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              loading={saving}
              icon={<SaveOutlined />}
            >
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Spin>
    </div>
  );
};

export default Settings;
