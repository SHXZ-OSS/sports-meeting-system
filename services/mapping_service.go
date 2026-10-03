package services

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// 添加全局变量以存储重建日志
var (
	mappingLogs     []string
	mappingLogMutex sync.Mutex
	isRebuilding    bool
	rebuildingMutex sync.Mutex
)

// GetMappingLogs 获取重建家长-学生映射关系的日志
func GetMappingLogs() []string {
	mappingLogMutex.Lock()
	defer mappingLogMutex.Unlock()

	// 返回日志副本
	logs := make([]string, len(mappingLogs))
	copy(logs, mappingLogs)
	return logs
}

// IsRebuildingMapping 检查是否正在重建映射关系
func IsRebuildingMapping() bool {
	rebuildingMutex.Lock()
	defer rebuildingMutex.Unlock()
	return isRebuilding
}

// 添加日志并保存
func addMappingLog(message string) {
	mappingLogMutex.Lock()
	defer mappingLogMutex.Unlock()

	// 添加时间戳
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s", timestamp, message)

	// 添加到日志列表
	mappingLogs = append(mappingLogs, logEntry)

	// 同时输出到标准日志
	logger.L.Info(message)
}

// ClearMappingLogs 清除映射日志
func ClearMappingLogs() {
	mappingLogMutex.Lock()
	defer mappingLogMutex.Unlock()

	mappingLogs = []string{}
}

// RebuildParentStudentMapping 重建所有家长-学生映射关系
func RebuildParentStudentMapping() error {
	// 检查是否已经在重建
	rebuildingMutex.Lock()
	if isRebuilding {
		rebuildingMutex.Unlock()
		return errors.New("映射关系重建已在进行中，请等待完成")
	}

	// 设置重建状态为 true
	isRebuilding = true
	rebuildingMutex.Unlock()

	// 清除之前的日志
	ClearMappingLogs()

	// 函数结束时复位状态
	defer func() {
		rebuildingMutex.Lock()
		isRebuilding = false
		rebuildingMutex.Unlock()
	}()

	// 记录开始
	addMappingLog("开始重建家长-学生映射关系")

	// 获取所有班级ID
	classIDs, err := utils.GetAllClassIDs(addMappingLog)
	if err != nil {
		errMsg := fmt.Sprintf("获取班级列表失败: %v", err)
		addMappingLog(errMsg)
		return errors.New(errMsg)
	}

	addMappingLog(fmt.Sprintf("共获取到 %d 个班级需要处理", len(classIDs)))

	// 清空现有的映射关系
	if err := models.ClearAllParentStudentRelations(); err != nil {
		errMsg := fmt.Sprintf("清空映射关系失败: %v", err)
		addMappingLog(errMsg)
		return errors.New(errMsg)
	}

	addMappingLog("已清空现有映射关系")

	// 使用等待组但有限制并发数
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 2) // 最多2个并发请求，避免触发QPS限制

	// 记录处理结果
	successCount := 0
	failCount := 0
	relationCount := 0
	var resultMutex sync.Mutex

	// 遍历所有班级并获取家长-学生关系
	for i, classID := range classIDs {
		wg.Add(1)
		semaphore <- struct{}{} // 占用一个并发槽

		go func(cid string, index int) {
			defer wg.Done()
			defer func() { <-semaphore }() // 释放并发槽

			// 获取该班级所有的家长-学生关系
			addMappingLog(fmt.Sprintf("正在处理班级 %s (%d/%d)", cid, index+1, len(classIDs)))
			relations, err := utils.GetClassParentStudentRelations(cid)
			if err != nil {
				errMsg := fmt.Sprintf("获取班级 %s 的关系失败: %v", cid, err)
				addMappingLog(errMsg)
				resultMutex.Lock()
				failCount++
				resultMutex.Unlock()
				return
			}

			if len(relations) == 0 {
				addMappingLog(fmt.Sprintf("班级 %s (%d/%d) 没有家长-学生关系", cid, index+1, len(classIDs)))
				return
			}

			// 保存本班级获取到的计数
			localRelationCount := 0

			// 保存获取到的关系
			for _, rel := range relations {
				// 保存关系到数据库
				err := models.SaveParentStudentRelation(rel.GuardianUserID, rel.StudentUserID, rel.Relation)
				if err != nil {
					errMsg := fmt.Sprintf("保存关系失败 (家长: %s, 学生: %s): %v",
						rel.GuardianUserID, rel.StudentUserID, err)
					addMappingLog(errMsg)
				} else {
					localRelationCount++
				}
			}

			resultMutex.Lock()
			successCount++
			relationCount += localRelationCount
			resultMutex.Unlock()

			addMappingLog(fmt.Sprintf("班级 %s (%d/%d) 处理完成，保存了 %d 个关系",
				cid, index+1, len(classIDs), localRelationCount))
		}(classID, i)
	}

	// 等待所有操作完成
	wg.Wait()

	// 总结日志
	summaryMsg := fmt.Sprintf("家长-学生映射关系重建完成。成功: %d 班级, 失败: %d 班级, 共创建 %d 个关系",
		successCount, failCount, relationCount)
	addMappingLog(summaryMsg)

	if failCount > 0 {
		return fmt.Errorf("部分班级(%d/%d)处理失败", failCount, len(classIDs))
	}

	return nil
}
