package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/argon2"
)

const (
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

func generatePasswordHash(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, uint32(argonTime), uint32(argonMemory), uint8(argonThreads), uint32(argonKeyLen))

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonTime, argonThreads, b64Salt, b64Hash)
	return encoded, nil
}

func comparePasswordAndHash(password, encoded string) (bool, error) {
	// Expected format: $argon2id$v=19$m=65536,t=1,p=4$<salt>$<hash>
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return false, fmt.Errorf("invalid encoded hash format")
	}

	// parts[3] = params like m=...,t=...,p=...
	var memory uint32
	var timeParam uint32
	var threads uint8
	params := parts[3]
	for _, p := range strings.Split(params, ",") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "m":
			var v int
			fmt.Sscanf(kv[1], "%d", &v)
			memory = uint32(v)
		case "t":
			var v int
			fmt.Sscanf(kv[1], "%d", &v)
			timeParam = uint32(v)
		case "p":
			var v int
			fmt.Sscanf(kv[1], "%d", &v)
			threads = uint8(v)
		}
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	computed := argon2.IDKey([]byte(password), salt, timeParam, memory, threads, uint32(len(expectedHash)))

	if len(computed) != len(expectedHash) {
		return false, nil
	}
	// Constant-time comparison
	var diff byte
	for i := 0; i < len(expectedHash); i++ {
		diff |= computed[i] ^ expectedHash[i]
	}
	return diff == 0, nil
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *application) refreshSessionStart(ctx context.Context, sessionID string, now time.Time) error {
	_, err := a.db.Exec(ctx, "UPDATE sessions SET created_at = $1, updated_at = $1 WHERE id = $2", now, sessionID)
	return err
}

func (a *application) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}

	ctx := r.Context()

	var exists bool
	if err := a.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)", email).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}
	if exists {
		writeError(w, http.StatusBadRequest, "email already registered")
		return
	}

	pwHash, err := generatePasswordHash(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	id := mustRandomToken(24)
	if _, err := a.db.Exec(ctx, "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1,$2,$3,NOW())", id, email, pwHash); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	// If the request carries a session cookie for a guest, attach that session
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		sess, err := a.loadSession(r.Context(), cookie.Value)
		if err == nil && sess.UserID == nil {
			if _, err := a.db.Exec(ctx, "UPDATE sessions SET user_id = $1, updated_at = NOW() WHERE id = $2 AND user_id IS NULL", id, sess.ID); err == nil {
				// reload updated session
				sess, _ = a.loadSession(r.Context(), sess.ID)
				writeJSON(w, http.StatusCreated, map[string]any{"id": id, "email": email, "session": toSessionDTO(sess)})
				return
			}
		}
	}

	// No guest session attached; create a fresh session for the user
	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "email": email})
}

func (a *application) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}

	ctx := r.Context()

	var userID string
	var pwHash string
	if err := a.db.QueryRow(ctx, "SELECT id, password_hash FROM users WHERE email = $1", email).Scan(&userID, &pwHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to lookup user")
		return
	}

	ok, err := comparePasswordAndHash(req.Password, pwHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify password")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// 1) If user already has a session, use it
	var existingSessionID string
	if err := a.db.QueryRow(ctx, "SELECT id FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1", userID).Scan(&existingSessionID); err == nil {
		if err := a.refreshSessionStart(ctx, existingSessionID, time.Now().UTC()); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to refresh session")
			return
		}
		sess, err := a.loadSession(ctx, existingSessionID)
		if err == nil {
			http.SetCookie(w, &http.Cookie{
				Name:     sessionCookieName,
				Value:    sess.ID,
				Path:     "/",
				MaxAge:   60 * 60 * 24 * 30,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
				Secure:   isSecureRequest(r),
			})
			writeJSON(w, http.StatusOK, map[string]any{"id": userID, "session": toSessionDTO(sess)})
			return
		}
	}

	// 2) No existing session: if client has a guest session cookie and it's unclaimed, attach it
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		sess, err := a.loadSession(ctx, cookie.Value)
		if err == nil && sess.UserID == nil {
			if _, err := a.db.Exec(ctx, "UPDATE sessions SET user_id = $1, updated_at = NOW() WHERE id = $2 AND user_id IS NULL", userID, sess.ID); err == nil {
				// reload
				sess, _ = a.loadSession(ctx, sess.ID)
				writeJSON(w, http.StatusOK, map[string]any{"id": userID, "session": toSessionDTO(sess)})
				return
			}
		}
	}

	// 3) Create a fresh session for the user
	newID := mustRandomToken(24)
	now := time.Now().UTC()
	if _, err := a.db.Exec(ctx, `INSERT INTO sessions (id, balance, xp, games_played, user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, newID, startBalance, 0, 0, userID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	sess, err := a.loadSession(ctx, newID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.ID,
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})
	writeJSON(w, http.StatusOK, map[string]any{"id": userID, "session": toSessionDTO(sess)})
}

func (a *application) handleLogout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	newID := mustRandomToken(24)
	now := time.Now().UTC()
	if _, err := a.db.Exec(ctx, `INSERT INTO sessions (id, balance, xp, games_played, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, newID, startBalance, 0, 0, now); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    newID,
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})

	if sess, err := a.loadSession(ctx, newID); err == nil {
		writeJSON(w, http.StatusOK, map[string]any{"session": toSessionDTO(sess)})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}
