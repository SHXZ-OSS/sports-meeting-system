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

// HasMorePermissions 检查是否有更多权限（用于权限比较）
func HasMorePermissions(userPermission, targetPermission int) bool {
	// 检查target权限是否是user权限的子集
	// 如果target的所有权限位在user中都有，则user权限不算更多
	// 只有当user有target没有的权限时，才算更多
	return (userPermission & ^targetPermission) != 0
}
