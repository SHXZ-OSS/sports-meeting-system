package types

// 报名自定义字段类型
const (
	CustomFieldTypeString = "string" // 文本
	CustomFieldTypeInt    = "int"    // 整数
	CustomFieldTypeFloat  = "float"  // 小数
	CustomFieldTypeBool   = "bool"   // 布尔
)

// CompetitionCustomField 比赛项目的报名自定义字段定义
type CompetitionCustomField struct {
	ID            int    `json:"id"             gorm:"primaryKey;autoIncrement"`
	CompetitionID int    `json:"competition_id" gorm:"not null;index"`
	Name          string `json:"name"           gorm:"not null"`
	FieldType     string `json:"field_type"     gorm:"not null"`
	Required      bool   `json:"required"       gorm:"default:false"`
	SortOrder     int    `json:"sort_order"     gorm:"default:0"`

	// HasRegistrationData 是否已有报名值，仅用于前端禁用字段编辑，不落库
	HasRegistrationData bool `json:"has_registration_data" gorm:"-"`

	Competition *Competition `json:"-" gorm:"foreignKey:CompetitionID"`
}
