// Package gw — WebSocket gateway: реестр активных соединений и их роутинг.
//
// Архитектура:
//   - Каждое подключение = (user_id, device_id) + NATS-подписка rt.user.{user_id}
//   - Stateless через NATS: любая instance может обслуживать любого юзера;
//     горизонтальное масштабирование работает потому что NATS делает fan-out.
//   - Рестарт gw сбрасывает sockets, но не теряет сообщений (они в Postgres
//     + outbox messaging-сервиса; клиент при reconnect загружает пропущенное
//     через GET /conversations/{id}/messages?after=<last_id>).
package gw

import (
	"sync"
	"sync/atomic"
)

// Registry — потокобезопасный map (user_id, device_id) → *Connection.
// Используется для: stop по logout, broadcast presence, метрик count.
type Registry struct {
	mu    sync.RWMutex
	conns map[string]map[string]*Connection // userID → deviceID → conn
	count atomic.Int64
}

func NewRegistry() *Registry {
	return &Registry{
		conns: make(map[string]map[string]*Connection),
	}
}

// Add — зарегистрировать соединение. Если такое (user, device) уже было —
// старое соединение закрывается (один device — один сокет).
func (r *Registry) Add(c *Connection) {
	r.mu.Lock()
	defer r.mu.Unlock()
	devices, ok := r.conns[c.userID]
	if !ok {
		devices = make(map[string]*Connection)
		r.conns[c.userID] = devices
	}
	if old, exists := devices[c.deviceID]; exists {
		// Replace: close old async to avoid deadlock with caller.
		go old.Close("replaced by new connection from same device")
	} else {
		r.count.Add(1)
	}
	devices[c.deviceID] = c
}

// Remove — снять соединение из реестра. Idempotent.
func (r *Registry) Remove(c *Connection) {
	r.mu.Lock()
	defer r.mu.Unlock()
	devices, ok := r.conns[c.userID]
	if !ok {
		return
	}
	if cur, exists := devices[c.deviceID]; exists && cur == c {
		delete(devices, c.deviceID)
		if len(devices) == 0 {
			delete(r.conns, c.userID)
		}
		r.count.Add(-1)
	}
}

// Count — сколько активных соединений (для метрик).
func (r *Registry) Count() int64 {
	return r.count.Load()
}

// CloseAll — graceful shutdown: закрыть все соединения.
func (r *Registry) CloseAll(reason string) {
	r.mu.Lock()
	conns := make([]*Connection, 0, r.count.Load())
	for _, devices := range r.conns {
		for _, c := range devices {
			conns = append(conns, c)
		}
	}
	r.mu.Unlock()
	for _, c := range conns {
		c.Close(reason)
	}
}
