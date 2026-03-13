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
)

var allowedTopUpAmounts = []int64{100, 250, 500}

type application struct {
	db *pgxpool.Pool
}

type sessionRecord struct {
	ID          string
	Balance     int64
	CreatedAt   time.Time
	LastTopUpAt *time.Time
}

type sessionDTO struct {
	ID        string    `json:"id"`
	Balance   int64     `json:"balance"`
	CreatedAt time.Time `json:"createdAt"`
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
	Session sessionDTO  `json:"session"`
	History []betRecord `json:"history"`
	TopUp   topUpPolicy `json:"topUp"`
}

type coinFlipRequest struct {
	Choice string `json:"choice"`
	Amount int64  `json:"amount"`
}

type coinFlipResponse struct {
	Session sessionDTO  `json:"session"`
	Bet     betRecord   `json:"bet"`
	TopUp   topUpPolicy `json:"topUp"`
}

type topUpRequest struct {
	Amount int64 `json:"amount"`
}

type topUpResponse struct {
	Session        sessionDTO  `json:"session"`
	CreditedAmount int64       `json:"creditedAmount"`
	TopUp          topUpPolicy `json:"topUp"`
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
	mux.HandleFunc("GET /api/state", app.handleState)
	mux.HandleFunc("POST /api/coinflip", app.handleCoinFlip)
	mux.HandleFunc("POST /api/top-up", app.handleTopUp)

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
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    balance BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_top_up_at TIMESTAMPTZ
);

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

	writeJSON(w, http.StatusOK, stateResponse{
		Session: toSessionDTO(session),
		History: history,
		TopUp:   buildTopUpPolicy(session.LastTopUpAt),
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
		`SELECT id, balance, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		session.ID,
	).Scan(&locked.ID, &locked.Balance, &locked.CreatedAt, &locked.LastTopUpAt)
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

	if _, err := tx.Exec(
		r.Context(),
		`UPDATE sessions SET balance = $2, updated_at = NOW() WHERE id = $1`,
		locked.ID,
		nextBalance,
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

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit bet")
		return
	}

	locked.Balance = nextBalance
	writeJSON(w, http.StatusOK, coinFlipResponse{
		Session: toSessionDTO(locked),
		Bet:     bet,
		TopUp:   buildTopUpPolicy(locked.LastTopUpAt),
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
		`SELECT id, balance, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		session.ID,
	).Scan(&locked.ID, &locked.Balance, &locked.CreatedAt, &locked.LastTopUpAt)
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

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit top up")
		return
	}

	locked.Balance = nextBalance
	locked.LastTopUpAt = &now
	writeJSON(w, http.StatusOK, topUpResponse{
		Session:        toSessionDTO(locked),
		CreditedAmount: req.Amount,
		TopUp:          buildTopUpPolicy(locked.LastTopUpAt),
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
		ID:        mustRandomToken(24),
		Balance:   startBalance,
		CreatedAt: time.Now().UTC(),
	}

	if _, err := a.db.Exec(
		r.Context(),
		`INSERT INTO sessions (id, balance, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
		session.ID,
		session.Balance,
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
	err := a.db.QueryRow(
		ctx,
		`SELECT id, balance, created_at, last_top_up_at FROM sessions WHERE id = $1`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.CreatedAt, &session.LastTopUpAt)
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
	return sessionDTO{
		ID:        session.ID,
		Balance:   session.Balance,
		CreatedAt: session.CreatedAt,
	}
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
