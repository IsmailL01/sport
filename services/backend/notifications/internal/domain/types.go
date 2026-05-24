package domain

import (
	"errors"
	"time"
)

type Platform string

const (
	PlatformIOS     Platform = "ios"
	PlatformAndroid Platform = "android"
	PlatformWeb     Platform = "web"
)

type PushDevice struct {
	ID        string
	UserID    string
	ExpoToken string
	Platform  Platform
	DeviceID  *string
	LastSeen  time.Time
	CreatedAt time.Time
}

type Notification struct {
	ID        string
	UserID    string
	Kind      string
	Payload   []byte // JSONB
	ReadAt    *time.Time
	CreatedAt time.Time
}

type Preferences struct {
	UserID          string
	PushEnabled     bool
	PushMessages    bool
	PushFollows     bool
	PushMentions    bool
	QuietHoursStart *int
	QuietHoursEnd   *int
	UpdatedAt       time.Time
}

func DefaultPreferences(userID string) Preferences {
	return Preferences{
		UserID:      userID,
		PushEnabled: true, PushMessages: true,
		PushFollows: true, PushMentions: true,
	}
}

var (
	ErrNotFound   = errors.New("not found")
	ErrInvalidArg = errors.New("invalid argument")
)
