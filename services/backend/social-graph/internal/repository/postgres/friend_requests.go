// Package postgres — friend_requests repository (Phase 10 / ADR-0011 Amendment 6).
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

// isUniqueViolation — Postgres SQLSTATE 23505.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

type FriendRequestRepo struct {
	pool *pgxpool.Pool
}

func NewFriendRequestRepo(pool *pgxpool.Pool) *FriendRequestRepo {
	return &FriendRequestRepo{pool: pool}
}

// Create inserts a pending friend-request row. Returns ErrSelfTarget if
// sender == receiver. Returns ErrFriendRequestExists if a row already
// exists for this (sender, receiver) pair regardless of status.
//
// Pre-condition (caller responsibility): caller has already checked that
// the pair is NOT already friends (use AreFriends() first). This check
// could move into a single transaction here in v1.0.1 — for now the call
// pattern in service layer handles it.
func (r *FriendRequestRepo) Create(ctx context.Context, senderID, receiverID string) (*domain.FriendRequest, error) {
	if senderID == receiverID {
		return nil, domain.ErrSelfTarget
	}
	var fr domain.FriendRequest
	var respondedAt *time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO friend_requests (sender_id, receiver_id, status)
		 VALUES ($1, $2, 'pending')
		 RETURNING id, sender_id, receiver_id, status, created_at, responded_at`,
		senderID, receiverID,
	).Scan(&fr.ID, &fr.SenderID, &fr.ReceiverID, &fr.Status, &fr.CreatedAt, &respondedAt)
	if err != nil {
		// Unique violation on (sender_id, receiver_id) — pair already has a row.
		// We surface a friendly error; caller can decide whether to flip status
		// back to pending or treat as no-op based on existing status.
		if isUniqueViolation(err) {
			return nil, domain.ErrFriendRequestExists
		}
		return nil, err
	}
	fr.RespondedAt = respondedAt
	return &fr, nil
}

// GetByID returns the request row by primary key. Returns ErrNotFound if missing.
func (r *FriendRequestRepo) GetByID(ctx context.Context, id string) (*domain.FriendRequest, error) {
	var fr domain.FriendRequest
	var respondedAt *time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT id, sender_id, receiver_id, status, created_at, responded_at
		 FROM friend_requests WHERE id = $1`,
		id,
	).Scan(&fr.ID, &fr.SenderID, &fr.ReceiverID, &fr.Status, &fr.CreatedAt, &respondedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	fr.RespondedAt = respondedAt
	return &fr, nil
}

// GetByPair returns the row for a (sender, receiver) pair if one exists
// regardless of status. Returns ErrNotFound otherwise. Used by Service.Send
// to detect "I already had a rejected request" and flip back to pending.
func (r *FriendRequestRepo) GetByPair(ctx context.Context, senderID, receiverID string) (*domain.FriendRequest, error) {
	var fr domain.FriendRequest
	var respondedAt *time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT id, sender_id, receiver_id, status, created_at, responded_at
		 FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2`,
		senderID, receiverID,
	).Scan(&fr.ID, &fr.SenderID, &fr.ReceiverID, &fr.Status, &fr.CreatedAt, &respondedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	fr.RespondedAt = respondedAt
	return &fr, nil
}

// UpdateStatus transitions the row to a terminal state. responded_at is
// stamped server-side. Returns ErrNotFound if no row, or no-op-error if
// the row isn't in 'pending' state (caller shouldn't transition twice).
func (r *FriendRequestRepo) UpdateStatus(ctx context.Context, id string, newStatus domain.FriendRequestStatus) error {
	res, err := r.pool.Exec(ctx,
		`UPDATE friend_requests
		 SET status = $2, responded_at = now()
		 WHERE id = $1 AND status = 'pending'`,
		id, string(newStatus),
	)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return domain.ErrFriendRequestNotPending
	}
	return nil
}

// ResetToPending flips a row from rejected/cancelled back to pending. Used
// when sender re-sends a friend request after prior rejection. Idempotent
// for already-pending. Returns ErrAlreadyFriends if status == 'accepted'.
func (r *FriendRequestRepo) ResetToPending(ctx context.Context, id string) error {
	res, err := r.pool.Exec(ctx,
		`UPDATE friend_requests
		 SET status = 'pending', responded_at = NULL
		 WHERE id = $1 AND status IN ('rejected', 'cancelled', 'pending')`,
		id,
	)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		// Either NotFound or status='accepted' — distinguish.
		fr, ferr := r.GetByID(ctx, id)
		if ferr != nil {
			return ferr
		}
		if fr.Status == domain.FriendRequestAccepted {
			return domain.ErrAlreadyFriends
		}
		return domain.ErrNotFound
	}
	return nil
}

// ListIncomingPending returns pending requests where userID is the receiver.
// Ordered by created_at DESC, limited by `limit`.
func (r *FriendRequestRepo) ListIncomingPending(ctx context.Context, userID string, limit int) ([]*domain.FriendRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, sender_id, receiver_id, status, created_at, responded_at
		 FROM friend_requests
		 WHERE receiver_id = $1 AND status = 'pending'
		 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFriendRequests(rows)
}

// ListOutgoingPending returns pending requests where userID is the sender.
func (r *FriendRequestRepo) ListOutgoingPending(ctx context.Context, userID string, limit int) ([]*domain.FriendRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, sender_id, receiver_id, status, created_at, responded_at
		 FROM friend_requests
		 WHERE sender_id = $1 AND status = 'pending'
		 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFriendRequests(rows)
}

// AreFriends returns true iff users have an accepted friend-request between
// them in either direction. Delegates to are_friends() SQL function from
// migration 0022_friend_requests for canonical implementation.
func (r *FriendRequestRepo) AreFriends(ctx context.Context, u1, u2 string) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `SELECT are_friends($1, $2)`, u1, u2).Scan(&ok)
	return ok, err
}

// ListFriends returns userIDs of all accepted friends for the given user.
// Both sender and receiver sides considered.
func (r *FriendRequestRepo) ListFriends(ctx context.Context, userID string, limit int) ([]string, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS friend_id
		 FROM friend_requests
		 WHERE status = 'accepted' AND (sender_id = $1 OR receiver_id = $1)
		 ORDER BY responded_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]string, 0, limit)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func scanFriendRequests(rows pgx.Rows) ([]*domain.FriendRequest, error) {
	out := make([]*domain.FriendRequest, 0, 16)
	for rows.Next() {
		var fr domain.FriendRequest
		var respondedAt *time.Time
		if err := rows.Scan(&fr.ID, &fr.SenderID, &fr.ReceiverID, &fr.Status, &fr.CreatedAt, &respondedAt); err != nil {
			return nil, err
		}
		fr.RespondedAt = respondedAt
		out = append(out, &fr)
	}
	return out, rows.Err()
}
