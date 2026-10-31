import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { adminBracketAPI } from "../../api/admin/bracket";
import { Bracket } from "../../types";
import {
  handleResp,
  handleRespWithNotifySuccess,
} from "../../utils/handleResp";
import { useIsMobile } from "../../utils/mobile";
import {
  BRACKET_FORMAT_LABELS,
  PARTICIPANT_TYPE_LABELS,
} from "../../utils/bracket";
import BracketFormModal from "../../components/BracketFormModal";

const { Title } = Typography;
const { Search } = Input;

const BracketManagement: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bracket | null>(null);

  const fetchBrackets = async (page = currentPage, size = pageSize) => {
    setLoading(true);
    const resp = await adminBracketAPI.getBrackets({
      page,
      page_size: size,
      keyword: searchText || undefined,
    });
    handleResp(
      resp,
      (data, pagination) => {
        setBrackets(data);
        setTotal(pagination?.total || 0);
        setLoading(false);
      },
      () => setLoading(false),
    );
  };

  useEffect(() => {
    fetchBrackets();
  }, [currentPage, pageSize, searchText]);

  const handleDelete = async (bracket: Bracket) => {
    const resp = await adminBracketAPI.deleteBracket(bracket.id);
    handleRespWithNotifySuccess(resp, () => fetchBrackets());
  };

  const columns = [
    {
      title: "名称",
      key: "name",
      render: (b: Bracket) => (
        <a onClick={() => navigate(`/admin/brackets/${b.id}`)}>{b.name}</a>
      ),
    },
    {
      title: "赛制",
      dataIndex: "format",
      key: "format",
      render: (f: Bracket["format"]) => BRACKET_FORMAT_LABELS[f],
    },
    {
      title: "参赛方",
      key: "participants",
      render: (b: Bracket) =>
        `${b.participant_count} 个${PARTICIPANT_TYPE_LABELS[b.participant_type]}`,
    },
    {
      title: "状态",
      key: "status",
      render: (b: Bracket) => (
        <Space size={4} wrap>
          {b.match_count > 0 ? (
            <Tag color="blue">已生成 {b.match_count} 场</Tag>
          ) : (
            <Tag>未生成</Tag>
          )}
          {b.published && <Tag color="green">已公开</Tag>}
          {b.competition_bracket_enabled && <Tag color="cyan">计入成绩</Tag>}
        </Space>
      ),
    },
    {
      title: "关联项目",
      dataIndex: "competition_name",
      key: "competition_name",
      render: (name?: string) => name || "-",
    },
    {
      title: "操作",
      key: "action",
      render: (b: Bracket) => (
        <Space wrap>
          <Button
            size="small"
            type="primary"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/admin/brackets/${b.id}`)}
          >
            管理
          </Button>
          {!isMobile && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(b);
                setModalOpen(true);
              }}
            >
              编辑
            </Button>
          )}
          {b.competition_bracket_enabled ? (
            <Tooltip title="所属项目已启用对阵图，请先在项目管理中关闭对阵图">
              <Button size="small" danger disabled icon={<DeleteOutlined />}>
                删除
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              title="确定删除此对阵表吗？"
              description="对阵与已录入的结果将一并删除，不可恢复"
              onConfirm={() => handleDelete(b)}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>对阵图管理</Title>
        <div style={{ marginTop: 16 }}>
          <Space wrap style={isMobile ? { width: "100%" } : undefined}>
            <Search
              placeholder="搜索对阵表名称"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1);
              }}
              style={{ width: isMobile ? "100%" : 250 }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchBrackets()}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              新建对阵表
            </Button>
          </Space>
        </div>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={brackets}
          rowKey="id"
          loading={loading}
          tableLayout="auto"
          scroll={{ x: "max-content" }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            simple: isMobile,
            size: isMobile ? "small" : undefined,
            showSizeChanger: !isMobile,
            showTotal: isMobile ? undefined : (t) => `共 ${t} 条记录`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size || 10);
            },
          }}
        />
      </Card>

      <BracketFormModal
        open={modalOpen}
        bracket={editing}
        locked={!!editing && editing.match_count > 0}
        onCancel={() => setModalOpen(false)}
        onSaved={(created) => {
          setModalOpen(false);
          if (created) {
            navigate(`/admin/brackets/${created.id}`);
          } else {
            fetchBrackets();
          }
        }}
      />
    </div>
  );
};

export default BracketManagement;
