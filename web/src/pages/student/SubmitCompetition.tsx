import { Typography } from "antd";
import { studentAPI } from "../../api/student";
import SubmitCompetitionForm from "../../components/SubmitCompetitionForm";

const { Title } = Typography;

// SubmitCompetition 学生提交推荐项目页面
const SubmitCompetition: React.FC = () => {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title level={2} style={{ textAlign: "center", marginBottom: 32 }}>
        推荐比赛项目
      </Title>
      <SubmitCompetitionForm
        onSubmit={studentAPI.createCompetition}
        successPath="/student/competitions"
      />
    </div>
  );
};

export default SubmitCompetition;
