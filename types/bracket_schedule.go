package types

import "time"

// BracketScheduleConfig 自动排期参数（保存在对阵表上，便于下次沿用）
type BracketScheduleConfig struct {
	StartAt       time.Time `json:"start_at"`       // 第一场最早开始时间
	MatchMinutes  int       `json:"match_minutes"`  // 每场比赛占用时长（分钟）
	GapMinutes    int       `json:"gap_minutes"`    // 同一场地两场之间的间隔（分钟）
	RestMinutes   int       `json:"rest_minutes"`   // 同一参赛方两场之间至少休息（分钟）
	Venues        []string  `json:"venues"`         // 可同时使用的场地
	DayStart      string    `json:"day_start"`      // 每日开始时间 HH:MM，为空表示不限
	DayEnd        string    `json:"day_end"`        // 每日结束时间 HH:MM，为空表示不限
	KeepScheduled bool      `json:"keep_scheduled"` // 保留已排期比赛，只为未排期的比赛安排时间
}

// BracketScheduleItem 排期结果中的一场比赛
type BracketScheduleItem struct {
	MatchID     int       `json:"match_id"`
	ScheduledAt time.Time `json:"scheduled_at"`
	EndAt       time.Time `json:"end_at"`
	Venue       string    `json:"venue"`
	Fixed       bool      `json:"fixed"` // 保留的原有排期
}

// BracketSchedulePlan 自动排期结果
type BracketSchedulePlan struct {
	Items    []BracketScheduleItem `json:"items"`
	FirstAt  *time.Time            `json:"first_at,omitempty"`
	LastEnd  *time.Time            `json:"last_end,omitempty"`
	Days     int                   `json:"days"`
	Warnings []string              `json:"warnings"`
}
