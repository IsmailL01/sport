// OpenAPI 3.1.0 YAML loader — извлекает "METHOD /path" set из paths:.
//
// Phase 1 / REL-01.
//
// gopkg.in/yaml.v3 generic map[string]any парсинг (мы не делаем struct-mapping
// потому что нам нужны только keys из paths: и HTTP-method ключи).
package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// httpVerbs — какие top-level ключи под `paths.<path>` мы считаем
// HTTP-операциями. Остальные (`parameters`, `summary`, `description`,
// `servers`, etc.) — общие для PathItem, не операции.
var httpVerbs = map[string]bool{
	"get":     true,
	"post":    true,
	"put":     true,
	"patch":   true,
	"delete":  true,
	"head":    true,
	"options": true,
}

// LoadSpec парсит OpenAPI YAML и возвращает множество "METHOD /path".
// METHOD — uppercase, чтобы совпадать с форматом WalkHandlers.
func LoadSpec(yamlPath string) (map[string]bool, error) {
	data, err := os.ReadFile(yamlPath)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	rawPaths, ok := doc["paths"].(map[string]any)
	if !ok {
		// Spec without paths (e.g. shared schemas-only files). Empty set.
		return map[string]bool{}, nil
	}

	out := map[string]bool{}
	// Sort paths for deterministic iteration in tests / logs.
	pathKeys := make([]string, 0, len(rawPaths))
	for k := range rawPaths {
		pathKeys = append(pathKeys, k)
	}
	sort.Strings(pathKeys)

	for _, p := range pathKeys {
		item, ok := rawPaths[p].(map[string]any)
		if !ok {
			continue
		}
		for verb := range item {
			if !httpVerbs[verb] {
				continue
			}
			out[strings.ToUpper(verb)+" "+p] = true
		}
	}
	return out, nil
}
