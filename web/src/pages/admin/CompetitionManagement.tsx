import { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Typography,
  Popconfirm,
  Row,
  Col,
  Image,
  Upload,
  Radio,
  Dropdown,
  message,
  InputNumber,
  DatePicker,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckOutlined,
  CloseOutlined,
  UploadOutlined,
  MoreOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import { adminCompetitionAPI } from "../../api/admin/competition";
import { Competition } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
  handleBatchResp,
} from "../../utils/handleResp";
import { getStatusTag, getGenderText } from "../../utils/competition";
import { useIsMobile } from "../../utils/mobile";
import BatchResults, { BatchResult } from "../../components/BatchResults";
import BatchImportExport from "../../components/BatchImportExport";
import BatchProgress from "../../components/BatchProgress";

const { Title } = Typography;
const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;

const CompetitionManagement: React.FC = () => {
  const [form] = Form.useForm();
  const isMobile = useIsMobile();
  const genderValue = Form.useWatch("gender", form);

  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCompetition, setEditingCompetition] =
    useState<Competition | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "votes" | "schedule">("schedule");
  const [batchResultsVisible, setBatchResultsVisible] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchProgressVisible, setBatchProgressVisible] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const fetchCompetitions = async (
    page = currentPage,
    size = pageSize,
    isSearch = false,
  ) => {
    setLoading(true);
    const params: any = {};

    // 添加排序参数
    params.sort_by = sortBy;

    // 如果是搜索，不指定分页参数以获取全部数据
    if (isSearch) {
      if (searchText) {
        // 搜索时获取所有数据，在前端过滤
        const response = await adminCompetitionAPI.getCompetitions({
          status: statusFilter,
          sort_by: sortBy,
        });
        handleResp(
          response,
          (data) => {
            // 前端过滤搜索结果
            const filteredData = data.filter((competition: any) =>
              competition.name.toLowerCase().includes(searchText.toLowerCase()),
            );
            setCompetitions(filteredData);
            setTotal(filteredData.length);
            setLoading(false);
          },
          () => {
            setLoading(false);
          },
        );
        return;
      }
    }

    // 正常分页请求
    params.page = page;
    params.page_size = size;
    if (statusFilter) params.status = statusFilter;

    const response = await adminCompetitionAPI.getCompetitions(params);
    handleResp(
      response,
      (data, pagination) => {
        setCompetitions(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    if (searchText) {
      fetchCompetitions(currentPage, pageSize, true);
    } else {
      fetchCompetitions();
    }
  }, [currentPage, pageSize, statusFilter, searchText]);

  // 当排序方式改变时，重新获取数据
  useEffect(() => {
    fetchCompetitions();
  }, [sortBy]);

  const handleApprove = async (competition: Competition) => {
    const response = await adminCompetitionAPI.approveCompetition(
      competition.id,
    );
    handleRespWithNotifySuccess(response, () => {
      fetchCompetitions();
    });
  };

  const handleReject = async (competition: Competition) => {
    const response = await adminCompetitionAPI.rejectCompetition(
      competition.id,
    );
    handleRespWithNotifySuccess(response, () => {
      fetchCompetitions();
    });
  };

  const handleDelete = async (competition: Competition) => {
    const response = await adminCompetitionAPI.deleteCompetition(
      competition.id,
    );
    handleRespWithNotifySuccess(response, () => {
      fetchCompetitions();
    });
  };

  // 批量导入比赛
  const handleBatchImportCompetitions = async (data: any[]) => {
    const rankingModeMap: { [key: string]: "higher_first" | "lower_first" } = {
      越高越好: "higher_first",
      越低越好: "lower_first",
    };

    const genderMap: { [key: string]: number } = {
      男: 1,
      女: 2,
      不限: 3,
    };

    const competitionTypeMap: { [key: string]: "individual" | "team" } = {
      个人: "individual",
      团体: "team",
    };

    const items = data.map((row, index) => ({
      id: index,
      name: row["名称"] || `第${index + 1}行`,
      request: async () => {
        const gender = row["性别"] in genderMap ? genderMap[row["性别"]] : 3;
        const response = await adminCompetitionAPI.createCompetition({
          name: row["名称"],
          description: row["描述"],
          ranking_mode: rankingModeMap[row["排名模式"]] || "higher_first",
          unit: row["单位"],
          competition_type: competitionTypeMap[row["比赛类型"]] || "individual",
          gender,
          min_participants_per_class: Number(row["每班最少报名人数"]) || 0,
          max_participants_per_class: Number(row["每班最多报名人数"]) || 0,
          min_female_per_class: gender === 3 ? Number(row["每班最少女生人数"]) || 0 : 0,
          max_female_per_class: gender === 3 ? Number(row["每班最多女生人数"]) || 0 : 0,
          min_male_per_class: gender === 3 ? Number(row["每班最少男生人数"]) || 0 : 0,
          max_male_per_class: gender === 3 ? Number(row["每班最多男生人数"]) || 0 : 0,
          start_time: row["开始时间"] ? dayjs(row["开始时间"]).toISOString() : undefined,
          end_time: row["结束时间"] ? dayjs(row["结束时间"]).toISOString() : undefined,
        });
        if (response.code !== 200) {
          throw new Error(response.message);
        }
        return response.data;
      },
    }));

    setBatchProgressVisible(true);
    setBatchProgress({ current: 0, total: items.length });

    const results = await handleBatchResp(items, {
      onProgress: (current, total) => {
        setBatchProgress({ current, total });
      },
      onComplete: (results) => {
        setBatchProgressVisible(false);
        setBatchResults(results);
        setBatchResultsVisible(true);
        fetchCompetitions();
      },
    });

    return results;
  };

  // 导出全部比赛
  const handleExportCompetitions = async () => {
    const response = await adminCompetitionAPI.getCompetitions({});
    return new Promise<any[]>((resolve, reject) => {
      handleResp(
        response,
        (data) => {
          resolve(data);
        },
        () => {
          reject(new Error("导出失败"));
        },
      );
    });
  };

  // 批量删除比赛
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要删除的项目");
      return;
    }

    Modal.confirm({
      title: `确定删除选中的 ${selectedRowKeys.length} 个项目吗？`,
      content: "删除后不可恢复",
      onOk: async () => {
        const selectedCompetitions = competitions.filter((c) =>
          selectedRowKeys.includes(c.id),
        );
        const items = selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          request: async () => {
            const response = await adminCompetitionAPI.deleteCompetition(
              competition.id,
            );
            if (response.code !== 200) {
              throw new Error(response.message);
            }
            return response.data;
          },
        }));

        setBatchProgressVisible(true);
        setBatchProgress({ current: 0, total: items.length });

        await handleBatchResp(items, {
          onProgress: (current, total) => {
            setBatchProgress({ current, total });
          },
          onComplete: (results) => {
            setBatchProgressVisible(false);
            setBatchResults(results);
            setBatchResultsVisible(true);
            setSelectedRowKeys([]);
            fetchCompetitions();
          },
        });
      },
    });
  };

  const openModal = (competition?: Competition) => {
    setEditingCompetition(competition || null);
    setModalVisible(true);

    if (competition) {
      form.setFieldsValue({
        name: competition.name,
        description: competition.description,
        competition_type: competition.competition_type || "individual",
        ranking_mode: competition.ranking_mode,
        gender: competition.gender,
        unit: competition.unit,
        min_participants_per_class: competition.min_participants_per_class || 0,
        max_participants_per_class: competition.max_participants_per_class || 0,
        min_female_per_class: competition.min_female_per_class || 0,
        max_female_per_class: competition.max_female_per_class || 0,
        min_male_per_class: competition.min_male_per_class || 0,
        max_male_per_class: competition.max_male_per_class || 0,
        start_time: competition.start_time ? dayjs(competition.start_time) : null,
        end_time: competition.end_time ? dayjs(competition.end_time) : null,
      });
    } else {
      form.resetFields();
      // 设置默认值
      form.setFieldsValue({
        competition_type: "individual",
      });
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCompetition(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    let imageBase64 = "";
    if (values.image && values.image.file) {
      // 转换为base64
      const file = values.image.file.originFileObj || values.image.file;
      imageBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    const isMixed = values.gender === 3;
    if (editingCompetition) {
      const response = await adminCompetitionAPI.updateCompetition(
        editingCompetition.id,
        {
          name: values.name,
          description: values.description,
          competition_type: values.competition_type,
          ranking_mode: values.ranking_mode,
          gender: values.gender,
          unit: values.unit,
          min_participants_per_class: values.min_participants_per_class,
          max_participants_per_class: values.max_participants_per_class,
          min_female_per_class: isMixed ? (values.min_female_per_class ?? 0) : 0,
          max_female_per_class: isMixed ? (values.max_female_per_class ?? 0) : 0,
          min_male_per_class: isMixed ? (values.min_male_per_class ?? 0) : 0,
          max_male_per_class: isMixed ? (values.max_male_per_class ?? 0) : 0,
          image: imageBase64,
          start_time: values.start_time?.toISOString(),
          end_time: values.end_time?.toISOString(),
        },
      );
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        fetchCompetitions();
      });
    } else {
      const response = await adminCompetitionAPI.createCompetition({
        name: values.name,
        description: values.description,
        competition_type: values.competition_type,
        ranking_mode: values.ranking_mode,
        gender: values.gender,
        unit: values.unit,
        min_participants_per_class: values.min_participants_per_class,
        max_participants_per_class: values.max_participants_per_class,
        min_female_per_class: isMixed ? (values.min_female_per_class ?? 0) : 0,
        max_female_per_class: isMixed ? (values.max_female_per_class ?? 0) : 0,
        min_male_per_class: isMixed ? (values.min_male_per_class ?? 0) : 0,
        max_male_per_class: isMixed ? (values.max_male_per_class ?? 0) : 0,
        image: imageBase64,
        start_time: values.start_time?.toISOString(),
        end_time: values.end_time?.toISOString(),
      });
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        fetchCompetitions();
      });
    }
  };

  const handleAction = (key: string, record: Competition) => {
    switch (key) {
      case "approve":
        handleApprove(record);
        break;
      case "reject":
        handleReject(record);
        break;
      case "edit":
        openModal(record);
        break;
      case "delete":
        Modal.confirm({
          title: "确定删除此项目吗？",
          content: "删除后不可恢复",
          onOk: () => handleDelete(record),
        });
        break;
    }
  };

  const getActionItems = (record: Competition) => {
    const items = [] as Array<{
      key: string;
      icon: React.ReactNode;
      label: string;
      danger?: boolean;
    }>;

    items.push(
      { key: "edit", icon: <EditOutlined />, label: "编辑" },
      { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
    );

    if (record.status === "pending_approval" || record.status === "rejected") {
      items.push({ key: "approve", icon: <CheckOutlined />, label: "通过" });
    }
    if (record.status === "pending_approval" || record.status === "approved") {
      items.push({
        key: "reject",
        icon: <CloseOutlined />,
        label: "拒绝",
        danger: true,
      });
    }

    return items;
  };

  const columns = [
    {
      title: "项目名称",
      key: "info",
      render: (record: Competition) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {record.image_path && !isMobile && (
            <Image
              src={record.image_path}
              alt={record.name}
              width={40}
              height={40}
              style={{ borderRadius: 4, objectFit: "cover" }}
              preview={{
                mask: <div style={{ fontSize: "12px" }}>预览</div>,
              }}
            />
          )}
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            {record.description && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                {record.description}
              </div>
            )}
            {record.start_time && record.end_time && (
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {dayjs(record.start_time).format("MM-DD HH:mm")} - {dayjs(record.end_time).format("HH:mm")}
              </div>
            )}
          </div>
        </div>
      ),
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value: boolean | React.Key, record: Competition) =>
        record.name.toLowerCase().includes(value.toString().toLowerCase()),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: getStatusTag,
    },
    {
      title: "类型",
      dataIndex: "competition_type",
      key: "competition_type",
      render: (type: string) => (
        <Tag color={type === "team" ? "blue" : "green"}>
          {type === "team" ? "团体" : "个人"}
        </Tag>
      ),
    },
    {
      title: "性别",
      dataIndex: "gender",
      key: "gender",
      render: getGenderText,
    },
    {
      title: "报名人数",
      dataIndex: "registration_count",
      key: "registration_count",
      render: (count: number) => count || 0,
    },
    {
      title: "投票数",
      dataIndex: "vote_count",
      key: "vote_count",
      render: (count: number) => count || 0,
    },
    {
      title: "提交者",
      dataIndex: "submitter_name",
      key: "submitter_name",
    },
    {
      title: "操作",
      key: "action",
      render: (record: Competition) => {
        if (isMobile) {
          return (
            <Dropdown
              menu={{
                items: getActionItems(record),
                onClick: ({ key }) => handleAction(key, record),
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          );
        }

        return (
          <Space size="small">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openModal(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此项目吗？"
              description="删除后不可恢复"
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
            {(record.status === "pending_approval" ||
              record.status === "rejected") && (
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(record)}
              >
                通过
              </Button>
            )}
            {(record.status === "pending_approval" ||
              record.status === "approved") && (
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => handleReject(record)}
              >
                拒绝
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>项目管理</Title>
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: 16,
            }}
          >
            <Select
              placeholder="筛选状态"
              allowClear
              size="large"
              style={{ width: "100%" }}
              value={statusFilter || undefined}
              onChange={setStatusFilter}
            >
              <Option value="pending_approval">待审核</Option>
              <Option value="approved">已审核</Option>
              <Option value="rejected">已拒绝</Option>
              <Option value="pending_score_review">待审核成绩</Option>
              <Option value="completed">已完成</Option>
            </Select>
            <Select
              placeholder="排序方式"
              size="large"
              style={{ width: "100%" }}
              value={sortBy}
              onChange={setSortBy}
            >
              <Option value="name">按名称排序</Option>
              <Option value="votes">按票数排序</Option>
              <Option value="schedule">按日程排序</Option>
            </Select>
            <Search
              placeholder="搜索项目名称"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1); // 搜索时重置到第一页
              }}
              size="large"
              style={{ width: "100%" }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchCompetitions()}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openModal()}
              size="large"
              style={{ width: "100%" }}
            >
              新增项目
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: "import",
                    icon: <FileExcelOutlined />,
                    label: "批量导入/导出",
                  },
                  {
                    type: "divider",
                  },
                  {
                    key: "batchDelete",
                    icon: <DeleteOutlined />,
                    label: "批量删除",
                    danger: true,
                    disabled: selectedRowKeys.length === 0,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === "import") {
                    setBatchModalVisible(true);
                  } else if (key === "batchDelete") {
                    handleBatchDelete();
                  }
                },
              }}
            >
              <Button size="large" style={{ width: "100%" }}>
                <Space>
                  <MoreOutlined />
                  批量操作
                </Space>
              </Button>
            </Dropdown>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Select
                placeholder="筛选状态"
                allowClear
                style={{ width: 150 }}
                value={statusFilter || undefined}
                onChange={setStatusFilter}
              >
                <Option value="pending_approval">待审核</Option>
                <Option value="approved">已审核</Option>
                <Option value="rejected">已拒绝</Option>
                <Option value="pending_score_review">待审核成绩</Option>
                <Option value="completed">已完成</Option>
              </Select>
              <Select
                placeholder="排序方式"
                style={{ width: 150 }}
                value={sortBy}
                onChange={setSortBy}
              >
                <Option value="schedule">按日程排序</Option>
                <Option value="name">按名称排序</Option>
                <Option value="votes">按票数排序</Option>
              </Select>
              <Search
                placeholder="搜索项目名称"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1); // 搜索时重置到第一页
                }}
                style={{ width: 250 }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fetchCompetitions()}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
              >
                新增项目
              </Button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: "import",
                      icon: <FileExcelOutlined />,
                      label: "批量导入/导出",
                    },
                    {
                      type: "divider",
                    },
                    {
                      key: "batchDelete",
                      icon: <DeleteOutlined />,
                      label: "批量删除",
                      danger: true,
                      disabled: selectedRowKeys.length === 0,
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === "import") {
                      setBatchModalVisible(true);
                    } else if (key === "batchDelete") {
                      handleBatchDelete();
                    }
                  },
                }}
              >
                <Button>
                  <Space>
                    <MoreOutlined />
                    批量操作
                  </Space>
                </Button>
              </Dropdown>
            </Space>
          </div>
        )}
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={competitions}
          rowKey="id"
          loading={loading}
          tableLayout="auto"
          scroll={{ x: "max-content" }}
          rowSelection={{
            selectedRowKeys,
            onChange: (selectedKeys) => setSelectedRowKeys(selectedKeys),
          }}
          pagination={
            isMobile
              ? {
                  current: currentPage,
                  pageSize,
                  total,
                  simple: true,
                  size: "small",
                  onChange: (page, size) => {
                    setCurrentPage(page);
                    setPageSize(size || 10);
                  },
                }
              : {
                  current: currentPage,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 条记录`,
                  onChange: (page, size) => {
                    setCurrentPage(page);
                    setPageSize(size || 10);
                  },
                }
          }
        />
      </Card>

      {/* 创建/编辑项目模态框 */}
      <Modal
        title={editingCompetition ? "编辑项目" : "新增项目"}
        open={modalVisible}
        onCancel={closeModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="项目名称"
            name="name"
            rules={[
              { required: true, message: "请输入项目名称" },
              { min: 1, message: "项目名称至少1个字符" },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item label="项目描述" name="description">
            <TextArea rows={3} placeholder="项目描述（可选）" />
          </Form.Item>

          <Form.Item
            label="比赛类型"
            name="competition_type"
            rules={[{ required: true, message: "请选择比赛类型" }]}
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
                <Select>
                  <Option value={1}>男子</Option>
                  <Option value={2}>女子</Option>
                  <Option value={3}>不限</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="成绩单位"
                name="unit"
                rules={[{ required: true, message: "请输入成绩单位" }]}
              >
                <Input placeholder="如：秒、米、分等" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="排名方式"
            name="ranking_mode"
            rules={[{ required: true, message: "请选择排名方式" }]}
          >
            <Radio.Group>
              <Radio value="higher_first">
                分数越高排名越好（适用于跳高、跳远、投掷等项目）
              </Radio>
              <Radio value="lower_first">
                分数越低排名越好（适用于跑步、时间类等项目）
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="开始时间" name="start_time">
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  placeholder="选择开始时间"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="结束时间" name="end_time">
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  placeholder="选择结束时间"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="项目图片" name="image">
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={() => false}
              accept="image/*"
            >
              <div>
                <UploadOutlined />
                <div style={{ marginTop: 8 }}>上传图片</div>
              </div>
            </Upload>
          </Form.Item>

          <Form.Item style={{ textAlign: "right", marginBottom: 0 }}>
            <Space>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingCompetition ? "更新" : "创建"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量操作结果弹窗 */}
      <BatchResults
        visible={batchResultsVisible}
        onClose={() => setBatchResultsVisible(false)}
        results={batchResults}
        title="批量操作结果"
        operationType="操作"
      />

      {/* 批量导入/导出弹窗 */}
      <BatchImportExport
        visible={batchModalVisible}
        onClose={() => setBatchModalVisible(false)}
        sections={[
          {
            title: "比赛数据",
            importTemplate: [
              [
                "名称",
                "描述",
                "比赛类型",
                "排名模式",
                "单位",
                "性别",
                "每班最少报名人数",
                "每班最多报名人数",
                "每班最少女生人数",
                "每班最多女生人数",
                "每班最少男生人数",
                "每班最多男生人数",
                "开始时间",
                "结束时间",
              ],
              [
                "混合接力",
                "男女混合接力",
                "团体",
                "越低越好",
                "秒",
                "不限",
                "4",
                "8",
                "1",
                "4",
                "1",
                "4",
                "2026-05-01 09:00",
                "2026-05-01 10:00",
              ],
              ["跳远", "", "个人", "越高越好", "米", "男", "1", "2", "0", "0", "0", "0", "", ""],
            ],
            importTemplateFilename: "比赛导入模板.xlsx",
            importRequiredFields: [
              "名称",
              "排名模式",
              "单位",
              "性别",
              "每班最少报名人数",
              "每班最多报名人数",
            ],
            importButtonText: "导入比赛",
            onImport: handleBatchImportCompetitions,
            onExport: handleExportCompetitions,
            exportFormatter: (data: any[]) =>
              data.map((c: any) => ({
                名称: c.name,
                描述: c.description,
                比赛类型: c.competition_type === "team" ? "团体" : "个人",
                排名模式:
                  c.ranking_mode === "higher_first" ? "越高越好" : "越低越好",
                单位: c.unit,
                性别: c.gender === 1 ? "男" : c.gender === 2 ? "女" : "不限",
                每班最少报名人数: c.min_participants_per_class,
                每班最多报名人数: c.max_participants_per_class,
                每班最少女生人数: c.gender === 3 ? c.min_female_per_class : "",
                每班最多女生人数: c.gender === 3 ? c.max_female_per_class : "",
                每班最少男生人数: c.gender === 3 ? c.min_male_per_class : "",
                每班最多男生人数: c.gender === 3 ? c.max_male_per_class : "",
                开始时间: c.start_time ? dayjs(c.start_time).format("YYYY-MM-DD HH:mm") : "",
                结束时间: c.end_time ? dayjs(c.end_time).format("YYYY-MM-DD HH:mm") : "",
                状态: c.status,
              })),
            exportFilename: "比赛数据.xlsx",
            exportButtonText: "导出全部比赛",
          },
        ]}
      />

      <BatchProgress
        visible={batchProgressVisible}
        current={batchProgress.current}
        total={batchProgress.total}
        title="批量操作进行中"
      />
    </div>
  );
};

export default CompetitionManagement;
