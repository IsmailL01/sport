// Package cleanup — sidecar goroutine для удаления expired stories.
package cleanup

import (
	"context"
	"log/slog"
	"time"

	"github.com/runningecosystem/backend/feed/internal/service"
)

const interval = 1 * time.Hour

// Run — long-running goroutine, удаляет expired stories каждый час.
// Возвращается когда ctx Done.
func Run(ctx context.Context, svc *service.Service, log *slog.Logger) {
	log.Info("cleanup sidecar started", "interval", interval)
	// Сразу один прогон на старте (если что-то накопилось пока сервис лежал).
	if n, err := svc.CleanupExpired(ctx); err == nil && n > 0 {
		log.Info("cleanup ran", "deleted", n)
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Info("cleanup sidecar stopped")
			return
		case <-t.C:
			n, err := svc.CleanupExpired(ctx)
			if err != nil {
				log.Warn("cleanup failed", "error", err)
				continue
			}
			if n > 0 {
				log.Info("cleanup ran", "deleted", n)
			}
		}
	}
}
