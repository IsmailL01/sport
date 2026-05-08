package gw

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/coder/websocket"
	"github.com/nats-io/nats.go"

	"github.com/runningecosystem/backend/pkg/auth"
)

type Handler struct {
	signer    *auth.Signer
	nc        *nats.Conn
	registry  *Registry
	log       *slog.Logger
	serverCtx context.Context // server lifetime; не отвалится при возврате HTTP handler-а
}

func NewHandler(serverCtx context.Context, signer *auth.Signer, nc *nats.Conn, registry *Registry, log *slog.Logger) *Handler {
	return &Handler{serverCtx: serverCtx, signer: signer, nc: nc, registry: registry, log: log}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.healthz)
	mux.HandleFunc("GET /ws", h.upgradeWS)
	return mux
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":      "ok",
		"connections": h.registry.Count(),
	})
}

// upgradeWS — POST не подходит, WebSocket идёт по GET с Upgrade header.
//
// Auth: JWT берётся из:
//  1. ?token=<jwt> query param (предпочтительно — браузер не пробросит Auth header через WS)
//  2. Authorization: Bearer ... header (для curl/тестов)
//
// device_id: ?device_id=<uuid> query param (обязательный).
func (h *Handler) upgradeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		header := r.Header.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			token = strings.TrimPrefix(header, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	deviceID := r.URL.Query().Get("device_id")
	if deviceID == "" {
		http.Error(w, "missing device_id", http.StatusBadRequest)
		return
	}

	claims, err := h.signer.VerifyAccess(token)
	if err != nil {
		http.Error(w, "invalid token: "+err.Error(), http.StatusUnauthorized)
		return
	}

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Caddy/proxy уже терминируют TLS — origin check за gw не критичен.
		// В Phase B+ ужесточим (CORS-allowlist для веб-клиента).
		InsecureSkipVerify: true,
	})
	if err != nil {
		h.log.Warn("ws accept failed", "error", err)
		return
	}

	// КРИТИЧНО: используем serverCtx, а не r.Context(), потому что
	// r.Context() cancels когда handler возвращается (после WS upgrade).
	if _, err := NewConnection(h.serverCtx, c, claims.UserID, deviceID, h.nc, h.registry, h.log); err != nil {
		h.log.Warn("connection setup failed", "error", err)
		_ = c.Close(websocket.StatusInternalError, "setup failed")
		return
	}
	// NewConnection запускает goroutines; handler возвращается, conn живёт сам.
}
