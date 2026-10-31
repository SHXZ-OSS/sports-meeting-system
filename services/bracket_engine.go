package services

import (
	"errors"
	"fmt"
	"math/bits"
	"sort"

	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// 对阵生成相关错误
var (
	ErrBracketTooFewParticipants = errors.New("参赛方不足 2 个，无法生成对阵")
	ErrBracketTooManyParticipant = errors.New("参赛方超过 256 个，无法生成对阵")
	ErrBracketInvalidGroupCount  = errors.New("小组数量无效：每个小组至少需要 2 个参赛方")
	ErrBracketInvalidAdvance     = errors.New("每组出线数量无效：需不少于 1 且小于小组最少人数，且出线总数不少于 2")
	ErrBracketInvalidGroupIndex  = errors.New("存在未分组或小组序号超出范围的参赛方")
	ErrBracketUnknownFormat      = errors.New("未知的赛制")
)

// maxBracketParticipants 单个对阵表参赛方上限
const maxBracketParticipants = 256

// GenerateBracketMatches 按赛制生成全部比赛（尚未落库，ID 为 0，签位通过 Seq 互相引用）
// participants 需已按种子排好序（种子 1 在前）
func GenerateBracketMatches(
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
) ([]*types.BracketMatch, error) {
	n := len(participants)
	if n < 2 {
		return nil, ErrBracketTooFewParticipants
	}
	if n > maxBracketParticipants {
		return nil, ErrBracketTooManyParticipant
	}

	g := &matchGenerator{bracketID: bracket.ID}
	switch bracket.Format {
	case types.FormatSingleElimination:
		slots := make([]slotRef, n)
		for i, p := range participants {
			slots[i] = slotRef{types.SlotSourceParticipant, p.ID}
		}
		g.singleElimination(slots, bracket.ThirdPlaceMatch)
	case types.FormatDoubleElimination:
		slots := make([]slotRef, n)
		for i, p := range participants {
			slots[i] = slotRef{types.SlotSourceParticipant, p.ID}
		}
		g.doubleElimination(slots)
	case types.FormatRoundRobin:
		groups, err := splitGroups(bracket, participants)
		if err != nil {
			return nil, err
		}
		g.roundRobin(groups)
	case types.FormatGroupKnockout:
		groups, err := splitGroups(bracket, participants)
		if err != nil {
			return nil, err
		}
		if err := validateAdvance(bracket, groups); err != nil {
			return nil, err
		}
		g.roundRobin(groups)
		g.singleElimination(groupQualifierSlots(len(groups), bracket.AdvancePerGroup), bracket.ThirdPlaceMatch)
	default:
		return nil, ErrBracketUnknownFormat
	}
	return g.matches, nil
}

// AssignSnakeGroups 按种子顺序蛇形分组（1→A、2→B、…、末组后折返），使各组实力均衡
func AssignSnakeGroups(participants []*types.BracketParticipant, groupCount int) {
	if groupCount < 1 {
		groupCount = 1
	}
	for i, p := range participants {
		row, col := i/groupCount, i%groupCount
		if row%2 == 1 {
			col = groupCount - 1 - col
		}
		p.GroupIndex = col
	}
}

// ==== 生成器 ====

// slotRef 签位来源
type slotRef struct {
	source types.BracketSlotSource
	ref    int
}

var noneSlot = slotRef{types.SlotSourceNone, 0}

type matchGenerator struct {
	bracketID int
	matches   []*types.BracketMatch
}

// add 追加一场比赛并返回其 Seq（按追加顺序递增，保证来源比赛 Seq 更小）
func (g *matchGenerator) add(stage types.BracketStage, groupIndex, round, position int, s1, s2 slotRef) int {
	seq := len(g.matches) + 1
	g.matches = append(g.matches, &types.BracketMatch{
		BracketID:   g.bracketID,
		Stage:       stage,
		GroupIndex:  groupIndex,
		Round:       round,
		Position:    position,
		Seq:         seq,
		Slot1Source: s1.source,
		Slot1Ref:    s1.ref,
		Slot2Source: s2.source,
		Slot2Ref:    s2.ref,
		Status:      types.MatchStatusPending,
	})
	return seq
}

// eliminationRounds 生成标准淘汰树（种子 1 与 2 只会在决赛相遇，空签位轮空给高种子）
// 返回每一轮各场比赛的 Seq
func (g *matchGenerator) eliminationRounds(stage types.BracketStage, slots []slotRef) [][]int {
	size := nextPowerOfTwo(len(slots))
	order := seedOrder(size)

	var rounds [][]int
	first := make([]int, 0, size/2)
	for i := 0; i < size; i += 2 {
		first = append(first, g.add(stage, 0, 1, i/2, seedSlot(slots, order[i]), seedSlot(slots, order[i+1])))
	}
	rounds = append(rounds, first)

	for prev := first; len(prev) > 1; {
		round := len(rounds) + 1
		next := make([]int, 0, len(prev)/2)
		for i := 0; i < len(prev); i += 2 {
			next = append(next, g.add(stage, 0, round, i/2,
				slotRef{types.SlotSourceWinner, prev[i]},
				slotRef{types.SlotSourceWinner, prev[i+1]}))
		}
		rounds = append(rounds, next)
		prev = next
	}
	return rounds
}

// singleElimination 单败淘汰，可选季军赛（半决赛两名败者）
func (g *matchGenerator) singleElimination(slots []slotRef, thirdPlace bool) {
	rounds := g.eliminationRounds(types.StageMain, slots)
	if thirdPlace && len(rounds) >= 2 {
		semi := rounds[len(rounds)-2]
		g.add(types.StageThirdPlace, 0, 1, 0,
			slotRef{types.SlotSourceLoser, semi[0]},
			slotRef{types.SlotSourceLoser, semi[1]})
	}
}

// doubleElimination 双败淘汰：胜者组 + 败者组 + 总决赛（胜者组冠军 vs 败者组冠军）
//
// 败者组结构（胜者组共 R 轮）：
//   - 第 1 轮：胜者组第 1 轮败者两两对决
//   - 第 2k 轮：败者组上一轮胜者 vs 胜者组第 k+1 轮掉下来的败者
//   - 第 2k+1 轮：败者组上一轮胜者两两对决
func (g *matchGenerator) doubleElimination(slots []slotRef) {
	wb := g.eliminationRounds(types.StageMain, slots)
	wbFinal := wb[len(wb)-1][0]

	if len(wb) == 1 {
		// 只有两个参赛方：总决赛为胜者组决赛胜者 vs 败者
		g.add(types.StageGrandFinal, 0, 1, 0,
			slotRef{types.SlotSourceWinner, wbFinal},
			slotRef{types.SlotSourceLoser, wbFinal})
		return
	}

	lbRound := 1
	var prev []int
	for i := 0; i < len(wb[0]); i += 2 {
		prev = append(prev, g.add(types.StageLosers, 0, lbRound, i/2,
			slotRef{types.SlotSourceLoser, wb[0][i]},
			slotRef{types.SlotSourceLoser, wb[0][i+1]}))
	}

	for k := 1; k < len(wb); k++ {
		// 掉落轮：隔轮翻转落位顺序，尽量避免胜者组刚交过手的双方立刻重赛
		lbRound++
		drop := wb[k]
		next := make([]int, 0, len(prev))
		for j := range prev {
			loserIdx := j
			if k%2 == 1 {
				loserIdx = len(drop) - 1 - j
			}
			next = append(next, g.add(types.StageLosers, 0, lbRound, j,
				slotRef{types.SlotSourceWinner, prev[j]},
				slotRef{types.SlotSourceLoser, drop[loserIdx]}))
		}
		prev = next

		// 合并轮：除最后一次掉落外，败者组胜者两两对决
		if len(prev) > 1 {
			lbRound++
			merged := make([]int, 0, len(prev)/2)
			for j := 0; j < len(prev); j += 2 {
				merged = append(merged, g.add(types.StageLosers, 0, lbRound, j/2,
					slotRef{types.SlotSourceWinner, prev[j]},
					slotRef{types.SlotSourceWinner, prev[j+1]}))
			}
			prev = merged
		}
	}

	g.add(types.StageGrandFinal, 0, 1, 0,
		slotRef{types.SlotSourceWinner, wbFinal},
		slotRef{types.SlotSourceWinner, prev[0]})
}

// roundRobin 各小组单循环（圆桌轮转法，人数为奇数时每轮一人轮空，不生成比赛）
func (g *matchGenerator) roundRobin(groups [][]*types.BracketParticipant) {
	for gi, members := range groups {
		ids := make([]int, 0, len(members)+1)
		for _, p := range members {
			ids = append(ids, p.ID)
		}
		if len(ids)%2 == 1 {
			ids = append(ids, 0) // 0 表示轮空
		}
		n := len(ids)
		for round := 1; round < n; round++ {
			position := 0
			for i := range n / 2 {
				a, b := ids[i], ids[n-1-i]
				if a == 0 || b == 0 {
					continue
				}
				g.add(types.StageGroup, gi, round, position,
					slotRef{types.SlotSourceParticipant, a},
					slotRef{types.SlotSourceParticipant, b})
				position++
			}
			// 固定第一个，其余顺时针轮转
			last := ids[n-1]
			copy(ids[2:], ids[1:n-1])
			ids[1] = last
		}
	}
}

// groupQualifierSlots 小组出线签位：按名次优先、组序其次排出种子，
// 配合标准种子排位，同组出线者在淘汰赛首轮不会相遇
func groupQualifierSlots(groupCount, advance int) []slotRef {
	slots := make([]slotRef, 0, groupCount*advance)
	for rank := 1; rank <= advance; rank++ {
		for gi := range groupCount {
			slots = append(slots, slotRef{types.SlotSourceGroupRank, gi*types.GroupRankRefBase + rank})
		}
	}
	return slots
}

// splitGroups 按参赛方的小组序号分组，并校验每组至少 2 人
func splitGroups(
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
) ([][]*types.BracketParticipant, error) {
	groupCount := max(bracket.GroupCount, 1)
	groups := make([][]*types.BracketParticipant, groupCount)
	for _, p := range participants {
		if p.GroupIndex < 0 || p.GroupIndex >= groupCount {
			return nil, ErrBracketInvalidGroupIndex
		}
		groups[p.GroupIndex] = append(groups[p.GroupIndex], p)
	}
	for _, members := range groups {
		if len(members) < 2 {
			return nil, ErrBracketInvalidGroupCount
		}
	}
	return groups, nil
}

func validateAdvance(bracket *types.Bracket, groups [][]*types.BracketParticipant) error {
	minSize := maxBracketParticipants
	for _, members := range groups {
		minSize = min(minSize, len(members))
	}
	if bracket.AdvancePerGroup < 1 || bracket.AdvancePerGroup >= minSize ||
		bracket.AdvancePerGroup*len(groups) < 2 {
		return ErrBracketInvalidAdvance
	}
	return nil
}

// seedSlot 取第 seed 号种子（从 1 开始）的签位，超出人数即为空签位
func seedSlot(slots []slotRef, seed int) slotRef {
	if seed > len(slots) {
		return noneSlot
	}
	return slots[seed-1]
}

// seedOrder 返回标准种子排位（如 8 → 1 8 4 5 2 7 3 6）
func seedOrder(size int) []int {
	order := []int{1}
	for len(order) < size {
		total := len(order)*2 + 1
		next := make([]int, 0, len(order)*2)
		for _, s := range order {
			next = append(next, s, total-s)
		}
		order = next
	}
	return order
}

func nextPowerOfTwo(n int) int {
	if n <= 2 {
		return 2
	}
	return 1 << bits.Len(uint(n-1))
}

// ==== 推导 ====

// slotState 签位推导结果
type slotState int

const (
	slotUnknown slotState = iota // 来源比赛未出结果
	slotAbsent                   // 确定无人（轮空）
	slotKnown                    // 已确定参赛方
)

type resolvedSlot struct {
	state slotState
	id    int
}

// ResolveBracket 按 Seq 顺序推导每场比赛的参赛方与状态，并计算小组积分榜
//
// 已录入结果的比赛若参赛方因上游结果修改而变化，其结果会被清空（级联重置）。
// 返回值 changed 为参赛方、结果或状态发生变化的比赛。
func ResolveBracket(
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
	matches []*types.BracketMatch,
) ([]*types.BracketMatch, []types.BracketGroupStanding) {
	sort.Slice(matches, func(i, j int) bool { return matches[i].Seq < matches[j].Seq })

	participantSet := make(map[int]bool, len(participants))
	for _, p := range participants {
		participantSet[p.ID] = true
	}

	bySeq := make(map[int]*types.BracketMatch, len(matches))
	var changed []*types.BracketMatch

	// 小组赛只依赖直接指定的参赛方，先推导完再计算积分榜
	for _, m := range matches {
		if m.Stage != types.StageGroup {
			continue
		}
		if resolveMatch(m, participantSet, bySeq, nil) {
			changed = append(changed, m)
		}
		bySeq[m.Seq] = m
	}
	standings, complete := computeStandings(bracket, participants, matches)
	rankLookup := func(ref int) resolvedSlot {
		gi, rank := ref/types.GroupRankRefBase, ref%types.GroupRankRefBase
		if gi >= len(standings) || !complete[gi] {
			return resolvedSlot{state: slotUnknown}
		}
		rows := standings[gi].Rows
		if rank < 1 || rank > len(rows) {
			return resolvedSlot{state: slotAbsent}
		}
		return resolvedSlot{state: slotKnown, id: rows[rank-1].ParticipantID}
	}

	for _, m := range matches {
		if m.Stage == types.StageGroup {
			continue
		}
		if resolveMatch(m, participantSet, bySeq, rankLookup) {
			changed = append(changed, m)
		}
		bySeq[m.Seq] = m
	}
	return changed, standings
}

// resolveMatch 推导单场比赛，返回是否有变化
func resolveMatch(
	m *types.BracketMatch,
	participantSet map[int]bool,
	bySeq map[int]*types.BracketMatch,
	rankLookup func(ref int) resolvedSlot,
) bool {
	before := matchFingerprint(m)

	s1 := resolveSlot(m.Slot1Source, m.Slot1Ref, participantSet, bySeq, rankLookup)
	s2 := resolveSlot(m.Slot2Source, m.Slot2Ref, participantSet, bySeq, rankLookup)
	newP1, newP2 := slotID(s1), slotID(s2)

	// 参赛方变化：之前录入的结果不再有效
	if m.Completed && (!sameID(m.P1ID, newP1) || !sameID(m.P2ID, newP2)) {
		clearResult(m)
	}
	m.P1ID, m.P2ID = newP1, newP2

	switch {
	case s1.state == slotKnown && s2.state == slotKnown:
		if m.Completed {
			m.Status = types.MatchStatusCompleted
		} else {
			m.Status = types.MatchStatusScheduled
			m.WinnerID = nil
			m.IsDraw = false
		}
	case s1.state == slotKnown && s2.state == slotAbsent:
		clearResult(m)
		m.Status = types.MatchStatusBye
		m.WinnerID = new(s1.id)
	case s1.state == slotAbsent && s2.state == slotKnown:
		clearResult(m)
		m.Status = types.MatchStatusBye
		m.WinnerID = new(s2.id)
	case s1.state == slotAbsent && s2.state == slotAbsent:
		clearResult(m)
		m.Status = types.MatchStatusVoid
	default:
		clearResult(m)
		m.Status = types.MatchStatusPending
	}

	return matchFingerprint(m) != before
}

func resolveSlot(
	source types.BracketSlotSource,
	ref int,
	participantSet map[int]bool,
	bySeq map[int]*types.BracketMatch,
	rankLookup func(ref int) resolvedSlot,
) resolvedSlot {
	switch source {
	case types.SlotSourceParticipant:
		if participantSet[ref] {
			return resolvedSlot{state: slotKnown, id: ref}
		}
		return resolvedSlot{state: slotAbsent}
	case types.SlotSourceWinner, types.SlotSourceLoser:
		src, ok := bySeq[ref]
		if !ok {
			return resolvedSlot{state: slotAbsent}
		}
		return outcomeSlot(src, source == types.SlotSourceWinner)
	case types.SlotSourceGroupRank:
		if rankLookup == nil {
			return resolvedSlot{state: slotUnknown}
		}
		return rankLookup(ref)
	case types.SlotSourceNone:
		return resolvedSlot{state: slotAbsent}
	default:
		return resolvedSlot{state: slotAbsent}
	}
}

// outcomeSlot 取来源比赛的胜者或败者
func outcomeSlot(src *types.BracketMatch, winner bool) resolvedSlot {
	switch src.Status {
	case types.MatchStatusCompleted:
		if src.WinnerID == nil {
			// 淘汰赛不允许平局，出现时视为未决
			return resolvedSlot{state: slotUnknown}
		}
		if winner {
			return resolvedSlot{state: slotKnown, id: *src.WinnerID}
		}
		if src.P1ID != nil && *src.P1ID != *src.WinnerID {
			return resolvedSlot{state: slotKnown, id: *src.P1ID}
		}
		if src.P2ID != nil {
			return resolvedSlot{state: slotKnown, id: *src.P2ID}
		}
		return resolvedSlot{state: slotAbsent}
	case types.MatchStatusBye:
		if winner {
			return resolvedSlot{state: slotKnown, id: *src.WinnerID}
		}
		return resolvedSlot{state: slotAbsent}
	case types.MatchStatusVoid:
		return resolvedSlot{state: slotAbsent}
	case types.MatchStatusPending, types.MatchStatusScheduled:
		return resolvedSlot{state: slotUnknown}
	default:
		return resolvedSlot{state: slotUnknown}
	}
}

// computeStandings 计算各小组积分榜；complete[g] 表示该组比赛已全部完成
// 排序：积分 > 净胜分 > 总得分 > 种子序号
func computeStandings(
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
	matches []*types.BracketMatch,
) ([]types.BracketGroupStanding, []bool) {
	if bracket.Format != types.FormatRoundRobin && bracket.Format != types.FormatGroupKnockout {
		return []types.BracketGroupStanding{}, nil
	}
	groupCount := max(bracket.GroupCount, 1)

	rows := make(map[int]*types.BracketStandingRow, len(participants))
	seeds := make(map[int]int, len(participants))
	members := make([][]int, groupCount)
	for _, p := range participants {
		if p.GroupIndex < 0 || p.GroupIndex >= groupCount {
			continue
		}
		rows[p.ID] = &types.BracketStandingRow{ParticipantID: p.ID}
		seeds[p.ID] = p.Seed
		members[p.GroupIndex] = append(members[p.GroupIndex], p.ID)
	}

	complete := make([]bool, groupCount)
	hasMatch := make([]bool, groupCount)
	for gi := range complete {
		complete[gi] = true
	}
	for _, m := range matches {
		if m.Stage != types.StageGroup || m.GroupIndex < 0 || m.GroupIndex >= groupCount {
			continue
		}
		if m.Status == types.MatchStatusVoid || m.Status == types.MatchStatusBye {
			continue
		}
		hasMatch[m.GroupIndex] = true
		if m.Status != types.MatchStatusCompleted {
			complete[m.GroupIndex] = false
			continue
		}
		applyResult(bracket, rows, m)
	}

	standings := make([]types.BracketGroupStanding, groupCount)
	for gi, ids := range members {
		list := make([]types.BracketStandingRow, 0, len(ids))
		for _, id := range ids {
			r := rows[id]
			r.ScoreDiff = r.ScoreFor - r.ScoreAgainst
			list = append(list, *r)
		}
		sort.SliceStable(list, func(i, j int) bool {
			a, b := list[i], list[j]
			if a.Points != b.Points {
				return a.Points > b.Points
			}
			if a.ScoreDiff != b.ScoreDiff {
				return a.ScoreDiff > b.ScoreDiff
			}
			if a.ScoreFor != b.ScoreFor {
				return a.ScoreFor > b.ScoreFor
			}
			return seeds[a.ParticipantID] < seeds[b.ParticipantID]
		})
		for i := range list {
			list[i].Rank = i + 1
		}
		standings[gi] = types.BracketGroupStanding{GroupIndex: gi, Rows: list}
		complete[gi] = complete[gi] && hasMatch[gi]
	}
	return standings, complete
}

func applyResult(bracket *types.Bracket, rows map[int]*types.BracketStandingRow, m *types.BracketMatch) {
	if m.P1ID == nil || m.P2ID == nil {
		return
	}
	r1, r2 := rows[*m.P1ID], rows[*m.P2ID]
	if r1 == nil || r2 == nil {
		return
	}
	s1, s2 := floatValue(m.Score1), floatValue(m.Score2)
	r1.Played++
	r2.Played++
	r1.ScoreFor += s1
	r1.ScoreAgainst += s2
	r2.ScoreFor += s2
	r2.ScoreAgainst += s1

	switch {
	case m.IsDraw || m.WinnerID == nil:
		r1.Drawn++
		r2.Drawn++
		r1.Points += bracket.PointsDraw
		r2.Points += bracket.PointsDraw
	case *m.WinnerID == *m.P1ID:
		r1.Won++
		r2.Lost++
		r1.Points += bracket.PointsWin
		r2.Points += bracket.PointsLoss
	default:
		r2.Won++
		r1.Lost++
		r2.Points += bracket.PointsWin
		r1.Points += bracket.PointsLoss
	}
}

// ==== 工具函数 ====

func clearResult(m *types.BracketMatch) {
	m.Completed = false
	m.Score1 = nil
	m.Score2 = nil
	m.WinnerID = nil
	m.IsDraw = false
	m.Stats1 = nil
	m.Stats2 = nil
}

func matchFingerprint(m *types.BracketMatch) string {
	return fmt.Sprintf("%v|%v|%v|%v|%v|%v|%v|%v|%s",
		ptrValue(m.P1ID), ptrValue(m.P2ID), ptrValue(m.WinnerID),
		floatPtrValue(m.Score1), floatPtrValue(m.Score2),
		m.IsDraw, m.Completed, m.Score1 == nil, m.Status)
}

func slotID(s resolvedSlot) *int {
	if s.state != slotKnown {
		return nil
	}
	return new(s.id)
}

func sameID(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

//go:fix inline

func ptrValue(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func floatPtrValue(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func floatValue(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}
