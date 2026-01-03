import { useState, useEffect } from "react";
import {
  Layout,
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  Divider,
  Alert,
  List,
  Avatar,
  message,
} from "antd";
import { UserOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWebsite } from "../../contexts/WebsiteContext";
import { handleRespWithoutAuthButNotifySuccess } from "../../utils";
import { authAPI } from "../../api/auth";
import Footer from "../../components/Footer";
import * as dd from "dingtalk-jsapi";

const { Content } = Layout;
const { Title, Link } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { name: websiteName, dingtalk_corp_id } = useWebsite();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [showStudentSelect, setShowStudentSelect] = useState(false);
  const [isInDingTalk, setIsInDingTalk] = useState(false);

  const handleLogin = async (values: LoginForm) => {
    // 前端验证
    if (!values.username || !values.username.trim()) {
      setError("请输入用户名");
      return;
    }
    if (!values.password || !values.password.trim()) {
      setError("请输入密码");
      return;
    }

    setLoading(true);
    setError(null);

    const response = await authAPI.login(values);

    handleRespWithoutAuthButNotifySuccess(
      response,
      (data) => {
        // 成功回调 - 会自动显示成功消息
        login(data.user, data.token);
        // 根据用户角色跳转
        if (data.user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/student");
        }
        setLoading(false);
      },
      (message) => {
        // 失败回调 - 会自动显示错误消息
        setError(message);
        setLoading(false);
      },
    );
  };

  // 检查是否在钉钉环境中
  useEffect(() => {
    if (dd && dd.env && dd.env.platform !== "notInDingTalk") {
      setIsInDingTalk(true);
    }
  }, []);

  // 处理 URL 参数中的钉钉登录信息
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dingtalkToken = params.get("dingtalk_token");
    const dingtalkUser = params.get("dingtalk_user");
    const dingtalkStudents = params.get("dingtalk_students");
    const dingtalkError = params.get("dingtalk_error");

    if (dingtalkError) {
      setError(`钉钉登录失败: ${dingtalkError}`);
      message.error(`钉钉登录失败: ${dingtalkError}`);
      // 清除 URL 参数
      navigate("/login", { replace: true });
      return;
    }

    if (dingtalkToken && dingtalkUser) {
      try {
        const user = JSON.parse(dingtalkUser);
        login(user, dingtalkToken);
        message.success("登录成功");
        // 根据用户角色跳转
        if (user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/student");
        }
      } catch (e) {
        setError("登录信息解析失败");
        navigate("/login", { replace: true });
      }
      return;
    }

    if (dingtalkStudents) {
      try {
        const studentsData = JSON.parse(dingtalkStudents);
        setStudents(studentsData);
        setShowStudentSelect(true);
        // 清除 URL 参数
        navigate("/login", { replace: true });
      } catch (e) {
        setError("学生信息解析失败");
        navigate("/login", { replace: true });
      }
      return;
    }
  }, [location, login, navigate]);

  const handleDingTalkLogin = () => {
    if (!dingtalk_corp_id) {
      const errorMessage = "钉钉登录未配置，请使用账号密码登录";
      setError(errorMessage);
      return;
    }

    // 清除错误状态
    setError(null);

    // 如果在钉钉客户端内，跳转到钉钉免登录页面
    if (isInDingTalk) {
      navigate("/auth/dingtalk");
    } else {
      // 如果不在钉钉客户端内，使用 SSO 重定向登录
      window.location.href = "/api/public/dingtalk/sso_redirect?redirect=/login";
    }
  };

  // 处理学生选择
  const handleStudentSelect = (student: any) => {
    const userInfo = {
      id: student.id,
      username: student.username,
      full_name: student.full_name,
      role: "student" as const,
    };

    login(userInfo, student.token);
    message.success(`欢迎 ${student.full_name}`);
    navigate("/student");
  };

  // 显示学生选择界面
  if (showStudentSelect) {
    return (
      <Layout style={{ minHeight: "100vh" }}>
        <Content
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <Card
            title="请选择学生账号"
            style={{
              width: "100%",
              maxWidth: "500px",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
            }}
          >
            <List
              itemLayout="horizontal"
              dataSource={students}
              renderItem={(student) => (
                <List.Item
                  actions={[
                    <Button
                      type="primary"
                      onClick={() => handleStudentSelect(student)}
                    >
                      选择
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={student.full_name}
                    description={student.username}
                  />
                </List.Item>
              )}
            />
            <Button
              block
              style={{ marginTop: "16px" }}
              onClick={() => {
                setShowStudentSelect(false);
                setStudents([]);
              }}
            >
              返回登录
            </Button>
          </Card>
        </Content>
        <Footer />
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Content
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
        }}
      >
        <Card
          style={{
            width: "100%",
            maxWidth: "400px",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
          bodyStyle={{ padding: "40px" }}
        >
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <Title
              level={2}
              style={{
                color: "#1677ff",
                marginBottom: "8px",
                whiteSpace: "nowrap",
                fontSize: "clamp(24px, 5vw, 28px)",
              }}
            >
              {websiteName}
            </Title>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: "24px" }}
            />
          )}

          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            autoComplete="off"
            size="large"
          >
            <Form.Item name="username">
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item name="password">
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: "16px" }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={<LoginOutlined />}
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          {dingtalk_corp_id && (
            <>
              <Divider>或</Divider>
              <Button
                block
                size="large"
                onClick={handleDingTalkLogin}
                disabled={loading}
                style={{
                  background: "#0089FF",
                  borderColor: "#0089FF",
                  color: "#fff",
                }}
              >
                钉钉登录
              </Button>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <Space direction="vertical" size={8}>
              <Link onClick={() => navigate("/")}>返回成绩看板</Link>
            </Space>
          </div>
        </Card>
      </Content>

      <Footer />
    </Layout>
  );
};

export default Login;
