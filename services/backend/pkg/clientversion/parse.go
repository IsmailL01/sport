// Парсер заголовка X-Client-Version.
//
// Принимает три формы (per D-05 + RESEARCH.md Pattern 2):
//   - голый semver: "1.0.0";
//   - semver и build-number в скобках: "1.0.0 (42)";
//   - SemVer-style build-metadata через "+": например "1.0.0" со
//     слешем плюс и тегом сборки.
//
// Возвращает (semver, build, err). Caller-side (middleware.go) решает: на err
// graceful-passthrough с slog.Warn, не отдавать 500.

package clientversion

import (
	"errors"
	"strings"

	"golang.org/x/mod/semver"
)

// Sentinel errors — для errors.Is в тестах и downstream-обработчиках.
var (
	// ErrEmpty — заголовок пустой / только whitespace.
	ErrEmpty = errors.New("clientversion: empty header")

	// ErrInvalidSemver — semver-часть не валидна (golang.org/x/mod/semver).
	ErrInvalidSemver = errors.New("clientversion: invalid semver")

	// ErrInvalidBuild — build-часть не парсится (например `(abc)` вместо `(42)`).
	ErrInvalidBuild = errors.New("clientversion: invalid build")
)

// Parse — распарсить значение заголовка. Возвращает semver БЕЗ префикса "v"
// (хотя golang.org/x/mod/semver требует "v" внутри для compare —
// см. compareSemver в middleware.go).
//
// Допустимый input:
//
//	"1.0.0"            → ("1.0.0", "", nil)
//	"1.0.0 (42)"       → ("1.0.0", "42", nil)
//	"1.0.0+build42"    → ("1.0.0", "build42", nil)
func Parse(header string) (semverOut string, build string, err error) {
	s := strings.TrimSpace(header)
	if s == "" {
		return "", "", ErrEmpty
	}

	// Шаг 1: попытка распарсить "semver (build)".
	if i := strings.IndexByte(s, '('); i >= 0 {
		// Должен быть закрывающий ')' в конце; иначе semver невалиден.
		if !strings.HasSuffix(s, ")") {
			return "", "", ErrInvalidSemver
		}
		ver := strings.TrimSpace(s[:i])
		b := strings.TrimSpace(s[i+1 : len(s)-1])
		if !isValidSemver(ver) {
			return "", "", ErrInvalidSemver
		}
		if !isAllDigits(b) {
			return "", "", ErrInvalidBuild
		}
		return ver, b, nil
	}

	// Шаг 2: попытка распарсить "semver+build-metadata".
	if i := strings.IndexByte(s, '+'); i >= 0 {
		ver := s[:i]
		b := s[i+1:]
		if !isValidSemver(ver) {
			return "", "", ErrInvalidSemver
		}
		if b == "" {
			return "", "", ErrInvalidBuild
		}
		return ver, b, nil
	}

	// Шаг 3: голый semver.
	if !isValidSemver(s) {
		return "", "", ErrInvalidSemver
	}
	return s, "", nil
}

// isValidSemver — обёртка над semver.IsValid с "v"-префиксом
// (требование пакета golang.org/x/mod/semver). Дополнительно проверяет,
// что версия не "сокращённая" (`1.0` / `1`) — pkg-семвер их принимает,
// мы — нет (REL-02 требует X.Y.Z).
func isValidSemver(s string) bool {
	if s == "" {
		return false
	}
	if !semver.IsValid("v" + s) {
		return false
	}
	// Запрещаем `1.0` / `1` — пакет считает их валидными, но в нашем контракте
	// X-Client-Version всегда полный X.Y.Z (Application.nativeApplicationVersion
	// на mobile всегда стампит patch).
	dots := strings.Count(s, ".")
	return dots >= 2
}

// isAllDigits — строго [0-9]+ (для build-number-в-скобках). Пустая строка → false.
func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
