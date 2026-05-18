// Package ratelimit — Redis-backed sliding-window rate limiter.
// Phase 8 / I.
//
// Используется hot endpoints для защиты от bots / спама.
// Алгоритм: ZSET в Redis где member = unique-id (timestamp_ns), score = ts.
// На каждый запрос:
//   1. ZREMRANGEBYSCORE до now-window — выкидываем устаревшее
//   2. ZCARD — посчитать оставшееся
//   3. Если < limit: ZADD + EXPIRE; OK
//      Иначе: deny + return Retry-After
//
// Один RTT через MULTI/EXEC pipeline. Lua-script мог бы сэкономить ещё RTT,
// но на ≤1k req/s особо не важно.
//
// На Redis-down (graceful degrade): Allow=true, log warn — не валим
// production-трафик из-за инфраструктурного сбоя.

package ratelimit

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter — sliding window per-key.
type Limiter struct {
	rdb    *redis.Client
	prefix string
}

// New — конструктор. redisURL формата `redis://host:port/db`.
func New(redisURL string) (*Limiter, error) {
	opts, err := parseRedisURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opts)
	// Не блокируем старт сервиса — Ping асинхронно.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = rdb.Ping(ctx).Err()
	}()
	return &Limiter{rdb: rdb, prefix: "rl:"}, nil
}

// Decision — результат проверки.
type Decision struct {
	Allow bool
	// Retry-After в секундах (целое; ~через сколько освободится слот).
	RetryAfter int
	// Сколько запросов осталось в окне (для UI).
	Remaining int
}

// Check — основной метод. key = `<scope>:<actorID>` (например "msg:abc123").
// limit = max events в окне; window = длительность окна.
//
// Возвращает Decision. На Redis-down → Allow=true (graceful).
func (l *Limiter) Check(
	ctx context.Context, key string, limit int, window time.Duration,
) Decision {
	if l == nil || l.rdb == nil {
		return Decision{Allow: true, Remaining: limit}
	}
	now := time.Now().UnixNano()
	windowNs := window.Nanoseconds()
	cutoff := now - windowNs
	rkey := l.prefix + key

	// Generate unique member: timestamp_ns + random suffix чтобы коллизий
	// не было даже при concurrent ZADD в ту же ns.
	var rnd [4]byte
	_, _ = rand.Read(rnd[:])
	member := strconv.FormatInt(now, 10) + "-" + strconv.FormatUint(uint64(binary.BigEndian.Uint32(rnd[:])), 36)

	pipe := l.rdb.Pipeline()
	pipe.ZRemRangeByScore(ctx, rkey, "0", strconv.FormatInt(cutoff, 10))
	zaddCmd := pipe.ZAdd(ctx, rkey, redis.Z{Score: float64(now), Member: member})
	zcardCmd := pipe.ZCard(ctx, rkey)
	pipe.Expire(ctx, rkey, window+1*time.Second)

	if _, err := pipe.Exec(ctx); err != nil {
		// Redis-down — graceful allow.
		return Decision{Allow: true, Remaining: limit}
	}
	if err := zaddCmd.Err(); err != nil {
		return Decision{Allow: true, Remaining: limit}
	}
	count := zcardCmd.Val()

	if count > int64(limit) {
		// Превышен — найдём oldest member чтобы посчитать Retry-After.
		// Берём ZRANGEBYSCORE -inf +inf LIMIT 0 1 → score = oldest_ns.
		zr, err := l.rdb.ZRangeByScoreWithScores(ctx, rkey, &redis.ZRangeBy{
			Min: "-inf", Max: "+inf", Offset: 0, Count: 1,
		}).Result()
		retry := int(window.Seconds()) // worst case
		if err == nil && len(zr) > 0 {
			oldest := int64(zr[0].Score)
			delta := (oldest + windowNs - now) / int64(time.Second)
			if delta < 1 {
				delta = 1
			}
			retry = int(delta)
		}
		// Удаляем только что добавленного (он не считается — мы deny-им).
		_ = l.rdb.ZRem(ctx, rkey, member).Err()
		return Decision{Allow: false, RetryAfter: retry, Remaining: 0}
	}

	return Decision{
		Allow:     true,
		Remaining: limit - int(count),
	}
}

// Close — освободить Redis pool.
func (l *Limiter) Close() error {
	if l == nil || l.rdb == nil {
		return nil
	}
	return l.rdb.Close()
}

// parseRedisURL — упрощённый парсер `redis://host:port/db`.
func parseRedisURL(s string) (*redis.Options, error) {
	if s == "" {
		return nil, errors.New("empty redis URL")
	}
	u, err := url.Parse(s)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "redis" {
		return nil, errors.New("expected redis:// scheme")
	}
	db := 0
	if p := strings.TrimPrefix(u.Path, "/"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			db = v
		}
	}
	return &redis.Options{
		Addr:     u.Host,
		DB:       db,
		Password: u.User.Username(), // если задан password
	}, nil
}
