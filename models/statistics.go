package models

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

var (
	cachedStatistics     *types.Statistics
	cachedStatisticsHash string
	lastCacheUpdate      time.Time
	statisticsCacheMutex sync.RWMutex
	cacheDuration        = 1 * time.Second
)

// getCompetitionCount 获取已完成和未完成的比赛数量
func getCompetitionCount() (int, int, error) {
	// 获取数据库连接
	db := database.GetDB()

	// 获取当前选中的 EventID
	cfg := config.Get()
	currentEventID := cfg.CurrentEventID

	// 查询已完成的比赛数量
	var completedCount int64
	if err := db.Model(&types.Competition{}).
		Where("status = ? AND event_id = ?", types.StatusCompleted, currentEventID).
		Count(&completedCount).
		Error; err != nil {
		return 0, 0, err
	}

	// 查询待完成的比赛数量
	var remainingCount int64
	if err := db.Model(&types.Competition{}).
		Where("(status = ? OR status = ?) AND event_id = ?", types.StatusApproved, types.StatusPendingScoreReview, currentEventID).
		Count(&remainingCount).
		Error; err != nil {
		return 0, 0, err
	}

	return int(completedCount), int(remainingCount), nil
}

// GetStatistics 获取看板统计信息
func GetStatistics() (*types.Statistics, error) {
	// 尝试从缓存中读取
	statisticsCacheMutex.RLock()
	if cachedStatistics != nil && time.Since(lastCacheUpdate) < cacheDuration {
		stats := cachedStatistics
		statisticsCacheMutex.RUnlock()
		return stats, nil
	}
	statisticsCacheMutex.RUnlock()

	// 缓存过期或不存在，需要更新
	statisticsCacheMutex.Lock()
	defer statisticsCacheMutex.Unlock()

	// 双重检查，防止多个goroutine同时更新
	if cachedStatistics != nil && time.Since(lastCacheUpdate) < cacheDuration {
		return cachedStatistics, nil
	}

	// 初始化统计信息
	stats := &types.Statistics{}

	// 获取最新完成的比赛
	latestComp, err := getLatestCompletedCompetition()
	if err != nil {
		return nil, err
	}
	stats.LatestCompetition = latestComp

	// 获取最新成绩
	if latestComp != nil {
		latestScores, err := GetScoresByCompetitionID(latestComp.ID)
		if err != nil {
			return nil, err
		}
		stats.LatestScores = latestScores
	}

	// 获取比赛数量
	completedCount, remainingCount, err := getCompetitionCount()
	if err != nil {
		return nil, err
	}
	stats.CompletedCompetitionCount = completedCount
	stats.RemainingCompetitionCount = remainingCount

	// 获取前10名班级
	topClasses, err := GetTopClasses(10)
	if err != nil {
		return nil, err
	}
	stats.TopClasses = topClasses

	// 获取前10名学生
	topStudents, err := GetTopStudents(10)
	if err != nil {
		return nil, err
	}
	stats.TopStudents = topStudents

	// 计算哈希值
	hash, err := calculateStatisticsHash(stats)
	if err != nil {
		return nil, err
	}

	// 更新缓存
	cachedStatistics = stats
	cachedStatisticsHash = hash
	lastCacheUpdate = time.Now()

	return stats, nil
}

// calculateStatisticsHash 计算统计数据的哈希值
func calculateStatisticsHash(stats *types.Statistics) (string, error) {
	// 将统计数据序列化为 JSON
	data, err := json.Marshal(stats)
	if err != nil {
		return "", err
	}

	// 计算 MD5 哈希（取前8位即可，节省带宽）
	hash := md5.Sum(data)
	return hex.EncodeToString(hash[:4]), nil
}

// GetStatisticsHash 获取当前缓存的统计数据哈希值
func GetStatisticsHash() string {
	statisticsCacheMutex.RLock()
	defer statisticsCacheMutex.RUnlock()
	return cachedStatisticsHash
}
