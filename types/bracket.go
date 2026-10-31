package types

import "time"

// BracketFormat 对阵赛制
type BracketFormat string

// BracketParticipantType 参赛方类型
type BracketParticipantType string

// BracketStage 比赛所属阶段
type BracketStage string

// BracketMatchStatus 比赛状态（由对阵引擎推导）
type BracketMatchStatus string

// BracketSlotSource 签位来源
type BracketSlotSource string

const (
	FormatSingleElimination BracketFormat = "single_elimination" // 单败淘汰
	FormatDoubleElimination BracketFormat = "double_elimination" // 双败淘汰
	FormatRoundRobin        BracketFormat = "round_robin"        // 小组循环赛
	FormatGroupKnockout     BracketFormat = "group_knockout"     // 小组赛 + 淘汰赛
)

const (
	ParticipantTypeClass   BracketParticipantType = "class"   // 以班级为参赛方
	ParticipantTypeStudent BracketParticipantType = "student" // 以学生为参赛方
)

const (
	StageGroup      BracketStage = "group"       // 小组循环
	StageMain       BracketStage = "main"        // 淘汰赛主赛程（双败中为胜者组）
	StageLosers     BracketStage = "losers"      // 双败败者组
	StageGrandFinal BracketStage = "grand_final" // 双败总决赛
	StageThirdPlace BracketStage = "third_place" // 季军赛
)

const (
	MatchStatusPending   BracketMatchStatus = "pending"   // 参赛方未齐
	MatchStatusScheduled BracketMatchStatus = "scheduled" // 双方已确定，待比赛
	MatchStatusCompleted BracketMatchStatus = "completed" // 已出结果
	MatchStatusBye       BracketMatchStatus = "bye"       // 轮空，一方直接晋级
	MatchStatusVoid      BracketMatchStatus = "void"      // 双方均不存在，不进行
)

const (
	SlotSourceNone        BracketSlotSource = "none"        // 空签位（轮空）
	SlotSourceParticipant BracketSlotSource = "participant" // 直接指定参赛方，ref 为参赛方 ID
	SlotSourceWinner      BracketSlotSource = "winner"      // 某场比赛的胜者，ref 为来源比赛的 Seq
	SlotSourceLoser       BracketSlotSource = "loser"       // 某场比赛的败者，ref 为来源比赛的 Seq
	SlotSourceGroupRank   BracketSlotSource = "group_rank"  // 小组排名，ref = 小组序号*1000 + 名次（名次从 1 开始）
)

// GroupRankRefBase 小组排名签位编码基数
const GroupRankRefBase = 1000

// Bracket 对阵表
type Bracket struct {
	ID              int                    `json:"id"                         gorm:"primaryKey;autoIncrement"`
	EventID         int                    `json:"event_id"                   gorm:"not null;index"`
	CompetitionID   *int                   `json:"competition_id,omitempty"   gorm:"index"` // 关联的比赛项目（可选）
	Name            string                 `json:"name"                       gorm:"not null"`
	Description     string                 `json:"description"                gorm:"default:''"`
	Format          BracketFormat          `json:"format"                     gorm:"not null"`
	ParticipantType BracketParticipantType `json:"participant_type"           gorm:"not null"`
	GroupCount      int                    `json:"group_count"                gorm:"not null;default:1"` // 小组数量（循环赛/小组赛）
	AdvancePerGroup int                    `json:"advance_per_group"          gorm:"not null;default:2"` // 每组出线数量（小组赛 + 淘汰赛）
	ThirdPlaceMatch bool                   `json:"third_place_match"          gorm:"default:false"`      // 是否进行季军赛
	PointsWin       int                    `json:"points_win"                 gorm:"not null;default:3"` // 循环赛胜场积分
	PointsDraw      int                    `json:"points_draw"                gorm:"not null;default:1"` // 循环赛平局积分
	PointsLoss      int                    `json:"points_loss"                gorm:"not null;default:0"` // 循环赛负场积分
	Published       bool                   `json:"published"                  gorm:"default:false"`      // 是否在公开看板展示
	RadarConfig     *RadarConfig           `json:"radar_config"               gorm:"serializer:json"`    // 雷达图配置，为空表示未启用
	CompetitionName string                 `json:"competition_name,omitempty" gorm:"-"`
	// 所属比赛项目是否启用对阵图；关联项目关闭对阵图后，对阵表在公开端隐藏、不再参与成绩
	CompetitionBracketEnabled bool              `json:"competition_bracket_enabled"  gorm:"-"`
	CompetitionStatus         CompetitionStatus `json:"competition_status,omitempty" gorm:"-"`
	ParticipantNum            int               `json:"participant_count"            gorm:"-"`
	MatchNum                  int               `json:"match_count"                  gorm:"-"`
	CreatedAt                 time.Time         `json:"created_at"`
	UpdatedAt                 time.Time         `json:"updated_at"`

	// 关联关系，不响应到前端
	Event        *Event               `json:"-" gorm:"foreignKey:EventID"`
	Competition  *Competition         `json:"-" gorm:"foreignKey:CompetitionID;constraint:OnDelete:SET NULL"`
	Participants []BracketParticipant `json:"-" gorm:"foreignKey:BracketID;constraint:OnDelete:CASCADE"`
	Matches      []BracketMatch       `json:"-" gorm:"foreignKey:BracketID;constraint:OnDelete:CASCADE"`
}

// BracketParticipant 对阵表参赛方（绑定班级或学生）
type BracketParticipant struct {
	ID         int    `json:"id"                   gorm:"primaryKey;autoIncrement"`
	BracketID  int    `json:"bracket_id"           gorm:"not null;index"`
	ClassID    *int   `json:"class_id,omitempty"   gorm:"index"`
	StudentID  *int   `json:"student_id,omitempty" gorm:"index"`
	Seed       int    `json:"seed"                 gorm:"not null;default:0"` // 种子序号，从 1 开始，越小越强
	GroupIndex int    `json:"group_index"          gorm:"not null;default:0"` // 所在小组，从 0 开始
	Name       string `json:"name"                 gorm:"-"`                  // 展示名称，通过关联填充
	ClassName  string `json:"class_name,omitempty" gorm:"-"`
	// 管理员手动设置的雷达图数值（维度 → 0–5），对公式维度为覆盖值
	RadarManual map[string]float64 `json:"radar_manual,omitempty" gorm:"serializer:json"`

	// 关联关系，不响应到前端
	Class   *Class   `json:"-" gorm:"foreignKey:ClassID"`
	Student *Student `json:"-" gorm:"foreignKey:StudentID"`
}

// BracketMatch 对阵表中的一场比赛
// 签位来源（SlotXSource/SlotXRef）在生成时确定；参赛方与状态由对阵引擎按顺序推导
type BracketMatch struct {
	ID          int                `json:"id"                     gorm:"primaryKey;autoIncrement"`
	BracketID   int                `json:"bracket_id"             gorm:"not null;index"`
	Stage       BracketStage       `json:"stage"                  gorm:"not null"`
	GroupIndex  int                `json:"group_index"            gorm:"not null;default:0"`
	Round       int                `json:"round"                  gorm:"not null"` // 阶段内轮次，从 1 开始
	Position    int                `json:"position"               gorm:"not null"` // 轮次内位置，从 0 开始
	Seq         int                `json:"seq"                    gorm:"not null"` // 对阵表内唯一的拓扑序，来源比赛的 Seq 总是更小
	Slot1Source BracketSlotSource  `json:"slot1_source"           gorm:"not null"`
	Slot1Ref    int                `json:"slot1_ref"              gorm:"not null;default:0"`
	Slot2Source BracketSlotSource  `json:"slot2_source"           gorm:"not null"`
	Slot2Ref    int                `json:"slot2_ref"              gorm:"not null;default:0"`
	P1ID        *int               `json:"participant1_id"        gorm:"column:participant1_id"`
	P2ID        *int               `json:"participant2_id"        gorm:"column:participant2_id"`
	Score1      *float64           `json:"score1"`
	Score2      *float64           `json:"score2"`
	WinnerID    *int               `json:"winner_id"` // 胜者参赛方 ID；平局时为空
	IsDraw      bool               `json:"is_draw"                gorm:"default:false"`
	Completed   bool               `json:"completed"              gorm:"default:false"` // 是否已录入结果
	Status      BracketMatchStatus `json:"status"                 gorm:"not null;default:'pending'"`
	ScheduledAt *time.Time         `json:"scheduled_at,omitempty"`
	Venue       string             `json:"venue"                  gorm:"default:''"`
	Note        string             `json:"note"                   gorm:"default:''"`
	// 双方本场统计数据（雷达图字段 → 数值），随结果一起录入和清空
	Stats1    map[string]float64 `json:"stats1,omitempty" gorm:"serializer:json"`
	Stats2    map[string]float64 `json:"stats2,omitempty" gorm:"serializer:json"`
	UpdatedAt time.Time          `json:"updated_at"`
}

// BracketStandingRow 小组积分榜中的一行
type BracketStandingRow struct {
	ParticipantID int     `json:"participant_id"`
	Rank          int     `json:"rank"`
	Played        int     `json:"played"`
	Won           int     `json:"won"`
	Drawn         int     `json:"drawn"`
	Lost          int     `json:"lost"`
	Points        int     `json:"points"`
	ScoreFor      float64 `json:"score_for"`
	ScoreAgainst  float64 `json:"score_against"`
	ScoreDiff     float64 `json:"score_diff"`
}

// BracketGroupStanding 单个小组的积分榜
type BracketGroupStanding struct {
	GroupIndex int                  `json:"group_index"`
	Rows       []BracketStandingRow `json:"rows"`
}

// BracketDetail 对阵表完整数据
type BracketDetail struct {
	Bracket      *Bracket               `json:"bracket"`
	Participants []*BracketParticipant  `json:"participants"`
	Matches      []*BracketMatch        `json:"matches"`
	Standings    []BracketGroupStanding `json:"standings"`
	Radar        *BracketRadar          `json:"radar,omitempty"`
}
