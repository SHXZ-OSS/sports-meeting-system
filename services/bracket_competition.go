package services

import (
	"errors"
	"fmt"
	"maps"
	"sort"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// 比赛项目与对阵图联动相关错误
var (
	ErrBracketUnsupportedCompetition = errors.New("仅报名项目没有成绩，不能使用对阵图")
	ErrBracketTypeMismatch           = errors.New("对阵表参赛方类型与比赛项目不符：个人赛需以学生为参赛方，团体赛与全校性比赛需以班级为参赛方")
	ErrBracketToggleWithScores       = errors.New("该项目已有成绩，请先在成绩与赛事进程中删除成绩后再切换对阵图")
	ErrBracketCompetitionNotRunning  = errors.New("比赛尚未开始，请先在成绩与赛事进程中开始比赛再录入比分")
	ErrBracketCompetitionFinished    = errors.New("比赛已出成绩，请先在成绩与赛事进程中退回进行中再修改")
	ErrBracketNotSettled             = errors.New("对阵尚未全部完赛，无法生成名次")
	ErrBracketLinkedEnabled          = errors.New("所属比赛项目已启用对阵图，请先在项目管理中关闭对阵图")
	ErrBracketCompetitionNoMatches   = errors.New("该项目使用对阵图，请先在对阵图管理中添加参赛方并生成对阵")
)

// ParticipantTypeForCompetition 比赛类型对应的参赛方类型：个人赛为学生，团体赛与全校性比赛为班级
func ParticipantTypeForCompetition(t types.CompetitionType) (types.BracketParticipantType, error) {
	switch t {
	case types.TypeIndividual:
		return types.ParticipantTypeStudent, nil
	case types.TypeTeam, types.TypeSchool:
		return types.ParticipantTypeClass, nil
	case types.TypeRegistration:
		return "", ErrBracketUnsupportedCompetition
	default:
		return "", ErrBracketUnsupportedCompetition
	}
}

// ValidateBracketLink 校验对阵表可以关联到该比赛项目（类型匹配、项目未被其他对阵表占用）
func ValidateBracketLink(bracket *types.Bracket, competition *types.Competition) error {
	want, err := ParticipantTypeForCompetition(competition.CompetitionType)
	if err != nil {
		return err
	}
	if bracket.ParticipantType != want {
		return ErrBracketTypeMismatch
	}
	return models.EnsureCompetitionUnlinked(competition.ID, bracket.ID)
}

// CheckBracketToggle 写入任何数据前校验能否把对阵图切换为 enabled（不修改数据）
// competitionType 为保存后的比赛类型；status 为当前状态，新建项目传空
func CheckBracketToggle(competitionType types.CompetitionType, status types.CompetitionStatus, enabled bool) error {
	if status == types.StatusPendingScoreReview || status == types.StatusCompleted {
		return ErrBracketToggleWithScores
	}
	if !enabled {
		return nil
	}
	_, err := ParticipantTypeForCompetition(competitionType)
	return err
}

// SetCompetitionBracket 开启或关闭比赛项目的对阵图
//
// 开启时若项目尚无对阵表则按项目创建一个（名称同项目、参赛方类型由比赛类型决定），
// 已有关联的对阵表则直接复用；关闭时只修改开关，对阵数据保留，重新开启即恢复。
// 已有成绩时禁止切换，避免手动成绩与对阵名次混在一起。
func SetCompetitionBracket(competition *types.Competition, enabled bool, format types.BracketFormat) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if competition.BracketEnabled == enabled {
		return nil
	}
	if competition.Status == types.StatusPendingScoreReview || competition.Status == types.StatusCompleted {
		return ErrBracketToggleWithScores
	}
	if !enabled {
		return models.SetCompetitionBracketEnabled(competition.ID, false)
	}

	participantType, err := ParticipantTypeForCompetition(competition.CompetitionType)
	if err != nil {
		return err
	}
	existing, err := models.GetBracketByCompetitionID(competition.ID)
	switch {
	case err == nil:
		if existing.ParticipantType != participantType {
			return ErrBracketTypeMismatch
		}
	case errors.Is(err, models.ErrBracketNotFound):
		if format == "" {
			format = types.FormatSingleElimination
		}
		bracket := &types.Bracket{
			EventID:         competition.EventID,
			CompetitionID:   &competition.ID,
			Name:            competition.Name,
			Format:          format,
			ParticipantType: participantType,
			GroupCount:      1,
			PointsWin:       3,
			PointsDraw:      1,
			PointsLoss:      0,
			Published:       true,
		}
		switch format {
		case types.FormatRoundRobin:
		case types.FormatGroupKnockout:
			bracket.GroupCount, bracket.AdvancePerGroup = 2, 2
		case types.FormatSingleElimination, types.FormatDoubleElimination:
		default:
			return ErrBracketUnknownFormat
		}
		if err := models.CreateBracket(bracket); err != nil {
			return err
		}
	default:
		return err
	}
	return models.SetCompetitionBracketEnabled(competition.ID, true)
}

// linkedCompetition 返回对阵表所属且已启用对阵图的比赛项目；独立对阵表或项目已关闭对阵图时返回 nil
func linkedCompetition(bracket *types.Bracket) (*types.Competition, error) {
	if bracket.CompetitionID == nil {
		return nil, nil //nolint:nilnil // 未关联比赛项目是正常情况
	}
	competition, err := models.GetCompetitionByID(*bracket.CompetitionID)
	if err != nil {
		return nil, err
	}
	if !competition.BracketEnabled {
		return nil, nil //nolint:nilnil // 项目已关闭对阵图，按独立对阵表处理
	}
	return competition, nil
}

// EnsureBracketStructureMutable 已启用对阵图的项目出成绩后，禁止重新生成、重置或调整参赛方
func EnsureBracketStructureMutable(bracket *types.Bracket) error {
	competition, err := linkedCompetition(bracket)
	if err != nil || competition == nil {
		return err
	}
	if competition.Status == types.StatusPendingScoreReview || competition.Status == types.StatusCompleted {
		return ErrBracketCompetitionFinished
	}
	return nil
}

// EnsureCompetitionCanStart 使用对阵图的项目开始比赛前必须已生成对阵
func EnsureCompetitionCanStart(competition *types.Competition) error {
	if !competition.BracketEnabled {
		return nil
	}
	bracket, err := models.GetBracketByCompetitionID(competition.ID)
	if err != nil {
		if errors.Is(err, models.ErrBracketNotFound) {
			return ErrBracketCompetitionNoMatches
		}
		return err
	}
	generated, err := models.HasBracketMatches(bracket.ID)
	if err != nil {
		return err
	}
	if !generated {
		return ErrBracketCompetitionNoMatches
	}
	return nil
}

// ensureResultEditable 已启用对阵图的项目仅在进行中可以录入或清除比分（调用方需持有 bracketMu）
func ensureResultEditable(bracket *types.Bracket) (*types.Competition, error) {
	competition, err := linkedCompetition(bracket)
	if err != nil || competition == nil {
		return nil, err
	}
	switch competition.Status {
	case types.StatusInProgress:
		return competition, nil
	case types.StatusPendingScoreReview, types.StatusCompleted:
		return nil, ErrBracketCompetitionFinished
	case types.StatusPendingApproval, types.StatusApproved, types.StatusCheckingIn, types.StatusRejected:
		return nil, ErrBracketCompetitionNotRunning
	default:
		return nil, ErrBracketCompetitionNotRunning
	}
}

// completeCompetitionFromBracket 对阵全部完赛后写入名次、置为已完成并计算积分（调用方需持有 bracketMu）
// 返回是否已完赛
func completeCompetitionFromBracket(
	competition *types.Competition,
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
	matches []*types.BracketMatch,
	standings []types.BracketGroupStanding,
	submitterID int,
) (bool, error) {
	ranks, err := ComputeBracketPlacements(bracket, matches, standings)
	if errors.Is(err, ErrBracketNotSettled) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	placements := make([]models.BracketPlacement, 0, len(participants))
	for _, p := range participants {
		rank, ok := ranks[p.ID]
		if !ok {
			continue
		}
		placements = append(placements, models.BracketPlacement{
			StudentID: p.StudentID,
			ClassID:   p.ClassID,
			Ranking:   rank,
		})
	}
	if err := models.WriteBracketPlacements(competition.ID, placements, submitterID); err != nil {
		return false, err
	}
	if err := models.RecalculatePointsByCompetitionID(competition.ID); err != nil {
		return false, err
	}

	// 与人工审核通过一致：按全局配置钉钉通知成绩公布
	if config.Get().DingTalk.NotifyPublished {
		competition.Status = types.StatusCompleted
		if err := SendScorePublishedNotice(competition); err != nil {
			logger.L.Warn(fmt.Sprintf("发送成绩公布通知失败 competition=%d: %v", competition.ID, err))
		}
	}
	return true, nil
}

// CompleteCompetitionFromBracket 手动按对阵结果完赛（自动完赛失败或退回后未改动比分时使用）
func CompleteCompetitionFromBracket(competition *types.Competition, submitterID int) error {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if !competition.BracketEnabled {
		return errors.New("该项目未使用对阵图")
	}
	if competition.Status != types.StatusInProgress {
		return ErrBracketCompetitionNotRunning
	}
	bracket, err := models.GetBracketByCompetitionID(competition.ID)
	if err != nil {
		return err
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return err
	}
	matches, err := models.GetBracketMatches(bracket.ID)
	if err != nil {
		return err
	}
	changed, standings := ResolveBracket(bracket, participants, matches)
	if err := models.SaveBracketMatches(changed); err != nil {
		return err
	}
	done, err := completeCompetitionFromBracket(competition, bracket, participants, matches, standings, submitterID)
	if err != nil {
		return err
	}
	if !done {
		return ErrBracketNotSettled
	}
	return nil
}

// ==== 名次计算 ====

// ComputeBracketPlacements 由已完赛的对阵计算每个参赛方的名次（参赛方 ID → 名次，允许并列）
//
//   - 淘汰赛：冠军 1、亚军 2；有季军赛时季军赛胜负分列 3、4；其余按被淘汰的轮次并列，越晚淘汰名次越前
//   - 双败淘汰：冠亚军由总决赛决定，其余按在败者组被淘汰的轮次并列
//   - 循环赛：取小组积分榜名次，多个小组时各组同名次并列
//   - 小组赛 + 淘汰赛：出线者按淘汰赛排名，未出线者按小组名次并列排在其后
func ComputeBracketPlacements(
	bracket *types.Bracket,
	matches []*types.BracketMatch,
	standings []types.BracketGroupStanding,
) (map[int]int, error) {
	for _, m := range matches {
		if m.Status == types.MatchStatusPending || m.Status == types.MatchStatusScheduled {
			return nil, ErrBracketNotSettled
		}
	}
	if len(matches) == 0 {
		return nil, ErrBracketNotSettled
	}

	switch bracket.Format {
	case types.FormatRoundRobin:
		return groupPlacements(standings, nil, 1), nil
	case types.FormatSingleElimination:
		return eliminationPlacements(matches, types.StageMain), nil
	case types.FormatDoubleElimination:
		return eliminationPlacements(matches, types.StageGrandFinal), nil
	case types.FormatGroupKnockout:
		ranks := eliminationPlacements(matches, types.StageMain)
		return groupPlacements(standings, ranks, len(ranks)+1), nil
	default:
		return nil, ErrBracketUnknownFormat
	}
}

// matchLoser 已完赛比赛的败者；轮空、作废或平局返回 0
func matchLoser(m *types.BracketMatch) int {
	if m.Status != types.MatchStatusCompleted || m.WinnerID == nil || m.P1ID == nil || m.P2ID == nil {
		return 0
	}
	if *m.P1ID == *m.WinnerID {
		return *m.P2ID
	}
	return *m.P1ID
}

// eliminationPlacements 淘汰阶段名次；finalStage 为决定冠亚军的阶段（单败为 main，双败为 grand_final）
func eliminationPlacements(matches []*types.BracketMatch, finalStage types.BracketStage) map[int]int {
	ranks := make(map[int]int)

	// 决定冠亚军的比赛：finalStage 中轮次最大的一场
	var final *types.BracketMatch
	for _, m := range matches {
		if m.Stage == finalStage && (final == nil || m.Round > final.Round) {
			final = m
		}
	}
	if final == nil || final.WinnerID == nil {
		return ranks
	}
	ranks[*final.WinnerID] = 1
	if loser := matchLoser(final); loser != 0 {
		ranks[loser] = 2
	}

	// 季军赛：双方都确定且已完赛时直接决定 3、4 名
	for _, m := range matches {
		if m.Stage != types.StageThirdPlace || m.Status != types.MatchStatusCompleted || m.WinnerID == nil {
			continue
		}
		ranks[*m.WinnerID] = len(ranks) + 1
		if loser := matchLoser(m); loser != 0 {
			ranks[loser] = len(ranks) + 1
		}
	}

	// 其余参赛方：取最后一场失利（即被淘汰的那场），按阶段与轮次分组
	type elimKey struct {
		stageOrder int
		round      int
	}
	stageOrder := map[types.BracketStage]int{
		types.StageGroup:      0, // 小组赛失利不算淘汰，下方已跳过
		types.StageMain:       1,
		types.StageLosers:     2, // 双败中败者组淘汰晚于胜者组
		types.StageThirdPlace: 3,
		types.StageGrandFinal: 4, // 总决赛败者已是亚军，下方已跳过
	}
	lastLoss := make(map[int]elimKey)
	for _, m := range matches {
		if m.Stage == types.StageGroup || m.Stage == types.StageGrandFinal {
			continue
		}
		loser := matchLoser(m)
		if loser == 0 {
			continue
		}
		key := elimKey{stageOrder[m.Stage], m.Round}
		prev, ok := lastLoss[loser]
		if !ok || key.stageOrder > prev.stageOrder ||
			(key.stageOrder == prev.stageOrder && key.round > prev.round) {
			lastLoss[loser] = key
		}
	}

	groups := make(map[elimKey][]int)
	for id, key := range lastLoss {
		if _, placed := ranks[id]; placed {
			continue
		}
		groups[key] = append(groups[key], id)
	}
	keys := make([]elimKey, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	// 越晚淘汰（阶段越靠后、轮次越大）名次越靠前
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].stageOrder != keys[j].stageOrder {
			return keys[i].stageOrder > keys[j].stageOrder
		}
		return keys[i].round > keys[j].round
	})
	for _, k := range keys {
		rank := len(ranks) + 1
		for _, id := range groups[k] {
			ranks[id] = rank
		}
	}
	return ranks
}

// groupPlacements 按小组名次补充名次：placed 中已有名次的参赛方跳过（出线者），
// 其余各组同名次并列，从 startRank 起按名次依次排列
func groupPlacements(standings []types.BracketGroupStanding, placed map[int]int, startRank int) map[int]int {
	ranks := make(map[int]int, len(placed))
	maps.Copy(ranks, placed)

	byGroupRank := make(map[int][]int)
	maxRank := 0
	for _, g := range standings {
		for _, row := range g.Rows {
			if _, ok := ranks[row.ParticipantID]; ok {
				continue
			}
			byGroupRank[row.Rank] = append(byGroupRank[row.Rank], row.ParticipantID)
			maxRank = max(maxRank, row.Rank)
		}
	}

	next := startRank
	for r := 1; r <= maxRank; r++ {
		ids := byGroupRank[r]
		if len(ids) == 0 {
			continue
		}
		for _, id := range ids {
			ranks[id] = next
		}
		next += len(ids)
	}
	return ranks
}
