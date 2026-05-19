// activity-sync/cmd/server — entry point Activity Sync сервиса.
//
// Конфиг через ENV:
//
//	ACTIVITY_SYNC_HTTP_ADDR  OPTIONAL  :8082
//	ACTIVITY_SYNC_DB_URL     REQUIRED  postgres://... (содержит пароль)
//	IDENTITY_JWT_SECRET      REQUIRED  общий с identity для verify (≥32 байта)
//	NATS_URL                 OPTIONAL  default "" (xp realtime disabled)
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

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/runningecosystem/backend/activity-sync/internal/handler"
	"github.com/runningecosystem/backend/activity-sync/internal/repository"
	"github.com/runningecosystem/backend/activity-sync/internal/repository/postgres"
	"github.com/runningecosystem/backend/activity-sync/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/pkg/observability"
)

// serviceName — Phase 5 / D-32. Используется как:
//   - "service" label на всех Prometheus метриках (Plan 05-04 / D-17)
//   - Sentry tag (Plan 05-05 — TBD)
//   - "service" attr в slog default attrs (Plan 05-03 / D-10)
const serviceName = "activity-sync"

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := observability.NewSlogJSONHandler(observability.Config{
		ServiceName: serviceName,
		Env:         envOr("ENV", "prod"),
		Version:     envOr("BUILD_VERSION", "dev"),
		Level:       observability.ParseLevel(envOr("LOG_LEVEL", "info")),
	})
	slog.SetDefault(logger)

	addr := envOr("ACTIVITY_SYNC_HTTP_ADDR", ":8082")
	// REQUIRED — содержит пароль Postgres
	dbURL := envRequire("ACTIVITY_SYNC_DB_URL")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))
	natsURL := envOr("NATS_URL", "")

	signer, err := auth.NewSigner(jwtSecret)
	if err != nil {
		return fmt.Errorf("init signer: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping db: %w", err)
	}
	logger.Info("db connected")

	sessRepo := postgres.NewSessionRepo(pool)
	pointRepo := postgres.NewPointRepo(pool)
	xpRepo := repository.NewXpRepo(pool)

	// NATS optional: если не настроен, XP всё равно начисляется в БД, просто
	// без realtime push в WS / notifications.
	var nc *nats.Conn
	if natsURL != "" {
		var err error
		nc, err = nats.Connect(natsURL,
			nats.Name("activity-sync"),
			nats.MaxReconnects(-1),
			nats.ReconnectWait(time.Second))
		if err != nil {
			logger.Warn("nats connect failed; xp realtime disabled", "error", err)
			nc = nil
		} else {
			defer nc.Drain()
			logger.Info("nats connected", "url", natsURL)
		}
	}

	// Phase 1 / REL-03: feature flag store (Plan 03).  Construct между pool и
	// handler чтобы будущие плановые задачи могли передать flagStore в handler
	// constructor без re-wiring.  В activity-sync пока нет flag-driven
	// branching — _ = flagStore маркер reserved-for-future.
	flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)
	_ = flagStore

	opts := []service.Option{service.WithXP(xpRepo)}
	if nc != nil {
		opts = append(opts, service.WithNATS(nc))
	}
	syncSvc := service.NewSyncService(sessRepo, pointRepo, opts...)
	h := handler.NewSyncHandler(syncSvc, signer, logger)

	// === Outermost middleware stanza (Plan 01-02 / REL-02) ===
	// Constructor order: pool → flagStore (Plan 03 / REL-03) → handler →
	// versionPolicy → versionedMux.
	versionPolicy := clientversion.Policy{
		MinSupported:          envOr("CLIENT_MIN_VERSION", "1.0.0"),
		ForceUpdateURLAndroid: envOr("FORCE_UPDATE_URL_ANDROID", ""),
		ForceUpdateURLiOS:     envOr("FORCE_UPDATE_URL_IOS", ""),
		SkipPaths:             []string{"/healthz", "/metrics"},
	}
	// Phase 5 / OBS-05 / D-19 — Prometheus /metrics endpoint + PromhttpMiddleware
	// chain. /metrics регистрируется в outer mux (clientversion SkipPaths уже
	// содержит "/metrics", так что clientversion проходит сквозь). Plan 05-05
	// будет дополнительно оборачивать OtelHTTP + SentryRecovery между
	// PromhttpMiddleware и versionedMux.
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.Handle("/", h.Routes())

	versionedMux := clientversion.Middleware(mux, versionPolicy, logger)
	rootHandler := observability.PromhttpMiddleware(serviceName, versionedMux)

	srv := &http.Server{
		Addr:              addr,
		Handler:           rootHandler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
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
