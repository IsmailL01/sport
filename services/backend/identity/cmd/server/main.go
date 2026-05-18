// identity/cmd/server — entry point identity-сервиса.
//
// Конфиг через ENV:
//
//	IDENTITY_HTTP_ADDR        OPTIONAL  :8081
//	IDENTITY_DB_URL           REQUIRED  postgres://... (содержит пароль)
//	IDENTITY_JWT_SECRET       REQUIRED  ≥32 байта (enforced в pkg/auth.NewSigner)
//	IDENTITY_DEV_MODE         OPTIONAL  default false; refused if DB URL non-local
//	CLIENT_MIN_VERSION        OPTIONAL  default 1.0.0
//	FORCE_UPDATE_URL_*        OPTIONAL  default ""
//
// Использование:
//
//	make run-identity
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

	"github.com/runningecosystem/backend/identity/internal/handler"
	"github.com/runningecosystem/backend/identity/internal/repository/postgres"
	"github.com/runningecosystem/backend/identity/internal/service"
	"github.com/runningecosystem/backend/pkg/audit"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
	"github.com/runningecosystem/backend/pkg/featureflags"
)

// exitFunc — swappable hook для тестирования envRequire.
// Default = os.Exit. Тесты подменяют на recording-stub.
var exitFunc = os.Exit

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	addr := envOr("IDENTITY_HTTP_ADDR", ":8081")
	// REQUIRED — содержит пароль Postgres
	dbURL := envRequire("IDENTITY_DB_URL")
	// REQUIRED — JWT signing key (длина ≥32 enforced в pkg/auth/jwt.go:43-46)
	jwtSecret := []byte(envRequire("IDENTITY_JWT_SECRET"))
	// DevMode = выводить devCode в response /auth/request-code (для smoke,
	// staging). Дефолт false; включить вручную для local dev.
	devMode := envOr("IDENTITY_DEV_MODE", "false") == "true"

	// Phase 2 / SEC-05: prod-detection guard. Если DEV_MODE включён в окружении,
	// где DB URL НЕ указывает на localhost — это почти наверняка ошибка оператора
	// (stale env vars, copy-paste из dev в prod). Отказываемся стартовать.
	if devMode {
		if !isLocalDBURL(dbURL) {
			slog.Error(
				"REFUSING TO START: IDENTITY_DEV_MODE=true but database is not localhost",
				"db_host", redactPassword(dbURL),
			)
			os.Exit(1)
		}
		slog.Warn("IDENTITY_DEV_MODE=true — OTP devCode WILL be returned in /auth/request-code; this MUST NOT happen in prod")
	}

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
	logger.Info("db connected", "url", redactPassword(dbURL))

	// Phase 1 / REL-03: feature flag store + audit logger constructed BEFORE
	// handler — handler reads/writes flags + writes audit on admin actions.
	// 30s TTL per CONTEXT D-11 (cross-service cache invalidation via TTL).
	flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)
	auditLogger := audit.New(pool)

	userRepo := postgres.NewUserRepo(pool)
	tokenRepo := postgres.NewRefreshTokenRepo(pool)
	otpRepo := postgres.NewOtpRepo(pool)
	authSvc := service.NewAuthService(userRepo, tokenRepo, signer)
	otpSvc := service.NewOtpService(otpRepo, userRepo, tokenRepo, authSvc)
	h := handler.NewAuthHandler(authSvc, otpSvc, signer, logger, devMode).
		WithFeatureFlags(flagStore, auditLogger, pool)
	logger.Info("identity ready", "devMode", devMode)

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
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
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
// через exitFunc(1), если переменная отсутствует или пустая.
// Phase 2 / SEC-09: fail-fast при отсутствии секрета.
func envRequire(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var missing", "key", key)
		exitFunc(1)
	}
	return v
}

// redactPassword скрывает пароль в URL для логов.
// postgres://user:secret@host/db → postgres://user:***@host/db
func redactPassword(url string) string {
	at := -1
	for i, c := range url {
		if c == '@' {
			at = i
			break
		}
	}
	if at < 0 {
		return url
	}
	colon := -1
	for i := at; i >= 0; i-- {
		if url[i] == ':' && i > 0 && url[i-1] != '/' {
			colon = i
			break
		}
	}
	if colon < 0 {
		return url
	}
	return url[:colon+1] + "***" + url[at:]
}

// isLocalDBURL возвращает true если URL указывает на локальный/dev-Postgres.
// Используется для prod-detection guard в IDENTITY_DEV_MODE.
// Phase 2 / SEC-05: substring-match по 4 known-local префиксам:
//   - localhost
//   - 127.0.0.1
//   - host.docker.internal (Docker for Mac)
//   - @postgres: (Docker network DNS)
//
// False-positives (например, URL содержит "localhost" в имени БД, но не в host)
// допустимы — это conservative-safe direction: ошибаемся в сторону allow,
// а не блокируем легитимный dev-setup.
func isLocalDBURL(url string) bool {
	return strings.Contains(url, "localhost") ||
		strings.Contains(url, "127.0.0.1") ||
		strings.Contains(url, "host.docker.internal") ||
		strings.Contains(url, "@postgres:")
}
