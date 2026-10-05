package models

import (
	"errors"
	"slices"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// CreateOrUpdateScores 批量提交比赛成绩
func CreateOrUpdateScores(competitionID int, scores []types.StudentScore, submitterID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 检查比赛是否存在且状态正确
	var competition types.Competition
	if err := db.Select("status").First(&competition, competitionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("比赛项目不存在")
		}
		return err
	}

	// 仅进行中的比赛可以录入成绩（已完成的比赛需先退回进行中）
	if competition.Status != types.StatusInProgress {
		return errors.New("仅进行中的比赛可以录入成绩，请先将比赛置为进行中")
	}

	// 使用事务处理成绩录入
	err := db.Transaction(func(tx *gorm.DB) error {
		// 删除该比赛的所有现有成绩
		if err := tx.Where("competition_id = ?", competitionID).Delete(&types.Score{}).Error; err != nil {
			return err
		}

		// 获取比赛信息
		var comp types.Competition
		if err := tx.Select("competition_type").First(&comp, competitionID).Error; err != nil {
			return err
		}

		// 批量插入新成绩
		var successCount int
		for _, studentScore := range scores {
			if comp.CompetitionType == types.TypeIndividual {
				// 个人比赛：检查学生是否已报名
				if studentScore.StudentID == nil {
					continue
				}
				var regCount int64
				if err := tx.Model(&types.Registration{}).
					Where("student_id = ? AND competition_id = ?", *studentScore.StudentID, competitionID).
					Count(&regCount).
					Error; err != nil {
					return err
				}
				if regCount == 0 {
					continue
				}

				// 插入成绩记录
				score := &types.Score{
					CompetitionID: competitionID,
					StudentID:     studentScore.StudentID,
					ClassID:       nil,
					Score:         studentScore.Score,
				}
				if err := tx.Create(score).Error; err != nil {
					return err
				}
				successCount++
			} else {
				// 团体比赛：按班级录入，检查该班级是否有学生报名
				if studentScore.ClassID == nil {
					continue
				}

				// 检查该班级是否有学生报名该比赛
				var regCount int64
				if err := tx.Table("registrations r").
					Joins("JOIN students s ON r.student_id = s.id").
					Where("s.class_id = ? AND r.competition_id = ?", *studentScore.ClassID, competitionID).
					Count(&regCount).Error; err != nil {
					return err
				}

				if regCount == 0 {
					// 该班级没有学生报名，跳过
					continue
				}

				// 插入班级成绩记录
				score := &types.Score{
					CompetitionID: competitionID,
					StudentID:     nil,
					ClassID:       studentScore.ClassID,
					Score:         studentScore.Score,
				}
				if err := tx.Create(score).Error; err != nil {
					return err
				}
				successCount++
			}
		}

		if successCount == 0 {
			return errors.New("没有有效的成绩记录被提交")
		}

		// 更新比赛状态为等待成绩审核，并记录成绩提交人
		return tx.Model(&types.Competition{}).Where("id = ?", competitionID).Updates(map[string]any{
			"status":             types.StatusPendingScoreReview,
			"score_submitter_id": submitterID,
			"score_created_at":   gorm.Expr("CURRENT_TIMESTAMP"),
		}).Error
	})
	if err != nil {
		return err
	}

	// 计算并更新排名
	if err := CalculateRankingByCompetitionID(competitionID); err != nil {
		return err
	}

	// 重新计算得分
	return RecalculatePointsByCompetitionID(competitionID)
}

// CalculateRankingByCompetitionID 计算并更新某比赛的排名
func CalculateRankingByCompetitionID(competitionID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务处理排名计算
	return db.Transaction(func(tx *gorm.DB) error {
		// 获取排名方式
		var competition types.Competition
		if err := tx.Select("ranking_mode").First(&competition, competitionID).Error; err != nil {
			return err
		}

		// 确定排序方式
		var order string
		if competition.RankingMode == types.RankingLowerFirst {
			order = "score ASC"
		} else {
			order = "score DESC"
		}

		// 获取按分数排序的成绩记录
		var scores []types.Score
		if err := tx.Select("id, score").
			Where("competition_id = ?", competitionID).
			Order(order).
			Find(&scores).
			Error; err != nil {
			return err
		}

		if len(scores) == 0 {
			return nil // 没有成绩记录，无需计算排名
		}

		var (
			currentRank = 1
			lastScore   *float64
		)

		for i, score := range scores {
			if lastScore == nil || *lastScore != score.Score {
				currentRank = i + 1
				lastScore = &score.Score
			}

			if err := tx.Model(&score).Update("ranking", currentRank).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// GetScoresByCompetitionID 获取比赛的所有成绩
func GetScoresByCompetitionID(competitionID int) ([]*types.Score, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取比赛的排名方式
	var competition types.Competition
	if err := db.Select("ranking_mode").First(&competition, competitionID).Error; err != nil {
		return nil, err
	}

	// 根据排名方式确定排序
	var order string
	if competition.RankingMode == types.RankingLowerFirst {
		order = "score ASC" // 分数低的排名靠前（如跑步）
	} else {
		order = "score DESC" // 分数高的排名靠前（如跳高）
	}

	// 执行查询，包含关联数据
	var scores []*types.Score
	err := db.Preload("Competition").
		Preload("Student.Class").
		Preload("Class").
		Where("competition_id = ?", competitionID).
		Order(order).
		Find(&scores).
		Error
	if err != nil {
		return nil, err
	}

	// 设置衍生字段
	for _, score := range scores {
		if score.Competition.ID > 0 {
			score.CompetitionName = score.Competition.Name
			score.Unit = score.Competition.Unit
		}
		// 个人比赛成绩
		if score.StudentID != nil && score.Student != nil && score.Student.ID > 0 {
			score.StudentName = score.Student.FullName
			if score.Student.Class.ID > 0 {
				score.ClassName = score.Student.Class.Name
			}
		}
		// 团体比赛成绩
		if score.ClassID != nil && score.Class != nil && score.Class.ID > 0 {
			score.ClassName = score.Class.Name
			score.StudentName = "集体" // 团体比赛显示"集体"
		}
	}

	return scores, nil
}

// GetScoresByStudentID 获取学生的所有成绩（包括个人赛和该学生参加的团体赛）
func GetScoresByStudentID(studentID int) ([]*types.Score, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 先获取学生信息（需要知道班级ID）
	var student types.Student
	if err := db.Select("id", "class_id", "full_name").First(&student, studentID).Error; err != nil {
		return nil, err
	}

	// 1. 查询个人赛成绩（student_id = studentID），只返回已审核的成绩
	var individualScores []*types.Score
	err := db.Preload("Competition").Preload("Student.Class").
		Joins("JOIN competitions ON competitions.id = scores.competition_id").
		Where("scores.student_id = ? AND competitions.event_id = ? AND competitions.status = ?", studentID, currentEventID, types.StatusCompleted).
		Find(&individualScores).Error
	if err != nil {
		return nil, err
	}

	// 2. 查询团体赛成绩（class_id = student.ClassID 且该学生确实报名了该比赛）
	var teamScores []*types.Score
	if student.ClassID > 0 {
		// 查询该学生报名的所有团体比赛ID
		var registeredTeamCompetitionIDs []int
		if err := db.Table("registrations r").
			Select("DISTINCT c.id").
			Joins("JOIN competitions c ON c.id = r.competition_id").
			Where("r.student_id = ? AND c.competition_type = ? AND c.event_id = ?",
				studentID, types.TypeTeam, currentEventID).
			Pluck("c.id", &registeredTeamCompetitionIDs).Error; err != nil {
			return nil, err
		}

		if len(registeredTeamCompetitionIDs) > 0 {
			// 查询这些团体比赛的班级成绩，只返回已审核的成绩
			err = db.Preload("Competition").Preload("Class").
				Joins("JOIN competitions ON competitions.id = scores.competition_id").
				Where("scores.class_id = ? AND scores.competition_id IN ? AND competitions.status = ?", student.ClassID, registeredTeamCompetitionIDs, types.StatusCompleted).
				Find(&teamScores).Error
			if err != nil {
				return nil, err
			}
		}
	}

	// 合并个人赛和团体赛成绩
	scores := slices.Concat(individualScores, teamScores)

	// 设置衍生字段
	for _, score := range scores {
		if score.Competition.ID > 0 {
			score.CompetitionName = score.Competition.Name
			score.Unit = score.Competition.Unit
		}

		if score.StudentID != nil && score.Student != nil && score.Student.ID > 0 {
			// 个人赛成绩
			score.StudentName = score.Student.FullName
			if score.Student.Class.ID > 0 {
				score.ClassName = score.Student.Class.Name
			}
		} else if score.ClassID != nil && score.Class != nil && score.Class.ID > 0 {
			// 团体赛成绩
			score.ClassName = score.Class.Name
			score.StudentName = "团体"
		}
	}

	return scores, nil
}

// ReviewCompetitionScoresByID 审核比赛成绩
func ReviewCompetitionScoresByID(competitionID int, reviewerID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务审核成绩
	err := db.Transaction(func(tx *gorm.DB) error {
		// 检查比赛状态
		var competition types.Competition
		if err := tx.Select("status").First(&competition, competitionID).Error; err != nil {
			return err
		}

		if competition.Status != types.StatusPendingScoreReview {
			return errors.New("该比赛当前状态不允许审核成绩")
		}

		// 更新比赛状态为已完成，并记录审核人
		return tx.Model(&types.Competition{}).Where("id = ?", competitionID).Updates(map[string]any{
			"status":            types.StatusCompleted,
			"score_reviewer_id": reviewerID,
			"score_reviewed_at": gorm.Expr("CURRENT_TIMESTAMP"),
		}).Error
	})
	if err != nil {
		return err
	}

	// 审核通过后，重新计算排名（虽然排名可能已经计算过了，但保证数据一致性）
	if err := CalculateRankingByCompetitionID(competitionID); err != nil {
		return err
	}

	// 审核通过后，计算得分（只有审核通过的成绩才会计算得分）
	return RecalculatePointsByCompetitionID(competitionID)
}

// DeleteCompetitionScoresByID 删除比赛的所有成绩记录
func DeleteCompetitionScoresByID(competitionID int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务删除成绩记录
	err := db.Transaction(func(tx *gorm.DB) error {
		// 删除成绩记录
		if err := tx.Where("competition_id = ?", competitionID).Delete(&types.Score{}).Error; err != nil {
			return err
		}

		// 更新比赛状态回到进行中，允许重新录入成绩
		return tx.Model(&types.Competition{}).Where("id = ?", competitionID).Updates(map[string]any{
			"status":             types.StatusInProgress,
			"score_submitter_id": nil,
			"score_reviewer_id":  nil,
			"score_reviewed_at":  nil,
			"score_created_at":   nil,
		}).Error
	})
	if err != nil {
		return err
	}

	// 删除成绩后，清空该比赛的排名得分
	return RecalculatePointsByCompetitionID(competitionID)
}

// GetCompetitionScoreStudents 获取比赛中实际有成绩记录的学生列表（用于成绩公布通知，缺席者无成绩行）
func GetCompetitionScoreStudents(competitionID int) ([]*types.Student, error) {
	// 获取数据库连接
	db := database.GetDB()

	var students []*types.Student
	err := db.Distinct().
		Joins("JOIN scores ON scores.student_id = students.id").
		Where("scores.competition_id = ?", competitionID).
		Find(&students).Error
	return students, err
}

// GetCompetitionScoreClassIDs 获取团体赛中有成绩记录的班级ID（用于成绩公布通知）
func GetCompetitionScoreClassIDs(competitionID int) ([]int, error) {
	// 获取数据库连接
	db := database.GetDB()

	var classIDs []int
	err := db.Model(&types.Score{}).
		Where("competition_id = ? AND class_id IS NOT NULL", competitionID).
		Distinct().
		Pluck("class_id", &classIDs).Error
	return classIDs, err
}
