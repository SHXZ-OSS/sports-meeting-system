package services

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

var (
	ErrScheduleNotLinked    = errors.New("仅使用对阵图的比赛项目可以排期，请先在项目管理中为该项目开启对阵图")
	ErrScheduleVenues       = errors.New("请填写 1 到 20 个场地，名称不能为空、不超过 30 个字且不能重复")
	ErrScheduleDuration     = errors.New("每场时长需在 1 到 600 分钟之间")
	ErrScheduleGap          = errors.New("场地间隔需在 0 到 240 分钟之间")
	ErrScheduleRest         = errors.New("休息时间需在 0 到 720 分钟之间")
	ErrScheduleStart        = errors.New("请填写开始时间")
	ErrScheduleDayWindow    = errors.New("每日时段格式为 HH:MM，结束需晚于开始，且时段不短于每场时长")
	ErrScheduleNothing      = errors.New("没有需要排期的比赛")
	ErrScheduleTooLong      = errors.New("排期超过 60 天，请增加场地、缩短时长或放宽每日时段")
	ErrScheduleNotGenerated = errors.New("对阵尚未生成，生成对阵后才能排期")
)

const (
	maxScheduleVenues    = 20
	maxScheduleVenueLen  = 30
	maxScheduleDays      = 60
	maxScheduleMatchMins = 600
	maxScheduleGapMins   = 240
	maxScheduleRestMins  = 720
)

// IsScheduleError 是否为排期参数或前置条件错误（响应 400）
func IsScheduleError(err error) bool {
	for _, target := range []error{
		ErrScheduleNotLinked, ErrScheduleVenues, ErrScheduleDuration, ErrScheduleGap, ErrScheduleRest,
		ErrScheduleStart, ErrScheduleDayWindow, ErrScheduleNothing, ErrScheduleTooLong, ErrScheduleNotGenerated,
	} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

// dayWindow 每日可排期时段（距零点的分钟数）；enabled=false 表示全天
type dayWindow struct {
	enabled    bool
	start, end int
}

// normalizeScheduleConfig 校验并整理排期参数
func normalizeScheduleConfig(cfg *types.BracketScheduleConfig) (dayWindow, error) {
	if cfg.StartAt.IsZero() {
		return dayWindow{}, ErrScheduleStart
	}
	cfg.StartAt = cfg.StartAt.Truncate(time.Minute)
	if cfg.MatchMinutes < 1 || cfg.MatchMinutes > maxScheduleMatchMins {
		return dayWindow{}, ErrScheduleDuration
	}
	if cfg.GapMinutes < 0 || cfg.GapMinutes > maxScheduleGapMins {
		return dayWindow{}, ErrScheduleGap
	}
	if cfg.RestMinutes < 0 || cfg.RestMinutes > maxScheduleRestMins {
		return dayWindow{}, ErrScheduleRest
	}

	venues := make([]string, 0, len(cfg.Venues))
	seen := make(map[string]bool, len(cfg.Venues))
	for _, v := range cfg.Venues {
		v = strings.TrimSpace(v)
		if v == "" || len([]rune(v)) > maxScheduleVenueLen || seen[v] {
			return dayWindow{}, ErrScheduleVenues
		}
		seen[v] = true
		venues = append(venues, v)
	}
	if len(venues) == 0 || len(venues) > maxScheduleVenues {
		return dayWindow{}, ErrScheduleVenues
	}
	cfg.Venues = venues

	cfg.DayStart = strings.TrimSpace(cfg.DayStart)
	cfg.DayEnd = strings.TrimSpace(cfg.DayEnd)
	if cfg.DayStart == "" && cfg.DayEnd == "" {
		return dayWindow{}, nil
	}
	start, ok1 := parseClock(cfg.DayStart)
	end, ok2 := parseClock(cfg.DayEnd)
	if !ok1 || !ok2 || end-start < cfg.MatchMinutes {
		return dayWindow{}, ErrScheduleDayWindow
	}
	return dayWindow{enabled: true, start: start, end: end}, nil
}

// parseClock 解析 HH:MM 为距零点的分钟数
func parseClock(s string) (int, bool) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return 0, false
	}
	return t.Hour()*60 + t.Minute(), true
}

// interval 场地上的一段占用
type interval struct{ start, end time.Time }

// scheduler 列表调度：按依赖关系与参赛方休息约束，把比赛贪心放到最早可用的场地时段
type scheduler struct {
	cfg      *types.BracketScheduleConfig
	window   dayWindow
	duration time.Duration
	gap      time.Duration
	rest     time.Duration
	busy     map[string][]interval // 场地 → 已占用时段（按开始时间排序）
	// 参赛方最近一场比赛的结束时间（用于休息约束）
	participantEnd map[int]time.Time
	bySeq          map[int]*types.BracketMatch
	groups         map[int][]*types.BracketMatch // 小组序号 → 小组赛
	end            map[int]time.Time             // 比赛 ID → 结束时间（零值表示不约束）
	done           map[int]bool                  // 比赛 ID → 已确定时间（或无需排期）
}

// align 将时间调整到每日时段内，且保证从该时刻开始能完整打完一场
func (s *scheduler) align(t time.Time) time.Time {
	if !s.window.enabled {
		return t
	}
	loc := s.cfg.StartAt.Location()
	t = t.In(loc)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	open := day.Add(time.Duration(s.window.start) * time.Minute)
	closeAt := day.Add(time.Duration(s.window.end) * time.Minute)
	if t.Before(open) {
		return open
	}
	if t.Add(s.duration).After(closeAt) {
		return open.AddDate(0, 0, 1)
	}
	return t
}

// earliestAt 在指定场地上找不早于 t 的最早可用时段
func (s *scheduler) earliestAt(venue string, t time.Time) time.Time {
	t = s.align(t)
	for {
		moved := false
		for _, iv := range s.busy[venue] {
			// 与已有占用（含前后间隔）重叠则顺延到其结束之后
			if t.Before(iv.end.Add(s.gap)) && t.Add(s.duration).Add(s.gap).After(iv.start) {
				t = s.align(iv.end.Add(s.gap))
				moved = true
			}
		}
		if !moved {
			return t
		}
	}
}

func (s *scheduler) occupy(venue string, start, end time.Time) {
	s.busy[venue] = append(s.busy[venue], interval{start, end})
	list := s.busy[venue]
	sort.Slice(list, func(i, j int) bool { return list[i].start.Before(list[j].start) })
}

// matchDeps 返回比赛依赖的来源比赛（winner/loser 签位指向的比赛、group_rank 签位所在小组的全部比赛）
func matchDeps(
	m *types.BracketMatch,
	bySeq map[int]*types.BracketMatch,
	groups map[int][]*types.BracketMatch,
) []*types.BracketMatch {
	var deps []*types.BracketMatch
	for _, slot := range []struct {
		source types.BracketSlotSource
		ref    int
	}{{m.Slot1Source, m.Slot1Ref}, {m.Slot2Source, m.Slot2Ref}} {
		switch slot.source {
		case types.SlotSourceWinner, types.SlotSourceLoser:
			if src := bySeq[slot.ref]; src != nil {
				deps = append(deps, src)
			}
		case types.SlotSourceGroupRank:
			deps = append(deps, groups[slot.ref/types.GroupRankRefBase]...)
		case types.SlotSourceNone, types.SlotSourceParticipant:
		}
	}
	return deps
}

// matchParticipants 比赛已确定的参赛方
func matchParticipants(m *types.BracketMatch) []int {
	var ids []int
	for _, p := range []*int{m.P1ID, m.P2ID} {
		if p != nil {
			ids = append(ids, *p)
		}
	}
	return ids
}

// isPlayable 需要占用场地的比赛（轮空与作废的比赛不占时间）
func isPlayable(m *types.BracketMatch) bool {
	return m.Status != types.MatchStatusBye && m.Status != types.MatchStatusVoid
}

// ComputeBracketSchedule 计算排期方案（不写库）
// 已完赛的比赛保持原样；keep_scheduled 时保留已有时间的未完赛比赛，其余比赛按依赖顺序排入场地。
func ComputeBracketSchedule(
	matches []*types.BracketMatch,
	cfg *types.BracketScheduleConfig,
) (*types.BracketSchedulePlan, error) {
	window, err := normalizeScheduleConfig(cfg)
	if err != nil {
		return nil, err
	}
	if len(matches) == 0 {
		return nil, ErrScheduleNotGenerated
	}
	s := newScheduler(cfg, window, matches)
	plan := &types.BracketSchedulePlan{Warnings: []string{}}
	pending := s.placeFixed(plan)

	scheduled := 0
	limit := cfg.StartAt.AddDate(0, 0, maxScheduleDays)
	for len(pending) > 0 {
		idx, ready := s.pickNext(pending)
		if idx < 0 {
			// 依赖指向不存在的比赛等异常数据：剩余比赛不再排期
			break
		}
		m := pending[idx]
		pending = append(pending[:idx], pending[idx+1:]...)
		s.done[m.ID] = true
		if !isPlayable(m) {
			s.end[m.ID] = s.depsEnd(m)
			continue
		}
		item := s.place(m, ready)
		if item.ScheduledAt.After(limit) {
			return nil, ErrScheduleTooLong
		}
		plan.Items = append(plan.Items, item)
		scheduled++
	}
	if scheduled == 0 {
		return nil, ErrScheduleNothing
	}

	sort.Slice(plan.Items, func(i, j int) bool {
		a, b := plan.Items[i], plan.Items[j]
		if !a.ScheduledAt.Equal(b.ScheduledAt) {
			return a.ScheduledAt.Before(b.ScheduledAt)
		}
		return a.Venue < b.Venue
	})
	summarizePlan(plan, cfg.StartAt.Location())
	return plan, nil
}

func newScheduler(cfg *types.BracketScheduleConfig, window dayWindow, matches []*types.BracketMatch) *scheduler {
	s := &scheduler{
		cfg:            cfg,
		window:         window,
		duration:       time.Duration(cfg.MatchMinutes) * time.Minute,
		gap:            time.Duration(cfg.GapMinutes) * time.Minute,
		rest:           time.Duration(cfg.RestMinutes) * time.Minute,
		busy:           make(map[string][]interval),
		participantEnd: make(map[int]time.Time),
		bySeq:          make(map[int]*types.BracketMatch, len(matches)),
		groups:         make(map[int][]*types.BracketMatch),
		end:            make(map[int]time.Time, len(matches)),
		done:           make(map[int]bool, len(matches)),
	}
	for _, m := range matches {
		s.bySeq[m.Seq] = m
		if m.Stage == types.StageGroup {
			s.groups[m.GroupIndex] = append(s.groups[m.GroupIndex], m)
		}
	}
	return s
}

// placeFixed 登记已确定时间的比赛（完赛的比赛、或保留的已排期比赛），返回待排期的比赛（按拓扑序）
func (s *scheduler) placeFixed(plan *types.BracketSchedulePlan) []*types.BracketMatch {
	sorted := make([]*types.BracketMatch, 0, len(s.bySeq))
	for _, m := range s.bySeq {
		sorted = append(sorted, m)
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Seq < sorted[j].Seq })

	var pending []*types.BracketMatch
	for _, m := range sorted {
		fixed := m.Completed || (s.cfg.KeepScheduled && m.ScheduledAt != nil && isPlayable(m))
		if !fixed {
			pending = append(pending, m)
			continue
		}
		s.done[m.ID] = true
		if m.ScheduledAt == nil {
			continue
		}
		e := m.ScheduledAt.Add(s.duration)
		s.end[m.ID] = e
		if m.Venue != "" {
			s.occupy(m.Venue, *m.ScheduledAt, e)
		}
		for _, pid := range matchParticipants(m) {
			if e.After(s.participantEnd[pid]) {
				s.participantEnd[pid] = e
			}
		}
		if !m.Completed {
			plan.Items = append(plan.Items, types.BracketScheduleItem{
				MatchID: m.ID, ScheduledAt: *m.ScheduledAt, EndAt: e, Venue: m.Venue, Fixed: true,
			})
		}
	}
	return pending
}

// pickNext 选出依赖已就绪且最早可开始的比赛；同时可开始时按轮次、拓扑序，使各小组交替进行
func (s *scheduler) pickNext(pending []*types.BracketMatch) (int, time.Time) {
	best := -1
	var bestReady time.Time
	for i, m := range pending {
		ready, ok := s.readyAt(m)
		if !ok {
			continue
		}
		if best < 0 || ready.Before(bestReady) ||
			(ready.Equal(bestReady) && earlierInOrder(m, pending[best])) {
			best, bestReady = i, ready
		}
	}
	return best, bestReady
}

func earlierInOrder(a, b *types.BracketMatch) bool {
	if a.Round != b.Round {
		return a.Round < b.Round
	}
	return a.Seq < b.Seq
}

// depsEnd 轮空 / 作废比赛的结束时间：沿用来源比赛（不额外计休息）
func (s *scheduler) depsEnd(m *types.BracketMatch) time.Time {
	var latest time.Time
	for _, dep := range matchDeps(m, s.bySeq, s.groups) {
		if e := s.end[dep.ID]; e.After(latest) {
			latest = e
		}
	}
	return latest
}

// place 把比赛放到最早可用的场地，并登记占用
func (s *scheduler) place(m *types.BracketMatch, ready time.Time) types.BracketScheduleItem {
	venue, start := "", time.Time{}
	for _, v := range s.cfg.Venues {
		if t := s.earliestAt(v, ready); venue == "" || t.Before(start) {
			venue, start = v, t
		}
	}
	e := start.Add(s.duration)
	s.end[m.ID] = e
	s.occupy(venue, start, e)
	for _, pid := range matchParticipants(m) {
		s.participantEnd[pid] = e
	}
	return types.BracketScheduleItem{MatchID: m.ID, ScheduledAt: start, EndAt: e, Venue: venue}
}

// readyAt 比赛最早可开始的时间；依赖尚未排定时 ok=false
func (s *scheduler) readyAt(m *types.BracketMatch) (time.Time, bool) {
	ready := s.cfg.StartAt
	for _, dep := range matchDeps(m, s.bySeq, s.groups) {
		if !s.done[dep.ID] {
			return time.Time{}, false
		}
		// 来源比赛结束后，晋级方还需休息
		if e := s.end[dep.ID]; !e.IsZero() {
			if t := e.Add(s.rest); t.After(ready) {
				ready = t
			}
		}
	}
	for _, pid := range matchParticipants(m) {
		if e, ok := s.participantEnd[pid]; ok {
			if t := e.Add(s.rest); t.After(ready) {
				ready = t
			}
		}
	}
	return ready, true
}

// summarizePlan 填写首场、末场与天数
func summarizePlan(plan *types.BracketSchedulePlan, loc *time.Location) {
	if len(plan.Items) == 0 {
		return
	}
	first := plan.Items[0].ScheduledAt
	last := plan.Items[0].EndAt
	days := make(map[string]bool)
	for _, it := range plan.Items {
		if it.ScheduledAt.Before(first) {
			first = it.ScheduledAt
		}
		if it.EndAt.After(last) {
			last = it.EndAt
		}
		days[it.ScheduledAt.In(loc).Format(time.DateOnly)] = true
	}
	plan.FirstAt, plan.LastEnd, plan.Days = &first, &last, len(days)
}

// scheduleCompetition 排期仅对启用对阵图的比赛项目开放
func scheduleCompetition(bracket *types.Bracket) (*types.Competition, error) {
	competition, err := linkedCompetition(bracket)
	if err != nil {
		return nil, err
	}
	if competition == nil {
		return nil, ErrScheduleNotLinked
	}
	return competition, nil
}

// PreviewBracketSchedule 预览自动排期结果
func PreviewBracketSchedule(
	bracket *types.Bracket,
	cfg *types.BracketScheduleConfig,
) (*types.BracketSchedulePlan, error) {
	bracketMu.Lock()
	defer bracketMu.Unlock()
	return computeSchedule(bracket, cfg)
}

func computeSchedule(bracket *types.Bracket, cfg *types.BracketScheduleConfig) (*types.BracketSchedulePlan, error) {
	competition, err := scheduleCompetition(bracket)
	if err != nil {
		return nil, err
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		return nil, err
	}
	matches, err := models.GetBracketMatches(bracket.ID)
	if err != nil {
		return nil, err
	}
	ResolveBracket(bracket, participants, matches)
	plan, err := ComputeBracketSchedule(matches, cfg)
	if err != nil {
		return nil, err
	}
	if competition.EndTime != nil && plan.LastEnd != nil && plan.LastEnd.After(*competition.EndTime) {
		plan.Warnings = append(plan.Warnings, fmt.Sprintf(
			"排期结束时间晚于项目结束时间（%s），可在项目管理中调整项目时间",
			competition.EndTime.In(cfg.StartAt.Location()).Format("2006-01-02 15:04"),
		))
	}
	if competition.StartTime != nil && plan.FirstAt != nil && plan.FirstAt.Before(*competition.StartTime) {
		plan.Warnings = append(plan.Warnings, fmt.Sprintf(
			"首场早于项目开始时间（%s）",
			competition.StartTime.In(cfg.StartAt.Location()).Format("2006-01-02 15:04"),
		))
	}
	return plan, nil
}

// ApplyBracketSchedule 按参数重新计算排期并写入比赛时间与场地，同时保存参数
func ApplyBracketSchedule(
	bracket *types.Bracket,
	cfg *types.BracketScheduleConfig,
) (*types.BracketSchedulePlan, error) {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	plan, err := computeSchedule(bracket, cfg)
	if err != nil {
		return nil, err
	}
	matches, err := models.GetBracketMatches(bracket.ID)
	if err != nil {
		return nil, err
	}
	byID := make(map[int]*types.BracketMatch, len(matches))
	for _, m := range matches {
		byID[m.ID] = m
	}
	var changed []*types.BracketMatch
	for _, it := range plan.Items {
		m := byID[it.MatchID]
		if m == nil || it.Fixed {
			continue
		}
		at := it.ScheduledAt
		m.ScheduledAt = &at
		m.Venue = it.Venue
		changed = append(changed, m)
	}
	// 未完赛但本次未排入的比赛（轮空、作废）清除旧时间，避免残留
	planned := make(map[int]bool, len(plan.Items))
	for _, it := range plan.Items {
		planned[it.MatchID] = true
	}
	for _, m := range matches {
		if !m.Completed && !planned[m.ID] && !isPlayable(m) && m.ScheduledAt != nil {
			m.ScheduledAt = nil
			changed = append(changed, m)
		}
	}
	if err := models.SaveBracketMatchSchedules(changed); err != nil {
		return nil, err
	}
	bracket.ScheduleConfig = cfg
	if err := models.UpdateBracketScheduleConfig(bracket); err != nil {
		return nil, err
	}
	return plan, nil
}

// ClearBracketSchedule 清除所有未完赛比赛的时间与场地
func ClearBracketSchedule(bracket *types.Bracket) (int, error) {
	bracketMu.Lock()
	defer bracketMu.Unlock()

	if _, err := scheduleCompetition(bracket); err != nil {
		return 0, err
	}
	matches, err := models.GetBracketMatches(bracket.ID)
	if err != nil {
		return 0, err
	}
	var changed []*types.BracketMatch
	for _, m := range matches {
		if m.Completed || (m.ScheduledAt == nil && m.Venue == "") {
			continue
		}
		m.ScheduledAt = nil
		m.Venue = ""
		changed = append(changed, m)
	}
	if err := models.SaveBracketMatchSchedules(changed); err != nil {
		return 0, err
	}
	return len(changed), nil
}
