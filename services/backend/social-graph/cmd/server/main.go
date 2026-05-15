// social-graph/cmd/server — entry point Social Graph сервиса.
//
// Конфиг через ENV:
//   SOCIAL_GRAPH_HTTP_ADDR  :8084
//   SOCIAL_GRAPH_DB_URL     postgres://...
//   IDENTITY_JWT_SECRET     (общий с identity для verify)
//   NATS_URL                nats://nats:4222 (Phase A unused, ready for events)
//   REDIS_URL               redis://redis:6379/0 (Phase A unused, ready for cache)
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

	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/ratelimit"
	"github.com/runningecosystem/backend/social-graph/internal/handler"
	"github.com/runningecosystem/backend/social-graph/internal/repository/postgres"
	"github.com/runningecosystem/backend/social-graph/internal/service"
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

	addr := envOr("SOCIAL_GRAPH_HTTP_ADDR", ":8084")
	dbURL := envOr("SOCIAL_GRAPH_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
	redisURL := envOr("REDIS_URL", "redis://localhost:6379/0")

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

	profRepo := postgres.NewProfileRepo(pool)
	followRepo := postgres.NewFollowRepo(pool)
	blockRepo := postgres.NewBlockRepo(pool)
	reportRepo := postgres.NewReportRepo(pool)
	auditRepo := postgres.NewAuditRepo(pool)
	svc := service.New(profRepo, followRepo, blockRepo, reportRepo, auditRepo)

	limiter, err := ratelimit.New(redisURL)
	if err != nil {
		logger.Warn("ratelimit init failed; rate limiting disabled", "error", err)
	} else {
		defer limiter.Close()
		logger.Info("rate limiter ready")
	}

	h := handler.New(svc, signer, limiter, logger)

	// === Outermost middleware stanza (Plan 01-02 / REL-02) ===
	// Constructor order: pool → handler → versionPolicy → versionedMux.
	// Plan 01-03 (Wave 2) will insert flagStore between pool and handler.
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
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
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
