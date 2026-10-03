package types

// ParentStudentRelation 家长学生关系模型
type ParentStudentRelation struct {
	ID          int    `json:"id"           gorm:"primaryKey;autoIncrement"`
	ParentID    string `json:"parent_id"    gorm:"not null;index"` // 家长钉钉ID
	StudentID   string `json:"student_id"   gorm:"not null;index"` // 学生钉钉ID
	Relation    string `json:"relation"     gorm:"not null"`       // 关系描述
	StudentName string `json:"student_name" gorm:"-"`              // 忽略该字段，通过join获取
}
