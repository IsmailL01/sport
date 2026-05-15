package clientversion

import (
	"errors"
	"testing"
)

func TestParse_TableDriven(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		input      string
		wantSemver string
		wantBuild  string
		wantErr    error
	}{
		{name: "plain semver", input: "1.0.0", wantSemver: "1.0.0", wantBuild: ""},
		{name: "semver with paren build", input: "1.0.0 (42)", wantSemver: "1.0.0", wantBuild: "42"},
		{name: "semver with plus build", input: "1.0.0+build42", wantSemver: "1.0.0", wantBuild: "build42"},
		{name: "leading/trailing whitespace", input: "  1.0.0  ", wantSemver: "1.0.0", wantBuild: ""},
		{name: "patch zero", input: "2.3.0", wantSemver: "2.3.0", wantBuild: ""},
		{name: "empty", input: "", wantErr: ErrEmpty},
		{name: "whitespace only", input: "   ", wantErr: ErrEmpty},
		{name: "garbage", input: "garbage", wantErr: ErrInvalidSemver},
		{name: "incomplete semver — major.minor only", input: "1.0", wantErr: ErrInvalidSemver},
		{name: "paren build with non-digits", input: "1.0.0 (abc)", wantErr: ErrInvalidBuild},
		{name: "paren without close", input: "1.0.0 (42", wantErr: ErrInvalidSemver},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			semver, build, err := Parse(tc.input)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("Parse(%q) err = %v, want %v", tc.input, err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Parse(%q) unexpected err: %v", tc.input, err)
			}
			if semver != tc.wantSemver {
				t.Errorf("Parse(%q) semver = %q, want %q", tc.input, semver, tc.wantSemver)
			}
			if build != tc.wantBuild {
				t.Errorf("Parse(%q) build = %q, want %q", tc.input, build, tc.wantBuild)
			}
		})
	}
}
