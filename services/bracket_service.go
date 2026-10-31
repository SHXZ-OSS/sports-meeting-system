package services

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// 对阵表业务错误
var (
	ErrBracketLocked            = errors.New("对阵已生成，请先重置对阵再修改参赛方或赛制参数")
	ErrBracketNotGenerated      = errors.New("对阵尚未生成")
	ErrBracketMatchNotPlayable  = errors.New("该场比赛双方尚未确定，无法录入结果")
	ErrBracketDrawNotAllowed    = errors.New("淘汰赛不允许平局，请录入胜者")
	ErrBracketInvalidWinner     = errors.New("胜者必须是本场比赛的参赛方之一")
	ErrBracketWinnerRequired    = errors.New("请指定胜者或标记为平局")
	ErrBracketWinnerScoreConfit = errors.New("比分与胜者不一致")
	ErrBracketOrderMismatch     = errors.New("排序列表与当前参赛方不一致")
)

// bracketMu 串行化同一进程内对阵表的写操作，避免并发录入时推导结果互相覆盖
var bracketMu sync.Mutex

// GetBracketDetail 获取对阵表完整数据（参赛方、比赛、积分榜）
// 推导结果若与库中不一致（如学生被删除导致签位失效），会顺带写回
func GetBracketDetail(id int) (*types.BracketDetail, error) {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	bracket, err := models.GetBracketByID(id)
	if err != nil {
		return nil, err
	}
	participants, err := models.GetBracketParticipants(id)
	if err != nil {
		return nil, err
	}
	matches, err := models.GetBracketMatches(id)
	if err != nil {
		return nil, err
	}

	changed, standings := ResolveBracket(bracket, participants, matches)
	if err := models.SaveBracketMatches(changed); err != nil {
		return nil, err
	}

	bracket.ParticipantNum = len(participants)
	for _, m := range matches {
		if m.Status != types.MatchStatusBye && m.Status != types.MatchStatusVoid {
			bracket.MatchNum++
		}
	}
	return &types.BracketDetail{
		Bracket:      bracket,
		Participants: participants,
		Matches:      matches,
		Standings:    standings,
	}, nil
}

// EnsureBracketEditable 对阵生成后禁止修改参赛方与赛制参数
func EnsureBracketEditable(bracketID int) error {
	generated, err := models.HasBracketMatches(bracketID)
	if err != nil {
		return err
	}
	if generated {
		return ErrBracketLocked
	}
	return nil
}

// UpdateBracketInfo 更新对阵表；已生成对阵时只允许修改名称、说明、关联项目与公开状态
func UpdateBracketInfo(bracket *types.Bracket, update *types.Bracket) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	generated, err := models.HasBracketMatches(bracket.ID)
	if err != nil {
		return err
	}
	structural := bracket.GroupCount != update.GroupCount ||
		bracket.AdvancePerGroup != update.AdvancePerGroup ||
		bracket.ThirdPlaceMatch != update.ThirdPlaceMatch
	scoring := bracket.PointsWin != update.PointsWin ||
		bracket.PointsDraw != update.PointsDraw ||
		bracket.PointsLoss != update.PointsLoss
	if generated && structural {
		return ErrBracketLocked
	}

	if !sameID(bracket.CompetitionID, update.CompetitionID) {
		if competition, err := linkedCompetition(bracket); err != nil {
			return err
		} else if competition != nil {
			return ErrBracketLinkedEnabled
		}
	}

	bracket.Name = update.Name
	bracket.Description = update.Description
	bracket.CompetitionID = update.CompetitionID
	bracket.Published = update.Published
	bracket.GroupCount = update.GroupCount
	bracket.AdvancePerGroup = update.AdvancePerGroup
	bracket.ThirdPlaceMatch = update.ThirdPlaceMatch
	bracket.PointsWin = update.PointsWin
	bracket.PointsDraw = update.PointsDraw
	bracket.PointsLoss = update.PointsLoss
	if err := models.UpdateBracket(bracket); err != nil {
		return err
	}

	// 积分规则变化会影响小组排名，进而影响出线签位
	if generated && scoring {
		return resolveAndSave(bracket.ID)
	}
	return nil
}

// ReorderBracketParticipants 按给定顺序重排种子，groups 非空时同时设置分组
func ReorderBracketParticipants(bracket *types.Bracket, order []int, groups map[int]int) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if err := EnsureBracketEditable(bracket.ID); err != nil {
		return err
	}
	if err := EnsureBracketStructureMutable(bracket); err != nil {
		return err
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return err
	}
	byID := make(map[int]*types.BracketParticipant, len(participants))
	for _, p := range participants {
		byID[p.ID] = p
	}
	if len(order) != len(participants) {
		return ErrBracketOrderMismatch
	}
	seen := make(map[int]bool, len(order))
	for i, id := range order {
		p, ok := byID[id]
		if !ok || seen[id] {
			return ErrBracketOrderMismatch
		}
		seen[id] = true
		p.Seed = i + 1
		if g, ok := groups[id]; ok {
			p.GroupIndex = g
		}
	}
	return models.SaveBracketParticipantOrder(participants)
}

// AutoGroupBracketParticipants 按当前种子蛇形分组
func AutoGroupBracketParticipants(bracket *types.Bracket) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if err := EnsureBracketEditable(bracket.ID); err != nil {
		return err
	}
	if err := EnsureBracketStructureMutable(bracket); err != nil {
		return err
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return err
	}
	AssignSnakeGroups(participants, bracket.GroupCount)
	return models.SaveBracketParticipantOrder(participants)
}

// GenerateBracket 依据当前参赛方与种子生成（或重新生成）对阵，会清空已录入的全部结果
func GenerateBracket(bracket *types.Bracket) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if err := EnsureBracketStructureMutable(bracket); err != nil {
		return err
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return err
	}
	matches, err := GenerateBracketMatches(bracket, participants)
	if err != nil {
		return err
	}
	ResolveBracket(bracket, participants, matches)
	return models.ReplaceBracketMatches(bracket.ID, matches)
}

// ResetBracket 清空已生成的对阵，恢复到可编辑参赛方的状态
func ResetBracket(bracket *types.Bracket) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()
	if err := EnsureBracketStructureMutable(bracket); err != nil {
		return err
	}
	return models.DeleteBracketMatches(bracket.ID)
}

// BracketMatchResult 比赛结果录入
type BracketMatchResult struct {
	Score1      *float64
	Score2      *float64
	WinnerID    *int
	IsDraw      bool
	Clear       bool // 为 true 时清空结果
	ScheduledAt *time.Time
	Venue       string
	Note        string
}

// UpdateBracketMatch 录入或修改单场比赛结果，并级联推导后续比赛
//
// 对阵表所属项目启用对阵图时：仅在项目进行中可修改比分（时间、地点、备注不受限）；
// 比分修改后若全部完赛，自动按名次写入成绩、置为已完成并计算积分，返回 completed=true。
// operatorID 为操作的管理员，作为成绩提交人记录。
func UpdateBracketMatch(
	bracket *types.Bracket,
	matchID int,
	result *BracketMatchResult,
	operatorID int,
) (bool, error) {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return false, err
	}
	matches, err := models.GetBracketMatches(bracket.ID)
	if err != nil {
		return false, err
	}
	var target *types.BracketMatch
	for _, m := range matches {
		if m.ID == matchID {
			target = m
			break
		}
	}
	if target == nil {
		return false, models.ErrBracketMatchNotFound
	}

	// 先按当前数据推导一次，确保参赛方是最新的
	ResolveBracket(bracket, participants, matches)

	target.ScheduledAt = result.ScheduledAt
	target.Venue = result.Venue
	target.Note = result.Note

	before := resultSignature(target)
	if result.Clear {
		clearResult(target)
	} else if err := applyMatchResult(target, result); err != nil {
		return false, err
	}
	resultChanged := resultSignature(target) != before

	// 比分有变化时才校验项目进程（仅改时间地点不受限）
	var competition *types.Competition
	if resultChanged {
		competition, err = ensureResultEditable(bracket)
		if err != nil {
			return false, err
		}
	}

	_, standings := ResolveBracket(bracket, participants, matches)
	// 结果可能影响任意后续比赛，全部写回最简单可靠
	if err := models.SaveBracketMatches(matches); err != nil {
		return false, err
	}

	if competition == nil {
		return false, nil
	}
	return completeCompetitionFromBracket(competition, bracket, participants, matches, standings, operatorID)
}

// resultSignature 单场比赛结果的摘要，用于判断本次是否改动了比分
func resultSignature(m *types.BracketMatch) string {
	return fmt.Sprintf("%v|%v|%v|%v|%v",
		m.Completed, ptrValue(m.WinnerID), m.IsDraw, floatPtrValue(m.Score1), floatPtrValue(m.Score2))
}

// applyMatchResult 校验并写入结果
func applyMatchResult(m *types.BracketMatch, result *BracketMatchResult) error {
	hasResult := result.WinnerID != nil || result.IsDraw || result.Score1 != nil || result.Score2 != nil
	if !hasResult {
		// 仅修改时间、地点、备注
		return nil
	}
	if m.Status != types.MatchStatusScheduled && m.Status != types.MatchStatusCompleted {
		return ErrBracketMatchNotPlayable
	}
	isGroup := m.Stage == types.StageGroup

	winnerID := result.WinnerID
	isDraw := result.IsDraw
	// 未指定胜者时按比分判定
	if winnerID == nil && !isDraw && result.Score1 != nil && result.Score2 != nil {
		switch {
		case *result.Score1 > *result.Score2:
			winnerID = m.P1ID
		case *result.Score2 > *result.Score1:
			winnerID = m.P2ID
		default:
			isDraw = true
		}
	}

	if isDraw {
		if !isGroup {
			return ErrBracketDrawNotAllowed
		}
		winnerID = nil
	} else {
		if winnerID == nil {
			return ErrBracketWinnerRequired
		}
		if !sameID(winnerID, m.P1ID) && !sameID(winnerID, m.P2ID) {
			return ErrBracketInvalidWinner
		}
		if result.Score1 != nil && result.Score2 != nil {
			p1Wins := sameID(winnerID, m.P1ID)
			if (p1Wins && *result.Score1 < *result.Score2) || (!p1Wins && *result.Score2 < *result.Score1) {
				return ErrBracketWinnerScoreConfit
			}
		}
	}

	m.Score1 = result.Score1
	m.Score2 = result.Score2
	m.WinnerID = winnerID
	m.IsDraw = isDraw
	m.Completed = true
	m.Status = types.MatchStatusCompleted
	return nil
}

// resolveAndSave 重新推导并写回变化的比赛（调用方需持有 bracketMu）
func resolveAndSave(bracketID int) error {
	bracket, err := models.GetBracketByID(bracketID)
	if err != nil {
		return err
	}
	participants, err := models.GetBracketParticipants(bracketID)
	if err != nil {
		return err
	}
	matches, err := models.GetBracketMatches(bracketID)
	if err != nil {
		return err
	}
	changed, _ := ResolveBracket(bracket, participants, matches)
	return models.SaveBracketMatches(changed)
}
