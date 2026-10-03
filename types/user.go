package types

// User 用户模型
type User struct {
	ID         int    `json:"id"                 gorm:"primaryKey;autoIncrement"`
	Username   string `json:"username"           gorm:"unique;not null"`
	Password   string `json:"-"                  gorm:"not null"` // 不暴露密码
	FullName   string `json:"full_name"          gorm:"not null"`
	Permission int    `json:"permission"         gorm:"not null;default:0"`
	DingTalkID string `json:"ding_talk_id"       gorm:"default:'0'"`
	ClassID    *int   `json:"class_id,omitempty" gorm:"index"` // 班级账号所属班级；NULL 表示全局管理员
	Class      *Class `json:"class,omitempty"    gorm:"foreignKey:ClassID"`
}
