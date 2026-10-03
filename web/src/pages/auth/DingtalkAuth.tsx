import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Result, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { authAPI } from "../../api/auth";
import { handleRespWithoutAuthAndNotify } from "../../utils/handleResp";
import { useAuth } from "../../contexts/AuthContext";
import { useWebsite } from "../../contexts/WebsiteContext";
import Footer from "../../components/Footer";
import * as dd from "dingtalk-jsapi";

const DingtalkAuth = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const { dingtalk_corp_id } = useWebsite();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 根据用户角色重定向到对应页面
  const redirectToUserHomepage = () => {
    if (user?.role === "admin") {
      navigate("/admin");
    } else if (user?.role === "student") {
      navigate("/student");
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    // 如果已登录，重定向到对应页面
    if (isAuthenticated) {
      redirectToUserHomepage();
      return;
    }

    // 检查是否配置了钉钉企业ID
    if (!dingtalk_corp_id) {
      setError("未配置钉钉登录");
      setLoading(false);
      return;
    }

    // 获取钉钉免登授权码
    const getAuthCode = async () => {
      try {
        // 确保钉钉SDK已加载
        if (dd) {
          if (dd.env.platform === "notInDingTalk") {
            // 如果不在钉钉环境中，显示错误信息
            setError("请在钉钉客户端中打开");
            setLoading(false);
            return;
          }

          // 钉钉免登
          dd.ready(() => {
            dd.runtime.permission
              .requestAuthCode({
                corpId: dingtalk_corp_id,
              })
              .then((res) => {
                if (res.code) {
                  // 使用授权码进行登录
                  handleLogin(res.code).catch(() => {
                    setLoading(false);
                  });
                } else {
                  setError("获取钉钉授权码失败");
                  setLoading(false);
                }
              })
              .catch(() => {
                setError("获取钉钉授权码失败");
                setLoading(false);
              });
          });

          dd.error(() => {
            setError("钉钉初始化失败，请重试");
            setLoading(false);
          });
        } else {
          // 如果不在钉钉环境中，显示错误信息
          setError("请在钉钉客户端中打开");
          setLoading(false);
        }
      } catch (err) {
        setError(
          "认证失败，请重试：" +
            (err instanceof Error ? err.message : "未知错误"),
        );
        setLoading(false);
      }
    };

    getAuthCode();
  }, [dingtalk_corp_id, isAuthenticated]);

  // 处理登录请求
  const handleLogin = async (code: string) => {
    setLoading(true);
    const response = await authAPI.dingTalkLogin({ code });

    handleRespWithoutAuthAndNotify(
      response,
      (data) => {
        if (data.token && data.user) {
          // 直接登录
          login(data.user, data.token);
          message.success("登录成功");
          redirectToUserHomepage();
        } else {
          throw new Error("登录返回数据格式错误");
        }
      },
      (msg) => {
        const errorMessage = msg || "钉钉登录失败";
        setError("登录失败：" + errorMessage);
        setLoading(false);
        message.error(errorMessage);
        throw new Error(errorMessage); // 继续抛出异常
      },
    );
  };

  // 返回登录页
  const handleBackToLogin = () => {
    navigate("/login");
  };

  if (loading) {
    return (
      <div>
        <div>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          <p>钉钉授权登录中...</p>
        </div>
        <div>
          <Footer />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Result
          status="error"
          title="登录失败"
          subTitle={error}
          extra={[
            <Button type="primary" key="login" onClick={handleBackToLogin}>
              返回登录页
            </Button>,
          ]}
        />
        <div>
          <Footer />
        </div>
      </div>
    );
  }

  return null;
};

export default DingtalkAuth;
