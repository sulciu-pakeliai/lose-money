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
	diceBetTypeLow    = "low"
	diceBetTypeHigh   = "high"
	diceBetTypeLucky7 = "lucky7"
)

type diceRollRequest struct {
	BetType string `json:"betType"`
	Amount  int64  `json:"amount"`
}

type diceRollSummary struct {
	DieOne           int    `json:"dieOne"`
	DieTwo           int    `json:"dieTwo"`
	Total            int    `json:"total"`
	BetType          string `json:"betType"`
	ProfitMultiplier int64  `json:"profitMultiplier"`
	Won              bool   `json:"won"`
}

type diceRollResponse struct {
	Session       sessionDTO        `json:"session"`
	Bet           betRecord         `json:"bet"`
	Roll          diceRollSummary   `json:"roll"`
	TopUp         topUpPolicy       `json:"topUp"`
	Missions      []missionDTO      `json:"missions"`
	Achievements  []achievementDTO  `json:"achievements"`
	Notifications []notificationDTO `json:"notifications"`
}

type diceResolution struct {
	ChoiceLabel      string
	ResultLabel      string
	Outcome          string
	Status           string
	ProfitMultiplier int64
	Won              bool
}

func (a *application) handleDiceRoll(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req diceRollRequest
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

	req.BetType = normalizeDiceBetType(req.BetType)
	switch {
	case req.BetType == "":
		writeError(w, http.StatusBadRequest, "betType must be low, high, or lucky7")
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

	dieOne, err := randomDie()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to roll first die")
		return
	}
	dieTwo, err := randomDie()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to roll second die")
		return
	}

	resolution := resolveDiceRoll(req.BetType, dieOne, dieTwo)
	nextBalance := lockedSession.Balance - req.Amount
	if resolution.Won {
		nextBalance += req.Amount * (resolution.ProfitMultiplier + 1)
	}

	bet := betRecord{
		ID:           mustRandomToken(16),
		Game:         "Lucky 7",
		Choice:       resolution.ChoiceLabel,
		Result:       resolution.ResultLabel,
		Amount:       req.Amount,
		Outcome:      resolution.Outcome,
		BalanceAfter: nextBalance,
		Timestamp:    time.Now().UTC(),
	}

	nextXP := lockedSession.XP + calculateXPReward("dice", req.Amount, resolution.Outcome, resolution.Status)
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
		Game:    missionScopeDice,
		Outcome: resolution.Outcome,
		Amount:  req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, lockedSession.ID, achievementProgressEvent{
		Game:    missionScopeDice,
		Outcome: resolution.Outcome,
		Amount:  req.Amount,
		Status:  resolution.Status,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if resolution.Won {
		if err := a.sendNotificationTx(r.Context(), tx, lockedSession.ID, buildDiceNotification(bet, resolution)); err != nil {
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
		writeError(w, http.StatusInternalServerError, "failed to commit bet")
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

	writeJSON(w, http.StatusOK, diceRollResponse{
		Session: toSessionDTO(currentSession),
		Bet:     bet,
		Roll: diceRollSummary{
			DieOne:           dieOne,
			DieTwo:           dieTwo,
			Total:            dieOne + dieTwo,
			BetType:          req.BetType,
			ProfitMultiplier: resolution.ProfitMultiplier,
			Won:              resolution.Won,
		},
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func randomDie() (int, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(6))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()) + 1, nil
}

func normalizeDiceBetType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case diceBetTypeLow, "2-6", "low 2-6":
		return diceBetTypeLow
	case diceBetTypeHigh, "8-12", "high 8-12":
		return diceBetTypeHigh
	case diceBetTypeLucky7, "lucky-7", "lucky 7", "7", "exact7", "exact-7":
		return diceBetTypeLucky7
	default:
		return ""
	}
}

func resolveDiceRoll(betType string, dieOne int, dieTwo int) diceResolution {
	total := dieOne + dieTwo
	resultLabel := fmt.Sprintf("%d (%d+%d)", total, dieOne, dieTwo)

	switch betType {
	case diceBetTypeLow:
		return diceResolution{
			ChoiceLabel:      "Low 2-6",
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[total >= 2 && total <= 6],
			Status:           "settled",
			ProfitMultiplier: 1,
			Won:              total >= 2 && total <= 6,
		}
	case diceBetTypeHigh:
		return diceResolution{
			ChoiceLabel:      "High 8-12",
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[total >= 8 && total <= 12],
			Status:           "settled",
			ProfitMultiplier: 1,
			Won:              total >= 8 && total <= 12,
		}
	default:
		won := total == 7
		status := "settled"
		if won {
			status = "exact_seven"
		}
		return diceResolution{
			ChoiceLabel:      "Lucky 7",
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[won],
			Status:           status,
			ProfitMultiplier: 4,
			Won:              won,
		}
	}
}

func buildDiceNotification(history betRecord, resolution diceResolution) notificationInput {
	message := fmt.Sprintf("%s landed on %s. %+d credits hit your stack.", resolution.ChoiceLabel, history.Result, history.Amount*resolution.ProfitMultiplier)
	if resolution.Status == "exact_seven" {
		message = fmt.Sprintf("Lucky 7 connected with %s. %+d credits exploded back onto the table.", history.Result, history.Amount*resolution.ProfitMultiplier)
	}

	return notificationInput{
		Category: "notification",
		Severity: "success",
		Title:    "Lucky 7 paid out",
		Message:  message,
	}
}
