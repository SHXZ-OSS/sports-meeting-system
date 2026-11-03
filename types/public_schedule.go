package types

import "time"

// PublicScheduleKind 公开赛程条目类型
type PublicScheduleKind string

const (
	ScheduleKindCompetition PublicScheduleKind = "competition" // 比赛项目整体时段
	ScheduleKindMatch       PublicScheduleKind = "match"       // 对阵图中的一场比赛
)

// PublicScheduleItem 首页赛程中的一个条目
// 使用对阵图且已排期的项目按场次展开，其余项目按项目开始、结束时间展示
type PublicScheduleItem struct {
	Kind              PublicScheduleKind `json:"kind"`
	CompetitionID     int                `json:"competition_id"`
	CompetitionName   string             `json:"competition_name"`
	CompetitionStatus CompetitionStatus  `json:"competition_status"`
	BracketID         int                `json:"bracket_id,omitempty"`
	MatchID           int                `json:"match_id,omitempty"`
	MatchSeq          int                `json:"match_seq,omitempty"`
	RoundLabel        string             `json:"round_label,omitempty"`
	MatchStatus       BracketMatchStatus `json:"match_status,omitempty"`
	Side1             string             `json:"side1,omitempty"`
	Side2             string             `json:"side2,omitempty"`
	Score1            *float64           `json:"score1,omitempty"`
	Score2            *float64           `json:"score2,omitempty"`
	WinnerSide        int                `json:"winner_side,omitempty"` // 1 或 2；平局或未完赛为 0
	StartAt           time.Time          `json:"start_at"`
	EndAt             time.Time          `json:"end_at"`
	// 结束时间是否为估算（项目未填结束时间时按 1 小时估算）
	EndEstimated bool   `json:"end_estimated,omitempty"`
	Venue        string `json:"venue"`
}
