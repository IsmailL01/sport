// feed/cmd/server — Phase C: stories. Phase D: posts/likes/comments + home feed.
//
// Конфиг через ENV:
//   FEED_HTTP_ADDR        OPTIONAL  :8085
//   FEED_DB_URL           REQUIRED  postgres://... (содержит пароль)
//   IDENTITY_JWT_SECRET   REQUIRED  ≥32 байта (enforced в pkg/auth.NewSigner)
//   NATS_URL              OPTIONAL  nats://localhost:4222
//   REDIS_URL             OPTIONAL  redis://localhost:6379/0 (ratelimit)
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

	"github.com/runningecosystem/backend/feed/internal/cleanup"
	"github.com/runningecosystem/backend/feed/internal/handler"
	"github.com/runningecosystem/backend/feed/internal/repository/postgres"
	"github.com/runningecosystem/backend/feed/internal/service"
	"github.com/runningecosystem/backend/pkg/audit"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/pkg/permissions"
	"github.com/runningecosystem/backend/pkg/ratelimit"
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

	addr := envOr("FEED_HTTP_ADDR", ":8085")
	// REQUIRED — содержит пароль Postgres
	dbURL := envRequire("FEED_DB_URL")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))
	natsURL := envOr("NATS_URL", "nats://localhost:4222")
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

	nc, err := nats.Connect(natsURL,
		nats.Name("feed"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	)
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer nc.Drain()
	logger.Info("nats connected", "url", natsURL)

	storyRepo := postgres.NewStoryRepo(pool)
	postRepo := postgres.NewPostRepo(pool)
	permLoader := permissions.NewPgLoader(pool)
	auditLogger := audit.New(pool)
	svc := service.New(storyRepo, postRepo, nc, permLoader, auditLogger)

	limiter, err := ratelimit.New(redisURL)
	if err != nil {
		logger.Warn("ratelimit init failed; rate limiting disabled", "error", err)
	} else {
		defer limiter.Close()
		logger.Info("rate limiter ready")
	}

	go cleanup.Run(ctx, svc, logger)

	// Phase 1 / REL-03: feature flag store (Plan 03).  Reserved-for-future —
	// feed пока не имеет flag-driven branching.
	flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)
	_ = flagStore

	h := handler.New(svc, signer, limiter, logger)

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
