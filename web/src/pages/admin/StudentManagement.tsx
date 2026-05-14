import { useState, useEffect } from "react";
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
  AutoComplete,
  Typography,
  Popconfirm,
  Dropdown,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  KeyOutlined,
  MoreOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import { adminStudentAPI, adminClassAPI } from "../../api/admin/student";
import { Student, Class } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
  handleBatchResp,
} from "../../utils/handleResp";
import { getGenderText } from "../../utils/competition";
import { useIsMobile } from "../../utils/mobile";
import BatchImportExport from "../../components/BatchImportExport";
import BatchResults, { BatchResult } from "../../components/BatchResults";
import BatchProgress from "../../components/BatchProgress";

const { Title } = Typography;
const { Search } = Input;
const { Option } = Select;

const StudentManagement: React.FC = () => {
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState("");
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchResultsVisible, setBatchResultsVisible] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchProgressVisible, setBatchProgressVisible] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // 获取学生列表
  const fetchStudents = async (
    page = currentPage,
    size = pageSize,
    isSearch = false,
  ) => {
    setLoading(true);
    const params: any = {};

    // 如果是搜索，不指定分页参数以获取全部数据
    if (isSearch) {
      if (searchText) {
        // 搜索时获取所有数据，在前端过滤
        const response = await adminStudentAPI.getStudents({
          class_id: classFilter || undefined,
        });
        handleResp(
          response,
          (data) => {
            // 前端过滤搜索结果
            const filteredData = data.filter(
              (student: any) =>
                student.full_name
                  .toLowerCase()
                  .includes(searchText.toLowerCase()) ||
                student.username
                  .toLowerCase()
                  .includes(searchText.toLowerCase()),
            );
            setStudents(filteredData);
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
    if (classFilter) params.class_id = classFilter;

    const response = await adminStudentAPI.getStudents(params);
    handleResp(
      response,
      (data, pagination) => {
        setStudents(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
  };

  const refreshStudents = () =>
    fetchStudents(currentPage, pageSize, Boolean(searchText));

  // 获取班级列表
  const fetchClasses = async () => {
    const data = await adminClassAPI.getClasses();
    handleResp(data, (data) => {
      setClasses(data || []);
    });
  };

  useEffect(() => {
    if (searchText) {
      fetchStudents(currentPage, pageSize, true);
    } else {
      fetchStudents();
    }
    fetchClasses();
  }, [currentPage, pageSize, classFilter, searchText]);

  // 重置学生密码
  const handleResetPassword = async (student: Student) => {
    const response = await adminStudentAPI.resetStudentPassword(student.id);
    handleRespWithNotifySuccess(response, (data) => {
      Modal.success({
        title: "密码重置成功",
        content: (
          <div>
            <p>
              <strong>{student.full_name}</strong> 的新密码：
            </p>
            <p
              style={{
                backgroundColor: "#f5f5f5",
                padding: "8px",
                fontFamily: "monospace",
                fontSize: "16px",
                textAlign: "center",
              }}
            >
              {data?.new_password}
            </p>
            <p style={{ color: "#999", fontSize: "12px" }}>
              请妥善保管并及时告知学生
            </p>
          </div>
        ),
      });
    });
  };

  // 打开创建/编辑模态框
  const openModal = (student?: Student) => {
    setEditingStudent(student || null);
    setModalVisible(true);

    if (student) {
      form.setFieldsValue({
        full_name: student.full_name,
        class_name: student.class_name,
        gender: student.gender,
        dingtalk_id: student.dingtalk_id === "0" ? "" : student.dingtalk_id,
      });
    } else {
      form.resetFields();
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingStudent(null);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async (values: any) => {
    if (editingStudent) {
      const response = await adminStudentAPI.updateStudent(editingStudent.id, {
        full_name: values.full_name,
        class_name: values.class_name,
        gender: values.gender,
        dingtalk_id: values.dingtalk_id || "",
      });
      handleRespWithNotifySuccess(response, () => {
        closeModal();
        refreshStudents();
        fetchClasses();
      });
    } else {
      const response = await adminStudentAPI.createStudent({
        full_name: values.full_name,
        class_name: values.class_name,
        gender: values.gender,
        dingtalk_id: values.dingtalk_id || "",
      });
      handleRespWithNotifySuccess(response, (data) => {
        Modal.success({
          title: "学生创建成功",
          content: (
            <div>
              <p>
                <strong>用户名：</strong>
                {data?.student.username}
              </p>
              <p>
                <strong>初始密码：</strong>
              </p>
              <p
                style={{
                  backgroundColor: "#f5f5f5",
                  padding: "8px",
                  fontFamily: "monospace",
                  fontSize: "16px",
                  textAlign: "center",
                }}
              >
                {data?.password}
              </p>
              <p style={{ color: "#999", fontSize: "12px" }}>
                请妥善保管并及时告知学生
              </p>
            </div>
          ),
        });
        closeModal();
        refreshStudents();
        fetchClasses(); // 可能创建了新班级
      });
    }
  };

  // 删除学生
  const handleDelete = async (student: Student) => {
    const response = await adminStudentAPI.deleteStudent(student.id);
    handleRespWithNotifySuccess(response, () => {
      refreshStudents();
    });
  };

  // 批量导入学生
  const handleBatchImportStudents = async (data: any[]) => {
    const genderMap: { [key: string]: number } = {
      男: 1,
      女: 2,
    };

    // 用于收集创建成功的学生信息
    const createdStudents: any[] = [];

    const items = data.map((row, index) => ({
      id: index,
      name: row["姓名"] || `第${index + 1}行`,
      request: async () => {
        const response = await adminStudentAPI.createStudent({
          full_name: row["姓名"],
          class_name: row["班级"],
          gender: genderMap[row["性别"]] || 1,
          dingtalk_id: row["钉钉ID"] || "",
        });
        if (response.code !== 200) {
          throw new Error(response.message);
        }
        // 保存创建成功的学生信息
        if (response.data) {
          createdStudents.push({
            full_name: response.data.student.full_name,
            username: response.data.student.username,
            password: response.data.password,
            class_name: response.data.student.class_name,
          });
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
        refreshStudents();
        fetchClasses();
      },
    });

    // 按班级分组密码
    const passwordsByClass = new Map<string, any[]>();
    createdStudents.forEach((studentData) => {
      const className = studentData.class_name;
      if (!passwordsByClass.has(className)) {
        passwordsByClass.set(className, []);
      }
      passwordsByClass.get(className)!.push(studentData);
    });

    // 导出密码文件
    if (passwordsByClass.size > 0) {
      Modal.confirm({
        title: "导入成功",
        content: `成功导入学生数据，是否下载密码文件？`,
        okText: "下载",
        cancelText: "稍后",
        onOk: () => exportPasswordsByClass(passwordsByClass),
      });
    }

    return results;
  };

  // 导出带密码的Excel（按班级分割）
  const exportPasswordsByClass = async (
    passwordsByClass: Map<string, any[]>,
  ) => {
    // 动态导入 excel 工具
    const { exportExcel } = await import("../../utils/excel");

    passwordsByClass.forEach((passwords, className) => {
      // 构建表格数据（二维数组）
      const headers = ["班级", "姓名", "用户名", "密码"];
      const rows = passwords.map((p) => [
        p.class_name,
        p.full_name,
        p.username,
        p.password,
      ]);
      const data = [headers, ...rows];

      // 使用 exportExcel 导出
      exportExcel(
        [
          {
            name: "密码",
            data: data,
            colWidths: [15, 15, 20, 15],
          },
        ],
        `${className}_密码.xlsx`,
      );
    });
    message.success(`已成功导出 ${passwordsByClass.size} 个班级的密码文件`);
  };

  // 导出全部学生
  const handleExportStudents = async () => {
    const response = await adminStudentAPI.getStudents({});
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

  // 批量删除学生
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要删除的学生");
      return;
    }

    Modal.confirm({
      title: `确定删除选中的 ${selectedRowKeys.length} 个学生吗？`,
      content: "删除后不可恢复，相关报名和成绩记录也会被删除",
      onOk: async () => {
        const selectedStudents = students.filter((s) =>
          selectedRowKeys.includes(s.id),
        );
        const items = selectedStudents.map((student) => ({
          id: student.id,
          name: student.full_name,
          request: async () => {
            const response = await adminStudentAPI.deleteStudent(student.id);
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
            refreshStudents();
          },
        });
      },
    });
  };

  // 批量重置密码
  const handleBatchResetPassword = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要重置密码的学生");
      return;
    }

    Modal.confirm({
      title: `确定重置选中的 ${selectedRowKeys.length} 个学生的密码吗？`,
      content: "重置后将生成新密码，请及时导出并告知学生",
      onOk: async () => {
        const selectedStudents = students.filter((s) =>
          selectedRowKeys.includes(s.id),
        );
        const resetPasswordsData: any[] = [];

        const items = selectedStudents.map((student) => ({
          id: student.id,
          name: student.full_name,
          request: async () => {
            const response = await adminStudentAPI.resetStudentPassword(
              student.id,
            );
            if (response.code !== 200) {
              throw new Error(response.message);
            }
            // 保存重置后的密码信息
            if (response.data) {
              resetPasswordsData.push({
                full_name: student.full_name,
                username: student.username,
                password: response.data.new_password,
                class_name: student.class_name,
              });
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
            refreshStudents();

            // 按班级分组密码
            const passwordsByClass = new Map<string, any[]>();
            resetPasswordsData.forEach((studentData) => {
              const className = studentData.class_name;
              if (!passwordsByClass.has(className)) {
                passwordsByClass.set(className, []);
              }
              passwordsByClass.get(className)!.push(studentData);
            });

            // 提示导出密码文件
            if (passwordsByClass.size > 0) {
              Modal.confirm({
                title: "密码重置成功",
                content: `已成功重置 ${resetPasswordsData.length} 个学生的密码，是否下载密码文件？`,
                okText: "下载",
                cancelText: "稍后",
                onOk: () => exportPasswordsByClass(passwordsByClass),
              });
            }
          },
        });
      },
    });
  };

  const handleAction = (key: string, record: Student) => {
    switch (key) {
      case "edit":
        openModal(record);
        break;
      case "reset":
        handleResetPassword(record);
        break;
      case "delete":
        Modal.confirm({
          title: "确定删除此学生吗？",
          content: "删除后不可恢复，相关报名和成绩记录也会被删除",
          onOk: () => handleDelete(record),
        });
        break;
    }
  };

  const columns = [
    {
      title: "姓名",
      dataIndex: "full_name",
      key: "full_name",
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value: boolean | React.Key, record: Student) =>
        record.full_name
          .toLowerCase()
          .includes(value.toString().toLowerCase()) ||
        record.username.toLowerCase().includes(value.toString().toLowerCase()),
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "班级",
      dataIndex: "class_name",
      key: "class_name",
    },
    {
      title: "性别",
      dataIndex: "gender",
      key: "gender",
      render: (gender: number) => (
        <Tag color={gender === 1 ? "blue" : "pink"}>
          {getGenderText(gender).replace("子", "")}
        </Tag>
      ),
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
      render: (record: Student) => {
        if (isMobile) {
          return (
            <Dropdown
              menu={{
                items: [
                  { key: "edit", icon: <EditOutlined />, label: "编辑" },
                  { key: "reset", icon: <KeyOutlined />, label: "重置密码" },
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
            <Button
              size="small"
              icon={<KeyOutlined />}
              onClick={() => handleResetPassword(record)}
            >
              重置密码
            </Button>
            <Popconfirm
              title="确定删除此学生吗？"
              description="删除后不可恢复，相关报名和成绩记录也会被删除"
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
        <Title level={2}>学生管理</Title>
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
              placeholder="筛选班级"
              allowClear
              size="large"
              style={{ width: "100%" }}
              value={classFilter || undefined}
              onChange={setClassFilter}
            >
              {classes?.map((cls) => (
                <Option key={cls.id} value={cls.id}>
                  {cls.name}
                </Option>
              ))}
            </Select>
            <Search
              placeholder="搜索姓名或用户名"
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
              onClick={() => refreshStudents()}
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
              新增学生
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
                    key: "batchReset",
                    icon: <KeyOutlined />,
                    label: "批量重置密码",
                    disabled: selectedRowKeys.length === 0,
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
                  } else if (key === "batchReset") {
                    handleBatchResetPassword();
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
                placeholder="筛选班级"
                allowClear
                style={{ width: 150 }}
                value={classFilter || undefined}
                onChange={setClassFilter}
              >
                {classes?.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name}
                  </Option>
                ))}
              </Select>
              <Search
                placeholder="搜索姓名或用户名"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1); // 搜索时重置到第一页
                }}
                style={{ width: 250 }}
              />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => refreshStudents()}
                  loading={loading}
                >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
              >
                新增学生
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
                      key: "batchReset",
                      icon: <KeyOutlined />,
                      label: "批量重置密码",
                      disabled: selectedRowKeys.length === 0,
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
                    } else if (key === "batchReset") {
                      handleBatchResetPassword();
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
          dataSource={students}
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
                  pageSizeOptions: ["10", "50", "500", "2000"],
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
        title={editingStudent ? "编辑学生" : "新增学生"}
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
            label="姓名"
            name="full_name"
            rules={[
              { required: true, message: "请输入姓名" },
              { min: 2, message: "姓名至少2个字符" },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="班级"
            name="class_name"
            rules={[{ required: true, message: "请选择或输入班级" }]}
          >
            <AutoComplete
              placeholder="选择班级或输入新班级名"
              allowClear
              filterOption={(inputValue, option) =>
                option!.value
                  .toUpperCase()
                  .indexOf(inputValue.toUpperCase()) !== -1
              }
              options={classes?.map((cls) => ({
                value: cls.name,
                label: cls.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="性别"
            name="gender"
            rules={[{ required: true, message: "请选择性别" }]}
          >
            <Select placeholder="选择性别">
              <Option value={1}>男</Option>
              <Option value={2}>女</Option>
            </Select>
          </Form.Item>

          <Form.Item label="钉钉ID" name="dingtalk_id">
            <Input placeholder="可选，用于钉钉登录" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingStudent ? "更新" : "创建"}
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
            title: "学生数据",
            importTemplate: [
              ["姓名", "班级", "性别", "钉钉ID"],
              ["张三", "高一1班", "男", ""],
              ["李四", "高一1班", "女", ""],
            ],
            importTemplateFilename: "学生导入模板.xlsx",
            importRequiredFields: ["姓名", "班级", "性别"],
            importButtonText: "导入学生",
            onImport: handleBatchImportStudents,
            onExport: handleExportStudents,
            exportFormatter: (data: any[]) =>
              data.map((s: any) => ({
                姓名: s.full_name,
                班级: s.class_name,
                性别: s.gender === 1 ? "男" : "女",
                用户名: s.username,
                钉钉ID: s.dingtalk_id === "0" ? "" : s.dingtalk_id,
              })),
            exportFilename: "学生数据.xlsx",
            exportButtonText: "导出全部学生",
          },
        ]}
      />

      <BatchResults
        visible={batchResultsVisible}
        onClose={() => setBatchResultsVisible(false)}
        results={batchResults}
        title="批量操作结果"
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

export default StudentManagement;
