package types

// Student 学生模型
type Student struct {
	ID         int    `json:"id"           gorm:"primaryKey;autoIncrement"`
	Username   string `json:"username"     gorm:"unique;not null"`
	Password   string `json:"-"            gorm:"not null"`
	FullName   string `json:"full_name"    gorm:"not null"`
	Gender     int    `json:"gender"       gorm:"not null"` // 1: 女, 2: 男
	ClassID    int    `json:"class_id"     gorm:"not null"`
	ClassName  string `json:"class_name"   gorm:"-"` // 忽略该字段，通过join获取
	DingTalkID string `json:"ding_talk_id" gorm:"default:'0'"`
	Class      Class  `json:"class"        gorm:"foreignKey:ClassID"`
}
