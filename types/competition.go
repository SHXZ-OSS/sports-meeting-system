package types

import (
	"time"
)

// CompetitionStatus 比赛状态
type CompetitionStatus string

// RankingMode 排名方式
type RankingMode string

// CompetitionType 比赛类型
type CompetitionType string

const (
	StatusPendingApproval    CompetitionStatus = "pending_approval"     // 等待项目审核
	StatusApproved           CompetitionStatus = "approved"             // 审核通过
	StatusRejected           CompetitionStatus = "rejected"             // 审核失败
	StatusPendingScoreReview CompetitionStatus = "pending_score_review" // 等待成绩审核
	StatusCompleted          CompetitionStatus = "completed"            // 已完成
)

const (
	RankingHigherFirst RankingMode = "higher_first" // 分数高的排名靠前（如跳高、跳远）
	RankingLowerFirst  RankingMode = "lower_first"  // 分数低的排名靠前（如跑步、时间类）
)

const (
	TypeIndividual CompetitionType = "individual" // 个人比赛
	TypeTeam       CompetitionType = "team"       // 团体比赛
)

// Competition 比赛项目模型
type Competition struct {
	ID                      int               `json:"id" gorm:"primaryKey;autoIncrement"`
	EventID                 int               `json:"event_id" gorm:"not null;index;default:1"` // 所属运动会届次
	Name                    string            `json:"name" gorm:"not null"`
	Description             string            `json:"description" gorm:"default:''"`
	ImagePath               string            `json:"image_path" gorm:"default:''"`
	Status                  CompetitionStatus `json:"status" gorm:"not null;default:'pending_approval'"`
	RankingMode             RankingMode       `json:"ranking_mode" gorm:"default:'higher_first'"` // 排名方式
	Unit                    string            `json:"unit" gorm:"default:'points'"`
	Gender                  int               `json:"gender" gorm:"default:3"`                      // 1: 女, 2: 男, 3: 混合
	CompetitionType         CompetitionType   `json:"competition_type" gorm:"default:'individual'"` // 比赛类型：个人或团体
	MinParticipantsPerClass int               `json:"min_participants_per_class" gorm:"default:0"`  // 每班最少报名总人数，0表示无限制
	MaxParticipantsPerClass int               `json:"max_participants_per_class" gorm:"default:0"`  // 每班最多报名总人数，0表示无限制
	MinFemalePerClass       int               `json:"min_female_per_class" gorm:"default:0"`        // 每班最少女生人数，gender=3时有效，0表示无限制
	MaxFemalePerClass       int               `json:"max_female_per_class" gorm:"default:0"`        // 每班最多女生人数，gender=3时有效，0表示无限制
	MinMalePerClass         int               `json:"min_male_per_class" gorm:"default:0"`          // 每班最少男生人数，gender=3时有效，0表示无限制
	MaxMalePerClass         int               `json:"max_male_per_class" gorm:"default:0"`          // 每班最多男生人数，gender=3时有效，0表示无限制
	SubmitterID             *int              `json:"submitter_id,omitempty" gorm:"index"`
	SubmitterName           *string           `json:"submitter_name,omitempty" gorm:"-"` // 忽略该字段，通过join获取
	ReviewerID              *int              `json:"reviewer_id,omitempty"`
	ReviewerName            string            `json:"reviewer_name,omitempty" gorm:"-"` // 忽略该字段，通过join获取
	ScoreSubmitterID        *int              `json:"score_submitter_id,omitempty"`
	ScoreSubmitterName      string            `json:"score_submitter_name,omitempty" gorm:"-"` // 忽略该字段，通过join获取
	ScoreReviewerID         *int              `json:"score_reviewer_id,omitempty"`
	ScoreReviewerName       string            `json:"score_reviewer_name,omitempty" gorm:"-"` // 忽略该字段，通过join获取
	RegistrationCount       int               `json:"registration_count,omitempty" gorm:"-"`  // 忽略该字段，通过join获取
	VoteCount               int               `json:"vote_count" gorm:"default:0"`            // 投票总数（upvotes - downvotes）
	ReviewedAt              *time.Time        `json:"reviewed_at,omitempty"`
	ScoreReviewedAt         *time.Time        `json:"score_reviewed_at,omitempty"`
	ScoreCreatedAt          *time.Time        `json:"score_created_at,omitempty"`
	StartTime               *time.Time        `json:"start_time,omitempty"`         // 比赛开始时间
	EndTime                 *time.Time        `json:"end_time,omitempty"`           // 比赛结束时间

	// 关联关系，不响应到前端
	Submitter      *Student       `json:"-" gorm:"foreignKey:SubmitterID"`
	Reviewer       *User          `json:"-" gorm:"foreignKey:ReviewerID"`
	ScoreSubmitter *User          `json:"-" gorm:"foreignKey:ScoreSubmitterID"`
	ScoreReviewer  *User          `json:"-" gorm:"foreignKey:ScoreReviewerID"`
	Registrations  []Registration `json:"-" gorm:"foreignKey:CompetitionID"`
	Scores         []Score        `json:"-" gorm:"foreignKey:CompetitionID"`
	Votes          []Vote         `json:"-" gorm:"foreignKey:CompetitionID"`
}
