// notifications/cmd/server — Expo push fanout + in-app notifications.
//
// Конфиг через ENV:
//
//	NOTIFICATIONS_HTTP_ADDR  OPTIONAL  :8087
//	NOTIFICATIONS_DB_URL     REQUIRED  postgres://... (содержит пароль)
//	IDENTITY_JWT_SECRET      REQUIRED  ≥32 байта (enforced в pkg/auth.NewSigner)
//	NATS_URL                 OPTIONAL  nats://nats:4222
//	EXPO_ACCESS_TOKEN        OPTIONAL  v1.0 — empty => push fanout no-ops per
//	                                   docker-compose.prod.yml line 177 ${VAR:-}
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/runningecosystem/backend/notifications/internal/expopush"
	"github.com/runningecosystem/backend/notifications/internal/handler"
	"github.com/runningecosystem/backend/notifications/internal/repository/postgres"
	"github.com/runningecosystem/backend/notifications/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/pkg/observability"
)

// serviceName — Phase 5 / D-32. Используется как:
//   - "service" label на всех Prometheus метриках (Plan 05-04 / D-17)
//   - Sentry tag (Plan 05-05 — TBD)
//   - "service" attr в slog default attrs (Plan 05-03 / D-10)
const serviceName = "notifications"

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

	addr := envOr("NOTIFICATIONS_HTTP_ADDR", ":8087")
	// REQUIRED — содержит пароль Postgres
	dbURL := envRequire("NOTIFICATIONS_DB_URL")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))
	natsURL := envOr("NATS_URL", "nats://localhost:4222")
	// OPTIONAL v1.0 — empty => push fanout no-ops per docker-compose.prod.yml
	// line 177 ${EXPO_ACCESS_TOKEN:-} empty-default semantics. Phase 11/12
	// populates the prod value when HEALTH-04 Strava push is wired.
	expoToken := os.Getenv("EXPO_ACCESS_TOKEN")
	if expoToken == "" {
		logger.Warn("push fanout disabled — EXPO_ACCESS_TOKEN empty (v1.0 expected behavior)")
	}

	signer, err := auth.NewSigner(jwtSecret)
	if err != nil {
		return fmt.Errorf("init signer: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Phase 5 / Plan 05-05 / D-32 / D-38 — Sentry SDK + OTel TracerProvider.
	// Empty SENTRY_DSN_BACKEND → no-op closures (ADR-0010 amendment 2026-05-19 PM).
	sentryShutdown := observability.MustInitSentry(observability.SentryConfig{
		DSN:         os.Getenv("SENTRY_DSN_BACKEND"),
		Env:         envOr("ENV", "prod"),
		Release:     envOr("BUILD_VERSION", "dev"),
		ServiceName: serviceName,
		SampleRate:  1.0,
	})
	defer sentryShutdown()

	tracerShutdown := observability.MustInitTracer(ctx, observability.TracerConfig{
		ServiceName:  serviceName,
		OtlpEndpoint: os.Getenv("SENTRY_OTLP_ENDPOINT"),
		SentryDSN:    os.Getenv("SENTRY_DSN_BACKEND"),
		Env:          envOr("ENV", "prod"),
		Release:      envOr("BUILD_VERSION", "dev"),
	})
	defer tracerShutdown()

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
		nats.Name("notifications"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	)
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer nc.Drain()
	logger.Info("nats connected", "url", natsURL)

	deviceRepo := postgres.NewDeviceRepo(pool)
	notifRepo := postgres.NewNotificationRepo(pool)
	prefsRepo := postgres.NewPreferencesRepo(pool)

	expoClient := expopush.New(expoToken)
	svc := service.New(deviceRepo, notifRepo, prefsRepo, expoClient, logger)

	// NATS consumer: подписан на rt.user.* и обрабатывает каждый event.
	// Subject pattern: rt.user.<userID>; userID извлекается из subject.
	if _, err := nc.Subscribe("rt.user.*", func(msg *nats.Msg) {
		userID := strings.TrimPrefix(msg.Subject, "rt.user.")
		// Async — handler не должен блокировать NATS-ack callback.
		go func() {
			handlerCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			// Lightweight type-detect по event-полю в payload, чтобы не парсить
			// дважды. Service сам решит is-relevant.
			if err := svc.HandleMessageEvent(handlerCtx, userID, msg.Data); err != nil {
				logger.Warn("handle message event failed", "userId", userID, "error", err)
			}
			if err := svc.HandleFeedEvent(handlerCtx, userID, msg.Data); err != nil {
				logger.Warn("handle feed event failed", "userId", userID, "error", err)
			}
			if err := svc.HandleStoryEvent(handlerCtx, userID, msg.Data); err != nil {
				logger.Warn("handle story event failed", "userId", userID, "error", err)
			}
		}()
	}); err != nil {
		return fmt.Errorf("nats subscribe: %w", err)
	}
	logger.Info("nats consumer started", "subject", "rt.user.*")

	// Phase 1 / REL-03: feature flag store (Plan 03).  Reserved-for-future —
	// crash_telemetry_opt_in / tester_debug_logging могут влиять на
	// notifications routing в будущем.
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
	// Phase 5 / Plan 05-05 / D-32 — Promhttp(outer) → SentryRecovery → OtelHTTP →
	// clientversion → mux.
	rootHandler := observability.PromhttpMiddleware(serviceName,
		observability.SentryRecoveryMiddleware(
			observability.OtelHTTPMiddleware(serviceName, versionedMux)))

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
