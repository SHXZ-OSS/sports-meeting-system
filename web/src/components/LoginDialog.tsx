import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Form, Input, message } from "antd";
import {
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWebsite } from "../contexts/WebsiteContext";
import { handleRespWithoutAuthButNotifySuccess } from "../utils";
import { authAPI } from "../api/auth";
import * as dd from "dingtalk-jsapi";
import "./LoginDialog.css";

interface LoginForm {
  username: string;
  password: string;
}

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
}

const LoginDialog: React.FC<LoginDialogProps> = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const titleId = useId();
  const { login } = useAuth();
  const { dingtalk_corp_id, oidc_enabled } = useWebsite();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInDingTalk, setIsInDingTalk] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (dd && dd.env && dd.env.platform !== "notInDingTalk") {
      setIsInDingTalk(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(location.search);
    const dingtalkToken = params.get("dingtalk_token");
    const dingtalkUser = params.get("dingtalk_user");
    const dingtalkError = params.get("dingtalk_error");
    const oidcToken = params.get("oidc_token");
    const oidcUser = params.get("oidc_user");
    const oidcError = params.get("oidc_error");

    const clearSSOQuery = () =>
      navigate("/", { replace: true, state: { openLogin: true } });

    const completeSSOLogin = (token: string, userJSON: string) => {
      try {
        const user = JSON.parse(userJSON);
        login(user, token);
        message.success("登录成功");
        if (user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/student");
        }
      } catch {
        setError("登录信息解析失败");
        clearSSOQuery();
      }
    };

    if (dingtalkError) {
      setError(`钉钉登录失败: ${dingtalkError}`);
      message.error(`钉钉登录失败: ${dingtalkError}`);
      clearSSOQuery();
      return;
    }
    if (dingtalkToken && dingtalkUser) {
      completeSSOLogin(dingtalkToken, dingtalkUser);
      return;
    }
    if (oidcError) {
      setError(`OIDC 登录失败: ${oidcError}`);
      message.error(`OIDC 登录失败: ${oidcError}`);
      clearSSOQuery();
      return;
    }
    if (oidcToken && oidcUser) {
      completeSSOLogin(oidcToken, oidcUser);
    }
  }, [location.search, login, navigate, open]);

  const handleLogin = async (values: LoginForm) => {
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
        login(data.user, data.token);
        if (data.user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/student");
        }
        setLoading(false);
      },
      (message) => {
        setError(message);
        setLoading(false);
      },
    );
  };

  const handleDingTalkLogin = () => {
    if (!dingtalk_corp_id) {
      setError("钉钉登录未配置，请使用账号密码登录");
      return;
    }
    setError(null);
    if (isInDingTalk) {
      navigate("/auth/dingtalk");
    } else {
      window.location.href = "/api/public/dingtalk/sso_redirect?redirect=/";
    }
  };

  const handleOIDCLogin = () => {
    if (!oidc_enabled) {
      setError("OIDC 登录未配置，请使用账号密码登录");
      return;
    }
    setError(null);
    window.location.href = "/api/public/oidc/auth_redirect?redirect=/";
  };

  if (!open) return null;

  return createPortal(
    <div
      className="ld-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ld-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ld-head">
          <h2 className="ld-title" id={titleId}>
            登录
          </h2>
          <button
            type="button"
            className="ld-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        <div className="ld-body">
          {error && (
            <div className="ld-error" role="alert">
              {error}
            </div>
          )}

          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            autoComplete="off"
            className="ld-form"
          >
            <div className="ld-field">
              <label className="ld-label" htmlFor="login-username">
                用户名
              </label>
              <Form.Item name="username" noStyle>
                <Input
                  id="login-username"
                  className="ld-input"
                  prefix={<UserOutlined />}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  autoFocus
                />
              </Form.Item>
            </div>

            <div className="ld-field">
              <label className="ld-label" htmlFor="login-password">
                密码
              </label>
              <Form.Item name="password" noStyle>
                <Input.Password
                  id="login-password"
                  className="ld-input"
                  prefix={<LockOutlined />}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </Form.Item>
            </div>

            <button type="submit" className="ld-submit" disabled={loading}>
              {loading && <span className="ld-spinner" aria-hidden="true" />}
              {loading ? "登录中…" : "登录"}
            </button>
          </Form>

          {(dingtalk_corp_id || oidc_enabled) && (
            <div className="ld-divider">
              <span>或</span>
            </div>
          )}

          <div className="ld-alts">
            {dingtalk_corp_id && (
              <button
                type="button"
                className="ld-alt"
                onClick={handleDingTalkLogin}
                disabled={loading}
              >
                <span className="ld-dingtalk-mark" aria-hidden="true">
                  钉
                </span>
                钉钉登录
              </button>
            )}
            {oidc_enabled && (
              <button
                type="button"
                className="ld-alt"
                onClick={handleOIDCLogin}
                disabled={loading}
              >
                <SafetyCertificateOutlined className="ld-alt-icon" />
                使用统一认证登录
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LoginDialog;
