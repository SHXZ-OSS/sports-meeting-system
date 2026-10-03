package models

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// HasPermission 检查是否有指定权限
func HasPermission(user *types.User, permission int) bool {
	return utils.HasPermission(user.Permission, permission)
}

// IsClassBound 判断是否为班级账号（绑定了班级的管理员）
func IsClassBound(user *types.User) bool {
	return user.ClassID != nil
}

// CanAccessClass 检查用户是否有指定班级的数据权限
// 全局管理员可访问所有班级，班级账号只能访问自己绑定的班级
func CanAccessClass(user *types.User, classID int) bool {
	if user.ClassID == nil {
		return true
	}
	return *user.ClassID == classID
}

// CreateUser 创建新用户
func CreateUser(
	username, password, fullName string,
	permission int,
	dingtalkID string,
	classID *int,
) (*types.User, error) {
	// 对密码进行哈希处理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// 获取数据库连接
	db := database.GetDB()

	// 创建用户
	user := &types.User{
		Username:   username,
		Password:   string(hashedPassword),
		FullName:   fullName,
		Permission: permission,
		DingTalkID: dingtalkID,
		ClassID:    classID,
	}

	// 使用事务创建用户
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByID 通过 ID 获取用户
func GetUserByID(id int) (*types.User, error) {
	// 获取数据库连接
	db := database.GetDB()

	var user types.User
	err := db.First(&user, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, err
	}

	return &user, nil
}

// GetUserByUsername 通过用户名获取用户
func GetUserByUsername(username string) (*types.User, error) {
	// 获取数据库连接
	db := database.GetDB()

	var user types.User
	err := db.Where("username = ?", username).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, err
	}

	return &user, nil
}

// GetUserByDingTalkID 通过钉钉ID获取用户
func GetUserByDingTalkID(dingTalkID string) (*types.User, error) {
	// 获取数据库连接
	db := database.GetDB()

	var user types.User
	err := db.Where("ding_talk_id = ?", dingTalkID).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, err
	}

	return &user, nil
}

// UpdateUser 更新用户信息
func UpdateUser(user *types.User) error {
	// 获取数据库连接
	db := database.GetDB()

	// 更新基本字段
	return db.Select("full_name", "permission", "ding_talk_id", "class_id").
		Where("id = ?", user.ID).
		Updates(user).
		Error
}

// UpdatePassword 更新用户密码
func UpdatePassword(userID int, newPassword string) error {
	// 对新密码进行哈希处理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 获取数据库连接
	db := database.GetDB()

	// 更新密码
	return db.Model(&types.User{}).Where("id = ?", userID).Update("password", string(hashedPassword)).Error
}

// DeleteUser 删除用户
func DeleteUser(id int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务删除用户
	return db.Transaction(func(tx *gorm.DB) error {
		return tx.Delete(&types.User{}, id).Error
	})
}

// VerifyPassword 验证用户密码
func VerifyPassword(username, password string) (*types.User, error) {
	// 获取用户
	user, err := GetUserByUsername(username)
	if err != nil {
		return nil, errors.New("账号或密码错误")
	}

	// 验证密码
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password))
	if err != nil {
		return nil, errors.New("账号或密码错误")
	}

	return user, nil
}

// GetAllUsers 获取所有用户，支持分页
func GetAllUsers(page, pageSize int) ([]*types.User, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 先获取总数
	var total int64
	if err := db.Model(&types.User{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 构建查询，预加载班级信息
	query := db.Preload("Class").Order("id")

	// 如果指定了分页参数
	if page > 0 && pageSize > 0 {
		offset := (page - 1) * pageSize
		query = query.Limit(pageSize).Offset(offset)
	}

	// 执行查询
	var users []*types.User
	if err := query.Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, int(total), nil
}
