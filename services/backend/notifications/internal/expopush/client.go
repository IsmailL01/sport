// Package expopush — мини-клиент для Expo Push API (https://exp.host/--/api/v2/push/send).
//
// Doc: https://docs.expo.dev/push-notifications/sending-notifications/
//
// MVP scope:
//   - Batch send до 100 messages в один POST
//   - Token validation (ExponentPushToken[xxx]...)
//   - Authorization header через EXPO_ACCESS_TOKEN (если задан)
//   - Возвращает per-message result; на DeviceNotRegistered клиент должен
//     удалить токен (caller responsibility)
package expopush

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	endpoint    = "https://exp.host/--/api/v2/push/send"
	maxBatch    = 100
	httpTimeout = 15 * time.Second
)

type Client struct {
	httpClient *http.Client
	authToken  string // optional: EXPO_ACCESS_TOKEN
}

func New(authToken string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: httpTimeout},
		authToken:  authToken,
	}
}

// Message — тело одного push'a.
type Message struct {
	To       string         `json:"to"`               // ExponentPushToken[xxx]
	Title    string         `json:"title,omitempty"`
	Body     string         `json:"body,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
	Sound    string         `json:"sound,omitempty"`  // "default"
	Priority string         `json:"priority,omitempty"` // "default" | "normal" | "high"
	Badge    *int           `json:"badge,omitempty"`
	ChannelID string        `json:"channelId,omitempty"`
}

type Ticket struct {
	Status  string `json:"status"`            // "ok" | "error"
	ID      string `json:"id,omitempty"`
	Message string `json:"message,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

type response struct {
	Data   []Ticket `json:"data"`
	Errors []struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"errors,omitempty"`
}

// Send — отправить batch (up to maxBatch). Возвращает tickets parallel slice.
func (c *Client) Send(ctx context.Context, msgs []Message) ([]Ticket, error) {
	if len(msgs) == 0 {
		return nil, nil
	}
	if len(msgs) > maxBatch {
		return nil, fmt.Errorf("batch too large: %d (max %d)", len(msgs), maxBatch)
	}

	// Validate tokens.
	for _, m := range msgs {
		if !strings.HasPrefix(m.To, "ExponentPushToken[") && !strings.HasPrefix(m.To, "ExpoPushToken[") {
			return nil, fmt.Errorf("invalid expo push token: %q", m.To)
		}
	}

	body, err := json.Marshal(msgs)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("expo push HTTP %d", resp.StatusCode)
	}

	var parsed response
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Errors) > 0 {
		return nil, fmt.Errorf("expo push error: %s", parsed.Errors[0].Message)
	}
	return parsed.Data, nil
}
