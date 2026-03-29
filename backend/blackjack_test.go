package main

import "testing"

func TestScoreBlackjackHand(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		cards []blackjackCard
		want  blackjackScore
	}{
		{
			name:  "natural blackjack",
			cards: []blackjackCard{{Rank: "A", Suit: "spades"}, {Rank: "K", Suit: "hearts"}},
			want:  blackjackScore{Total: 21, IsSoft: true, IsBust: false, IsBlackjack: true},
		},
		{
			name:  "hard bust",
			cards: []blackjackCard{{Rank: "K", Suit: "spades"}, {Rank: "9", Suit: "hearts"}, {Rank: "5", Suit: "clubs"}},
			want:  blackjackScore{Total: 24, IsSoft: false, IsBust: true, IsBlackjack: false},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := scoreBlackjackHand(tt.cards); got != tt.want {
				t.Fatalf("scoreBlackjackHand() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestSettleNaturalBlackjack(t *testing.T) {
	t.Parallel()

	game := &blackjackGame{BetAmount: 100}

	tests := []struct {
		name        string
		playerScore blackjackScore
		dealerScore blackjackScore
		wantStatus  string
		wantOutcome string
		wantPayout  int64
	}{
		{
			name:        "both blackjack push",
			playerScore: blackjackScore{Total: 21, IsBlackjack: true},
			dealerScore: blackjackScore{Total: 21, IsBlackjack: true},
			wantStatus:  "push",
			wantOutcome: "push",
			wantPayout:  100,
		},
		{
			name:        "player blackjack wins",
			playerScore: blackjackScore{Total: 21, IsBlackjack: true},
			dealerScore: blackjackScore{Total: 20, IsBlackjack: false},
			wantStatus:  "blackjack",
			wantOutcome: "win",
			wantPayout:  250,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := settleNaturalBlackjack(game, tt.playerScore, tt.dealerScore)
			if got.Status != tt.wantStatus || got.Outcome != tt.wantOutcome || got.Payout != tt.wantPayout {
				t.Fatalf("settleNaturalBlackjack() = %+v, want status=%s outcome=%s payout=%d", got, tt.wantStatus, tt.wantOutcome, tt.wantPayout)
			}
		})
	}
}

func TestSettleDealerTurn(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		game       blackjackGame
		wantStatus string
		wantResult string
		wantPayout int64
	}{
		{
			name: "dealer busts",
			game: blackjackGame{
				BetAmount:   100,
				PlayerCards: []blackjackCard{{Rank: "10", Suit: "spades"}, {Rank: "Q", Suit: "hearts"}},
				DealerCards: []blackjackCard{{Rank: "9", Suit: "clubs"}, {Rank: "7", Suit: "diamonds"}},
				Deck:        []blackjackCard{{Rank: "8", Suit: "spades"}},
			},
			wantStatus: "dealer_bust",
			wantResult: "Dealer bust",
			wantPayout: 200,
		},
		{
			name: "dealer wins",
			game: blackjackGame{
				BetAmount:   100,
				PlayerCards: []blackjackCard{{Rank: "10", Suit: "spades"}, {Rank: "7", Suit: "hearts"}},
				DealerCards: []blackjackCard{{Rank: "9", Suit: "clubs"}, {Rank: "7", Suit: "diamonds"}},
				Deck:        []blackjackCard{{Rank: "2", Suit: "spades"}},
			},
			wantStatus: "dealer_win",
			wantResult: "Dealer 18",
			wantPayout: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			game := tt.game
			got := settleDealerTurn(&game)
			if got.Status != tt.wantStatus || got.Result != tt.wantResult || got.Payout != tt.wantPayout {
				t.Fatalf("settleDealerTurn() = %+v, want status=%s result=%s payout=%d", got, tt.wantStatus, tt.wantResult, tt.wantPayout)
			}
		})
	}
}

func TestToBlackjackGameState(t *testing.T) {
	t.Parallel()

	active := &blackjackGame{
		ID:          "g1",
		BetAmount:   100,
		PlayerCards: []blackjackCard{{Rank: "10", Suit: "spades"}, {Rank: "7", Suit: "hearts"}},
		DealerCards: []blackjackCard{{Rank: "9", Suit: "clubs"}, {Rank: "7", Suit: "diamonds"}},
		Status:      "active",
	}

	state := toBlackjackGameState(active)
	if state == nil || state.DealerHiddenCount != 1 || len(state.DealerCards) != 1 {
		t.Fatalf("toBlackjackGameState(active) = %+v, want one visible dealer card", state)
	}

	completed := &blackjackGame{
		ID:          "g2",
		BetAmount:   100,
		PlayerCards: []blackjackCard{{Rank: "10", Suit: "spades"}, {Rank: "8", Suit: "hearts"}},
		DealerCards: []blackjackCard{{Rank: "10", Suit: "clubs"}, {Rank: "9", Suit: "diamonds"}},
		Status:      "dealer_win",
	}

	state = toBlackjackGameState(completed)
	if state == nil || state.DealerHiddenCount != 0 || len(state.DealerCards) != 2 || !state.IsComplete {
		t.Fatalf("toBlackjackGameState(completed) = %+v, want full dealer hand and complete state", state)
	}
}
