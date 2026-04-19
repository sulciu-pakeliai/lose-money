package main

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

type settingsDTO struct {
	SelfExclusion *selfExclusionDTO `json:"selfExclusion,omitempty"`
	BetLimit      *betLimitDTO      `json:"betLimit,omitempty"`
	Theme         *string           `json:"theme,omitempty"`
}

type selfExclusionDTO struct {
	ExcludedUntil time.Time `json:"excludedUntil"`
}

type betLimitDTO struct {
	MaxBetAmount int64 `json:"maxBetAmount"`
}

type selfExclusionRequest struct {
	DurationHours int `json:"durationHours"`
}

type betLimitRequest struct {
	MaxBetAmount int64 `json:"maxBetAmount"`
}

type themeRequest struct {
	Theme string `json:"theme"`
}

func (a *application) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	settings, err := a.loadSettings(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

func (a *application) handleSetSelfExclusion(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if session.UserID == nil {
		writeError(w, http.StatusUnauthorized, "must be signed in to use self-exclusion")
		return
	}

	var req selfExclusionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.DurationHours < 1 || req.DurationHours > 24*180 {
		writeError(w, http.StatusBadRequest, "duration must be between 1 hour and 180 days")
		return
	}

	excludedUntil := time.Now().UTC().Add(time.Duration(req.DurationHours) * time.Hour)

	if _, err := a.db.Exec(r.Context(),
		`INSERT INTO session_settings (session_id, self_excluded_until, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (session_id) DO UPDATE
		 SET self_excluded_until = $2, updated_at = NOW()`,
		session.ID, excludedUntil,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save self-exclusion")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{
		SelfExclusion: &selfExclusionDTO{ExcludedUntil: excludedUntil},
	})
}

func (a *application) handleRemoveSelfExclusion(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`UPDATE session_settings SET self_excluded_until = NULL, updated_at = NOW() WHERE session_id = $1`,
		session.ID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove self-exclusion")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{})
}

func (a *application) handleSetBetLimit(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if session.UserID == nil {
		writeError(w, http.StatusUnauthorized, "must be signed in to set bet limits")
		return
	}

	var req betLimitRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.MaxBetAmount < 1 || req.MaxBetAmount > maxBetAmount {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("bet limit must be between 1 and %d", maxBetAmount))
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`INSERT INTO session_settings (session_id, max_bet_amount, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (session_id) DO UPDATE
		 SET max_bet_amount = $2, updated_at = NOW()`,
		session.ID, req.MaxBetAmount,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save bet limit")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{
		BetLimit: &betLimitDTO{MaxBetAmount: req.MaxBetAmount},
	})
}

func (a *application) handleRemoveBetLimit(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`UPDATE session_settings SET max_bet_amount = NULL, updated_at = NOW() WHERE session_id = $1`,
		session.ID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove bet limit")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{})
}

func (a *application) loadSettings(ctx context.Context, sessionID string) (settingsDTO, error) {
	var dto settingsDTO
	var excludedUntil *time.Time
	var maxBet *int64
	var theme *string

	err := a.db.QueryRow(ctx,
		`SELECT self_excluded_until, max_bet_amount, theme FROM session_settings WHERE session_id = $1`,
		sessionID,
	).Scan(&excludedUntil, &maxBet, &theme)

	if err != nil {
		// No settings row yet — return empty defaults
		return dto, nil
	}

	if excludedUntil != nil && excludedUntil.After(time.Now().UTC()) {
		dto.SelfExclusion = &selfExclusionDTO{ExcludedUntil: *excludedUntil}
	}

	if maxBet != nil {
		dto.BetLimit = &betLimitDTO{MaxBetAmount: *maxBet}
	}

	if theme != nil {
		dto.Theme = theme
	}

	return dto, nil
}

func (a *application) isSessionExcluded(ctx context.Context, sessionID string) (bool, error) {
	var excludedUntil *time.Time
	err := a.db.QueryRow(ctx,
		`SELECT self_excluded_until FROM session_settings WHERE session_id = $1`,
		sessionID,
	).Scan(&excludedUntil)
	if err != nil {
		return false, nil
	}
	return excludedUntil != nil && excludedUntil.After(time.Now().UTC()), nil
}

func (a *application) sessionBetLimit(ctx context.Context, sessionID string) *int64 {
	var maxBet *int64
	a.db.QueryRow(ctx,
		`SELECT max_bet_amount FROM session_settings WHERE session_id = $1`,
		sessionID,
	).Scan(&maxBet)
	return maxBet
}

func (a *application) handleSetTheme(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	var req themeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Theme != "light" && req.Theme != "dark" {
		writeError(w, http.StatusBadRequest, "theme must be 'light' or 'dark'")
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`INSERT INTO session_settings (session_id, theme, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (session_id) DO UPDATE
		 SET theme = $2, updated_at = NOW()`,
		session.ID, req.Theme,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save theme")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{
		Theme: &req.Theme,
	})
}

func (a *application) handleRemoveTheme(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`UPDATE session_settings SET theme = NULL, updated_at = NOW() WHERE session_id = $1`,
		session.ID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove theme")
		return
	}

	writeJSON(w, http.StatusOK, settingsDTO{})
}
