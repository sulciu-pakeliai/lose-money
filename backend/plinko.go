package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

const (
	plinkoRiskLow    = "low"
	plinkoRiskMedium = "medium"
	plinkoRiskHigh   = "high"
	plinkoRows       = 12
)

var plinkoMultipliersCents = map[string][]int64{
	plinkoRiskLow:    {500, 300, 200, 130, 110, 80, 50, 80, 110, 130, 200, 300, 500},
	plinkoRiskMedium: {1600, 800, 400, 200, 140, 60, 30, 60, 140, 200, 400, 800, 1600},
	plinkoRiskHigh:   {5000, 2000, 800, 300, 150, 40, 20, 40, 150, 300, 800, 2000, 5000},
}

type plinkoDropRequest struct {
	Amount int64  `json:"amount"`
	Risk   string `json:"risk"`
}

type plinkoDropSummary struct {
	Risk       string  `json:"risk"`
	Rows       int     `json:"rows"`
	Path       []int   `json:"path"`
	FinalSlot  int     `json:"finalSlot"`
	Multiplier float64 `json:"multiplier"`
	Payout     int64   `json:"payout"`
	Outcome    string  `json:"outcome"`
}

type plinkoDropResponse struct {
	Session       sessionDTO        `json:"session"`
	Bet           betRecord         `json:"bet"`
	Drop          plinkoDropSummary `json:"drop"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

func (a *application) handlePlinkoDrop(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req plinkoDropRequest
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

	req.Risk = normalizePlinkoRisk(req.Risk)
	switch {
	case req.Risk == "":
		writeError(w, http.StatusBadRequest, "risk must be low, medium, or high")
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

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}
	if req.Amount > lockedSession.Balance {
		writeError(w, http.StatusBadRequest, "not enough balance for that bet")
		return
	}

	path, finalSlot, err := randomPlinkoPath(plinkoRows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to drop plinko ball")
		return
	}

	multiplierCents := plinkoMultipliersCents[req.Risk][finalSlot]
	payout := req.Amount * multiplierCents / 100
	outcome := resolvePlinkoOutcome(req.Amount, payout)
	status := ""
	if multiplierCents >= 800 {
		status = "edge_bucket"
	}

	nextBalance := lockedSession.Balance - req.Amount + payout
	bet := betRecord{
		ID:           mustRandomToken(16),
		Game:         "Plinko",
		Choice:       plinkoRiskLabel(req.Risk) + " risk",
		Result:       fmt.Sprintf("Slot %d - %.2fx", finalSlot+1, float64(multiplierCents)/100),
		Amount:       req.Amount,
		Outcome:      outcome,
		BalanceAfter: nextBalance,
		Timestamp:    time.Now().UTC(),
	}

	nextXP := lockedSession.XP + calculateXPReward("plinko", req.Amount, outcome, status)
	nextGamesPlayed := lockedSession.GamesPlayed + 1
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, nextBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update balance")
		return
	}

	if err := a.insertBetHistory(r.Context(), tx, lockedSession.ID, &bet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record bet")
		return
	}

	if err := a.applyMissionProgressTx(r.Context(), tx, lockedSession.ID, missionProgressEvent{
		Game:    missionScopePlinko,
		Outcome: outcome,
		Amount:  req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, lockedSession.ID, achievementProgressEvent{
		Game:    missionScopePlinko,
		Outcome: outcome,
		Amount:  req.Amount,
		Status:  status,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if outcome == "win" && multiplierCents >= 800 {
		if err := a.sendNotificationTx(r.Context(), tx, lockedSession.ID, notificationInput{
			Category: "notification",
			Severity: "success",
			Title:    "Plinko edge bucket",
			Message:  fmt.Sprintf("A %.2fx Plinko hit paid %d credits.", float64(multiplierCents)/100, payout),
		}); err != nil {
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
		writeError(w, http.StatusInternalServerError, "failed to commit drop")
		return
	}

	currentSession, err := a.loadSession(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session")
		return
	}
	missions, err := a.loadDailyMissions(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload missions")
		return
	}
	achievements, err := a.loadAchievements(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload achievements")
		return
	}
	notifications, err := a.loadNotifications(r.Context(), lockedSession.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return
	}

	writeJSON(w, http.StatusOK, plinkoDropResponse{
		Session: toSessionDTO(currentSession),
		Bet:     bet,
		Drop: plinkoDropSummary{
			Risk:       req.Risk,
			Rows:       plinkoRows,
			Path:       path,
			FinalSlot:  finalSlot,
			Multiplier: float64(multiplierCents) / 100,
			Payout:     payout,
			Outcome:    outcome,
		},
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func normalizePlinkoRisk(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", plinkoRiskMedium, "normal":
		return plinkoRiskMedium
	case plinkoRiskLow:
		return plinkoRiskLow
	case plinkoRiskHigh:
		return plinkoRiskHigh
	default:
		return ""
	}
}

func randomPlinkoPath(rows int) ([]int, int, error) {
	path := make([]int, 0, rows)
	finalSlot := 0
	for i := 0; i < rows; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(2))
		if err != nil {
			return nil, 0, err
		}
		if n.Int64() == 0 {
			path = append(path, -1)
			continue
		}
		path = append(path, 1)
		finalSlot++
	}
	return path, finalSlot, nil
}

func resolvePlinkoOutcome(amount int64, payout int64) string {
	switch {
	case payout > amount:
		return "win"
	case payout == amount:
		return "push"
	default:
		return "loss"
	}
}

func plinkoRiskLabel(risk string) string {
	switch risk {
	case plinkoRiskLow:
		return "Low"
	case plinkoRiskHigh:
		return "High"
	default:
		return "Medium"
	}
}
