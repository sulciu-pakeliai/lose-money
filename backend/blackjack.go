package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type blackjackCard struct {
	Rank string `json:"rank"`
	Suit string `json:"suit"`
}

type blackjackGame struct {
	ID          string
	SessionID   string
	BetAmount   int64
	Deck        []blackjackCard
	PlayerCards []blackjackCard
	DealerCards []blackjackCard
	SplitCards  []blackjackCard
	SplitBet    int64
	ActiveHand  int // 0 = main, 1 = split
	Status      string
	SplitStatus string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	CompletedAt *time.Time
}

type blackjackGameState struct {
	ID                string          `json:"id"`
	BetAmount         int64           `json:"betAmount"`
	PlayerCards       []blackjackCard `json:"playerCards"`
	DealerCards       []blackjackCard `json:"dealerCards"`
	SplitCards        []blackjackCard `json:"splitCards,omitempty"`
	SplitBet          int64           `json:"splitBet,omitempty"`
	ActiveHand        int             `json:"activeHand"`
	DealerHiddenCount int             `json:"dealerHiddenCount"`
	PlayerTotal       int             `json:"playerTotal"`
	DealerTotal       int             `json:"dealerTotal"`
	SplitTotal        int             `json:"splitTotal,omitempty"`
	SplitStatus       string          `json:"splitStatus,omitempty"`
	Status            string          `json:"status"`
	Message           string          `json:"message"`
	CanHit            bool            `json:"canHit"`
	CanStand          bool            `json:"canStand"`
	CanSplit          bool            `json:"canSplit"`
	IsComplete        bool            `json:"isComplete"`
	CompletedAt       *time.Time      `json:"completedAt,omitempty"`
}

type blackjackStartRequest struct {
	Amount int64 `json:"amount"`
}

type blackjackActionResponse struct {
	Session       sessionDTO          `json:"session"`
	Blackjack     *blackjackGameState `json:"blackjack"`
	TopUp         topUpPolicy         `json:"topUp"`
	Missions      []missionDTO        `json:"missions"`
	Achievements  []achievementDTO    `json:"achievements"`
	Notifications []notificationDTO   `json:"notifications"`
	HistoryEntry  *betRecord          `json:"historyEntry,omitempty"`
}

type blackjackOutcome struct {
	Status  string
	Message string
	Payout  int64
	Outcome string
	Choice  string
	Result  string
}

type blackjackScore struct {
	Total       int
	IsSoft      bool
	IsBust      bool
	IsBlackjack bool
}

func (a *application) handleBlackjackStart(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req blackjackStartRequest
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

	activeGame, err := a.loadActiveBlackjackTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check current blackjack hand")
		return
	}
	if activeGame != nil {
		writeError(w, http.StatusConflict, "finish the current blackjack hand before starting a new one")
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

	deck, err := shuffledDeck()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to shuffle deck")
		return
	}

	playerCards, deck := drawCards(deck, 2)
	dealerCards, deck := drawCards(deck, 2)
	balanceAfterBet := lockedSession.Balance - req.Amount

	now := time.Now().UTC()
	game := &blackjackGame{
		ID:          mustRandomToken(16),
		SessionID:   session.ID,
		BetAmount:   req.Amount,
		Deck:        deck,
		PlayerCards: playerCards,
		DealerCards: dealerCards,
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	var historyEntry *betRecord
	finalBalance := balanceAfterBet
	nextXP := lockedSession.XP
	nextGamesPlayed := lockedSession.GamesPlayed

	playerScore := scoreBlackjackHand(game.PlayerCards)
	dealerScore := scoreBlackjackHand(game.DealerCards)
	if playerScore.IsBlackjack || dealerScore.IsBlackjack {
		outcome := settleNaturalBlackjack(game, playerScore, dealerScore)
		game.Status = outcome.Status
		game.CompletedAt = &now
		finalBalance += outcome.Payout
		nextXP += calculateXPReward("blackjack", game.BetAmount, outcome.Outcome, outcome.Status)
		nextGamesPlayed++
		historyEntry = buildBlackjackHistory(game, finalBalance, outcome)
	}

	if err := a.insertBlackjackGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create blackjack hand")
		return
	}

	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, finalBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reserve blackjack bet")
		return
	}

	if historyEntry != nil {
		if err := a.insertBetHistory(r.Context(), tx, session.ID, historyEntry); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to record blackjack result")
			return
		}
		if err := a.applyMissionProgressTx(r.Context(), tx, lockedSession.ID, missionProgressEvent{
			Game: "blackjack", Outcome: historyEntry.Outcome, Amount: game.BetAmount,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update missions")
			return
		}
		if err := a.applyAchievementProgressTx(r.Context(), tx, lockedSession.ID, achievementProgressEvent{
			Game: "blackjack", Outcome: historyEntry.Outcome, Amount: game.BetAmount, Status: game.Status,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update achievements")
			return
		}
		if err := a.sendNotificationTx(r.Context(), tx, lockedSession.ID, buildBlackjackNotification(*historyEntry)); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to queue notification")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit blackjack hand")
		return
	}

	currentSession, err := a.loadSession(r.Context(), lockedSession.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to refresh session")
		return
	}
	missions, _ := a.loadDailyMissions(r.Context(), lockedSession.ID)
	achievements, _ := a.loadAchievements(r.Context(), lockedSession.ID)
	notifications, _ := a.loadNotifications(r.Context(), lockedSession.ID, notificationLimit)

	writeJSON(w, http.StatusOK, blackjackActionResponse{
		Session:       toSessionDTO(currentSession),
		Blackjack:     toBlackjackGameState(game),
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
		HistoryEntry:  historyEntry,
	})
}

func (a *application) handleBlackjackHit(w http.ResponseWriter, r *http.Request) {
	a.handleBlackjackAction(w, r, "hit")
}

func (a *application) handleBlackjackStand(w http.ResponseWriter, r *http.Request) {
	a.handleBlackjackAction(w, r, "stand")
}

func (a *application) handleBlackjackAction(w http.ResponseWriter, r *http.Request, action string) {
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

	game, err := a.loadActiveBlackjackTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load blackjack hand")
		return
	}
	if game == nil {
		writeError(w, http.StatusConflict, "there is no active blackjack hand")
		return
	}

	var historyEntry *betRecord

	// Route action to the correct hand
	if game.ActiveHand == 1 {
		historyEntry, err = a.handleSplitHandAction(r.Context(), tx, session, game, action)
	} else {
		historyEntry, err = a.handleMainHandAction(r.Context(), tx, session, game, action)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit blackjack action")
		return
	}

	currentSession, err := a.loadSession(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to refresh session")
		return
	}
	missions, _ := a.loadDailyMissions(r.Context(), session.ID)
	achievements, _ := a.loadAchievements(r.Context(), session.ID)
	notifications, _ := a.loadNotifications(r.Context(), session.ID, notificationLimit)

	writeJSON(w, http.StatusOK, blackjackActionResponse{
		Session:       toSessionDTO(currentSession),
		Blackjack:     toBlackjackGameState(game),
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
		HistoryEntry:  historyEntry,
	})
}

// handleMainHandAction processes hit/stand on the main hand (ActiveHand == 0).
// When the main hand finishes, it transitions to the split hand if one exists,
// otherwise it settles the full game.
func (a *application) handleMainHandAction(
	ctx context.Context,
	tx pgx.Tx,
	session sessionRecord,
	game *blackjackGame,
	action string,
) (*betRecord, error) {
	if action == "hit" {
		card, nextDeck, err := drawCard(game.Deck)
		if err != nil {
			return nil, fmt.Errorf("failed to draw card: %w", err)
		}
		game.PlayerCards = append(game.PlayerCards, card)
		game.Deck = nextDeck
		game.UpdatedAt = time.Now().UTC()

		score := scoreBlackjackHand(game.PlayerCards)
		if score.IsBust {
			game.Status = "player_bust"
			if len(game.SplitCards) > 0 {
				game.UpdatedAt = time.Now().UTC()
				if err := a.updateBlackjackGame(ctx, tx, game); err != nil {
					return nil, fmt.Errorf("failed to update blackjack hand: %w", err)
				}
				return a.transitionToSplitHand(ctx, tx, session, game)
			}
			return a.finishBlackjackHand(ctx, tx, session, game, blackjackOutcome{
				Status:  "player_bust",
				Message: "Bust. Dealer wins.",
				Payout:  0,
				Outcome: "loss",
				Choice:  fmt.Sprintf("Player %d", score.Total),
				Result:  "Bust",
			})
		}
		if score.Total == 21 {
			if len(game.SplitCards) > 0 {
				return a.transitionToSplitHand(ctx, tx, session, game)
			}
			return a.finishBlackjackHand(ctx, tx, session, game, settleDealerTurn(game))
		}
		return nil, a.updateBlackjackGame(ctx, tx, game)
	}

	// stand
	if len(game.SplitCards) > 0 {
		return a.transitionToSplitHand(ctx, tx, session, game)
	}
	return a.finishBlackjackHand(ctx, tx, session, game, settleDealerTurn(game))
}

// handleSplitHandAction processes hit/stand on the split hand (ActiveHand == 1).
func (a *application) handleSplitHandAction(
	ctx context.Context,
	tx pgx.Tx,
	session sessionRecord,
	game *blackjackGame,
	action string,
) (*betRecord, error) {
	if action == "hit" {
		card, nextDeck, err := drawCard(game.Deck)
		if err != nil {
			return nil, fmt.Errorf("failed to draw card: %w", err)
		}
		game.SplitCards = append(game.SplitCards, card)
		game.Deck = nextDeck
		game.UpdatedAt = time.Now().UTC()

		score := scoreBlackjackHand(game.SplitCards)
		if score.IsBust {
			game.SplitStatus = "player_bust"
			return a.settleBothHands(ctx, tx, session, game)
		}
		if score.Total == 21 {
			return a.settleBothHands(ctx, tx, session, game)
		}
		return nil, a.updateBlackjackGame(ctx, tx, game)
	}

	// stand on split hand — settle everything
	return a.settleBothHands(ctx, tx, session, game)
}

// transitionToSplitHand moves play from the main hand to the split hand.
func (a *application) transitionToSplitHand(
	ctx context.Context,
	tx pgx.Tx,
	_ sessionRecord,
	game *blackjackGame,
) (*betRecord, error) {
	game.ActiveHand = 1
	game.UpdatedAt = time.Now().UTC()
	return nil, a.updateBlackjackGame(ctx, tx, game)
}

// settleBothHands runs the dealer turn once and settles both the main hand
// and the split hand independently, recording two history entries and paying
// out both. Only the last history entry is returned to the client for display.
func (a *application) settleBothHands(
	ctx context.Context,
	tx pgx.Tx,
	session sessionRecord,
	game *blackjackGame,
) (*betRecord, error) {
	// Run dealer turn (mutates game.DealerCards / game.Deck)
	dealerOutcome := settleDealerTurn(game)
	dealerScore := scoreBlackjackHand(game.DealerCards)

	// Settle main hand
	var mainOutcome blackjackOutcome
	mainScore := scoreBlackjackHand(game.PlayerCards)
	switch {
	case game.Status == "player_bust":
		mainOutcome = blackjackOutcome{
			Status:  "player_bust",
			Message: "Main hand bust.",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Player %d", mainScore.Total),
			Result:  "Bust",
		}
	case dealerScore.IsBust:
		mainOutcome = blackjackOutcome{
			Status:  "dealer_bust",
			Payout:  game.BetAmount * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Player %d", mainScore.Total),
			Result:  "Dealer bust",
		}
	case mainScore.Total > dealerScore.Total:
		mainOutcome = blackjackOutcome{
			Status:  "player_win",
			Payout:  game.BetAmount * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Player %d", mainScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	case mainScore.Total == dealerScore.Total:
		mainOutcome = blackjackOutcome{
			Status:  "push",
			Payout:  game.BetAmount,
			Outcome: "push",
			Choice:  fmt.Sprintf("Player %d", mainScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		mainOutcome = blackjackOutcome{
			Status:  "dealer_win",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Player %d", mainScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	}

	// Settle split hand
	var splitOutcome blackjackOutcome
	splitScore := scoreBlackjackHand(game.SplitCards)
	switch {
	case game.SplitStatus == "player_bust":
		splitOutcome = blackjackOutcome{
			Status:  "player_bust",
			Message: "Split hand bust.",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Split %d", splitScore.Total),
			Result:  "Bust",
		}
	case dealerScore.IsBust:
		splitOutcome = blackjackOutcome{
			Status:  "dealer_bust",
			Payout:  game.SplitBet * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Split %d", splitScore.Total),
			Result:  "Dealer bust",
		}
	case splitScore.Total > dealerScore.Total:
		splitOutcome = blackjackOutcome{
			Status:  "player_win",
			Payout:  game.SplitBet * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Split %d", splitScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	case splitScore.Total == dealerScore.Total:
		splitOutcome = blackjackOutcome{
			Status:  "push",
			Payout:  game.SplitBet,
			Outcome: "push",
			Choice:  fmt.Sprintf("Split %d", splitScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		splitOutcome = blackjackOutcome{
			Status:  "dealer_win",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Split %d", splitScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	}

	// Use the dealer outcome status as the overall game status
	game.Status = dealerOutcome.Status
	game.SplitStatus = splitOutcome.Status

	now := time.Now().UTC()
	game.UpdatedAt = now
	game.CompletedAt = &now

	if err := a.updateBlackjackGame(ctx, tx, game); err != nil {
		return nil, fmt.Errorf("failed to update blackjack hand: %w", err)
	}

	lockedSession, err := a.lockSession(ctx, tx, session.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to lock session: %w", err)
	}

	totalPayout := mainOutcome.Payout + splitOutcome.Payout
	finalBalance := lockedSession.Balance + totalPayout
	xpGain := calculateXPReward("blackjack", game.BetAmount, mainOutcome.Outcome, game.Status) +
		calculateXPReward("blackjack", game.SplitBet, splitOutcome.Outcome, splitOutcome.Status)
	nextGamesPlayed := lockedSession.GamesPlayed + 1

	if err := a.updateSessionBalance(ctx, tx, lockedSession.ID, finalBalance, lockedSession.XP+xpGain, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		return nil, fmt.Errorf("failed to settle session balance: %w", err)
	}

	// Record main hand history
	mainHistory := buildBlackjackHistory(game, finalBalance, mainOutcome)
	if err := a.insertBetHistory(ctx, tx, session.ID, mainHistory); err != nil {
		return nil, fmt.Errorf("failed to record main hand history: %w", err)
	}

	// Record split hand history (reuse game but with SplitBet)
	splitGame := *game
	splitGame.BetAmount = game.SplitBet
	splitHistory := buildBlackjackHistory(&splitGame, finalBalance, splitOutcome)
	if err := a.insertBetHistory(ctx, tx, session.ID, splitHistory); err != nil {
		return nil, fmt.Errorf("failed to record split hand history: %w", err)
	}

	if err := a.applyMissionProgressTx(ctx, tx, session.ID, missionProgressEvent{
		Game: "blackjack", Outcome: mainOutcome.Outcome, Amount: game.BetAmount,
	}); err != nil {
		return nil, fmt.Errorf("failed to update missions: %w", err)
	}
	if err := a.applyAchievementProgressTx(ctx, tx, session.ID, achievementProgressEvent{
		Game: "blackjack", Outcome: mainOutcome.Outcome, Amount: game.BetAmount, Status: game.Status,
	}); err != nil {
		return nil, fmt.Errorf("failed to update achievements: %w", err)
	}
	if err := a.sendNotificationTx(ctx, tx, session.ID, buildBlackjackSplitNotification(*mainHistory, *splitHistory)); err != nil {
		return nil, fmt.Errorf("failed to queue notification: %w", err)
	}

	return splitHistory, nil
}

func (a *application) handleBlackjackSplit(w http.ResponseWriter, r *http.Request) {
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

	game, err := a.loadActiveBlackjackTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load blackjack hand")
		return
	}
	if game == nil {
		writeError(w, http.StatusConflict, "there is no active blackjack hand")
		return
	}
	if !canSplit(game) {
		writeError(w, http.StatusBadRequest, "hand cannot be split")
		return
	}

	lockedSession, err := a.lockSession(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock session")
		return
	}
	if game.BetAmount > lockedSession.Balance {
		writeError(w, http.StatusBadRequest, "not enough balance to split")
		return
	}

	// Move second card to split hand, deal one new card to each hand
	splitCard := game.PlayerCards[1]
	game.PlayerCards = game.PlayerCards[:1]

	newMainCard, deck, err := drawCard(game.Deck)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to draw card")
		return
	}
	game.Deck = deck

	newSplitCard, deck, err := drawCard(game.Deck)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to draw card")
		return
	}
	game.Deck = deck

	game.PlayerCards = append(game.PlayerCards, newMainCard)
	game.SplitCards = []blackjackCard{splitCard, newSplitCard}
	game.SplitBet = game.BetAmount
	game.ActiveHand = 0
	game.UpdatedAt = time.Now().UTC()

	// Deduct the split bet from balance
	newBalance := lockedSession.Balance - game.SplitBet
	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, newBalance, lockedSession.XP, lockedSession.GamesPlayed, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to deduct split bet")
		return
	}

	if err := a.updateBlackjackGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save split")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit split")
		return
	}

	currentSession, err := a.loadSession(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to refresh session")
		return
	}
	missions, _ := a.loadDailyMissions(r.Context(), session.ID)
	achievements, _ := a.loadAchievements(r.Context(), session.ID)
	notifications, _ := a.loadNotifications(r.Context(), session.ID, notificationLimit)

	writeJSON(w, http.StatusOK, blackjackActionResponse{
		Session:       toSessionDTO(currentSession),
		Blackjack:     toBlackjackGameState(game),
		TopUp:         buildTopUpPolicy(currentSession.LastTopUpAt),
		Missions:      missions,
		Achievements:  achievements,
		Notifications: notifications,
	})
}

// canSplit returns true when the player's first two cards have the same rank
// and no split hand has been created yet.
func canSplit(game *blackjackGame) bool {
	return len(game.PlayerCards) == 2 &&
		len(game.SplitCards) == 0 &&
		game.PlayerCards[0].Rank == game.PlayerCards[1].Rank
}

func (a *application) finishBlackjackHand(
	ctx context.Context,
	tx pgx.Tx,
	session sessionRecord,
	game *blackjackGame,
	outcome blackjackOutcome,
) (*betRecord, error) {
	now := time.Now().UTC()
	game.Status = outcome.Status
	game.UpdatedAt = now
	game.CompletedAt = &now

	if err := a.updateBlackjackGame(ctx, tx, game); err != nil {
		return nil, fmt.Errorf("failed to update blackjack hand: %w", err)
	}

	lockedSession, err := a.lockSession(ctx, tx, session.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to lock session: %w", err)
	}

	finalBalance := lockedSession.Balance + outcome.Payout
	nextXP := lockedSession.XP + calculateXPReward("blackjack", game.BetAmount, outcome.Outcome, outcome.Status)
	nextGamesPlayed := lockedSession.GamesPlayed + 1
	if err := a.updateSessionBalance(ctx, tx, lockedSession.ID, finalBalance, nextXP, nextGamesPlayed, lockedSession.LastTopUpAt); err != nil {
		return nil, fmt.Errorf("failed to settle session balance: %w", err)
	}

	historyEntry := buildBlackjackHistory(game, finalBalance, outcome)
	if err := a.insertBetHistory(ctx, tx, session.ID, historyEntry); err != nil {
		return nil, fmt.Errorf("failed to record blackjack history: %w", err)
	}

	if err := a.applyMissionProgressTx(ctx, tx, session.ID, missionProgressEvent{
		Game: "blackjack", Outcome: outcome.Outcome, Amount: game.BetAmount,
	}); err != nil {
		return nil, fmt.Errorf("failed to update missions: %w", err)
	}
	if err := a.applyAchievementProgressTx(ctx, tx, session.ID, achievementProgressEvent{
		Game: "blackjack", Outcome: outcome.Outcome, Amount: game.BetAmount, Status: outcome.Status,
	}); err != nil {
		return nil, fmt.Errorf("failed to update achievements: %w", err)
	}
	if err := a.sendNotificationTx(ctx, tx, session.ID, buildBlackjackNotification(*historyEntry)); err != nil {
		return nil, fmt.Errorf("failed to queue notification: %w", err)
	}

	return historyEntry, nil
}

func (a *application) loadActiveBlackjack(ctx context.Context, sessionID string) (*blackjackGameState, error) {
	game, err := a.loadActiveBlackjackRecord(ctx, a.db, sessionID)
	if err != nil {
		return nil, err
	}
	return toBlackjackGameState(game), nil
}

func (a *application) loadActiveBlackjackTx(ctx context.Context, tx pgx.Tx, sessionID string) (*blackjackGame, error) {
	query := `SELECT id, session_id, bet_amount, deck, player_cards, dealer_cards,
		        split_cards, split_bet, active_hand, status, split_status,
		        created_at, updated_at, completed_at
	          FROM blackjack_games
	          WHERE session_id = $1 AND status = 'active'
	          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
	return scanBlackjackGame(tx.QueryRow(ctx, query, sessionID))
}

type blackjackQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (a *application) loadActiveBlackjackRecord(ctx context.Context, queryer blackjackQueryer, sessionID string) (*blackjackGame, error) {
	query := `SELECT id, session_id, bet_amount, deck, player_cards, dealer_cards,
		        split_cards, split_bet, active_hand, status, split_status,
		        created_at, updated_at, completed_at
	          FROM blackjack_games
	          WHERE session_id = $1 AND status = 'active'
	          ORDER BY created_at DESC LIMIT 1`
	return scanBlackjackGame(queryer.QueryRow(ctx, query, sessionID))
}

func scanBlackjackGame(row pgx.Row) (*blackjackGame, error) {
	var game blackjackGame
	var deckJSON, playerJSON, dealerJSON, splitJSON []byte
	err := row.Scan(
		&game.ID,
		&game.SessionID,
		&game.BetAmount,
		&deckJSON,
		&playerJSON,
		&dealerJSON,
		&splitJSON,
		&game.SplitBet,
		&game.ActiveHand,
		&game.Status,
		&game.SplitStatus,
		&game.CreatedAt,
		&game.UpdatedAt,
		&game.CompletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(deckJSON, &game.Deck); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(playerJSON, &game.PlayerCards); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(dealerJSON, &game.DealerCards); err != nil {
		return nil, err
	}
	if len(splitJSON) > 0 {
		if err := json.Unmarshal(splitJSON, &game.SplitCards); err != nil {
			return nil, err
		}
	}
	if game.SplitCards == nil {
		game.SplitCards = []blackjackCard{}
	}

	return &game, nil
}

func (a *application) insertBlackjackGame(ctx context.Context, tx pgx.Tx, game *blackjackGame) error {
	deckJSON, _ := json.Marshal(game.Deck)
	playerJSON, _ := json.Marshal(game.PlayerCards)
	dealerJSON, _ := json.Marshal(game.DealerCards)
	splitJSON, _ := json.Marshal(game.SplitCards)

	_, err := tx.Exec(ctx,
		`INSERT INTO blackjack_games
		   (id, session_id, bet_amount, deck, player_cards, dealer_cards,
		    split_cards, split_bet, active_hand, status, split_status,
		    created_at, updated_at, completed_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		game.ID, game.SessionID, game.BetAmount,
		deckJSON, playerJSON, dealerJSON,
		splitJSON, game.SplitBet, game.ActiveHand,
		game.Status, game.SplitStatus,
		game.CreatedAt, game.UpdatedAt, game.CompletedAt,
	)
	return err
}

func (a *application) updateBlackjackGame(ctx context.Context, tx pgx.Tx, game *blackjackGame) error {
	deckJSON, _ := json.Marshal(game.Deck)
	playerJSON, _ := json.Marshal(game.PlayerCards)
	dealerJSON, _ := json.Marshal(game.DealerCards)
	splitJSON, _ := json.Marshal(game.SplitCards)

	_, err := tx.Exec(ctx,
		`UPDATE blackjack_games
		 SET deck=$2, player_cards=$3, dealer_cards=$4,
		     split_cards=$5, split_bet=$6, active_hand=$7,
		     status=$8, split_status=$9,
		     updated_at=$10, completed_at=$11
		 WHERE id=$1`,
		game.ID,
		deckJSON, playerJSON, dealerJSON,
		splitJSON, game.SplitBet, game.ActiveHand,
		game.Status, game.SplitStatus,
		game.UpdatedAt, game.CompletedAt,
	)
	return err
}

func (a *application) lockSession(ctx context.Context, tx pgx.Tx, sessionID string) (sessionRecord, error) {
	var session sessionRecord
	err := tx.QueryRow(ctx,
		`SELECT id, balance, xp, games_played, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.XP, &session.GamesPlayed, &session.CreatedAt, &session.LastTopUpAt)
	return session, err
}

func (a *application) loadSessionTx(ctx context.Context, tx pgx.Tx, sessionID string) (sessionRecord, error) {
	var session sessionRecord
	err := tx.QueryRow(ctx,
		`SELECT id, balance, xp, games_played, created_at, last_top_up_at FROM sessions WHERE id = $1`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.XP, &session.GamesPlayed, &session.CreatedAt, &session.LastTopUpAt)
	return session, err
}

func (a *application) updateSessionBalance(
	ctx context.Context, tx pgx.Tx, sessionID string,
	balance, xp, gamesPlayed int64, lastTopUpAt *time.Time,
) error {
	_, err := tx.Exec(ctx,
		`UPDATE sessions SET balance=$2, xp=$3, games_played=$4, updated_at=NOW(), last_top_up_at=$5 WHERE id=$1`,
		sessionID, balance, xp, gamesPlayed, lastTopUpAt,
	)
	return err
}

func (a *application) insertBetHistory(ctx context.Context, tx pgx.Tx, sessionID string, record *betRecord) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO bets (id, session_id, game, choice, result, amount, outcome, balance_after, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		record.ID, sessionID, record.Game, record.Choice, record.Result,
		record.Amount, record.Outcome, record.BalanceAfter, record.Timestamp,
	)
	return err
}

func toBlackjackGameState(game *blackjackGame) *blackjackGameState {
	if game == nil {
		return nil
	}

	playerScore := scoreBlackjackHand(game.PlayerCards)
	isComplete := game.Status != "active"
	dealerCards := game.DealerCards
	dealerTotal := scoreBlackjackHand(game.DealerCards).Total
	hiddenCount := 0

	if !isComplete && len(game.DealerCards) > 0 {
		dealerCards = game.DealerCards[:1]
		dealerTotal = scoreBlackjackHand(dealerCards).Total
		hiddenCount = len(game.DealerCards) - 1
	}

	state := &blackjackGameState{
		ID:                game.ID,
		BetAmount:         game.BetAmount,
		PlayerCards:       game.PlayerCards,
		DealerCards:       dealerCards,
		DealerHiddenCount: hiddenCount,
		PlayerTotal:       playerScore.Total,
		DealerTotal:       dealerTotal,
		ActiveHand:        game.ActiveHand,
		Status:            game.Status,
		Message:           blackjackStatusMessage(game.Status),
		CanHit:            !isComplete,
		CanStand:          !isComplete,
		CanSplit:          !isComplete && canSplit(game),
		IsComplete:        isComplete,
		CompletedAt:       game.CompletedAt,
	}

	if len(game.SplitCards) > 0 {
		splitScore := scoreBlackjackHand(game.SplitCards)
		state.SplitCards = game.SplitCards
		state.SplitBet = game.SplitBet
		state.SplitTotal = splitScore.Total
		state.SplitStatus = game.SplitStatus
	}

	return state
}

func blackjackStatusMessage(status string) string {
	switch status {
	case "blackjack":
		return "Blackjack pays 3:2."
	case "player_bust":
		return "Bust. Dealer wins."
	case "dealer_bust":
		return "Dealer busts. You win."
	case "player_win":
		return "You beat the dealer."
	case "dealer_win":
		return "Dealer wins the hand."
	case "push":
		return "Push. Your bet is returned."
	default:
		return "Hit or stand."
	}
}

func settleNaturalBlackjack(game *blackjackGame, playerScore, dealerScore blackjackScore) blackjackOutcome {
	switch {
	case playerScore.IsBlackjack && dealerScore.IsBlackjack:
		return blackjackOutcome{
			Status: "push", Message: "Both sides have blackjack. Push.",
			Payout: game.BetAmount, Outcome: "push",
			Choice: "Player blackjack", Result: "Dealer blackjack",
		}
	case playerScore.IsBlackjack:
		return blackjackOutcome{
			Status: "blackjack", Message: "Blackjack pays 3:2.",
			Payout: (game.BetAmount * 5) / 2, Outcome: "win",
			Choice: "Player blackjack", Result: fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		return blackjackOutcome{
			Status: "dealer_win", Message: "Dealer blackjack.",
			Payout: 0, Outcome: "loss",
			Choice: fmt.Sprintf("Player %d", playerScore.Total), Result: "Dealer blackjack",
		}
	}
}

func settleDealerTurn(game *blackjackGame) blackjackOutcome {
	for scoreBlackjackHand(game.DealerCards).Total < 17 {
		card, nextDeck, err := drawCard(game.Deck)
		if err != nil {
			return blackjackOutcome{
				Status: "dealer_win", Payout: 0, Outcome: "loss",
				Choice: fmt.Sprintf("Player %d", scoreBlackjackHand(game.PlayerCards).Total),
				Result: "Dealer draw failed",
			}
		}
		game.DealerCards = append(game.DealerCards, card)
		game.Deck = nextDeck
	}

	playerScore := scoreBlackjackHand(game.PlayerCards)
	dealerScore := scoreBlackjackHand(game.DealerCards)

	switch {
	case dealerScore.IsBust:
		return blackjackOutcome{
			Status: "dealer_bust", Message: "Dealer busts. You win.",
			Payout: game.BetAmount * 2, Outcome: "win",
			Choice: fmt.Sprintf("Player %d", playerScore.Total), Result: "Dealer bust",
		}
	case playerScore.Total > dealerScore.Total:
		return blackjackOutcome{
			Status: "player_win", Message: "You beat the dealer.",
			Payout: game.BetAmount * 2, Outcome: "win",
			Choice: fmt.Sprintf("Player %d", playerScore.Total), Result: fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	case playerScore.Total == dealerScore.Total:
		return blackjackOutcome{
			Status: "push", Message: "Push. Your bet is returned.",
			Payout: game.BetAmount, Outcome: "push",
			Choice: fmt.Sprintf("Player %d", playerScore.Total), Result: fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		return blackjackOutcome{
			Status: "dealer_win", Message: "Dealer wins the hand.",
			Payout: 0, Outcome: "loss",
			Choice: fmt.Sprintf("Player %d", playerScore.Total), Result: fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	}
}

func buildBlackjackHistory(game *blackjackGame, balanceAfter int64, outcome blackjackOutcome) *betRecord {
	return &betRecord{
		ID:           mustRandomToken(16),
		Game:         "Blackjack",
		Choice:       outcome.Choice,
		Result:       outcome.Result,
		Amount:       game.BetAmount,
		Outcome:      outcome.Outcome,
		BalanceAfter: balanceAfter,
		Timestamp:    time.Now().UTC(),
	}
}

func buildBlackjackNotification(history betRecord) notificationInput {
	switch history.Outcome {
	case "win":
		return notificationInput{
			Category: "notification", Severity: "success",
			Title:   "Blackjack hand won",
			Message: fmt.Sprintf("%s resolved in your favor for a %d credit hand.", history.Result, history.Amount),
		}
	case "push":
		return notificationInput{
			Category: "notification", Severity: "info",
			Title:   "Blackjack hand pushed",
			Message: fmt.Sprintf("Your %d credit blackjack hand ended in a push.", history.Amount),
		}
	default:
		return notificationInput{
			Category: "notification", Severity: "warning",
			Title:   "Blackjack hand lost",
			Message: fmt.Sprintf("The dealer closed out your %d credit hand.", history.Amount),
		}
	}
}

func buildBlackjackSplitNotification(main, split betRecord) notificationInput {
	wins := 0
	pushes := 0
	for _, h := range []betRecord{main, split} {
		switch h.Outcome {
		case "win":
			wins++
		case "push":
			pushes++
		}
	}
	switch {
	case wins == 2:
		return notificationInput{
			Category: "notification", Severity: "success",
			Title:   "Split — both hands won",
			Message: fmt.Sprintf("Both hands won. Total wagered: %d credits.", main.Amount+split.Amount),
		}
	case wins == 1:
		return notificationInput{
			Category: "notification", Severity: "success",
			Title:   "Split — one hand won",
			Message: fmt.Sprintf("One of your split hands won. Total wagered: %d credits.", main.Amount+split.Amount),
		}
	case pushes > 0:
		return notificationInput{
			Category: "notification", Severity: "info",
			Title:   "Split — push",
			Message: fmt.Sprintf("Your split hand ended in a push. Total wagered: %d credits.", main.Amount+split.Amount),
		}
	default:
		return notificationInput{
			Category: "notification", Severity: "warning",
			Title:   "Split — both hands lost",
			Message: fmt.Sprintf("Both split hands lost. Total wagered: %d credits.", main.Amount+split.Amount),
		}
	}
}

func shuffledDeck() ([]blackjackCard, error) {
	deck := make([]blackjackCard, 0, 52)
	suits := []string{"spades", "hearts", "diamonds", "clubs"}
	ranks := []string{"A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"}
	for _, suit := range suits {
		for _, rank := range ranks {
			deck = append(deck, blackjackCard{Rank: rank, Suit: suit})
		}
	}
	for i := len(deck) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return nil, err
		}
		deck[i], deck[int(n.Int64())] = deck[int(n.Int64())], deck[i]
	}
	return deck, nil
}

func drawCards(deck []blackjackCard, count int) ([]blackjackCard, []blackjackCard) {
	drawn := make([]blackjackCard, 0, count)
	for i := 0; i < count; i++ {
		card, nextDeck, err := drawCard(deck)
		if err != nil {
			break
		}
		drawn = append(drawn, card)
		deck = nextDeck
	}
	return drawn, deck
}

func drawCard(deck []blackjackCard) (blackjackCard, []blackjackCard, error) {
	if len(deck) == 0 {
		return blackjackCard{}, nil, errors.New("deck is empty")
	}
	return deck[0], deck[1:], nil
}

func scoreBlackjackHand(cards []blackjackCard) blackjackScore {
	total := 0
	aces := 0
	for _, card := range cards {
		switch card.Rank {
		case "A":
			total += 11
			aces++
		case "K", "Q", "J", "10":
			total += 10
		default:
			var value int
			fmt.Sscanf(card.Rank, "%d", &value)
			total += value
		}
	}
	for total > 21 && aces > 0 {
		total -= 10
		aces--
	}
	return blackjackScore{
		Total:       total,
		IsSoft:      aces > 0,
		IsBust:      total > 21,
		IsBlackjack: len(cards) == 2 && total == 21,
	}
}
