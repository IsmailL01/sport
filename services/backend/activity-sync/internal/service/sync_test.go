package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
	"github.com/runningecosystem/backend/activity-sync/internal/repository/memory"
)

func newSvc() *SyncService {
	return NewSyncService(memory.NewSessionRepo(), memory.NewPointRepo())
}

func sess(uid string, clientID int64, t time.Time) *domain.Session {
	return &domain.Session{
		UserID:          uid,
		ClientSessionID: clientID,
		StartedAt:       t,
	}
}

func TestUpsertSession_Idempotent(t *testing.T) {
	s := newSvc()
	ctx := context.Background()

	first, err := s.UpsertSession(ctx, "u1", sess("u1", 1700, time.Unix(1700, 0)))
	if err != nil {
		t.Fatal(err)
	}

	again, err := s.UpsertSession(ctx, "u1", sess("u1", 1700, time.Unix(1700, 0)))
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != first.ID {
		t.Errorf("upsert created new ID: %q vs %q", again.ID, first.ID)
	}
}

func TestGetSession_OwnershipCheck(t *testing.T) {
	s := newSvc()
	ctx := context.Background()
	created, _ := s.UpsertSession(ctx, "u1", sess("u1", 1, time.Now()))
	if _, err := s.GetSession(ctx, "u2", created.ID); !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("expected ErrForbidden for cross-user access, got %v", err)
	}
}

func TestListSessions_OnlyOwn(t *testing.T) {
	s := newSvc()
	ctx := context.Background()
	_, _ = s.UpsertSession(ctx, "u1", sess("u1", 1, time.Unix(1700, 0)))
	_, _ = s.UpsertSession(ctx, "u2", sess("u2", 2, time.Unix(1701, 0)))
	out, err := s.ListSessions(ctx, "u1", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("expected 1 session for u1, got %d", len(out))
	}
	if out[0].UserID != "u1" {
		t.Errorf("wrong user: %q", out[0].UserID)
	}
}

func TestAppendPoints_Idempotent(t *testing.T) {
	s := newSvc()
	ctx := context.Background()
	created, _ := s.UpsertSession(ctx, "u1", sess("u1", 1, time.Now()))

	points := []*domain.Point{
		{Timestamp: time.Unix(1700, 0), Latitude: 50, Longitude: 10},
		{Timestamp: time.Unix(1701, 0), Latitude: 50.001, Longitude: 10},
	}
	n, _ := s.AppendPoints(ctx, "u1", created.ID, points)
	if n != 2 {
		t.Fatalf("first batch: expected 2 inserted, got %d", n)
	}
	// Повторный append тех же — 0 новых.
	n2, _ := s.AppendPoints(ctx, "u1", created.ID, points)
	if n2 != 0 {
		t.Errorf("second batch: expected 0 inserted (all dupes), got %d", n2)
	}
}

func TestAppendPoints_ForbiddenAcrossUsers(t *testing.T) {
	s := newSvc()
	ctx := context.Background()
	created, _ := s.UpsertSession(ctx, "u1", sess("u1", 1, time.Now()))
	_, err := s.AppendPoints(ctx, "u2", created.ID, []*domain.Point{
		{Timestamp: time.Unix(1, 0), Latitude: 50, Longitude: 10},
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("expected ErrForbidden, got %v", err)
	}
}

func TestDeleteSession_RemovesData(t *testing.T) {
	s := newSvc()
	ctx := context.Background()
	created, _ := s.UpsertSession(ctx, "u1", sess("u1", 1, time.Now()))
	_, _ = s.AppendPoints(ctx, "u1", created.ID, []*domain.Point{
		{Timestamp: time.Unix(1, 0), Latitude: 50, Longitude: 10},
	})
	if err := s.DeleteSession(ctx, "u1", created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetSession(ctx, "u1", created.ID); !errors.Is(err, domain.ErrSessionNotFound) {
		t.Errorf("expected ErrSessionNotFound after delete, got %v", err)
	}
}
