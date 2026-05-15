// activity-sync/cmd/server — entry point Activity Sync сервиса.
//
// Конфиг через ENV:
//   ACTIVITY_SYNC_HTTP_ADDR  :8082
//   ACTIVITY_SYNC_DB_URL     postgres://...
//   IDENTITY_JWT_SECRET      (общий с identity для проверки токенов)
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

	"github.com/runningecosystem/backend/activity-sync/internal/handler"
	"github.com/runningecosystem/backend/activity-sync/internal/repository"
	"github.com/runningecosystem/backend/activity-sync/internal/repository/postgres"
	"github.com/runningecosystem/backend/activity-sync/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
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

	addr := envOr("ACTIVITY_SYNC_HTTP_ADDR", ":8082")
	dbURL := envOr("ACTIVITY_SYNC_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
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
	versionedMux := clientversion.Middleware(h.Routes(), versionPolicy, logger)

	srv := &http.Server{
		Addr:              addr,
		Handler:           versionedMux,
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
