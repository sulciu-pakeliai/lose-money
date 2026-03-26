package main

import (
	"context"
	"fmt"
	"hash/fnv"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	missionScopeAll       = "all"
	missionScopeCoinFlip  = "coinflip"
	missionScopeBlackjack = "blackjack"

	missionMetricRounds = "rounds_played"
	missionMetricWins   = "wins"
	missionMetricWager  = "wager_total"
)

type missionTemplate struct {
	TemplateKey   string
	GroupName     string
	Title         string
	Description   string
	GameScope     string
	Metric        string
	Target        int64
	RewardBalance int64
	RewardXP      int64
}

type missionRecord struct {
	ID            string
	SessionID     string
	CycleStart    time.Time
	CycleEnd      time.Time
	SortOrder     int
	TemplateKey   string
	GroupName     string
	Title         string
	Description   string
	GameScope     string
	Metric        string
	Target        int64
	Progress      int64
	RewardBalance int64
	RewardXP      int64
	CompletedAt   *time.Time
	ClaimedAt     *time.Time
}

type missionDTO struct {
	ID            string     `json:"id"`
	TemplateKey   string     `json:"templateKey"`
	GroupName     string     `json:"groupName"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	GameScope     string     `json:"gameScope"`
	Target        int64      `json:"target"`
	Progress      int64      `json:"progress"`
	RewardBalance int64      `json:"rewardBalance"`
	RewardXP      int64      `json:"rewardXp"`
	Status        string     `json:"status"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	ClaimedAt     *time.Time `json:"claimedAt,omitempty"`
	ResetsAt      time.Time  `json:"resetsAt"`
}

type missionClaimRequest struct {
	MissionID string `json:"missionId"`
}

type missionClaimResponse struct {
	Session          sessionDTO   `json:"session"`
	TopUp            topUpPolicy  `json:"topUp"`
	Missions         []missionDTO `json:"missions"`
	ClaimedMissionID string       `json:"claimedMissionId"`
	RewardBalance    int64        `json:"rewardBalance"`
	RewardXP         int64        `json:"rewardXp"`
}

type missionProgressEvent struct {
	Game    string
	Outcome string
	Amount  int64
}

var universalMissionTemplates = []missionTemplate{
	{
		TemplateKey:   "all_rounds_5",
		GroupName:     "All Games",
		Title:         "Table Hopper",
		Description:   "Finish 5 rounds across any table.",
		GameScope:     missionScopeAll,
		Metric:        missionMetricRounds,
		Target:        5,
		RewardBalance: 180,
		RewardXP:      40,
	},
	{
		TemplateKey:   "all_wins_3",
		GroupName:     "All Games",
		Title:         "Hot Hand",
		Description:   "Win 3 rounds in any game.",
		GameScope:     missionScopeAll,
		Metric:        missionMetricWins,
		Target:        3,
		RewardBalance: 240,
		RewardXP:      60,
	},
	{
		TemplateKey:   "all_wager_400",
		GroupName:     "All Games",
		Title:         "Volume Shooter",
		Description:   "Wager 400 credits anywhere in the casino.",
		GameScope:     missionScopeAll,
		Metric:        missionMetricWager,
		Target:        400,
		RewardBalance: 260,
		RewardXP:      55,
	},
}

var coinFlipMissionTemplates = []missionTemplate{
	{
		TemplateKey:   "coinflip_rounds_4",
		GroupName:     "Flipzilla",
		Title:         "Coin Runner",
		Description:   "Play 4 rounds of Flipzilla.",
		GameScope:     missionScopeCoinFlip,
		Metric:        missionMetricRounds,
		Target:        4,
		RewardBalance: 140,
		RewardXP:      30,
	},
	{
		TemplateKey:   "coinflip_wins_2",
		GroupName:     "Flipzilla",
		Title:         "Sharp Call",
		Description:   "Win 2 Flipzilla rounds.",
		GameScope:     missionScopeCoinFlip,
		Metric:        missionMetricWins,
		Target:        2,
		RewardBalance: 190,
		RewardXP:      45,
	},
	{
		TemplateKey:   "coinflip_wager_150",
		GroupName:     "Flipzilla",
		Title:         "Coin Rain",
		Description:   "Wager 150 credits on coin flips.",
		GameScope:     missionScopeCoinFlip,
		Metric:        missionMetricWager,
		Target:        150,
		RewardBalance: 170,
		RewardXP:      35,
	},
}

var blackjackMissionTemplates = []missionTemplate{
	{
		TemplateKey:   "blackjack_rounds_2",
		GroupName:     "High Table 21",
		Title:         "Seat Warmed",
		Description:   "Finish 2 blackjack hands.",
		GameScope:     missionScopeBlackjack,
		Metric:        missionMetricRounds,
		Target:        2,
		RewardBalance: 160,
		RewardXP:      35,
	},
	{
		TemplateKey:   "blackjack_wins_1",
		GroupName:     "High Table 21",
		Title:         "Dealer Down",
		Description:   "Win 1 blackjack hand.",
		GameScope:     missionScopeBlackjack,
		Metric:        missionMetricWins,
		Target:        1,
		RewardBalance: 210,
		RewardXP:      55,
	},
	{
		TemplateKey:   "blackjack_wager_250",
		GroupName:     "High Table 21",
		Title:         "Pit Boss",
		Description:   "Wager 250 credits at the blackjack table.",
		GameScope:     missionScopeBlackjack,
		Metric:        missionMetricWager,
		Target:        250,
		RewardBalance: 240,
		RewardXP:      50,
	},
}

func (a *application) handleMissionClaim(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req missionClaimRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MissionID == "" {
		writeError(w, http.StatusBadRequest, "missionId is required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	if err := a.ensureDailyMissionsTx(r.Context(), tx, session.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load missions")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	mission, err := a.loadMissionForClaimTx(r.Context(), tx, session.ID, req.MissionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "mission not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load mission")
		return
	}

	switch missionStatus(mission) {
	case "claimed":
		writeError(w, http.StatusConflict, "mission reward already claimed")
		return
	case "in_progress":
		writeError(w, http.StatusConflict, "mission is not complete yet")
		return
	}

	now := time.Now().UTC()
	nextBalance := lockedSession.Balance + mission.RewardBalance
	nextXP := lockedSession.XP + mission.RewardXP
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, lockedSession.GamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to apply mission reward")
		return
	}

	if _, err := tx.Exec(
		r.Context(),
		`UPDATE session_missions
		 SET claimed_at = $2,
		     updated_at = NOW()
		 WHERE id = $1`,
		mission.ID,
		now,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to claim mission reward")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit mission reward")
		return
	}

	currentSession, err := a.loadSession(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}

	missions, err := a.loadDailyMissions(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload missions")
		return
	}

	writeJSON(w, http.StatusOK, missionClaimResponse{
		Session:          toSessionDTO(currentSession),
		TopUp:            buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:         missions,
		ClaimedMissionID: mission.ID,
		RewardBalance:    mission.RewardBalance,
		RewardXP:         mission.RewardXP,
	})
}

func (a *application) loadDailyMissions(ctx context.Context, sessionID string) ([]missionDTO, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if err := a.ensureDailyMissionsTx(ctx, tx, sessionID); err != nil {
		return nil, err
	}

	missions, err := a.loadDailyMissionsTx(ctx, tx, sessionID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return missions, nil
}

func (a *application) ensureDailyMissionsTx(ctx context.Context, tx pgx.Tx, sessionID string) error {
	cycleStart, cycleEnd := missionCycleBounds(time.Now().UTC())

	var count int
	if err := tx.QueryRow(
		ctx,
		`SELECT COUNT(*)
		 FROM session_missions
		 WHERE session_id = $1 AND cycle_start = $2`,
		sessionID,
		cycleStart,
	).Scan(&count); err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	templates := assignDailyMissionTemplates(sessionID, cycleStart)
	now := time.Now().UTC()
	for index, template := range templates {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO session_missions (
			    id, session_id, cycle_start, cycle_end, sort_order, template_key, group_name,
			    title, description, game_scope, metric, target, progress, reward_balance,
			    reward_xp, created_at, updated_at
			 )
			 VALUES (
			    $1, $2, $3, $4, $5, $6, $7,
			    $8, $9, $10, $11, $12, 0, $13,
			    $14, $15, $15
			 )
			 ON CONFLICT (session_id, cycle_start, sort_order) DO NOTHING`,
			mustRandomToken(16),
			sessionID,
			cycleStart,
			cycleEnd,
			index,
			template.TemplateKey,
			template.GroupName,
			template.Title,
			template.Description,
			template.GameScope,
			template.Metric,
			template.Target,
			template.RewardBalance,
			template.RewardXP,
			now,
		); err != nil {
			return err
		}
	}

	return nil
}

func (a *application) loadDailyMissionsTx(ctx context.Context, tx pgx.Tx, sessionID string) ([]missionDTO, error) {
	cycleStart, _ := missionCycleBounds(time.Now().UTC())
	rows, err := tx.Query(
		ctx,
		`SELECT id, session_id, cycle_start, cycle_end, sort_order, template_key, group_name,
		        title, description, game_scope, metric, target, progress, reward_balance,
		        reward_xp, completed_at, claimed_at
		 FROM session_missions
		 WHERE session_id = $1 AND cycle_start = $2
		 ORDER BY sort_order ASC`,
		sessionID,
		cycleStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	missions := make([]missionDTO, 0, 3)
	for rows.Next() {
		record, err := scanMission(rows)
		if err != nil {
			return nil, err
		}
		missions = append(missions, toMissionDTO(record))
	}

	return missions, rows.Err()
}

func (a *application) loadMissionForClaimTx(ctx context.Context, tx pgx.Tx, sessionID string, missionID string) (missionRecord, error) {
	cycleStart, _ := missionCycleBounds(time.Now().UTC())
	row := tx.QueryRow(
		ctx,
		`SELECT id, session_id, cycle_start, cycle_end, sort_order, template_key, group_name,
		        title, description, game_scope, metric, target, progress, reward_balance,
		        reward_xp, completed_at, claimed_at
		 FROM session_missions
		 WHERE session_id = $1 AND cycle_start = $2 AND id = $3
		 FOR UPDATE`,
		sessionID,
		cycleStart,
		missionID,
	)
	return scanMission(row)
}

func (a *application) loadDailyMissionRecordsForUpdateTx(ctx context.Context, tx pgx.Tx, sessionID string) ([]missionRecord, error) {
	cycleStart, _ := missionCycleBounds(time.Now().UTC())
	rows, err := tx.Query(
		ctx,
		`SELECT id, session_id, cycle_start, cycle_end, sort_order, template_key, group_name,
		        title, description, game_scope, metric, target, progress, reward_balance,
		        reward_xp, completed_at, claimed_at
		 FROM session_missions
		 WHERE session_id = $1 AND cycle_start = $2
		 ORDER BY sort_order ASC
		 FOR UPDATE`,
		sessionID,
		cycleStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]missionRecord, 0, 3)
	for rows.Next() {
		record, err := scanMission(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (a *application) applyMissionProgressTx(ctx context.Context, tx pgx.Tx, sessionID string, event missionProgressEvent) error {
	if err := a.ensureDailyMissionsTx(ctx, tx, sessionID); err != nil {
		return err
	}

	records, err := a.loadDailyMissionRecordsForUpdateTx(ctx, tx, sessionID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	for _, record := range records {
		if missionStatus(record) != "in_progress" {
			continue
		}

		increment := missionProgressIncrement(record, event)
		if increment <= 0 {
			continue
		}

		nextProgress := record.Progress + increment
		if nextProgress > record.Target {
			nextProgress = record.Target
		}

		var completedAt *time.Time
		if record.CompletedAt != nil {
			completedAt = record.CompletedAt
		}
		if completedAt == nil && nextProgress >= record.Target {
			completedAt = &now
		}

		if _, err := tx.Exec(
			ctx,
			`UPDATE session_missions
			 SET progress = $2,
			     completed_at = $3,
			     updated_at = NOW()
			 WHERE id = $1`,
			record.ID,
			nextProgress,
			completedAt,
		); err != nil {
			return err
		}
	}

	return nil
}

func assignDailyMissionTemplates(sessionID string, cycleStart time.Time) []missionTemplate {
	return []missionTemplate{
		pickMissionTemplate(universalMissionTemplates, sessionID, cycleStart, "universal"),
		pickMissionTemplate(coinFlipMissionTemplates, sessionID, cycleStart, "coinflip"),
		pickMissionTemplate(blackjackMissionTemplates, sessionID, cycleStart, "blackjack"),
	}
}

func pickMissionTemplate(pool []missionTemplate, sessionID string, cycleStart time.Time, salt string) missionTemplate {
	index := hashIndex(fmt.Sprintf("%s|%s|%s", sessionID, cycleStart.Format("2006-01-02"), salt), len(pool))
	return pool[index]
}

func hashIndex(value string, size int) int {
	if size <= 1 {
		return 0
	}

	hasher := fnv.New32a()
	_, _ = hasher.Write([]byte(value))
	return int(hasher.Sum32() % uint32(size))
}

func missionCycleBounds(now time.Time) (time.Time, time.Time) {
	utc := now.UTC()
	start := time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
	return start, start.Add(24 * time.Hour)
}

func scanMission(scanner interface {
	Scan(...any) error
}) (missionRecord, error) {
	var record missionRecord
	err := scanner.Scan(
		&record.ID,
		&record.SessionID,
		&record.CycleStart,
		&record.CycleEnd,
		&record.SortOrder,
		&record.TemplateKey,
		&record.GroupName,
		&record.Title,
		&record.Description,
		&record.GameScope,
		&record.Metric,
		&record.Target,
		&record.Progress,
		&record.RewardBalance,
		&record.RewardXP,
		&record.CompletedAt,
		&record.ClaimedAt,
	)
	return record, err
}

func toMissionDTO(record missionRecord) missionDTO {
	progress := record.Progress
	if progress > record.Target {
		progress = record.Target
	}

	return missionDTO{
		ID:            record.ID,
		TemplateKey:   record.TemplateKey,
		GroupName:     record.GroupName,
		Title:         record.Title,
		Description:   record.Description,
		GameScope:     record.GameScope,
		Target:        record.Target,
		Progress:      progress,
		RewardBalance: record.RewardBalance,
		RewardXP:      record.RewardXP,
		Status:        missionStatus(record),
		CompletedAt:   record.CompletedAt,
		ClaimedAt:     record.ClaimedAt,
		ResetsAt:      record.CycleEnd,
	}
}

func missionStatus(record missionRecord) string {
	switch {
	case record.ClaimedAt != nil:
		return "claimed"
	case record.CompletedAt != nil || record.Progress >= record.Target:
		return "claimable"
	default:
		return "in_progress"
	}
}

func missionProgressIncrement(record missionRecord, event missionProgressEvent) int64 {
	if record.GameScope != missionScopeAll && record.GameScope != event.Game {
		return 0
	}

	switch record.Metric {
	case missionMetricRounds:
		return 1
	case missionMetricWins:
		if event.Outcome == "win" {
			return 1
		}
		return 0
	case missionMetricWager:
		return event.Amount
	default:
		return 0
	}
}
