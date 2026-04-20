package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	crashStatusActive    = "active"
	crashStatusCashedOut = "cashed_out"
	crashStatusCrashed   = "crashed"
	crashGrowthBase      = 4.5
	crashGrowthExponent  = 1.25
)

type crashGame struct {
	ID                     string
	SessionID              string
	BetAmount              int64
	CrashMultiplierCents   int64
	CashoutMultiplierCents *int64
	Payout                 *int64
	Status                 string
	StartedAt              time.Time
	UpdatedAt              time.Time
	CompletedAt            *time.Time
}

type crashGameState struct {
	ID                string     `json:"id"`
	BetAmount         int64      `json:"betAmount"`
	CrashMultiplier   *float64   `json:"crashMultiplier,omitempty"`
	CashoutMultiplier *float64   `json:"cashoutMultiplier,omitempty"`
	Payout            *int64     `json:"payout,omitempty"`
	Status            string     `json:"status"`
	StartedAt         time.Time  `json:"startedAt"`
	CrashAfterMs      *int64     `json:"crashAfterMs,omitempty"`
	ElapsedMs         int64      `json:"elapsedMs"`
	CurrentMultiplier float64    `json:"currentMultiplier"`
	CanCashout        bool       `json:"canCashout"`
	Message           string     `json:"message"`
	CompletedAt       *time.Time `json:"completedAt,omitempty"`
	BalanceReserved   bool       `json:"balanceReserved"`
}

type crashStartRequest struct {
	Amount int64 `json:"amount"`
}

type crashStartResponse struct {
	Session       sessionDTO        `json:"session"`
	Crash         *crashGameState   `json:"crash"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

type crashCashoutResponse struct {
	Session       sessionDTO        `json:"session"`
	Crash         *crashGameState   `json:"crash"`
	Bet           betRecord         `json:"bet"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

type crashStatusResponse struct {
	Session       sessionDTO        `json:"session"`
	Crash         *crashGameState   `json:"crash"`
	Bet           *betRecord        `json:"bet,omitempty"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

func (a *application) handleCrashStart(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req crashStartRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	excluded, err := a.isSessionExcluded(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check exclusion")
		return
	}
	if excluded {
		writeError(w, http.StatusForbidden, "self-exclusion is active — bets are not allowed")
		return
	}

	if limit := a.sessionBetLimit(r.Context(), session.ID); limit != nil && req.Amount > *limit {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("bet exceeds your session limit of %d", *limit))
		return
	}

	if req.Amount < 1 || req.Amount > maxBetAmount {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("bet amount must be between 1 and %d", maxBetAmount))
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	activeGame, err := a.loadActiveCrashTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check current crash round")
		return
	}
	if activeGame != nil {
		writeError(w, http.StatusConflict, "settle the current crash round before starting another")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}
	if req.Amount > lockedSession.Balance {
		writeError(w, http.StatusBadRequest, "not enough balance for that bet")
		return
	}

	crashMultiplier, err := randomCrashMultiplierCents()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed crash round")
		return
	}

	now := time.Now().UTC()
	game := &crashGame{
		ID:                   mustRandomToken(16),
		SessionID:            session.ID,
		BetAmount:            req.Amount,
		CrashMultiplierCents: crashMultiplier,
		Status:               crashStatusActive,
		StartedAt:            now,
		UpdatedAt:            now,
	}

	if err := a.insertCrashGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create crash round")
		return
	}

	reservedBalance := lockedSession.Balance - req.Amount
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, reservedBalance, lockedSession.XP, lockedSession.GamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reserve crash bet")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit crash round")
		return
	}

	currentSession, err := a.loadSession(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}
	missions, achievements, notifications, ok := a.loadProgressPayload(w, r, lockedSession.ID)
	if !ok {
		return
	}

	writeJSON(w, http.StatusOK, crashStartResponse{
		Session:       toSessionDTO(currentSession),
		Crash:         toCrashGameState(game, time.Now().UTC()),
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) handleCrashCashout(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	game, err := a.loadActiveCrashTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load crash round")
		return
	}
	if game == nil {
		writeError(w, http.StatusConflict, "there is no active crash round")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	now := time.Now().UTC()
	crashAfter := crashDurationForMultiplierCents(game.CrashMultiplierCents)
	elapsed := now.Sub(game.StartedAt)
	hasCrashed := elapsed >= crashAfter

	status := crashStatusCashedOut
	outcome := "win"
	statusForXP := "cashout"
	cashoutMultiplier := crashMultiplierCentsForElapsed(elapsed)
	if cashoutMultiplier < 100 {
		cashoutMultiplier = 100
	}
	if cashoutMultiplier > game.CrashMultiplierCents {
		cashoutMultiplier = game.CrashMultiplierCents
	}
	payout := (game.BetAmount * cashoutMultiplier) / 100
	completedAt := now

	if hasCrashed {
		status = crashStatusCrashed
		outcome = "loss"
		statusForXP = "crashed"
		cashoutMultiplier = 0
		payout = 0
		completedAt = game.StartedAt.Add(crashAfter)
	}

	game.Status = status
	game.CashoutMultiplierCents = nil
	if !hasCrashed {
		game.CashoutMultiplierCents = &cashoutMultiplier
	}
	game.Payout = &payout
	game.UpdatedAt = now
	game.CompletedAt = &completedAt

	nextBalance := lockedSession.Balance + payout
	nextXP := lockedSession.XP + calculateXPReward("crash", game.BetAmount, outcome, statusForXP)
	nextGamesPlayed := lockedSession.GamesPlayed + 1
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to settle crash balance")
		return
	}

	if err := a.updateCrashGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to settle crash round")
		return
	}

	historyEntry := buildCrashHistory(game, nextBalance, outcome)
	if err := a.insertBetHistory(r.Context(), tx, session.ID, &historyEntry); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record crash result")
		return
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, session.ID, missionProgressEvent{
		Game:    "crash",
		Outcome: outcome,
		Amount:  game.BetAmount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, session.ID, achievementProgressEvent{
		Game:    "crash",
		Outcome: outcome,
		Amount:  game.BetAmount,
		Status:  statusForXP,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if outcome == "win" {
		if err := a.sendNotificationTx(r.Context(), tx, session.ID, buildCrashNotification(historyEntry, game)); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to queue notification")
			return
		}
	} else if lockedSession.Balance > 100 && nextBalance <= 100 {
		if err := a.sendNotificationTx(r.Context(), tx, lockedSession.ID, notificationInput{
			Category: "notification",
			Severity: "warning",
			Title:    "Balance running low",
			Message:  "You dropped to 100 credits or less. A top up might keep the table alive.",
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to queue notification")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit crash result")
		return
	}

	currentSession, err := a.loadSession(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}
	missions, achievements, notifications, ok := a.loadProgressPayload(w, r, lockedSession.ID)
	if !ok {
		return
	}

	writeJSON(w, http.StatusOK, crashCashoutResponse{
		Session:       toSessionDTO(currentSession),
		Crash:         toCrashGameState(game, time.Now().UTC()),
		Bet:           historyEntry,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) handleCrashStatus(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	game, err := a.loadActiveCrashTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load crash round")
		return
	}

	currentSession := session
	var historyEntry *betRecord
	stateNow := time.Now().UTC()
	if game != nil {
		now := time.Now().UTC()
		stateNow = now
		crashAfter := crashDurationForMultiplierCents(game.CrashMultiplierCents)
		if now.Sub(game.StartedAt) >= crashAfter {
			lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to lock session")
				return
			}

			entry, nextSession, ok := a.settleCrashLossTx(w, r, tx, game, lockedSession, crashAfter, now)
			if !ok {
				return
			}
			historyEntry = entry
			currentSession = nextSession
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit crash status")
		return
	}

	missions, achievements, notifications, ok := a.loadProgressPayload(w, r, session.ID)
	if !ok {
		return
	}

	writeJSON(w, http.StatusOK, crashStatusResponse{
		Session:       toSessionDTO(currentSession),
		Crash:         toCrashGameState(game, stateNow),
		Bet:           historyEntry,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) settleCrashLossTx(w http.ResponseWriter, r *http.Request, tx pgx.Tx, game *crashGame, lockedSession sessionRecord, crashAfter time.Duration, now time.Time) (*betRecord, sessionRecord, bool) {
	payout := int64(0)
	completedAt := game.StartedAt.Add(crashAfter)
	game.Status = crashStatusCrashed
	game.CashoutMultiplierCents = nil
	game.Payout = &payout
	game.UpdatedAt = now
	game.CompletedAt = &completedAt

	nextXP := lockedSession.XP + calculateXPReward("crash", game.BetAmount, "loss", "crashed")
	nextGamesPlayed := lockedSession.GamesPlayed + 1
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, lockedSession.Balance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to settle crash balance")
		return nil, sessionRecord{}, false
	}

	if err := a.updateCrashGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to settle crash round")
		return nil, sessionRecord{}, false
	}

	historyEntry := buildCrashHistory(game, lockedSession.Balance, "loss")
	if err := a.insertBetHistory(r.Context(), tx, lockedSession.ID, &historyEntry); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record crash result")
		return nil, sessionRecord{}, false
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, lockedSession.ID, missionProgressEvent{
		Game:    "crash",
		Outcome: "loss",
		Amount:  game.BetAmount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return nil, sessionRecord{}, false
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, lockedSession.ID, achievementProgressEvent{
		Game:    "crash",
		Outcome: "loss",
		Amount:  game.BetAmount,
		Status:  "crashed",
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return nil, sessionRecord{}, false
	}

	nextSession := lockedSession
	nextSession.XP = nextXP
	nextSession.GamesPlayed = nextGamesPlayed
	return &historyEntry, nextSession, true
}

func (a *application) loadActiveCrash(ctx context.Context, sessionID string) (*crashGameState, error) {
	game, err := a.loadActiveCrashRecord(ctx, a.db, sessionID)
	if err != nil {
		return nil, err
	}
	return toCrashGameState(game, time.Now().UTC()), nil
}

func (a *application) loadActiveCrashTx(ctx context.Context, tx pgx.Tx, sessionID string) (*crashGame, error) {
	query := `SELECT id, session_id, bet_amount, crash_multiplier_cents, cashout_multiplier_cents,
        payout, status, started_at, updated_at, completed_at
        FROM crash_games
        WHERE session_id = $1 AND status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
        FOR UPDATE`
	return scanCrashGame(tx.QueryRow(ctx, query, sessionID))
}

type crashQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (a *application) loadActiveCrashRecord(ctx context.Context, queryer crashQueryer, sessionID string) (*crashGame, error) {
	query := `SELECT id, session_id, bet_amount, crash_multiplier_cents, cashout_multiplier_cents,
        payout, status, started_at, updated_at, completed_at
        FROM crash_games
        WHERE session_id = $1 AND status = 'active'
        ORDER BY started_at DESC
        LIMIT 1`
	return scanCrashGame(queryer.QueryRow(ctx, query, sessionID))
}

func scanCrashGame(row pgx.Row) (*crashGame, error) {
	var game crashGame
	err := row.Scan(
		&game.ID,
		&game.SessionID,
		&game.BetAmount,
		&game.CrashMultiplierCents,
		&game.CashoutMultiplierCents,
		&game.Payout,
		&game.Status,
		&game.StartedAt,
		&game.UpdatedAt,
		&game.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &game, nil
}

func (a *application) insertCrashGame(ctx context.Context, tx pgx.Tx, game *crashGame) error {
	_, err := tx.Exec(
		ctx,
		`INSERT INTO crash_games (
            id, session_id, bet_amount, crash_multiplier_cents, cashout_multiplier_cents,
            payout, status, started_at, updated_at, completed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		game.ID,
		game.SessionID,
		game.BetAmount,
		game.CrashMultiplierCents,
		game.CashoutMultiplierCents,
		game.Payout,
		game.Status,
		game.StartedAt,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func (a *application) updateCrashGame(ctx context.Context, tx pgx.Tx, game *crashGame) error {
	_, err := tx.Exec(
		ctx,
		`UPDATE crash_games
         SET cashout_multiplier_cents = $2,
             payout = $3,
             status = $4,
             updated_at = $5,
             completed_at = $6
         WHERE id = $1`,
		game.ID,
		game.CashoutMultiplierCents,
		game.Payout,
		game.Status,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func (a *application) loadProgressPayload(w http.ResponseWriter, r *http.Request, sessionID string) ([]missionDTO, []achievementDTO, []notificationDTO, bool) {
	missions, err := a.loadDailyMissions(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload missions")
		return nil, nil, nil, false
	}
	achievements, err := a.loadAchievements(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload achievements")
		return nil, nil, nil, false
	}
	notifications, err := a.loadNotifications(r.Context(), sessionID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return nil, nil, nil, false
	}
	return missions, achievements, notifications, true
}

func buildCrashHistory(game *crashGame, balanceAfter int64, outcome string) betRecord {
	choice := "Ride"
	result := fmt.Sprintf("Crashed at %.2fx", centsToMultiplier(game.CrashMultiplierCents))
	if outcome == "win" && game.CashoutMultiplierCents != nil {
		choice = fmt.Sprintf("Cash out %.2fx", centsToMultiplier(*game.CashoutMultiplierCents))
	}

	return betRecord{
		ID:           mustRandomToken(16),
		Game:         "Crash",
		Choice:       choice,
		Result:       result,
		Amount:       game.BetAmount,
		Outcome:      outcome,
		BalanceAfter: balanceAfter,
		Timestamp:    time.Now().UTC(),
	}
}

func buildCrashNotification(history betRecord, game *crashGame) notificationInput {
	multiplier := 1.0
	if game.CashoutMultiplierCents != nil {
		multiplier = centsToMultiplier(*game.CashoutMultiplierCents)
	}
	return notificationInput{
		Category: "notification",
		Severity: "success",
		Title:    "Crash cashout locked",
		Message:  fmt.Sprintf("%s returned %d credits at %.2fx.", history.Choice, *game.Payout, multiplier),
	}
}

func toCrashGameState(game *crashGame, now time.Time) *crashGameState {
	if game == nil {
		return nil
	}

	crashAfter := crashDurationForMultiplierCents(game.CrashMultiplierCents)
	elapsed := now.Sub(game.StartedAt)
	if elapsed < 0 {
		elapsed = 0
	}
	currentCents := crashMultiplierCentsForElapsed(elapsed)
	canCashout := game.Status == crashStatusActive && elapsed < crashAfter
	if elapsed >= crashAfter {
		currentCents = game.CrashMultiplierCents
		canCashout = false
	}
	if game.Status != crashStatusActive {
		canCashout = false
		if game.CashoutMultiplierCents != nil {
			currentCents = *game.CashoutMultiplierCents
		} else {
			currentCents = game.CrashMultiplierCents
		}
	}

	var cashoutMultiplier *float64
	if game.CashoutMultiplierCents != nil {
		value := centsToMultiplier(*game.CashoutMultiplierCents)
		cashoutMultiplier = &value
	}

	var crashMultiplier *float64
	var crashAfterMs *int64
	if game.Status != crashStatusActive {
		multiplier := centsToMultiplier(game.CrashMultiplierCents)
		durationMs := int64(crashAfter / time.Millisecond)
		crashMultiplier = &multiplier
		crashAfterMs = &durationMs
	}

	return &crashGameState{
		ID:                game.ID,
		BetAmount:         game.BetAmount,
		CrashMultiplier:   crashMultiplier,
		CashoutMultiplier: cashoutMultiplier,
		Payout:            game.Payout,
		Status:            game.Status,
		StartedAt:         game.StartedAt,
		CrashAfterMs:      crashAfterMs,
		ElapsedMs:         int64(elapsed / time.Millisecond),
		CurrentMultiplier: centsToMultiplier(currentCents),
		CanCashout:        canCashout,
		Message:           crashStatusMessage(game.Status),
		CompletedAt:       game.CompletedAt,
		BalanceReserved:   game.Status == crashStatusActive,
	}
}

func randomCrashMultiplierCents() (int64, error) {
	roll, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		return 0, err
	}

	value := roll.Int64()
	switch {
	case value < 900:
		return randomCentsInRange(100, 119)
	case value < 3200:
		return randomCentsInRange(120, 199)
	case value < 6900:
		return randomCentsInRange(200, 399)
	case value < 9000:
		return randomCentsInRange(400, 899)
	case value < 9820:
		return randomCentsInRange(900, 2499)
	default:
		return randomCentsInRange(2500, 10000)
	}
}

func randomCentsInRange(minimum int64, maximum int64) (int64, error) {
	if maximum < minimum {
		return minimum, nil
	}
	n, err := rand.Int(rand.Reader, big.NewInt(maximum-minimum+1))
	if err != nil {
		return 0, err
	}
	return minimum + n.Int64(), nil
}

func crashMultiplierCentsForElapsed(elapsed time.Duration) int64 {
	if elapsed <= 0 {
		return 100
	}

	seconds := elapsed.Seconds()
	multiplier := 1 + math.Pow(seconds/crashGrowthBase, crashGrowthExponent)
	if multiplier < 1 {
		multiplier = 1
	}
	return int64(math.Floor(multiplier * 100))
}

func crashDurationForMultiplierCents(cents int64) time.Duration {
	if cents <= 100 {
		return 350 * time.Millisecond
	}

	multiplier := float64(cents) / 100
	seconds := math.Pow(multiplier-1, 1/crashGrowthExponent) * crashGrowthBase
	if seconds < 0.35 {
		seconds = 0.35
	}
	return time.Duration(seconds * float64(time.Second))
}

func centsToMultiplier(cents int64) float64 {
	return float64(cents) / 100
}

func crashStatusMessage(status string) string {
	switch status {
	case crashStatusCashedOut:
		return "Cashout locked."
	case crashStatusCrashed:
		return "Crashed."
	default:
		return "Multiplier climbing."
	}
}
