package main

import (
	"bytes"
	"net/http/httptest"
	"testing"
)

func TestNormalizeSide(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "heads lowercase", input: "heads", want: "Heads"},
		{name: "tails uppercase", input: "TAILS", want: "Tails"},
		{name: "invalid value", input: "edge", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := normalizeSide(tt.input); got != tt.want {
				t.Fatalf("normalizeSide(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalizeDiceBetType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "low alias", input: "Low 2-6", want: diceBetTypeLow},
		{name: "high exact", input: "high", want: diceBetTypeHigh},
		{name: "lucky seven", input: "Lucky 7", want: diceBetTypeLucky7},
		{name: "invalid", input: "middle", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := normalizeDiceBetType(tt.input); got != tt.want {
				t.Fatalf("normalizeDiceBetType(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestResolveDiceRoll(t *testing.T) {
	t.Parallel()

	if got := resolveDiceRoll(diceBetTypeLow, 1, 3); !got.Won || got.Outcome != "win" {
		t.Fatalf("low bet expected win, got %+v", got)
	}

	if got := resolveDiceRoll(diceBetTypeHigh, 2, 4); got.Won || got.Outcome != "loss" {
		t.Fatalf("high bet expected loss, got %+v", got)
	}

	if got := resolveDiceRoll(diceBetTypeLucky7, 4, 3); !got.Won || got.Status != "exact_seven" || got.ProfitMultiplier != 4 {
		t.Fatalf("lucky7 exact match returned %+v", got)
	}
}

func TestNormalizeRouletteBetTypeAndChoice(t *testing.T) {
	t.Parallel()

	if got := normalizeRouletteBetType("number"); got != rouletteBetTypeNumber {
		t.Fatalf("got %q, want %q", got, rouletteBetTypeNumber)
	}
	if got := normalizeRouletteBetType("RED"); got != rouletteBetTypeColor {
		t.Fatalf("got %q, want %q", got, rouletteBetTypeColor)
	}
	if got := normalizeRouletteBetType("split"); got != rouletteBetTypeSplit {
		t.Fatalf("got %q, want %q", got, rouletteBetTypeSplit)
	}
	if got := normalizeRouletteChoice("17"); got != "17" {
		t.Fatalf("got %q, want %q", got, "17")
	}
	if got := normalizeRouletteChoice("17,18"); got != "17,18" {
		t.Fatalf("got %q, want %q", got, "17,18")
	}
	if got := normalizeRouletteChoice("Black"); got != rouletteColorBlack {
		t.Fatalf("got %q, want %q", got, rouletteColorBlack)
	}
	if got := normalizeRouletteChoice("00"); got != "" {
		t.Fatalf("normalizeRouletteChoice(00) = %q, want empty", got)
	}
}

func TestResolveRouletteSpin(t *testing.T) {
	t.Parallel()

	if got := resolveRouletteSpin(rouletteBetTypeNumber, "7", 7, rouletteColorRed); !got.Won || got.Outcome != "win" || got.ProfitMultiplier != 35 {
		t.Fatalf("number bet should win, got %+v", got)
	}
	if got := resolveRouletteSpin(rouletteBetTypeSplit, "7,8", 8, rouletteColorBlack); !got.Won || got.Outcome != "win" || got.ProfitMultiplier != 17 {
		t.Fatalf("split bet should win, got %+v", got)
	}
	if got := resolveRouletteSpin(rouletteBetTypeColor, "black", 2, rouletteColorBlack); !got.Won || got.Outcome != "win" || got.ProfitMultiplier != 1 {
		t.Fatalf("black bet should win, got %+v", got)
	}
	if got := rouletteColor(0); got != rouletteColorGreen {
		t.Fatalf("rouletteColor(0) = %q, want %q", got, rouletteColorGreen)
	}
}

func TestLevelAndRewardHelpers(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		check func(t *testing.T)
	}{
		{
			name: "level thresholds",
			check: func(t *testing.T) {
				if got := xpRequiredForLevel(3); got != 275 {
					t.Fatalf("xpRequiredForLevel(3) = %d, want 275", got)
				}
				if got := levelForXP(275); got != 3 {
					t.Fatalf("levelForXP(275) = %d, want 3", got)
				}
			},
		},
		{
			name: "valid top up range",
			check: func(t *testing.T) {
				if !isValidTopUpAmount(minTopUpAmount) {
					t.Fatalf("isValidTopUpAmount(minTopUpAmount=%d) = false, want true", minTopUpAmount)
				}
				if !isValidTopUpAmount(maxTopUpAmount) {
					t.Fatalf("isValidTopUpAmount(maxTopUpAmount=%d) = false, want true", maxTopUpAmount)
				}
				if isValidTopUpAmount(minTopUpAmount - 1) {
					t.Fatalf("isValidTopUpAmount(%d) = true, want false", minTopUpAmount-1)
				}
				if isValidTopUpAmount(maxTopUpAmount + 1) {
					t.Fatalf("isValidTopUpAmount(%d) = true, want false", maxTopUpAmount+1)
				}
			},
		},
		{
			name: "xp reward",
			check: func(t *testing.T) {
				if got := calculateXPReward("blackjack", 50, "win", "blackjack"); got != 85 {
					t.Fatalf("calculateXPReward(blackjack) = %d, want 85", got)
				}
				if got := calculateXPReward("dice", 40, "win", "exact_seven"); got != 72 {
					t.Fatalf("calculateXPReward(dice) = %d, want 72", got)
				}
				if got := calculateXPReward("mines", 60, "win", "perfect_clear"); got != 80 {
					t.Fatalf("calculateXPReward(mines) = %d, want 80", got)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			tt.check(t)
		})
	}
}

func TestMinesMathHelpers(t *testing.T) {
	t.Parallel()

	if got := minesMultiplierCents(25, 5, 0); got != 100 {
		t.Fatalf("minesMultiplierCents(25,5,0) = %d, want 100", got)
	}

	onePick := minesMultiplierCents(25, 5, 1)
	twoPick := minesMultiplierCents(25, 5, 2)
	if onePick <= 100 {
		t.Fatalf("mines one reveal multiplier = %d, want > 100", onePick)
	}
	if twoPick <= onePick {
		t.Fatalf("mines two reveal multiplier = %d, want > one reveal %d", twoPick, onePick)
	}

	mineSet := minesCellSet([]int{1, 3, 5})
	if got := minesSafeRevealCount([]int{0, 1, 2, 3, 4}, mineSet); got != 3 {
		t.Fatalf("minesSafeRevealCount(...) = %d, want 3", got)
	}

	if !containsCell([]int{2, 7, 9}, 7) {
		t.Fatal("containsCell failed to find existing cell")
	}
	if containsCell([]int{2, 7, 9}, 6) {
		t.Fatal("containsCell reported non-existing cell")
	}
}

func TestTopUpPolicyHelpers(t *testing.T) {
	t.Parallel()

	policy := buildTopUpPolicy(nil)
	if len(policy.AllowedAmounts) != len(allowedTopUpAmounts) {
		t.Fatalf("AllowedAmounts length = %d, want %d", len(policy.AllowedAmounts), len(allowedTopUpAmounts))
	}
	if policy.MinAmount != minTopUpAmount {
		t.Fatalf("MinAmount = %d, want %d", policy.MinAmount, minTopUpAmount)
	}
	if policy.MaxAmount != maxTopUpAmount {
		t.Fatalf("MaxAmount = %d, want %d", policy.MaxAmount, maxTopUpAmount)
	}
}

func TestDecodeJSONRejectsUnknownFields(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest("POST", "/api/coinflip", bytes.NewBufferString(`{"choice":"Heads","amount":5,"extra":true}`))

	var payload coinFlipRequest
	if err := decodeJSON(req, &payload); err == nil {
		t.Fatal("decodeJSON accepted unknown field, want error")
	}
}
