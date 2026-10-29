package services

import (
	"context"
	"fmt"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
)

// 检录前定时提醒的扫描间隔
const checkinReminderScanInterval = 30 * time.Second

// StartCheckinReminderScheduler 启动检录前定时提醒的后台扫描
// 扫描一旦启动就常驻运行，是否真正发送由系统设置中的开关与提前分钟数决定
func StartCheckinReminderScheduler(ctx context.Context) {
	go func() {
		scanDueCheckinReminders()

		ticker := time.NewTicker(checkinReminderScanInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				scanDueCheckinReminders()
			}
		}
	}()
}

// scanDueCheckinReminders 扫描进入提醒时间窗的比赛并发送检录预告
func scanDueCheckinReminders() {
	cfg := config.Get()
	if cfg == nil || !cfg.DingTalk.NotifyCheckinAhead {
		return
	}
	// 未配置钉钉时直接跳过，避免每个扫描周期都产生失败日志
	if cfg.DingTalk.AppKey == "" || cfg.DingTalk.AppSecret == "" {
		return
	}

	aheadMinutes := cfg.DingTalk.CheckinAheadMinutes
	if aheadMinutes < 1 {
		aheadMinutes = 1
	}

	competitions, err := models.GetCompetitionsDueCheckinReminder(
		time.Now(),
		time.Duration(aheadMinutes)*time.Minute,
	)
	if err != nil {
		logger.L.Warn(fmt.Sprintf("查询待发送检录预告失败: %v", err))
		return
	}

	for _, comp := range competitions {
		// 先原子抢占发送权，抢占失败说明其他实例已处理
		claimed, err := models.ClaimCheckinReminder(comp.ID, time.Now())
		if err != nil {
			logger.L.Warn(fmt.Sprintf("领取检录预告发送权失败 competition=%d: %v", comp.ID, err))
			continue
		}
		if !claimed {
			continue
		}

		if err := SendPreCheckinNotice(comp); err != nil {
			logger.L.Warn(fmt.Sprintf("发送检录预告失败 competition=%d: %v", comp.ID, err))
			// 发送失败释放占位，下个扫描周期重试
			if resetErr := models.ResetCheckinReminderSent(comp.ID); resetErr != nil {
				logger.L.Warn(fmt.Sprintf("释放检录预告占位失败 competition=%d: %v", comp.ID, resetErr))
			}
		}
	}
}
