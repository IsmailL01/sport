// Phase 8 Plan 08-01 Task 3 — sign canonical manifest JSON with Ed25519.
//
// Invoked by scripts/release-distribute.sh in CI after EAS Cloud .aab build
// extracted into universal APK + uploaded to MinIO. Reads Ed25519 32-byte seed
// from --private-key-base64 flag (value sourced from SOPS-decrypted
// .secrets/prod/manifest-signing.yaml). Writes signed manifest JSON to
// --output (default stdout).
//
// Canonical JSON contract: struct fields are declared in ALPHABETICAL ORDER so
// Go's encoding/json (which marshals in struct-declaration order) produces the
// same byte string as the mobile-side JS verifier
// (apps/mobile-rn/src/update/manifestSigning.ts) which uses Object.keys().sort()
// before JSON.stringify. RESEARCH §1 Pitfall 1.
//
// Signature semantics: Signature field is excluded from the canonical payload
// (omitempty + zero value when signing). Signed bytes = json.Marshal(manifest)
// with Signature="". Final output has Signature populated.
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// Manifest fields in alphabetical order (canonical-JSON cross-language match
// with apps/mobile-rn/src/update/manifestSigning.ts).
type Manifest struct {
	APKSHA256           string `json:"apk_sha256"`
	APKSizeBytes        int64  `json:"apk_size_bytes"`
	APKUrl              string `json:"apk_url"`
	MinSupportedVersion string `json:"min_supported_version"`
	ReleasedAt          string `json:"released_at"`
	Signature           string `json:"signature,omitempty"`
	Version             string `json:"version"`
	VersionCode         int    `json:"version_code"`
}

func main() {
	var (
		version       = flag.String("version", "", "semver version, e.g. 1.0.0-beta.5")
		versionCode   = flag.Int("version-code", 0, "EAS-assigned versionCode")
		minSupported  = flag.String("min-supported-version", "", "min supported version")
		apkUrl        = flag.String("apk-url", "", "MinIO presigned URL (24h)")
		apkSha256     = flag.String("apk-sha256", "", "APK sha256 hex (64 chars)")
		apkSizeBytes  = flag.Int64("apk-size-bytes", 0, "APK size in bytes")
		releasedAt    = flag.String("released-at", "", "RFC3339 UTC timestamp")
		privKeyBase64 = flag.String("private-key-base64", "", "Ed25519 32-byte seed, base64")
		output        = flag.String("output", "/dev/stdout", "output file path")
	)
	flag.Parse()
	if *version == "" || *privKeyBase64 == "" {
		fmt.Fprintln(os.Stderr, "missing required flags: --version + --private-key-base64")
		os.Exit(2)
	}
	if *minSupported == "" {
		fmt.Fprintln(os.Stderr, "missing required flag: --min-supported-version")
		os.Exit(2)
	}

	seed, err := base64.StdEncoding.DecodeString(*privKeyBase64)
	if err != nil {
		fmt.Fprintln(os.Stderr, "base64 decode seed:", err)
		os.Exit(2)
	}
	if len(seed) != ed25519.SeedSize {
		fmt.Fprintf(os.Stderr, "seed must be %d bytes, got %d\n", ed25519.SeedSize, len(seed))
		os.Exit(2)
	}
	priv := ed25519.NewKeyFromSeed(seed)

	m := Manifest{
		APKSHA256:           *apkSha256,
		APKSizeBytes:        *apkSizeBytes,
		APKUrl:              *apkUrl,
		MinSupportedVersion: *minSupported,
		ReleasedAt:          *releasedAt,
		Signature:           "",
		Version:             *version,
		VersionCode:         *versionCode,
	}

	canonical, err := json.Marshal(m)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal canonical:", err)
		os.Exit(2)
	}
	sig := ed25519.Sign(priv, canonical)
	m.Signature = base64.StdEncoding.EncodeToString(sig)

	finalJSON, err := json.Marshal(m)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal final:", err)
		os.Exit(2)
	}

	if *output == "/dev/stdout" {
		fmt.Print(string(finalJSON))
	} else {
		if err := os.WriteFile(*output, finalJSON, 0644); err != nil {
			fmt.Fprintln(os.Stderr, "write output:", err)
			os.Exit(2)
		}
	}
}
