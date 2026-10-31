package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/SHXZ-OSS/sports-meeting-system/api/middlewares"
	"github.com/SHXZ-OSS/sports-meeting-system/config"
	"github.com/SHXZ-OSS/sports-meeting-system/models"
	"github.com/SHXZ-OSS/sports-meeting-system/services"
	"github.com/SHXZ-OSS/sports-meeting-system/types"
	"github.com/SHXZ-OSS/sports-meeting-system/utils"
)

// 对阵表输入限制
const (
	maxBracketNameLen        = 100
	maxBracketDescriptionLen = 2000
	maxBracketGroupCount     = 32
	maxBracketPoints         = 100
	maxMatchTextLen          = 200
)

// BracketRequest 创建/更新对阵表请求
type BracketRequest struct {
	Name            string                       `json:"name"`
	Description     string                       `json:"description"`
	CompetitionID   *int                         `json:"competition_id"`
	Format          types.BracketFormat          `json:"format"`
	ParticipantType types.BracketParticipantType `json:"participant_type"`
	GroupCount      int                          `json:"group_count"`
	AdvancePerGroup int                          `json:"advance_per_group"`
	ThirdPlaceMatch bool                         `json:"third_place_match"`
	PointsWin       *int                         `json:"points_win"`
	PointsDraw      *int                         `json:"points_draw"`
	PointsLoss      *int                         `json:"points_loss"`
	Published       bool                         `json:"published"`
}

// AddBracketParticipantsRequest 添加参赛方请求（班级 ID 或学生 ID，取决于对阵表的参赛方类型）
type AddBracketParticipantsRequest struct {
	IDs []int `json:"ids" binding:"required"`
}

// ReorderBracketParticipantsRequest 重排种子请求，order 为参赛方 ID 按种子顺序排列
type ReorderBracketParticipantsRequest struct {
	Order  []int       `json:"order"  binding:"required"`
	Groups map[int]int `json:"groups"` // 参赛方 ID → 小组序号（可选）
}

// UpdateBracketMatchRequest 录入比赛结果请求
type UpdateBracketMatchRequest struct {
	Score1      *float64 `json:"score1"`
	Score2      *float64 `json:"score2"`
	WinnerID    *int     `json:"winner_id"`
	IsDraw      bool     `json:"is_draw"`
	Clear       bool     `json:"clear"`
	ScheduledAt *string  `json:"scheduled_at"` // RFC3339，空串表示清除
	Venue       string   `json:"venue"`
	Note        string   `json:"note"`
}

// ==== 管理端 ====

// GetBrackets 分页获取当前届次的对阵表
func GetBrackets(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	page = max(page, 0)
	pageSize = max(pageSize, 0)

	brackets, total, err := models.ListBrackets(config.Get().CurrentEventID, page, pageSize, keyword, false)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取对阵表失败："+err.Error())
		return
	}
	if page > 0 && pageSize > 0 {
		utils.ResponsePaginated(c, brackets, total, page, pageSize)
		return
	}
	utils.ResponseOK(c, brackets)
}

// GetBracket 获取对阵表完整数据
func GetBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	detail, err := services.GetBracketDetail(bracket.ID)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseOK(c, detail)
}

// CreateBracket 创建对阵表
func CreateBracket(c *gin.Context) {
	var req BracketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}
	if !isValidBracketFormat(req.Format) {
		utils.ResponseError(c, http.StatusBadRequest, "无效的赛制")
		return
	}
	if req.ParticipantType != types.ParticipantTypeClass && req.ParticipantType != types.ParticipantTypeStudent {
		utils.ResponseError(c, http.StatusBadRequest, "无效的参赛方类型")
		return
	}

	bracket := &types.Bracket{
		EventID:         config.Get().CurrentEventID,
		Format:          req.Format,
		ParticipantType: req.ParticipantType,
		PointsWin:       3,
		PointsDraw:      1,
		PointsLoss:      0,
	}
	if msg := applyBracketRequest(bracket, &req); msg != "" {
		utils.ResponseError(c, http.StatusBadRequest, msg)
		return
	}
	if !validateCompetitionLink(c, bracket) {
		return
	}
	if err := models.CreateBracket(bracket); err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "创建对阵表失败："+err.Error())
		return
	}
	utils.ResponseOK(c, bracket)
}

// UpdateBracket 更新对阵表（赛制与参赛方类型创建后不可修改）
func UpdateBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	var req BracketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	update := *bracket
	if msg := applyBracketRequest(&update, &req); msg != "" {
		utils.ResponseError(c, http.StatusBadRequest, msg)
		return
	}
	if !sameIntPtr(bracket.CompetitionID, update.CompetitionID) && !validateCompetitionLink(c, &update) {
		return
	}
	if err := services.UpdateBracketInfo(bracket, &update); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "更新成功")
}

// DeleteBracket 删除对阵表
func DeleteBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	if bracket.CompetitionID != nil && bracket.CompetitionBracketEnabled {
		respondBracketError(c, services.ErrBracketLinkedEnabled)
		return
	}
	if err := models.DeleteBracket(bracket.ID); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "删除成功")
}

// AddBracketParticipants 批量添加参赛方
func AddBracketParticipants(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	var req AddBracketParticipantsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		utils.ResponseError(c, http.StatusBadRequest, "请选择要添加的参赛方")
		return
	}
	if err := ensureParticipantsMutable(bracket); err != nil {
		respondBracketError(c, err)
		return
	}
	if err := models.AddBracketParticipants(bracket, uniqueIDs(req.IDs)); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "添加成功")
}

// ImportBracketParticipantsFromCompetition 从关联比赛项目的报名中导入参赛方
// 以班级为参赛方时导入报名所属班级（去重），以学生为参赛方时导入报名学生
func ImportBracketParticipantsFromCompetition(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	if bracket.CompetitionID == nil {
		utils.ResponseError(c, http.StatusBadRequest, "对阵表未关联比赛项目")
		return
	}
	if err := ensureParticipantsMutable(bracket); err != nil {
		respondBracketError(c, err)
		return
	}

	competition, err := models.GetCompetitionByID(*bracket.CompetitionID)
	if err != nil {
		utils.ResponseError(c, http.StatusNotFound, "关联的比赛项目不存在")
		return
	}
	candidates, err := importCandidates(bracket, competition)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取报名记录失败："+err.Error())
		return
	}
	participants, err := models.GetBracketParticipants(bracket.ID)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取参赛方失败："+err.Error())
		return
	}
	existing := make(map[int]bool, len(participants))
	for _, p := range participants {
		if p.ClassID != nil {
			existing[*p.ClassID] = true
		}
		if p.StudentID != nil {
			existing[*p.StudentID] = true
		}
	}

	var ids []int
	for _, ref := range candidates {
		if !existing[ref] {
			existing[ref] = true
			ids = append(ids, ref)
		}
	}
	if len(ids) == 0 {
		utils.ResponseError(c, http.StatusBadRequest, "没有可导入的新参赛方")
		return
	}
	if err := models.AddBracketParticipants(bracket, ids); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "已导入 "+strconv.Itoa(len(ids))+" 个参赛方")
}

// RemoveBracketParticipant 移除参赛方
func RemoveBracketParticipant(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	participantID, err := strconv.Atoi(c.Param("participant_id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的参赛方ID")
		return
	}
	if err := ensureParticipantsMutable(bracket); err != nil {
		respondBracketError(c, err)
		return
	}
	if err := models.RemoveBracketParticipant(bracket.ID, participantID); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "移除成功")
}

// ReorderBracketParticipants 调整种子顺序与分组
func ReorderBracketParticipants(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	var req ReorderBracketParticipantsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}
	for _, g := range req.Groups {
		if g < 0 || g >= bracket.GroupCount {
			utils.ResponseError(c, http.StatusBadRequest, "小组序号超出范围")
			return
		}
	}
	if err := services.ReorderBracketParticipants(bracket, req.Order, req.Groups); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "保存成功")
}

// AutoGroupBracketParticipants 按种子蛇形自动分组
func AutoGroupBracketParticipants(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	if err := services.AutoGroupBracketParticipants(bracket); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "已按种子自动分组")
}

// GenerateBracket 生成（或重新生成）对阵
func GenerateBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	if err := services.GenerateBracket(bracket); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "对阵已生成")
}

// ResetBracket 清空对阵与全部结果
func ResetBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	if err := services.ResetBracket(bracket); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "对阵已重置")
}

// UpdateBracketMatch 录入比赛结果、时间、地点
func UpdateBracketMatch(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	updateBracketMatch(c, bracket)
}

// updateBracketMatch 解析请求并录入比分；所属项目全部完赛时提示已自动出成绩
func updateBracketMatch(c *gin.Context, bracket *types.Bracket) {
	operatorID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	matchID, err := strconv.Atoi(c.Param("match_id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return
	}
	var req UpdateBracketMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效请求")
		return
	}

	req.Venue = strings.TrimSpace(req.Venue)
	req.Note = strings.TrimSpace(req.Note)
	if len([]rune(req.Venue)) > maxMatchTextLen || len([]rune(req.Note)) > maxMatchTextLen {
		utils.ResponseError(c, http.StatusBadRequest, "地点或备注过长")
		return
	}
	if (req.Score1 != nil && *req.Score1 < 0) || (req.Score2 != nil && *req.Score2 < 0) {
		utils.ResponseError(c, http.StatusBadRequest, "比分不能为负数")
		return
	}

	result := &services.BracketMatchResult{
		Score1:   req.Score1,
		Score2:   req.Score2,
		WinnerID: req.WinnerID,
		IsDraw:   req.IsDraw,
		Clear:    req.Clear,
		Venue:    req.Venue,
		Note:     req.Note,
	}
	if req.ScheduledAt != nil && *req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err != nil {
			utils.ResponseError(c, http.StatusBadRequest, "无效的比赛时间")
			return
		}
		result.ScheduledAt = &t
	}

	completed, err := services.UpdateBracketMatch(bracket, matchID, result, operatorID)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	if completed {
		utils.ResponseSuccessWithCustomMessage(c, "对阵已全部完赛，名次已生成并计入积分")
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "保存成功")
}

// ==== 成绩与赛事进程端（按比赛项目访问其对阵图，需成绩与赛事进程权限） ====

// GetCompetitionBracket 获取比赛项目的对阵图；项目未启用对阵图或尚未创建时 data 为空
func GetCompetitionBracket(c *gin.Context) {
	competition, ok := loadProgressCompetition(c)
	if !ok {
		return
	}
	if !competition.BracketEnabled {
		utils.ResponseOK(c, nil)
		return
	}
	bracket, err := models.GetBracketByCompetitionID(competition.ID)
	if errors.Is(err, models.ErrBracketNotFound) {
		utils.ResponseOK(c, nil)
		return
	}
	if err != nil {
		respondBracketError(c, err)
		return
	}
	detail, err := services.GetBracketDetail(bracket.ID)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseOK(c, detail)
}

// UpdateCompetitionBracketMatch 在成绩与赛事进程中录入对阵比分
func UpdateCompetitionBracketMatch(c *gin.Context) {
	competition, ok := loadProgressCompetition(c)
	if !ok {
		return
	}
	if !competition.BracketEnabled {
		utils.ResponseError(c, http.StatusBadRequest, "该项目未使用对阵图")
		return
	}
	bracket, err := models.GetBracketByCompetitionID(competition.ID)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	updateBracketMatch(c, bracket)
}

// CompleteCompetitionFromBracket 按当前对阵结果生成名次并完赛（退回后未改动比分时使用）
func CompleteCompetitionFromBracket(c *gin.Context) {
	competition, ok := loadProgressCompetition(c)
	if !ok {
		return
	}
	operatorID, ok := middlewares.GetUserIDFromContext(c)
	if !ok {
		utils.ResponseError(c, http.StatusUnauthorized, "未授权")
		return
	}
	if err := services.CompleteCompetitionFromBracket(competition, operatorID); err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseSuccessWithCustomMessage(c, "名次已生成并计入积分")
}

// ==== 公开端 ====

// GetPublicBrackets 获取当前届次已公开的对阵表
func GetPublicBrackets(c *gin.Context) {
	brackets, _, err := models.ListBrackets(config.Get().CurrentEventID, 0, 0, "", true)
	if err != nil {
		utils.ResponseError(c, http.StatusInternalServerError, "获取对阵表失败")
		return
	}
	utils.ResponseOK(c, brackets)
}

// GetPublicBracket 获取已公开对阵表的完整数据
func GetPublicBracket(c *gin.Context) {
	bracket, ok := loadBracket(c)
	if !ok {
		return
	}
	hidden := bracket.CompetitionID != nil && (!bracket.CompetitionBracketEnabled ||
		bracket.CompetitionStatus == types.StatusPendingApproval ||
		bracket.CompetitionStatus == types.StatusRejected)
	if !bracket.Published || hidden {
		utils.ResponseError(c, http.StatusNotFound, models.ErrBracketNotFound.Error())
		return
	}
	detail, err := services.GetBracketDetail(bracket.ID)
	if err != nil {
		respondBracketError(c, err)
		return
	}
	utils.ResponseOK(c, detail)
}

// ==== 辅助函数 ====

// loadProgressCompetition 解析路径中的比赛项目 ID，并限定在当前届次内
func loadProgressCompetition(c *gin.Context) (*types.Competition, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的比赛ID")
		return nil, false
	}
	competition, err := models.GetCompetitionByID(id)
	if err != nil || competition.EventID != config.Get().CurrentEventID {
		utils.ResponseError(c, http.StatusNotFound, "比赛项目不存在")
		return nil, false
	}
	return competition, true
}

// validateCompetitionLink 关联比赛项目时校验参赛方类型与唯一性，失败时已写入响应
func validateCompetitionLink(c *gin.Context, bracket *types.Bracket) bool {
	if bracket.CompetitionID == nil {
		return true
	}
	competition, err := models.GetCompetitionByID(*bracket.CompetitionID)
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "关联的比赛项目不存在")
		return false
	}
	if err := services.ValidateBracketLink(bracket, competition); err != nil {
		respondBracketError(c, err)
		return false
	}
	return true
}

// ensureParticipantsMutable 参赛方变动前校验：对阵未生成，且所属项目尚未出成绩
func ensureParticipantsMutable(bracket *types.Bracket) error {
	if err := services.EnsureBracketEditable(bracket.ID); err != nil {
		return err
	}
	return services.EnsureBracketStructureMutable(bracket)
}

// importCandidates 可导入的参赛方 ID：全校性比赛为全部班级，其余为报名的班级或学生
func importCandidates(bracket *types.Bracket, competition *types.Competition) ([]int, error) {
	if competition.CompetitionType == types.TypeSchool && bracket.ParticipantType == types.ParticipantTypeClass {
		classes, _, err := models.GetAllClasses(0, 0, "")
		if err != nil {
			return nil, err
		}
		ids := make([]int, len(classes))
		for i, cl := range classes {
			ids[i] = cl.ID
		}
		return ids, nil
	}
	registrations, err := models.GetCompetitionRegistrations(competition.ID, 0)
	if err != nil {
		return nil, err
	}
	ids := make([]int, 0, len(registrations))
	for _, reg := range registrations {
		ref := reg.ClassID
		if bracket.ParticipantType == types.ParticipantTypeStudent {
			ref = reg.StudentID
		}
		if ref != nil {
			ids = append(ids, *ref)
		}
	}
	return ids, nil
}

func sameIntPtr(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// loadBracket 解析路径中的对阵表 ID，并限定在当前届次内
func loadBracket(c *gin.Context) (*types.Bracket, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ResponseError(c, http.StatusBadRequest, "无效的对阵表ID")
		return nil, false
	}
	bracket, err := models.GetBracketByID(id)
	if err != nil || bracket.EventID != config.Get().CurrentEventID {
		utils.ResponseError(c, http.StatusNotFound, models.ErrBracketNotFound.Error())
		return nil, false
	}
	return bracket, true
}

// applyBracketRequest 校验请求并写入可修改字段，返回错误提示（空串表示通过）
func applyBracketRequest(bracket *types.Bracket, req *BracketRequest) string {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "对阵表名称不能为空"
	}
	if len([]rune(name)) > maxBracketNameLen {
		return "对阵表名称过长"
	}
	description := strings.TrimSpace(req.Description)
	if len([]rune(description)) > maxBracketDescriptionLen {
		return "说明过长"
	}

	if req.CompetitionID != nil {
		competition, err := models.GetCompetitionByID(*req.CompetitionID)
		if err != nil || competition.EventID != bracket.EventID {
			return "关联的比赛项目不存在"
		}
	}

	groupCount, advance := 1, 0
	switch bracket.Format {
	case types.FormatRoundRobin:
		groupCount = req.GroupCount
	case types.FormatGroupKnockout:
		groupCount, advance = req.GroupCount, req.AdvancePerGroup
		if advance < 1 {
			return "每组出线数量至少为 1"
		}
	case types.FormatSingleElimination, types.FormatDoubleElimination:
	}
	if groupCount < 1 || groupCount > maxBracketGroupCount {
		return "小组数量需在 1 到 32 之间"
	}

	for _, p := range []*int{req.PointsWin, req.PointsDraw, req.PointsLoss} {
		if p != nil && (*p < -maxBracketPoints || *p > maxBracketPoints) {
			return "积分规则超出范围"
		}
	}

	bracket.Name = name
	bracket.Description = description
	bracket.CompetitionID = req.CompetitionID
	bracket.GroupCount = groupCount
	bracket.AdvancePerGroup = advance
	// 季军赛仅对含淘汰阶段的单败赛制有意义
	bracket.ThirdPlaceMatch = req.ThirdPlaceMatch &&
		(bracket.Format == types.FormatSingleElimination || bracket.Format == types.FormatGroupKnockout)
	if req.PointsWin != nil {
		bracket.PointsWin = *req.PointsWin
	}
	if req.PointsDraw != nil {
		bracket.PointsDraw = *req.PointsDraw
	}
	if req.PointsLoss != nil {
		bracket.PointsLoss = *req.PointsLoss
	}
	bracket.Published = req.Published
	return ""
}

func isValidBracketFormat(format types.BracketFormat) bool {
	switch format {
	case types.FormatSingleElimination, types.FormatDoubleElimination,
		types.FormatRoundRobin, types.FormatGroupKnockout:
		return true
	default:
		return false
	}
}

// respondBracketError 将业务错误映射为响应码
func respondBracketError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, models.ErrBracketNotFound),
		errors.Is(err, models.ErrBracketMatchNotFound),
		errors.Is(err, models.ErrBracketParticipantNotFound):
		utils.ResponseError(c, http.StatusNotFound, err.Error())
	case errors.Is(err, services.ErrBracketLocked),
		errors.Is(err, models.ErrBracketParticipantExists),
		errors.Is(err, models.ErrBracketCompetitionTaken),
		errors.Is(err, services.ErrBracketLinkedEnabled),
		errors.Is(err, services.ErrBracketCompetitionFinished),
		errors.Is(err, services.ErrBracketCompetitionNotRunning),
		errors.Is(err, services.ErrBracketToggleWithScores):
		utils.ResponseError(c, http.StatusConflict, err.Error())
	case isBracketValidationError(err):
		utils.ResponseError(c, http.StatusBadRequest, err.Error())
	default:
		utils.ResponseError(c, http.StatusInternalServerError, "操作失败："+err.Error())
	}
}

func isBracketValidationError(err error) bool {
	for _, target := range []error{
		services.ErrBracketTooFewParticipants, services.ErrBracketTooManyParticipant,
		services.ErrBracketInvalidGroupCount, services.ErrBracketInvalidAdvance,
		services.ErrBracketInvalidGroupIndex, services.ErrBracketUnknownFormat,
		services.ErrBracketNotGenerated, services.ErrBracketMatchNotPlayable,
		services.ErrBracketDrawNotAllowed, services.ErrBracketInvalidWinner,
		services.ErrBracketWinnerRequired, services.ErrBracketWinnerScoreConfit,
		services.ErrBracketOrderMismatch,
		models.ErrBracketStudentMissing, models.ErrBracketClassMissing,
		services.ErrBracketUnsupportedCompetition, services.ErrBracketTypeMismatch,
		services.ErrBracketNotSettled, services.ErrBracketCompetitionNoMatches,
	} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

func uniqueIDs(ids []int) []int {
	seen := make(map[int]bool, len(ids))
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
