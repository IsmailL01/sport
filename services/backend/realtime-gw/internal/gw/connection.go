package gw

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/nats-io/nats.go"
)

const (
	// Heartbeat / timeout настройки.
	pingInterval    = 25 * time.Second
	writeTimeout    = 10 * time.Second
	clientReadLimit = 64 * 1024 // 64 KB max single frame from client
	sendBuffer      = 64        // pending outbound frames (drop conn если переполнили)
)

// Connection — один WebSocket к одному device.
type Connection struct {
	ws       *websocket.Conn
	userID   string
	deviceID string
	sub      *nats.Subscription
	send     chan []byte
	log      *slog.Logger

	// closeOnce гарантирует idempotent Close().
	closeOnce sync.Once
	ctx       context.Context
	cancel    context.CancelFunc
}

// NewConnection — создать и начать работу. Делает:
//   - subscribe rt.user.{userID} на NATS
//   - запускает reader + writer goroutines
//   - запускает heartbeat
//
// Возвращается сразу. Goroutines работают пока ctx не cancel.
func NewConnection(
	ctx context.Context,
	ws *websocket.Conn,
	userID, deviceID string,
	nc *nats.Conn,
	registry *Registry,
	log *slog.Logger,
) (*Connection, error) {
	cctx, cancel := context.WithCancel(ctx)
	c := &Connection{
		ws:       ws,
		userID:   userID,
		deviceID: deviceID,
		send:     make(chan []byte, sendBuffer),
		log:      log.With("userId", userID, "deviceId", deviceID),
		ctx:      cctx,
		cancel:   cancel,
	}
	ws.SetReadLimit(clientReadLimit)

	subject := "rt.user." + userID
	sub, err := nc.Subscribe(subject, func(msg *nats.Msg) {
		// Non-blocking enqueue. Если клиент медленный — drop соединение.
		select {
		case c.send <- msg.Data:
		default:
			c.log.Warn("send buffer overflow, dropping connection")
			c.Close("send buffer overflow")
		}
	})
	if err != nil {
		cancel()
		return nil, err
	}
	c.sub = sub

	registry.Add(c)
	go c.readerLoop(registry)
	go c.writerLoop()
	go c.heartbeatLoop()

	c.log.Info("connection established")
	// Send ready frame так клиент знает что мы готовы.
	c.enqueue(map[string]any{"type": "ready", "userId": userID})
	return c, nil
}

func (c *Connection) enqueue(payload any) {
	b, err := json.Marshal(payload)
	if err != nil {
		c.log.Warn("marshal failed", "error", err)
		return
	}
	select {
	case c.send <- b:
	default:
		c.log.Warn("send buffer overflow on enqueue, dropping")
		c.Close("send buffer overflow")
	}
}

// readerLoop — читаем frames от клиента. На MVP клиент шлёт минимум:
//   - ping (мы отвечаем pong через writerLoop heartbeat — здесь просто игнорим)
//   - typing (TODO Phase B+: переслать в rt.conv.{id}.typing для членов чата)
//   - ack {lastEventId} (TODO: отметить где остановился)
//
// Сейчас всё что приходит — логируем и игнорируем.
func (c *Connection) readerLoop(registry *Registry) {
	defer c.Close("reader exit")
	defer registry.Remove(c)
	for {
		_, data, err := c.ws.Read(c.ctx)
		if err != nil {
			c.log.Info("reader exit", "error", err.Error(),
				"close_status", websocket.CloseStatus(err))
			return
		}
		// Логируем но не обрабатываем в MVP.
		if len(data) > 0 && c.log.Enabled(c.ctx, slog.LevelDebug) {
			c.log.Debug("client frame", "bytes", len(data))
		}
	}
}

// writerLoop — пишем frames из NATS в WS.
func (c *Connection) writerLoop() {
	defer c.Close("writer exit")
	for {
		select {
		case <-c.ctx.Done():
			return
		case data, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err := c.ws.Write(writeCtx, websocket.MessageText, data)
			cancel()
			if err != nil {
				c.log.Info("ws write error", "error", err.Error(),
					"close_status", websocket.CloseStatus(err))
				return
			}
		}
	}
}

// heartbeatLoop — отправляет ping каждые pingInterval. Если клиент не отвечает —
// websocket library сам обнаружит и закроет.
func (c *Connection) heartbeatLoop() {
	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case <-c.ctx.Done():
			return
		case <-t.C:
			pingCtx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err := c.ws.Ping(pingCtx)
			cancel()
			if err != nil {
				c.log.Debug("ping failed", "error", err)
				c.Close("ping failed")
				return
			}
		}
	}
}

// Close — graceful shutdown: unsubscribe NATS, закрыть WS, cancel ctx.
func (c *Connection) Close(reason string) {
	c.closeOnce.Do(func() {
		c.log.Info("closing", "reason", reason)
		if c.sub != nil {
			_ = c.sub.Unsubscribe()
		}
		c.cancel()
		_ = c.ws.Close(websocket.StatusNormalClosure, reason)
	})
}
