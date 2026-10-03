package types

// Class 班级模型
type Class struct {
	ID   int    `json:"id"   gorm:"primaryKey;autoIncrement"`
	Name string `json:"name" gorm:"unique;not null"`
}
