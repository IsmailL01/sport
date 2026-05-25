// Package permissions — Phase 10 / ADR-0011 Amendment 6 friendship gate.
//
// Messaging service queries the are_friends() SQL function (from migration
// 0022_friend_requests) directly. Both services share the same Postgres pool
// so an inter-service HTTP call is avoided.
package permissions

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFriends — surface to callers; messaging handler maps to HTTP 403.
var ErrNotFriends = errors.New("users are not friends; friend request required")

// FriendshipGate wraps an are_friends() check against the shared DB.
//
// Why a struct (not a free function): the pool is wired once at service
// boot and reused per request; keeping it on a struct lets tests mock with
// a fake gate that has the same `RequireFriends(ctx, a, b)` shape.
type FriendshipGate struct {
	pool *pgxpool.Pool
}

func NewFriendshipGate(pool *pgxpool.Pool) *FriendshipGate {
	return &FriendshipGate{pool: pool}
}

// RequireFriends returns nil iff u1 and u2 have an accepted friend-request
// between them in either direction. Otherwise returns ErrNotFriends.
//
// Performance note: are_friends() is STABLE and uses partial indexes — the
// query plan is a single-row index lookup. Cost per call is microseconds;
// no need to cache at this layer.
func (g *FriendshipGate) RequireFriends(ctx context.Context, u1, u2 string) error {
	if u1 == u2 {
		// Sending to self is allowed by messaging service (saved-messages
		// scratchpad pattern). Friendship gate doesn't apply.
		return nil
	}
	var ok bool
	if err := g.pool.QueryRow(ctx, `SELECT are_friends($1, $2)`, u1, u2).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return ErrNotFriends
	}
	return nil
}
