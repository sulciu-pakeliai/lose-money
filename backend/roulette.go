package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	rouletteBetTypeNumber = "number"
	rouletteBetTypeSplit  = "split"
	rouletteBetTypeColor  = "color"
	rouletteColorRed      = "red"
	rouletteColorBlack    = "black"
	rouletteColorGreen    = "green"
)

var rouletteRedNumbers = map[int]struct{}{
	1: {}, 3: {}, 5: {}, 7: {}, 9: {}, 12: {}, 14: {}, 16: {}, 18: {},
	19: {}, 21: {}, 23: {}, 25: {}, 27: {}, 30: {}, 32: {}, 34: {}, 36: {},
}

type rouletteRequest struct {
	BetType string `json:"betType"`
	Choice  string `json:"choice"`
	Amount  int64  `json:"amount"`
}

type rouletteSpinSummary struct {
	Number           int    `json:"number"`
	Color            string `json:"color"`
	BetType          string `json:"betType"`
	Choice           string `json:"choice"`
	ProfitMultiplier int64  `json:"profitMultiplier"`
	Won              bool   `json:"won"`
}

type rouletteResponse struct {
	Session       sessionDTO          `json:"session"`
	Bet           betRecord           `json:"bet"`
	Spin          rouletteSpinSummary `json:"spin"`
	TopUp         topUpPolicy         `json:"topUp"`
	Missions      []missionDTO        `json:"missions"`
	Achievements  []achievementDTO    `json:"achievements"`
	Notifications []notificationDTO   `json:"notifications"`
}

type rouletteResolution struct {
	ChoiceLabel      string
	ResultLabel      string
	Outcome          string
	Status           string
	ProfitMultiplier int64
	Won              bool
}

func (a *application) handleRoulette(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req rouletteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var excluded bool
	excluded, err = a.isSessionExcluded(r.Context(), session.ID)
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

	req.BetType = normalizeRouletteBetType(req.BetType)
	req.Choice = normalizeRouletteChoice(req.Choice)

	switch {
	case req.BetType == "":
		writeError(w, http.StatusBadRequest, "betType must be number or color")
		return
	case req.Choice == "":
		writeError(w, http.StatusBadRequest, "choice must be a number between 0 and 36 or red/black")
		return
	case req.BetType == rouletteBetTypeNumber:
		if _, err := strconv.Atoi(req.Choice); err != nil {
			writeError(w, http.StatusBadRequest, "choice must be a number between 0 and 36 for number bets")
			return
		}
	case req.BetType == rouletteBetTypeSplit:
		parts := strings.Split(req.Choice, ",")
		if len(parts) != 2 {
			writeError(w, http.StatusBadRequest, "choice must be two distinct numbers for split bets")
			return
		}
		left, errLeft := strconv.Atoi(parts[0])
		right, errRight := strconv.Atoi(parts[1])
		if errLeft != nil || errRight != nil || left < 0 || left > 36 || right < 0 || right > 36 || left == right {
			writeError(w, http.StatusBadRequest, "choice must be two distinct numbers between 0 and 36 for split bets")
			return
		}
	case req.BetType == rouletteBetTypeColor && req.Choice != rouletteColorRed && req.Choice != rouletteColorBlack:
		writeError(w, http.StatusBadRequest, "choice must be red or black for color bets")
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

	number, err := randomRouletteNumber()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to spin the wheel")
		return
	}
	color := rouletteColor(number)
	resolution := resolveRouletteSpin(req.BetType, req.Choice, number, color)

	nextBalance := lockedSession.Balance - req.Amount
	if resolution.Won {
		nextBalance += req.Amount * (resolution.ProfitMultiplier + 1)
	}

	bet := betRecord{
		ID:           mustRandomToken(16),
		Game:         "Roulette",
		Choice:       resolution.ChoiceLabel,
		Result:       resolution.ResultLabel,
		Amount:       req.Amount,
		Outcome:      resolution.Outcome,
		BalanceAfter: nextBalance,
		Timestamp:    time.Now().UTC(),
	}

	nextXP := lockedSession.XP + calculateXPReward("roulette", req.Amount, resolution.Outcome, resolution.Status)
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
		Game:    "roulette",
		Outcome: resolution.Outcome,
		Amount:  req.Amount,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update missions")
		return
	}

	if err := a.applyAchievementProgressTx(r.Context(), tx, lockedSession.ID, achievementProgressEvent{
		Game:    "roulette",
		Outcome: resolution.Outcome,
		Amount:  req.Amount,
		Status:  resolution.Status,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update achievements")
		return
	}

	if resolution.Won {
		if err := a.sendNotificationTx(r.Context(), tx, lockedSession.ID, notificationInput{
			Category: "notification",
			Severity: "success",
			Title:    "Roulette hit",
			Message:  fmt.Sprintf("The wheel landed on %s and paid out %+d credits.", resolution.ResultLabel, req.Amount*resolution.ProfitMultiplier),
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

	writeJSON(w, http.StatusOK, rouletteResponse{
		Session: toSessionDTO(currentSession),
		Bet:     bet,
		Spin: rouletteSpinSummary{
			Number:           number,
			Color:            color,
			BetType:          req.BetType,
			Choice:           req.Choice,
			ProfitMultiplier: resolution.ProfitMultiplier,
			Won:              resolution.Won,
		},
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

func randomRouletteNumber() (int, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(37))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()), nil
}

func normalizeRouletteBetType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case rouletteBetTypeNumber, "num", "single", "specific", "specific number":
		return rouletteBetTypeNumber
	case rouletteBetTypeSplit, "two", "pair", "two numbers", "exact pair":
		return rouletteBetTypeSplit
	case rouletteBetTypeColor, "colour", "red", "black":
		return rouletteBetTypeColor
	default:
		return ""
	}
}

func normalizeRouletteChoice(raw string) string {
	value := strings.TrimSpace(strings.ToLower(raw))
	switch value {
	case rouletteColorRed, rouletteColorBlack:
		return value
	}

	if strings.ContainsAny(value, ",/- ") {
		normalized := strings.NewReplacer(",", " ", "-", " ", "/", " ").Replace(value)
		parts := strings.Fields(normalized)
		if len(parts) == 2 {
			numberA, errA := strconv.Atoi(parts[0])
			numberB, errB := strconv.Atoi(parts[1])
			if errA == nil && errB == nil && numberA >= 0 && numberA <= 36 && numberB >= 0 && numberB <= 36 && numberA != numberB {
				return fmt.Sprintf("%d,%d", numberA, numberB)
			}
		}
	}

	number, err := strconv.Atoi(value)
	if err != nil {
		return ""
	}
	if number < 0 || number > 36 {
		return ""
	}
	if value != strconv.Itoa(number) {
		return ""
	}
	return strconv.Itoa(number)
}

func resolveRouletteSpin(betType string, choice string, number int, color string) rouletteResolution {
	resultLabel := fmt.Sprintf("%d %s", number, strings.Title(color))

	switch betType {
	case rouletteBetTypeNumber:
		selectedNumber := -1
		fmt.Sscanf(choice, "%d", &selectedNumber)
		won := selectedNumber == number
		status := "settled"
		if won {
			status = "number_hit"
		}
		return rouletteResolution{
			ChoiceLabel:      fmt.Sprintf("Number %d", selectedNumber),
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[won],
			Status:           status,
			ProfitMultiplier: 35,
			Won:              won,
		}
	case rouletteBetTypeSplit:
		parts := strings.Split(choice, ",")
		left, right := -1, -1
		fmt.Sscanf(parts[0], "%d", &left)
		fmt.Sscanf(parts[1], "%d", &right)
		won := left == number || right == number
		status := "settled"
		if won {
			status = "split_hit"
		}
		return rouletteResolution{
			ChoiceLabel:      fmt.Sprintf("Split %d/%d", left, right),
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[won],
			Status:           status,
			ProfitMultiplier: 17,
			Won:              won,
		}
	case rouletteBetTypeColor:
		won := number != 0 && choice == color
		status := "settled"
		if won {
			status = fmt.Sprintf("%s_win", choice)
		}
		return rouletteResolution{
			ChoiceLabel:      strings.Title(choice),
			ResultLabel:      resultLabel,
			Outcome:          map[bool]string{true: "win", false: "loss"}[won],
			Status:           status,
			ProfitMultiplier: 1,
			Won:              won,
		}
	default:
		return rouletteResolution{
			ChoiceLabel:      choice,
			ResultLabel:      resultLabel,
			Outcome:          "loss",
			Status:           "settled",
			ProfitMultiplier: 0,
			Won:              false,
		}
	}
}

func rouletteColor(number int) string {
	if number == 0 {
		return rouletteColorGreen
	}
	if _, ok := rouletteRedNumbers[number]; ok {
		return rouletteColorRed
	}
	return rouletteColorBlack
}
