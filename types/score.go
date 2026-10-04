package types

// Score 成绩模型
type Score struct {
	ID              int     `json:"id"                         gorm:"primaryKey;autoIncrement"`
	CompetitionID   int     `json:"competition_id"             gorm:"not null;index"`
	CompetitionName string  `json:"competition_name,omitempty" gorm:"-"`     // 忽略该字段，通过join获取
	Unit            string  `json:"unit,omitempty"             gorm:"-"`     // 成绩单位，来自比赛项目
	StudentID       *int    `json:"student_id,omitempty"       gorm:"index"` // 个人比赛时使用
	ClassID         *int    `json:"class_id,omitempty"         gorm:"index"` // 团体比赛时使用
	StudentName     string  `json:"student_name,omitempty"     gorm:"-"`     // 忽略该字段，通过join获取
	ClassName       string  `json:"class_name,omitempty"       gorm:"-"`     // 忽略该字段，通过join获取
	Score           float64 `json:"score"                      gorm:"not null"`
	Ranking         int     `json:"ranking"                    gorm:"not null;default:0"` // 排名
	Point           float64 `json:"point"                      gorm:"not null;default:0"` // 分数

	// 关联关系
	Competition Competition `json:"-" gorm:"foreignKey:CompetitionID"`
	Student     *Student    `json:"-" gorm:"foreignKey:StudentID"`
	Class       *Class      `json:"-" gorm:"foreignKey:ClassID"`
}

// StudentScore 用于批量成绩提交的结构
type StudentScore struct {
	StudentID *int    `json:"student_id,omitempty"` // 个人比赛时使用
	ClassID   *int    `json:"class_id,omitempty"`   // 团体比赛时使用
	Score     float64 `json:"score"`
}
