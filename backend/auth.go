package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

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
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
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
