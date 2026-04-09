package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

type slotSymbol struct {
	Name       string
	Weight     int
	Multiplier int64
}

// SCRUM-77: Symbol definitions and payout table
var slotSymbols = []slotSymbol{
	{Name: "cherry", Weight: 30, Multiplier: 2},
	{Name: "lemon", Weight: 25, Multiplier: 3},
	{Name: "orange", Weight: 20, Multiplier: 4},
	{Name: "grape", Weight: 15, Multiplier: 6},
	{Name: "diamond", Weight: 7, Multiplier: 15},
	{Name: "seven", Weight: 3, Multiplier: 30},
}

type slotSpinRequest struct {
	Amount int64 `json:"amount"`
}

type slotSpinResponse struct {
	Session       sessionDTO        `json:"session"`
	Bet           betRecord         `json:"bet"`
	Reels         [3]string         `json:"reels"`
	Outcome       string            `json:"outcome"`
	Multiplier    int64             `json:"multiplier"`
	Payout        int64             `json:"payout"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

// SCRUM-78: Spin engine
func spinReel() (string, error) {
	totalWeight := 0
	for _, s := range slotSymbols {
		totalWeight += s.Weight
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(totalWeight)))
	if err != nil {
		return "", err
	}
	cumulative := int64(0)
	for _, s := range slotSymbols {
		cumulative += int64(s.Weight)
		if n.Int64() < cumulative {
			return s.Name, nil
		}
	}
	return slotSymbols[len(slotSymbols)-1].Name, nil
}

func evaluateSlot(reels [3]string) (outcome string, multiplier int64) {
	// Three of a kind
	if reels[0] == reels[1] && reels[1] == reels[2] {
		for _, s := range slotSymbols {
			if s.Name == reels[0] {
				return "win", s.Multiplier
			}
		}
	}
	// Two cherries pays back the bet
	cherryCount := 0
	for _, r := range reels {
		if r == "cherry" {
			cherryCount++
		}
	}
	if cherryCount >= 2 {
		return "win", 1
	}
	return "loss", 0
}

func (a *application) handleSlotSpin(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req slotSpinRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	switch {
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

	var reels [3]string
	for i := range reels {
		reels[i], err = spinReel()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to spin reel")
			return
		}
	}

	outcome, multiplier := evaluateSlot(reels)
	payout := req.Amount * multiplier
	nextBalance := locked.Balance - req.Amount
	if outcome == "win" {
		nextBalance = locked.Balance - req.Amount + payout
	}

	bet := betRecord{
		ID:           mustRandomToken(16),
		Game:         "Slots",
		Choice:       "-",
		Result:       strings.Join(reels[:], ","),
		Amount:       req.Amount,
		Outcome:      outcome,
		BalanceAfter: nextBalance,
		Timestamp:    time.Now().UTC(),
	}

	xpReward := calculateXPReward("slots", req.Amount, outcome, "")
	nextXP := locked.XP + xpReward
	nextGamesPlayed := locked.GamesPlayed + 1

	if _, err := tx.Exec(r.Context(),
		`UPDATE sessions SET balance = $2, xp = $3, games_played = $4, updated_at = NOW() WHERE id = $1`,
		locked.ID, nextBalance, nextXP, nextGamesPlayed,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update balance")
		return
	}

	if _, err := tx.Exec(r.Context(),
		`INSERT INTO bets (id, session_id, game, choice, result, amount, outcome, balance_after, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		bet.ID, locked.ID, bet.Game, bet.Choice, bet.Result,
		bet.Amount, bet.Outcome, bet.BalanceAfter, bet.Timestamp,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record bet")
		return
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, locked.ID, missionProgressEvent{
		Game: "slots", Outcome: outcome, Amount: req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, locked.ID, achievementProgressEvent{
		Game: "slots", Outcome: outcome, Amount: req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if outcome == "win" && multiplier >= 15 {
		if err := a.sendNotificationTx(r.Context(), tx, locked.ID, notificationInput{
			Category: "notification",
			Severity: "success",
			Title:    "Big win on the slots!",
			Message:  fmt.Sprintf("You hit %dx on the reels. +%d credits.", multiplier, payout-req.Amount),
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
		writeError(w, http.StatusInternalServerError, "failed to commit spin")
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
	achievements, err := a.loadAchievements(r.Context(), locked.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload achievements")
		return
	}
	notifications, err := a.loadNotifications(r.Context(), locked.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return
	}

	writeJSON(w, http.StatusOK, slotSpinResponse{
		Session:       toSessionDTO(currentSession),
		Bet:           bet,
		Reels:         reels,
		Outcome:       outcome,
		Multiplier:    multiplier,
		Payout:        payout,
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}
