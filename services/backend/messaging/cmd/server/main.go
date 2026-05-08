// messaging/cmd/server — entry point.
// Конфиг через ENV:
//   MESSAGING_HTTP_ADDR    :8083
//   MESSAGING_DB_URL       postgres://...
//   IDENTITY_JWT_SECRET    общий с identity для verify
//   NATS_URL               nats://nats:4222
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

	"github.com/runningecosystem/backend/messaging/internal/handler"
	"github.com/runningecosystem/backend/messaging/internal/outbox"
	"github.com/runningecosystem/backend/messaging/internal/repository/postgres"
	"github.com/runningecosystem/backend/messaging/internal/service"
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

	addr := envOr("MESSAGING_HTTP_ADDR", ":8083")
	dbURL := envOr("MESSAGING_DB_URL", "postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable")
	jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
	natsURL := envOr("NATS_URL", "nats://localhost:4222")

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
		nats.Name("messaging"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	)
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer nc.Drain()
	logger.Info("nats connected", "url", natsURL)

	convRepo := postgres.NewConversationRepo(pool)
	memRepo := postgres.NewMemberRepo(pool)
	msgRepo := postgres.NewMessageRepo(pool)
	outboxRepo := postgres.NewOutboxRepo(pool)

	svc := service.New(convRepo, memRepo, msgRepo)
	h := handler.New(svc, signer, logger)

	// Outbox publisher sidecar.
	go outbox.Run(ctx, outboxRepo, nc, logger)

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
