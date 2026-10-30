import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  Tabs,
  Space,
  Typography,
  Tag,
  message,
} from "antd";
import {
  TrophyOutlined,
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  TeamOutlined,
  UserOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { pointsAPI } from "../../api/admin/points";
import { adminClassAPI } from "../../api/admin/student";
import { adminRegistrationAPI } from "../../api/admin/registration";
import { useAuth } from "../../contexts/AuthContext";
import {
  handleBatchResp,
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { getRankingDisplayForTable } from "../../utils/competition";
import { chineseSort } from "../../utils/sort";
import { PERMISSIONS } from "../../types";
import type {
  ClassPointsSummary,
  StudentPointsSummary,
  PointDetail,
  Class,
  Competition,
} from "../../types";
import CertificateExport from "../../components/CertificateExport";

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface DeductTarget {
  classId: number;
  className: string;
  competitions: string[];
  missingCount: number;
  deducted: boolean;
}

const PointsManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const canDeductUnderfilled =
    hasPermission(PERMISSIONS.PROJECT_MANAGEMENT) &&
    hasPermission(PERMISSIONS.REGISTRATION_MANAGEMENT);

  const [form] = Form.useForm();
  const [classPoints, setClassPoints] = useState<ClassPointsSummary[]>([]);
  const [studentPoints, setStudentPoints] = useState<StudentPointsSummary[]>(
    [],
  );
  const [classLoading, setClassLoading] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<PointDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailType, setDetailType] = useState<"class" | "student">("class"); // 标识当前查看的是班级还是学生明细
  const [classes, setClasses] = useState<Class[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [certificateModalVisible, setCertificateModalVisible] = useState(false);
  const [deductModalVisible, setDeductModalVisible] = useState(false);
  const [deductTargets, setDeductTargets] = useState<DeductTarget[]>([]);
  const [deductPoints, setDeductPoints] = useState(1);
  const [deductLoading, setDeductLoading] = useState(false);
  const [deductPreviewLoading, setDeductPreviewLoading] = useState(false);

  // 获取班级列表
  const fetchClasses = async () => {
    const data = await adminClassAPI.getClasses();
    handleResp(data, (data) => {
      setClasses(data || []);
    });
  };

  // 获取班级得分汇总
  const fetchClassPoints = async () => {
    setClassLoading(true);
    const data = await pointsAPI.getClassPointsSummary();
    handleResp(
      data,
      (data) => {
        setClassPoints(data || []);
        setClassLoading(false);
      },
      () => {
        setClassLoading(false);
      },
    );
  };

  // 获取学生得分汇总
  const fetchStudentPoints = async () => {
    setStudentLoading(true);
    const data = await pointsAPI.getStudentPointsSummary();
    handleResp(
      data,
      (data) => {
        setStudentPoints(data || []);
        setStudentLoading(false);
      },
      () => {
        setStudentLoading(false);
      },
    );
  };

  // 查看班级得分明细
  const viewClassDetails = async (classId: number, className: string) => {
    setDetailTitle(`${className} - 得分明细`);
    setDetailType("class");
    setDetailModalVisible(true);
    setDetailsLoading(true);
    const data = await pointsAPI.getClassPointDetails(classId);
    handleResp(
      data,
      (data) => {
        setSelectedDetails(data || []);
        setDetailsLoading(false);
      },
      () => {
        setDetailsLoading(false);
      },
    );
  };

  // 查看学生得分明细
  const viewStudentDetails = async (studentId: number, studentName: string) => {
    setDetailTitle(`${studentName} - 得分明细`);
    setDetailType("student");
    setDetailModalVisible(true);
    setDetailsLoading(true);
    const data = await pointsAPI.getStudentPointDetails(studentId);
    handleResp(
      data,
      (data) => {
        setSelectedDetails(data || []);
        setDetailsLoading(false);
      },
      () => {
        setDetailsLoading(false);
      },
    );
  };

  // 添加自定义得分
  const handleAddCustomPoints = async (values: any) => {
    const data = await pointsAPI.addCustomPointsToClass(
      values.class_id,
      values.points,
      values.reason,
    );
    handleRespWithNotifySuccess(data, () => {
      setAddModalVisible(false);
      form.resetFields();
      fetchClassPoints();
    });
  };

  // 删除自定义得分
  const handleDeleteCustomPoint = async (pointId: number) => {
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除这条自定义得分记录吗？",
      onOk: async () => {
        const data = await pointsAPI.deleteCustomPoint(pointId);
        handleRespWithNotifySuccess(data, () => {
          setDetailModalVisible(false);
          fetchClassPoints();
        });
      },
    });
  };

  // 打开报名未满扣分预览：复用报名检查清单，前端汇总未满班级
  const openDeductModal = async () => {
    setDeductPreviewLoading(true);
    try {
      const [checklistResponse, competitionsResponse, classesResponse] =
        await Promise.all([
          adminRegistrationAPI.getCompetitionChecklist(),
          adminRegistrationAPI.getCompetitions({
            status:
              "approved,checking_in,in_progress,pending_score_review,completed",
          }),
          adminRegistrationAPI.getClasses(),
        ]);

      let checklist: Array<{
        competition_id: number;
        competition_name: string;
        status: "ok" | "warning" | "error";
        message: string;
      }> = [];
      let competitions: Competition[] = [];
      let classList: Class[] = [];

      handleResp(checklistResponse, (data) => {
        checklist = data || [];
      });
      handleResp(competitionsResponse, (data) => {
        competitions = data || [];
      });
      handleResp(classesResponse, (data) => {
        classList = data || [];
      });

      const activeCompetitionIDs = new Set(
        competitions
          .filter((competition) => competition.competition_type !== "school")
          .map((competition) => competition.id),
      );
      const classIDByName = new Map(classList.map((cls) => [cls.name, cls.id]));

      const grouped = new Map<
        string,
        {
          classId: number;
          className: string;
          competitions: Set<string>;
          missingCount: number;
        }
      >();
      checklist.forEach((issue) => {
        if (issue.status !== "error" || !issue.message.includes("不足")) {
          return;
        }
        if (!activeCompetitionIDs.has(issue.competition_id)) {
          return;
        }
        const match = issue.message.match(
          /^班级 (.+?) (报名人数|女生人数|男生人数)不足（(\d+)\/(\d+)）$/,
        );
        if (!match) {
          return;
        }
        const className = match[1];
        const current = Number(match[3]);
        const min = Number(match[4]);
        const missing = Math.max(0, min - current);
        const classId = classIDByName.get(className);
        if (!classId) {
          return;
        }
        const item = grouped.get(className) ?? {
          classId,
          className,
          competitions: new Set<string>(),
          missingCount: 0,
        };
        item.competitions.add(issue.competition_name);
        item.missingCount += missing;
        grouped.set(className, item);
      });

      const targets = await Promise.all(
        Array.from(grouped.values()).map(async (item) => {
          const detailsResponse = await pointsAPI.getClassPointDetails(
            item.classId,
          );
          let deducted = false;
          handleResp(detailsResponse, (details) => {
            deducted = (details || []).some(
              (detail) =>
                detail.point_type === "custom" &&
                (detail.reason ?? "").startsWith("[报名未满扣分]"),
            );
          });
          return {
            classId: item.classId,
            className: item.className,
            competitions: Array.from(item.competitions),
            missingCount: item.missingCount,
            deducted,
          };
        }),
      );

      if (targets.length === 0) {
        message.success("没有报名未满的班级");
        return;
      }

      setDeductTargets(targets);
      setDeductPoints(1);
      setDeductModalVisible(true);
    } finally {
      setDeductPreviewLoading(false);
    }
  };

  // 为报名未满的班级一键扣分：按缺额人数 × 每人扣分逐班调用现成的自定义得分接口
  const handleDeductUnderfilled = async () => {
    if (deductPoints <= 0) {
      message.warning("每人扣分必须大于 0");
      return;
    }

    const targets = deductTargets.filter(
      (target) => !target.deducted && target.missingCount > 0,
    );
    if (targets.length === 0) {
      message.info("所有未满班级都已扣过分");
      return;
    }

    setDeductLoading(true);
    try {
      const items = targets.map((target) => ({
        id: target.classId,
        name: target.className,
        request: async () => {
          const reason =
            `[报名未满扣分] 缺${target.missingCount}人：${target.competitions.join(
              "、",
            )}`.slice(0, 500);
          const response = await pointsAPI.addCustomPointsToClass(
            target.classId,
            -Math.abs(deductPoints) * target.missingCount,
            reason,
          );
          if (response.code !== 200) {
            throw new Error(response.message);
          }
          return response.data;
        },
      }));

      const results = await handleBatchResp(items);
      const failed = results.filter((result) => !result.success);
      setDeductModalVisible(false);
      fetchClassPoints();

      if (failed.length > 0) {
        message.warning(
          `已完成 ${results.length - failed.length} 个班级，${
            failed.length
          } 个失败：${failed.map((result) => result.name).join("、")}`,
        );
      } else {
        message.success(`已为 ${targets.length} 个班级扣分`);
      }
    } finally {
      setDeductLoading(false);
    }
  };

  // 导出团体得分表格
  const handleExportClassPoints = async () => {
    setExportLoading(true);
    try {
      // 获取所有班级得分汇总
      const summaryResponse = await pointsAPI.getClassPointsSummary();
      let classSummaries: ClassPointsSummary[] = [];
      await new Promise<void>((resolve) => {
        handleResp(
          summaryResponse,
          (data) => {
            classSummaries = data;
            resolve();
          },
          () => {
            resolve();
          },
        );
      });

      if (classSummaries.length === 0) {
        throw new Error("没有班级得分数据");
      }

      // 按班级名排序
      classSummaries.sort((a, b) => chineseSort(a.class_name, b.class_name));

      // 获取所有班级的得分明细
      const classDetailsMap = new Map<
        number,
        { details: PointDetail[]; summary: ClassPointsSummary }
      >();

      for (const summary of classSummaries) {
        const detailsResponse = await pointsAPI.getClassPointDetails(
          summary.class_id,
        );
        let details: PointDetail[] = [];
        await new Promise<void>((resolve) => {
          handleResp(
            detailsResponse,
            (data) => {
              details = data;
              resolve();
            },
            () => {
              resolve();
            },
          );
        });

        classDetailsMap.set(summary.class_id, { details, summary });
      }

      // 收集所有个人项目和团体项目名称
      const individualProjects = new Set<string>();
      const teamProjects = new Set<string>();

      classDetailsMap.forEach(({ details }) => {
        details.forEach((detail) => {
          if (detail.point_type === "ranking") {
            if (detail.competition_type === "individual") {
              individualProjects.add(detail.competition_name);
            } else if (
              detail.competition_type === "team" ||
              detail.competition_type === "school"
            ) {
              teamProjects.add(detail.competition_name);
            }
          }
        });
      });

      const individualProjectList = Array.from(individualProjects);
      const teamProjectList = Array.from(teamProjects);

      // 动态导入 excel 工具
      const { exportExcel, createMerge } = await import("../../utils/excel");

      // 构建表格数据
      const sheetData: any[][] = [];
      const merges: any[] = [];

      // 构建第一行表头（大类）
      const headerRow1 = [
        "班级",
        ...Array(individualProjectList.length + 1).fill("个人项目"),
        ...Array(teamProjectList.length).fill("团体/全校性项目"),
        "班级总分",
        "班级名次",
      ];
      sheetData.push(headerRow1);

      // 构建第二行表头（具体项目名）
      const headerRow2 = [
        "", // 班级列在第一行
        ...individualProjectList,
        "个人项目总分",
        ...teamProjectList,
        "", // 班级总分在第一行
        "", // 班级名次在第一行
      ];
      sheetData.push(headerRow2);

      // 创建合并单元格
      // 班级列：合并第1-2行，第1列
      merges.push(createMerge(0, 0, 1, 0, true, true));

      // 个人项目：合并第1行，从第2列到个人项目总分列
      const individualStartCol = 1;
      const individualEndCol =
        individualStartCol + individualProjectList.length;
      merges.push(
        createMerge(0, individualStartCol, 0, individualEndCol, true, true),
      );

      // 团体项目：合并第1行，团体项目列
      const teamStartCol = individualEndCol + 1;
      const teamEndCol = teamStartCol + teamProjectList.length - 1;
      if (teamProjectList.length > 0) {
        merges.push(createMerge(0, teamStartCol, 0, teamEndCol, true, true));
      }

      // 班级总分：合并第1-2行
      const totalCol = teamEndCol + 1;
      merges.push(createMerge(0, totalCol, 1, totalCol, true, true));

      // 班级名次：合并第1-2行
      const rankCol = totalCol + 1;
      merges.push(createMerge(0, rankCol, 1, rankCol, true, true));

      // 构建数据行
      classSummaries.forEach((summary) => {
        const classData = classDetailsMap.get(summary.class_id);
        if (!classData) return;

        const row: any[] = [summary.class_name];

        // 创建得分映射（项目名 -> 得分）
        const pointsMap = new Map<string, number>();
        classData.details.forEach((detail) => {
          if (detail.point_type === "ranking") {
            const existingPoints = pointsMap.get(detail.competition_name) || 0;
            pointsMap.set(
              detail.competition_name,
              existingPoints + detail.points,
            );
          }
        });

        // 个人项目得分
        let individualTotal = 0;
        individualProjectList.forEach((project) => {
          const points = pointsMap.get(project) || 0;
          individualTotal += points;
          row.push(points > 0 ? points : "");
        });

        // 个人项目总分
        row.push(individualTotal > 0 ? individualTotal : "");

        // 团体项目得分
        teamProjectList.forEach((project) => {
          const points = pointsMap.get(project) || 0;
          row.push(points > 0 ? points : "");
        });

        // 班级总分
        row.push(summary.total_points);

        // 班级名次
        row.push(summary.rank);

        sheetData.push(row);
      });

      const colWidths = [
        10, // 班级
        ...individualProjectList.map(() => 12),
        12, // 个人项目总分
        ...teamProjectList.map(() => 12),
        10, // 班级总分
        8, // 班级名次
      ];

      const filename = `团体得分_${new Date().toLocaleDateString()}.xlsx`;
      exportExcel(
        [
          {
            name: "团体得分",
            data: sheetData,
            merges: merges,
            colWidths: colWidths,
          },
        ],
        filename,
      );

      message.success("导出成功");
    } catch (error) {
      message.error("导出失败：" + (error as Error).message);
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    fetchClassPoints();
    fetchStudentPoints();
    fetchClasses();
  }, []);

  // 班级得分表格列
  const classColumns = [
    {
      title: "排名",
      dataIndex: "rank",
      key: "rank",
      width: 80,
      render: (rank: number) => getRankingDisplayForTable(rank),
    },
    {
      title: "班级",
      dataIndex: "class_name",
      key: "class_name",
    },
    {
      title: "总分",
      dataIndex: "total_points",
      key: "total_points",
      render: (points: number) => points.toFixed(1),
      sorter: (a: ClassPointsSummary, b: ClassPointsSummary) =>
        a.total_points - b.total_points,
    },
    {
      title: "排名得分",
      dataIndex: "ranking_points",
      key: "ranking_points",
      render: (points: number) => points.toFixed(1),
    },
    {
      title: "自定义得分",
      dataIndex: "custom_points",
      key: "custom_points",
      render: (points: number) => (
        <span style={{ color: points < 0 ? "#ff4d4f" : undefined }}>
          {points.toFixed(1)}
        </span>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_: any, record: ClassPointsSummary) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => viewClassDetails(record.class_id, record.class_name)}
        >
          查看明细
        </Button>
      ),
    },
  ];

  // 学生得分表格列
  const studentColumns = [
    {
      title: "排名",
      dataIndex: "rank",
      key: "rank",
      width: 80,
      render: (rank: number) => getRankingDisplayForTable(rank),
    },
    {
      title: "姓名",
      dataIndex: "student_name",
      key: "student_name",
    },
    {
      title: "班级",
      dataIndex: "class_name",
      key: "class_name",
    },
    {
      title: "总分",
      dataIndex: "total_points",
      key: "total_points",
      render: (points: number) => points.toFixed(1),
      sorter: (a: StudentPointsSummary, b: StudentPointsSummary) =>
        a.total_points - b.total_points,
    },
    {
      title: "排名得分",
      dataIndex: "ranking_points",
      key: "ranking_points",
      render: (points: number) => points.toFixed(1),
    },
    {
      title: "操作",
      key: "action",
      render: (_: any, record: StudentPointsSummary) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() =>
            viewStudentDetails(record.student_id, record.student_name)
          }
        >
          查看明细
        </Button>
      ),
    },
  ];

  // 得分明细表格列（根据类型动态生成）
  const getDetailColumns = (): any[] => {
    const baseColumns: any[] = [
      {
        title: "比赛项目",
        dataIndex: "competition_name",
        key: "competition_name",
      },
      {
        title: "得分",
        dataIndex: "points",
        key: "points",
        render: (points: number) => (
          <Text strong style={{ color: points < 0 ? "#ff4d4f" : "#52c41a" }}>
            {points > 0 ? "+" : ""}
            {points.toFixed(1)}
          </Text>
        ),
      },
      {
        title: "类型",
        dataIndex: "point_type",
        key: "point_type",
        render: (type: string) =>
          type === "ranking" ? (
            <Tag color="blue">排名得分</Tag>
          ) : (
            <Tag color="orange">自定义得分</Tag>
          ),
      },
      {
        title: "排名",
        dataIndex: "ranking",
        key: "ranking",
        render: (ranking?: number) => ranking || "-",
      },
      {
        title: "原因",
        dataIndex: "reason",
        key: "reason",
        render: (reason?: string) => reason || "-",
      },
    ];

    // 班级得分明细才显示"创建者"和"操作"列
    if (detailType === "class") {
      baseColumns.push(
        {
          title: "创建者",
          dataIndex: "creator_name",
          key: "creator_name",
          render: (name?: string) => name || "-",
        },
        {
          title: "操作",
          key: "action",
          render: (_: any, record: PointDetail) =>
            record.point_type === "custom" ? (
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteCustomPoint(record.id)}
              >
                删除
              </Button>
            ) : null,
        },
      );
    }

    return baseColumns;
  };

  return (
    <div>
      <Title level={2}>
        <TrophyOutlined /> 得分管理
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalVisible(true)}
          >
            添加自定义得分
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            onClick={handleExportClassPoints}
            loading={exportLoading}
          >
            导出团体得分
          </Button>
          {canDeductUnderfilled && (
            <Button
              danger
              icon={<MinusCircleOutlined />}
              onClick={openDeductModal}
              loading={deductPreviewLoading}
            >
              为报名未满班级扣分
            </Button>
          )}
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => setCertificateModalVisible(true)}
            loading={classLoading}
          >
            导出奖状
          </Button>
        </Space>
      </Card>

      <Tabs defaultActiveKey="class">
        <TabPane
          tab={
            <span>
              <TeamOutlined />
              班级分数榜
            </span>
          }
          key="class"
        >
          <Card>
            <Table
              columns={classColumns}
              dataSource={classPoints}
              loading={classLoading}
              rowKey="class_id"
              pagination={{ pageSize: 20 }}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <UserOutlined />
              个人分数榜
            </span>
          }
          key="student"
        >
          <Card>
            <Table
              columns={studentColumns}
              dataSource={studentPoints}
              loading={studentLoading}
              rowKey="student_id"
              pagination={{ pageSize: 20 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* 添加自定义得分Modal */}
      <Modal
        title="添加自定义得分"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleAddCustomPoints}>
          <Form.Item
            label="班级"
            name="class_id"
            rules={[{ required: true, message: "请选择班级" }]}
          >
            <Select placeholder="请选择班级">
              {classes.map((cls) => (
                <Select.Option key={cls.id} value={cls.id}>
                  {cls.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="得分"
            name="points"
            rules={[{ required: true, message: "请输入得分" }]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="请输入得分（可为负数）"
            />
          </Form.Item>

          <Form.Item
            label="原因"
            name="reason"
            rules={[{ required: true, message: "请输入原因" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="例如：开幕式表演、纪律加分等"
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button
                onClick={() => {
                  setAddModalVisible(false);
                  form.resetFields();
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确定
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 报名未满一键扣分Modal */}
      <Modal
        title="为报名未满班级扣分"
        open={deductModalVisible}
        onCancel={() => setDeductModalVisible(false)}
        width={760}
        footer={
          <Space>
            <Button onClick={() => setDeductModalVisible(false)}>取消</Button>
            <Button
              danger
              type="primary"
              loading={deductLoading}
              onClick={handleDeductUnderfilled}
            >
              确认扣分
            </Button>
          </Space>
        }
      >
        <div
          style={{
            marginBottom: 12,
            color: "var(--sm-text-secondary)",
            fontSize: 13,
          }}
        >
          按缺额人数扣分：每人扣 N 分，班级扣除“缺额人数 × 每人扣分”。
          已扣分的班级会自动跳过，未满项目会写入扣分原因。
        </div>
        <Space style={{ marginBottom: 12 }}>
          <span>每人扣分：</span>
          <InputNumber
            min={0.5}
            step={0.5}
            value={deductPoints}
            onChange={(value) => setDeductPoints(value ?? 1)}
          />
        </Space>
        <Table
          size="small"
          rowKey="classId"
          dataSource={deductTargets}
          pagination={false}
          columns={[
            {
              title: "班级",
              dataIndex: "className",
              key: "className",
              width: 110,
            },
            {
              title: "未满项目",
              key: "competitions",
              render: (_: unknown, record: DeductTarget) =>
                record.competitions.join("、"),
            },
            {
              title: "缺额人数",
              key: "missingCount",
              width: 90,
              render: (_: unknown, record: DeductTarget) =>
                `缺 ${record.missingCount} 人`,
            },
            {
              title: "本次扣分",
              key: "deduction",
              width: 90,
              render: (_: unknown, record: DeductTarget) =>
                record.deducted
                  ? "—"
                  : `-${(record.missingCount * deductPoints).toFixed(1)}`,
            },
            {
              title: "状态",
              key: "status",
              width: 130,
              render: (_: unknown, record: DeductTarget) =>
                record.deducted ? (
                  <Tag color="default">已扣分，将跳过</Tag>
                ) : (
                  <Tag color="orange">待扣分</Tag>
                ),
            },
          ]}
        />
      </Modal>

      {/* 得分明细Modal */}
      <Modal
        title={detailTitle}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={getDetailColumns()}
          dataSource={selectedDetails}
          loading={detailsLoading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>

      {/* 奖状导出模态框 */}
      <CertificateExport
        visible={certificateModalVisible}
        onClose={() => setCertificateModalVisible(false)}
        classRankings={classPoints}
      />
    </div>
  );
};

export default PointsManagement;
