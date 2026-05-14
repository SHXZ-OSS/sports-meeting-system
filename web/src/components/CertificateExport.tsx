import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Button,
  message,
  Radio,
  Select,
} from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import JSZip from "jszip";
import dayjs, { Dayjs } from "dayjs";
import { generateCertificatePDF } from "./CertificateDocument";
import { Score, ClassPointsSummary, Registration } from "../types";
import { adminRegistrationAPI } from "../api/admin/registration";
import { handleResp } from "../utils/handleResp";

interface CertificateExportProps {
  visible: boolean;
  onClose: () => void;
  scores?: Score[]; // 比赛成绩数据（个人/团体项目）
  classRankings?: ClassPointsSummary[]; // 班级总分排名数据
}

interface CertificateFormData {
  schoolName: string;
  eventName: string;
  date: Dayjs;
  maxRanking: number;
  exportType: "separate" | "merged"; // 导出类型：单独PDF或合并PDF
  selectedTeamCompetitions?: number[]; // 选中的集体项目ID列表（为每个参与者生成奖状，保持班级排名）
  // 字体大小配置
  fontSize1: number; // 第一行字体大小
  fontSize2: number; // 第二行字体大小
  fontSize3: number; // 第三行字体大小
  fontSizeSchool: number; // 颁发单位字体大小
  fontSizeDate: number; // 日期字体大小
  // Y坐标配置
  yPosition1: number; // 第一行Y坐标
  yPosition2: number; // 第二行Y坐标
  yPosition3: number; // 第三行Y坐标
  yPositionSchool: number; // 颁发单位Y坐标
  yPositionDate: number; // 日期Y坐标
}

const CertificateExport: React.FC<CertificateExportProps> = ({
  visible,
  onClose,
  scores,
  classRankings,
}) => {
  const [form] = Form.useForm<CertificateFormData>();
  const [loading, setLoading] = useState(false);
  const [teamCompetitionOptions, setTeamCompetitionOptions] = useState<
    Array<{ id: number; name: string }>
  >([]);

  // 判断是哪种模式
  const isClassRankingMode = !!classRankings;
  const isScoreMode = !!scores;

  // 从 scores 中提取集体项目（student_name === "集体"）
  useEffect(() => {
    if (visible && isScoreMode && scores) {
      const teamCompMap = new Map<number, string>();
      scores.forEach((score) => {
        if (
          score.student_name === "集体" &&
          !teamCompMap.has(score.competition_id)
        ) {
          teamCompMap.set(score.competition_id, score.competition_name);
        }
      });
      const teamComps = Array.from(teamCompMap.entries()).map(([id, name]) => ({
        id,
        name,
      }));
      setTeamCompetitionOptions(teamComps);
    }
  }, [visible, isScoreMode, scores]);

  const handleExport = async (values: CertificateFormData) => {
    try {
      setLoading(true);

      let certificates: Array<{
        participantName: string;
        schoolName: string;
        eventName: string;
        competitionName: string;
        ranking: number;
        date: string;
        fontSize1: number;
        fontSize2: number;
        fontSize3: number;
        fontSizeSchool: number;
        fontSizeDate: number;
        yPosition1: number;
        yPosition2: number;
        yPosition3: number;
        yPositionSchool: number;
        yPositionDate: number;
      }> = [];

      if (isClassRankingMode && classRankings) {
        // 班级总分模式
        const qualifiedRankings = classRankings.filter(
          (ranking) =>
            ranking.rank !== undefined &&
            ranking.rank !== null &&
            ranking.rank > 0 &&
            ranking.rank <= values.maxRanking,
        );

        if (qualifiedRankings.length === 0) {
          message.warning(`没有找到排名在前${values.maxRanking}名的班级`);
          setLoading(false);
          return;
        }

        certificates = qualifiedRankings.map((ranking) => ({
          participantName: ranking.class_name, // 班级总分只显示班级名
          schoolName: values.schoolName,
          eventName: values.eventName,
          competitionName: "团体总分", // 班级总分固定名称
          ranking: ranking.rank,
          date: values.date.format("YYYY-MM-DD"),
          fontSize1: values.fontSize1,
          fontSize2: values.fontSize2,
          fontSize3: values.fontSize3,
          fontSizeSchool: values.fontSizeSchool,
          fontSizeDate: values.fontSizeDate,
          yPosition1: values.yPosition1,
          yPosition2: values.yPosition2,
          yPosition3: values.yPosition3,
          yPositionSchool: values.yPositionSchool,
          yPositionDate: values.yPositionDate,
        }));
      } else if (isScoreMode && scores) {
        // 比赛成绩模式
        const qualifiedScores = scores.filter(
          (score) =>
            score.ranking !== undefined &&
            score.ranking !== null &&
            score.ranking > 0 &&
            score.ranking <= values.maxRanking,
        );

        if (qualifiedScores.length === 0) {
          message.warning(`没有找到排名在前${values.maxRanking}名的成绩`);
          setLoading(false);
          return;
        }

        // 获取选中的集体项目ID列表
        const selectedTeamCompIds = values.selectedTeamCompetitions || [];

        // 批量获取选中集体项目的报名数据
        const teamCompRegistrations = new Map<
          number,
          Map<number, Registration[]>
        >();

        if (selectedTeamCompIds.length > 0) {
          for (const compId of selectedTeamCompIds) {
            const registrationsResponse =
              await adminRegistrationAPI.getCompetitionRegistrations(compId);

            await new Promise<void>((resolve) => {
              handleResp(
                registrationsResponse,
                (registrations: Registration[]) => {
                  // 按 class_id 分组存储
                  const classMap = new Map<number, Registration[]>();
                  registrations.forEach((reg) => {
                    const existing = classMap.get(reg.class_id);
                    if (existing) {
                      existing.push(reg);
                    } else {
                      classMap.set(reg.class_id, [reg]);
                    }
                  });
                  teamCompRegistrations.set(compId, classMap);
                  resolve();
                },
                () => {
                  resolve();
                },
              );
            });
          }
        }

        // 为每个符合条件的成绩生成奖状
        for (const score of qualifiedScores) {
          // 判断是否是集体项目且被选中
          const isSelectedTeamComp =
            score.student_name === "集体" &&
            selectedTeamCompIds.includes(score.competition_id);

          if (isSelectedTeamComp && score.class_id) {
            // 集体项目且被选中：从缓存中获取该班级的报名者，为每人生成奖状（保持原排名）
            const classMap = teamCompRegistrations.get(score.competition_id);
            const classRegistrations = classMap?.get(score.class_id) || [];

            // 为每个报名者生成奖状，保持原有排名
            classRegistrations.forEach((registration) => {
              certificates.push({
                participantName: `${registration.class_name} ${registration.student_name}`,
                schoolName: values.schoolName,
                eventName: values.eventName,
                competitionName: score.competition_name,
                ranking: score.ranking ?? 0, // 保持原有排名
                date: values.date.format("YYYY-MM-DD"),
                fontSize1: values.fontSize1,
                fontSize2: values.fontSize2,
                fontSize3: values.fontSize3,
                fontSizeSchool: values.fontSizeSchool,
                fontSizeDate: values.fontSizeDate,
                yPosition1: values.yPosition1,
                yPosition2: values.yPosition2,
                yPosition3: values.yPosition3,
                yPositionSchool: values.yPositionSchool,
                yPositionDate: values.yPositionDate,
              });
            });
          } else {
            // 个人项目或未被选中的集体项目：按正常逻辑生成
            const participantName =
              score.student_name && score.student_name !== "集体"
                ? `${score.class_name} ${score.student_name}`
                : score.class_name;

            certificates.push({
              participantName,
              schoolName: values.schoolName,
              eventName: values.eventName,
              competitionName: score.competition_name,
              ranking: score.ranking ?? 0,
              date: values.date.format("YYYY-MM-DD"),
              fontSize1: values.fontSize1,
              fontSize2: values.fontSize2,
              fontSize3: values.fontSize3,
              fontSizeSchool: values.fontSizeSchool,
              fontSizeDate: values.fontSizeDate,
              yPosition1: values.yPosition1,
              yPosition2: values.yPosition2,
              yPosition3: values.yPosition3,
              yPositionSchool: values.yPositionSchool,
              yPositionDate: values.yPositionDate,
            });
          }
        }

        if (certificates.length === 0) {
          message.warning("没有可导出的奖状");
          setLoading(false);
          return;
        }
      } else {
        message.error("没有可导出的数据");
        setLoading(false);
        return;
      }

      if (values.exportType === "merged") {
        // 合并模式：生成一个多页PDF
        message.loading({
          content: `正在生成合并的奖状PDF（共${certificates.length}页）...`,
          key: "export-progress",
          duration: 0,
        });

        // 生成包含所有奖状的PDF
        const blob = await generateCertificatePDF(certificates);

        // 下载PDF文件
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const pdfFileName = isClassRankingMode
          ? `奖状_团体总分_${values.date.format("YYYY-MM-DD")}.pdf`
          : `奖状_比赛成绩_${values.date.format("YYYY-MM-DD")}.pdf`;
        link.download = pdfFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        message.success({
          content: `成功导出合并的奖状PDF（共${certificates.length}页）！`,
          key: "export-progress",
        });
      } else {
        // 单独模式：生成多个单独的PDF并打包成ZIP
        const zip = new JSZip();

        // 为每个奖状生成PDF并添加到ZIP
        for (let i = 0; i < certificates.length; i++) {
          const cert = certificates[i];
          message.loading({
            content: `正在生成奖状 ${i + 1}/${certificates.length}...`,
            key: "export-progress",
            duration: 0,
          });

          // 生成单个奖状的PDF
          const blob = await generateCertificatePDF([cert]);

          // 添加到ZIP，文件名格式：项目_第X名_参与者.pdf
          const fileName = `${cert.competitionName}_第${cert.ranking}名_${cert.participantName}.pdf`;
          zip.file(fileName, blob);
        }

        message.loading({
          content: "正在打包ZIP文件...",
          key: "export-progress",
          duration: 0,
        });

        // 生成ZIP文件
        const zipBlob = await zip.generateAsync({ type: "blob" });

        // 下载ZIP文件
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        const zipFileName = isClassRankingMode
          ? `奖状_团体总分_${values.date.format("YYYY-MM-DD")}.zip`
          : `奖状_${"比赛成绩"}_${values.date.format("YYYY-MM-DD")}.zip`;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        message.success({
          content: `成功导出${certificates.length}份奖状！`,
          key: "export-progress",
        });
      }

      form.resetFields();
      onClose();
    } catch (error) {
      console.error("导出奖状失败:", error);
      message.error({
        content: "导出奖状失败，请重试",
        key: "export-progress",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <>
          <FilePdfOutlined /> 导出奖状
        </>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleExport}
        initialValues={{
          date: dayjs(),
          exportType: "separate",
          // 字体大小预设值
          fontSize1: 34,
          fontSize2: 34,
          fontSize3: 34,
          fontSizeSchool: 15,
          fontSizeDate: 15,
          // Y坐标预设值
          yPosition1: 95,
          yPosition2: 115,
          yPosition3: 135,
          yPositionSchool: 145,
          yPositionDate: 155,
        }}
      >
        <Form.Item
          label="导出类型"
          name="exportType"
          rules={[{ required: true, message: "请选择导出类型" }]}
        >
          <Radio.Group>
            <Radio value="separate">单独PDF（打包为ZIP）</Radio>
            <Radio value="merged">合并为一个多页PDF</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="学校名称"
          name="schoolName"
          rules={[{ required: true, message: "请输入学校名称" }]}
        >
          <Input placeholder="例如：上海市行知中学" />
        </Form.Item>

        <Form.Item
          label="运动会名称"
          name="eventName"
          rules={[{ required: true, message: "请输入运动会名称" }]}
        >
          <Input placeholder="例如：2025年体育嘉年华" />
        </Form.Item>

        <Form.Item
          label="颁发日期"
          name="date"
          rules={[{ required: true, message: "请选择颁发日期" }]}
        >
          <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.Item
          label="颁发奖状的截至名次"
          name="maxRanking"
          rules={[
            { required: true, message: "请输入截至名次" },
            {
              type: "number",
              min: 1,
              message: "截至名次必须大于0",
            },
          ]}
          extra={`将为排名前N名${isClassRankingMode ? "的班级" : "的选手"}生成奖状`}
        >
          <InputNumber
            min={1}
            style={{ width: "100%" }}
            placeholder="例如：8（只给前8名颁发奖状）"
          />
        </Form.Item>

        {isScoreMode && teamCompetitionOptions.length > 0 && (
          <Form.Item
            label="选择要为每个参与者颁发奖状的集体项目（可选）"
            name="selectedTeamCompetitions"
            extra='选中的集体项目将为该班级的每个参与者生成奖状（保持该班级的原有排名），例如：高一1班获得第1名，选中后会为该班所有参与者各生成一张"第1名"的奖状'
          >
            <Select
              mode="multiple"
              placeholder="可选择一个或多个集体项目"
              style={{ width: "100%" }}
              maxTagCount="responsive"
              allowClear
            >
              {teamCompetitionOptions.map((comp) => (
                <Select.Option key={comp.id} value={comp.id}>
                  {comp.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Form.Item label="字体大小配置">
          <Input.Group compact>
            <Form.Item
              name="fontSize1"
              noStyle
              rules={[
                { required: true, message: "请输入第一行字体大小" },
                { type: "number", min: 1, message: "字体大小必须大于0" },
              ]}
            >
              <InputNumber
                min={1}
                style={{ width: "20%" }}
                placeholder="第一行"
                addonBefore="第一行"
              />
            </Form.Item>
            <Form.Item
              name="fontSize2"
              noStyle
              rules={[
                { required: true, message: "请输入第二行字体大小" },
                { type: "number", min: 1, message: "字体大小必须大于0" },
              ]}
            >
              <InputNumber
                min={1}
                style={{ width: "20%" }}
                placeholder="第二行"
                addonBefore="第二行"
              />
            </Form.Item>
            <Form.Item
              name="fontSize3"
              noStyle
              rules={[
                { required: true, message: "请输入第三行字体大小" },
                { type: "number", min: 1, message: "字体大小必须大于0" },
              ]}
            >
              <InputNumber
                min={1}
                style={{ width: "20%" }}
                placeholder="第三行"
                addonBefore="第三行"
              />
            </Form.Item>
            <Form.Item
              name="fontSizeSchool"
              noStyle
              rules={[
                { required: true, message: "请输入颁发单位字体大小" },
                { type: "number", min: 1, message: "字体大小必须大于0" },
              ]}
            >
              <InputNumber
                min={1}
                style={{ width: "20%" }}
                placeholder="单位"
                addonBefore="单位"
              />
            </Form.Item>
            <Form.Item
              name="fontSizeDate"
              noStyle
              rules={[
                { required: true, message: "请输入日期字体大小" },
                { type: "number", min: 1, message: "字体大小必须大于0" },
              ]}
            >
              <InputNumber
                min={1}
                style={{ width: "20%" }}
                placeholder="日期"
                addonBefore="日期"
              />
            </Form.Item>
          </Input.Group>
        </Form.Item>

        <Form.Item
          label="Y坐标配置 (mm)"
          extra="从顶部开始的距离，A4横向总高度为210mm"
        >
          <Input.Group compact>
            <Form.Item
              name="yPosition1"
              noStyle
              rules={[
                { required: true, message: "请输入第一行Y坐标" },
                {
                  type: "number",
                  min: 0,
                  max: 210,
                  message: "Y坐标必须在0-210之间",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={210}
                style={{ width: "20%" }}
                placeholder="第一行"
                addonBefore="第一行"
              />
            </Form.Item>
            <Form.Item
              name="yPosition2"
              noStyle
              rules={[
                { required: true, message: "请输入第二行Y坐标" },
                {
                  type: "number",
                  min: 0,
                  max: 210,
                  message: "Y坐标必须在0-210之间",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={210}
                style={{ width: "20%" }}
                placeholder="第二行"
                addonBefore="第二行"
              />
            </Form.Item>
            <Form.Item
              name="yPosition3"
              noStyle
              rules={[
                { required: true, message: "请输入第三行Y坐标" },
                {
                  type: "number",
                  min: 0,
                  max: 210,
                  message: "Y坐标必须在0-210之间",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={210}
                style={{ width: "20%" }}
                placeholder="第三行"
                addonBefore="第三行"
              />
            </Form.Item>
            <Form.Item
              name="yPositionSchool"
              noStyle
              rules={[
                { required: true, message: "请输入颁发单位Y坐标" },
                {
                  type: "number",
                  min: 0,
                  max: 210,
                  message: "Y坐标必须在0-210之间",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={210}
                style={{ width: "20%" }}
                placeholder="单位"
                addonBefore="单位"
              />
            </Form.Item>
            <Form.Item
              name="yPositionDate"
              noStyle
              rules={[
                { required: true, message: "请输入日期Y坐标" },
                {
                  type: "number",
                  min: 0,
                  max: 210,
                  message: "Y坐标必须在0-210之间",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={210}
                style={{ width: "20%" }}
                placeholder="日期"
                addonBefore="日期"
              />
            </Form.Item>
          </Input.Group>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            {loading ? "正在生成..." : "生成并导出奖状"}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CertificateExport;
