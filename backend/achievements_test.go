package main

import "testing"

func TestNextAchievementProgress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		record  achievementRecord
		event   achievementProgressEvent
		want    int64
		changed bool
	}{
		{
			name: "rounds increment across all games",
			record: achievementRecord{
				GameScope: missionScopeAll,
				Metric:    achievementMetricRounds,
				Target:    10,
				Progress:  4,
			},
			event:   achievementProgressEvent{Game: missionScopeCoinFlip},
			want:    5,
			changed: true,
		},
		{
			name: "wins require win outcome",
			record: achievementRecord{
				GameScope: missionScopeCoinFlip,
				Metric:    achievementMetricWins,
				Target:    3,
				Progress:  1,
			},
			event:   achievementProgressEvent{Game: missionScopeCoinFlip, Outcome: "loss"},
			want:    1,
			changed: false,
		},
		{
			name: "single bet tracks max amount",
			record: achievementRecord{
				GameScope: missionScopeAll,
				Metric:    achievementMetricSingleBet,
				Target:    250,
				Progress:  120,
			},
			event:   achievementProgressEvent{Game: missionScopeBlackjack, Amount: 200},
			want:    200,
			changed: true,
		},
		{
			name: "natural blackjack only counts blackjack status",
			record: achievementRecord{
				GameScope: missionScopeBlackjack,
				Metric:    achievementMetricNaturalBlackjacks,
				Target:    1,
				Progress:  0,
			},
			event:   achievementProgressEvent{Game: missionScopeBlackjack, Status: "player_win"},
			want:    0,
			changed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, changed := nextAchievementProgress(tt.record, tt.event)
			if got != tt.want || changed != tt.changed {
				t.Fatalf("nextAchievementProgress() = (%d, %t), want (%d, %t)", got, changed, tt.want, tt.changed)
			}
		})
	}
}

func TestAchievementStatus(t *testing.T) {
	t.Parallel()

	record := achievementRecord{Target: 5, Progress: 5}
	if got := achievementStatus(record); got != "unlocked" {
		t.Fatalf("achievementStatus() = %q, want unlocked", got)
	}
}
