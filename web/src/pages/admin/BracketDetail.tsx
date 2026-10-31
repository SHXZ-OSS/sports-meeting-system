import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { adminBracketAPI } from "../../api/admin/bracket";
import {
  BracketDetail as BracketDetailData,
  BracketMatch,
  BracketParticipant,
  Class,
  Student,
} from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import {
  BRACKET_FORMAT_LABELS,
  PARTICIPANT_TYPE_LABELS,
  getGroupName,
  isGroupFormat,
} from "../../utils/bracket";
import { usePageTitle } from "../../hooks/usePageTitle";
import BracketView from "../../components/BracketView";
import BracketFormModal from "../../components/BracketFormModal";
import BracketMatchModal from "../../components/BracketMatchModal";
import RadarConfigModal from "../../components/radar/RadarConfigModal";
import RadarManualModal from "../../components/radar/RadarManualModal";
import {
  RADAR_FORMULA_NOTE,
  RADAR_PRESET_LABELS,
} from "../../components/radar/radarUtils";

const { Title, Text } = Typography;

const BracketDetail: React.FC = () => {
  const { id } = useParams();
  const bracketId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<BracketDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  // 本地编辑中的种子顺序与分组（保存后才提交）
  const [order, setOrder] = useState<BracketParticipant[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [radarOpen, setRadarOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  usePageTitle(detail?.bracket.name ?? "对阵图");

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    const resp = await adminBracketAPI.getBracket(bracketId);
    handleResp(
      resp,
      (data) => {
        setDetail(data);
        setOrder(data.participants);
        setDirty(false);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [bracketId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const participantMap = useMemo(
    () => new Map((detail?.participants ?? []).map((p) => [p.id, p])),
    [detail],
  );

  if (!detail) {
    return loading ? null : <Empty description="对阵表不存在" />;
  }

  const { bracket } = detail;
  const generated = detail.matches.length > 0;
  const grouped = isGroupFormat(bracket.format);
  const typeLabel = PARTICIPANT_TYPE_LABELS[bracket.participant_type];
  const radarConfig = bracket.radar_config;
  const hasRadarStats = detail.matches.some(
    (m) =>
      Object.keys(m.stats1 ?? {}).length > 0 ||
      Object.keys(m.stats2 ?? {}).length > 0,
  );

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next.map((p, i) => ({ ...p, seed: i + 1 })));
    setDirty(true);
  };

  const setGroup = (participantId: number, group: number) => {
    setOrder(
      order.map((p) =>
        p.id === participantId ? { ...p, group_index: group } : p,
      ),
    );
    setDirty(true);
  };

  const saveOrder = async () => {
    const groups = grouped
      ? Object.fromEntries(order.map((p) => [p.id, p.group_index]))
      : undefined;
    const resp = await adminBracketAPI.reorderParticipants(
      bracketId,
      order.map((p) => p.id),
      groups,
    );
    handleRespWithNotifySuccess(resp, fetchDetail);
  };

  // 打乱种子（随机抽签）
  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next.map((p, i) => ({ ...p, seed: i + 1 })));
    setDirty(true);
  };

  const runAction = async (
    action: () => Promise<Parameters<typeof handleRespWithNotifySuccess>[0]>,
  ) => {
    const resp = await action();
    handleRespWithNotifySuccess(resp, fetchDetail);
  };

  const confirmGenerate = () => {
    if (dirty) {
      Modal.warning({ title: "请先保存种子与分组的修改" });
      return;
    }
    Modal.confirm({
      title: generated ? "确定重新生成对阵吗？" : "确定生成对阵吗？",
      content: generated
        ? "已录入的全部结果将被清空"
        : "生成后参赛方、种子与分组将被锁定，需重置对阵后才能修改",
      onOk: () => runAction(() => adminBracketAPI.generate(bracketId)),
    });
  };

  const confirmReset = () => {
    Modal.confirm({
      title: "确定重置对阵吗？",
      content: "将删除全部比赛与已录入的结果，参赛方保留",
      okButtonProps: { danger: true },
      onOk: () => runAction(() => adminBracketAPI.reset(bracketId)),
    });
  };

  const participantColumns = [
    { title: "种子", dataIndex: "seed", key: "seed", width: 64 },
    {
      title: typeLabel,
      key: "name",
      render: (p: BracketParticipant) => (
        <span>
          {p.name || <Text type="danger">已删除</Text>}
          {p.class_name && (
            <Text type="secondary" style={{ marginLeft: 6 }}>
              {p.class_name}
            </Text>
          )}
        </span>
      ),
    },
    ...(grouped
      ? [
          {
            title: "小组",
            key: "group",
            width: 120,
            render: (p: BracketParticipant) => (
              <Select
                size="small"
                value={p.group_index}
                disabled={generated}
                style={{ width: 96 }}
                onChange={(g) => setGroup(p.id, g)}
                options={Array.from(
                  { length: bracket.group_count },
                  (_, i) => ({
                    value: i,
                    label: getGroupName(i),
                  }),
                )}
              />
            ),
          },
        ]
      : []),
    ...(!generated
      ? [
          {
            title: "操作",
            key: "action",
            width: 160,
            render: (_: unknown, p: BracketParticipant, index: number) => (
              <Space size={4}>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="上移"
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="下移"
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label="移除"
                  onClick={() =>
                    Modal.confirm({
                      title: `确定移除「${p.name}」吗？`,
                      onOk: () =>
                        runAction(() =>
                          adminBracketAPI.removeParticipant(bracketId, p.id),
                        ),
                    })
                  }
                />
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/admin/brackets")}
          style={{ paddingLeft: 0 }}
        >
          返回列表
        </Button>
      </Space>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          {bracket.name}
        </Title>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchDetail}
            loading={loading}
          >
            刷新
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            编辑信息
          </Button>
          {generated && (
            <Button danger icon={<UndoOutlined />} onClick={confirmReset}>
              重置对阵
            </Button>
          )}
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={confirmGenerate}
            disabled={detail.participants.length < 2}
          >
            {generated ? "重新生成" : "生成对阵"}
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            {
              key: "format",
              label: "赛制",
              children: BRACKET_FORMAT_LABELS[bracket.format],
            },
            {
              key: "type",
              label: "参赛方",
              children: `${detail.participants.length} 个${typeLabel}`,
            },
            ...(grouped
              ? [
                  {
                    key: "groups",
                    label: "分组",
                    children:
                      bracket.format === "group_knockout"
                        ? `${bracket.group_count} 组，每组前 ${bracket.advance_per_group} 名出线`
                        : `${bracket.group_count} 组`,
                  },
                  {
                    key: "points",
                    label: "积分",
                    children: `胜 ${bracket.points_win} / 平 ${bracket.points_draw} / 负 ${bracket.points_loss}`,
                  },
                ]
              : []),
            {
              key: "published",
              label: "公开",
              children: bracket.published ? (
                <Tag color="green">已公开</Tag>
              ) : (
                <Tag>未公开</Tag>
              ),
            },
            {
              key: "competition",
              label: "关联项目",
              children: bracket.competition_name ? (
                <span>
                  {bracket.competition_name}
                  {bracket.competition_bracket_enabled && (
                    <Tag color="cyan" style={{ marginLeft: 8 }}>
                      计入成绩
                    </Tag>
                  )}
                </span>
              ) : (
                "-"
              ),
            },
          ]}
        />
        {bracket.description && (
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            {bracket.description}
          </Text>
        )}
      </Card>

      <Card
        title={`参赛方（${detail.participants.length}）`}
        style={{ marginBottom: 16 }}
        extra={
          !generated && (
            <Space wrap>
              {bracket.competition_id && (
                <Button
                  size="small"
                  icon={<ImportOutlined />}
                  onClick={() =>
                    runAction(() =>
                      adminBracketAPI.importParticipants(bracketId),
                    )
                  }
                >
                  从报名导入
                </Button>
              )}
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setAddOpen(true)}
              >
                添加{typeLabel}
              </Button>
              <Button
                size="small"
                onClick={shuffle}
                disabled={order.length < 2}
              >
                随机抽签
              </Button>
              {grouped && (
                <Button
                  size="small"
                  icon={<ClusterOutlined />}
                  disabled={dirty}
                  onClick={() =>
                    runAction(() => adminBracketAPI.autoGroup(bracketId))
                  }
                >
                  按种子分组
                </Button>
              )}
              <Button
                size="small"
                type="primary"
                icon={<SaveOutlined />}
                disabled={!dirty}
                onClick={saveOrder}
              >
                保存顺序
              </Button>
            </Space>
          )
        }
      >
        {generated ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title="对阵已生成，参赛方与种子已锁定。如需调整，请先重置对阵。"
          />
        ) : (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title="种子 1 为最强；淘汰赛中高种子优先轮空，种子 1 与 2 只会在决赛相遇。"
          />
        )}
        <Table
          size="small"
          rowKey="id"
          columns={participantColumns}
          dataSource={order}
          pagination={false}
          scroll={{ x: "max-content", y: 400 }}
        />
      </Card>

      <Card
        title="实力雷达"
        style={{ marginBottom: 16 }}
        extra={
          radarConfig && (
            <Space wrap>
              <Button size="small" onClick={() => setManualOpen(true)}>
                手动评分
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<RadarChartOutlined />}
                onClick={() => setRadarOpen(true)}
              >
                设置雷达图
              </Button>
            </Space>
          )
        }
      >
        {radarConfig ? (
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <div>
              <Text type="secondary">预设：</Text>
              <Tag color="gold">{RADAR_PRESET_LABELS[radarConfig.preset]}</Tag>
              <Text type="secondary">
                {radarConfig.dimensions.length} 个维度
              </Text>
            </div>
            <div>
              {radarConfig.dimensions.map((d) => (
                <Tag
                  key={d.key}
                  color={d.formula ? "blue" : undefined}
                  style={{ marginBlock: 2 }}
                >
                  {d.label}
                  {!d.formula && "（手动）"}
                </Tag>
              ))}
            </div>
            {radarConfig.fields.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                每场需统计：
                {radarConfig.fields.map((f) => f.label).join("、")}。
                {RADAR_FORMULA_NOTE}
              </Text>
            )}
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未启用雷达图"
          >
            <Button
              type="primary"
              icon={<RadarChartOutlined />}
              onClick={() => setRadarOpen(true)}
            >
              开启雷达图
            </Button>
          </Empty>
        )}
      </Card>

      <Card title="对阵图">
        {generated && (
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            点击双方已确定的比赛录入结果；修改结果后，后续比赛会自动更新。
          </Text>
        )}
        <BracketView detail={detail} onMatchClick={setEditingMatch} />
      </Card>

      <BracketFormModal
        open={editOpen}
        bracket={bracket}
        locked={generated}
        onCancel={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          fetchDetail();
        }}
      />

      <RadarConfigModal
        open={radarOpen}
        bracketId={bracketId}
        config={radarConfig}
        hasStats={hasRadarStats}
        onCancel={() => setRadarOpen(false)}
        onSaved={() => {
          setRadarOpen(false);
          fetchDetail();
        }}
      />

      {radarConfig && (
        <RadarManualModal
          open={manualOpen}
          detail={detail}
          onCancel={() => setManualOpen(false)}
          onSaved={fetchDetail}
        />
      )}

      <AddParticipantsModal
        open={addOpen}
        bracketId={bracketId}
        participantType={bracket.participant_type}
        existing={detail.participants}
        onCancel={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          fetchDetail();
        }}
      />

      <BracketMatchModal
        bracketId={bracketId}
        match={editingMatch}
        participants={participantMap}
        radarConfig={radarConfig}
        onCancel={() => setEditingMatch(null)}
        onSaved={() => {
          setEditingMatch(null);
          fetchDetail();
        }}
      />
    </div>
  );
};

interface AddParticipantsModalProps {
  open: boolean;
  bracketId: number;
  participantType: "class" | "student";
  existing: BracketParticipant[];
  onCancel: () => void;
  onSaved: () => void;
}

// 添加参赛方：班级直接多选；学生可先按班级筛选再多选
const AddParticipantsModal: React.FC<AddParticipantsModalProps> = ({
  open,
  bracketId,
  participantType,
  existing,
  onCancel,
  onSaved,
}) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classFilter, setClassFilter] = useState<number | undefined>();
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    adminBracketAPI
      .getClasses()
      .then((resp) => handleResp(resp, (data) => setClasses(data)));
  }, [open]);

  useEffect(() => {
    if (!open || participantType !== "student") return;
    adminBracketAPI
      .getStudents({ class_id: classFilter })
      .then((resp) => handleResp(resp, (data) => setStudents(data)));
  }, [open, participantType, classFilter]);

  const existingIds = new Set(
    existing.map((p) =>
      participantType === "student" ? p.student_id : p.class_id,
    ),
  );

  const options =
    participantType === "student"
      ? students
          .filter((s) => !existingIds.has(s.id))
          .map((s) => ({
            value: s.id,
            label: `${s.full_name}（${s.class_name}）`,
          }))
      : classes
          .filter((c) => !existingIds.has(c.id))
          .map((c) => ({ value: c.id, label: c.name }));

  const handleOk = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    const resp = await adminBracketAPI.addParticipants(bracketId, selected);
    setSubmitting(false);
    handleRespWithNotifySuccess(resp, onSaved);
  };

  return (
    <Modal
      title={`添加${PARTICIPANT_TYPE_LABELS[participantType]}`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okButtonProps={{ disabled: selected.length === 0 }}
      confirmLoading={submitting}
      okText="添加"
      cancelText="取消"
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        {participantType === "student" && (
          <Select
            allowClear
            showSearch={{ optionFilterProp: "label" }}
            placeholder="按班级筛选"
            style={{ width: "100%" }}
            value={classFilter}
            onChange={setClassFilter}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <Select
          mode="multiple"
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          placeholder={`选择${PARTICIPANT_TYPE_LABELS[participantType]}`}
          style={{ width: "100%" }}
          value={selected}
          onChange={setSelected}
          options={options}
          maxTagCount="responsive"
        />
        {options.length > 0 && (
          <Button
            size="small"
            onClick={() => setSelected(options.map((o) => o.value))}
          >
            全选（{options.length}）
          </Button>
        )}
      </Space>
    </Modal>
  );
};

export default BracketDetail;
