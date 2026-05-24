// Phase 8 Plan 08-01 Task 3 — verify manifest signature (CI round-trip +
// standalone audit). Mirror of scripts/sign-manifest.go for offline
// verification. Used by:
//   1. release-distribute.sh after upload (round-trip integrity check)
//   2. dev workstation to audit a manifest fetched from MinIO
//
// Canonical JSON: struct fields in alphabetical order; Signature excluded
// from the verified payload (matches sign-manifest.go's omitempty handling).
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// MUST mirror sign-manifest.go's struct exactly (alphabetical fields).
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
		manifestPath = flag.String("manifest", "", "path to manifest.json")
		pubKeyB64    = flag.String("public-key-base64", "", "Ed25519 32-byte public key, base64")
	)
	flag.Parse()
	if *manifestPath == "" || *pubKeyB64 == "" {
		fmt.Fprintln(os.Stderr, "missing required flags: --manifest + --public-key-base64")
		os.Exit(2)
	}

	data, err := os.ReadFile(*manifestPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read manifest:", err)
		os.Exit(2)
	}

	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		fmt.Fprintln(os.Stderr, "unmarshal manifest:", err)
		os.Exit(2)
	}

	sigB64 := m.Signature
	if sigB64 == "" {
		fmt.Fprintln(os.Stderr, "manifest missing signature field")
		os.Exit(2)
	}
	m.Signature = ""

	canonical, err := json.Marshal(m)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal canonical:", err)
		os.Exit(2)
	}

	sigBytes, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		fmt.Fprintln(os.Stderr, "base64 decode signature:", err)
		os.Exit(2)
	}
	pubBytes, err := base64.StdEncoding.DecodeString(*pubKeyB64)
	if err != nil {
		fmt.Fprintln(os.Stderr, "base64 decode public key:", err)
		os.Exit(2)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		fmt.Fprintf(os.Stderr, "invalid pubkey size: got %d, want %d\n", len(pubBytes), ed25519.PublicKeySize)
		os.Exit(2)
	}

	if !ed25519.Verify(ed25519.PublicKey(pubBytes), canonical, sigBytes) {
		fmt.Fprintln(os.Stderr, "✗ signature verification FAILED")
		os.Exit(1)
	}
	fmt.Println("✓ signature verified")
}
