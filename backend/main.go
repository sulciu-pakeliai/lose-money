package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	sessionCookieName = "lm_session"
	startBalance      = int64(1000)
	maxBetAmount      = int64(10000)
	topUpCooldown     = 30 * time.Second
	historyLimit      = 20
	baseXPPerLevel    = int64(100)
	xpStepPerLevel    = int64(75)
)

var allowedTopUpAmounts = []int64{100, 250, 500}

type application struct {
	db *pgxpool.Pool
}

type sessionRecord struct {
	ID          string
	Balance     int64
	XP          int64
	GamesPlayed int64
	UserID      *string
	UserEmail   *string
	CreatedAt   time.Time
	LastTopUpAt *time.Time
}

type sessionDTO struct {
	ID             string    `json:"id"`
	Balance        int64     `json:"balance"`
	UserID         *string   `json:"userId,omitempty"`
	UserEmail      *string   `json:"userEmail,omitempty"`
	XP             int64     `json:"xp"`
	Level          int64     `json:"level"`
	GamesPlayed    int64     `json:"gamesPlayed"`
	LevelStartXP   int64     `json:"levelStartXp"`
	NextLevelXP    int64     `json:"nextLevelXp"`
	XPIntoLevel    int64     `json:"xpIntoLevel"`
	XPForNextLevel int64     `json:"xpForNextLevel"`
	CreatedAt      time.Time `json:"createdAt"`
}

type betRecord struct {
	ID           string    `json:"id"`
	Game         string    `json:"game"`
	Choice       string    `json:"choice"`
	Result       string    `json:"result"`
	Amount       int64     `json:"amount"`
	Outcome      string    `json:"outcome"`
	BalanceAfter int64     `json:"balanceAfter"`
	Timestamp    time.Time `json:"timestamp"`
}

type topUpPolicy struct {
	AllowedAmounts  []int64    `json:"allowedAmounts"`
	CooldownSeconds int        `json:"cooldownSeconds"`
	AvailableAt     *time.Time `json:"availableAt,omitempty"`
}

type stateResponse struct {
	Session       sessionDTO          `json:"session"`
	History       []betRecord         `json:"history"`
	TopUp         topUpPolicy         `json:"topUp"`
	Missions      []missionDTO        `json:"missions"`
	Notifications []notificationDTO   `json:"notifications"`
	Blackjack     *blackjackGameState `json:"blackjack,omitempty"`
}

type coinFlipRequest struct {
	Choice string `json:"choice"`
	Amount int64  `json:"amount"`
}

type coinFlipResponse struct {
	Session       sessionDTO        `json:"session"`
	Bet           betRecord         `json:"bet"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Notifications []notificationDTO `json:"notifications"`
}

type topUpRequest struct {
	Amount int64 `json:"amount"`
}

type topUpResponse struct {
	Session        sessionDTO        `json:"session"`
	CreditedAmount int64             `json:"creditedAmount"`
	TopUp          topUpPolicy       `json:"topUp"`
	Missions       []missionDTO      `json:"missions"`
	Notifications  []notificationDTO `json:"notifications"`
}

type profileResponse struct {
	Session      sessionDTO `json:"session"`
	TotalBets    int64      `json:"totalBets"`
	TotalWins    int64      `json:"totalWins"`
	TotalLoss    int64      `json:"totalLoss"`
	TotalPush    int64      `json:"totalPush"`
	TotalWagered int64      `json:"totalWagered"`
	BiggestWin   int64      `json:"biggestWin"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func main() {
	ctx := context.Background()
	databaseURL := envOrDefault("DATABASE_URL", "postgres://postgres:example@localhost:5432/postgres?sslmode=disable")
	port := envOrDefault("PORT", "8080")

	db, err := openDatabase(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer db.Close()

	if err := ensureSchema(ctx, db); err != nil {
		log.Fatalf("ensure schema: %v", err)
	}

	app := &application{db: db}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", app.handleHealth)
	mux.HandleFunc("POST /api/auth/register", app.handleRegister)
	mux.HandleFunc("POST /api/auth/login", app.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", app.handleLogout)
	mux.HandleFunc("GET /api/state", app.handleState)
	mux.HandleFunc("GET /api/notifications", app.handleNotifications)
	mux.HandleFunc("POST /api/notifications/read", app.handleNotificationsRead)
	mux.HandleFunc("POST /api/coinflip", app.handleCoinFlip)
	mux.HandleFunc("POST /api/top-up", app.handleTopUp)
	mux.HandleFunc("POST /api/missions/claim", app.handleMissionClaim)
	mux.HandleFunc("POST /api/blackjack/start", app.handleBlackjackStart)
	mux.HandleFunc("POST /api/blackjack/hit", app.handleBlackjackHit)
	mux.HandleFunc("POST /api/blackjack/stand", app.handleBlackjackStand)
	mux.HandleFunc("GET /api/profile", app.handleProfile)

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("backend listening on :%s", port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}

func openDatabase(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	var pool *pgxpool.Pool
	for attempt := 1; attempt <= 15; attempt++ {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = pool.Ping(pingCtx)
			cancel()
			if err == nil {
				return pool, nil
			}
			pool.Close()
		}

		if attempt == 15 {
			break
		}

		log.Printf("database unavailable, retrying (%d/15): %v", attempt, err)
		time.Sleep(2 * time.Second)
	}

	return nil, err
}

func ensureSchema(ctx context.Context, db *pgxpool.Pool) error {
	const schema = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    balance BIGINT NOT NULL,
    xp BIGINT NOT NULL DEFAULT 0,
    games_played BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_top_up_at TIMESTAMPTZ
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS games_played BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    choice TEXT NOT NULL,
    result TEXT NOT NULL,
    amount BIGINT NOT NULL,
    outcome TEXT NOT NULL,
    balance_after BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bets_session_created_at_idx
    ON bets(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_missions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    cycle_start TIMESTAMPTZ NOT NULL,
    cycle_end TIMESTAMPTZ NOT NULL,
    sort_order INTEGER NOT NULL,
    template_key TEXT NOT NULL,
    group_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    game_scope TEXT NOT NULL,
    metric TEXT NOT NULL,
    target BIGINT NOT NULL,
    progress BIGINT NOT NULL DEFAULT 0,
    reward_balance BIGINT NOT NULL DEFAULT 0,
    reward_xp BIGINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS session_missions_cycle_slot_idx
    ON session_missions(session_id, cycle_start, sort_order);

CREATE INDEX IF NOT EXISTS session_missions_session_cycle_idx
    ON session_missions(session_id, cycle_start);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_session_created_at_idx
    ON notifications(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blackjack_games (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    bet_amount BIGINT NOT NULL,
    deck JSONB NOT NULL,
    player_cards JSONB NOT NULL,
    dealer_cards JSONB NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS blackjack_active_session_idx
    ON blackjack_games(session_id)
    WHERE status = 'active';

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
`

	_, err := db.Exec(ctx, schema)
	return err
}

func (a *application) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *application) handleState(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	history, err := a.loadHistory(r.Context(), session.ID, historyLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load history")
		return
	}

	blackjack, err := a.loadActiveBlackjack(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load blackjack state")
		return
	}

	missions, err := a.loadDailyMissions(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load missions")
		return
	}

	notifications, err := a.loadNotifications(r.Context(), session.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load notifications")
		return
	}

	writeJSON(w, http.StatusOK, stateResponse{
		Session:       toSessionDTO(session),
		History:       history,
		TopUp:         buildTopUpPolicy(session.LastTopUpAt),
		Missions:      missions,
		Notifications: notifications,
		Blackjack:     blackjack,
	})
}

func (a *application) handleCoinFlip(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req coinFlipRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Choice = normalizeSide(req.Choice)
	switch {
	case req.Choice == "":
		writeError(w, http.StatusBadRequest, "choice must be Heads or Tails")
		return
	case req.Amount < 1:
		writeError(w, http.StatusBadRequest, "bet amount must be at least 1")
		return
	case req.Amount > maxBetAmount:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("bet amount cannot exceed %d", maxBetAmount))
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var locked sessionRecord
	err = tx.QueryRow(
		r.Context(),
		`SELECT id, balance, xp, games_played, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		session.ID,
	).Scan(&locked.ID, &locked.Balance, &locked.XP, &locked.GamesPlayed, &locked.CreatedAt, &locked.LastTopUpAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	if req.Amount > locked.Balance {
		writeError(w, http.StatusBadRequest, "not enough balance for that bet")
		return
	}

	result, err := randomSide()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve flip")
		return
	}

	won := result == req.Choice
	nextBalance := locked.Balance - req.Amount
	outcome := "loss"
	if won {
		nextBalance = locked.Balance + req.Amount
		outcome = "win"
	}

	bet := betRecord{
		ID:           mustRandomToken(16),
		Game:         "Flipzilla",
		Choice:       req.Choice,
		Result:       result,
		Amount:       req.Amount,
		Outcome:      outcome,
		BalanceAfter: nextBalance,
		Timestamp:    time.Now().UTC(),
	}

	xpReward := calculateXPReward("coinflip", req.Amount, outcome, "")
	nextXP := locked.XP + xpReward
	nextGamesPlayed := locked.GamesPlayed + 1

	if _, err := tx.Exec(
		r.Context(),
		`UPDATE sessions
         SET balance = $2,
             xp = $3,
             games_played = $4,
             updated_at = NOW()
         WHERE id = $1`,
		locked.ID,
		nextBalance,
		nextXP,
		nextGamesPlayed,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update balance")
		return
	}

	if _, err := tx.Exec(
		r.Context(),
		`INSERT INTO bets (id, session_id, game, choice, result, amount, outcome, balance_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		bet.ID,
		locked.ID,
		bet.Game,
		bet.Choice,
		bet.Result,
		bet.Amount,
		bet.Outcome,
		bet.BalanceAfter,
		bet.Timestamp,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record bet")
		return
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, locked.ID, missionProgressEvent{
		Game:    "coinflip",
		Outcome: outcome,
		Amount:  req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if won {
		if err := a.sendNotificationTx(r.Context(), tx, locked.ID, notificationInput{
			Category: "notification",
			Severity: "success",
			Title:    "Flipzilla paid out",
			Message:  fmt.Sprintf("Your %s call landed. %+d credits returned to the table.", req.Choice, req.Amount),
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to queue notification")
			return
		}
	} else if locked.Balance > 100 && nextBalance <= 100 {
		if err := a.sendNotificationTx(r.Context(), tx, locked.ID, notificationInput{
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
		writeError(w, http.StatusInternalServerError, "failed to commit bet")
		return
	}

	currentSession, err := a.loadSession(r.Context(), locked.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}

	missions, err := a.loadDailyMissions(r.Context(), locked.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload missions")
		return
	}

	notifications, err := a.loadNotifications(r.Context(), locked.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return
	}

	writeJSON(w, http.StatusOK, coinFlipResponse{
		Session:       toSessionDTO(currentSession),
		Bet:           bet,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Notifications: notifications,
	})
}

func (a *application) handleTopUp(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req topUpRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if !isAllowedTopUp(req.Amount) {
		writeError(w, http.StatusBadRequest, "amount must match an allowed faucet value")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var locked sessionRecord
	err = tx.QueryRow(
		r.Context(),
		`SELECT id, balance, xp, games_played, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		session.ID,
	).Scan(&locked.ID, &locked.Balance, &locked.XP, &locked.GamesPlayed, &locked.CreatedAt, &locked.LastTopUpAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	if waitUntil := nextTopUpAt(locked.LastTopUpAt); waitUntil != nil {
		writeJSON(w, http.StatusTooManyRequests, errorResponse{
			Error: fmt.Sprintf("top up is cooling down until %s", waitUntil.Format(time.RFC3339)),
		})
		return
	}

	now := time.Now().UTC()
	nextBalance := locked.Balance + req.Amount
	if _, err := tx.Exec(
		r.Context(),
		`UPDATE sessions SET balance = $2, last_top_up_at = $3, updated_at = NOW() WHERE id = $1`,
		locked.ID,
		nextBalance,
		now,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update balance")
		return
	}

	if err := a.sendNotificationTx(r.Context(), tx, locked.ID, notificationInput{
		Category: "notification",
		Severity: "success",
		Title:    "Balance topped up",
		Message:  fmt.Sprintf("%d credits were added to your session balance.", req.Amount),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to queue notification")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit top up")
		return
	}

	currentSession, err := a.loadSession(r.Context(), locked.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}

	missions, err := a.loadDailyMissions(r.Context(), locked.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload missions")
		return
	}

	notifications, err := a.loadNotifications(r.Context(), locked.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return
	}

	writeJSON(w, http.StatusOK, topUpResponse{
		Session:        toSessionDTO(currentSession),
		CreditedAmount: req.Amount,
		TopUp:          buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:       missions,
		Notifications:  notifications,
	})
}

func (a *application) ensureSession(w http.ResponseWriter, r *http.Request) (sessionRecord, error) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		session, err := a.loadSession(r.Context(), cookie.Value)
		switch {
		case err == nil:
			return session, nil
		case !errors.Is(err, pgx.ErrNoRows):
			return sessionRecord{}, err
		}
	}

	session := sessionRecord{
		ID:          mustRandomToken(24),
		Balance:     startBalance,
		XP:          0,
		GamesPlayed: 0,
		CreatedAt:   time.Now().UTC(),
	}

	if _, err := a.db.Exec(
		r.Context(),
		`INSERT INTO sessions (id, balance, xp, games_played, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
		session.ID,
		session.Balance,
		session.XP,
		session.GamesPlayed,
		session.CreatedAt,
	); err != nil {
		return sessionRecord{}, err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    session.ID,
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})

	return session, nil
}

func (a *application) loadSession(ctx context.Context, sessionID string) (sessionRecord, error) {
	var session sessionRecord
	var uid string
	var userEmail string
	err := a.db.QueryRow(
		ctx,
		`SELECT s.id, s.balance, s.xp, s.games_played, COALESCE(s.user_id,'') as user_id, COALESCE(u.email,'') as user_email, s.created_at, s.last_top_up_at
		 FROM sessions s
		 LEFT JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.XP, &session.GamesPlayed, &uid, &userEmail, &session.CreatedAt, &session.LastTopUpAt)

	if uid == "" {
		session.UserID = nil
	} else {
		session.UserID = &uid
	}

	if userEmail == "" {
		session.UserEmail = nil
	} else {
		session.UserEmail = &userEmail
	}
	return session, err
}

func (a *application) loadHistory(ctx context.Context, sessionID string, limit int) ([]betRecord, error) {
	rows, err := a.db.Query(
		ctx,
		`SELECT id, game, choice, result, amount, outcome, balance_after, created_at
         FROM bets
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
		sessionID,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	history := make([]betRecord, 0, limit)
	for rows.Next() {
		var bet betRecord
		if err := rows.Scan(
			&bet.ID,
			&bet.Game,
			&bet.Choice,
			&bet.Result,
			&bet.Amount,
			&bet.Outcome,
			&bet.BalanceAfter,
			&bet.Timestamp,
		); err != nil {
			return nil, err
		}
		history = append(history, bet)
	}

	return history, rows.Err()
}

func (a *application) handleProfile(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var stats profileResponse
	err = a.db.QueryRow(
		r.Context(),
		`SELECT
			COUNT(*)                                                AS total_bets,
			COUNT(*) FILTER (WHERE outcome = 'win')                 AS total_wins,
			COUNT(*) FILTER (WHERE outcome = 'loss')                AS total_losses,
			COUNT(*) FILTER (WHERE outcome = 'push')                AS total_push,
			COALESCE(SUM(amount), 0)                                AS total_wagered,
			COALESCE(MAX(amount) FILTER (WHERE outcome = 'win'), 0) AS biggest_win
		FROM bets
		WHERE session_id = $1`,
		session.ID,
	).Scan(
		&stats.TotalBets,
		&stats.TotalWins,
		&stats.TotalLoss,
		&stats.TotalPush,
		&stats.TotalWagered,
		&stats.BiggestWin,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load profile stats")
		return
	}

	stats.Session = toSessionDTO(session)
	writeJSON(w, http.StatusOK, stats)
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write json: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}

func toSessionDTO(session sessionRecord) sessionDTO {
	level := levelForXP(session.XP)
	levelStartXP := xpRequiredForLevel(level)
	nextLevelXP := xpRequiredForLevel(level + 1)
	return sessionDTO{
		ID:             session.ID,
		Balance:        session.Balance,
		UserID:         session.UserID,
		UserEmail:      session.UserEmail,
		XP:             session.XP,
		Level:          level,
		GamesPlayed:    session.GamesPlayed,
		LevelStartXP:   levelStartXP,
		NextLevelXP:    nextLevelXP,
		XPIntoLevel:    session.XP - levelStartXP,
		XPForNextLevel: nextLevelXP - levelStartXP,
		CreatedAt:      session.CreatedAt,
	}
}

func xpRequiredForLevel(level int64) int64 {
	if level <= 1 {
		return 0
	}

	prev := level - 1
	return prev*baseXPPerLevel + xpStepPerLevel*prev*(prev-1)/2
}

func levelForXP(xp int64) int64 {
	level := int64(1)
	for xp >= xpRequiredForLevel(level+1) {
		level++
	}
	return level
}

func calculateXPReward(game string, amount int64, outcome string, status string) int64 {
	base := int64(20)
	volumeBonus := amount / 10
	if volumeBonus > 80 {
		volumeBonus = 80
	}

	outcomeBonus := int64(0)
	switch outcome {
	case "win":
		outcomeBonus = 30
	case "push":
		outcomeBonus = 18
	default:
		outcomeBonus = 10
	}

	statusBonus := int64(0)
	if game == "blackjack" {
		statusBonus = 12
		if status == "blackjack" {
			statusBonus = 30
		}
	}

	return base + volumeBonus + outcomeBonus + statusBonus
}

func randomSide() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(2))
	if err != nil {
		return "", err
	}
	if n.Int64() == 0 {
		return "Heads", nil
	}
	return "Tails", nil
}

func normalizeSide(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "heads":
		return "Heads"
	case "tails":
		return "Tails"
	default:
		return ""
	}
}

func buildTopUpPolicy(lastTopUpAt *time.Time) topUpPolicy {
	return topUpPolicy{
		AllowedAmounts:  allowedTopUpAmounts,
		CooldownSeconds: int(topUpCooldown / time.Second),
		AvailableAt:     nextTopUpAt(lastTopUpAt),
	}
}

func nextTopUpAt(lastTopUpAt *time.Time) *time.Time {
	if lastTopUpAt == nil {
		return nil
	}

	next := lastTopUpAt.Add(topUpCooldown)
	if time.Now().UTC().Before(next) {
		return &next
	}

	return nil
}

func isAllowedTopUp(amount int64) bool {
	for _, candidate := range allowedTopUpAmounts {
		if amount == candidate {
			return true
		}
	}
	return false
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func mustRandomToken(size int) string {
	value, err := randomToken(size)
	if err != nil {
		panic(err)
	}
	return value
}

func randomToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
}
