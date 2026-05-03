package models

import (
	"fmt"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
	"gorm.io/gorm"
)

// RegisterForCompetitionForStudent 学生报名比赛（个人赛和团体赛都以学生为单位）
func RegisterForCompetitionForStudent(studentID *int, classID *int, competitionID int, user *types.User) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewRegistrationValidator(db)

	// 使用验证器验证报名请求
	if err := validator.ValidateRegistration(studentID, classID, competitionID, user); err != nil {
		return err
	}

	// 如果没有提供classID，从学生信息中获取
	if classID == nil && studentID != nil {
		student, err := GetStudentByID(*studentID)
		if err == nil {
			classID = &student.ClassID
		}
	}

	// 创建报名记录
	registration := &types.Registration{
		StudentID:     studentID,
		ClassID:       classID,
		CompetitionID: competitionID,
	}
	return db.Create(registration).Error
}

// UnregisterFromCompetition 取消报名
func UnregisterFromCompetition(studentID *int, classID *int, competitionID int, user *types.User) error {
	// 获取数据库连接和验证器
	db := database.GetDB()
	validator := utils.NewRegistrationValidator(db)

	// 使用验证器验证取消报名请求
	if err := validator.ValidateUnregistration(studentID, classID, competitionID, user); err != nil {
		return err
	}

	// 删除报名记录
	result := db.Where("student_id = ? AND competition_id = ?", *studentID, competitionID).Delete(&types.Registration{})

	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return utils.ErrNotRegistered
	}

	return nil
}

// GetCompetitionRegistrations 获取比赛的报名列表（支持班级scope）
// scopeClassIDs: 可选的班级ID列表，用于过滤报名记录。如果为nil，则返回所有报名记录
func GetCompetitionRegistrations(competitionID int, scopeClassIDs *[]int) ([]*types.Registration, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 构建查询
	query := db.Preload("Student.Class").Where("competition_id = ?", competitionID)

	// 如果提供了scopeClassIDs，应用班级scope过滤
	if scopeClassIDs != nil {
		if len(*scopeClassIDs) == 0 {
			// 没有任何班级权限，返回空列表
			return []*types.Registration{}, nil
		}
		query = query.Where("class_id IN ?", *scopeClassIDs)
	}

	// 查询报名记录，包含学生、班级信息
	var registrations []*types.Registration
	err := query.Order("created_at DESC").Find(&registrations).Error
	if err != nil {
		return nil, err
	}

	// 填充学生和班级信息
	for _, reg := range registrations {
		if reg.StudentID != nil && reg.Student != nil && reg.Student.ID > 0 {
			reg.StudentName = reg.Student.FullName
			reg.StudentGender = reg.Student.Gender
			if reg.Student.Class.ID > 0 {
				reg.ClassName = reg.Student.Class.Name
				// 填充ClassID字段（用于成绩录入）
				reg.ClassID = &reg.Student.ClassID
			}
		}
	}

	return registrations, nil
}

// GetStudentRegistrationsByStudentID 获取学生的报名记录
func GetStudentRegistrationsByStudentID(studentID int) ([]*types.Competition, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 查询学生报名的比赛
	var registrations []*types.Registration
	err := db.Preload("Competition.Submitter").Preload("Competition.Reviewer").Where("student_id = ?", studentID).Order("created_at DESC").Find(&registrations).Error
	if err != nil {
		return nil, err
	}

	// 提取比赛信息
	var competitions []*types.Competition
	for _, reg := range registrations {
		comp := &reg.Competition

		// 设置衍生字段
		if comp.Submitter != nil {
			submitterName := comp.Submitter.FullName
			comp.SubmitterName = &submitterName
		}
		if comp.Reviewer != nil {
			comp.ReviewerName = comp.Reviewer.FullName
		}

		competitions = append(competitions, comp)
	}

	return competitions, nil
}

// GetCompetitionChecklist 获取比赛报名检查清单
// scopeClassIDs: 可选的班级ID列表，用于过滤检查范围。如果为nil，则检查所有班级
func GetCompetitionChecklist(scopeClassIDs *[]int) ([]map[string]any, error) {
	db := database.GetDB()

	// 获取当前届次的所有比赛项目
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID
	var competitions []types.Competition
	if err := db.Where("event_id = ?", currentEventID).Find(&competitions).Error; err != nil {
		return nil, err
	}

	// 如果提供了scopeClassIDs且为空，返回空列表
	if scopeClassIDs != nil && len(*scopeClassIDs) == 0 {
		return []map[string]any{}, nil
	}

	// 检查学生报名时间冲突
	timeConflictIssues := checkStudentTimeConflicts(db, scopeClassIDs)

	// 检查每个项目
	var results []map[string]any
	for _, comp := range competitions {
		// 查询该项目的报名情况（混合性别时需要 Preload Student 以获取性别）
		var registrations []types.Registration
		query := db.Where("competition_id = ?", comp.ID)
		if scopeClassIDs != nil && len(*scopeClassIDs) > 0 {
			query = query.Where("class_id IN ?", *scopeClassIDs)
		}
		needGender := comp.Gender == 3 && (comp.MinFemalePerClass > 0 || comp.MaxFemalePerClass > 0 || comp.MinMalePerClass > 0 || comp.MaxMalePerClass > 0)
		if needGender {
			query = query.Preload("Student")
		}
		if err := query.Find(&registrations).Error; err != nil {
			continue
		}

		// 按班级统计总人数及性别人数
		classTotal := make(map[int]int)
		classFemale := make(map[int]int) // gender=2 为女
		classMale := make(map[int]int)   // gender=1 为男
		for _, reg := range registrations {
			if reg.ClassID == nil {
				continue
			}
			classTotal[*reg.ClassID]++
			if needGender && reg.Student != nil {
				switch reg.Student.Gender {
				case 2:
					classFemale[*reg.ClassID]++
				case 1:
					classMale[*reg.ClassID]++
				}
			}
		}

		// 检查每个班级是否符合要求
		var classes []types.Class
		if scopeClassIDs != nil && len(*scopeClassIDs) > 0 {
			db.Where("id IN ?", *scopeClassIDs).Find(&classes)
		} else {
			db.Find(&classes)
		}

		var issues []map[string]any
		allOk := true

		for _, class := range classes {
			total := classTotal[class.ID]

			// 检查总人数
			if comp.MinParticipantsPerClass > 0 && total < comp.MinParticipantsPerClass {
				allOk = false
				issues = append(issues, map[string]any{
					"competition_id":   comp.ID,
					"competition_name": comp.Name,
					"status":           "error",
					"message":          fmt.Sprintf("班级 %s 报名人数不足（%d/%d）", class.Name, total, comp.MinParticipantsPerClass),
				})
			}
			if comp.MaxParticipantsPerClass > 0 && total > comp.MaxParticipantsPerClass {
				allOk = false
				issues = append(issues, map[string]any{
					"competition_id":   comp.ID,
					"competition_name": comp.Name,
					"status":           "error",
					"message":          fmt.Sprintf("班级 %s 报名人数超出上限（%d/%d）", class.Name, total, comp.MaxParticipantsPerClass),
				})
			}

			// 检查性别人数（仅混合性别项目）
			if needGender {
				female := classFemale[class.ID]
				male := classMale[class.ID]
				if comp.MinFemalePerClass > 0 && female < comp.MinFemalePerClass {
					allOk = false
					issues = append(issues, map[string]any{
						"competition_id":   comp.ID,
						"competition_name": comp.Name,
						"status":           "error",
						"message":          fmt.Sprintf("班级 %s 女生人数不足（%d/%d）", class.Name, female, comp.MinFemalePerClass),
					})
				}
				if comp.MaxFemalePerClass > 0 && female > comp.MaxFemalePerClass {
					allOk = false
					issues = append(issues, map[string]any{
						"competition_id":   comp.ID,
						"competition_name": comp.Name,
						"status":           "error",
						"message":          fmt.Sprintf("班级 %s 女生人数超出上限（%d/%d）", class.Name, female, comp.MaxFemalePerClass),
					})
				}
				if comp.MinMalePerClass > 0 && male < comp.MinMalePerClass {
					allOk = false
					issues = append(issues, map[string]any{
						"competition_id":   comp.ID,
						"competition_name": comp.Name,
						"status":           "error",
						"message":          fmt.Sprintf("班级 %s 男生人数不足（%d/%d）", class.Name, male, comp.MinMalePerClass),
					})
				}
				if comp.MaxMalePerClass > 0 && male > comp.MaxMalePerClass {
					allOk = false
					issues = append(issues, map[string]any{
						"competition_id":   comp.ID,
						"competition_name": comp.Name,
						"status":           "error",
						"message":          fmt.Sprintf("班级 %s 男生人数超出上限（%d/%d）", class.Name, male, comp.MaxMalePerClass),
					})
				}
			}
		}

		if allOk {
			results = append(results, map[string]any{
				"competition_id":   comp.ID,
				"competition_name": comp.Name,
				"status":           "ok",
				"message":          "所有班级报名人数符合要求",
			})
		} else {
			results = append(results, issues...)
		}
	}

	// 添加时间冲突检测结果
	results = append(results, timeConflictIssues...)

	return results, nil
}

// checkStudentTimeConflicts 检查学生报名的比赛时间是否有冲突
func checkStudentTimeConflicts(db *gorm.DB, scopeClassIDs *[]int) []map[string]any {
	var issues []map[string]any

	// 获取当前届次所有有时间信息的比赛
	cfg := config.Get()
	var competitions []types.Competition
	if err := db.Where("event_id = ? AND start_time IS NOT NULL AND end_time IS NOT NULL", cfg.CurrentEventID).Find(&competitions).Error; err != nil {
		return issues
	}

	// 构建比赛ID到比赛信息的映射
	compMap := make(map[int]*types.Competition)
	for i := range competitions {
		compMap[competitions[i].ID] = &competitions[i]
	}

	// 获取所有报名记录
	var registrations []types.Registration
	query := db.Preload("Student")
	if scopeClassIDs != nil && len(*scopeClassIDs) > 0 {
		query = query.Where("class_id IN ?", *scopeClassIDs)
	}
	if err := query.Find(&registrations).Error; err != nil {
		return issues
	}

	// 按学生分组报名记录
	studentRegistrations := make(map[int][]*types.Registration)
	for i := range registrations {
		if registrations[i].StudentID != nil {
			studentID := *registrations[i].StudentID
			studentRegistrations[studentID] = append(studentRegistrations[studentID], &registrations[i])
		}
	}

	// 检查每个学生的报名时间冲突
	for studentID, regs := range studentRegistrations {
		// 获取学生信息
		var student types.Student
		if err := db.Preload("Class").First(&student, studentID).Error; err != nil {
			continue
		}

		// 检查该学生报名的比赛时间是否有重叠
		for i := 0; i < len(regs); i++ {
			comp1 := compMap[regs[i].CompetitionID]
			if comp1 == nil || comp1.StartTime == nil || comp1.EndTime == nil {
				continue
			}

			for j := i + 1; j < len(regs); j++ {
				comp2 := compMap[regs[j].CompetitionID]
				if comp2 == nil || comp2.StartTime == nil || comp2.EndTime == nil {
					continue
				}

				// 检查时间是否重叠
				if timesOverlap(comp1.StartTime, comp1.EndTime, comp2.StartTime, comp2.EndTime) {
					cst, _ := time.LoadLocation("Asia/Shanghai")
					time1 := fmt.Sprintf("%s-%s", comp1.StartTime.In(cst).Format("06-01-02 15:04"), comp1.EndTime.In(cst).Format("06-01-02 15:04"))
					time2 := fmt.Sprintf("%s-%s", comp2.StartTime.In(cst).Format("06-01-02 15:04"), comp2.EndTime.In(cst).Format("06-01-02 15:04"))
					issues = append(issues, map[string]any{
						"competition_id":   comp1.ID,
						"competition_name": comp1.Name,
						"status":           "error",
						"message":          fmt.Sprintf("学生 %s %s 报名的比赛时间冲突：%s（%s）和 %s（%s）", student.Class.Name, student.FullName, comp1.Name, time1, comp2.Name, time2),
					})
					issues = append(issues, map[string]any{
						"competition_id":   comp2.ID,
						"competition_name": comp2.Name,
						"status":           "error",
						"message":          fmt.Sprintf("学生 %s %s 报名的比赛时间冲突：%s（%s）和 %s（%s）", student.Class.Name, student.FullName, comp1.Name, time1, comp2.Name, time2),
					})
				}
			}
		}
	}

	return issues
}

// timesOverlap 检查两个时间段是否有重叠
func timesOverlap(start1, end1, start2, end2 *time.Time) bool {
	// 时间段1: [start1, end1]
	// 时间段2: [start2, end2]
	// 重叠条件: start1 < end2 AND start2 < end1
	return start1.Before(*end2) && start2.Before(*end1)
}
