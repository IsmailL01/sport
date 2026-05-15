// identity/cmd/server — entry point identity-сервиса.
//
// Конфиг через ENV:
//   IDENTITY_HTTP_ADDR        :8081
//   IDENTITY_DB_URL           postgres://...
//   IDENTITY_JWT_SECRET       (>=32 байта)
//
// Использование:
//   make run-identity
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

	"github.com/runningecosystem/backend/identity/internal/handler"
	"github.com/runningecosystem/backend/identity/internal/repository/postgres"
	"github.com/runningecosystem/backend/identity/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/clientversion"
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

	addr := envOr("IDENTITY_HTTP_ADDR", ":8081")
	dbURL := envOr("IDENTITY_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
	// DevMode = выводить devCode в response /auth/request-code (для smoke,
	// staging). В production выставить IDENTITY_DEV_MODE=false.
	devMode := envOr("IDENTITY_DEV_MODE", "true") == "true"

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

	userRepo := postgres.NewUserRepo(pool)
	tokenRepo := postgres.NewRefreshTokenRepo(pool)
	otpRepo := postgres.NewOtpRepo(pool)
	authSvc := service.NewAuthService(userRepo, tokenRepo, signer)
	otpSvc := service.NewOtpService(otpRepo, userRepo, tokenRepo, authSvc)
	h := handler.NewAuthHandler(authSvc, otpSvc, signer, logger, devMode)
	logger.Info("identity ready", "devMode", devMode)

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
