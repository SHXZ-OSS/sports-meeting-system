package types

// RegistrationCustomValueInput 报名自定义字段值入参
type RegistrationCustomValueInput struct {
	FieldID int `json:"field_id"`
	Value   any `json:"value"`
}

// RegistrationCustomValue 报名记录的自定义字段值
type RegistrationCustomValue struct {
	ID             int    `json:"id"              gorm:"primaryKey;autoIncrement"`
	RegistrationID int    `json:"registration_id" gorm:"not null;index;uniqueIndex:idx_registration_custom_field"`
	FieldID        int    `json:"field_id"        gorm:"not null;index;uniqueIndex:idx_registration_custom_field"`
	Value          string `json:"value"           gorm:"not null;default:''"`

	Registration *Registration           `json:"-"               gorm:"foreignKey:RegistrationID"`
	Field        *CompetitionCustomField `json:"field,omitempty" gorm:"foreignKey:FieldID"`
}
