package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// 比赛相关钉钉通知：全部由管理员的显式动作触发（开始检录/修改比赛信息/成绩公布/单人提醒），无定时任务

// registeredDingTalkIDs 获取比赛全部已报名学生的钉钉ID（跳过未绑定的）
func registeredDingTalkIDs(competitionID int) ([]string, error) {
	registrations, err := models.GetCompetitionRegistrations(competitionID, 0)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(registrations))
	for _, reg := range registrations {
		if reg.Student != nil && reg.Student.DingTalkID != "" && reg.Student.DingTalkID != "0" {
			ids = append(ids, reg.Student.DingTalkID)
		}
	}
	return ids, nil
}

// scoredDingTalkIDs 获取个人赛中实际有成绩记录的学生钉钉ID（缺席者无成绩行，不通知）
func scoredDingTalkIDs(competitionID int) ([]string, error) {
	students, err := models.GetCompetitionScoreStudents(competitionID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(students))
	for _, student := range students {
		if student.DingTalkID != "" && student.DingTalkID != "0" {
			ids = append(ids, student.DingTalkID)
		}
	}
	return ids, nil
}

// joinMarkdown 组装通知正文，行间以空行分隔（钉钉 ActionCard 的单个换行不生效）
func joinMarkdown(lines ...string) string {
	parts := make([]string, 0, len(lines))
	for _, line := range lines {
		if line != "" {
			parts = append(parts, line)
		}
	}
	return strings.Join(parts, "\n\n")
}

// formatStartTime 计划开始时间的人类可读格式
func formatStartTime(t *time.Time) string {
	if t == nil {
		return "待定"
	}
	return t.Format("1月2日 15:04")
}

// venueOr 未填写地点时的占位文案
func venueOr(venue string) string {
	if venue == "" {
		return "待定"
	}
	return venue
}

// sendActionCard 发送卡片，站点配置了域名时附上看板跳转按钮
func sendActionCard(userIDs []string, title, markdown string) error {
	if len(userIDs) == 0 {
		return nil
	}
	singleTitle := ""
	singleURL := ""
	if domain := strings.TrimRight(config.Get().Website.Domain, "/"); domain != "" {
		singleTitle = "查看运动会看板"
		singleURL = domain + "/"
	}
	return utils.SendDingTalkActionCard(userIDs, utils.ActionCardMessage{
		Title:       title,
		Markdown:    markdown,
		SingleTitle: singleTitle,
		SingleURL:   singleURL,
	})
}

// SendCheckinNotice 开始检录通知，广播给全部已报名学生
func SendCheckinNotice(comp *types.Competition) error {
	ids, err := registeredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	markdown := joinMarkdown(
		fmt.Sprintf("**比赛地点**：%s", venueOr(comp.Venue)),
		fmt.Sprintf("**计划开始**：%s", formatStartTime(comp.StartTime)),
		"请已报名的同学尽快前往检录处。",
	)
	return sendActionCard(ids, "【检录通知】"+comp.Name, markdown)
}

// SendCompetitionChangeNotice 比赛时间（开始/结束）或地点变更通知
func SendCompetitionChangeNotice(comp *types.Competition, oldStartTime, oldEndTime *time.Time, oldVenue string) error {
	ids, err := registeredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	lines := []string{"比赛信息有如下变更："}
	if formatStartTime(oldStartTime) != formatStartTime(comp.StartTime) {
		lines = append(
			lines,
			fmt.Sprintf("**计划开始**：%s → %s", formatStartTime(oldStartTime), formatStartTime(comp.StartTime)),
		)
	}
	if formatStartTime(oldEndTime) != formatStartTime(comp.EndTime) {
		lines = append(
			lines,
			fmt.Sprintf("**计划结束**：%s → %s", formatStartTime(oldEndTime), formatStartTime(comp.EndTime)),
		)
	}
	if oldVenue != comp.Venue {
		lines = append(lines, fmt.Sprintf("**比赛地点**：%s → %s", venueOr(oldVenue), venueOr(comp.Venue)))
	}
	return sendActionCard(ids, "【比赛信息变更】"+comp.Name, joinMarkdown(lines...))
}

// SendScorePublishedNotice 成绩公布通知（个人赛只发有成绩记录的学生，团体赛只发有成绩的团体所在班级的报名学生）
func SendScorePublishedNotice(comp *types.Competition) error {
	if comp.CompetitionType == types.TypeTeam {
		// 团体成绩行无 student_id，须以班级为桥梁：报名学生 ∩ 有成绩的班级
		scoredClassIDs, err := models.GetCompetitionScoreClassIDs(comp.ID)
		if err != nil {
			return err
		}
		registrations, err := models.GetCompetitionRegistrations(comp.ID, 0)
		if err != nil {
			return err
		}
		scored := make(map[int]bool, len(scoredClassIDs))
		for _, id := range scoredClassIDs {
			scored[id] = true
		}
		ids := make([]string, 0, len(registrations))
		for _, reg := range registrations {
			if reg.Student != nil && scored[reg.Student.ClassID] &&
				reg.Student.DingTalkID != "" && reg.Student.DingTalkID != "0" {
				ids = append(ids, reg.Student.DingTalkID)
			}
		}
		markdown := joinMarkdown(
			fmt.Sprintf("**%s** 的成绩已审核公布。", comp.Name),
			"点击下方按钮或前往看板查看名次与得分。",
		)
		return sendActionCard(ids, "【成绩公布】"+comp.Name, markdown)
	}

	ids, err := scoredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	markdown := joinMarkdown(
		fmt.Sprintf("**%s** 的成绩已审核公布。", comp.Name),
		"点击下方按钮或前往看板查看名次与得分。",
	)
	return sendActionCard(ids, "【成绩公布】"+comp.Name, markdown)
}

// SendStudentCheckinReminder 对单个学生发送检录提醒
func SendStudentCheckinReminder(comp *types.Competition, student *types.Student) error {
	if student.DingTalkID == "" || student.DingTalkID == "0" {
		return errors.New("该学生未绑定钉钉，无法发送提醒")
	}
	markdown := joinMarkdown(
		fmt.Sprintf("%s同学你好，你报名的 **%s** 即将开始检录。", student.FullName, comp.Name),
		fmt.Sprintf("**比赛地点**：%s", venueOr(comp.Venue)),
		fmt.Sprintf("**计划开始**：%s", formatStartTime(comp.StartTime)),
		"请尽快前往检录处。",
	)
	return sendActionCard([]string{student.DingTalkID}, "【检录提醒】"+comp.Name, markdown)
}
