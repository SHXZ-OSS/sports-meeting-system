package models

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// RecalculatePointsByCompetitionID 根据比赛ID重新计算得分
// 在CalculateRankingByCompetitionID后调用
// 只有已审核的比赛（StatusCompleted）才会将得分写入Points表
func RecalculatePointsByCompetitionID(competitionID int) error {
	db := database.GetDB()

	return db.Transaction(func(tx *gorm.DB) error {
		// 获取比赛信息
		var competition types.Competition
		if err := tx.Select("id", "competition_type", "status").First(&competition, competitionID).Error; err != nil {
			return err
		}

		// 删除该比赛的所有ranking类型得分记录
		if err := tx.Where("competition_id = ? AND point_type = ?", competitionID, types.PointTypeRanking).
			Delete(&types.Points{}).Error; err != nil {
			return err
		}

		// 获取该比赛的所有成绩（已排名）
		var scores []types.Score
		if err := tx.Preload("Student").Where("competition_id = ?", competitionID).Find(&scores).Error; err != nil {
			return err
		}

		if len(scores) == 0 {
			return nil // 没有成绩，无需计算得分
		}

		// 获取配置
		cfg := config.Get()
		var pointsMapping map[string]float64

		// 根据比赛类型选择得分映射
		if competition.CompetitionType == types.TypeTeam {
			pointsMapping = cfg.Scoring.TeamPointsMapping
		} else {
			pointsMapping = cfg.Scoring.IndividualPointsMapping
		}

		// 为每个成绩记录创建得分
		for _, score := range scores {
			rankingStr := strconv.Itoa(score.Ranking)
			points, exists := pointsMapping[rankingStr]
			if !exists {
				// 该名次没有对应的得分，设置为0
				points = 0
			}

			// 更新 score 表的 point 字段（不管是否已审核都要更新，用于前端审核/提交显示）
			if err := tx.Model(&types.Score{}).Where("id = ?", score.ID).Update("point", points).Error; err != nil {
				return err
			}

			// 只有已审核的比赛才创建 Points 记录
			if competition.Status != types.StatusCompleted {
				continue // 未审核的成绩不创建 Points 记录
			}

			// 如果没有对应的得分配置，跳过创建 Points 记录
			if !exists {
				continue
			}

			if competition.CompetitionType == types.TypeTeam {
				// 团体赛：给所有参赛学生加分 + 给班级加一次分
				if score.ClassID == nil {
					continue
				}

				// 查询该班级该比赛的所有报名学生
				var registrations []types.Registration
				if err := tx.Preload("Student").Joins("JOIN students ON students.id = registrations.student_id").
					Where("students.class_id = ? AND registrations.competition_id = ?", *score.ClassID, competitionID).
					Find(&registrations).Error; err != nil {
					return err
				}

				// 收集学生名字用于班级得分的reason
				studentNames := make([]string, 0)

				// 给每个参赛学生加分
				for _, reg := range registrations {
					if reg.StudentID == nil {
						continue
					}

					// 收集学生名字
					if reg.Student != nil {
						studentNames = append(studentNames, reg.Student.FullName)
					}

					studentPoint := &types.Points{
						CompetitionID: competitionID,
						StudentID:     reg.StudentID,
						Points:        points,
						PointType:     types.PointTypeRanking,
						Ranking:       &score.Ranking,
					}
					if err := tx.Create(studentPoint).Error; err != nil {
						return err
					}
				}

				// 给班级加一次分，reason记录参赛学生名字
				reason := ""
				if len(studentNames) > 0 {
					reason = ""
					var reasonSb122 strings.Builder
					for i, name := range studentNames {
						if i > 0 {
							reasonSb122.WriteString("、")
						}
						reasonSb122.WriteString(name)
					}
					reason += reasonSb122.String()
				}

				classPoint := &types.Points{
					CompetitionID: competitionID,
					ClassID:       score.ClassID,
					Points:        points,
					PointType:     types.PointTypeRanking,
					Ranking:       &score.Ranking,
					Reason:        reason,
				}
				if err := tx.Create(classPoint).Error; err != nil {
					return err
				}
			} else {
				// 个人赛：同时给学生和班级加分
				if score.StudentID == nil {
					continue
				}

				// 给学生加分
				studentPoint := &types.Points{
					CompetitionID: competitionID,
					StudentID:     score.StudentID,
					Points:        points,
					PointType:     types.PointTypeRanking,
					Ranking:       &score.Ranking,
				}
				if err := tx.Create(studentPoint).Error; err != nil {
					return err
				}

				// 给学生所在班级加分，reason记录学生姓名
				if score.Student != nil && score.Student.ClassID > 0 {
					reason := ""
					if score.Student.FullName != "" {
						reason = score.Student.FullName
					}

					classPoint := &types.Points{
						CompetitionID: competitionID,
						ClassID:       &score.Student.ClassID,
						Points:        points,
						PointType:     types.PointTypeRanking,
						Ranking:       &score.Ranking,
						Reason:        reason,
					}
					if err := tx.Create(classPoint).Error; err != nil {
						return err
					}
				}
			}
		}

		return nil
	})
}

// AddCustomPointsToClass 为班级添加自定义得分（如开幕式加分）
func AddCustomPointsToClass(classID int, points float64, reason string, createdBy int) error {
	db := database.GetDB()

	// 检查班级是否存在
	var class types.Class
	if err := db.First(&class, classID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("班级不存在")
		}
		return err
	}

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 创建一个虚拟比赛ID（用于存储自定义得分）
	// 使用负数ID表示自定义得分，避免与真实比赛ID冲突
	virtualCompetitionID := -currentEventID

	point := &types.Points{
		CompetitionID: virtualCompetitionID,
		ClassID:       &classID,
		Points:        points,
		PointType:     types.PointTypeCustom,
		Reason:        reason,
		CreatedBy:     &createdBy,
	}

	return db.Create(point).Error
}

// GetClassPointsSummary 获取班级得分汇总（按总分排名）
func GetClassPointsSummary() ([]types.ClassPointsSummary, error) {
	db := database.GetDB()

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 查询所有班级的得分汇总
	var results []types.ClassPointsSummary
	err := db.Raw(`
		SELECT
			c.id as class_id,
			c.name as class_name,
			COALESCE(SUM(p.points), 0) as total_points,
			COALESCE(SUM(CASE WHEN p.point_type = ? THEN p.points ELSE 0 END), 0) as ranking_points,
			COALESCE(SUM(CASE WHEN p.point_type = ? THEN p.points ELSE 0 END), 0) as custom_points
		FROM classes c
		LEFT JOIN points p ON c.id = p.class_id AND (
			p.competition_id IN (SELECT id FROM competitions WHERE event_id = ?) OR
			p.competition_id = ?
		)
		GROUP BY c.id, c.name
		ORDER BY total_points DESC
	`, types.PointTypeRanking, types.PointTypeCustom, currentEventID, -currentEventID).Scan(&results).Error
	if err != nil {
		return nil, err
	}

	// 设置排名（处理并列情况）
	currentRank := 1
	for i := range results {
		if i > 0 && results[i].TotalPoints < results[i-1].TotalPoints {
			// 分数不同，排名为当前索引+1（跳过并列的名次）
			currentRank = i + 1
		}
		results[i].Rank = currentRank
	}

	return results, nil
}

// GetStudentPointsSummary 获取学生得分汇总（按总分排名）
func GetStudentPointsSummary() ([]types.StudentPointsSummary, error) {
	db := database.GetDB()

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 查询所有学生的得分汇总（只计算ranking类型的得分）
	var results []types.StudentPointsSummary
	err := db.Raw(`
		SELECT
			s.id as student_id,
			s.full_name as student_name,
			s.class_id,
			c.name as class_name,
			COALESCE(SUM(p.points), 0) as total_points,
			COALESCE(SUM(CASE WHEN p.point_type = ? THEN p.points ELSE 0 END), 0) as ranking_points
		FROM students s
		JOIN classes c ON s.class_id = c.id
		LEFT JOIN points p ON s.id = p.student_id AND p.competition_id IN (
			SELECT id FROM competitions WHERE event_id = ?
		)
		GROUP BY s.id, s.full_name, s.class_id, c.name
		HAVING total_points > 0
		ORDER BY total_points DESC
	`, types.PointTypeRanking, currentEventID).Scan(&results).Error
	if err != nil {
		return nil, err
	}

	// 设置排名（处理并列情况）
	currentRank := 1
	for i := range results {
		if i > 0 && results[i].TotalPoints < results[i-1].TotalPoints {
			// 分数不同，排名为当前索引+1（跳过并列的名次）
			currentRank = i + 1
		}
		results[i].Rank = currentRank
	}

	return results, nil
}

// GetClassPointDetails 获取班级得分明细
func GetClassPointDetails(classID int) ([]types.PointDetail, error) {
	db := database.GetDB()

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	var points []types.Points
	err := db.Preload("Competition").Preload("Creator").
		Where("class_id = ? AND (competition_id IN (SELECT id FROM competitions WHERE event_id = ?) OR competition_id = ?)",
			classID, currentEventID, -currentEventID).
		Order("created_at DESC").
		Find(&points).Error
	if err != nil {
		return nil, err
	}

	// 转换为详细信息
	details := make([]types.PointDetail, 0, len(points))
	for _, p := range points {
		detail := types.PointDetail{
			ID:            p.ID,
			CompetitionID: p.CompetitionID,
			Points:        p.Points,
			PointType:     p.PointType,
			Ranking:       p.Ranking,
			Reason:        p.Reason,
			CreatedBy:     p.CreatedBy,
			CreatedAt:     p.CreatedAt,
		}

		if p.Competition.ID > 0 {
			detail.CompetitionName = p.Competition.Name
			detail.CompetitionType = p.Competition.CompetitionType
		} else {
			detail.CompetitionName = "自定义加分"
			detail.CompetitionType = types.TypeTeam
		}

		if p.Creator != nil {
			detail.CreatorName = p.Creator.FullName
		}

		details = append(details, detail)
	}

	return details, nil
}

// GetStudentPointDetails 获取学生得分明细
func GetStudentPointDetails(studentID int) ([]types.PointDetail, error) {
	db := database.GetDB()

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	var points []types.Points
	err := db.Preload("Competition").
		Where("student_id = ? AND competition_id IN (SELECT id FROM competitions WHERE event_id = ?)",
			studentID, currentEventID).
		Order("created_at DESC").
		Find(&points).Error
	if err != nil {
		return nil, err
	}

	// 转换为详细信息
	details := make([]types.PointDetail, 0, len(points))
	for _, p := range points {
		detail := types.PointDetail{
			ID:              p.ID,
			CompetitionID:   p.CompetitionID,
			CompetitionName: p.Competition.Name,
			CompetitionType: p.Competition.CompetitionType,
			Points:          p.Points,
			PointType:       p.PointType,
			Ranking:         p.Ranking,
			CreatedAt:       p.CreatedAt,
		}
		details = append(details, detail)
	}

	return details, nil
}

// GetTopClasses 获取前N名班级
func GetTopClasses(limit int) ([]types.ClassPointsSummary, error) {
	summaries, err := GetClassPointsSummary()
	if err != nil {
		return nil, err
	}

	// 返回前N名(按照summary的rank来筛，如果出现并列全部返回)
	var result []types.ClassPointsSummary
	for i := range summaries {
		if i < limit || summaries[i].Rank == summaries[limit-1].Rank {
			result = append(result, summaries[i])
		}
	}
	return result, nil
}

// GetTopStudents 获取前N名学生
func GetTopStudents(limit int) ([]types.StudentPointsSummary, error) {
	summaries, err := GetStudentPointsSummary()
	if err != nil {
		return nil, err
	}

	// 返回前N名(按照summary的rank来筛，如果出现并列全部返回)
	var result []types.StudentPointsSummary
	for i := range summaries {
		if i < limit || summaries[i].Rank == summaries[limit-1].Rank {
			result = append(result, summaries[i])
		}
	}
	return result, nil
}

// DeleteCustomPoint 删除自定义得分记录
func DeleteCustomPoint(pointID int) error {
	db := database.GetDB()

	// 检查是否为自定义得分
	var point types.Points
	if err := db.First(&point, pointID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("得分记录不存在")
		}
		return err
	}

	if point.PointType != types.PointTypeCustom {
		return errors.New("只能删除自定义得分记录")
	}

	return db.Delete(&point).Error
}

// GetClassPointsSummaryByID 获取指定班级的得分汇总
func GetClassPointsSummaryByID(classID int) (*types.ClassPointsSummary, error) {
	summaries, err := GetClassPointsSummary()
	if err != nil {
		return nil, err
	}

	for _, summary := range summaries {
		if summary.ClassID == classID {
			return &summary, nil
		}
	}

	return nil, fmt.Errorf("班级 %d 未找到任何得分记录", classID)
}

// GetStudentPointsSummaryByID 获取指定学生的得分汇总（无得分的学生同样返回排名）
func GetStudentPointsSummaryByID(studentID int) (*types.StudentPointsSummary, error) {
	db := database.GetDB()

	// 获取当前运动会ID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 查询该学生的得分（含 0 分学生）
	var summary types.StudentPointsSummary
	err := db.Raw(`
		SELECT
			s.id as student_id,
			s.full_name as student_name,
			s.class_id,
			c.name as class_name,
			COALESCE(SUM(p.points), 0) as total_points,
			COALESCE(SUM(CASE WHEN p.point_type = ? THEN p.points ELSE 0 END), 0) as ranking_points
		FROM students s
		JOIN classes c ON s.class_id = c.id
		LEFT JOIN points p ON s.id = p.student_id AND p.competition_id IN (
			SELECT id FROM competitions WHERE event_id = ?
		)
		WHERE s.id = ?
		GROUP BY s.id, s.full_name, s.class_id, c.name
	`, types.PointTypeRanking, currentEventID, studentID).Scan(&summary).Error
	if err != nil {
		return nil, err
	}
	if summary.StudentID == 0 {
		return nil, fmt.Errorf("学生 %d 不存在", studentID)
	}

	// 排名 = 总分严格高于该生的学生数 + 1；无得分的学生不参与排名（Rank 保持 0）
	if summary.TotalPoints > 0 {
		var better int64
		err = db.Raw(`
			SELECT COUNT(*) FROM (
				SELECT s.id, COALESCE(SUM(p.points), 0) as total_points
				FROM students s
				LEFT JOIN points p ON s.id = p.student_id AND p.competition_id IN (
					SELECT id FROM competitions WHERE event_id = ?
				)
				GROUP BY s.id
				HAVING total_points > ?
			)
		`, currentEventID, summary.TotalPoints).Scan(&better).Error
		if err != nil {
			return nil, err
		}
		summary.Rank = int(better) + 1
	}

	return &summary, nil
}
