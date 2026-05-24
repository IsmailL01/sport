package observability

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

// expectedDenyKeys — 29 keys по D-12 (lowercase canonical).
// Table-driven чтобы новые добавления в pii_deny_list.go видны как diff на
// этом тесте.
var expectedDenyKeys = []string{
	"code", "otp_code", "otp",
	"phone", "phone_number", "phonenumber", "tel",
	"displayname", "display_name",
	"external_uuid", "strava_external_id", "garmin_external_id",
	"lat", "lon", "latitude", "longitude", "coords", "gps", "location",
	"dm_content", "message_body", "body", "content",
	"mapbox_token", "strava_token", "jwt", "access_token", "refresh_token", "password",
}

func TestPIIDenyList_Contains29Keys(t *testing.T) {
	if got, want := len(PIIDenyList), 29; got != want {
		t.Fatalf("PIIDenyList size: got %d, want %d", got, want)
	}
	for _, k := range expectedDenyKeys {
		if _, ok := PIIDenyList[k]; !ok {
			t.Errorf("PIIDenyList missing key: %q", k)
		}
	}
}

func TestEmailHashKeys_ContainsEmail(t *testing.T) {
	if _, ok := EmailHashKeys["email"]; !ok {
		t.Fatalf("EmailHashKeys missing 'email'")
	}
	if got, want := len(EmailHashKeys), 1; got != want {
		t.Errorf("EmailHashKeys size: got %d, want %d", got, want)
	}
	// Case-insensitive lookup via ShouldHash:
	for _, variant := range []string{"email", "Email", "EMAIL", "eMaIl"} {
		if !ShouldHash(variant) {
			t.Errorf("ShouldHash(%q) = false, want true", variant)
		}
	}
}

func TestIsDenied_CaseInsensitive(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		{"code", true},
		{"Code", true},
		{"CODE", true},
		{"PhoneNumber", true},
		{"PHONE_NUMBER", true},
		{"DisplayName", true},
		{"DISPLAYNAME", true},
		{"lat", true},
		{"LAT", true},
		{"email", false},       // email hashed, NOT denied
		{"service", false},     // operational metadata — allowed
		{"env", false},         // operational metadata — allowed
		{"version", false},     // operational metadata — allowed
		{"request_id", false},  // correlation — allowed
		{"random_attr", false}, // not in deny-list
		{"user_cohort", false}, // bucketed cohort — D-12 allowed
	}
	for _, tc := range cases {
		if got := IsDenied(tc.key); got != tc.want {
			t.Errorf("IsDenied(%q) = %v, want %v", tc.key, got, tc.want)
		}
	}
}

func TestHashEmail_DeterministicAnd8Hex(t *testing.T) {
	cases := []struct {
		input string
	}{
		{"alice@example.com"},
		{"bob@test.org"},
		{""},       // edge: empty input still hashable
		{"привет"}, // edge: non-ASCII UTF-8
	}
	for _, tc := range cases {
		got := HashEmail(tc.input)
		if len(got) != 8 {
			t.Errorf("HashEmail(%q) length = %d, want 8", tc.input, len(got))
		}
		// Determinism: run twice + compare.
		if again := HashEmail(tc.input); again != got {
			t.Errorf("HashEmail(%q) not deterministic: %q vs %q", tc.input, got, again)
		}
		// Sanity-check actual digest matches stdlib computation.
		fullHash := sha256.Sum256([]byte(tc.input))
		wantPrefix := hex.EncodeToString(fullHash[:])[:8]
		if got != wantPrefix {
			t.Errorf("HashEmail(%q) = %q, want %q (sha256 first-8 hex)", tc.input, got, wantPrefix)
		}
		// All chars are lowercase hex
		for _, c := range got {
			if !strings.ContainsRune("0123456789abcdef", c) {
				t.Errorf("HashEmail(%q) contains non-hex rune %q", tc.input, c)
			}
		}
	}
}

func TestHashEmail_DifferentInputsProduceDifferentHashes(t *testing.T) {
	a := HashEmail("alice@example.com")
	b := HashEmail("bob@example.com")
	if a == b {
		t.Errorf("HashEmail collision between distinct inputs: both = %q", a)
	}
}
