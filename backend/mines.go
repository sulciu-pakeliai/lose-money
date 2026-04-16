package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	minesGridSize        = 25
	minesStatusActive    = "active"
	minesStatusCashedOut = "cashed_out"
	minesStatusExploded  = "exploded"
	minMinesCount        = 3
	maxMinesCount        = 20
)

type minesGame struct {
	ID                     string
	SessionID              string
	BetAmount              int64
	GridSize               int
	MineCount              int
	MinePositions          []int
	RevealedCells          []int
	CashoutMultiplierCents *int64
	Payout                 *int64
	Status                 string
	StartedAt              time.Time
	UpdatedAt              time.Time
	CompletedAt            *time.Time
}

type minesGameState struct {
	ID                string     `json:"id"`
	BetAmount         int64      `json:"betAmount"`
	GridSize          int        `json:"gridSize"`
	MineCount         int        `json:"mineCount"`
	RevealedCells     []int      `json:"revealedCells"`
	MinePositions     []int      `json:"minePositions,omitempty"`
	SafeReveals       int        `json:"safeReveals"`
	CurrentMultiplier float64    `json:"currentMultiplier"`
	PotentialPayout   int64      `json:"potentialPayout"`
	Status            string     `json:"status"`
	Message           string     `json:"message"`
	CanCashout        bool       `json:"canCashout"`
	StartedAt         time.Time  `json:"startedAt"`
	CompletedAt       *time.Time `json:"completedAt,omitempty"`
}

type minesStartRequest struct {
	Amount    int64 `json:"amount"`
	MineCount int   `json:"mineCount"`
}

type minesRevealRequest struct {
	Cell int `json:"cell"`
}

type minesActionResponse struct {
	Session       sessionDTO        `json:"session"`
	Mines         *minesGameState   `json:"mines"`
	Bet           *betRecord        `json:"bet,omitempty"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

func (a *application) handleMinesStart(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req minesStartRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MineCount == 0 {
		req.MineCount = 5
	}
	if req.Amount < 1 || req.Amount > maxBetAmount {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("bet amount must be between 1 and %d", maxBetAmount))
		return
	}
	if req.MineCount < minMinesCount || req.MineCount > maxMinesCount {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("mineCount must be between %d and %d", minMinesCount, maxMinesCount))
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	activeGame, err := a.loadActiveMinesTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check current mines round")
		return
	}
	if activeGame != nil {
		writeError(w, http.StatusConflict, "cash out or explode the current mines round before starting another")
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

	positions, err := randomMinePositions(minesGridSize, req.MineCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed mines board")
		return
	}

	now := time.Now().UTC()
	game := &minesGame{
		ID:            mustRandomToken(16),
		SessionID:     session.ID,
		BetAmount:     req.Amount,
		GridSize:      minesGridSize,
		MineCount:     req.MineCount,
		MinePositions: positions,
		RevealedCells: []int{},
		Status:        minesStatusActive,
		StartedAt:     now,
		UpdatedAt:     now,
	}

	if err := a.insertMinesGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create mines round")
		return
	}

	reservedBalance := lockedSession.Balance - req.Amount
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, reservedBalance, lockedSession.XP, lockedSession.GamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reserve mines bet")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit mines round")
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

	writeJSON(w, http.StatusOK, minesActionResponse{
		Session:       toSessionDTO(currentSession),
		Mines:         toMinesGameState(game),
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) handleMinesReveal(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req minesRevealRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Cell < 0 || req.Cell >= minesGridSize {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cell must be between 0 and %d", minesGridSize-1))
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	game, err := a.loadActiveMinesTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load mines round")
		return
	}
	if game == nil {
		writeError(w, http.StatusConflict, "there is no active mines round")
		return
	}

	if containsCell(game.RevealedCells, req.Cell) {
		writeError(w, http.StatusConflict, "cell already revealed")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	game.RevealedCells = append(game.RevealedCells, req.Cell)
	sort.Ints(game.RevealedCells)
	game.UpdatedAt = time.Now().UTC()

	mineSet := minesCellSet(game.MinePositions)
	_, exploded := mineSet[req.Cell]

	var historyEntry *betRecord
	if exploded {
		now := time.Now().UTC()
		game.Status = minesStatusExploded
		game.CompletedAt = &now
		zero := int64(0)
		game.Payout = &zero
		game.CashoutMultiplierCents = nil

		nextBalance := lockedSession.Balance
		nextXP := lockedSession.XP + calculateXPReward("mines", game.BetAmount, "loss", "exploded")
		nextGamesPlayed := lockedSession.GamesPlayed + 1
		if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to settle mines balance")
			return
		}

		entry := betRecord{
			ID:           mustRandomToken(16),
			Game:         "Mines",
			Choice:       fmt.Sprintf("Reveal #%d", req.Cell),
			Result:       "Mine",
			Amount:       game.BetAmount,
			Outcome:      "loss",
			BalanceAfter: nextBalance,
			Timestamp:    now,
		}
		historyEntry = &entry

		if err := a.insertBetHistory(r.Context(), tx, session.ID, historyEntry); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to record mines result")
			return
		}

		if err := a.applyMissionProgressTx(r.Context(), tx, session.ID, missionProgressEvent{
			Game:    missionScopeMines,
			Outcome: "loss",
			Amount:  game.BetAmount,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update missions")
			return
		}

		if err := a.applyAchievementProgressTx(r.Context(), tx, session.ID, achievementProgressEvent{
			Game:    missionScopeMines,
			Outcome: "loss",
			Amount:  game.BetAmount,
			Status:  "exploded",
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update achievements")
			return
		}

		if lockedSession.Balance > 100 && nextBalance <= 100 {
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
	} else {
		safeReveals := minesSafeRevealCount(game.RevealedCells, mineSet)
		multiplierCents := minesMultiplierCents(game.GridSize, game.MineCount, safeReveals)
		safeCellsTotal := game.GridSize - game.MineCount

		if safeReveals >= safeCellsTotal {
			now := time.Now().UTC()
			game.Status = minesStatusCashedOut
			game.CompletedAt = &now
			game.CashoutMultiplierCents = &multiplierCents
			payout := (game.BetAmount * multiplierCents) / 100
			game.Payout = &payout

			nextBalance := lockedSession.Balance + payout
			nextXP := lockedSession.XP + calculateXPReward("mines", game.BetAmount, "win", "perfect_clear")
			nextGamesPlayed := lockedSession.GamesPlayed + 1
			if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to settle mines balance")
				return
			}

			entry := betRecord{
				ID:           mustRandomToken(16),
				Game:         "Mines",
				Choice:       fmt.Sprintf("Perfect clear (%d mines)", game.MineCount),
				Result:       fmt.Sprintf("%.2fx", float64(multiplierCents)/100),
				Amount:       game.BetAmount,
				Outcome:      "win",
				BalanceAfter: nextBalance,
				Timestamp:    now,
			}
			historyEntry = &entry

			if err := a.insertBetHistory(r.Context(), tx, session.ID, historyEntry); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to record mines result")
				return
			}

			if err := a.applyMissionProgressTx(r.Context(), tx, session.ID, missionProgressEvent{
				Game:    missionScopeMines,
				Outcome: "win",
				Amount:  game.BetAmount,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to update missions")
				return
			}

			if err := a.applyAchievementProgressTx(r.Context(), tx, session.ID, achievementProgressEvent{
				Game:    missionScopeMines,
				Outcome: "win",
				Amount:  game.BetAmount,
				Status:  "perfect_clear",
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to update achievements")
				return
			}

			if err := a.sendNotificationTx(r.Context(), tx, session.ID, notificationInput{
				Category: "notification",
				Severity: "success",
				Title:    "Mines perfect clear",
				Message:  fmt.Sprintf("You cleared all safe cells and locked %.2fx.", float64(multiplierCents)/100),
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to queue notification")
				return
			}
		}
	}

	if err := a.updateMinesGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update mines round")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit mines action")
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

	writeJSON(w, http.StatusOK, minesActionResponse{
		Session:       toSessionDTO(currentSession),
		Mines:         toMinesGameState(game),
		Bet:           historyEntry,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) handleMinesCashout(w http.ResponseWriter, r *http.Request) {
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

	game, err := a.loadActiveMinesTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load mines round")
		return
	}
	if game == nil {
		writeError(w, http.StatusConflict, "there is no active mines round")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}

	safeReveals := minesSafeRevealCount(game.RevealedCells, minesCellSet(game.MinePositions))
	multiplierCents := minesMultiplierCents(game.GridSize, game.MineCount, safeReveals)
	payout := (game.BetAmount * multiplierCents) / 100
	nextBalance := lockedSession.Balance + payout

	now := time.Now().UTC()
	game.Status = minesStatusCashedOut
	game.CompletedAt = &now
	game.CashoutMultiplierCents = &multiplierCents
	game.Payout = &payout
	game.UpdatedAt = now

	outcome := "win"
	status := "cashout"
	if multiplierCents <= 100 {
		outcome = "push"
		status = "flat_cashout"
	}

	nextXP := lockedSession.XP + calculateXPReward("mines", game.BetAmount, outcome, status)
	nextGamesPlayed := lockedSession.GamesPlayed + 1
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to settle mines balance")
		return
	}

	if err := a.updateMinesGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update mines round")
		return
	}

	historyEntry := &betRecord{
		ID:           mustRandomToken(16),
		Game:         "Mines",
		Choice:       fmt.Sprintf("Cash out after %d safe", safeReveals),
		Result:       fmt.Sprintf("%.2fx", float64(multiplierCents)/100),
		Amount:       game.BetAmount,
		Outcome:      outcome,
		BalanceAfter: nextBalance,
		Timestamp:    now,
	}
	if err := a.insertBetHistory(r.Context(), tx, session.ID, historyEntry); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record mines result")
		return
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, session.ID, missionProgressEvent{
		Game:    missionScopeMines,
		Outcome: outcome,
		Amount:  game.BetAmount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, session.ID, achievementProgressEvent{
		Game:    missionScopeMines,
		Outcome: outcome,
		Amount:  game.BetAmount,
		Status:  status,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if outcome == "win" {
		if err := a.sendNotificationTx(r.Context(), tx, session.ID, notificationInput{
			Category: "notification",
			Severity: "success",
			Title:    "Mines cashout locked",
			Message:  fmt.Sprintf("You locked %.2fx for %d credits.", float64(multiplierCents)/100, payout),
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to queue notification")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit mines cashout")
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

	writeJSON(w, http.StatusOK, minesActionResponse{
		Session:       toSessionDTO(currentSession),
		Mines:         toMinesGameState(game),
		Bet:           historyEntry,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func (a *application) loadActiveMines(ctx context.Context, sessionID string) (*minesGameState, error) {
	game, err := a.loadActiveMinesRecord(ctx, a.db, sessionID)
	if err != nil {
		return nil, err
	}
	return toMinesGameState(game), nil
}

func (a *application) loadActiveMinesTx(ctx context.Context, tx pgx.Tx, sessionID string) (*minesGame, error) {
	query := `SELECT id, session_id, bet_amount, grid_size, mine_count, mine_positions, revealed_cells,
	        cashout_multiplier_cents, payout, status, started_at, updated_at, completed_at
	        FROM mines_games
	        WHERE session_id = $1 AND status = 'active'
	        ORDER BY started_at DESC
	        LIMIT 1
	        FOR UPDATE`
	return scanMinesGame(tx.QueryRow(ctx, query, sessionID))
}

type minesQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (a *application) loadActiveMinesRecord(ctx context.Context, queryer minesQueryer, sessionID string) (*minesGame, error) {
	query := `SELECT id, session_id, bet_amount, grid_size, mine_count, mine_positions, revealed_cells,
	        cashout_multiplier_cents, payout, status, started_at, updated_at, completed_at
	        FROM mines_games
	        WHERE session_id = $1 AND status = 'active'
	        ORDER BY started_at DESC
	        LIMIT 1`
	return scanMinesGame(queryer.QueryRow(ctx, query, sessionID))
}

func scanMinesGame(row pgx.Row) (*minesGame, error) {
	var game minesGame
	var mineJSON []byte
	var revealedJSON []byte
	err := row.Scan(
		&game.ID,
		&game.SessionID,
		&game.BetAmount,
		&game.GridSize,
		&game.MineCount,
		&mineJSON,
		&revealedJSON,
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
	if err := json.Unmarshal(mineJSON, &game.MinePositions); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(revealedJSON, &game.RevealedCells); err != nil {
		return nil, err
	}
	return &game, nil
}

func (a *application) insertMinesGame(ctx context.Context, tx pgx.Tx, game *minesGame) error {
	mineJSON, err := json.Marshal(game.MinePositions)
	if err != nil {
		return err
	}
	revealedJSON, err := json.Marshal(game.RevealedCells)
	if err != nil {
		return err
	}

	_, err = tx.Exec(
		ctx,
		`INSERT INTO mines_games (
		    id, session_id, bet_amount, grid_size, mine_count, mine_positions, revealed_cells,
		    cashout_multiplier_cents, payout, status, started_at, updated_at, completed_at
		 )
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		game.ID,
		game.SessionID,
		game.BetAmount,
		game.GridSize,
		game.MineCount,
		mineJSON,
		revealedJSON,
		game.CashoutMultiplierCents,
		game.Payout,
		game.Status,
		game.StartedAt,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func (a *application) updateMinesGame(ctx context.Context, tx pgx.Tx, game *minesGame) error {
	mineJSON, err := json.Marshal(game.MinePositions)
	if err != nil {
		return err
	}
	revealedJSON, err := json.Marshal(game.RevealedCells)
	if err != nil {
		return err
	}

	_, err = tx.Exec(
		ctx,
		`UPDATE mines_games
		 SET mine_positions = $2,
		     revealed_cells = $3,
		     cashout_multiplier_cents = $4,
		     payout = $5,
		     status = $6,
		     updated_at = $7,
		     completed_at = $8
		 WHERE id = $1`,
		game.ID,
		mineJSON,
		revealedJSON,
		game.CashoutMultiplierCents,
		game.Payout,
		game.Status,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func randomMinePositions(gridSize int, mineCount int) ([]int, error) {
	if mineCount <= 0 || mineCount >= gridSize {
		return nil, fmt.Errorf("invalid mine count")
	}

	positions := make(map[int]struct{}, mineCount)
	for len(positions) < mineCount {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(gridSize)))
		if err != nil {
			return nil, err
		}
		positions[int(n.Int64())] = struct{}{}
	}

	result := make([]int, 0, mineCount)
	for cell := range positions {
		result = append(result, cell)
	}
	sort.Ints(result)
	return result, nil
}

func containsCell(cells []int, target int) bool {
	for _, cell := range cells {
		if cell == target {
			return true
		}
	}
	return false
}

func minesCellSet(cells []int) map[int]struct{} {
	set := make(map[int]struct{}, len(cells))
	for _, cell := range cells {
		set[cell] = struct{}{}
	}
	return set
}

func minesSafeRevealCount(revealed []int, mineSet map[int]struct{}) int {
	total := 0
	for _, cell := range revealed {
		if _, isMine := mineSet[cell]; !isMine {
			total++
		}
	}
	return total
}

func minesMultiplierCents(gridSize int, mineCount int, safeReveals int) int64 {
	safeCells := gridSize - mineCount
	if safeReveals <= 0 || safeCells <= 0 {
		return 100
	}
	if safeReveals > safeCells {
		safeReveals = safeCells
	}

	raw := combinationFloat64(gridSize, safeReveals) / combinationFloat64(safeCells, safeReveals)
	if raw < 1 {
		raw = 1
	}

	withEdge := raw * 0.97
	cents := int64(math.Floor(withEdge * 100))
	if cents < 100 {
		cents = 100
	}
	return cents
}

func combinationFloat64(n int, k int) float64 {
	if k < 0 || k > n {
		return 0
	}
	if k == 0 || k == n {
		return 1
	}
	if k > n-k {
		k = n - k
	}

	result := 1.0
	for i := 1; i <= k; i++ {
		result *= float64(n-k+i) / float64(i)
	}
	return result
}

func toMinesGameState(game *minesGame) *minesGameState {
	if game == nil {
		return nil
	}

	safeReveals := minesSafeRevealCount(game.RevealedCells, minesCellSet(game.MinePositions))
	multiplierCents := minesMultiplierCents(game.GridSize, game.MineCount, safeReveals)
	if game.CashoutMultiplierCents != nil {
		multiplierCents = *game.CashoutMultiplierCents
	}

	state := &minesGameState{
		ID:                game.ID,
		BetAmount:         game.BetAmount,
		GridSize:          game.GridSize,
		MineCount:         game.MineCount,
		RevealedCells:     game.RevealedCells,
		SafeReveals:       safeReveals,
		CurrentMultiplier: float64(multiplierCents) / 100,
		PotentialPayout:   (game.BetAmount * multiplierCents) / 100,
		Status:            game.Status,
		Message:           minesStatusMessage(game.Status),
		CanCashout:        game.Status == minesStatusActive,
		StartedAt:         game.StartedAt,
		CompletedAt:       game.CompletedAt,
	}

	if game.Status != minesStatusActive {
		state.MinePositions = game.MinePositions
	}

	return state
}

func minesStatusMessage(status string) string {
	switch status {
	case minesStatusCashedOut:
		return "Cashout locked."
	case minesStatusExploded:
		return "Mine triggered."
	default:
		return "Pick a tile or cash out."
	}
}
