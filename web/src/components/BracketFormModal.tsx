import { useEffect, useState } from "react";
import {
  Alert,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
} from "antd";
import { adminBracketAPI, BracketRequest } from "../api/admin/bracket";
import { Bracket, BracketFormat, Competition } from "../types";
import { handleResp, handleRespWithNotifySuccess } from "../utils/handleResp";
import { BRACKET_FORMAT_OPTIONS, isGroupFormat } from "../utils/bracket";

interface BracketFormModalProps {
  open: boolean;
  // 为空时为新建
  bracket?: Bracket | null;
  // 已生成对阵时锁定结构性参数
  locked?: boolean;
  onCancel: () => void;
  onSaved: (bracket?: Bracket) => void;
}

interface BracketFormValues {
  name: string;
  description?: string;
  competition_id?: number | null;
  format: BracketFormat;
  participant_type: "class" | "student";
  group_count?: number;
  advance_per_group?: number;
  third_place_match?: boolean;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;
  published?: boolean;
}

const BracketFormModal: React.FC<BracketFormModalProps> = ({
  open,
  bracket,
  locked = false,
  onCancel,
  onSaved,
}) => {
  const [form] = Form.useForm<BracketFormValues>();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const format = Form.useWatch("format", form);
  const participantType = Form.useWatch("participant_type", form);
  const isEdit = !!bracket;
  // 所属项目已启用对阵图时，关联关系由项目管理控制，这里不允许改动
  const linkLocked = !!bracket?.competition_bracket_enabled;

  useEffect(() => {
    if (!open) return;
    adminBracketAPI.getCompetitions().then((resp) =>
      handleResp(resp, (data) =>
        // 仅审核通过后的项目可以关联
        setCompetitions(
          data.filter(
            (c) => c.status !== "pending_approval" && c.status !== "rejected",
          ),
        ),
      ),
    );
    if (bracket) {
      form.setFieldsValue({
        ...bracket,
        competition_id: bracket.competition_id ?? null,
      });
    } else {
      form.resetFields();
    }
  }, [open, bracket, form]);

  const handleFinish = async (values: BracketFormValues) => {
    setSubmitting(true);
    const data: BracketRequest = {
      ...values,
      competition_id: values.competition_id ?? null,
      description: values.description ?? "",
    };
    if (isEdit) {
      const resp = await adminBracketAPI.updateBracket(bracket.id, data);
      setSubmitting(false);
      handleRespWithNotifySuccess(resp, () => onSaved());
      return;
    }
    const resp = await adminBracketAPI.createBracket(data);
    setSubmitting(false);
    handleRespWithNotifySuccess(resp, (created) => onSaved(created));
  };

  const groupFormat = format ? isGroupFormat(format) : false;
  const hasKnockout =
    format === "single_elimination" || format === "group_knockout";

  return (
    <Modal
      title={isEdit ? "编辑对阵表" : "新建对阵表"}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={isEdit ? "保存" : "创建"}
      cancelText="取消"
      width={560}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        autoComplete="off"
        initialValues={{
          format: "single_elimination",
          participant_type: "class",
          group_count: 2,
          advance_per_group: 2,
          third_place_match: false,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          published: false,
        }}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[
            { required: true, whitespace: true, message: "请输入名称" },
            { max: 100, message: "名称不能超过 100 个字符" },
          ]}
        >
          <Input placeholder="如：篮球赛 男子组" />
        </Form.Item>

        <Form.Item
          label="赛制"
          name="format"
          rules={[{ required: true }]}
          extra={
            BRACKET_FORMAT_OPTIONS.find((o) => o.value === format)?.description
          }
        >
          <Select
            disabled={isEdit}
            options={BRACKET_FORMAT_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="参赛方"
          name="participant_type"
          rules={[{ required: true }]}
        >
          <Radio.Group disabled={isEdit}>
            <Radio value="class">班级</Radio>
            <Radio value="student">学生</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="关联比赛项目"
          name="competition_id"
          extra={
            linkLocked
              ? "所属项目已启用对阵图，名次由本对阵生成；如需解除关联，请先在项目管理中关闭对阵图"
              : "关联后可一键导入该项目的报名作为参赛方；在项目管理中开启「使用对阵图」后，对阵结果会计入成绩与积分"
          }
        >
          <Select
            allowClear
            disabled={linkLocked}
            showSearch={{ optionFilterProp: "label" }}
            placeholder="可选"
            options={competitions
              // 个人赛对应学生、团体赛与全校性比赛对应班级；仅报名项目没有成绩
              .filter((c) =>
                participantType === "student"
                  ? c.competition_type === "individual"
                  : c.competition_type === "team" ||
                    c.competition_type === "school",
              )
              .map((c) => ({ value: c.id, label: c.name }))}
          />
        </Form.Item>

        {locked && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="对阵已生成，小组数量、出线数量与季军赛需重置对阵后才能修改"
          />
        )}

        {groupFormat && (
          <Space size="large" wrap>
            <Form.Item
              label="小组数量"
              name="group_count"
              rules={[{ required: true, message: "请输入小组数量" }]}
            >
              <InputNumber min={1} max={32} precision={0} disabled={locked} />
            </Form.Item>
            {format === "group_knockout" && (
              <Form.Item
                label="每组出线"
                name="advance_per_group"
                rules={[{ required: true, message: "请输入出线数量" }]}
              >
                <InputNumber min={1} max={16} precision={0} disabled={locked} />
              </Form.Item>
            )}
          </Space>
        )}

        {groupFormat && (
          <Space size="large" wrap>
            <Form.Item label="胜场积分" name="points_win">
              <InputNumber min={-100} max={100} precision={0} />
            </Form.Item>
            <Form.Item label="平局积分" name="points_draw">
              <InputNumber min={-100} max={100} precision={0} />
            </Form.Item>
            <Form.Item label="负场积分" name="points_loss">
              <InputNumber min={-100} max={100} precision={0} />
            </Form.Item>
          </Space>
        )}

        {hasKnockout && (
          <Form.Item
            label="季军赛"
            name="third_place_match"
            valuePropName="checked"
          >
            <Switch disabled={locked} />
          </Form.Item>
        )}

        <Form.Item
          label="说明"
          name="description"
          rules={[{ max: 2000, message: "说明不能超过 2000 个字符" }]}
        >
          <Input.TextArea rows={3} placeholder="可选，展示在公开对阵图上方" />
        </Form.Item>

        <Form.Item
          label="在公开看板展示"
          name="published"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BracketFormModal;
