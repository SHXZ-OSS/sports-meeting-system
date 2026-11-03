package types

// RadarPreset 雷达图预设（决定每场比赛需要统计哪些数据、各维度如何计算）
type RadarPreset string

const (
	RadarPresetFootball   RadarPreset = "football"   // 足球
	RadarPresetBasketball RadarPreset = "basketball" // 篮球
	RadarPresetTableTenn  RadarPreset = "table_tennis"
	RadarPresetBadminton  RadarPreset = "badminton" // 羽毛球
	RadarPresetVolleyball RadarPreset = "volleyball"
	RadarPresetCustom     RadarPreset = "custom" // 自定义：维度全部由管理员手动评分
)

// RadarSide 公式项取值的一方
type RadarSide string

const (
	RadarSideOwn RadarSide = "own" // 本方
	RadarSideOpp RadarSide = "opp" // 对手
)

// 公式项可引用的内置字段（无需在比赛中单独统计）
const (
	RadarFieldScore = "score" // 本场比分（足球进球、篮球得分、局制项目的局数）
	RadarFieldMatch = "match" // 场次，每场计 1
)

// RadarStatField 每场比赛需要为双方各统计的一项数据
type RadarStatField struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Hint  string `json:"hint,omitempty"`
}

// RadarSumConstraint 录入校验：若干项之和不超过另一项（如 射正 ≤ 射门）
type RadarSumConstraint struct {
	Fields  []string `json:"fields"`
	Max     string   `json:"max"`
	Message string   `json:"message"`
}

// RadarTerm 公式中的一项：weight × 一方的某项数据
type RadarTerm struct {
	Side   RadarSide `json:"side"`
	Field  string    `json:"field"`
	Weight float64   `json:"weight"`
}

// RadarFormula 维度公式
//
// 原始值 = Σ(分子各项) / Σ(分母各项)，各项先在该队全部已统计的比赛中求和；
// 再按 [Low, High] 线性映射到 0–5（Invert 时越低越好），
// 最后按场次做收缩：分数 = (n × 映射值 + K × 2.5) / (n + K)，K = 0.5，
// 场次越少越向中间值 2.5 靠拢，避免一两场比赛造成极端值。
type RadarFormula struct {
	Numerator   []RadarTerm `json:"numerator"`
	Denominator []RadarTerm `json:"denominator"`
	Low         float64     `json:"low"`
	High        float64     `json:"high"`
	Invert      bool        `json:"invert,omitempty"`
}

// RadarDimension 雷达图的一个维度
type RadarDimension struct {
	Key         string        `json:"key"`
	Label       string        `json:"label"`
	Description string        `json:"description,omitempty"`
	Formula     *RadarFormula `json:"formula,omitempty"` // 为空时为手动评分维度
}

// RadarConfig 对阵表的雷达图配置
type RadarConfig struct {
	Preset      RadarPreset          `json:"preset"`
	Fields      []RadarStatField     `json:"fields"`
	Constraints []RadarSumConstraint `json:"constraints,omitempty"`
	Dimensions  []RadarDimension     `json:"dimensions"`
}

// RadarPresetInfo 供前端选择的预设信息
type RadarPresetInfo struct {
	Preset      RadarPreset      `json:"preset"`
	Label       string           `json:"label"`
	Description string           `json:"description"`
	Fields      []RadarStatField `json:"fields"`
	Dimensions  []RadarDimension `json:"dimensions"`
}

// RadarValue 某参赛方在某维度上的数值
type RadarValue struct {
	Value  *float64 `json:"value"`  // 0–5；为空表示暂无数据
	Sample int      `json:"sample"` // 参与计算的场次
	Manual bool     `json:"manual"` // 是否为管理员手动设置
}

// BracketRadar 对阵表的雷达图结果（每次读取时按最新比赛数据计算）
type BracketRadar struct {
	Config  *RadarConfig                  `json:"config"`
	Teams   map[int]map[string]RadarValue `json:"teams"`   // 参赛方 ID → 维度 → 数值
	Average map[string]*float64           `json:"average"` // 各维度在有数据的参赛方中的平均值
}
