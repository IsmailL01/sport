// Package outbox — sidecar для exactly-once publishing event'ов в NATS.
// Запускается goroutine из main(), периодически SELECT непубликованных rows
// и publish их в NATS (core pub-sub, ephemeral). После success → MarkPublished.
package outbox

import (
	"context"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"

	"github.com/runningecosystem/backend/messaging/internal/repository/postgres"
)

const (
	pollInterval = 200 * time.Millisecond
	batchSize    = 100
)

// Run — long-running publisher loop. Возвращается когда ctx Done.
func Run(ctx context.Context, repo *postgres.OutboxRepo, nc *nats.Conn, log *slog.Logger) {
	log.Info("outbox publisher started")
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info("outbox publisher stopped")
			return
		case <-ticker.C:
			drainBatch(ctx, repo, nc, log)
		}
	}
}

func drainBatch(ctx context.Context, repo *postgres.OutboxRepo, nc *nats.Conn, log *slog.Logger) {
	rows, err := repo.FetchUnpublished(ctx, batchSize)
	if err != nil {
		log.Warn("outbox fetch failed", "error", err)
		return
	}
	if len(rows) == 0 {
		return
	}
	var publishedIDs []int64
	for _, r := range rows {
		if err := nc.Publish(r.EventSubject, r.Payload); err != nil {
			log.Warn("nats publish failed", "subject", r.EventSubject, "error", err)
			continue
		}
		publishedIDs = append(publishedIDs, r.ID)
	}
	// Force flush — guarantees publish before MarkPublished.
	if err := nc.Flush(); err != nil {
		log.Warn("nats flush failed", "error", err)
		return
	}
	if err := repo.MarkPublished(ctx, publishedIDs); err != nil {
		log.Warn("outbox mark published failed", "error", err)
	}
}
