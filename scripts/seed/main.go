// seed 向本地数据库写入随机示例数据（班级、学生、比赛项目、报名与四种赛制的对阵表）
//
// 用法（在项目根目录执行，需先停止正在运行的服务）：
//
//	go run ./scripts/seed
//	go run ./scripts/seed -seed 42   # 固定随机种子，便于复现
//
// 仅用于开发演示，写入当前届次；重复执行会跳过已存在的班级与项目。
package main

import (
	"errors"
	"flag"
	"fmt"
	"math/rand/v2"
	"os"
	"time"

	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/database"
	"github.com/SHXZ-OSS/sports-meeting-system/logger"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
)

var (
	surnames = []rune(
		"王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤",
	)
	maleGiven = []string{
		"子轩",
		"浩然",
		"宇航",
		"俊杰",
		"博文",
		"天佑",
		"思远",
		"明哲",
		"一鸣",
		"家豪",
		"梓豪",
		"皓轩",
		"致远",
		"文博",
		"嘉懿",
		"煜城",
		"懿轩",
		"烨伟",
		"苑博",
		"鹏涛",
		"炎彬",
		"鹤轩",
		"越彬",
		"风华",
		"靖琪",
		"明辉",
		"伟诚",
		"明轩",
		"健柏",
		"修杰",
	}
	femaleGiven = []string{
		"欣怡",
		"梓涵",
		"诗涵",
		"可馨",
		"雨桐",
		"语嫣",
		"思琪",
		"佳怡",
		"若曦",
		"梦瑶",
		"紫萱",
		"雅静",
		"婉清",
		"晓彤",
		"嘉怡",
		"静怡",
		"雨萱",
		"梓萱",
		"思彤",
		"一诺",
		"芷若",
		"沐晴",
		"安然",
		"书瑶",
		"若汐",
		"清妍",
		"初夏",
		"语桐",
		"诗琪",
		"欣妍",
	}
)

// demoCompetition 示例比赛项目
type demoCompetition struct {
	name   string
	venue  string
	unit   string
	gender int
	mode   types.RankingMode
	ctype  types.CompetitionType
	maxPer int
}

var demoCompetitions = []demoCompetition{
	{"男子篮球", "室内篮球馆", "分", 1, types.RankingHigherFirst, types.TypeTeam, 8},
	{"女子排球", "排球场", "分", 2, types.RankingHigherFirst, types.TypeTeam, 8},
	{"男子乒乓球单打", "乒乓球室", "分", 1, types.RankingHigherFirst, types.TypeIndividual, 2},
	{"女子羽毛球单打", "羽毛球馆", "分", 2, types.RankingHigherFirst, types.TypeIndividual, 2},
	{"拔河", "田径场", "分", 3, types.RankingHigherFirst, types.TypeTeam, 20},
	{"男子 100 米", "田径场", "秒", 1, types.RankingLowerFirst, types.TypeIndividual, 2},
}

func main() {
	seedFlag := flag.Uint64("seed", uint64(time.Now().UnixNano()), "随机种子")
	classCount := flag.Int("classes", 12, "班级数量")
	perClass := flag.Int("students", 20, "每班学生数量")
	flag.Parse()

	if err := run(*seedFlag, *classCount, *perClass); err != nil {
		logger.L.Error("生成示例数据失败", "error", err)
		os.Exit(1)
	}
}

func run(seed uint64, classCount, perClass int) error {
	rng := rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
	logger.L.Info("开始生成示例数据", "seed", seed)

	if err := config.Load(); err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}
	if err := database.Initialize(); err != nil {
		return fmt.Errorf("初始化数据库失败: %w", err)
	}
	defer database.Close()

	eventID := config.Get().CurrentEventID
	db := database.GetDB()

	// ==== 班级与学生 ====
	var classes []*types.Class
	grades := []string{"高一", "高二"}
	for i := range classCount {
		name := fmt.Sprintf("%s(%d)班", grades[i*len(grades)/classCount], i%(classCount/len(grades))+1)
		id, created, err := models.GetOrCreateClassByName(name)
		if err != nil {
			return fmt.Errorf("创建班级 %s 失败: %w", name, err)
		}
		classes = append(classes, &types.Class{ID: id, Name: name})
		if !created {
			continue
		}
		for range perClass {
			gender := 1 + rng.IntN(2)
			given := maleGiven
			if gender == 2 {
				given = femaleGiven
			}
			fullName := string(surnames[rng.IntN(len(surnames))]) + given[rng.IntN(len(given))]
			if _, err := models.CreateStudent("", fullName, gender, id, ""); err != nil {
				return fmt.Errorf("创建学生失败: %w", err)
			}
		}
	}
	logger.L.Info("班级与学生已就绪", "classes", len(classes))

	// ==== 比赛项目（直接以已审核状态写入） ====
	base := time.Now().Truncate(time.Hour).Add(24 * time.Hour)
	competitionIDs := make(map[string]int)
	for i, dc := range demoCompetitions {
		var existing types.Competition
		err := db.Where("event_id = ? AND name = ?", eventID, dc.name).First(&existing).Error
		if err == nil {
			competitionIDs[dc.name] = existing.ID
			continue
		}
		start := base.Add(time.Duration(i) * 90 * time.Minute)
		end := start.Add(80 * time.Minute)
		c := &types.Competition{
			EventID:                 eventID,
			Name:                    dc.name,
			Description:             "示例数据：" + dc.name,
			Venue:                   dc.venue,
			Status:                  types.StatusApproved,
			RankingMode:             dc.mode,
			Unit:                    dc.unit,
			Gender:                  dc.gender,
			CompetitionType:         dc.ctype,
			MaxParticipantsPerClass: dc.maxPer,
			StartTime:               &start,
			EndTime:                 &end,
			AllowConcurrent:         true,
		}
		if err := db.Create(c).Error; err != nil {
			return fmt.Errorf("创建比赛项目 %s 失败: %w", dc.name, err)
		}
		competitionIDs[dc.name] = c.ID
		if err := registerDemo(rng, c, classes); err != nil {
			return err
		}
	}
	logger.L.Info("比赛项目与报名已就绪", "competitions", len(competitionIDs))

	// ==== 对阵表 ====
	type bracketPlan struct {
		bracket  types.Bracket
		compName string
		pick     int     // 取多少个参赛方
		progress float64 // 已录入结果的比例
	}
	plans := []bracketPlan{
		{
			bracket: types.Bracket{
				Name: "男子篮球 淘汰赛", Format: types.FormatSingleElimination,
				ParticipantType: types.ParticipantTypeClass, ThirdPlaceMatch: true,
				Description: "单场淘汰，季军赛于决赛前进行。",
			},
			compName: "男子篮球", pick: 11, progress: 0.7,
		},
		{
			bracket: types.Bracket{
				Name: "拔河 双败赛", Format: types.FormatDoubleElimination,
				ParticipantType: types.ParticipantTypeClass,
				Description:     "输两场才淘汰，胜者组冠军与败者组冠军争夺总冠军。",
			},
			compName: "拔河", pick: 8, progress: 0.5,
		},
		{
			bracket: types.Bracket{
				Name: "女子排球 循环赛", Format: types.FormatRoundRobin,
				ParticipantType: types.ParticipantTypeClass, GroupCount: 1,
				Description: "单循环，胜 3 分、平 1 分、负 0 分。",
			},
			compName: "女子排球", pick: 6, progress: 1,
		},
		{
			bracket: types.Bracket{
				Name: "男子乒乓球单打", Format: types.FormatGroupKnockout,
				ParticipantType: types.ParticipantTypeStudent, GroupCount: 4, AdvancePerGroup: 2,
				ThirdPlaceMatch: true,
				Description:     "4 个小组单循环，各组前 2 名进入淘汰赛。",
			},
			compName: "男子乒乓球单打", pick: 16, progress: 0.8,
		},
	}

	operatorID := 1
	if admin, err := models.GetUserByUsername("admin"); err == nil {
		operatorID = admin.ID
	}

	for _, plan := range plans {
		compID := competitionIDs[plan.compName]
		if _, err := models.GetBracketByCompetitionID(compID); err == nil {
			logger.L.Info("项目已有对阵表，跳过", "competition", plan.compName)
			continue
		}

		// 与后台「使用对阵图」一致：由比赛项目开启对阵图并自动创建对阵表
		competition, err := models.GetCompetitionByID(compID)
		if err != nil {
			return err
		}
		if err := services.SetCompetitionBracket(competition, true, plan.bracket.Format); err != nil {
			return fmt.Errorf("开启对阵图 %s 失败: %w", plan.compName, err)
		}
		bp, err := models.GetBracketByCompetitionID(compID)
		if err != nil {
			return err
		}
		b := *bp
		b.Name = plan.bracket.Name
		b.Description = plan.bracket.Description
		b.ThirdPlaceMatch = plan.bracket.ThirdPlaceMatch
		b.GroupCount = max(plan.bracket.GroupCount, 1)
		b.AdvancePerGroup = plan.bracket.AdvancePerGroup
		if err := models.UpdateBracket(&b); err != nil {
			return fmt.Errorf("更新对阵表 %s 失败: %w", b.Name, err)
		}

		refs, err := participantRefs(rng, &b, compID, classes, plan.pick)
		if err != nil {
			return err
		}
		if err := models.AddBracketParticipants(&b, refs); err != nil {
			return fmt.Errorf("添加参赛方失败: %w", err)
		}
		if b.GroupCount > 1 {
			if err := services.AutoGroupBracketParticipants(&b); err != nil {
				return err
			}
		}
		if err := services.GenerateBracket(&b); err != nil {
			return fmt.Errorf("生成对阵 %s 失败: %w", b.Name, err)
		}
		// 开始比赛后才能录入比分；全部打完会自动出名次并计入积分
		if err := models.UpdateCompetitionStatus(compID, types.StatusInProgress); err != nil {
			return err
		}
		played, err := playMatches(rng, &b, plan.progress, base, operatorID)
		if err != nil {
			return fmt.Errorf("录入 %s 结果失败: %w", b.Name, err)
		}
		logger.L.Info("对阵表已生成", "name", b.Name, "participants", len(refs), "played", played)
	}

	logger.L.Info("示例数据生成完成，启动服务后访问 /brackets 查看公开对阵图")
	return nil
}

// registerDemo 为比赛项目随机写入报名（团体赛按班级报名学生，个人赛每班 1~2 人）
func registerDemo(rng *rand.Rand, c *types.Competition, classes []*types.Class) error {
	db := database.GetDB()
	for _, cls := range classes {
		// 部分班级不报名，让数据更真实
		if rng.Float64() < 0.15 {
			continue
		}
		var students []types.Student
		query := db.Where("class_id = ?", cls.ID)
		if c.Gender == 1 || c.Gender == 2 {
			query = query.Where("gender = ?", c.Gender)
		}
		if err := query.Find(&students).Error; err != nil {
			return err
		}
		rng.Shuffle(len(students), func(i, j int) { students[i], students[j] = students[j], students[i] })

		n := min(len(students), c.MaxParticipantsPerClass)
		if c.CompetitionType == types.TypeIndividual {
			n = min(len(students), 1+rng.IntN(2))
		}
		for _, s := range students[:n] {
			classID := cls.ID
			reg := &types.Registration{StudentID: &s.ID, ClassID: &classID, CompetitionID: c.ID}
			if err := db.Create(reg).Error; err != nil {
				return fmt.Errorf("写入报名失败: %w", err)
			}
		}
	}
	return nil
}

// participantRefs 从报名中挑选参赛方（班级 ID 或学生 ID），不足时用全部班级/学生补齐
func participantRefs(
	rng *rand.Rand,
	b *types.Bracket,
	competitionID int,
	classes []*types.Class,
	want int,
) ([]int, error) {
	registrations, err := models.GetCompetitionRegistrations(competitionID, 0)
	if err != nil {
		return nil, err
	}
	seen := make(map[int]bool)
	var refs []int
	for _, r := range registrations {
		ref := r.ClassID
		if b.ParticipantType == types.ParticipantTypeStudent {
			ref = r.StudentID
		}
		if ref != nil && !seen[*ref] {
			seen[*ref] = true
			refs = append(refs, *ref)
		}
	}
	if b.ParticipantType == types.ParticipantTypeClass && len(refs) < want {
		for _, c := range classes {
			if !seen[c.ID] {
				seen[c.ID] = true
				refs = append(refs, c.ID)
			}
		}
	}
	rng.Shuffle(len(refs), func(i, j int) { refs[i], refs[j] = refs[j], refs[i] })
	if len(refs) > want {
		refs = refs[:want]
	}
	if len(refs) < 2 {
		return nil, errors.New("可用参赛方不足 2 个")
	}
	return refs, nil
}

// playMatches 按拓扑序给约 progress 比例的比赛录入随机结果，种子越靠前胜率越高
func playMatches(rng *rand.Rand, b *types.Bracket, progress float64, base time.Time, operatorID int) (int, error) {
	detail, err := services.GetBracketDetail(b.ID)
	if err != nil {
		return 0, err
	}
	total := 0
	for _, m := range detail.Matches {
		if m.Status != types.MatchStatusBye && m.Status != types.MatchStatusVoid {
			total++
		}
	}
	target := int(float64(total) * progress)

	played := 0
	for played < target {
		detail, err = services.GetBracketDetail(b.ID)
		if err != nil {
			return played, err
		}
		seeds := make(map[int]int, len(detail.Participants))
		for _, p := range detail.Participants {
			seeds[p.ID] = p.Seed
		}
		var next *types.BracketMatch
		for _, m := range detail.Matches {
			if m.Status == types.MatchStatusScheduled {
				next = m
				break
			}
		}
		if next == nil {
			break
		}

		s1, s2 := randomScore(rng, b, next, seeds)
		when := base.Add(time.Duration(next.Seq) * 20 * time.Minute)
		result := &services.BracketMatchResult{
			Score1:      &s1,
			Score2:      &s2,
			ScheduledAt: &when,
			Venue:       next.Venue,
		}
		if _, err := services.UpdateBracketMatch(b, next.ID, result, operatorID); err != nil {
			return played, err
		}
		played++
	}
	return played, nil
}

// randomScore 生成比分：高种子更可能获胜；淘汰赛不出平局
func randomScore(rng *rand.Rand, b *types.Bracket, m *types.BracketMatch, seeds map[int]int) (float64, float64) {
	seed1, seed2 := seeds[*m.P1ID], seeds[*m.P2ID]
	// 种子差越大，高种子胜率越高（0.5 ~ 0.85）
	p1Win := 0.5 + 0.35*float64(seed2-seed1)/float64(max(len(seeds), 2))
	group := m.Stage == types.StageGroup

	if group && rng.Float64() < 0.12 {
		s := float64(rng.IntN(3))
		return s, s
	}
	winScore, loseScore := winnerScores(rng, b)
	if rng.Float64() < p1Win {
		return winScore, loseScore
	}
	return loseScore, winScore
}

// winnerScores 按参赛方类型给出贴近项目的比分形态
func winnerScores(rng *rand.Rand, b *types.Bracket) (float64, float64) {
	switch {
	case b.Format == types.FormatDoubleElimination:
		// 拔河：三局两胜
		return 2, float64(rng.IntN(2))
	case b.ParticipantType == types.ParticipantTypeStudent:
		// 乒乓球：五局三胜
		return 3, float64(rng.IntN(3))
	case b.Format == types.FormatRoundRobin:
		// 排球：三局两胜
		return 2, float64(rng.IntN(2))
	default:
		// 篮球
		win := 40 + rng.IntN(30)
		return float64(win), float64(win - 1 - rng.IntN(18))
	}
}
