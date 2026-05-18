// Package memory — in-memory реализации репозиториев для unit-тестов
// AuthService без необходимости поднимать Postgres.
package memory

import (
	"context"
	"sync"
	"time"

	"github.com/runningecosystem/backend/identity/internal/domain"
)

// UserRepo — потокобезопасное хранилище в памяти.
type UserRepo struct {
	mu     sync.RWMutex
	byID   map[string]*domain.User
	nextID int
}

func NewUserRepo() *UserRepo {
	return &UserRepo{byID: make(map[string]*domain.User)}
}

func (r *UserRepo) Create(_ context.Context, u *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.byID {
		if existing.Email == u.Email {
			return domain.ErrEmailAlreadyExists
		}
	}
	if u.ID == "" {
		r.nextID++
		u.ID = "user-" + itoa(r.nextID)
	}
	if u.CreatedAt.IsZero() {
		u.CreatedAt = time.Now().UTC()
	}
	u.UpdatedAt = u.CreatedAt
	r.byID[u.ID] = u
	return nil
}

func (r *UserRepo) GetByID(_ context.Context, id string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if u, ok := r.byID[id]; ok {
		return cloneUser(u), nil
	}
	return nil, domain.ErrUserNotFound
}

func (r *UserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.byID {
		if u.Email == email {
			return cloneUser(u), nil
		}
	}
	return nil, domain.ErrUserNotFound
}

func cloneUser(u *domain.User) *domain.User {
	cp := *u
	return &cp
}

// RefreshTokenRepo — in-memory.
type RefreshTokenRepo struct {
	mu     sync.Mutex
	byHash map[string]*domain.RefreshToken
	nextID int
}

func NewRefreshTokenRepo() *RefreshTokenRepo {
	return &RefreshTokenRepo{byHash: make(map[string]*domain.RefreshToken)}
}

func (r *RefreshTokenRepo) Create(_ context.Context, t *domain.RefreshToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	t.ID = "tok-" + itoa(r.nextID)
	if t.CreatedAt.IsZero() {
		t.CreatedAt = time.Now().UTC()
	}
	cp := *t
	r.byHash[t.TokenHash] = &cp
	return nil
}

func (r *RefreshTokenRepo) GetByHash(_ context.Context, tokenHash string) (*domain.RefreshToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if t, ok := r.byHash[tokenHash]; ok {
		cp := *t
		return &cp, nil
	}
	return nil, domain.ErrTokenNotFound
}

func (r *RefreshTokenRepo) Revoke(_ context.Context, id string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.byHash {
		if t.ID == id && t.RevokedAt == nil {
			cp := at
			t.RevokedAt = &cp
			return nil
		}
	}
	return domain.ErrTokenNotFound
}

func (r *RefreshTokenRepo) RevokeAllForUser(_ context.Context, userID string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.byHash {
		if t.UserID == userID && t.RevokedAt == nil {
			cp := at
			t.RevokedAt = &cp
		}
	}
	return nil
}

// itoa — мини-замена strconv.Itoa чтобы не таскать import только ради него.
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
