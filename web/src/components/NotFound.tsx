import { Button, Result } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isStudent } = useAuth();

  const handleGoHome = () => {
    if (isAdmin) {
      navigate("/admin");
    } else if (isStudent) {
      navigate("/student");
    } else {
      navigate("/");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle="抱歉，您访问的页面不存在或您没有访问权限。"
        extra={
          <Button type="primary" icon={<HomeOutlined />} onClick={handleGoHome}>
            返回主页
          </Button>
        }
      />
    </div>
  );
};

export default NotFound;
