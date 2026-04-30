import { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import {
  Card,
  Button,
  Space,
  Tag,
  Modal,
  Select,
  Typography,
  Popconfirm,
  Input,
  message,
  List,
  Spin,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  CameraOutlined,
  FileExcelOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import html2canvas from "html2canvas";
import { adminRegistrationAPI } from "../../api/admin/registration";
import { Competition, Registration, Class, Student } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
  handleBatchResp,
  BatchRequestItem,
} from "../../utils/handleResp";
import {
  getStatusTag,
  getGenderText,
  getGenderTag,
} from "../../utils/competition";
import { useIsMobile } from "../../utils/mobile";
import BatchResults, { BatchResult } from "../../components/BatchResults";
import BatchProgress from "../../components/BatchProgress";
import RandomDrawModal from "../../components/RandomDrawModal";
import { chineseSort } from "../../utils/sort";

const { Title } = Typography;
const { Search } = Input;
const { Option } = Select;

const RegistrationManagement: React.FC = () => {
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [registrationModalVisible, setRegistrationModalVisible] =
    useState(false);
  const [currentCompetition, setCurrentCompetition] =
    useState<Competition | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [addRegistrationVisible, setAddRegistrationVisible] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [batchRegistrationLoading, setBatchRegistrationLoading] =
    useState(false);
  const [batchResultsVisible, setBatchResultsVisible] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [checklistModalVisible, setChecklistModalVisible] = useState(false);
  const [checklistResults, setChecklistResults] = useState<
    Array<{
      competition_id: number;
      competition_name: string;
      status: "ok" | "warning" | "error";
      message: string;
    }>
  >([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [batchProgressVisible, setBatchProgressVisible] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportClassId, setExportClassId] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMode, setExportMode] = useState<"competition" | "student">(
    "competition",
  );
  const [exportStyle, setExportStyle] = useState<"compact" | "full">("compact");
  const checklistTableRef = useRef<HTMLDivElement>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const [randomDrawVisible, setRandomDrawVisible] = useState(false);
  const [registrationClassFilter, setRegistrationClassFilter] = useState<string | null>(null);

  const fetchCompetitions = async (
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
        const response = await adminRegistrationAPI.getCompetitions({
          status: statusFilter,
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
    else params.status = "approved,pending_score_review,completed";

    const response = await adminRegistrationAPI.getCompetitions(params);
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

  // 获取报名数据
  const fetchRegistrations = async (competitionId: number) => {
    setRegistrationLoading(true);
    const data =
      await adminRegistrationAPI.getCompetitionRegistrations(competitionId);
    handleResp(
      data,
      (data) => {
        setRegistrations(data);
        setRegistrationLoading(false);
      },
      () => {
        setRegistrationLoading(false);
      },
    );
  };

  // 获取班级列表
  const fetchClasses = async () => {
    const data = await adminRegistrationAPI.getClasses();
    handleResp(data, (data) => {
      setClasses(data);
    });
  };

  // 根据班级获取学生列表
  const fetchStudentsByClass = async (classId: number) => {
    const response = await adminRegistrationAPI.getStudents({
      class_id: classId,
    });
    handleResp(response, (data) => {
      setStudents(data);
    });
  };

  // 批量添加报名
  const handleBatchAddRegistration = async () => {
    if (!currentCompetition || selectedStudents.length === 0 || !selectedClass)
      return;

    const comp = currentCompetition;
    const classRegs = registrations.filter((reg) => reg.class_id === selectedClass);
    const selectedObjs = students.filter((s) => selectedStudents.includes(s.id));

    // 总人数检查
    const totalAfterSelection = classRegs.length + selectedStudents.length;
    const minLimit = comp.min_participants_per_class;
    const maxLimit = comp.max_participants_per_class;

    const warnings: string[] = [];

    if (minLimit > 0 && totalAfterSelection < minLimit) {
      warnings.push(`总人数 ${totalAfterSelection} 人，未达到最小要求 ${minLimit} 人`);
    } else if (maxLimit > 0 && totalAfterSelection > maxLimit) {
      warnings.push(`总人数 ${totalAfterSelection} 人，超过最大限制 ${maxLimit} 人`);
    }

    // 混合性别项目：分别检查男女人数
    if (comp.gender === 3) {
      const femaleRegistered = classRegs.filter((r) => r.student_gender === 2).length;
      const maleRegistered = classRegs.filter((r) => r.student_gender === 1).length;
      const femaleSelected = selectedObjs.filter((s) => s.gender === 2).length;
      const maleSelected = selectedObjs.filter((s) => s.gender === 1).length;
      const femaleTotal = femaleRegistered + femaleSelected;
      const maleTotal = maleRegistered + maleSelected;

      if (comp.min_female_per_class > 0 && femaleTotal < comp.min_female_per_class) {
        warnings.push(`女生人数 ${femaleTotal} 人，未达到最小要求 ${comp.min_female_per_class} 人`);
      } else if (comp.max_female_per_class > 0 && femaleTotal > comp.max_female_per_class) {
        warnings.push(`女生人数 ${femaleTotal} 人，超过最大限制 ${comp.max_female_per_class} 人`);
      }

      if (comp.min_male_per_class > 0 && maleTotal < comp.min_male_per_class) {
        warnings.push(`男生人数 ${maleTotal} 人，未达到最小要求 ${comp.min_male_per_class} 人`);
      } else if (comp.max_male_per_class > 0 && maleTotal > comp.max_male_per_class) {
        warnings.push(`男生人数 ${maleTotal} 人，超过最大限制 ${comp.max_male_per_class} 人`);
      }
    }

    if (warnings.length > 0) {
      Modal.confirm({
        title: "报名人数不符合要求",
        content: (
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        ),
        okText: "继续提交",
        cancelText: "取消",
        onOk: () => performBatchRegistration(),
      });
      return;
    }

    performBatchRegistration();
  };

  // 执行批量报名
  const performBatchRegistration = async () => {
    if (!currentCompetition || selectedStudents.length === 0) return;

    setBatchRegistrationLoading(true);

    // 构建批量请求项目
    const batchItems: BatchRequestItem[] = selectedStudents.map((studentId) => {
      const student = students.find((s) => s.id === studentId);
      return {
        id: studentId,
        name: student?.full_name || `学生ID: ${studentId}`,
        request: () =>
          adminRegistrationAPI.registerStudent({
            student_id: studentId,
            competition_id: currentCompetition.id,
          }),
      };
    });

    try {
      setBatchProgressVisible(true);
      setBatchProgress({ current: 0, total: batchItems.length });

      const results = await handleBatchResp(batchItems, {
        onProgress: (current, total) => {
          setBatchProgress({ current, total });
        },
        onComplete: () => {
          setBatchProgressVisible(false);
        },
      });

      // 显示批量操作结果
      setBatchResults(results);
      setBatchResultsVisible(true);

      // 刷新数据
      fetchRegistrations(currentCompetition.id);
      fetchCompetitions(); // 刷新项目列表以更新报名人数

      // 关闭添加报名模态框
      setAddRegistrationVisible(false);
      setSelectedClass(null);
      setStudents([]);
      setSelectedStudents([]);
    } catch (error) {
      setBatchProgressVisible(false);
      message.error(error instanceof Error ? error.message : "批量报名失败");
    } finally {
      setBatchRegistrationLoading(false);
    }
  };

  // 管理员删除报名
  const handleRemoveRegistration = async (registration: Registration) => {
    if (!currentCompetition || !registration.student_id) return;

    const response = await adminRegistrationAPI.unregisterStudent(
      currentCompetition.id,
      registration.student_id,
    );
    handleRespWithNotifySuccess(response, () => {
      if (currentCompetition) {
        fetchRegistrations(currentCompetition.id);
      }
      fetchCompetitions(); // 刷新项目列表以更新报名人数
    });
  };

  // 打开报名管理模态框
  const openRegistrationModal = async (competition: Competition) => {
    setCurrentCompetition(competition);
    setRegistrationModalVisible(true);
    await fetchRegistrations(competition.id);
    await fetchClasses();
  };

  // 关闭报名管理模态框
  const closeRegistrationModal = () => {
    setRegistrationModalVisible(false);
    setCurrentCompetition(null);
    setRegistrations([]);
    setAddRegistrationVisible(false);
    setSelectedClass(null);
    setStudents([]);
    setClasses([]);
    setSelectedStudents([]);
    setRegistrationClassFilter(null);
  };

  // 处理班级选择
  const handleClassSelect = async (classId: number) => {
    setSelectedClass(classId);
    setSelectedStudents([]); // 重置选中的学生
    await fetchStudentsByClass(classId);
  };

  // 处理学生选择
  const handleStudentSelect = (selectedRowKeys: React.Key[]) => {
    setSelectedStudents(selectedRowKeys as number[]);
  };

  // 检查学生是否符合性别要求
  const isStudentGenderMatch = (student: Student) => {
    return (
      !currentCompetition ||
      currentCompetition.gender === 3 ||
      currentCompetition.gender === student.gender
    );
  };

  // 处理报名检查清单
  const handleCheckCompetitions = async () => {
    setChecklistLoading(true);
    setChecklistModalVisible(true);
    const response = await adminRegistrationAPI.getCompetitionChecklist();
    handleResp(
      response,
      (data) => {
        setChecklistResults(data);
        setChecklistLoading(false);
      },
      () => {
        setChecklistLoading(false);
      },
    );
  };

  // 导出报名检查清单为图片
  const handleExportChecklistImage = async () => {
    if (!checklistTableRef.current) {
      message.error("无法获取检查清单内容");
      return;
    }

    setExportingImage(true);
    try {
      const element = checklistTableRef.current;

      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 1.5,
        windowWidth: 840, // 800 + 2*20(padding)
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      // 使用 blob 方式导出
      canvas.toBlob((blob) => {
        if (!blob) {
          message.error("生成图片失败");
          setExportingImage(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `报名检查清单_${new Date().toLocaleDateString().replace(/\//g, "-")}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 释放 URL 对象
        URL.revokeObjectURL(url);

        message.success("导出成功");
        setExportingImage(false);
      }, "image/png");
    } catch (error) {
      console.error("导出图片错误:", error);
      message.error("导出图片失败：" + (error as Error).message);
      setExportingImage(false);
    }
  };

  // 导出报名情况到 Excel
  const handleExportRegistrations = async () => {
    setExportLoading(true);
    try {
      if (exportMode === "competition") {
        await exportByCompetition();
      } else {
        await exportByStudent();
      }
      message.success("导出成功");
      setExportModalVisible(false);
      setExportClassId(null);
    } catch (error) {
      message.error("导出失败：" + (error as Error).message);
    } finally {
      setExportLoading(false);
    }
  };

  // 按比赛导出
  const exportByCompetition = async () => {
    // 获取所有已审核的比赛
    const response = await adminRegistrationAPI.getCompetitions({
      status: "approved,pending_score_review,completed",
    });

    let allCompetitions: Competition[] = [];
    handleResp(response, (data) => {
      allCompetitions = data;
    });

    if (allCompetitions.length === 0) {
      throw new Error("没有可导出的比赛项目");
    }

    // 获取每个比赛的报名数据
    const competitionsWithRegistrations = await Promise.all(
      allCompetitions.map(async (comp) => {
        const regResponse =
          await adminRegistrationAPI.getCompetitionRegistrations(comp.id);
        let registrations: Registration[] = [];
        handleResp(regResponse, (data) => {
          registrations = data;
        });

        // 如果选择了班级，只保留该班级的报名
        if (exportClassId) {
          registrations = registrations.filter(
            (reg) => reg.class_id === exportClassId,
          );
        }

        // 按班级和姓名排序
        registrations.sort((a, b) => {
          const classCompare = chineseSort(a.class_name, b.class_name);
          if (classCompare !== 0) return classCompare;
          return a.student_name.localeCompare(b.student_name, "zh-CN");
        });

        return {
          name: comp.name,
          registrations: registrations.map((reg) => ({
            class_name: reg.class_name,
            student_name: reg.student_name,
          })),
        };
      }),
    );

    // 过滤掉没有报名的比赛
    const filteredCompetitions = competitionsWithRegistrations.filter(
      (comp) => comp.registrations.length > 0,
    );

    if (filteredCompetitions.length === 0) {
      throw new Error("没有报名数据可导出");
    }

    const classFilter = exportClassId
      ? classes.find((c) => c.id === exportClassId)?.name || ""
      : "全部";
    const filename = `报名情况_按比赛_${exportStyle === "compact" ? "紧凑" : "完整"}_${classFilter}_${new Date().toLocaleDateString()}.xlsx`;

    // 动态导入 excel 工具
    const { exportExcel, createMerge } = await import("../../utils/excel");

    if (exportStyle === "compact") {
      // 紧凑模式：所有比赛在一个 Sheet，每行4个人
      const data: any[][] = [];
      const merges: any[] = [];
      let currentRow = 0;

      filteredCompetitions.forEach((competition) => {
        // 添加比赛名称作为标题（合并8列）
        data.push([competition.name, "", "", "", "", "", "", ""]);
        merges.push(createMerge(currentRow, 0, currentRow, 7));
        currentRow++;

        // 对报名数据排序后再添加，每行4个人
        const sortedRegistrations = [...competition.registrations].sort(
          (a, b) => {
            const classCompare = chineseSort(a.class_name, b.class_name);
            if (classCompare !== 0) return classCompare;
            return a.student_name.localeCompare(b.student_name, "zh-CN");
          },
        );

        for (let i = 0; i < sortedRegistrations.length; i += 4) {
          const row: string[] = [];
          for (let j = 0; j < 4; j++) {
            const reg = sortedRegistrations[i + j];
            if (reg) {
              row.push(reg.class_name, reg.student_name);
            } else {
              row.push("", "");
            }
          }
          data.push(row);
          currentRow++;
        }

        // 添加空行分隔不同比赛
        data.push([]);
        currentRow++;
      });

      const colWidths = [10, 10, 10, 10, 10, 10, 10, 10];
      exportExcel(
        [
          {
            name: `报名情况_${classFilter}`,
            data: data,
            merges: merges,
            colWidths: colWidths,
          },
        ],
        filename,
      );
    } else {
      // 完整模式：每个比赛一个 Sheet，一行一个学生
      const sheets = filteredCompetitions.map((competition) => {
        const sheetData: any[][] = [];
        const merges: any[] = [];

        // 添加比赛名称作为标题（合并2列）
        sheetData.push([competition.name, "", "", "", ""]);
        merges.push(createMerge(0, 0, 0, 1));

        // 添加表头
        sheetData.push(["序号", "班级", "姓名", "成绩", "名次"]);

        // 添加学生数据，一行一个学生，自动生成序号
        competition.registrations.forEach((reg, index) => {
          sheetData.push([index + 1, reg.class_name, reg.student_name, "", ""]);
        });

        return {
          name: competition.name.substring(0, 31), // Excel sheet 名称限制31字符
          data: sheetData,
          merges: merges,
          colWidths: [5, 10, 10, 10, 5],
        };
      });

      exportExcel(sheets, filename);
    }
  };

  // 按学生导出
  const exportByStudent = async () => {
    // 按学生导出必须选择班级
    if (!exportClassId) {
      throw new Error("按学生导出时必须选择班级");
    }

    // 获取所有已审核的比赛
    const response = await adminRegistrationAPI.getCompetitions({
      status: "approved,pending_score_review,completed",
    });

    let allCompetitions: Competition[] = [];
    handleResp(response, (data) => {
      allCompetitions = data;
    });

    if (allCompetitions.length === 0) {
      throw new Error("没有可导出的比赛项目");
    }

    // 获取学生列表（指定班级）
    const studentsResponse = await adminRegistrationAPI.getStudents({
      class_id: exportClassId,
    });
    let allStudents: Student[] = [];
    handleResp(studentsResponse, (data) => {
      allStudents = data;
    });

    if (allStudents.length === 0) {
      throw new Error("没有学生数据");
    }

    // 获取当前班级学生的ID集合
    const classStudentIds = new Set(allStudents.map((s) => s.id));

    // 获取所有报名数据（只保留当前班级的学生）
    const allRegistrations: Array<{
      student_id: number;
      competition_name: string;
    }> = [];

    await Promise.all(
      allCompetitions.map(async (comp) => {
        const regResponse =
          await adminRegistrationAPI.getCompetitionRegistrations(comp.id);
        let registrations: Registration[] = [];
        handleResp(regResponse, (data) => {
          registrations = data;
        });

        registrations.forEach((reg) => {
          // 筛选当前班级学生的报名
          if (reg.student_id && classStudentIds.has(reg.student_id)) {
            allRegistrations.push({
              student_id: reg.student_id,
              competition_name: comp.name,
            });
          }
        });
      }),
    );

    // 构建学生报名映射
    const studentRegistrationsMap = new Map<number, string[]>();
    allRegistrations.forEach((reg) => {
      if (!studentRegistrationsMap.has(reg.student_id)) {
        studentRegistrationsMap.set(reg.student_id, []);
      }
      studentRegistrationsMap.get(reg.student_id)?.push(reg.competition_name);
    });

    // 动态导入 excel 工具
    const { exportExcel } = await import("../../utils/excel");

    // 构建 Excel 数据
    const data: any[][] = [];
    const merges: any[] = [];

    // 计算最多报名项目数
    const maxCompetitions = Math.max(
      ...Array.from(studentRegistrationsMap.values()).map(
        (comps) => comps.length,
      ),
      0,
    );

    // 添加学生数据（按班级和姓名排序，包括没有报名项目的学生）
    const sortedStudents = [...allStudents].sort((a, b) => {
      const classCompare = chineseSort(a.class_name, b.class_name);
      if (classCompare !== 0) return classCompare;
      return a.full_name.localeCompare(b.full_name, "zh-CN");
    });

    sortedStudents.forEach((student) => {
      const row: any[] = [student.class_name, student.full_name];
      const competitions = studentRegistrationsMap.get(student.id) || [];

      // 添加报名的项目
      competitions.forEach((compName) => {
        row.push(compName);
      });

      // 填充空列
      for (let i = competitions.length; i < maxCompetitions; i++) {
        row.push("");
      }

      data.push(row);
    });

    // 设置列宽
    const colWidths = [10, 10, ...Array(maxCompetitions).fill(25)];

    const classFilter = exportClassId
      ? classes.find((c) => c.id === exportClassId)?.name || ""
      : "全部";
    const filename = `报名情况_按学生_${classFilter}_${new Date().toLocaleDateString()}.xlsx`;

    exportExcel(
      [
        {
          name: `报名情况_按学生_${classFilter}`,
          data: data,
          merges: merges,
          colWidths: colWidths,
        },
      ],
      filename,
    );
  };

  const renderCompetitionCard = (competition: Competition) => {
    const limitText = (() => {
      const min = competition.min_participants_per_class;
      const max = competition.max_participants_per_class;
      if (min > 0 && max > 0) return `${min}–${max} 人/班`;
      if (min > 0) return `≥${min} 人/班`;
      if (max > 0) return `≤${max} 人/班`;
      return "无人数限制";
    })();

    return (
      <Card
        key={competition.id}
        hoverable
        size="small"
        styles={{ body: { padding: "12px 16px" } }}
        onClick={() => openRegistrationModal(competition)}
        style={{ cursor: "pointer", height: "100%" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15, flex: 1, marginRight: 8 }}>{competition.name}</div>
          {getStatusTag(competition.status)}
        </div>

        {competition.description && (
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{competition.description}</div>
        )}

        {competition.start_time && competition.end_time && (
          <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>
            {dayjs(competition.start_time).format("MM-DD HH:mm")} – {dayjs(competition.end_time).format("HH:mm")}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          <Tag color={competition.competition_type === "team" ? "blue" : "green"} style={{ margin: 0 }}>
            {competition.competition_type === "team" ? "团体" : "个人"}
          </Tag>
          {getGenderTag(competition.gender)}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888" }}>
            {limitText} · 已报名 {competition.registration_count ?? 0} 人
          </span>
          <Button
            type="primary"
            size="small"
            icon={<UserOutlined />}
            onClick={(e) => { e.stopPropagation(); openRegistrationModal(competition); }}
          >
            管理报名
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>报名管理</Title>
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
              <Option value="approved">已审核</Option>
              <Option value="pending_score_review">待审核成绩</Option>
              <Option value="completed">已完成</Option>
            </Select>
            <Search
              placeholder="搜索项目名称"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1);
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
              icon={<CheckCircleOutlined />}
              onClick={handleCheckCompetitions}
              size="large"
              style={{ width: "100%" }}
            >
              报名检查
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={async () => {
                await fetchClasses();
                setExportModalVisible(true);
              }}
              size="large"
              style={{ width: "100%" }}
            >
              导出报名
            </Button>
            <Button
              icon={<TrophyOutlined />}
              onClick={() => setRandomDrawVisible(true)}
              size="large"
              style={{ width: "100%" }}
            >
              随机抽选
            </Button>
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
                <Option value="approved">已审核</Option>
                <Option value="pending_score_review">待审核成绩</Option>
                <Option value="completed">已完成</Option>
              </Select>
              <Search
                placeholder="搜索项目名称"
                allowClear
                onSearch={(value) => {
                  setSearchText(value);
                  setCurrentPage(1);
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
                icon={<CheckCircleOutlined />}
                onClick={handleCheckCompetitions}
              >
                报名检查
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={async () => {
                  await fetchClasses();
                  setExportModalVisible(true);
                }}
              >
                导出报名
              </Button>
              <Button
                icon={<TrophyOutlined />}
                onClick={() => setRandomDrawVisible(true)}
              >
                随机抽选
              </Button>
            </Space>
          </div>
        )}
      </div>

      <Spin spinning={loading}>
        <List
          dataSource={competitions}
          rowKey="id"
          grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 3, xxxl: 3 }}
          renderItem={(competition) => (
            <List.Item style={{ marginBottom: 16 }}>
              {renderCompetitionCard(competition)}
            </List.Item>
          )}
          pagination={
            total > pageSize
              ? {
                  current: currentPage,
                  pageSize,
                  total,
                  simple: isMobile,
                  showSizeChanger: !isMobile,
                  showTotal: isMobile ? undefined : (t) => `共 ${t} 条`,
                  onChange: (page, size) => {
                    setCurrentPage(page);
                    setPageSize(size || 100);
                  },
                }
              : false
          }
          locale={{ emptyText: "暂无比赛项目" }}
        />
      </Spin>

      {/* 报名管理模态框 */}
      <Modal
        title={`${currentCompetition?.name} - 报名管理`}
        open={registrationModalVisible}
        onCancel={closeRegistrationModal}
        footer={null}
        width={1000}
        zIndex={1001}
      >
        <div>
          {currentCompetition?.description && (
            <div style={{ marginBottom: 12, color: "#666", fontSize: 14 }}>
              {currentCompetition.description}
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddRegistrationVisible(true)}
              >
                新增报名
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() =>
                  currentCompetition &&
                  fetchRegistrations(currentCompetition.id)
                }
                loading={registrationLoading}
              >
                刷新
              </Button>
            </Space>
          </div>

          {/* 班级筛选 */}
          {registrations.length > 0 && (() => {
            const classNames = Array.from(new Set(registrations.map((r) => r.class_name)));
            return classNames.length > 1 ? (
              <div style={{ marginBottom: 12 }}>
                <Select
                  placeholder="筛选班级"
                  allowClear
                  style={{ width: 160 }}
                  onChange={(v) => setRegistrationClassFilter(v ?? null)}
                >
                  {classNames.map((c) => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </div>
            ) : null;
          })()}

          <Spin spinning={registrationLoading}>
            {registrations.length === 0 && !registrationLoading ? (
              <div style={{ textAlign: "center", color: "#999", padding: "24px 0" }}>暂无报名数据</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {registrations
                  .filter((r) => !registrationClassFilter || r.class_name === registrationClassFilter)
                  .map((reg) => (
                    <Card
                      key={reg.id}
                      size="small"
                      styles={{ body: { padding: "8px 14px" } }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontWeight: 500, minWidth: 60 }}>{reg.student_name}</span>
                          <span style={{ fontSize: 12, color: "#666" }}>{reg.class_name}</span>
                          {currentCompetition?.gender === 3 && (
                            <span style={{ fontSize: 12, color: "#666" }}>{getGenderText(reg.student_gender)}</span>
                          )}
                          <span style={{ fontSize: 12, color: "#bbb" }}>
                            {isMobile
                              ? dayjs(reg.created_at).format("MM-DD HH:mm")
                              : new Date(reg.created_at).toLocaleString()}
                          </span>
                        </div>
                        <Popconfirm
                          title="确定取消此学生的报名吗？"
                          onConfirm={() => handleRemoveRegistration(reg)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button size="small" danger icon={<DeleteOutlined />}>取消报名</Button>
                        </Popconfirm>
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </Spin>
        </div>
      </Modal>

      {/* 新增报名模态框 */}
      <Modal
        title="新增报名"
        open={addRegistrationVisible}
        onCancel={() => {
          setAddRegistrationVisible(false);
          setSelectedClass(null);
          setStudents([]);
          setSelectedStudents([]);
        }}
        footer={null}
        width={700}
        zIndex={1002}
      >
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>选择班级</strong>
            </div>
            <Select
              style={{ width: "100%" }}
              placeholder="请选择班级"
              value={selectedClass}
              onChange={handleClassSelect}
            >
              {classes.map((cls) => (
                <Option key={cls.id} value={cls.id}>
                  {cls.name}
                </Option>
              ))}
            </Select>
          </div>

          {/* 选择班级后选择学生（个人赛和团体赛统一） */}
          {selectedClass && (
            <div>
              <div style={{ marginBottom: 8 }}>
                <Space>
                  <strong>选择学生</strong>
                  {selectedStudents.length > 0 && (
                    <span style={{ color: "#666" }}>
                      已选择 {selectedStudents.length} 名学生
                    </span>
                  )}
                </Space>
              </div>

              {/* 显示当前班级的报名情况 */}
              {currentCompetition &&
                (() => {
                  const classRegs = registrations.filter(
                    (reg) => reg.class_id === selectedClass,
                  );
                  const classRegistrationCount = classRegs.length;
                  const selectedStudentObjs = students.filter((s) =>
                    selectedStudents.includes(s.id),
                  );
                  const totalAfterSelection =
                    classRegistrationCount + selectedStudents.length;
                  const minLimit =
                    currentCompetition.min_participants_per_class;
                  const maxLimit =
                    currentCompetition.max_participants_per_class;

                  let statusColor = "green";
                  let statusText = "符合要求";

                  if (minLimit > 0 && totalAfterSelection < minLimit) {
                    statusColor = "red";
                    statusText = "未达到最小人数";
                  } else if (maxLimit > 0 && totalAfterSelection > maxLimit) {
                    statusColor = "red";
                    statusText = "超过最大人数";
                  }

                  const limitText =
                    minLimit > 0 && maxLimit > 0
                      ? `${minLimit}-${maxLimit}`
                      : minLimit > 0
                        ? `≥${minLimit}`
                        : maxLimit > 0
                          ? `≤${maxLimit}`
                          : "无限制";

                  // 性别限额（仅混合性别项目）
                  const hasFemaleLimit =
                    currentCompetition.gender === 3 &&
                    (currentCompetition.min_female_per_class > 0 ||
                      currentCompetition.max_female_per_class > 0);
                  const hasMaleLimit =
                    currentCompetition.gender === 3 &&
                    (currentCompetition.min_male_per_class > 0 ||
                      currentCompetition.max_male_per_class > 0);

                  const femaleRegistered = classRegs.filter(
                    (r) => r.student_gender === 2,
                  ).length;
                  const maleRegistered = classRegs.filter(
                    (r) => r.student_gender === 1,
                  ).length;
                  const femaleSelected = selectedStudentObjs.filter(
                    (s) => s.gender === 2,
                  ).length;
                  const maleSelected = selectedStudentObjs.filter(
                    (s) => s.gender === 1,
                  ).length;
                  const femaleTotal = femaleRegistered + femaleSelected;
                  const maleTotal = maleRegistered + maleSelected;

                  const genderLimitText = (min: number, max: number) =>
                    min > 0 && max > 0
                      ? `${min}-${max}`
                      : min > 0
                        ? `≥${min}`
                        : max > 0
                          ? `≤${max}`
                          : "无限制";

                  const femaleStatusColor =
                    hasFemaleLimit &&
                    ((currentCompetition.min_female_per_class > 0 &&
                      femaleTotal < currentCompetition.min_female_per_class) ||
                      (currentCompetition.max_female_per_class > 0 &&
                        femaleTotal > currentCompetition.max_female_per_class))
                      ? "red"
                      : "green";

                  const maleStatusColor =
                    hasMaleLimit &&
                    ((currentCompetition.min_male_per_class > 0 &&
                      maleTotal < currentCompetition.min_male_per_class) ||
                      (currentCompetition.max_male_per_class > 0 &&
                        maleTotal > currentCompetition.max_male_per_class))
                      ? "red"
                      : "green";

                  return (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: "8px 12px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: 4,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 16,
                      }}
                    >
                      <span>
                        <span style={{ color: statusColor, fontWeight: "bold" }}>
                          {statusText}
                        </span>
                        <span style={{ marginLeft: 8, color: "#666" }}>
                          总计 {totalAfterSelection}人/{limitText}
                        </span>
                      </span>
                      {hasFemaleLimit && (
                        <span>
                          <span style={{ color: femaleStatusColor, fontWeight: "bold" }}>
                            女
                          </span>
                          <span style={{ marginLeft: 4, color: "#666" }}>
                            {femaleTotal}人/{genderLimitText(currentCompetition.min_female_per_class, currentCompetition.max_female_per_class)}
                          </span>
                        </span>
                      )}
                      {hasMaleLimit && (
                        <span>
                          <span style={{ color: maleStatusColor, fontWeight: "bold" }}>
                            男
                          </span>
                          <span style={{ marginLeft: 4, color: "#666" }}>
                            {maleTotal}人/{genderLimitText(currentCompetition.min_male_per_class, currentCompetition.max_male_per_class)}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })()}

              {students.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "#666",
                    padding: "16px 0",
                  }}
                >
                  该班级暂无学生
                </div>
              ) : (
                <div>
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    <List
                      grid={{ gutter: 8, xs: 3, sm: 4, md: 4, lg: 4, xl: 4, xxl: 5, xxxl: 6 }}
                      dataSource={students}
                      renderItem={(student) => {
                        const alreadyRegistered = registrations.some((r) => r.student_id === student.id);
                        const genderMatch = isStudentGenderMatch(student);
                        const canSelect = !alreadyRegistered && genderMatch;
                        const isSelected = selectedStudents.includes(student.id);
                        return (
                          <List.Item style={{ marginBottom: 8 }}>
                            <Card
                              size="small"
                              styles={{ body: { padding: "6px 10px" } }}
                              style={{
                                cursor: canSelect ? "pointer" : "not-allowed",
                                opacity: canSelect ? 1 : 0.5,
                                border: isSelected ? "1px solid #1677ff" : undefined,
                                background: isSelected ? "#e6f4ff" : undefined,
                              }}
                              onClick={() => {
                                if (!canSelect) return;
                                handleStudentSelect(
                                  isSelected
                                    ? selectedStudents.filter((id) => id !== student.id)
                                    : [...selectedStudents, student.id],
                                );
                              }}
                            >
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{student.full_name}</div>
                              <div style={{ fontSize: 11, color: "#999" }}>{getGenderText(student.gender)}</div>
                              {alreadyRegistered && <div style={{ fontSize: 11, color: "#52c41a" }}>已报名</div>}
                              {!genderMatch && <div style={{ fontSize: 11, color: "#ff4d4f" }}>性别不符</div>}
                            </Card>
                          </List.Item>
                        );
                      }}
                    />
                  </div>

                  {selectedStudents.length > 0 && (
                    <div
                      style={{
                        marginTop: 16,
                        textAlign: "right",
                        marginBottom: 16,
                      }}
                    >
                      <Space>
                        <Button onClick={() => setSelectedStudents([])}>
                          清空选择
                        </Button>
                        <Button
                          type="primary"
                          loading={batchRegistrationLoading}
                          onClick={handleBatchAddRegistration}
                        >
                          批量报名 ({selectedStudents.length})
                        </Button>
                      </Space>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 批量操作结果弹窗 */}
      <BatchResults
        visible={batchResultsVisible}
        onClose={() => setBatchResultsVisible(false)}
        results={batchResults}
        title="批量报名结果"
        operationType="报名"
        zIndex={1003}
      />

      {/* 报名检查清单弹窗 */}
      <Modal
        title={
          <>
            <CheckCircleOutlined style={{ marginRight: 8 }} />
            报名检查清单
          </>
        }
        open={checklistModalVisible}
        onCancel={() => setChecklistModalVisible(false)}
        footer={[
          <Button
            key="export"
            type="primary"
            icon={<CameraOutlined />}
            loading={exportingImage}
            onClick={handleExportChecklistImage}
          >
            导出图片
          </Button>,
          <Button key="close" onClick={() => setChecklistModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <div ref={checklistTableRef} style={{ padding: "20px" }}>
          <div style={{ marginBottom: 16, fontSize: 18, fontWeight: "bold", textAlign: "center" }}>
            报名检查清单
          </div>
          <Spin spinning={checklistLoading}>
            {(() => {
              // 按项目分组
              const grouped = checklistResults.reduce<Record<number, typeof checklistResults>>((acc, item) => {
                if (!acc[item.competition_id]) acc[item.competition_id] = [];
                acc[item.competition_id].push(item);
                return acc;
              }, {});

              const statusTag = (status: string) => {
                if (status === "ok") return <Tag color="success">符合要求</Tag>;
                if (status === "warning") return <Tag color="warning">警告</Tag>;
                return <Tag color="error">不符合要求</Tag>;
              };

              const borderColor = (s: string) =>
                s === "error" ? "#ff4d4f" : s === "warning" ? "#faad14" : "#52c41a";

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {Object.entries(grouped).map(([compId, items]) => {
                    const worstStatus = items.some((i) => i.status === "error")
                      ? "error"
                      : items.some((i) => i.status === "warning")
                        ? "warning"
                        : "ok";
                    const hasDetails = !(items.length === 1 && items[0].status === "ok");
                    return (
                      <Card
                        key={compId}
                        styles={{ body: { padding: "20px 24px" } }}
                        style={{ borderLeft: `4px solid ${borderColor(worstStatus)}` }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasDetails ? 16 : 0 }}>
                          <Button
                            type="link"
                            style={{ padding: 0, fontWeight: 600, fontSize: 16, height: "auto" }}
                            onClick={async () => {
                              const competition = competitions.find((c) => c.id === Number(compId));
                              if (competition) await openRegistrationModal(competition);
                            }}
                          >
                            {items[0].competition_name}
                          </Button>
                          {statusTag(worstStatus)}
                        </div>
                        {hasDetails && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {items.map((item, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "#555" }}>
                                {statusTag(item.status)}
                                <span>{item.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </Spin>
        </div>
      </Modal>

      <BatchProgress
        visible={batchProgressVisible}
        current={batchProgress.current}
        total={batchProgress.total}
        title="批量报名进行中"
      />

      {/* 导出报名模态框 */}
      <Modal
        title="导出报名情况"
        open={exportModalVisible}
        onCancel={() => {
          setExportModalVisible(false);
          setExportClassId(null);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setExportModalVisible(false);
              setExportClassId(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="export"
            type="primary"
            icon={<ExportOutlined />}
            loading={exportLoading}
            disabled={exportMode === "student" && !exportClassId}
            onClick={handleExportRegistrations}
          >
            导出
          </Button>,
        ]}
      >
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>导出模式</strong>
            </div>
            <Select
              style={{ width: "100%" }}
              value={exportMode}
              onChange={setExportMode}
            >
              <Option value="competition">按比赛</Option>
              <Option value="student">按学生</Option>
            </Select>
          </div>

          {exportMode === "competition" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>导出样式</strong>
              </div>
              <Select
                style={{ width: "100%" }}
                value={exportStyle}
                onChange={setExportStyle}
              >
                <Option value="compact">紧凑模式（一个Sheet，每行4人）</Option>
                <Option value="full">
                  完整模式（每个比赛一个Sheet，一行一人）
                </Option>
              </Select>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>
                选择班级
                {exportMode === "student" && (
                  <span style={{ color: "red" }}>（必选）</span>
                )}
                {exportMode === "competition" && "（可选）"}
              </strong>
            </div>
            <Select
              style={{ width: "100%" }}
              placeholder={
                exportMode === "student" ? "请选择班级" : "不选择则导出全部班级"
              }
              allowClear={exportMode === "competition"}
              value={exportClassId}
              onChange={setExportClassId}
            >
              {classes.map((cls) => (
                <Option key={cls.id} value={cls.id}>
                  {cls.name}
                </Option>
              ))}
            </Select>
          </div>
          <div style={{ color: "#666", fontSize: 14 }}>
            <p>导出说明：</p>
            {exportMode === "competition" ? (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {exportStyle === "compact" ? (
                  <>
                    <li>所有比赛在一个Sheet中</li>
                    <li>每个比赛项目占一个区块</li>
                    <li>每行显示4名学生的信息（班级、姓名）</li>
                  </>
                ) : (
                  <>
                    <li>每个比赛项目单独一个Sheet</li>
                    <li>包含表头：班级、姓名</li>
                    <li>一行显示一名学生的信息</li>
                  </>
                )}
                {exportClassId && <li>仅导出所选班级的报名数据</li>}
              </ul>
            ) : (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li>第一列：班级，第二列：姓名</li>
                <li>第3-n列：显示该学生报名的所有项目</li>
              </ul>
            )}
          </div>
        </div>
      </Modal>

      {/* 随机抽选模态框 */}
      <RandomDrawModal
        visible={randomDrawVisible}
        onCancel={() => setRandomDrawVisible(false)}
        competitions={competitions}
        onFetchRegistrations={async (competitionId: number) => {
          const response =
            await adminRegistrationAPI.getCompetitionRegistrations(
              competitionId,
            );
          return new Promise<Registration[]>((resolve, reject) => {
            handleResp(
              response,
              (data) => resolve(data),
              () => reject(new Error("获取报名数据失败")),
            );
          });
        }}
      />
    </div>
  );
};

export default RegistrationManagement;
