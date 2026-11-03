package services

import (
	"fmt"
	"sort"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

const (
	// 项目未填结束时间时的估算时长
	defaultCompetitionDuration = time.Hour
	// 对阵表未自动排期过时，每场比赛的估算时长
	defaultMatchDuration = 30 * time.Minute
)

// BuildPublicSchedule 汇总当前届次的赛程：
// 使用对阵图、已公开且已排期的项目按场次展开；其余有开始时间的项目按项目时段展示
func BuildPublicSchedule(eventID int) ([]types.PublicScheduleItem, error) {
	competitions, _, err := models.GetPublicCompetitions(0, 0, []types.CompetitionStatus{
		types.StatusApproved, types.StatusCheckingIn, types.StatusInProgress,
		types.StatusPendingScoreReview, types.StatusCompleted,
	}, "")
	if err != nil {
		return nil, err
	}
	brackets, _, err := models.ListBrackets(eventID, 0, 0, "", true)
	if err != nil {
		return nil, err
	}
	byCompetition := make(map[int]*types.Bracket, len(brackets))
	for _, b := range brackets {
		if b.CompetitionID != nil {
			byCompetition[*b.CompetitionID] = b
		}
	}

	items := make([]types.PublicScheduleItem, 0, len(competitions))
	for _, c := range competitions {
		if b := byCompetition[c.ID]; c.BracketEnabled && b != nil {
			matches, err := bracketScheduleItems(c, b)
			if err != nil {
				return nil, err
			}
			if len(matches) > 0 {
				items = append(items, matches...)
				continue
			}
		}
		if item, ok := competitionScheduleItem(c); ok {
			items = append(items, item)
		}
	}

	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		return a.Venue < b.Venue
	})
	return items, nil
}

// competitionScheduleItem 按项目开始、结束时间展示；未填开始时间的项目不进入赛程
func competitionScheduleItem(c *types.Competition) (types.PublicScheduleItem, bool) {
	if c.StartTime == nil {
		return types.PublicScheduleItem{}, false
	}
	item := types.PublicScheduleItem{
		Kind:              types.ScheduleKindCompetition,
		CompetitionID:     c.ID,
		CompetitionName:   c.Name,
		CompetitionStatus: c.Status,
		StartAt:           *c.StartTime,
		Venue:             c.Venue,
	}
	if c.EndTime != nil && c.EndTime.After(*c.StartTime) {
		item.EndAt = *c.EndTime
	} else {
		item.EndAt = c.StartTime.Add(defaultCompetitionDuration)
		item.EndEstimated = true
	}
	return item, true
}

// bracketScheduleItems 对阵表中已排期且需要进行的比赛
func bracketScheduleItems(c *types.Competition, b *types.Bracket) ([]types.PublicScheduleItem, error) {
	detail, err := GetBracketDetail(b.ID)
	if err != nil {
		return nil, err
	}
	duration := defaultMatchDuration
	if b.ScheduleConfig != nil && b.ScheduleConfig.MatchMinutes > 0 {
		duration = time.Duration(b.ScheduleConfig.MatchMinutes) * time.Minute
	}
	names := make(map[int]string, len(detail.Participants))
	for _, p := range detail.Participants {
		names[p.ID] = p.Name
	}
	bySeq := make(map[int]*types.BracketMatch, len(detail.Matches))
	maxRound := make(map[types.BracketStage]int)
	hasGrandFinal := false
	for _, m := range detail.Matches {
		bySeq[m.Seq] = m
		maxRound[m.Stage] = max(maxRound[m.Stage], m.Round)
		hasGrandFinal = hasGrandFinal || m.Stage == types.StageGrandFinal
	}

	var items []types.PublicScheduleItem
	for _, m := range detail.Matches {
		if m.ScheduledAt == nil || !isPlayable(m) {
			continue
		}
		item := types.PublicScheduleItem{
			Kind:              types.ScheduleKindMatch,
			CompetitionID:     c.ID,
			CompetitionName:   c.Name,
			CompetitionStatus: c.Status,
			BracketID:         b.ID,
			MatchID:           m.ID,
			MatchSeq:          m.Seq,
			RoundLabel:        roundLabel(m, maxRound[m.Stage], hasGrandFinal),
			MatchStatus:       m.Status,
			Side1:             sideName(m, 1, names, bySeq),
			Side2:             sideName(m, 2, names, bySeq),
			StartAt:           *m.ScheduledAt,
			EndAt:             m.ScheduledAt.Add(duration),
			Venue:             m.Venue,
		}
		if m.Completed {
			item.Score1, item.Score2 = m.Score1, m.Score2
			item.WinnerSide = winnerSide(m)
		}
		items = append(items, item)
	}
	return items, nil
}

// winnerSide 胜者所在一方：1 或 2，平局为 0
func winnerSide(m *types.BracketMatch) int {
	switch {
	case m.WinnerID == nil:
		return 0
	case m.P1ID != nil && *m.WinnerID == *m.P1ID:
		return 1
	case m.P2ID != nil && *m.WinnerID == *m.P2ID:
		return 2
	default:
		return 0
	}
}

// groupLabel 小组名称：0 → A组，26 起退化为数字（与前端一致）
func groupLabel(index int) string {
	if index < 26 {
		return string(rune(65+index)) + "组"
	}
	return fmt.Sprintf("第%d组", index+1)
}

// roundLabel 比赛所在轮次的标题（与前端 getMatchRoundLabel 一致）
func roundLabel(m *types.BracketMatch, totalRounds int, hasGrandFinal bool) string {
	switch m.Stage {
	case types.StageGroup:
		return fmt.Sprintf("%s 第 %d 轮", groupLabel(m.GroupIndex), m.Round)
	case types.StageThirdPlace:
		return "季军赛"
	case types.StageGrandFinal:
		if m.Round == 1 {
			return "总决赛"
		}
		return fmt.Sprintf("总决赛第 %d 场", m.Round)
	case types.StageLosers:
		if m.Round == totalRounds {
			return "败者组决赛"
		}
		return fmt.Sprintf("败者组第 %d 轮", m.Round)
	case types.StageMain:
		switch totalRounds - m.Round {
		case 0:
			if hasGrandFinal {
				return "胜者组决赛"
			}
			return "决赛"
		case 1:
			return "半决赛"
		case 2:
			return "四分之一决赛"
		}
	}
	return fmt.Sprintf("第 %d 轮", m.Round)
}

// sideName 参赛方名称；未定时为签位说明（与前端 getSlotPlaceholder 一致）
func sideName(
	m *types.BracketMatch,
	side int,
	names map[int]string,
	bySeq map[int]*types.BracketMatch,
) string {
	id, source, ref := m.P1ID, m.Slot1Source, m.Slot1Ref
	if side == 2 {
		id, source, ref = m.P2ID, m.Slot2Source, m.Slot2Ref
	}
	if id != nil {
		if name := names[*id]; name != "" {
			return name
		}
	}
	from := bySeq[ref]
	switch source {
	case types.SlotSourceWinner:
		if from == nil {
			return "待定"
		}
		if from.Status == types.MatchStatusVoid {
			return "轮空"
		}
		return fmt.Sprintf("#%d 胜者", ref)
	case types.SlotSourceLoser:
		if from == nil {
			return "待定"
		}
		if from.Status == types.MatchStatusBye || from.Status == types.MatchStatusVoid {
			return "轮空"
		}
		return fmt.Sprintf("#%d 败者", ref)
	case types.SlotSourceGroupRank:
		return fmt.Sprintf("%s第 %d 名", groupLabel(ref/types.GroupRankRefBase), ref%types.GroupRankRefBase)
	case types.SlotSourceNone:
		return "轮空"
	case types.SlotSourceParticipant:
	}
	return "待定"
}
