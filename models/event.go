package models

import (
	"errors"
	"sync"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

var (
	cachedEventName   string
	cachedEventNameID int
	eventNameCached   bool
	eventNameCacheMu  sync.RWMutex
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

	if err := db.Model(&event).Update("name", name).Error; err != nil {
		return err
	}

	invalidateEventNameCache()

	return nil
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

	invalidateEventNameCache()

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

// GetCurrentEventName 返回当前选中届次的名称；未配置或查询失败时返回空串。
// 名称只在切换届次、改名或删除时变化，因此缓存在内存中（按届次 ID 命中），
// 避免公开接口和首页注入每次请求都查库。
func GetCurrentEventName() string {
	currentEventID := config.Get().CurrentEventID
	if currentEventID == 0 {
		return ""
	}

	eventNameCacheMu.RLock()
	if eventNameCached && cachedEventNameID == currentEventID {
		name := cachedEventName
		eventNameCacheMu.RUnlock()
		return name
	}
	eventNameCacheMu.RUnlock()

	event, err := GetEventByID(currentEventID)
	if err != nil || event == nil {
		// 查询失败（如届次已被删除）不写缓存，下一次请求重新尝试
		return ""
	}

	eventNameCacheMu.Lock()
	cachedEventName = event.Name
	cachedEventNameID = currentEventID
	eventNameCached = true
	eventNameCacheMu.Unlock()

	return event.Name
}

// invalidateEventNameCache 清空届次名称缓存；届次改名或删除后必须调用
func invalidateEventNameCache() {
	eventNameCacheMu.Lock()
	eventNameCached = false
	eventNameCacheMu.Unlock()
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
