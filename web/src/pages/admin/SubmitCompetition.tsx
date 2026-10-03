import { Typography } from "antd";
import { adminCompetitionAPI } from "../../api/admin/competition";
import SubmitCompetitionForm from "../../components/SubmitCompetitionForm";

const { Title, Text } = Typography;

// SubmitCompetition 班级账号代学生提交推荐项目页面，提交后进入待审核状态
const SubmitCompetition: React.FC = () => {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title level={2} style={{ textAlign: "center", marginBottom: 8 }}>
        提交推荐项目
      </Title>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <Text type="secondary">提交后将由系统管理员审核，审核通过后生效</Text>
      </div>
      <SubmitCompetitionForm
        onSubmit={adminCompetitionAPI.submitCompetition}
        successPath="/admin"
      />
    </div>
  );
};

export default SubmitCompetition;
