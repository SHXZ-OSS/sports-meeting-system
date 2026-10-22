package models

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// normalizeRegistrationCustomValues 校验并规范化报名自定义字段值
// requireAll 为 true 时所有必填字段必须提供（所有报名入口均使用）
func normalizeRegistrationCustomValues(
	db *gorm.DB,
	competitionID int,
	values []types.RegistrationCustomValueInput,
	requireAll bool,
) ([]types.RegistrationCustomValue, error) {
	var fields []types.CompetitionCustomField
	if err := db.Where("competition_id = ?", competitionID).
		Order("sort_order ASC, id ASC").
		Find(&fields).Error; err != nil {
		return nil, err
	}

	fieldMap := make(map[int]*types.CompetitionCustomField, len(fields))
	for i := range fields {
		fieldMap[fields[i].ID] = &fields[i]
	}

	provided := make(map[int]any, len(values))
	for _, value := range values {
		if value.FieldID <= 0 {
			return nil, errors.New("自定义字段参数无效")
		}
		field, ok := fieldMap[value.FieldID]
		if !ok {
			return nil, errors.New("自定义字段不属于该项目")
		}
		if _, duplicated := provided[value.FieldID]; duplicated {
			return nil, fmt.Errorf("自定义字段「%s」重复提交", field.Name)
		}
		provided[value.FieldID] = value.Value
	}

	rows := make([]types.RegistrationCustomValue, 0, len(values))
	for i := range fields {
		field := &fields[i]
		raw, ok := provided[field.ID]
		if !ok {
			if field.Required && requireAll {
				return nil, fmt.Errorf("请填写「%s」", field.Name)
			}
			continue
		}
		if raw == nil {
			if field.Required {
				return nil, fmt.Errorf("请填写「%s」", field.Name)
			}
			continue
		}

		normalized, err := normalizeCustomFieldValue(field, raw)
		if err != nil {
			return nil, fmt.Errorf("「%s」%w", field.Name, err)
		}
		if normalized == "" {
			if field.Required {
				return nil, fmt.Errorf("请填写「%s」", field.Name)
			}
			continue
		}
		rows = append(rows, types.RegistrationCustomValue{FieldID: field.ID, Value: normalized})
	}
	return rows, nil
}

// normalizeCustomFieldValue 按字段类型将输入规范化为字符串
func normalizeCustomFieldValue(field *types.CompetitionCustomField, raw any) (string, error) {
	switch field.FieldType {
	case types.CustomFieldTypeString:
		value, ok := raw.(string)
		if !ok {
			value = fmt.Sprint(raw)
		}
		value = strings.TrimSpace(value)
		if len([]rune(value)) > 500 {
			return "", errors.New("内容过长（最多 500 字）")
		}
		return value, nil

	case types.CustomFieldTypeInt:
		switch value := raw.(type) {
		case float64:
			if math.Trunc(value) != value {
				return "", errors.New("必须是整数")
			}
			return strconv.FormatInt(int64(value), 10), nil
		case int:
			return strconv.Itoa(value), nil
		case int64:
			return strconv.FormatInt(value, 10), nil
		case string:
			value = strings.TrimSpace(value)
			if value == "" {
				return "", nil
			}
			parsed, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return "", errors.New("必须是整数")
			}
			return strconv.FormatInt(parsed, 10), nil
		default:
			return "", errors.New("必须是整数")
		}

	case types.CustomFieldTypeFloat:
		switch value := raw.(type) {
		case float64:
			return strconv.FormatFloat(value, 'f', -1, 64), nil
		case int:
			return strconv.FormatFloat(float64(value), 'f', -1, 64), nil
		case int64:
			return strconv.FormatFloat(float64(value), 'f', -1, 64), nil
		case string:
			value = strings.TrimSpace(value)
			if value == "" {
				return "", nil
			}
			parsed, err := strconv.ParseFloat(value, 64)
			if err != nil {
				return "", errors.New("必须是数字")
			}
			return strconv.FormatFloat(parsed, 'f', -1, 64), nil
		default:
			return "", errors.New("必须是数字")
		}

	case types.CustomFieldTypeBool:
		switch value := raw.(type) {
		case bool:
			return strconv.FormatBool(value), nil
		case float64:
			switch value {
			case 1:
				return "true", nil
			case 0:
				return "false", nil
			default:
				return "", errors.New("必须是布尔值")
			}
		case string:
			switch strings.ToLower(strings.TrimSpace(value)) {
			case "true", "1", "是":
				return "true", nil
			case "false", "0", "否":
				return "false", nil
			default:
				return "", errors.New("必须是布尔值")
			}
		default:
			return "", errors.New("必须是布尔值")
		}
	}
	return "", errors.New("字段类型无效")
}

// UpdateRegistrationCustomValues 管理员修改报名自定义字段值（整体替换）
func UpdateRegistrationCustomValues(registrationID int, values []types.RegistrationCustomValueInput) error {
	db := database.GetDB()

	var registration types.Registration
	if err := db.Select("id", "competition_id").First(&registration, registrationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("报名记录不存在")
		}
		return err
	}

	rows, err := normalizeRegistrationCustomValues(db, registration.CompetitionID, values, true)
	if err != nil {
		return err
	}

	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("registration_id = ?", registrationID).
			Delete(&types.RegistrationCustomValue{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for i := range rows {
			rows[i].RegistrationID = registrationID
		}
		return tx.Create(&rows).Error
	})
}
