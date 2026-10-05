package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// 检查用户名是否已存在
func isStudentUsernameExists(db *gorm.DB, username string) (bool, error) {
	var count int64
	err := db.Model(&types.Student{}).Where("username = ?", username).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateStudent 创建新学生
func CreateStudent(
	username, fullName string,
	gender int,
	classID int,
	dingTalkID string,
) (*types.Student, error) {
	// 获取数据库连接
	db := database.GetDB()

	if username != "" {
		// 预定义用户名：校验格式与唯一性，冲突直接报错，不静默改名
		username = strings.TrimSpace(username)
		if err := utils.ValidateUsernameFormat(username); err != nil {
			return nil, err
		}
		exists, err := isStudentUsernameExists(db, username)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, fmt.Errorf("用户名 %s 已存在", username)
		}
	} else {
		// 自动生成用户名：stu+姓名拼音首字母+随机数
		var err error
		username, err = utils.GenerateStudentUsername(fullName)
		if err != nil {
			return nil, err
		}

		// 检查用户名是否已存在，如果已存在则重新生成
		exists, err := isStudentUsernameExists(db, username)
		if err != nil {
			return nil, err
		}

		// 如果用户名已存在，尝试重新生成最多5次
		attempts := 0
		for exists && attempts < 5 {
			username, err = utils.GenerateStudentUsername(fullName)
			if err != nil {
				return nil, err
			}
			exists, err = isStudentUsernameExists(db, username)
			if err != nil {
				return nil, err
			}
			attempts++
		}

		// 如果用户名仍然存在，使用时间戳确保唯一性
		if exists {
			timestamp := time.Now().UnixNano() / 1000000
			username = fmt.Sprintf("%s%d", username, timestamp)
		}
	}

	// 如果没有提供钉钉ID，设置为空字符串
	if dingTalkID == "" {
		dingTalkID = "0"
	}

	// 创建学生（学生统一通过钉钉/OIDC 登录，无密码）
	student := &types.Student{
		Username:   username,
		FullName:   fullName,
		Gender:     gender,
		ClassID:    classID,
		DingTalkID: dingTalkID,
	}

	// 使用事务插入学生数据
	err := db.Transaction(func(tx *gorm.DB) error {
		return tx.Create(student).Error
	})
	if err != nil {
		return nil, err
	}

	return student, nil
}

// GetStudentByID 通过ID获取学生
func GetStudentByID(id int) (*types.Student, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 查询学生，包含班级信息
	var student types.Student
	err := db.Preload("Class").First(&student, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("学生不存在")
		}
		return nil, err
	}

	// 设置班级名称
	if student.Class.ID > 0 {
		student.ClassName = student.Class.Name
	}

	return &student, nil
}

// GetStudentByUsername 通过用户名获取学生
func GetStudentByUsername(username string) (*types.Student, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 查询学生，包含班级信息
	var student types.Student
	err := db.Preload("Class").Where("username = ?", username).First(&student).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("学生不存在")
		}
		return nil, err
	}

	// 设置班级名称
	if student.Class.ID > 0 {
		student.ClassName = student.Class.Name
	}

	return &student, nil
}

// GetStudentByDingTalkID 通过钉钉ID获取学生
func GetStudentByDingTalkID(dingTalkID string) (*types.Student, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 查询学生，包含班级信息
	var student types.Student
	err := db.Preload("Class").Where("ding_talk_id = ?", dingTalkID).First(&student).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("学生不存在")
		}
		return nil, err
	}

	// 设置班级名称
	if student.Class.ID > 0 {
		student.ClassName = student.Class.Name
	}

	return &student, nil
}

// GetAllStudents 获取所有学生，支持分页
// scopeClassID: 数据权限过滤的班级ID，0 表示不过滤（全局管理员）
func GetAllStudents(page, pageSize int, scopeClassID int, classID int) ([]*types.Student, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 构建查询
	query := db.Preload("Class")
	countQuery := db.Model(&types.Student{})

	// 如果限定了数据权限班级，应用过滤
	if scopeClassID > 0 {
		query = query.Where("class_id = ?", scopeClassID)
		countQuery = countQuery.Where("class_id = ?", scopeClassID)
	}

	// 如果指定了classID，对classID过滤
	if classID > 0 {
		query = query.Where("class_id = ?", classID)
		countQuery = countQuery.Where("class_id = ?", classID)
	}

	// 先获取总数
	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 如果指定了分页参数
	if page > 0 && pageSize > 0 {
		offset := (page - 1) * pageSize
		query = query.Limit(pageSize).Offset(offset)
	}

	// 执行查询
	var students []*types.Student
	if err := query.Order("class_id, id").Find(&students).Error; err != nil {
		return nil, 0, err
	}

	// 设置班级名称
	for _, student := range students {
		if student.Class.ID > 0 {
			student.ClassName = student.Class.Name
		}
	}

	return students, int(total), nil
}

// UpdateStudent 更新学生信息
func UpdateStudent(student *types.Student) error {
	// 获取数据库连接
	db := database.GetDB()

	// 更新学生数据
	return db.Select("full_name", "gender", "class_id", "ding_talk_id").
		Where("id = ?", student.ID).
		Updates(student).
		Error
}

// DeleteStudent 删除学生
func DeleteStudent(id int) error {
	// 获取数据库连接
	db := database.GetDB()

	// 使用事务删除学生及相关记录
	return db.Transaction(func(tx *gorm.DB) error {
		// 删除学生的报名记录
		if err := tx.Where("student_id = ?", id).Delete(&types.Registration{}).Error; err != nil {
			return err
		}

		// 删除学生的成绩记录
		if err := tx.Where("student_id = ?", id).Delete(&types.Score{}).Error; err != nil {
			return err
		}

		// 删除学生
		return tx.Delete(&types.Student{}, id).Error
	})
}
