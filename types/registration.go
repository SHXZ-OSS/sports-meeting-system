package types

import "time"

// Registration 学生报名记录
type Registration struct {
	ID            int       `json:"id"                     gorm:"primaryKey;autoIncrement"`
	StudentID     *int      `json:"student_id,omitempty"   gorm:"index"`
	ClassID       *int      `json:"class_id,omitempty"     gorm:"index"`
	CompetitionID int       `json:"competition_id"         gorm:"not null;index"`
	StudentName   string    `json:"student_name,omitempty" gorm:"-"` // 忽略该字段，通过join获取
	StudentGender int       `json:"student_gender"         gorm:"-"` // 忽略该字段，通过join获取
	ClassName     string    `json:"class_name,omitempty"   gorm:"-"` // 忽略该字段，通过join获取
	CreatedAt     time.Time `json:"created_at"             gorm:"default:CURRENT_TIMESTAMP"`

	// 关联关系
	Student     *Student    `json:"-" gorm:"foreignKey:StudentID"`
	Class       *Class      `json:"-" gorm:"foreignKey:ClassID"`
	Competition Competition `json:"-" gorm:"foreignKey:CompetitionID"`
}
