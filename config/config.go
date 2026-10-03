package config

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

var (
	config *Config
	once   sync.Once
)

// Config 应用配置结构
type Config struct {
	Server struct {
		Port int    `json:"port"`
		Host string `json:"host"`
	} `json:"server"`
	Database struct {
		Path string `json:"path"`
	} `json:"database"`
	DingTalk struct {
		AppKey    string `json:"app_key"`
		AppSecret string `json:"app_secret"`
		AgentID   string `json:"agent_id"`
		CorpID    string `json:"corp_id"`
	} `json:"dingtalk"`
	Security struct {
		JWTSecret string `json:"jwt_secret"`
	} `json:"security"`
	Website struct {
		Name           string `json:"name"`
		ICPBeian       string `json:"icp_beian"`
		PublicSecBeian string `json:"public_sec_beian"`
		Domain         string `json:"domain"`
		LogoFilepath   string `json:"logo_filepath"` // 自定义 logo（uploads 目录下的文件名），留空使用默认图标
	} `json:"website"`
	Competition struct {
		SubmissionStartTime       string `json:"submission_start_time"`        // 项目征集开始时间
		SubmissionEndTime         string `json:"submission_end_time"`          // 项目征集结束时间
		VotingStartTime           string `json:"voting_start_time"`            // 项目投票开始时间
		VotingEndTime             string `json:"voting_end_time"`              // 项目投票结束时间
		RegistrationStartTime     string `json:"registration_start_time"`      // 报名开始时间
		RegistrationEndTime       string `json:"registration_end_time"`        // 报名结束时间
		MaxRegistrationsPerPerson int    `json:"max_registrations_per_person"` // 每个人最多可报名的个人比赛项目数量，0表示无限制
	} `json:"competition"`
	Dashboard struct {
		Enabled bool `json:"enabled"` // 看板功能是否启用
	} `json:"dashboard"`
	CurrentEventID int `json:"current_event_id"` // 当前选中的运动会届次ID
	Scoring        struct {
		TeamPointsMapping       map[string]float64 `json:"team_points_mapping"`       // 团体赛名次对应得分映射
		IndividualPointsMapping map[string]float64 `json:"individual_points_mapping"` // 个人赛名次对应得分映射
	} `json:"scoring"`
}

// Load 加载配置文件
func Load() error {
	var err error
	once.Do(func() {
		config = &Config{}

		// 默认配置
		config.Server.Port = 8080
		config.Server.Host = "localhost"
		config.Database.Path = "./data/sports.db"
		config.Security.JWTSecret = "default-jwt-secret-please-change-in-production"
		config.Website.Name = "上海市行知中学运动会系统"
		config.Website.ICPBeian = ""
		config.Website.PublicSecBeian = ""
		config.Website.Domain = ""
		config.Competition.SubmissionStartTime = ""
		config.Competition.SubmissionEndTime = ""
		config.Competition.VotingStartTime = ""
		config.Competition.VotingEndTime = ""
		config.Competition.RegistrationStartTime = ""
		config.Competition.RegistrationEndTime = ""
		config.Competition.MaxRegistrationsPerPerson = 0 // 默认无限制
		config.Dashboard.Enabled = true                  // 默认启用看板功能
		config.CurrentEventID = 1                        // 默认选中第一届运动会

		// 默认得分映射配置
		config.Scoring.TeamPointsMapping = map[string]float64{
			"1": 9, "2": 7, "3": 6, "4": 5, "5": 4, "6": 3, "7": 2, "8": 1,
		}
		config.Scoring.IndividualPointsMapping = map[string]float64{
			"1": 7, "2": 5, "3": 4, "4": 3, "5": 2, "6": 1,
		}

		// 检查配置文件是否存在
		if _, statErr := os.Stat("config.json"); os.IsNotExist(statErr) {
			// 配置文件不存在，创建默认配置
			data, marshalErr := json.MarshalIndent(config, "", "  ")
			if marshalErr != nil {
				err = fmt.Errorf("error creating default config: %w", marshalErr)
				return
			}

			if writeErr := os.WriteFile("config.json", data, 0o644); writeErr != nil {
				err = fmt.Errorf("error writing default config: %w", writeErr)
				return
			}

			fmt.Println("Created default config.json")
		} else {
			// 配置文件存在，读取配置
			data, readErr := os.ReadFile("config.json")
			if readErr != nil {
				err = fmt.Errorf("error reading config: %w", readErr)
				return
			}

			if unmarshalErr := json.Unmarshal(data, config); unmarshalErr != nil {
				err = fmt.Errorf("error parsing config: %w", unmarshalErr)
				return
			}
		}
	})

	return err
}

// Get 获取配置实例
func Get() *Config {
	if config == nil {
		err := Load()
		if err != nil {
			return nil
		}
	}
	return config
}

// Save 保存当前配置到文件
func Save() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("error marshaling config: %w", err)
	}

	return os.WriteFile("config.json", data, 0o644)
}
