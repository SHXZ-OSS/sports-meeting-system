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
  Row,
  Col,
  Checkbox,
  Dropdown,
  message,
  Select,
  Tag,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  MoreOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import {
  adminUserAPI,
  CreateUserRequest,
  UpdateUserRequest,
} from "../../api/admin/user";
import { User, Class, PERMISSIONS } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
  handleBatchResp,
} from "../../utils/handleResp";
import {
  PERMISSION_OPTIONS,
  getPermissionTags,
  calculatePermissions,
  getSelectedPermissions,
} from "../../utils/permissions";
import { useIsMobile } from "../../utils/mobile";
import BatchImportExport from "../../components/BatchImportExport";
import BatchResults, { BatchResult } from "../../components/BatchResults";
import BatchProgress from "../../components/BatchProgress";

const { Title } = Typography;
const { Search } = Input;

const UserManagement: React.FC = () => {
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchText, setSearchText] = useState("");
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchResultsVisible, setBatchResultsVisible] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [classes, setClasses] = useState<Class[]>([]); // 班级列表
  const [batchProgressVisible, setBatchProgressVisible] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [selectedClassScopes, setSelectedClassScopes] = useState<number[]>([]);

  // 检查是否有不支持scope的权限
  const hasNonScopedPermissions = (permissions: number[]): boolean => {
    const permission = calculatePermissions(permissions);
    const nonScopedPermissions = [
      PERMISSIONS.PROJECT_MANAGEMENT,
      PERMISSIONS.SCORE_INPUT,
      PERMISSIONS.SCORE_REVIEW,
      PERMISSIONS.USER_MANAGEMENT,
      PERMISSIONS.WEBSITE_MANAGEMENT,
    ];
    return nonScopedPermissions.some((perm) => (permission & perm) !== 0);
  };

  // 检查表单是否可以提交
  const isFormValid = (): boolean => {
    // 如果有不支持scope的权限，且选择了班级scope，则不能提交
    if (
      hasNonScopedPermissions(selectedPermissions) &&
      selectedClassScopes.length > 0
    ) {
      return false;
    }
    return true;
  };

  // 获取用户列表
  const fetchUsers = async (
    page = currentPage,
    size = pageSize,
    isSearch = false,
  ) => {
    setLoading(true);

    // 如果是搜索，不指定分页参数以获取全部数据
    if (isSearch) {
      if (searchText) {
        // 搜索时获取所有数据，在前端过滤
        const response = await adminUserAPI.getUsers({});
        handleResp(
          response,
          (data) => {
            // 前端过滤搜索结果
            const filteredData = data.filter(
              (user: { username: string; full_name: string }) =>
                user.username
                  .toLowerCase()
                  .includes(searchText.toLowerCase()) ||
                user.full_name.toLowerCase().includes(searchText.toLowerCase()),
            );
            setUsers(filteredData);
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
    const response = await adminUserAPI.getUsers({
      page,
      page_size: size,
    });
    handleResp(
      response,
      (data, pagination) => {
        setUsers(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const refreshUsers = () =>
    fetchUsers(currentPage, pageSize, Boolean(searchText));

  // 获取班级列表
  const fetchClasses = async () => {
    const response = await adminUserAPI.getClasses();
    handleResp(
      response,
      (data) => {
        setClasses(data);
      },
      () => {
        console.error("获取班级列表失败");
      },
    );
  };

  useEffect(() => {
    if (searchText) {
      fetchUsers(currentPage, pageSize, true);
    } else {
      fetchUsers();
    }
  }, [currentPage, pageSize, searchText]);

  useEffect(() => {
    fetchClasses();
  }, []);

  // 打开创建/编辑模态框
  const openModal = (user?: User) => {
    setEditingUser(user || null);
    setModalVisible(true);

    if (user) {
      const permissions = getSelectedPermissions(user.permission || 0);
      const classScopes = user.class_scopes?.map((c) => c.id) || [];
      setSelectedPermissions(permissions);
      setSelectedClassScopes(classScopes);
      form.setFieldsValue({
        ...user,
        permission: permissions,
        class_scope_ids: classScopes,
      });
    } else {
      setSelectedPermissions([]);
      setSelectedClassScopes([]);
      form.resetFields();
    }
  };

  // 关闭模态框
  const closeModal = () => {
    setModalVisible(false);
    setEditingUser(null);
    setSelectedPermissions([]);
    setSelectedClassScopes([]);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async (values: any) => {
    const permission = calculatePermissions(values.permission || []);

    if (editingUser) {
      // 更新用户
      const updateData: UpdateUserRequest = {
        full_name: values.full_name,
        permission: permission,
        dingtalk_id: values.dingtalk_id || "",
        class_scope_ids: values.class_scope_ids || [],
      };

      if (values.password) {
        updateData.password = values.password;
      }

      const response = await adminUserAPI.updateUser(
        editingUser.id,
        updateData,
      );
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        refreshUsers();
      });
    } else {
      // 创建用户
      const createData: CreateUserRequest = {
        username: values.username,
        password: values.password,
        full_name: values.full_name,
        permission: permission,
        dingtalk_id: values.dingtalk_id || "",
        class_scope_ids: values.class_scope_ids || [],
      };

      const response = await adminUserAPI.createUser(createData);
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        refreshUsers();
      });
    }
  };

  // 删除用户
  const handleDelete = async (user: User) => {
    const response = await adminUserAPI.deleteUser(user.id);
    handleRespWithNotifySuccess(response, () => {
      refreshUsers();
    });
  };

  // 批量导入用户
  const handleBatchImportUsers = async (data: any[]) => {
    const items = data.map((row, index) => ({
      id: index,
      name: row["用户名"] || `第${index + 1}行`,
      request: async () => {
        // 处理班级权限范围：将班级名称转换为班级ID
        let class_scope_ids: number[] = [];
        if (row["班级权限范围"] && row["班级权限范围"].trim()) {
          const classNames = row["班级权限范围"]
            .split(/[,，、]/)
            .map((name: string) => name.trim())
            .filter((name: string) => name);

          // 根据班级名称查找班级ID
          class_scope_ids = classNames
            .map((className: string) => {
              const foundClass = classes.find((c) => c.name === className);
              return foundClass?.id;
            })
            .filter((id: number | undefined): id is number => id !== undefined);
        }

        const response = await adminUserAPI.createUser({
          username: row["用户名"],
          full_name: row["姓名"],
          password: String(row["密码"]),
          permission: Number(row["权限"]) || 0,
          dingtalk_id: row["钉钉ID"] || "",
          class_scope_ids: class_scope_ids,
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
        refreshUsers();
      },
    });

    return results;
  };

  // 导出全部用户
  const handleExportUsers = async () => {
    const response = await adminUserAPI.getUsers({});
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

  // 批量删除用户
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要删除的用户");
      return;
    }

    Modal.confirm({
      title: `确定删除选中的 ${selectedRowKeys.length} 个用户吗？`,
      content: "删除后不可恢复",
      onOk: async () => {
        const selectedUsers = users.filter((u) =>
          selectedRowKeys.includes(u.id),
        );
        const items = selectedUsers.map((user) => ({
          id: user.id,
          name: user.username,
          request: async () => {
            const response = await adminUserAPI.deleteUser(user.id);
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
            refreshUsers();
          },
        });
      },
    });
  };

  const handleAction = (key: string, record: User) => {
    switch (key) {
      case "edit":
        openModal(record);
        break;
      case "delete":
        Modal.confirm({
          title: "确定删除此用户吗？",
          content: "删除后不可恢复",
          onOk: () => handleDelete(record),
        });
        break;
    }
  };

  // 表格列定义
  const columns = [
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value: boolean | React.Key, record: User) =>
        record.username
          .toLowerCase()
          .includes(value.toString().toLowerCase()) ||
        record.full_name.toLowerCase().includes(value.toString().toLowerCase()),
    },
    {
      title: "姓名",
      dataIndex: "full_name",
      key: "full_name",
    },
    {
      title: "权限",
      dataIndex: "permission",
      key: "permission",
      render: (permission: number) => (
        <div
          style={{
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {getPermissionTags(permission)}
        </div>
      ),
    },
    {
      title: "班级权限",
      dataIndex: "class_scopes",
      key: "class_scopes",
      render: (class_scopes?: Class[]) => {
        if (!class_scopes || class_scopes.length === 0) {
          return <Tag color="gold">全局管理员</Tag>;
        }
        return (
          <div style={{ maxWidth: 150 }}>
            {class_scopes.slice(0, 2).map((c) => (
              <Tag key={c.id} color="blue" style={{ marginBottom: 4 }}>
                {c.name}
              </Tag>
            ))}
            {class_scopes.length > 2 && (
              <Tag color="default">+{class_scopes.length - 2}</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "钉钉ID",
      dataIndex: "dingtalk_id",
      key: "dingtalk_id",
      render: (id: string) => (id && id !== "0" ? id : "-"),
    },
    {
      title: "操作",
      key: "action",
      render: (record: User) => {
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
              title="确定删除此用户吗？"
              description="删除后不可恢复"
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
        <Title level={2}>用户管理</Title>
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
              placeholder="搜索用户名或姓名"
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
              onClick={() => refreshUsers()}
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
              新增用户
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
              <Search
                placeholder="搜索用户名或姓名"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1); // 搜索时重置到第一页
                }}
                style={{ width: 250 }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => refreshUsers()}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
              >
                新增用户
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
          dataSource={users}
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

      {/* 创建/编辑用户模态框 */}
      <Modal
        title={editingUser ? "编辑用户" : "新增用户"}
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: "请输入用户名" },
                  { min: 3, message: "用户名至少3个字符" },
                  {
                    pattern: /^[a-zA-Z0-9_]+$/,
                    message: "用户名只能包含字母、数字和下划线",
                  },
                ]}
              >
                <Input disabled={!!editingUser} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="姓名"
                name="full_name"
                rules={[
                  { required: true, message: "请输入姓名" },
                  { min: 2, message: "姓名至少2个字符" },
                ]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="密码"
                name="password"
                rules={
                  editingUser
                    ? [{ min: 6, message: "密码至少6个字符" }]
                    : [
                        { required: true, message: "请输入密码" },
                        { min: 6, message: "密码至少6个字符" },
                      ]
                }
              >
                <Input.Password
                  placeholder={editingUser ? "留空表示不修改" : ""}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="钉钉ID" name="dingtalk_id">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="权限设置" name="permission">
            <Checkbox.Group
              onChange={(checkedValues) =>
                setSelectedPermissions(checkedValues as number[])
              }
            >
              <Row gutter={[16, 16]}>
                {PERMISSION_OPTIONS.map((perm) => (
                  <Col span={24} key={perm.value}>
                    <Checkbox value={perm.value}>
                      <strong>{perm.label}</strong>
                      <br />
                      <span style={{ color: "#666", fontSize: "12px" }}>
                        {perm.description}
                      </span>
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item
            label="班级权限范围"
            name="class_scope_ids"
            tooltip="留空表示全局管理员，可以管理所有班级；选择班级后只能管理指定班级的学生和报名"
          >
            <Select
              mode="multiple"
              placeholder="留空表示全局管理员"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={classes.map((c) => ({
                label: c.name,
                value: c.id,
              }))}
              onChange={(values) => setSelectedClassScopes(values as number[])}
            />
          </Form.Item>

          {hasNonScopedPermissions(selectedPermissions) &&
            selectedClassScopes.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px",
                  backgroundColor: "#fff2e8",
                  border: "1px solid #ffbb96",
                  borderRadius: "4px",
                }}
              >
                <div style={{ color: "#d4380d", fontWeight: "bold" }}>
                  ⚠️ 权限配置冲突
                </div>
                <div style={{ color: "#d4380d", marginTop: 4 }}>
                  选择的权限中包含"项目管理"、"成绩录入"、"成绩审核"、"用户管理"或"网站管理"权限时，不能指定班级权限范围。
                  <br />
                  只有"学生班级管理"和"报名管理"权限支持班级权限范围。
                  <br />
                  请取消班级权限范围选择或调整权限配置。
                </div>
              </div>
            )}

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={closeModal}>取消</Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!isFormValid()}
              >
                {editingUser ? "更新" : "创建"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <BatchImportExport
        visible={batchModalVisible}
        onClose={() => setBatchModalVisible(false)}
        sections={[
          {
            title: "用户数据",
            importTemplate: [
              ["用户名", "姓名", "密码", "权限", "钉钉ID", "班级权限范围"],
              ["admin001", "管理员1", "password123", "1", "", ""],
              [
                "admin002",
                "管理员2",
                "password456",
                "63",
                "",
                "高一1班,高一2班",
              ],
            ],
            importTemplateFilename: "用户导入模板.xlsx",
            importRequiredFields: ["用户名", "姓名", "密码", "权限"],
            importButtonText: "导入用户",
            onImport: handleBatchImportUsers,
            onExport: handleExportUsers,
            exportFormatter: (data: any[]) =>
              data.map((u: any) => ({
                用户名: u.username,
                姓名: u.full_name,
                权限: u.permission,
                钉钉ID: u.dingtalk_id || "",
                班级权限范围:
                  u.class_scopes && u.class_scopes.length > 0
                    ? u.class_scopes.map((c: any) => c.name).join(",")
                    : "",
              })),
            exportFilename: "用户数据.xlsx",
            exportButtonText: "导出全部用户",
          },
        ]}
      />

      <BatchResults
        visible={batchResultsVisible}
        onClose={() => setBatchResultsVisible(false)}
        results={batchResults}
        title="用户导入结果"
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

export default UserManagement;
