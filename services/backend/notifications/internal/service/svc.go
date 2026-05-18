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
//  1. Записать row в notifications для in-app history
//  2. Проверить preferences (push_enabled + push_messages)
//  3. Получить все registered tokens юзера
//  4. Отправить через Expo Push API (collapse от same conversation 30s — TODO Phase B)
func (s *Service) HandleMessageEvent(ctx context.Context, recipientUserID string, payload []byte) error {
	// Распарсить минимум для preview.
	var ev struct {
		Event          string  `json:"event"`
		MessageID      string  `json:"messageId"`
		ConversationID string  `json:"conversationId"`
		SenderID       string  `json:"senderId"`
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

// HandleFeedEvent — обработать событие лайка / коммента к посту.
// Phase D+ realtime: feed-сервис публикует на rt.user.{authorId}, мы
// доставляем как Expo Push (если author offline; для online — WS уже
// доставил мгновенно).
//
// Payload форматы:
//
//	feed.post.liked     {postId, authorId, userId}
//	feed.post.commented {postId, commentId, postAuthorId, commenterId, body}
func (s *Service) HandleFeedEvent(ctx context.Context, recipientUserID string, payload []byte) error {
	var ev struct {
		Event        string  `json:"event"`
		PostID       string  `json:"postId"`
		AuthorID     string  `json:"authorId"` // для liked
		UserID       string  `json:"userId"`   // для liked
		CommentID    string  `json:"commentId"`
		PostAuthorID string  `json:"postAuthorId"` // для commented
		CommenterID  string  `json:"commenterId"`  // для commented
		Body         *string `json:"body"`
	}
	if err := json.Unmarshal(payload, &ev); err != nil {
		return err
	}
	switch ev.Event {
	case "feed.post.liked":
		return s.deliverLikePush(ctx, recipientUserID, ev.PostID, ev.UserID, payload)
	case "feed.post.commented":
		body := ""
		if ev.Body != nil {
			body = *ev.Body
		}
		return s.deliverCommentPush(ctx, recipientUserID, ev.PostID, ev.CommenterID, body, payload)
	}
	return nil
}

// HandleStoryEvent — feed.story.published fanout. Recipient = follower.
func (s *Service) HandleStoryEvent(ctx context.Context, recipientUserID string, payload []byte) error {
	var ev struct {
		Event    string `json:"event"`
		StoryID  string `json:"storyId"`
		AuthorID string `json:"authorId"`
	}
	if err := json.Unmarshal(payload, &ev); err != nil {
		return err
	}
	if ev.Event != "feed.story.published" {
		return nil
	}
	// Self-published — followers получают, author не нужно (он сам только что
	// опубликовал). Но fanout уже не отправляет в rt.user.{author} — так что
	// здесь это double-safety.
	if ev.AuthorID == recipientUserID {
		return nil
	}
	if err := s.notifications.Create(ctx, recipientUserID, "feed.story.published", payload); err != nil {
		s.log.Warn("notification persist failed", "error", err)
	}
	prefs, err := s.prefs.Get(ctx, recipientUserID)
	if err != nil {
		return err
	}
	if !prefs.PushEnabled || !prefs.PushFollows {
		return nil
	}
	tokens, err := s.devices.TokensForUser(ctx, recipientUserID)
	if err != nil || len(tokens) == 0 {
		return err
	}
	msgs := make([]expopush.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, expopush.Message{
			To:    t,
			Title: "📸 Новая история",
			Body:  "Один из ваших подписок опубликовал историю",
			Sound: "default",
			Data: map[string]any{
				"event":   "feed.story.published",
				"storyId": ev.StoryID,
			},
		})
	}
	return s.sendAndCleanup(ctx, recipientUserID, tokens, msgs)
}

func (s *Service) deliverLikePush(
	ctx context.Context, recipientUserID, postID, likerID string, payload []byte,
) error {
	// Self-like skip.
	if likerID == recipientUserID {
		return nil
	}
	if err := s.notifications.Create(ctx, recipientUserID, "feed.post.liked", payload); err != nil {
		s.log.Warn("notification persist failed", "error", err)
	}
	prefs, err := s.prefs.Get(ctx, recipientUserID)
	if err != nil {
		return err
	}
	if !prefs.PushEnabled || !prefs.PushFollows { // Reuse PushFollows как "social interactions".
		return nil
	}
	tokens, err := s.devices.TokensForUser(ctx, recipientUserID)
	if err != nil || len(tokens) == 0 {
		return err
	}
	msgs := make([]expopush.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, expopush.Message{
			To:    t,
			Title: "❤ Новый лайк",
			Body:  "Кто-то поставил лайк вашему посту",
			Sound: "default",
			Data: map[string]any{
				"event":  "feed.post.liked",
				"postId": postID,
			},
		})
	}
	return s.sendAndCleanup(ctx, recipientUserID, tokens, msgs)
}

func (s *Service) deliverCommentPush(
	ctx context.Context, recipientUserID, postID, commenterID, body string, payload []byte,
) error {
	if commenterID == recipientUserID {
		return nil
	}
	if err := s.notifications.Create(ctx, recipientUserID, "feed.post.commented", payload); err != nil {
		s.log.Warn("notification persist failed", "error", err)
	}
	prefs, err := s.prefs.Get(ctx, recipientUserID)
	if err != nil {
		return err
	}
	if !prefs.PushEnabled || !prefs.PushFollows {
		return nil
	}
	tokens, err := s.devices.TokensForUser(ctx, recipientUserID)
	if err != nil || len(tokens) == 0 {
		return err
	}
	preview := "Новый комментарий"
	if body != "" {
		preview = body
		if len(preview) > 80 {
			preview = preview[:77] + "..."
		}
	}
	msgs := make([]expopush.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, expopush.Message{
			To:    t,
			Title: "💬 Комментарий",
			Body:  preview,
			Sound: "default",
			Data: map[string]any{
				"event":  "feed.post.commented",
				"postId": postID,
			},
		})
	}
	return s.sendAndCleanup(ctx, recipientUserID, tokens, msgs)
}

func (s *Service) sendAndCleanup(
	ctx context.Context, recipientUserID string, tokens []string, msgs []expopush.Message,
) error {
	tickets, err := s.expo.Send(ctx, msgs)
	if err != nil {
		s.log.Warn("expo push failed", "error", err, "tokens", len(tokens))
		return err
	}
	for i, t := range tickets {
		if t.Status == "error" && strings.Contains(strings.ToLower(t.Message), "devicenotregistered") {
			s.log.Info("removing dead token", "userId", recipientUserID, "token", tokens[i])
			_ = s.devices.Delete(ctx, recipientUserID, tokens[i])
		}
	}
	return nil
}

func IsNotFound(err error) bool   { return errors.Is(err, domain.ErrNotFound) }
func IsInvalidArg(err error) bool { return errors.Is(err, domain.ErrInvalidArg) }
