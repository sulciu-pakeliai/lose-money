package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestHTTPServer(t *testing.T) *httptest.Server {
	t.Helper()

	app := &application{}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", app.handleHealth)

	server := httptest.NewServer(logRequests(mux))
	t.Cleanup(server.Close)

	return server
}

func TestMissionProgressAndStatus(t *testing.T) {
	t.Parallel()

	record := missionRecord{GameScope: missionScopeCoinFlip, Metric: missionMetricRounds, Target: 5}
	if got := missionProgressIncrement(record, missionProgressEvent{Game: "coinflip", Outcome: "loss", Amount: 20}); got != 1 {
		t.Fatalf("missionProgressIncrement(rounds) = %d, want 1", got)
	}

	record = missionRecord{GameScope: missionScopeAll, Metric: missionMetricWager, Target: 400}
	if got := missionProgressIncrement(record, missionProgressEvent{Game: "coinflip", Outcome: "win", Amount: 75}); got != 75 {
		t.Fatalf("missionProgressIncrement(wager) = %d, want 75", got)
	}

	now := time.Now().UTC()
	record = missionRecord{
		ID:          "m1",
		TemplateKey: "all_rounds_5",
		GroupName:   "All Games",
		Title:       "Table Hopper",
		Description: "Finish 5 rounds across any table.",
		GameScope:   missionScopeAll,
		Target:      5,
		Progress:    8,
		CycleEnd:    now.Add(24 * time.Hour),
	}

	dto := toMissionDTO(record)
	if dto.Progress != dto.Target || dto.Status != "claimable" {
		t.Fatalf("toMissionDTO() = %+v, want capped progress and claimable status", dto)
	}
}

func TestNotificationNormalizers(t *testing.T) {
	t.Parallel()

	if got := normalizeNotificationCategory("news"); got != "notification" {
		t.Fatalf("normalizeNotificationCategory(news) = %s, want notification", got)
	}
	if got := normalizeNotificationCategory("other"); got != "notification" {
		t.Fatalf("normalizeNotificationCategory(other) = %s, want notification", got)
	}
	if got := normalizeNotificationSeverity("warning"); got != "warning" {
		t.Fatalf("normalizeNotificationSeverity(warning) = %s, want warning", got)
	}
	if got := normalizeNotificationSeverity("something-else"); got != "info" {
		t.Fatalf("normalizeNotificationSeverity(something-else) = %s, want info", got)
	}
}

func TestHealthEndpointIntegration(t *testing.T) {
	t.Parallel()

	server := newTestHTTPServer(t)

	resp, err := server.Client().Get(server.URL + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/health status = %d, want 200", resp.StatusCode)
	}

	var payload map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode health response error = %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("health payload = %+v, want status ok", payload)
	}

	req, err := http.NewRequest(http.MethodPost, server.URL+"/api/health", nil)
	if err != nil {
		t.Fatalf("new request error = %v", err)
	}

	resp, err = server.Client().Do(req)
	if err != nil {
		t.Fatalf("POST /api/health error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST /api/health status = %d, want 405", resp.StatusCode)
	}
}

func TestHealthEndpointContentTypeIntegration(t *testing.T) {
	t.Parallel()

	server := newTestHTTPServer(t)

	resp, err := server.Client().Get(server.URL + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health error = %v", err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("GET /api/health Content-Type = %q, want application/json", got)
	}
}

func TestHealthEndpointHEADIntegration(t *testing.T) {
	t.Parallel()

	server := newTestHTTPServer(t)

	req, err := http.NewRequest(http.MethodHead, server.URL+"/api/health", nil)
	if err != nil {
		t.Fatalf("new HEAD request error = %v", err)
	}

	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatalf("HEAD /api/health error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("HEAD /api/health status = %d, want 200", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read HEAD /api/health body error = %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("HEAD /api/health body = %q, want empty body", string(body))
	}
}

func TestUnknownRouteIntegration(t *testing.T) {
	t.Parallel()

	server := newTestHTTPServer(t)

	resp, err := server.Client().Get(server.URL + "/api/does-not-exist")
	if err != nil {
		t.Fatalf("GET /api/does-not-exist error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("GET /api/does-not-exist status = %d, want 404", resp.StatusCode)
	}
}
