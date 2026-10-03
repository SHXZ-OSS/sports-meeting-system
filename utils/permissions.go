package utils

// 权限常量 (二进制位操作)
const (
	PermissionProjectManagement         = 1 << iota // 项目管理 (1)
	PermissionUserManagement                        // 用户管理 (2)
	PermissionStudentAndClassManagement             // 学生与班级管理 (4)
	PermissionWebsiteManagement                     // 网站信息与设置管理 (8)
	PermissionScoreInput                            // 成绩提交 (16)
	PermissionScoreReview                           // 成绩审核 (32)
	PermissionRegistrationManagement                // 报名管理 (64)
)

// PermissionInfo 权限信息结构
type PermissionInfo struct {
	Value int    `json:"value"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

// GetAllPermissions 获取所有权限
func GetAllPermissions() int {
	return PermissionProjectManagement |
		PermissionUserManagement |
		PermissionStudentAndClassManagement |
		PermissionWebsiteManagement |
		PermissionScoreInput |
		PermissionScoreReview |
		PermissionRegistrationManagement
}

// HasPermission 检查是否有指定权限
func HasPermission(userPermission, targetPermission int) bool {
	return userPermission&targetPermission != 0
}

// GetPermissionNames 获取权限名称列表
func GetPermissionNames(permission int) []string {
	var permissions []string

	if HasPermission(permission, PermissionProjectManagement) {
		permissions = append(permissions, "project_management")
	}
	if HasPermission(permission, PermissionUserManagement) {
		permissions = append(permissions, "user_management")
	}
	if HasPermission(permission, PermissionStudentAndClassManagement) {
		permissions = append(permissions, "student_management")
	}
	if HasPermission(permission, PermissionWebsiteManagement) {
		permissions = append(permissions, "website_management")
	}
	if HasPermission(permission, PermissionScoreInput) {
		permissions = append(permissions, "score_input")
	}
	if HasPermission(permission, PermissionScoreReview) {
		permissions = append(permissions, "score_review")
	}
	if HasPermission(permission, PermissionRegistrationManagement) {
		permissions = append(permissions, "registration_management")
	}

	return permissions
}

// HasMorePermissions 检查是否有更多权限（用于权限比较）
func HasMorePermissions(userPermission, targetPermission int) bool {
	// 检查target权限是否是user权限的子集
	// 如果target的所有权限位在user中都有，则user权限不算更多
	// 只有当user有target没有的权限时，才算更多
	return (userPermission & ^targetPermission) != 0
}

// CountPermissions 计算权限数量
func CountPermissions(permission int) int {
	count := 0
	for i := range 32 {
		if permission&(1<<i) != 0 {
			count++
		}
	}
	return count
}

// IsValidPermission 验证权限值是否有效
func IsValidPermission(permission int) bool {
	allPermissions := GetAllPermissions()
	return (permission & ^allPermissions) == 0
}
