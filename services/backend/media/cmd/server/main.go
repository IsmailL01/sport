// media/cmd/server — entry point.
//
// Конфиг через ENV:
//   MEDIA_HTTP_ADDR        :8086
//   MEDIA_DB_URL           postgres://...
//   IDENTITY_JWT_SECRET    общий с identity для verify
//   NATS_URL               nats://nats:4222 (Phase B3.2 events)
//   S3_ENDPOINT            s3.148-253-214-156.sslip.io (public host)
//   S3_ENDPOINT_INTERNAL   minio:9000 (для server-side stat/delete)
//   S3_ACCESS_KEY          MinIO root user
//   S3_SECRET_KEY          MinIO root password
//   S3_BUCKET              media
//   S3_REGION              us-east-1
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

	"github.com/runningecosystem/backend/media/internal/handler"
	"github.com/runningecosystem/backend/media/internal/repository/postgres"
	"github.com/runningecosystem/backend/media/internal/s3"
	"github.com/runningecosystem/backend/media/internal/service"
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

	addr := envOr("MEDIA_HTTP_ADDR", ":8086")
	dbURL := envOr("MEDIA_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))

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

	s3client, err := s3.New(ctx, s3.Config{
		PublicEndpoint:   envOr("S3_ENDPOINT", "localhost:9000"),
		InternalEndpoint: envOr("S3_ENDPOINT_INTERNAL", "minio:9000"),
		AccessKey:        envOr("S3_ACCESS_KEY", "minio"),
		SecretKey:        envOr("S3_SECRET_KEY", "miniosecret"),
		Bucket:           envOr("S3_BUCKET", "media"),
		Region:           envOr("S3_REGION", "us-east-1"),
	})
	if err != nil {
		return fmt.Errorf("init s3: %w", err)
	}
	logger.Info("s3 ready", "bucket", envOr("S3_BUCKET", "media"))

	repo := postgres.NewMediaRepo(pool)
	svc := service.New(repo, s3client)

	// Phase 1 / REL-03: feature flag store (Plan 03).  Reserved-for-future.
	flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)
	_ = flagStore

	h := handler.New(svc, signer, logger)

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
