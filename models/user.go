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

// GetPermissionList 获取权限列表
func GetPermissionList(user *types.User) []string {
	return utils.GetPermissionNames(user.Permission)
}

// IsGlobalAdmin 检查是否是全局管理员（没有班级scope限制）
func IsGlobalAdmin(user *types.User) bool {
	return len(user.ClassScopes) == 0
}

// HasClassScope 检查是否有指定班级的权限
func HasClassScope(user *types.User, classID int) bool {
	// 如果是全局管理员，有所有班级的权限
	if IsGlobalAdmin(user) {
		return true
	}

	// 检查是否在班级scope中
	for _, class := range user.ClassScopes {
		if class.ID == classID {
			return true
		}
	}
	return false
}

// GetClassScopeIDs 获取所有班级scope的ID列表
func GetClassScopeIDs(user *types.User) []int {
	ids := make([]int, len(user.ClassScopes))
	for i, class := range user.ClassScopes {
		ids[i] = class.ID
	}
	return ids
}

// CreateUser 创建新用户
func CreateUser(username, password, fullName string, permission int, dingtalkID string) (*types.User, error) {
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

	// 查询用户，预加载ClassScopes
	var user types.User
	err := db.Preload("ClassScopes").First(&user, id).Error
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

	// 查询用户，预加载ClassScopes
	var user types.User
	err := db.Preload("ClassScopes").Where("username = ?", username).First(&user).Error
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

	// 查询用户，预加载ClassScopes
	var user types.User
	err := db.Preload("ClassScopes").Where("ding_talk_id = ?", dingTalkID).First(&user).Error
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

	// 使用事务更新用户数据和班级scopes
	return db.Transaction(func(tx *gorm.DB) error {
		// 更新基本字段
		if err := tx.Select("full_name", "permission", "ding_talk_id").
			Where("id = ?", user.ID).
			Updates(user).
			Error; err != nil {
			return err
		}

		// 更新班级scopes关联
		if err := tx.Model(user).Association("ClassScopes").Replace(user.ClassScopes); err != nil {
			return err
		}

		return nil
	})
}

// UpdateUserClassScopes 更新用户的班级scopes
func UpdateUserClassScopes(userID int, classScopeIDs []int) error {
	db := database.GetDB()

	user := &types.User{ID: userID}

	// 如果classScopeIDs为空，清空所有scopes（全局管理员）
	if len(classScopeIDs) == 0 {
		return db.Model(user).Association("ClassScopes").Clear()
	}

	// 查询班级对象
	var classes []types.Class
	if err := db.Where("id IN ?", classScopeIDs).Find(&classes).Error; err != nil {
		return err
	}

	// 替换关联
	return db.Model(user).Association("ClassScopes").Replace(classes)
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

	// 构建查询，预加载ClassScopes
	query := db.Preload("ClassScopes").Order("id")

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
