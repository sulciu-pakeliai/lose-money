package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const notificationLimit = 40

type notificationRecord struct {
	ID        string
	SessionID string
	Category  string
	Severity  string
	Title     string
	Message   string
	IsRead    bool
	CreatedAt time.Time
	ReadAt    *time.Time
}

type notificationDTO struct {
	ID        string     `json:"id"`
	Category  string     `json:"category"`
	Severity  string     `json:"severity"`
	Title     string     `json:"title"`
	Message   string     `json:"message"`
	IsRead    bool       `json:"isRead"`
	CreatedAt time.Time  `json:"createdAt"`
	ReadAt    *time.Time `json:"readAt,omitempty"`
}

type notificationsResponse struct {
	Notifications []notificationDTO `json:"notifications"`
}

type notificationsReadResponse struct {
	Notifications []notificationDTO `json:"notifications"`
}

type notificationInput struct {
	Category string
	Severity string
	Title    string
	Message  string
}

var defaultNotificationSeed = []notificationInput{
	{
		Category: "notification",
		Severity: "info",
		Title:    "Welcome to LoseMoney",
		Message:  "Your notification inbox is live. Important balance, reward, and game updates will land here.",
	},
}

func (a *application) handleNotifications(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	notifications, err := a.loadNotifications(r.Context(), session.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load notifications")
		return
	}

	writeJSON(w, http.StatusOK, notificationsResponse{Notifications: notifications})
}

func (a *application) handleNotificationsRead(w http.ResponseWriter, r *http.Request) {
	session, err := a.ensureSession(w, r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	if _, err := a.markNotificationsRead(r.Context(), session.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark notifications as read")
		return
	}

	notifications, err := a.loadNotifications(r.Context(), session.ID, notificationLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload notifications")
		return
	}

	writeJSON(w, http.StatusOK, notificationsReadResponse{Notifications: notifications})
}

func (a *application) loadNotifications(ctx context.Context, sessionID string, limit int) ([]notificationDTO, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if err := a.ensureNotificationSeedTx(ctx, tx, sessionID); err != nil {
		return nil, err
	}

	rows, err := tx.Query(
		ctx,
		`SELECT id, session_id, category, severity, title, message, is_read, created_at, read_at
		 FROM notifications
		 WHERE session_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		sessionID,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notifications := make([]notificationDTO, 0, limit)
	for rows.Next() {
		record, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, toNotificationDTO(record))
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return notifications, nil
}

func (a *application) ensureNotificationSeedTx(ctx context.Context, tx pgx.Tx, sessionID string) error {
	var count int
	if err := tx.QueryRow(
		ctx,
		`SELECT COUNT(*) FROM notifications WHERE session_id = $1`,
		sessionID,
	).Scan(&count); err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	for _, seed := range defaultNotificationSeed {
		if err := a.sendNotificationTx(ctx, tx, sessionID, seed); err != nil {
			return err
		}
	}

	return nil
}

func (a *application) sendNotification(ctx context.Context, sessionID string, input notificationInput) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := a.sendNotificationTx(ctx, tx, sessionID, input); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (a *application) sendNotificationTx(ctx context.Context, tx pgx.Tx, sessionID string, input notificationInput) error {
	title := strings.TrimSpace(input.Title)
	message := strings.TrimSpace(input.Message)
	if title == "" || message == "" {
		return fmt.Errorf("notification title and message are required")
	}

	_, err := tx.Exec(
		ctx,
		`INSERT INTO notifications (id, session_id, category, severity, title, message, is_read, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)`,
		mustRandomToken(16),
		sessionID,
		normalizeNotificationCategory(input.Category),
		normalizeNotificationSeverity(input.Severity),
		title,
		message,
		time.Now().UTC(),
	)
	return err
}

func (a *application) markNotificationsRead(ctx context.Context, sessionID string) (int64, error) {
	commandTag, err := a.db.Exec(
		ctx,
		`UPDATE notifications
		 SET is_read = TRUE,
		     read_at = NOW()
		 WHERE session_id = $1 AND is_read = FALSE`,
		sessionID,
	)
	if err != nil {
		return 0, err
	}

	return commandTag.RowsAffected(), nil
}

func scanNotification(scanner interface {
	Scan(...any) error
}) (notificationRecord, error) {
	var record notificationRecord
	err := scanner.Scan(
		&record.ID,
		&record.SessionID,
		&record.Category,
		&record.Severity,
		&record.Title,
		&record.Message,
		&record.IsRead,
		&record.CreatedAt,
		&record.ReadAt,
	)
	return record, err
}

func toNotificationDTO(record notificationRecord) notificationDTO {
	return notificationDTO{
		ID:        record.ID,
		Category:  normalizeNotificationCategory(record.Category),
		Severity:  record.Severity,
		Title:     record.Title,
		Message:   record.Message,
		IsRead:    record.IsRead,
		CreatedAt: record.CreatedAt,
		ReadAt:    record.ReadAt,
	}
}

func normalizeNotificationCategory(value string) string {
	return "notification"
}

func normalizeNotificationSeverity(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "success":
		return "success"
	case "warning":
		return "warning"
	default:
		return "info"
	}
}
