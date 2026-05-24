// Tests for openapi-routes-check.
//
// Phase 1 / REL-01. Покрытие:
//   - WalkHandlers: literal mux.HandleFunc detected.
//   - WalkHandlers: non-literal mux.HandleFunc skipped (warning).
//   - LoadSpec: paths from OpenAPI YAML.
//   - diffRoutes: drift detection.
package main

import (
	"os"
	"path/filepath"
	"testing"
)

// literalHandler — fixture с двумя literal routes.
const literalHandler = `
package handler

import "net/http"

func register(mux *http.ServeMux) {
	mux.HandleFunc("GET /foo", nil)
	mux.HandleFunc("POST /bar/{id}", nil)
}
`

// nonLiteralHandler — fixture где первый аргумент — переменная.
const nonLiteralHandler = `
package handler

import "net/http"

func register(mux *http.ServeMux) {
	path := "GET /var-not-literal"
	mux.HandleFunc(path, nil)
	mux.HandleFunc("DELETE /literal-after", nil)
}
`

// aliasReceiverHandler — receiver не "mux" а "m" (как в некоторых сервисах).
const aliasReceiverHandler = `
package handler

import "net/http"

func register(m *http.ServeMux) {
	m.HandleFunc("PATCH /alias", nil)
}
`

// nonRouteHandler — HandleFunc на чём-то что не похоже на route.
// Должен быть отфильтрован regex'ом.
const nonRouteHandler = `
package handler

func register(thing interface{ HandleFunc(string, any) }) {
	thing.HandleFunc("not-a-method-or-path", nil)
}
`

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func TestWalkHandlers_Literal(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "http.go", literalHandler)

	got, err := WalkHandlers(dir)
	if err != nil {
		t.Fatalf("WalkHandlers: %v", err)
	}
	want := map[string]bool{
		"GET /foo":       true,
		"POST /bar/{id}": true,
	}
	if len(got) != len(want) {
		t.Fatalf("len mismatch: got %d, want %d (got=%v)", len(got), len(want), got)
	}
	for r := range want {
		if !got[r] {
			t.Errorf("missing route: %q", r)
		}
	}
}

func TestWalkHandlers_NonLiteralSkipped(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "http.go", nonLiteralHandler)

	got, err := WalkHandlers(dir)
	if err != nil {
		t.Fatalf("WalkHandlers: %v", err)
	}
	// Только literal должен попасть в результат.
	if !got["DELETE /literal-after"] {
		t.Errorf("expected 'DELETE /literal-after' in routes")
	}
	if got["GET /var-not-literal"] {
		t.Errorf("non-literal slipped through")
	}
	if len(got) != 1 {
		t.Errorf("expected exactly 1 route, got %d: %v", len(got), got)
	}
}

func TestWalkHandlers_AliasReceiver(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "http.go", aliasReceiverHandler)

	got, err := WalkHandlers(dir)
	if err != nil {
		t.Fatalf("WalkHandlers: %v", err)
	}
	if !got["PATCH /alias"] {
		t.Errorf("alias receiver (m.HandleFunc) not detected; got=%v", got)
	}
}

func TestWalkHandlers_NonRouteFilteredByRegex(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "http.go", nonRouteHandler)

	got, err := WalkHandlers(dir)
	if err != nil {
		t.Fatalf("WalkHandlers: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("non-route should be filtered; got=%v", got)
	}
}

func TestWalkHandlers_SkipsTestFiles(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "http.go", literalHandler)
	writeFile(t, dir, "http_test.go", `
package handler
func test() {} // должен быть skipped
`)
	got, err := WalkHandlers(dir)
	if err != nil {
		t.Fatalf("WalkHandlers: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("expected 2 routes (test file ignored); got %d: %v", len(got), got)
	}
}

func TestWalkHandlers_MissingDirIsOK(t *testing.T) {
	got, err := WalkHandlers(filepath.Join(t.TempDir(), "nonexistent"))
	if err != nil {
		t.Fatalf("missing dir should not error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty set; got %v", got)
	}
}

const sampleYAML = `openapi: 3.1.0
info:
  title: Sample
  version: 0.1.0
paths:
  /foo:
    get:
      summary: Get foo
      responses:
        '200': { description: OK }
    post:
      summary: Make foo
      responses:
        '201': { description: Created }
  /bar/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string }
    delete:
      summary: Delete bar
      responses:
        '204': { description: Deleted }
`

func TestLoadSpec(t *testing.T) {
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "sample.yaml")
	if err := os.WriteFile(yamlPath, []byte(sampleYAML), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := LoadSpec(yamlPath)
	if err != nil {
		t.Fatalf("LoadSpec: %v", err)
	}
	want := []string{"GET /foo", "POST /foo", "DELETE /bar/{id}"}
	if len(got) != len(want) {
		t.Fatalf("len mismatch: got %d (%v), want %d (%v)", len(got), got, len(want), want)
	}
	for _, r := range want {
		if !got[r] {
			t.Errorf("missing: %q", r)
		}
	}
}

func TestLoadSpec_IgnoresPathItemKeys(t *testing.T) {
	// `parameters` под /bar/{id} НЕ должен попасть как route.
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "sample.yaml")
	if err := os.WriteFile(yamlPath, []byte(sampleYAML), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := LoadSpec(yamlPath)
	if err != nil {
		t.Fatalf("LoadSpec: %v", err)
	}
	if got["PARAMETERS /bar/{id}"] {
		t.Errorf("parameters key leaked as route")
	}
}

func TestDiffRoutes_NoDrift(t *testing.T) {
	go_ := map[string]bool{"GET /foo": true, "POST /bar": true}
	yaml := map[string]bool{"GET /foo": true, "POST /bar": true}
	missing, extra := diffRoutes(go_, yaml)
	if len(missing) != 0 || len(extra) != 0 {
		t.Errorf("expected no diff; missing=%v extra=%v", missing, extra)
	}
}

func TestDiffRoutes_MissingInYaml(t *testing.T) {
	go_ := map[string]bool{"GET /foo": true, "POST /undocumented": true}
	yaml := map[string]bool{"GET /foo": true}
	missing, extra := diffRoutes(go_, yaml)
	if len(missing) != 1 || missing[0] != "POST /undocumented" {
		t.Errorf("expected missing=[POST /undocumented]; got %v", missing)
	}
	if len(extra) != 0 {
		t.Errorf("expected no extra; got %v", extra)
	}
}

func TestDiffRoutes_YamlOnly(t *testing.T) {
	go_ := map[string]bool{"GET /foo": true}
	yaml := map[string]bool{"GET /foo": true, "GET /future": true}
	missing, extra := diffRoutes(go_, yaml)
	if len(missing) != 0 {
		t.Errorf("expected no missing; got %v", missing)
	}
	if len(extra) != 1 || extra[0] != "GET /future" {
		t.Errorf("expected extra=[GET /future]; got %v", extra)
	}
}
