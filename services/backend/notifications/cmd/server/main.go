// notifications/cmd/server — Expo push fanout + in-app notifications.
//
// Конфиг через ENV:
//   NOTIFICATIONS_HTTP_ADDR  :8087
//   NOTIFICATIONS_DB_URL     postgres://...
//   IDENTITY_JWT_SECRET      общий с identity для verify
//   NATS_URL                 nats://nats:4222
//   EXPO_ACCESS_TOKEN        опц. — для Expo Push API rate limit (auth)
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

	"github.com/runningecosystem/backend/notifications/internal/expopush"
	"github.com/runningecosystem/backend/notifications/internal/handler"
	"github.com/runningecosystem/backend/notifications/internal/repository/postgres"
	"github.com/runningecosystem/backend/notifications/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
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

	addr := envOr("NOTIFICATIONS_HTTP_ADDR", ":8087")
	dbURL := envOr("NOTIFICATIONS_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
	natsURL := envOr("NATS_URL", "nats://localhost:4222")
	expoToken := os.Getenv("EXPO_ACCESS_TOKEN")

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
		}()
	}); err != nil {
		return fmt.Errorf("nats subscribe: %w", err)
	}
	logger.Info("nats consumer started", "subject", "rt.user.*")

	h := handler.New(svc, signer, logger)
	srv := &http.Server{
		Addr:              addr,
		Handler:           h.Routes(),
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
