package types

// VoteType 投票类型
type VoteType int

const (
	VoteTypeUp   VoteType = 1  // Upvote (赞成)
	VoteTypeDown VoteType = -1 // Downvote (反对)
)

// Vote 投票模型
type Vote struct {
	ID            int      `json:"id"             gorm:"primaryKey;autoIncrement"`
	StudentID     int      `json:"student_id"     gorm:"not null;index:idx_vote_unique,unique"`
	CompetitionID int      `json:"competition_id" gorm:"not null;index:idx_vote_unique,unique"`
	VoteType      VoteType `json:"vote_type"      gorm:"not null"` // 1: upvote, -1: downvote

	// 关联关系
	Student     Student     `json:"-" gorm:"foreignKey:StudentID"`
	Competition Competition `json:"-" gorm:"foreignKey:CompetitionID"`
}
