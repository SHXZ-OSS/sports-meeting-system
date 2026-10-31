package services

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

// 雷达图相关错误
var (
	ErrRadarUnknownPreset   = errors.New("未知的雷达图预设")
	ErrRadarDimensionCount  = errors.New("雷达图维度需在 3 到 10 个之间")
	ErrRadarDimensionLabel  = errors.New("维度名称不能为空且不超过 12 个字")
	ErrRadarDimensionDup    = errors.New("维度名称不能重复")
	ErrRadarPresetLocked    = errors.New("已有比赛录入了本预设的统计数据，不能更换预设；如需更换请先清除这些比赛的结果")
	ErrRadarStatsRequired   = errors.New("该对阵表启用了雷达图，录入结果时需填写双方全部统计数据")
	ErrRadarScoreRequired   = errors.New("该对阵表启用了雷达图，录入结果时需填写双方比分")
	ErrRadarManualDimension = errors.New("手动评分的维度不存在")
	ErrRadarManualRange     = errors.New("评分需在 0 到 5 之间")
	ErrRadarNotEnabled      = errors.New("该对阵表未启用雷达图")
)

const (
	radarMinDimensions = 3
	radarMaxDimensions = 10
	radarMaxLabelLen   = 12
	radarMaxStatValue  = 9999
	// radarShrinkK 收缩强度：相当于给每队先加 0.5 场「中等水平」的虚拟比赛
	radarShrinkK  = 0.5
	radarNeutral  = 2.5
	radarMaxScore = 5.0
)

// ==== 预设 ====

// term 构造公式项的简写
func term(side types.RadarSide, field string, weight float64) types.RadarTerm {
	return types.RadarTerm{Side: side, Field: field, Weight: weight}
}

func own(field string) types.RadarTerm { return term(types.RadarSideOwn, field, 1) }
func opp(field string) types.RadarTerm { return term(types.RadarSideOpp, field, 1) }

var perMatch = []types.RadarTerm{own(types.RadarFieldMatch)}

// perSet 局制项目每场的局数（双方比分之和）
var perSet = []types.RadarTerm{own(types.RadarFieldScore), opp(types.RadarFieldScore)}

type radarPresetDef struct {
	label       string
	description string
	fields      []types.RadarStatField
	constraints []types.RadarSumConstraint
	dimensions  []types.RadarDimension
}

var radarPresets = map[types.RadarPreset]radarPresetDef{
	types.RadarPresetFootball: {
		label:       "足球",
		description: "比分为进球数；每场统计射门、射正、扑救、角球、犯规与红黄牌",
		fields: []types.RadarStatField{
			{Key: "shots", Label: "射门"},
			{Key: "shots_on", Label: "射正"},
			{Key: "saves", Label: "扑救"},
			{Key: "corners", Label: "角球"},
			{Key: "fouls", Label: "犯规"},
			{Key: "yellow", Label: "黄牌"},
			{Key: "red", Label: "红牌"},
		},
		constraints: []types.RadarSumConstraint{
			{Fields: []string{"shots_on"}, Max: "shots", Message: "射正不能多于射门"},
		},
		dimensions: []types.RadarDimension{
			{
				Key: "attack", Label: "进攻",
				Description: "场均（进球 + 0.3 × 射正），0 → 4 映射为 0 → 5",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{
						own(types.RadarFieldScore),
						term(types.RadarSideOwn, "shots_on", 0.3),
					},
					Denominator: perMatch,
					Low:         0,
					High:        4,
				},
			},
			{
				Key: "finishing", Label: "把握能力",
				Description: "进球 ÷ 射正，10% → 60%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own(types.RadarFieldScore)},
					Denominator: []types.RadarTerm{own("shots_on")}, Low: 0.1, High: 0.6,
				},
			},
			{
				Key: "defense", Label: "防守",
				Description: "对手场均（进球 + 0.3 × 射正），越少越好，4 → 0",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{
						opp(types.RadarFieldScore),
						term(types.RadarSideOpp, "shots_on", 0.3),
					},
					Denominator: perMatch,
					Low:         0,
					High:        4,
					Invert:      true,
				},
			},
			{
				Key: "goalkeeping", Label: "门将",
				Description: "扑救 ÷（扑救 + 失球），30% → 90%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("saves")},
					Denominator: []types.RadarTerm{own("saves"), opp(types.RadarFieldScore)}, Low: 0.3, High: 0.9,
				},
			},
			{
				Key: "control", Label: "场面控制",
				Description: "（射门 + 0.5 × 角球）占双方合计的比例，20% → 80%",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{own("shots"), term(types.RadarSideOwn, "corners", 0.5)},
					Denominator: []types.RadarTerm{
						own("shots"), term(types.RadarSideOwn, "corners", 0.5),
						opp("shots"), term(types.RadarSideOpp, "corners", 0.5),
					},
					Low: 0.2, High: 0.8,
				},
			},
			{
				Key: "discipline", Label: "纪律",
				Description: "场均（犯规 + 3 × 黄牌 + 8 × 红牌），越少越好，25 → 2",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{
						own("fouls"), term(types.RadarSideOwn, "yellow", 3), term(types.RadarSideOwn, "red", 8),
					},
					Denominator: perMatch, Low: 2, High: 25, Invert: true,
				},
			},
		},
	},
	types.RadarPresetBasketball: {
		label:       "篮球",
		description: "比分为得分；每场统计投篮、罚球、篮板、助攻、抢断、盖帽与失误",
		fields: []types.RadarStatField{
			{Key: "fga", Label: "投篮出手", Hint: "含三分"},
			{Key: "fgm", Label: "投篮命中"},
			{Key: "fta", Label: "罚球出手"},
			{Key: "ftm", Label: "罚球命中"},
			{Key: "reb", Label: "篮板"},
			{Key: "ast", Label: "助攻"},
			{Key: "stl", Label: "抢断"},
			{Key: "blk", Label: "盖帽"},
			{Key: "tov", Label: "失误"},
		},
		constraints: []types.RadarSumConstraint{
			{Fields: []string{"fgm"}, Max: "fga", Message: "投篮命中不能多于投篮出手"},
			{Fields: []string{"ftm"}, Max: "fta", Message: "罚球命中不能多于罚球出手"},
		},
		dimensions: []types.RadarDimension{
			{
				Key: "scoring", Label: "得分",
				Description: "场均得分，10 → 60",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own(types.RadarFieldScore)},
					Denominator: perMatch, Low: 10, High: 60,
				},
			},
			{
				Key: "efficiency", Label: "投篮效率",
				Description: "真实命中率 = 得分 ÷ 2(投篮出手 + 0.44 × 罚球出手)，30% → 65%",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{own(types.RadarFieldScore)},
					Denominator: []types.RadarTerm{
						term(types.RadarSideOwn, "fga", 2),
						term(types.RadarSideOwn, "fta", 0.88),
					},
					Low:  0.3,
					High: 0.65,
				},
			},
			{
				Key: "rebound", Label: "篮板",
				Description: "篮板占双方合计的比例，30% → 70%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("reb")},
					Denominator: []types.RadarTerm{own("reb"), opp("reb")}, Low: 0.3, High: 0.7,
				},
			},
			{
				Key: "playmaking", Label: "组织",
				Description: "助攻 ÷（助攻 + 失误），30% → 75%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("ast")},
					Denominator: []types.RadarTerm{own("ast"), own("tov")}, Low: 0.3, High: 0.75,
				},
			},
			{
				Key: "defense", Label: "防守",
				Description: "对手真实命中率，越低越好，65% → 30%",
				Formula: &types.RadarFormula{
					Numerator: []types.RadarTerm{opp(types.RadarFieldScore)},
					Denominator: []types.RadarTerm{
						term(types.RadarSideOpp, "fga", 2),
						term(types.RadarSideOpp, "fta", 0.88),
					},
					Low:    0.3,
					High:   0.65,
					Invert: true,
				},
			},
			{
				Key: "disruption", Label: "抢断盖帽",
				Description: "场均（抢断 + 盖帽），0 → 15",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("stl"), own("blk")},
					Denominator: perMatch, Low: 0, High: 15,
				},
			},
		},
	},
	types.RadarPresetTableTenn: {
		label:       "乒乓球",
		description: "比分为局数；每场统计总得分、发球轮得分、主动失误与关键分",
		fields: []types.RadarStatField{
			{Key: "points", Label: "总得分"},
			{Key: "serve_total", Label: "发球轮分数", Hint: "本方发球的回合数"},
			{Key: "serve_won", Label: "发球轮得分"},
			{Key: "errors", Label: "主动失误"},
			{Key: "clutch_won", Label: "关键分得分", Hint: "每局 9 平后与决胜局"},
		},
		constraints: []types.RadarSumConstraint{
			{Fields: []string{"serve_won"}, Max: "serve_total", Message: "发球轮得分不能多于发球轮分数"},
			{Fields: []string{"serve_won"}, Max: "points", Message: "发球轮得分不能多于总得分"},
			{Fields: []string{"clutch_won"}, Max: "points", Message: "关键分得分不能多于总得分"},
		},
		dimensions: []types.RadarDimension{
			{
				Key: "serve", Label: "发球",
				Description: "发球轮得分率，40% → 75%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("serve_won")},
					Denominator: []types.RadarTerm{own("serve_total")}, Low: 0.4, High: 0.75,
				},
			},
			{
				Key: "receive", Label: "接发球",
				Description: "接发球轮得分率 =（总得分 − 发球轮得分）÷ 对手发球轮分数，25% → 60%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("points"), term(types.RadarSideOwn, "serve_won", -1)},
					Denominator: []types.RadarTerm{opp("serve_total")}, Low: 0.25, High: 0.6,
				},
			},
			{
				Key: "consistency", Label: "稳定性",
				Description: "主动失误 ÷ 双方总得分，越低越好，35% → 5%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("errors")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.05, High: 0.35, Invert: true,
				},
			},
			{
				Key: "clutch", Label: "关键分",
				Description: "关键分得分占双方关键分的比例，20% → 80%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("clutch_won")},
					Denominator: []types.RadarTerm{own("clutch_won"), opp("clutch_won")}, Low: 0.2, High: 0.8,
				},
			},
			{
				Key: "dominance", Label: "压制力",
				Description: "总得分占双方合计的比例，35% → 65%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("points")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.35, High: 0.65,
				},
			},
		},
	},
	types.RadarPresetBadminton: {
		label:       "羽毛球",
		description: "比分为局数；每场统计总得分、杀球得分、网前得分、主动失误与关键分",
		fields: []types.RadarStatField{
			{Key: "points", Label: "总得分"},
			{Key: "smash_won", Label: "杀球得分"},
			{Key: "net_won", Label: "网前得分", Hint: "搓放、扑球等网前直接得分"},
			{Key: "errors", Label: "主动失误", Hint: "含发球失误"},
			{Key: "clutch_won", Label: "关键分得分", Hint: "每局 18 平后与决胜局"},
		},
		constraints: []types.RadarSumConstraint{
			{Fields: []string{"smash_won", "net_won"}, Max: "points", Message: "杀球与网前得分之和不能多于总得分"},
			{Fields: []string{"clutch_won"}, Max: "points", Message: "关键分得分不能多于总得分"},
		},
		dimensions: []types.RadarDimension{
			{
				Key: "attack", Label: "进攻",
				Description: "每局杀球得分，0 → 8",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("smash_won")},
					Denominator: perSet, Low: 0, High: 8,
				},
			},
			{
				Key: "net", Label: "网前",
				Description: "每局网前得分，0 → 6",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("net_won")},
					Denominator: perSet, Low: 0, High: 6,
				},
			},
			{
				Key: "consistency", Label: "稳定性",
				Description: "主动失误 ÷ 双方总得分，越低越好，35% → 5%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("errors")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.05, High: 0.35, Invert: true,
				},
			},
			{
				Key: "clutch", Label: "关键分",
				Description: "关键分得分占双方关键分的比例，20% → 80%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("clutch_won")},
					Denominator: []types.RadarTerm{own("clutch_won"), opp("clutch_won")}, Low: 0.2, High: 0.8,
				},
			},
			{
				Key: "dominance", Label: "压制力",
				Description: "总得分占双方合计的比例，35% → 65%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("points")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.35, High: 0.65,
				},
			},
		},
	},
	types.RadarPresetVolleyball: {
		label:       "排球",
		description: "比分为局数；每场统计扣球、拦网、发球、一传与失误",
		fields: []types.RadarStatField{
			{Key: "points", Label: "总得分"},
			{Key: "attack_total", Label: "扣球次数"},
			{Key: "attack_won", Label: "扣球得分"},
			{Key: "block_won", Label: "拦网得分"},
			{Key: "aces", Label: "发球得分"},
			{Key: "serve_errors", Label: "发球失误"},
			{Key: "receive_total", Label: "一传次数"},
			{Key: "receive_good", Label: "一传到位"},
			{Key: "errors", Label: "其他失误", Hint: "扣球出界、触网、连击等"},
		},
		constraints: []types.RadarSumConstraint{
			{Fields: []string{"attack_won"}, Max: "attack_total", Message: "扣球得分不能多于扣球次数"},
			{Fields: []string{"receive_good"}, Max: "receive_total", Message: "一传到位不能多于一传次数"},
			{Fields: []string{"attack_won", "block_won", "aces"}, Max: "points", Message: "扣球、拦网、发球得分之和不能多于总得分"},
		},
		dimensions: []types.RadarDimension{
			{
				Key: "attack", Label: "进攻",
				Description: "扣球得分 ÷ 扣球次数，20% → 60%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("attack_won")},
					Denominator: []types.RadarTerm{own("attack_total")}, Low: 0.2, High: 0.6,
				},
			},
			{
				Key: "block", Label: "拦网",
				Description: "每局拦网得分，0 → 4",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("block_won")},
					Denominator: perSet, Low: 0, High: 4,
				},
			},
			{
				Key: "serve", Label: "发球",
				Description: "每局（发球得分 − 0.5 × 发球失误），−2 → 3",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("aces"), term(types.RadarSideOwn, "serve_errors", -0.5)},
					Denominator: perSet, Low: -2, High: 3,
				},
			},
			{
				Key: "reception", Label: "一传",
				Description: "一传到位率，30% → 80%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("receive_good")},
					Denominator: []types.RadarTerm{own("receive_total")}, Low: 0.3, High: 0.8,
				},
			},
			{
				Key: "consistency", Label: "稳定性",
				Description: "（发球失误 + 其他失误）÷ 双方总得分，越低越好，30% → 5%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("serve_errors"), own("errors")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.05, High: 0.3, Invert: true,
				},
			},
			{
				Key: "dominance", Label: "压制力",
				Description: "总得分占双方合计的比例，35% → 65%",
				Formula: &types.RadarFormula{
					Numerator:   []types.RadarTerm{own("points")},
					Denominator: []types.RadarTerm{own("points"), opp("points")}, Low: 0.35, High: 0.65,
				},
			},
		},
	},
	types.RadarPresetCustom: {
		label:       "自定义",
		description: "不统计比赛数据，各维度由管理员按 0–5 手动评分",
		fields:      []types.RadarStatField{},
		dimensions: []types.RadarDimension{
			{Key: "m1", Label: "综合实力"},
			{Key: "m2", Label: "团队配合"},
			{Key: "m3", Label: "比赛经验"},
		},
	},
}

// radarPresetOrder 前端展示顺序
var radarPresetOrder = []types.RadarPreset{
	types.RadarPresetFootball, types.RadarPresetBasketball, types.RadarPresetTableTenn,
	types.RadarPresetBadminton, types.RadarPresetVolleyball, types.RadarPresetCustom,
}

// ListRadarPresets 返回全部预设（字段与默认维度）
func ListRadarPresets() []types.RadarPresetInfo {
	out := make([]types.RadarPresetInfo, 0, len(radarPresetOrder))
	for _, p := range radarPresetOrder {
		def := radarPresets[p]
		out = append(out, types.RadarPresetInfo{
			Preset:      p,
			Label:       def.label,
			Description: def.description,
			Fields:      def.fields,
			Dimensions:  def.dimensions,
		})
	}
	return out
}

// RadarDimensionInput 管理员提交的维度：Key 为预设维度时沿用其公式，否则为手动评分维度
type RadarDimensionInput struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// BuildRadarConfig 按预设与管理员选择的维度生成配置（公式只取自预设，不接受客户端提交）
func BuildRadarConfig(preset types.RadarPreset, inputs []RadarDimensionInput) (*types.RadarConfig, error) {
	def, ok := radarPresets[preset]
	if !ok {
		return nil, ErrRadarUnknownPreset
	}
	if len(inputs) < radarMinDimensions || len(inputs) > radarMaxDimensions {
		return nil, ErrRadarDimensionCount
	}
	formulas := make(map[string]types.RadarDimension, len(def.dimensions))
	for _, d := range def.dimensions {
		if d.Formula != nil {
			formulas[d.Key] = d
		}
	}

	config := &types.RadarConfig{
		Preset:      preset,
		Fields:      def.fields,
		Constraints: def.constraints,
		Dimensions:  make([]types.RadarDimension, 0, len(inputs)),
	}
	usedKeys := make(map[string]bool, len(inputs))
	usedLabels := make(map[string]bool, len(inputs))
	manualSeq := 1
	for _, in := range inputs {
		label := strings.TrimSpace(in.Label)
		if label == "" || len([]rune(label)) > radarMaxLabelLen {
			return nil, ErrRadarDimensionLabel
		}
		if usedLabels[label] {
			return nil, ErrRadarDimensionDup
		}
		usedLabels[label] = true

		dim := types.RadarDimension{Label: label}
		if preset, ok := formulas[in.Key]; ok && !usedKeys[in.Key] {
			dim.Key = preset.Key
			dim.Description = preset.Description
			dim.Formula = preset.Formula
		} else {
			// 手动评分维度：沿用合法的已有键，否则生成新键
			key := strings.TrimSpace(in.Key)
			if !isManualKey(key) || usedKeys[key] {
				for usedKeys["m"+strconv.Itoa(manualSeq)] {
					manualSeq++
				}
				key = "m" + strconv.Itoa(manualSeq)
			}
			dim.Key = key
			dim.Description = "管理员手动评分（0–5）"
		}
		usedKeys[dim.Key] = true
		config.Dimensions = append(config.Dimensions, dim)
	}
	return config, nil
}

// isManualKey 手动维度键形如 m1、m2…
func isManualKey(key string) bool {
	if len(key) < 2 || key[0] != 'm' {
		return false
	}
	n, err := strconv.Atoi(key[1:])
	return err == nil && n > 0 && n <= 99
}

// ==== 录入校验 ====

// radarStatsChanged 两份统计数据是否不同
func radarStatsChanged(a, b map[string]float64) bool {
	if len(a) != len(b) {
		return true
	}
	for k, v := range a {
		if bv, ok := b[k]; !ok || bv != v {
			return true
		}
	}
	return false
}

// radarStatsError 统计数据校验失败（提示文字面向管理员）
type radarStatsError struct{ msg string }

func (e *radarStatsError) Error() string { return e.msg }

// IsRadarStatsError 是否为统计数据校验错误
func IsRadarStatsError(err error) bool {
	var target *radarStatsError
	return errors.As(err, &target)
}

// validateRadarStats 校验一方的统计数据：字段齐全、为 0–9999 的整数，且满足预设约束
func validateRadarStats(config *types.RadarConfig, stats map[string]float64, sideName string) error {
	clean := make(map[string]float64, len(config.Fields))
	for _, f := range config.Fields {
		v, ok := stats[f.Key]
		if !ok {
			return &radarStatsError{fmt.Sprintf("%s缺少统计项「%s」", sideName, f.Label)}
		}
		if math.IsNaN(v) || v < 0 || v > radarMaxStatValue || v != math.Trunc(v) {
			return &radarStatsError{fmt.Sprintf("%s的「%s」需为 0 到 %d 的整数", sideName, f.Label, radarMaxStatValue)}
		}
		clean[f.Key] = v
	}
	for _, c := range config.Constraints {
		sum := 0.0
		for _, k := range c.Fields {
			sum += clean[k]
		}
		if sum > clean[c.Max] {
			return &radarStatsError{fmt.Sprintf("%s：%s", sideName, c.Message)}
		}
	}
	return nil
}

// pickRadarStats 只保留配置中的字段（丢弃客户端多传的键）
func pickRadarStats(config *types.RadarConfig, stats map[string]float64) map[string]float64 {
	out := make(map[string]float64, len(config.Fields))
	for _, f := range config.Fields {
		out[f.Key] = stats[f.Key]
	}
	return out
}

// ==== 计算 ====

// ComputeBracketRadar 按全部已统计的比赛计算各参赛方的雷达图；未启用时返回 nil
func ComputeBracketRadar(
	bracket *types.Bracket,
	participants []*types.BracketParticipant,
	matches []*types.BracketMatch,
) *types.BracketRadar {
	config := bracket.RadarConfig
	if config == nil || len(config.Dimensions) == 0 {
		return nil
	}

	// 每队累计：本方/对手各字段之和与场次
	type tally struct {
		own, opp map[string]float64
		n        int
	}
	tallies := make(map[int]*tally, len(participants))
	for _, p := range participants {
		tallies[p.ID] = &tally{own: map[string]float64{}, opp: map[string]float64{}}
	}
	add := func(t *tally, mine, theirs map[string]float64, myScore, theirScore float64) {
		for k, v := range mine {
			t.own[k] += v
		}
		for k, v := range theirs {
			t.opp[k] += v
		}
		t.own[types.RadarFieldScore] += myScore
		t.opp[types.RadarFieldScore] += theirScore
		t.own[types.RadarFieldMatch]++
		t.opp[types.RadarFieldMatch]++
		t.n++
	}
	for _, m := range matches {
		if m.Status != types.MatchStatusCompleted || m.P1ID == nil || m.P2ID == nil ||
			m.Stats1 == nil || m.Stats2 == nil {
			continue
		}
		s1, s2 := floatValue(m.Score1), floatValue(m.Score2)
		if t := tallies[*m.P1ID]; t != nil {
			add(t, m.Stats1, m.Stats2, s1, s2)
		}
		if t := tallies[*m.P2ID]; t != nil {
			add(t, m.Stats2, m.Stats1, s2, s1)
		}
	}

	radar := &types.BracketRadar{
		Config:  config,
		Teams:   make(map[int]map[string]types.RadarValue, len(participants)),
		Average: make(map[string]*float64, len(config.Dimensions)),
	}
	sums := make(map[string]float64, len(config.Dimensions))
	counts := make(map[string]int, len(config.Dimensions))
	for _, p := range participants {
		t := tallies[p.ID]
		values := make(map[string]types.RadarValue, len(config.Dimensions))
		for _, d := range config.Dimensions {
			v := radarValue(d, t.own, t.opp, t.n, p.RadarManual)
			values[d.Key] = v
			if v.Value != nil {
				sums[d.Key] += *v.Value
				counts[d.Key]++
			}
		}
		radar.Teams[p.ID] = values
	}
	for _, d := range config.Dimensions {
		if counts[d.Key] > 0 {
			avg := round2(sums[d.Key] / float64(counts[d.Key]))
			radar.Average[d.Key] = &avg
		} else {
			radar.Average[d.Key] = nil
		}
	}
	return radar
}

// radarValue 计算单个维度：手动值优先；公式维度按比值映射到 0–5 并按场次收缩
func radarValue(
	d types.RadarDimension,
	ownSum, oppSum map[string]float64,
	n int,
	manual map[string]float64,
) types.RadarValue {
	if v, ok := manual[d.Key]; ok {
		val := round2(clamp(v, 0, radarMaxScore))
		return types.RadarValue{Value: &val, Sample: n, Manual: true}
	}
	f := d.Formula
	if f == nil || n == 0 {
		return types.RadarValue{Sample: n}
	}
	sumTerms := func(terms []types.RadarTerm) float64 {
		total := 0.0
		for _, t := range terms {
			src := ownSum
			if t.Side == types.RadarSideOpp {
				src = oppSum
			}
			total += t.Weight * src[t.Field]
		}
		return total
	}
	den := sumTerms(f.Denominator)
	if den <= 0 {
		// 分母为 0（如从未射正）时该维度无法评估
		return types.RadarValue{Sample: n}
	}
	ratio := sumTerms(f.Numerator) / den

	scaled := 0.0
	if f.High > f.Low {
		scaled = clamp((ratio-f.Low)/(f.High-f.Low), 0, 1) * radarMaxScore
	}
	if f.Invert {
		scaled = radarMaxScore - scaled
	}
	nf := float64(n)
	val := round2((nf*scaled + radarShrinkK*radarNeutral) / (nf + radarShrinkK))
	return types.RadarValue{Value: &val, Sample: n}
}

func clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
