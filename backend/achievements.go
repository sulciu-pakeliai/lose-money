package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	achievementMetricRounds            = "rounds_played"
	achievementMetricWins              = "wins"
	achievementMetricWager             = "wager_total"
	achievementMetricSingleBet         = "single_bet"
	achievementMetricNaturalBlackjacks = "natural_blackjacks"
)

type achievementTemplate struct {
	SortOrder   int
	TemplateKey string
	GroupName   string
	Title       string
	Description string
	GameScope   string
	Rarity      string
	Accent      string
	IconLabel   string
	Metric      string
	Target      int64
}

type achievementRecord struct {
	ID          string
	SessionID   string
	SortOrder   int
	TemplateKey string
	GroupName   string
	Title       string
	Description string
	GameScope   string
	Rarity      string
	Accent      string
	IconLabel   string
	Metric      string
	Target      int64
	Progress    int64
	UnlockedAt  *time.Time
}

type achievementDTO struct {
	ID          string     `json:"id"`
	TemplateKey string     `json:"templateKey"`
	GroupName   string     `json:"groupName"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	GameScope   string     `json:"gameScope"`
	Rarity      string     `json:"rarity"`
	Accent      string     `json:"accent"`
	IconLabel   string     `json:"iconLabel"`
	Target      int64      `json:"target"`
	Progress    int64      `json:"progress"`
	Status      string     `json:"status"`
	UnlockedAt  *time.Time `json:"unlockedAt,omitempty"`
}

type achievementProgressEvent struct {
	Game    string
	Outcome string
	Amount  int64
	Status  string
}

var achievementTemplates = []achievementTemplate{
	{
		SortOrder:   0,
		TemplateKey: "first_spin",
		GroupName:   "Casino",
		Title:       "First Spin",
		Description: "Finish your first round anywhere in the casino.",
		GameScope:   missionScopeAll,
		Rarity:      "common",
		Accent:      "copper",
		IconLabel:   "01",
		Metric:      achievementMetricRounds,
		Target:      1,
	},
	{
		SortOrder:   1,
		TemplateKey: "night_shift",
		GroupName:   "Casino",
		Title:       "Night Shift",
		Description: "Complete 15 rounds across any table.",
		GameScope:   missionScopeAll,
		Rarity:      "uncommon",
		Accent:      "cyan",
		IconLabel:   "15",
		Metric:      achievementMetricRounds,
		Target:      15,
	},
	{
		SortOrder:   2,
		TemplateKey: "stack_builder",
		GroupName:   "Casino",
		Title:       "Stack Builder",
		Description: "Wager 500 credits in total.",
		GameScope:   missionScopeAll,
		Rarity:      "uncommon",
		Accent:      "emerald",
		IconLabel:   "500",
		Metric:      achievementMetricWager,
		Target:      500,
	},
	{
		SortOrder:   3,
		TemplateKey: "high_roller",
		GroupName:   "Casino",
		Title:       "High Roller",
		Description: "Place a single 250 credit bet.",
		GameScope:   missionScopeAll,
		Rarity:      "rare",
		Accent:      "rose",
		IconLabel:   "250",
		Metric:      achievementMetricSingleBet,
		Target:      250,
	},
	{
		SortOrder:   4,
		TemplateKey: "coin_regular",
		GroupName:   "Flipzilla",
		Title:       "Coin Regular",
		Description: "Play 6 rounds of Flipzilla.",
		GameScope:   missionScopeCoinFlip,
		Rarity:      "common",
		Accent:      "cyan",
		IconLabel:   "CF",
		Metric:      achievementMetricRounds,
		Target:      6,
	},
	{
		SortOrder:   5,
		TemplateKey: "called_shot",
		GroupName:   "Flipzilla",
		Title:       "Called Shot",
		Description: "Win 3 coin flip rounds.",
		GameScope:   missionScopeCoinFlip,
		Rarity:      "rare",
		Accent:      "copper",
		IconLabel:   "3W",
		Metric:      achievementMetricWins,
		Target:      3,
	},
	{
		SortOrder:   6,
		TemplateKey: "table_reader",
		GroupName:   "High Table 21",
		Title:       "Table Reader",
		Description: "Finish 4 blackjack hands.",
		GameScope:   missionScopeBlackjack,
		Rarity:      "common",
		Accent:      "emerald",
		IconLabel:   "21",
		Metric:      achievementMetricRounds,
		Target:      4,
	},
	{
		SortOrder:   7,
		TemplateKey: "natural_21",
		GroupName:   "High Table 21",
		Title:       "Natural 21",
		Description: "Hit a natural blackjack.",
		GameScope:   missionScopeBlackjack,
		Rarity:      "epic",
		Accent:      "gold",
		IconLabel:   "BJ",
		Metric:      achievementMetricNaturalBlackjacks,
		Target:      1,
	},
}

func (a *application) loadAchievements(ctx context.Context, sessionID string) ([]achievementDTO, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if err := a.ensureAchievementsTx(ctx, tx, sessionID); err != nil {
		return nil, err
	}

	achievements, err := a.loadAchievementsTx(ctx, tx, sessionID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return achievements, nil
}

func (a *application) ensureAchievementsTx(ctx context.Context, tx pgx.Tx, sessionID string) error {
	now := time.Now().UTC()
	for _, template := range achievementTemplates {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO session_achievements (
			    id, session_id, sort_order, template_key, group_name, title, description,
			    game_scope, rarity, accent, icon_label, metric, target, progress, created_at, updated_at
			 )
			 VALUES (
			    $1, $2, $3, $4, $5, $6, $7,
			    $8, $9, $10, $11, $12, $13, 0, $14, $14
			 )
			 ON CONFLICT (session_id, template_key) DO UPDATE
			 SET sort_order = EXCLUDED.sort_order,
			     group_name = EXCLUDED.group_name,
			     title = EXCLUDED.title,
			     description = EXCLUDED.description,
			     game_scope = EXCLUDED.game_scope,
			     rarity = EXCLUDED.rarity,
			     accent = EXCLUDED.accent,
			     icon_label = EXCLUDED.icon_label,
			     metric = EXCLUDED.metric,
			     target = EXCLUDED.target`,
			mustRandomToken(16),
			sessionID,
			template.SortOrder,
			template.TemplateKey,
			template.GroupName,
			template.Title,
			template.Description,
			template.GameScope,
			template.Rarity,
			template.Accent,
			template.IconLabel,
			template.Metric,
			template.Target,
			now,
		); err != nil {
			return err
		}
	}

	return nil
}

func (a *application) loadAchievementsTx(ctx context.Context, tx pgx.Tx, sessionID string) ([]achievementDTO, error) {
	rows, err := tx.Query(
		ctx,
		`SELECT id, session_id, sort_order, template_key, group_name, title, description,
		        game_scope, rarity, accent, icon_label, metric, target, progress, unlocked_at
		 FROM session_achievements
		 WHERE session_id = $1
		 ORDER BY sort_order ASC`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	achievements := make([]achievementDTO, 0, len(achievementTemplates))
	for rows.Next() {
		record, err := scanAchievement(rows)
		if err != nil {
			return nil, err
		}
		achievements = append(achievements, toAchievementDTO(record))
	}

	return achievements, rows.Err()
}

func (a *application) loadAchievementRecordsForUpdateTx(ctx context.Context, tx pgx.Tx, sessionID string) ([]achievementRecord, error) {
	rows, err := tx.Query(
		ctx,
		`SELECT id, session_id, sort_order, template_key, group_name, title, description,
		        game_scope, rarity, accent, icon_label, metric, target, progress, unlocked_at
		 FROM session_achievements
		 WHERE session_id = $1
		 ORDER BY sort_order ASC
		 FOR UPDATE`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]achievementRecord, 0, len(achievementTemplates))
	for rows.Next() {
		record, err := scanAchievement(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, rows.Err()
}

func (a *application) applyAchievementProgressTx(ctx context.Context, tx pgx.Tx, sessionID string, event achievementProgressEvent) error {
	if err := a.ensureAchievementsTx(ctx, tx, sessionID); err != nil {
		return err
	}

	records, err := a.loadAchievementRecordsForUpdateTx(ctx, tx, sessionID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	for _, record := range records {
		if record.UnlockedAt != nil {
			continue
		}

		nextProgress, changed := nextAchievementProgress(record, event)
		if !changed {
			continue
		}

		var unlockedAt *time.Time
		if nextProgress >= record.Target {
			unlockedAt = &now
			nextProgress = record.Target
		}

		if _, err := tx.Exec(
			ctx,
			`UPDATE session_achievements
			 SET progress = $2,
			     unlocked_at = $3,
			     updated_at = NOW()
			 WHERE id = $1`,
			record.ID,
			nextProgress,
			unlockedAt,
		); err != nil {
			return err
		}

		if unlockedAt != nil {
			if err := a.sendNotificationTx(ctx, tx, sessionID, achievementUnlockNotification(record)); err != nil {
				return err
			}
		}
	}

	return nil
}

func nextAchievementProgress(record achievementRecord, event achievementProgressEvent) (int64, bool) {
	if record.GameScope != missionScopeAll && record.GameScope != event.Game {
		return record.Progress, false
	}

	switch record.Metric {
	case achievementMetricRounds:
		return minAchievementProgress(record.Progress+1, record.Target), true
	case achievementMetricWins:
		if event.Outcome != "win" {
			return record.Progress, false
		}
		return minAchievementProgress(record.Progress+1, record.Target), true
	case achievementMetricWager:
		if event.Amount <= 0 {
			return record.Progress, false
		}
		return minAchievementProgress(record.Progress+event.Amount, record.Target), true
	case achievementMetricSingleBet:
		if event.Amount <= record.Progress {
			return record.Progress, false
		}
		return minAchievementProgress(event.Amount, record.Target), true
	case achievementMetricNaturalBlackjacks:
		if event.Game != missionScopeBlackjack || event.Status != "blackjack" {
			return record.Progress, false
		}
		return minAchievementProgress(record.Progress+1, record.Target), true
	default:
		return record.Progress, false
	}
}

func minAchievementProgress(progress int64, target int64) int64 {
	if progress > target {
		return target
	}
	return progress
}

func achievementUnlockNotification(record achievementRecord) notificationInput {
	return notificationInput{
		Category: "notification",
		Severity: achievementNotificationSeverity(record.Rarity),
		Title:    "Achievement unlocked",
		Message:  fmt.Sprintf("%s joined your cabinet. %s", record.Title, record.Description),
	}
}

func achievementNotificationSeverity(rarity string) string {
	switch rarity {
	case "rare", "epic":
		return "success"
	default:
		return "info"
	}
}

func scanAchievement(scanner interface {
	Scan(...any) error
}) (achievementRecord, error) {
	var record achievementRecord
	err := scanner.Scan(
		&record.ID,
		&record.SessionID,
		&record.SortOrder,
		&record.TemplateKey,
		&record.GroupName,
		&record.Title,
		&record.Description,
		&record.GameScope,
		&record.Rarity,
		&record.Accent,
		&record.IconLabel,
		&record.Metric,
		&record.Target,
		&record.Progress,
		&record.UnlockedAt,
	)
	return record, err
}

func toAchievementDTO(record achievementRecord) achievementDTO {
	progress := record.Progress
	if progress > record.Target {
		progress = record.Target
	}

	return achievementDTO{
		ID:          record.ID,
		TemplateKey: record.TemplateKey,
		GroupName:   record.GroupName,
		Title:       record.Title,
		Description: record.Description,
		GameScope:   record.GameScope,
		Rarity:      record.Rarity,
		Accent:      record.Accent,
		IconLabel:   record.IconLabel,
		Target:      record.Target,
		Progress:    progress,
		Status:      achievementStatus(record),
		UnlockedAt:  record.UnlockedAt,
	}
}

func achievementStatus(record achievementRecord) string {
	if record.UnlockedAt != nil || record.Progress >= record.Target {
		return "unlocked"
	}
	return "locked"
}
