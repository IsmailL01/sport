// Package service — бизнес-логика notifications.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"

	"github.com/runningecosystem/backend/notifications/internal/domain"
	"github.com/runningecosystem/backend/notifications/internal/expopush"
	"github.com/runningecosystem/backend/notifications/internal/repository/postgres"
)

type Service struct {
	devices       *postgres.DeviceRepo
	notifications *postgres.NotificationRepo
	prefs         *postgres.PreferencesRepo
	expo          *expopush.Client
	log           *slog.Logger
}

func New(
	devices *postgres.DeviceRepo,
	notifications *postgres.NotificationRepo,
	prefs *postgres.PreferencesRepo,
	expo *expopush.Client,
	log *slog.Logger,
) *Service {
	return &Service{devices: devices, notifications: notifications, prefs: prefs, expo: expo, log: log}
}

func (s *Service) RegisterDevice(ctx context.Context, userID, expoToken string, platform domain.Platform, deviceID *string) (*domain.PushDevice, error) {
	if !strings.HasPrefix(expoToken, "ExponentPushToken[") && !strings.HasPrefix(expoToken, "ExpoPushToken[") {
		return nil, domain.ErrInvalidArg
	}
	switch platform {
	case domain.PlatformIOS, domain.PlatformAndroid, domain.PlatformWeb:
	default:
		return nil, domain.ErrInvalidArg
	}
	return s.devices.Upsert(ctx, userID, expoToken, platform, deviceID)
}

func (s *Service) DeleteDevice(ctx context.Context, userID, expoToken string) error {
	return s.devices.Delete(ctx, userID, expoToken)
}

func (s *Service) ListNotifications(ctx context.Context, userID string, limit int) ([]*domain.Notification, error) {
	return s.notifications.ListForUser(ctx, userID, limit)
}

func (s *Service) MarkAllRead(ctx context.Context, userID string) error {
	return s.notifications.MarkAllRead(ctx, userID)
}

func (s *Service) GetPreferences(ctx context.Context, userID string) (domain.Preferences, error) {
	return s.prefs.Get(ctx, userID)
}

func (s *Service) UpdatePreferences(ctx context.Context, p domain.Preferences) error {
	return s.prefs.Upsert(ctx, p)
}

// HandleMessageEvent — вызывается из NATS-consumer при получении
// messaging.message.sent / rt.user.{id} payload.
//
// Алгоритм:
//   1. Записать row в notifications для in-app history
//   2. Проверить preferences (push_enabled + push_messages)
//   3. Получить все registered tokens юзера
//   4. Отправить через Expo Push API (collapse от same conversation 30s — TODO Phase B)
func (s *Service) HandleMessageEvent(ctx context.Context, recipientUserID string, payload []byte) error {
	// Распарсить минимум для preview.
	var ev struct {
		Event          string `json:"event"`
		MessageID      string `json:"messageId"`
		ConversationID string `json:"conversationId"`
		SenderID       string `json:"senderId"`
		Body           *string `json:"body"`
		Kind           string  `json:"kind"`
	}
	if err := json.Unmarshal(payload, &ev); err != nil {
		return err
	}
	// Пропускаем не-message события.
	if ev.Event != "message.new" {
		return nil
	}
	// Не отправляем самому себе (sync на одном устройстве не считается).
	if ev.SenderID == recipientUserID {
		return nil
	}

	// 1. Persist для in-app history.
	if err := s.notifications.Create(ctx, recipientUserID, "message.new", payload); err != nil {
		s.log.Warn("notification persist failed", "error", err)
	}

	// 2. Preferences gate.
	prefs, err := s.prefs.Get(ctx, recipientUserID)
	if err != nil {
		s.log.Warn("get preferences failed", "error", err)
		return err
	}
	if !prefs.PushEnabled || !prefs.PushMessages {
		return nil
	}

	// 3. Tokens.
	tokens, err := s.devices.TokensForUser(ctx, recipientUserID)
	if err != nil {
		return err
	}
	if len(tokens) == 0 {
		s.log.Debug("no devices registered", "userId", recipientUserID)
		return nil
	}

	// 4. Build messages.
	preview := "Новое сообщение"
	if ev.Body != nil && *ev.Body != "" {
		preview = *ev.Body
		if len(preview) > 80 {
			preview = preview[:77] + "..."
		}
	}
	msgs := make([]expopush.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, expopush.Message{
			To:       t,
			Title:    "Сообщение",
			Body:     preview,
			Sound:    "default",
			Priority: "high",
			Data: map[string]any{
				"event":          "message.new",
				"conversationId": ev.ConversationID,
				"messageId":      ev.MessageID,
			},
		})
	}
	tickets, err := s.expo.Send(ctx, msgs)
	if err != nil {
		s.log.Warn("expo push failed", "error", err, "tokens", len(tokens))
		return err
	}
	// На DeviceNotRegistered удаляем token — клиент мог потерять access.
	for i, t := range tickets {
		if t.Status == "error" && strings.Contains(strings.ToLower(t.Message), "deviceNotRegistered") {
			s.log.Info("removing dead token", "userId", recipientUserID, "token", tokens[i])
			_ = s.devices.Delete(ctx, recipientUserID, tokens[i])
		}
	}
	return nil
}

func IsNotFound(err error) bool { return errors.Is(err, domain.ErrNotFound) }
func IsInvalidArg(err error) bool { return errors.Is(err, domain.ErrInvalidArg) }
