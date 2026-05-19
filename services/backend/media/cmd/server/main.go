// media/cmd/server — entry point.
//
// Конфиг через ENV:
//
//	MEDIA_HTTP_ADDR        OPTIONAL  :8086
//	MEDIA_DB_URL           REQUIRED  postgres://... (содержит пароль)
//	IDENTITY_JWT_SECRET    REQUIRED  ≥32 байта (enforced в pkg/auth.NewSigner)
//	NATS_URL               OPTIONAL  nats://nats:4222 (Phase B3.2 events)
//	S3_ENDPOINT            OPTIONAL  s3.148-253-214-156.sslip.io (public host)
//	S3_ENDPOINT_INTERNAL   OPTIONAL  minio:9000 (для server-side stat/delete)
//	S3_ACCESS_KEY          REQUIRED  MinIO root user
//	S3_SECRET_KEY          REQUIRED  MinIO root password
//	S3_BUCKET              OPTIONAL  media
//	S3_REGION              OPTIONAL  us-east-1
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

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/runningecosystem/backend/media/internal/handler"
	"github.com/runningecosystem/backend/media/internal/repository/postgres"
	"github.com/runningecosystem/backend/media/internal/s3"
	"github.com/runningecosystem/backend/media/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/pkg/observability"
)

// serviceName — Phase 5 / D-32. Используется как:
//   - "service" label на всех Prometheus метриках (Plan 05-04 / D-17)
//   - Sentry tag (Plan 05-05 — TBD)
//   - "service" attr в slog default attrs (Plan 05-03 / D-10)
const serviceName = "media"

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

	addr := envOr("MEDIA_HTTP_ADDR", ":8086")
	// REQUIRED — содержит пароль Postgres
	dbURL := envRequire("MEDIA_DB_URL")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))

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
		// REQUIRED — MinIO/S3 credentials
		AccessKey: envRequire("S3_ACCESS_KEY"),
		SecretKey: envRequire("S3_SECRET_KEY"),
		Bucket:    envOr("S3_BUCKET", "media"),
		Region:    envOr("S3_REGION", "us-east-1"),
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
