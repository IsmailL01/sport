// Package service — friend-request business logic (Phase 10 / ADR-0011 Amendment 6).
package service

import (
	"context"
	"errors"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

// SendFriendRequest creates a pending request from senderID → receiverID.
// Behavior matrix:
//   - sender == receiver           → ErrSelfTarget
//   - already friends              → ErrAlreadyFriends
//   - existing pending row         → idempotent return of that row
//   - existing rejected/cancelled  → flip back to pending
//   - no prior row                 → create new pending row
func (s *Service) SendFriendRequest(ctx context.Context, senderID, receiverID string) (*domain.FriendRequest, error) {
	if senderID == receiverID {
		return nil, domain.ErrSelfTarget
	}

	// Check if already friends (canonical SQL function).
	areFriends, err := s.friendReqs.AreFriends(ctx, senderID, receiverID)
	if err != nil {
		return nil, err
	}
	if areFriends {
		return nil, domain.ErrAlreadyFriends
	}

	// Check for existing row from this sender to this receiver.
	existing, err := s.friendReqs.GetByPair(ctx, senderID, receiverID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	if existing != nil {
		// Idempotent: already pending → return same row.
		if existing.Status == domain.FriendRequestPending {
			return existing, nil
		}
		// Rejected/cancelled → flip back to pending.
		if err := s.friendReqs.ResetToPending(ctx, existing.ID); err != nil {
			return nil, err
		}
		// Re-read with updated status / responded_at cleared.
		return s.friendReqs.GetByID(ctx, existing.ID)
	}

	// Also check inverse-direction row: receiver previously sent to sender?
	// If yes and it's pending, this is essentially "accept" semantics — but
	// for clarity we surface as ErrFriendRequestExists so caller decides.
	inverse, err := s.friendReqs.GetByPair(ctx, receiverID, senderID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	if inverse != nil && inverse.Status == domain.FriendRequestPending {
		return nil, domain.ErrFriendRequestExists
	}

	// New row.
	return s.friendReqs.Create(ctx, senderID, receiverID)
}

// AcceptFriendRequest transitions a pending request → accepted iff actorID
// is the receiver (only receiver can accept). Side-effect: also updates
// derived canDm cache if/when implemented; for now canDm is read on-the-fly
// via are_friends().
func (s *Service) AcceptFriendRequest(ctx context.Context, actorID, requestID string) error {
	fr, err := s.friendReqs.GetByID(ctx, requestID)
	if err != nil {
		return err
	}
	if fr.ReceiverID != actorID {
		return domain.ErrFriendRequestNotOwned
	}
	if fr.Status != domain.FriendRequestPending {
		return domain.ErrFriendRequestNotPending
	}
	return s.friendReqs.UpdateStatus(ctx, requestID, domain.FriendRequestAccepted)
}

// RejectFriendRequest — receiver rejects a pending request.
func (s *Service) RejectFriendRequest(ctx context.Context, actorID, requestID string) error {
	fr, err := s.friendReqs.GetByID(ctx, requestID)
	if err != nil {
		return err
	}
	if fr.ReceiverID != actorID {
		return domain.ErrFriendRequestNotOwned
	}
	if fr.Status != domain.FriendRequestPending {
		return domain.ErrFriendRequestNotPending
	}
	return s.friendReqs.UpdateStatus(ctx, requestID, domain.FriendRequestRejected)
}

// CancelFriendRequest — sender cancels their own pending request.
func (s *Service) CancelFriendRequest(ctx context.Context, actorID, requestID string) error {
	fr, err := s.friendReqs.GetByID(ctx, requestID)
	if err != nil {
		return err
	}
	if fr.SenderID != actorID {
		return domain.ErrFriendRequestNotOwned
	}
	if fr.Status != domain.FriendRequestPending {
		return domain.ErrFriendRequestNotPending
	}
	return s.friendReqs.UpdateStatus(ctx, requestID, domain.FriendRequestCancelled)
}

// ListIncomingFriendRequests returns pending requests where actorID is receiver.
func (s *Service) ListIncomingFriendRequests(ctx context.Context, actorID string, limit int) ([]*domain.FriendRequest, error) {
	return s.friendReqs.ListIncomingPending(ctx, actorID, limit)
}

// ListOutgoingFriendRequests returns pending requests where actorID is sender.
func (s *Service) ListOutgoingFriendRequests(ctx context.Context, actorID string, limit int) ([]*domain.FriendRequest, error) {
	return s.friendReqs.ListOutgoingPending(ctx, actorID, limit)
}

// ListFriends returns userIDs of accepted friends for actorID.
func (s *Service) ListFriends(ctx context.Context, actorID string, limit int) ([]string, error) {
	return s.friendReqs.ListFriends(ctx, actorID, limit)
}

// AreFriends — public wrapper around the canonical SQL check. Used by
// messaging service through HTTP call to social-graph's /friends/check.
func (s *Service) AreFriends(ctx context.Context, u1, u2 string) (bool, error) {
	return s.friendReqs.AreFriends(ctx, u1, u2)
}
