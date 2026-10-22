import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Typography,
  Popconfirm,
  Dropdown,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { adminClassAPI } from "../../api/admin/student";
import { Class } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { useIsMobile } from "../../utils/mobile";

const { Title } = Typography;
const { Search } = Input;

const ClassManagement: React.FC = () => {
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [searchText, setSearchText] = useState("");

  const fetchClasses = async (page = currentPage, size = pageSize) => {
    setLoading(true);
    const params: { page?: number; page_size?: number; keyword?: string } = {
      page,
      page_size: size,
    };
    if (searchText) {
      params.keyword = searchText;
    }

    const response = await adminClassAPI.getClasses(params);
    handleResp(
      response,
      (data, pagination) => {
        setClasses(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const refreshClasses = () => fetchClasses(currentPage, pageSize);

  useEffect(() => {
    fetchClasses();
  }, [currentPage, pageSize, searchText]);

  const openModal = (cls?: Class) => {
    setEditingClass(cls || null);
    setModalVisible(true);

    if (cls) {
      form.setFieldsValue({
        name: cls.name,
      });
    } else {
      form.resetFields();
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingClass(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    if (editingClass) {
      const response = await adminClassAPI.updateClass(editingClass.id, {
        name: values.name,
      });
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        refreshClasses();
      });
    } else {
      const response = await adminClassAPI.createClass({
        name: values.name,
      });
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        refreshClasses();
      });
    }
  };

  const handleDelete = async (cls: Class) => {
    const response = await adminClassAPI.deleteClass(cls.id);
    handleRespWithNotifySuccess(response, () => {
      refreshClasses();
    });
  };

  const handleAction = (key: string, record: Class) => {
    switch (key) {
      case "edit":
        openModal(record);
        break;
      case "delete":
        Modal.confirm({
          title: "确定删除此班级吗？",
          content: "删除后不可恢复，如果班级下有学生将无法删除",
          onOk: () => handleDelete(record),
        });
        break;
    }
  };

  const columns = [
    {
      title: "班级名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "操作",
      key: "action",
      render: (record: Class) => {
        if (isMobile) {
          return (
            <Dropdown
              menu={{
                items: [
                  { key: "edit", icon: <EditOutlined />, label: "编辑" },
                  {
                    key: "delete",
                    icon: <DeleteOutlined />,
                    label: "删除",
                    danger: true,
                  },
                ],
                onClick: ({ key }) => handleAction(key, record),
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          );
        }

        return (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openModal(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此班级吗？"
              description="删除后不可恢复，如果班级下有学生将无法删除"
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>班级管理</Title>
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: 16,
            }}
          >
            <Search
              placeholder="搜索班级名称"
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
              onClick={() => refreshClasses()}
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
              新增班级
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Search
                placeholder="搜索班级名称"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1); // 搜索时重置到第一页
                }}
                style={{ width: 250 }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => refreshClasses()}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
              >
                新增班级
              </Button>
            </Space>
          </div>
        )}
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={classes}
          rowKey="id"
          loading={loading}
          tableLayout="auto"
          scroll={{ x: "max-content" }}
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

      <Modal
        title={editingClass ? "编辑班级" : "新增班级"}
        open={modalVisible}
        onCancel={closeModal}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="班级名称"
            name="name"
            rules={[
              { required: true, message: "请输入班级名称" },
              { min: 2, message: "班级名称至少2个字符" },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingClass ? "更新" : "创建"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ClassManagement;
