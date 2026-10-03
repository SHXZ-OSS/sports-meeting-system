package models

import (
	"errors"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// GetClassByID 通过ID获取班级
func GetClassByID(id int) (*types.Class, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 查询班级
	var class types.Class
	err := db.First(&class, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("班级不存在")
		}
		return nil, err
	}

	return &class, nil
}

// GetAllClasses 获取所有班级
func GetAllClasses(page, pageSize int) ([]*types.Class, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 构建查询
	query := db.Model(&types.Class{}).Order("id ASC")
	if page > 0 && pageSize > 0 {
		query = query.Offset((page - 1) * pageSize).Limit(pageSize)
	}

	// 执行查询
	var classes []*types.Class
	if err := query.Find(&classes).Error; err != nil {
		return nil, 0, err
	}

	// 获取总数
	var total int64
	if err := db.Model(&types.Class{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	return classes, int(total), nil
}

// GetOrCreateClassByName 根据班级名称获取或创建班级
func GetOrCreateClassByName(name string) (int, bool, error) {
	// 获取数据库连接
	db := database.GetDB()

	var classID int
	var isCreated bool
	// 使用事务防止并发冲突
	err := db.Transaction(func(tx *gorm.DB) error {
		// 先尝试查找现有班级
		var class types.Class
		err := tx.Where("name = ?", name).First(&class).Error
		if err == nil {
			classID = class.ID
			isCreated = false
			return nil
		}

		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// 班级不存在，创建新班级
		isCreated = true
		newClass := types.Class{Name: name}
		if err := tx.Create(&newClass).Error; err != nil {
			return err
		}

		classID = newClass.ID
		return nil
	})
	if err != nil {
		return 0, isCreated, err
	}

	return classID, isCreated, nil
}

// CreateClass 创建班级
func CreateClass(name string) (*types.Class, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 检查班级名称是否已存在
	var count int64
	if err := db.Model(&types.Class{}).Where("name = ?", name).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("班级名称已存在")
	}

	// 创建班级
	class := &types.Class{Name: name}
	if err := db.Create(class).Error; err != nil {
		return nil, err
	}

	return class, nil
}

// UpdateClass 更新班级信息
func UpdateClass(class *types.Class) error {
	// 获取数据库连接
	db := database.GetDB()

	// 检查班级名称是否已被其他班级使用
	var count int64
	if err := db.Model(&types.Class{}).
		Where("name = ? AND id != ?", class.Name, class.ID).
		Count(&count).
		Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("班级名称已存在")
	}

	// 更新班级数据
	return db.Save(class).Error
}

// DeleteClass 删除班级
func DeleteClass(id int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 检查是否有学生属于该班级
	var count int64
	if err := db.Table("students").Where("class_id = ?", id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("班级下还有学生，无法删除")
	}

	// 删除班级
	return db.Delete(&types.Class{}, id).Error
}
