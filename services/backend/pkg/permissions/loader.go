package permissions

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// SubjectLoader — abstraction для load Subject из persistent storage.
//
// Конкретная имплементация — PgLoader ниже использует pgx pool. Сервисы
// которые шарят Postgres (feed, messaging, social-graph, notifications)
// могут переиспользовать его. Если кто-то на gRPC/HTTP — пишут свою.
type SubjectLoader interface {
	LoadSubject(ctx context.Context, userID string) (Subject, error)
}

// PgRow — minimal interface для pgx Row (для test mock-ов без import-а pgxpool).
type PgRow interface {
	Scan(dest ...any) error
}

// PgQuerier — minimal interface для pgx pool.
type PgQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PgLoader — load profile.global_role + banned_until из Postgres.
//
// Single-PK lookup на profiles.user_id — O(1) с index. Fail-soft:
// если profile отсутствует (NotFound), возвращает Subject с GlobalRole=user
// и IsAuthenticated=true (lazy-create профиля делается в social-graph).
type PgLoader struct {
	q PgQuerier
}

func NewPgLoader(q PgQuerier) *PgLoader { return &PgLoader{q: q} }

func (l *PgLoader) LoadSubject(ctx context.Context, userID string) (Subject, error) {
	if userID == "" {
		return Subject{}, errors.New("empty userID")
	}
	var role string
	var banned *time.Time
	err := l.q.QueryRow(ctx, `
		SELECT COALESCE(global_role, 'user'), banned_until
		FROM profiles
		WHERE user_id = $1`, userID).Scan(&role, &banned)
	if err != nil {
		// Profile not yet created (lazy-create on first /profiles GET).
		if errors.Is(err, pgx.ErrNoRows) {
			return Subject{
				UserID:          userID,
				GlobalRole:      GlobalUser,
				IsAuthenticated: true,
				Attributes:      Attributes{"is_premium": false},
			}, nil
		}
		return Subject{}, err
	}
	gr := GlobalRole(role)
	return Subject{
		UserID:          userID,
		GlobalRole:      gr,
		BannedUntil:     banned,
		IsAuthenticated: true,
		Attributes: Attributes{
			// Phase L: is_premium derived from global_role; будущее — отдельная
			// колонка subscription_until либо отдельная таблица subscriptions.
			"is_premium": gr == GlobalPremium || gr == GlobalModerator || gr == GlobalAdmin,
		},
	}, nil
}
