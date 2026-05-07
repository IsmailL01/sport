// Package memory — in-memory реализации для unit-тестов.
package memory

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
)

type SessionRepo struct {
	mu       sync.RWMutex
	byID     map[string]*domain.Session
	byClient map[string]*domain.Session // key = userID + ":" + clientSessionID
	nextID   int
}

func NewSessionRepo() *SessionRepo {
	return &SessionRepo{
		byID:     make(map[string]*domain.Session),
		byClient: make(map[string]*domain.Session),
	}
}

func (r *SessionRepo) UpsertByClientID(_ context.Context, s *domain.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := clientKey(s.UserID, s.ClientSessionID)
	if existing, ok := r.byClient[key]; ok {
		s.ID = existing.ID
		s.CreatedAt = existing.CreatedAt
		s.UpdatedAt = time.Now().UTC()
		cp := *s
		r.byClient[key] = &cp
		r.byID[s.ID] = &cp
		return nil
	}
	if s.ID == "" {
		r.nextID++
		s.ID = "sess-" + itoa(r.nextID)
	}
	now := time.Now().UTC()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	s.UpdatedAt = now
	cp := *s
	r.byID[s.ID] = &cp
	r.byClient[key] = &cp
	return nil
}

func (r *SessionRepo) GetByID(_ context.Context, id string) (*domain.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if s, ok := r.byID[id]; ok {
		cp := *s
		return &cp, nil
	}
	return nil, domain.ErrSessionNotFound
}

func (r *SessionRepo) ListByUser(_ context.Context, userID string, limit int) ([]*domain.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []*domain.Session
	for _, s := range r.byID {
		if s.UserID == userID {
			cp := *s
			result = append(result, &cp)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].StartedAt.After(result[j].StartedAt)
	})
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

func (r *SessionRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.byID[id]
	if !ok {
		return domain.ErrSessionNotFound
	}
	delete(r.byID, id)
	delete(r.byClient, clientKey(s.UserID, s.ClientSessionID))
	return nil
}

type PointRepo struct {
	mu     sync.Mutex
	bySess map[string][]*domain.Point
}

func NewPointRepo() *PointRepo {
	return &PointRepo{bySess: make(map[string][]*domain.Point)}
}

func (r *PointRepo) AppendBatch(_ context.Context, sessionID string, points []*domain.Point) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	existing := r.bySess[sessionID]
	seen := make(map[int64]bool, len(existing))
	for _, p := range existing {
		seen[p.Timestamp.UnixNano()] = true
	}
	inserted := 0
	for _, p := range points {
		key := p.Timestamp.UnixNano()
		if seen[key] {
			continue
		}
		seen[key] = true
		cp := *p
		cp.SessionID = sessionID
		existing = append(existing, &cp)
		inserted++
	}
	sort.Slice(existing, func(i, j int) bool {
		return existing[i].Timestamp.Before(existing[j].Timestamp)
	})
	r.bySess[sessionID] = existing
	return inserted, nil
}

func (r *PointRepo) ListBySession(_ context.Context, sessionID string) ([]*domain.Point, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	src := r.bySess[sessionID]
	result := make([]*domain.Point, len(src))
	for i, p := range src {
		cp := *p
		result[i] = &cp
	}
	return result, nil
}

func clientKey(userID string, clientSessionID int64) string {
	return userID + ":" + i64toa(clientSessionID)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func i64toa(n int64) string {
	return itoa(int(n))
}
