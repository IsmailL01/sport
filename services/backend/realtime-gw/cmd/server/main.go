// realtime-gw/cmd/server — WebSocket terminus.
//
// Конфиг через ENV:
//   REALTIME_GW_HTTP_ADDR  OPTIONAL  :8090
//   IDENTITY_JWT_SECRET    REQUIRED  ≥32 байта (enforced в pkg/auth.NewSigner)
//   NATS_URL               OPTIONAL  nats://nats:4222
//   REALTIME_GW_DB_URL     OPTIONAL  если задан — featureflags подключаются
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/realtime-gw/internal/gw"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	addr := envOr("REALTIME_GW_HTTP_ADDR", ":8090")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))
	natsURL := envOr("NATS_URL", "nats://localhost:4222")
	// Phase 1 / REL-03: realtime-gw historically не использовал Postgres
	// (state-less WS terminus). Pool теперь нужен ТОЛЬКО для featureflags
	// shared store — IsEnabled lookups через 30s in-memory cache.  Если
	// REALTIME_GW_DB_URL не выставлен → пропускаем construction; service
	// продолжает работу без flags (IsEnabled = false для всех).
	dbURL := envOr("REALTIME_GW_DB_URL", "")

	signer, err := auth.NewSigner(jwtSecret)
	if err != nil {
		return fmt.Errorf("init signer: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	nc, err := nats.Connect(natsURL,
		nats.Name("realtime-gw"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			logger.Warn("nats disconnected", "error", err)
		}),
		nats.ReconnectHandler(func(c *nats.Conn) {
			logger.Info("nats reconnected", "url", c.ConnectedUrl())
		}),
	)
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer nc.Drain()
	logger.Info("nats connected", "url", natsURL)

	// Phase 1 / REL-03: feature flag store — opt-in, only if DB URL provided.
	// realtime-gw isn't traditionally postgres-bound; we connect lazily here
	// so IsEnabled works for future flag-driven WS gating (e.g. opt-in
	// debug logging per OBS-08).
	var flagStore *featureflags.Store
	if dbURL != "" {
		pool, err := pgxpool.New(ctx, dbURL)
		if err != nil {
			logger.Warn("featureflags: db connect failed; flags disabled", "error", err)
		} else {
			defer pool.Close()
			if err := pool.Ping(ctx); err != nil {
				logger.Warn("featureflags: db ping failed; flags disabled", "error", err)
				pool.Close()
			} else {
				flagStore = featureflags.NewPostgresStore(pool, 30*time.Second)
				logger.Info("featureflags ready")
			}
		}
	}
	_ = flagStore

	registry := gw.NewRegistry()
	handler := gw.NewHandler(ctx, signer, nc, registry, logger)

	// === Outermost middleware stanza (Plan 01-02 / REL-02) ===
	// Constructor order: nc → flagStore (Plan 03 / REL-03, optional) →
	// handler → versionPolicy → versionedMux.
	// Realtime-gw — единственный WS-сервис; clientversion.Middleware безопасен
	// над WebSocket upgrade: Upgrade handshake — обычный HTTP-запрос, и если
	// клиент слишком старый, 426 отдаётся до Upgrade'a (это правильное поведение).
	versionPolicy := clientversion.Policy{
		MinSupported:          envOr("CLIENT_MIN_VERSION", "1.0.0"),
		ForceUpdateURLAndroid: envOr("FORCE_UPDATE_URL_ANDROID", ""),
		ForceUpdateURLiOS:     envOr("FORCE_UPDATE_URL_IOS", ""),
		SkipPaths:             []string{"/healthz", "/metrics"},
	}
	versionedMux := clientversion.Middleware(handler.Routes(), versionPolicy, logger)

	srv := &http.Server{
		Addr:              addr,
		Handler:           versionedMux,
		ReadHeaderTimeout: 5 * time.Second,
		// Длинные timeouts для WebSocket (не блокируют upgrade).
		ReadTimeout:  0,
		WriteTimeout: 0,
		IdleTimeout:  0,
	}

	go func() {
		logger.Info("listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("listen", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	registry.CloseAll("server shutdown")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	return srv.Shutdown(shutdownCtx)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// envRequire возвращает значение переменной окружения или завершает процесс
// через os.Exit(1), если переменная отсутствует или пустая.
// Phase 2 / SEC-09: fail-fast при отсутствии секрета.
func envRequire(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var missing", "key", key)
		os.Exit(1)
	}
	return v
}
