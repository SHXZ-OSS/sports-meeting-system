package types

import "time"

// PointType 得分类型
type PointType string

const (
	PointTypeRanking PointType = "ranking" // 基于排名的得分
	PointTypeCustom  PointType = "custom"  // 自定义加分（如开幕式）
)

// Points 得分记录模型
type Points struct {
	ID            int       `json:"id"                   gorm:"primaryKey;autoIncrement"`
	CompetitionID int       `json:"competition_id"       gorm:"not null;index"` // 关联的比赛项目
	StudentID     *int      `json:"student_id,omitempty" gorm:"index"`          // 学生ID（个人得分）
	ClassID       *int      `json:"class_id,omitempty"   gorm:"index"`          // 班级ID（班级得分）
	Points        float64   `json:"points"               gorm:"not null"`       // 得分
	PointType     PointType `json:"point_type"           gorm:"not null"`       // 得分类型
	Ranking       *int      `json:"ranking,omitempty"`                          // 排名（用于ranking类型）
	Reason        string    `json:"reason"               gorm:"default:''"`     // 得分原因说明（用于custom类型）
	CreatedBy     *int      `json:"created_by,omitempty" gorm:"index"`          // 创建者（教师ID）
	CreatedAt     time.Time `json:"created_at"           gorm:"autoCreateTime"`

	// 关联关系
	Competition Competition `json:"-" gorm:"foreignKey:CompetitionID"`
	Student     *Student    `json:"-" gorm:"foreignKey:StudentID"`
	Class       *Class      `json:"-" gorm:"foreignKey:ClassID"`
	Creator     *User       `json:"-" gorm:"foreignKey:CreatedBy"`
}

// ClassPointsSummary 班级得分汇总
type ClassPointsSummary struct {
	ClassID       int     `json:"class_id"`
	ClassName     string  `json:"class_name"`
	TotalPoints   float64 `json:"total_points"`
	RankingPoints float64 `json:"ranking_points"` // 来自排名的得分
	CustomPoints  float64 `json:"custom_points"`  // 来自自定义加分
	Rank          int     `json:"rank"`           // 班级排名
}

// StudentPointsSummary 学生得分汇总
type StudentPointsSummary struct {
	StudentID     int     `json:"student_id"`
	StudentName   string  `json:"student_name"`
	ClassID       int     `json:"class_id"`
	ClassName     string  `json:"class_name"`
	TotalPoints   float64 `json:"total_points"`
	RankingPoints float64 `json:"ranking_points"` // 来自排名的得分
	Rank          int     `json:"rank"`           // 学生排名
}

// PointDetail 得分明细
type PointDetail struct {
	ID              int             `json:"id"`
	CompetitionID   int             `json:"competition_id"`
	CompetitionName string          `json:"competition_name"`
	CompetitionType CompetitionType `json:"competition_type"` // 比赛类型：individual 或 team
	Points          float64         `json:"points"`
	PointType       PointType       `json:"point_type"`
	Ranking         *int            `json:"ranking,omitempty"`
	Reason          string          `json:"reason,omitempty"`
	CreatedBy       *int            `json:"created_by,omitempty"`
	CreatorName     string          `json:"creator_name,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}
