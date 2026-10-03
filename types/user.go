package types

// User 用户模型
type User struct {
	ID          int     `json:"id"                     gorm:"primaryKey;autoIncrement"`
	Username    string  `json:"username"               gorm:"unique;not null"`
	Password    string  `json:"-"                      gorm:"not null"` // 不暴露密码
	FullName    string  `json:"full_name"              gorm:"not null"`
	Permission  int     `json:"permission"             gorm:"not null;default:0"`
	DingTalkID  string  `json:"ding_talk_id"           gorm:"default:'0'"`
	ClassScopes []Class `json:"class_scopes,omitempty" gorm:"many2many:user_class_scopes;"` // 班级权限范围
}
