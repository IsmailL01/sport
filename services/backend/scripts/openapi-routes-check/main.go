// Package main — openapi-routes-check CI tool.
//
// Phase 1 / REL-01. См. ADR-0007 §1.
//
// Scans каждый services/backend/<service>/internal/handler/**/*.go,
// извлекает литералы mux.HandleFunc("METHOD /path", ...) через go/ast,
// и сравнивает с paths из services/backend/api/<service>.yaml.
//
// Поведение:
//   - routes-in-Go-not-in-YAML  → fatal (exit 1) — каждый implemented роут
//     ОБЯЗАН быть документирован.
//   - routes-in-YAML-not-in-Go  → warning — допустимо (future spec).
//   - mux.HandleFunc с не-literal первым аргументом → пропускается с
//     warning. По договорённости (см. ADR-0007 §1) literal-only convention.
//
// Использование:
//
//	cd $(git rev-parse --show-toplevel)
//	go run ./services/backend/scripts/openapi-routes-check
//
// Exit codes:
//
//	0 — нет drift'а.
//	1 — Go-роуты не документированы (или внутренняя ошибка).
//	2 — usage error (missing YAML / handler dir).
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// repoRootFlag — путь до корня монорепо. По умолчанию пытаемся
// определить через `services/backend/api/` относительно cwd.
var repoRootFlag = flag.String("repo-root", "", "Path to monorepo root (autodetect if empty)")

// servicesFilter — comma-separated whitelist; пустой = все.
var servicesFilter = flag.String("services", "", "Comma-separated services to check (empty = all)")

func main() {
	flag.Parse()
	os.Exit(run())
}

func run() int {
	root, err := detectRepoRoot(*repoRootFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "openapi-routes-check: %v\n", err)
		return 2
	}

	apiDir := filepath.Join(root, "services", "backend", "api")
	servicesDir := filepath.Join(root, "services", "backend")

	services, err := discoverServices(servicesDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "discover services: %v\n", err)
		return 2
	}
	if filter := *servicesFilter; filter != "" {
		services = filterServices(services, filter)
	}
	sort.Strings(services)

	hadDrift := false
	for _, svc := range services {
		handlerDir := filepath.Join(servicesDir, svc, "internal", "handler")
		if st, err := os.Stat(handlerDir); err != nil || !st.IsDir() {
			// Fallback: некоторые сервисы кладут handlers в alt-каталог
			// (realtime-gw → internal/gw/).
			altDir := filepath.Join(servicesDir, svc, "internal", "gw")
			if st2, err2 := os.Stat(altDir); err2 == nil && st2.IsDir() {
				handlerDir = altDir
			}
		}
		goRoutes, err := WalkHandlers(handlerDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] walk handlers: %v\n", svc, err)
			return 1
		}
		yamlPath := filepath.Join(apiDir, svc+".yaml")
		yamlRoutes, err := LoadSpec(yamlPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] load spec %s: %v\n", svc, yamlPath, err)
			return 1
		}

		missing, extra := diffRoutes(goRoutes, yamlRoutes)
		fmt.Printf("=== %s ===\n", svc)
		fmt.Printf("  go routes:   %d\n", len(goRoutes))
		fmt.Printf("  yaml routes: %d\n", len(yamlRoutes))
		if len(missing) == 0 && len(extra) == 0 {
			fmt.Println("  status: OK (no drift)")
			continue
		}
		if len(missing) > 0 {
			hadDrift = true
			fmt.Printf("  status: DRIFT — %d Go route(s) not in YAML\n", len(missing))
			sort.Strings(missing)
			for _, r := range missing {
				fmt.Printf("    [missing in yaml] %s\n", r)
			}
		}
		if len(extra) > 0 {
			fmt.Printf("  status: warning — %d YAML route(s) not in Go (future spec?)\n", len(extra))
			sort.Strings(extra)
			for _, r := range extra {
				fmt.Printf("    [yaml-only]       %s\n", r)
			}
		}
	}

	if hadDrift {
		fmt.Fprintln(os.Stderr, "\nopenapi-routes-check: FAIL — undocumented routes detected.")
		return 1
	}
	fmt.Println("\nopenapi-routes-check: OK")
	return 0
}

// diffRoutes возвращает (inGoNotYaml, inYamlNotGo).
func diffRoutes(goRoutes, yamlRoutes map[string]bool) (missing, extra []string) {
	for r := range goRoutes {
		if !yamlRoutes[r] {
			missing = append(missing, r)
		}
	}
	for r := range yamlRoutes {
		if !goRoutes[r] {
			extra = append(extra, r)
		}
	}
	return missing, extra
}

// detectRepoRoot — если flag пуст, ищет каталог services/backend/api/ снизу вверх.
func detectRepoRoot(flagVal string) (string, error) {
	if flagVal != "" {
		return flagVal, nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	dir := cwd
	for i := 0; i < 8; i++ {
		marker := filepath.Join(dir, "services", "backend", "api")
		if st, err := os.Stat(marker); err == nil && st.IsDir() {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find monorepo root containing services/backend/api/ (cwd=%s)", cwd)
}

// discoverServices — список dir-имён в services/backend/, у которых есть internal/handler/.
func discoverServices(servicesDir string) ([]string, error) {
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		// Skip non-service dirs.
		switch name {
		case "api", "deploy", "gateway", "migrations", "observability", "pkg", "scripts":
			continue
		}
		// Need internal/handler/ to be a service we care about.
		handlerPath := filepath.Join(servicesDir, name, "internal", "handler")
		if st, err := os.Stat(handlerPath); err != nil || !st.IsDir() {
			// realtime-gw uses internal/gw/ instead of internal/handler/
			// detect by alternate path.
			altPath := filepath.Join(servicesDir, name, "internal", "gw")
			if st2, err2 := os.Stat(altPath); err2 != nil || !st2.IsDir() {
				continue
			}
		}
		out = append(out, name)
	}
	return out, nil
}

// filterServices — comma-split whitelist intersect.
func filterServices(all []string, csv string) []string {
	want := map[string]bool{}
	start := 0
	for i := 0; i <= len(csv); i++ {
		if i == len(csv) || csv[i] == ',' {
			if i > start {
				want[csv[start:i]] = true
			}
			start = i + 1
		}
	}
	var out []string
	for _, s := range all {
		if want[s] {
			out = append(out, s)
		}
	}
	return out
}
