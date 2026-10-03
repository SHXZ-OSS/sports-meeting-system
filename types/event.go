package types

// Event 运动会届次模型
type Event struct {
	ID   int    `json:"id"   gorm:"primaryKey;autoIncrement"`
	Name string `json:"name" gorm:"unique;not null"`
}
