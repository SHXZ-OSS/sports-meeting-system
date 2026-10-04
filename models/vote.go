package models

import (
	"errors"
	"fmt"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// VoteCompetition 对比赛项目进行投票
// studentID: 投票学生ID
// competitionID: 比赛项目ID
// voteType: 投票类型 (1: upvote, -1: downvote)
func VoteCompetition(db *gorm.DB, studentID, competitionID int, voteType types.VoteType) error {
	// 验证投票类型
	if voteType != types.VoteTypeUp && voteType != types.VoteTypeDown {
		return errors.New("无效的投票类型")
	}

	// 检查比赛项目是否存在
	var competition types.Competition
	if err := db.First(&competition, competitionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("比赛项目不存在")
		}
		return fmt.Errorf("查询比赛项目失败: %w", err)
	}

	// 仅审核通过（未开始）的比赛可以投票，检录开始后投票关闭
	if competition.Status != types.StatusApproved {
		return errors.New("该比赛已开始检录或已结束，投票已关闭")
	}

	// 检查学生是否存在
	var student types.Student
	if err := db.First(&student, studentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("学生不存在")
		}
		return fmt.Errorf("查询学生失败: %w", err)
	}

	// 使用事务处理投票逻辑
	return db.Transaction(func(tx *gorm.DB) error {
		// 查询现有投票记录
		var existingVote types.Vote
		err := tx.Where("student_id = ? AND competition_id = ?", studentID, competitionID).
			First(&existingVote).Error

		if err == nil {
			// 存在投票记录
			if existingVote.VoteType == voteType {
				// 相同投票类型，取消投票
				if err := tx.Delete(&existingVote).Error; err != nil {
					return fmt.Errorf("删除投票失败: %w", err)
				}

				// 更新比赛项目的投票计数
				voteDelta := -int(voteType)
				if err := tx.Model(&types.Competition{}).
					Where("id = ?", competitionID).
					UpdateColumn("vote_count", gorm.Expr("vote_count + ?", voteDelta)).Error; err != nil {
					return fmt.Errorf("更新投票计数失败: %w", err)
				}

				return nil
			}

			// 不同投票类型，更新投票
			oldVoteType := existingVote.VoteType
			existingVote.VoteType = voteType

			if err := tx.Save(&existingVote).Error; err != nil {
				return fmt.Errorf("更新投票失败: %w", err)
			}

			// 更新比赛项目的投票计数
			// 从旧投票类型切换到新投票类型，变化量为 2 * voteType
			// 例如：从 -1 切换到 +1，变化量为 +2
			voteDelta := int(voteType - oldVoteType)
			if err := tx.Model(&types.Competition{}).
				Where("id = ?", competitionID).
				UpdateColumn("vote_count", gorm.Expr("vote_count + ?", voteDelta)).Error; err != nil {
				return fmt.Errorf("更新投票计数失败: %w", err)
			}

			return nil
		}

		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 不存在投票记录，创建新投票
			newVote := types.Vote{
				StudentID:     studentID,
				CompetitionID: competitionID,
				VoteType:      voteType,
			}

			if err := tx.Create(&newVote).Error; err != nil {
				return fmt.Errorf("创建投票失败: %w", err)
			}

			// 更新比赛项目的投票计数
			if err := tx.Model(&types.Competition{}).
				Where("id = ?", competitionID).
				UpdateColumn("vote_count", gorm.Expr("vote_count + ?", int(voteType))).Error; err != nil {
				return fmt.Errorf("更新投票计数失败: %w", err)
			}

			return nil
		}

		return fmt.Errorf("查询投票记录失败: %w", err)
	})
}

// GetStudentVotesForCompetitions 批量获取学生对多个比赛项目的投票
// 返回 map[competitionID]voteType
func GetStudentVotesForCompetitions(db *gorm.DB, studentID int, competitionIDs []int) (map[int]types.VoteType, error) {
	if len(competitionIDs) == 0 {
		return map[int]types.VoteType{}, nil
	}

	var votes []types.Vote
	err := db.Where("student_id = ? AND competition_id IN ?", studentID, competitionIDs).
		Find(&votes).Error
	if err != nil {
		return nil, fmt.Errorf("查询投票失败: %w", err)
	}

	result := make(map[int]types.VoteType)
	for _, vote := range votes {
		result[vote.CompetitionID] = vote.VoteType
	}

	return result, nil
}
