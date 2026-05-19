// Package observability — single source of truth для PII attribute names,
// которые drop из slog AND OTel spans. Phase 5 / OBS-04 / OBS-06 / D-12 / D-21.
//
// Конструкция:
//   - PIIDenyList — 29 attribute keys, которые НИКОГДА не попадают в логи
//     (drop, не [REDACTED] — minimum-information principle).
//   - EmailHashKeys — keys, которые НЕ дропаются, а hash'атся (operational
//     correlation без plaintext); пока только "email" → SHA-256 first-8.
//
// Helpers IsDenied / ShouldHash / HashEmail используются:
//   - slog_handler.go (Phase 5 Plan 05-03) — emit-time scrub в Handle().
//   - otel_init.go    (Phase 5 Plan 05-05) — span-attribute scrub в SpanProcessor.
//
// Все lookup case-insensitive: PIIDenyList keys всегда lowercase canonical;
// IsDenied / ShouldHash вызывают strings.ToLower на входе.
package observability

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// PIIDenyList — 29 keys из CONTEXT.md §D-12 (lowercase canonical).
// Любой slog/span attribute с key в этом set дропается полностью.
//
// Категории:
//   - OTP:           code, otp_code, otp
//   - Phone:         phone, phone_number, phonenumber, tel
//   - DisplayName:   displayname, display_name
//   - External IDs:  external_uuid, strava_external_id, garmin_external_id
//   - GPS:           lat, lon, latitude, longitude, coords, gps, location
//   - DM content:    dm_content, message_body, body, content
//   - Secrets:       mapbox_token, strava_token, jwt, access_token,
//                    refresh_token, password
var PIIDenyList = map[string]struct{}{
	// OTP — D-12 + D-13
	"code":     {},
	"otp_code": {},
	"otp":      {},
	// Phone (RU contacts) — D-12
	"phone":        {},
	"phone_number": {},
	"phonenumber":  {},
	"tel":          {},
	// DisplayName — D-12
	"displayname":  {},
	"display_name": {},
	// External IDs — D-12 (NEVER cross third-party ID boundary)
	"external_uuid":      {},
	"strava_external_id": {},
	"garmin_external_id": {},
	// GPS — D-12 (cornerstone PII for runners project)
	"lat":       {},
	"lon":       {},
	"latitude":  {},
	"longitude": {},
	"coords":    {},
	"gps":       {},
	"location":  {},
	// DM / message body — D-12
	"dm_content":   {},
	"message_body": {},
	"body":         {},
	"content":      {},
	// Secrets — D-12 (defense-in-depth alongside SOPS + pre-commit gitleaks)
	"mapbox_token":  {},
	"strava_token":  {},
	"jwt":           {},
	"access_token":  {},
	"refresh_token": {},
	"password":      {},
}

// EmailHashKeys — keys, которые hash'атся (NOT dropped). Operational
// correlation без plaintext (D-10). Текущий set — только "email".
var EmailHashKeys = map[string]struct{}{
	"email": {},
}

// IsDenied returns true если key (любой case) есть в PIIDenyList.
func IsDenied(key string) bool {
	_, ok := PIIDenyList[strings.ToLower(key)]
	return ok
}

// ShouldHash returns true если key (любой case) есть в EmailHashKeys.
func ShouldHash(key string) bool {
	_, ok := EmailHashKeys[strings.ToLower(key)]
	return ok
}

// HashEmail returns first-8 hex chars of SHA-256(value). Stable digest
// для log-correlation; не обратим к plaintext без brute-force словаря.
//
// 8 hex = 32 bits = ~4.3 billion buckets; для closed-beta scale (≤10K
// users) collision probability negligible. v1.1 может расширить до 12 hex
// если userbase превысит ~100K.
func HashEmail(value string) string {
	h := sha256.Sum256([]byte(value))
	return hex.EncodeToString(h[:])[:8]
}
