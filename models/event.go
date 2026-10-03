package models

import (
	"errors"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// CreateEvent 创建运动会届次
func CreateEvent(name string) (*types.Event, error) {
	db := database.GetDB()

	// 检查名称是否重复
	var count int64
	if err := db.Model(&types.Event{}).Where("name = ?", name).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("运动会届次名称已存在")
	}

	event := &types.Event{
		Name: name,
	}

	if err := db.Create(event).Error; err != nil {
		return nil, err
	}

	return event, nil
}

// UpdateEvent 更新运动会届次
func UpdateEvent(id int, name string) error {
	db := database.GetDB()

	// 检查 Event 是否存在
	var event types.Event
	if err := db.First(&event, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("运动会届次不存在")
		}
		return err
	}

	// 检查新名称是否与其他 Event 重复
	var count int64
	if err := db.Model(&types.Event{}).Where("name = ? AND id != ?", name, id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("运动会届次名称已存在")
	}

	return db.Model(&event).Update("name", name).Error
}

// DeleteEvent 删除运动会届次
func DeleteEvent(id int, currentEventID int) error {
	db := database.GetDB()

	// 检查是否是当前选中的 Event
	if currentEventID == id {
		return errors.New("不能删除当前选中的运动会届次")
	}

	// 检查是否有比赛项目关联到这个 Event
	var count int64
	if err := db.Model(&types.Competition{}).Where("event_id = ?", id).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		return errors.New("该运动会届次下存在比赛项目，无法删除")
	}

	// 删除 Event
	result := db.Delete(&types.Event{}, id)
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("运动会届次不存在")
	}

	return nil
}

// GetEventByID 根据ID获取运动会届次
func GetEventByID(id int) (*types.Event, error) {
	db := database.GetDB()

	var event types.Event
	if err := db.First(&event, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("运动会届次不存在")
		}
		return nil, err
	}

	return &event, nil
}

// GetAllEvents 获取所有运动会届次
func GetAllEvents() ([]*types.Event, error) {
	db := database.GetDB()

	var events []*types.Event
	if err := db.Order("id DESC").Find(&events).Error; err != nil {
		return nil, err
	}

	return events, nil
}
