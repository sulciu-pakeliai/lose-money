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
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	CompletedAt *time.Time
}

type blackjackGameState struct {
	ID                string          `json:"id"`
	BetAmount         int64           `json:"betAmount"`
	PlayerCards       []blackjackCard `json:"playerCards"`
	DealerCards       []blackjackCard `json:"dealerCards"`
	DealerHiddenCount int             `json:"dealerHiddenCount"`
	PlayerTotal       int             `json:"playerTotal"`
	DealerTotal       int             `json:"dealerTotal"`
	Status            string          `json:"status"`
	Message           string          `json:"message"`
	CanHit            bool            `json:"canHit"`
	CanStand          bool            `json:"canStand"`
	IsComplete        bool            `json:"isComplete"`
	CompletedAt       *time.Time      `json:"completedAt,omitempty"`
}

type blackjackStartRequest struct {
	Amount int64 `json:"amount"`
}

type blackjackActionResponse struct {
	Session      sessionDTO          `json:"session"`
	Blackjack    *blackjackGameState `json:"blackjack"`
	TopUp        topUpPolicy         `json:"topUp"`
	HistoryEntry *betRecord          `json:"historyEntry,omitempty"`
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

	playerScore := scoreBlackjackHand(game.PlayerCards)
	dealerScore := scoreBlackjackHand(game.DealerCards)
	if playerScore.IsBlackjack || dealerScore.IsBlackjack {
		outcome := settleNaturalBlackjack(game, playerScore, dealerScore)
		game.Status = outcome.Status
		game.CompletedAt = &now
		finalBalance += outcome.Payout
		historyEntry = buildBlackjackHistory(game, finalBalance, outcome)
	}

	if err := a.insertBlackjackGame(r.Context(), tx, game); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create blackjack hand")
		return
	}

	if err := a.updateSessionBalance(r.Context(), tx, lockedSession.ID, finalBalance, lockedSession.LastTopUpAt); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reserve blackjack bet")
		return
	}

	if historyEntry != nil {
		if err := a.insertBetHistory(r.Context(), tx, session.ID, historyEntry); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to record blackjack result")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit blackjack hand")
		return
	}

	lockedSession.Balance = finalBalance
	writeJSON(w, http.StatusOK, blackjackActionResponse{
		Session:      toSessionDTO(lockedSession),
		Blackjack:    toBlackjackGameState(game),
		TopUp:        buildTopUpPolicy(lockedSession.LastTopUpAt),
		HistoryEntry: historyEntry,
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
	if action == "hit" {
		nextCard, nextDeck, drawErr := drawCard(game.Deck)
		if drawErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to draw blackjack card")
			return
		}
		game.PlayerCards = append(game.PlayerCards, nextCard)
		game.Deck = nextDeck
		game.UpdatedAt = time.Now().UTC()

		playerScore := scoreBlackjackHand(game.PlayerCards)
		switch {
		case playerScore.IsBust:
			historyEntry, err = a.finishBlackjackHand(r.Context(), tx, session, game, blackjackOutcome{
				Status:  "player_bust",
				Message: "Bust. Dealer wins.",
				Payout:  0,
				Outcome: "loss",
				Choice:  fmt.Sprintf("Player %d", playerScore.Total),
				Result:  "Bust",
			})
		case playerScore.Total == 21:
			historyEntry, err = a.finishBlackjackHand(r.Context(), tx, session, game, settleDealerTurn(game))
		default:
			err = a.updateBlackjackGame(r.Context(), tx, game)
		}
	} else {
		historyEntry, err = a.finishBlackjackHand(r.Context(), tx, session, game, settleDealerTurn(game))
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	currentSession, err := a.loadSessionTx(r.Context(), tx, session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to refresh session")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit blackjack action")
		return
	}

	writeJSON(w, http.StatusOK, blackjackActionResponse{
		Session:      toSessionDTO(currentSession),
		Blackjack:    toBlackjackGameState(game),
		TopUp:        buildTopUpPolicy(currentSession.LastTopUpAt),
		HistoryEntry: historyEntry,
	})
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
	if err := a.updateSessionBalance(ctx, tx, lockedSession.ID, finalBalance, lockedSession.LastTopUpAt); err != nil {
		return nil, fmt.Errorf("failed to settle session balance: %w", err)
	}

	historyEntry := buildBlackjackHistory(game, finalBalance, outcome)
	if err := a.insertBetHistory(ctx, tx, session.ID, historyEntry); err != nil {
		return nil, fmt.Errorf("failed to record blackjack history: %w", err)
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
	query := `SELECT id, session_id, bet_amount, deck, player_cards, dealer_cards, status, created_at, updated_at, completed_at
		FROM blackjack_games
		WHERE session_id = $1 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 1
		FOR UPDATE`

	return scanBlackjackGame(tx.QueryRow(ctx, query, sessionID))
}

type blackjackQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (a *application) loadActiveBlackjackRecord(ctx context.Context, queryer blackjackQueryer, sessionID string) (*blackjackGame, error) {
	query := `SELECT id, session_id, bet_amount, deck, player_cards, dealer_cards, status, created_at, updated_at, completed_at
		FROM blackjack_games
		WHERE session_id = $1 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 1`
	return scanBlackjackGame(queryer.QueryRow(ctx, query, sessionID))
}

func scanBlackjackGame(row pgx.Row) (*blackjackGame, error) {
	var game blackjackGame
	var deckJSON []byte
	var playerJSON []byte
	var dealerJSON []byte
	err := row.Scan(
		&game.ID,
		&game.SessionID,
		&game.BetAmount,
		&deckJSON,
		&playerJSON,
		&dealerJSON,
		&game.Status,
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

	return &game, nil
}

func (a *application) insertBlackjackGame(ctx context.Context, tx pgx.Tx, game *blackjackGame) error {
	deckJSON, err := json.Marshal(game.Deck)
	if err != nil {
		return err
	}
	playerJSON, err := json.Marshal(game.PlayerCards)
	if err != nil {
		return err
	}
	dealerJSON, err := json.Marshal(game.DealerCards)
	if err != nil {
		return err
	}

	_, err = tx.Exec(
		ctx,
		`INSERT INTO blackjack_games (id, session_id, bet_amount, deck, player_cards, dealer_cards, status, created_at, updated_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		game.ID,
		game.SessionID,
		game.BetAmount,
		deckJSON,
		playerJSON,
		dealerJSON,
		game.Status,
		game.CreatedAt,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func (a *application) updateBlackjackGame(ctx context.Context, tx pgx.Tx, game *blackjackGame) error {
	deckJSON, err := json.Marshal(game.Deck)
	if err != nil {
		return err
	}
	playerJSON, err := json.Marshal(game.PlayerCards)
	if err != nil {
		return err
	}
	dealerJSON, err := json.Marshal(game.DealerCards)
	if err != nil {
		return err
	}

	_, err = tx.Exec(
		ctx,
		`UPDATE blackjack_games
		 SET deck = $2,
		     player_cards = $3,
		     dealer_cards = $4,
		     status = $5,
		     updated_at = $6,
		     completed_at = $7
		 WHERE id = $1`,
		game.ID,
		deckJSON,
		playerJSON,
		dealerJSON,
		game.Status,
		game.UpdatedAt,
		game.CompletedAt,
	)
	return err
}

func (a *application) lockSession(ctx context.Context, tx pgx.Tx, sessionID string) (sessionRecord, error) {
	var session sessionRecord
	err := tx.QueryRow(
		ctx,
		`SELECT id, balance, created_at, last_top_up_at FROM sessions WHERE id = $1 FOR UPDATE`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.CreatedAt, &session.LastTopUpAt)
	return session, err
}

func (a *application) loadSessionTx(ctx context.Context, tx pgx.Tx, sessionID string) (sessionRecord, error) {
	var session sessionRecord
	err := tx.QueryRow(
		ctx,
		`SELECT id, balance, created_at, last_top_up_at FROM sessions WHERE id = $1`,
		sessionID,
	).Scan(&session.ID, &session.Balance, &session.CreatedAt, &session.LastTopUpAt)
	return session, err
}

func (a *application) updateSessionBalance(ctx context.Context, tx pgx.Tx, sessionID string, balance int64, lastTopUpAt *time.Time) error {
	_, err := tx.Exec(
		ctx,
		`UPDATE sessions SET balance = $2, updated_at = NOW(), last_top_up_at = $3 WHERE id = $1`,
		sessionID,
		balance,
		lastTopUpAt,
	)
	return err
}

func (a *application) insertBetHistory(ctx context.Context, tx pgx.Tx, sessionID string, record *betRecord) error {
	_, err := tx.Exec(
		ctx,
		`INSERT INTO bets (id, session_id, game, choice, result, amount, outcome, balance_after, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		record.ID,
		sessionID,
		record.Game,
		record.Choice,
		record.Result,
		record.Amount,
		record.Outcome,
		record.BalanceAfter,
		record.Timestamp,
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

	return &blackjackGameState{
		ID:                game.ID,
		BetAmount:         game.BetAmount,
		PlayerCards:       game.PlayerCards,
		DealerCards:       dealerCards,
		DealerHiddenCount: hiddenCount,
		PlayerTotal:       playerScore.Total,
		DealerTotal:       dealerTotal,
		Status:            game.Status,
		Message:           blackjackStatusMessage(game.Status),
		CanHit:            !isComplete,
		CanStand:          !isComplete,
		IsComplete:        isComplete,
		CompletedAt:       game.CompletedAt,
	}
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
			Status:  "push",
			Message: "Both sides have blackjack. Push.",
			Payout:  game.BetAmount,
			Outcome: "push",
			Choice:  "Player blackjack",
			Result:  "Dealer blackjack",
		}
	case playerScore.IsBlackjack:
		return blackjackOutcome{
			Status:  "blackjack",
			Message: "Blackjack pays 3:2.",
			Payout:  (game.BetAmount * 5) / 2,
			Outcome: "win",
			Choice:  "Player blackjack",
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		return blackjackOutcome{
			Status:  "dealer_win",
			Message: "Dealer blackjack.",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Player %d", playerScore.Total),
			Result:  "Dealer blackjack",
		}
	}
}

func settleDealerTurn(game *blackjackGame) blackjackOutcome {
	for scoreBlackjackHand(game.DealerCards).Total < 17 {
		card, nextDeck, err := drawCard(game.Deck)
		if err != nil {
			return blackjackOutcome{
				Status:  "dealer_win",
				Message: "Dealer wins the hand.",
				Payout:  0,
				Outcome: "loss",
				Choice:  fmt.Sprintf("Player %d", scoreBlackjackHand(game.PlayerCards).Total),
				Result:  "Dealer draw failed",
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
			Status:  "dealer_bust",
			Message: "Dealer busts. You win.",
			Payout:  game.BetAmount * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Player %d", playerScore.Total),
			Result:  "Dealer bust",
		}
	case playerScore.Total > dealerScore.Total:
		return blackjackOutcome{
			Status:  "player_win",
			Message: "You beat the dealer.",
			Payout:  game.BetAmount * 2,
			Outcome: "win",
			Choice:  fmt.Sprintf("Player %d", playerScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	case playerScore.Total == dealerScore.Total:
		return blackjackOutcome{
			Status:  "push",
			Message: "Push. Your bet is returned.",
			Payout:  game.BetAmount,
			Outcome: "push",
			Choice:  fmt.Sprintf("Player %d", playerScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
		}
	default:
		return blackjackOutcome{
			Status:  "dealer_win",
			Message: "Dealer wins the hand.",
			Payout:  0,
			Outcome: "loss",
			Choice:  fmt.Sprintf("Player %d", playerScore.Total),
			Result:  fmt.Sprintf("Dealer %d", dealerScore.Total),
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
		j := int(n.Int64())
		deck[i], deck[j] = deck[j], deck[i]
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
