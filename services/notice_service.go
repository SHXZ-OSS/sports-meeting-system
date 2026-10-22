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

// joinBlocks 组装纯文本正文，段落间以空行分隔
func joinBlocks(lines ...string) string {
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

// competitionLink 比赛详情链接：看板解析 ?id= 后自动打开对应比赛详情
func competitionLink(competitionID int) string {
	domain := strings.TrimRight(config.Get().Website.Domain, "/")
	if domain == "" {
		return ""
	}
	return fmt.Sprintf("%s/?id=%d", domain, competitionID)
}

// sendTimeLine 发送时间：使用 RFC3339 时间戳，规避钉钉同内容去重
func sendTimeLine() string {
	return fmt.Sprintf("（发送于 %s）", time.Now().Format(time.RFC3339))
}

// sendNotice 发送纯文本工作通知：首行为标题（通知栏摘要），其后为正文、详情链接与发送时间
func sendNotice(userIDs []string, title, body string, competitionID int) error {
	if len(userIDs) == 0 {
		return nil
	}
	lines := []string{title + "\n" + body}
	if link := competitionLink(competitionID); link != "" {
		lines = append(lines, "查看详情："+link)
	}
	lines = append(lines, sendTimeLine())
	return utils.SendDingTalkText(userIDs, strings.Join(lines, "\n"))
}

// SendCheckinNotice 开始检录通知，广播给全部已报名学生
func SendCheckinNotice(comp *types.Competition) error {
	ids, err := registeredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	body := joinBlocks(
		fmt.Sprintf("地点：%s\n时间：%s", venueOr(comp.Venue), formatStartTime(comp.StartTime)),
		"已报名的同学请尽快到检录处集合，祝比赛顺利！",
	)
	return sendNotice(ids, "【检录通知】"+comp.Name, body, comp.ID)
}

// SendCompetitionChangeNotice 比赛时间（开始/结束）或地点变更通知
func SendCompetitionChangeNotice(comp *types.Competition, oldStartTime, oldEndTime *time.Time, oldVenue string) error {
	ids, err := registeredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	lines := make([]string, 0, 3)
	if formatStartTime(oldStartTime) != formatStartTime(comp.StartTime) {
		lines = append(
			lines,
			fmt.Sprintf("计划开始：%s → %s", formatStartTime(oldStartTime), formatStartTime(comp.StartTime)),
		)
	}
	if formatStartTime(oldEndTime) != formatStartTime(comp.EndTime) {
		lines = append(
			lines,
			fmt.Sprintf("计划结束：%s → %s", formatStartTime(oldEndTime), formatStartTime(comp.EndTime)),
		)
	}
	if oldVenue != comp.Venue {
		lines = append(lines, fmt.Sprintf("地点：%s → %s", venueOr(oldVenue), venueOr(comp.Venue)))
	}
	body := strings.Join(lines, "\n") + "\n\n请留意最新安排，按新时间到场比赛～"
	return sendNotice(ids, "【比赛信息变更】"+comp.Name, body, comp.ID)
}

// SendScorePublishedNotice 成绩公布通知（个人赛只发有成绩记录的学生，团体赛只发有成绩的团体所在班级的报名学生）
func SendScorePublishedNotice(comp *types.Competition) error {
	// 全校性比赛没有报名学生，仅报名项目没有成绩，均不发送成绩公布通知
	if comp.CompetitionType == types.TypeSchool || comp.CompetitionType == types.TypeRegistration {
		return nil
	}

	body := "成绩已经发布，快去看看你的名次和得分吧！"

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
		return sendNotice(ids, "【成绩公布】"+comp.Name, body, comp.ID)
	}

	ids, err := scoredDingTalkIDs(comp.ID)
	if err != nil {
		return err
	}
	return sendNotice(ids, "【成绩公布】"+comp.Name, body, comp.ID)
}

// SendStudentCheckinReminder 对单个学生发送检录提醒
func SendStudentCheckinReminder(comp *types.Competition, student *types.Student) error {
	if student.DingTalkID == "" || student.DingTalkID == "0" {
		return errors.New("该学生未绑定钉钉，无法发送提醒")
	}
	body := joinBlocks(
		fmt.Sprintf(
			"%s同学，请前往检录\n地点：%s\n时间：%s",
			student.FullName,
			venueOr(comp.Venue),
			formatStartTime(comp.StartTime),
		),
		"请快速前往检录处，别让比赛等你哦～",
	)
	return sendNotice([]string{student.DingTalkID}, "【检录提醒】"+comp.Name, body, comp.ID)
}
