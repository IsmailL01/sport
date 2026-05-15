// AST-обход регистраций маршрутов через go/ast + go/parser.
//
// Phase 1 / REL-01. См. ADR-0007 §1.
//
// Ищем CallExpr c Fun = SelectorExpr c Sel.Name = "HandleFunc"
// (любой receiver — `mux`, `m`, `r`, и т.д.). Первый аргумент должен
// быть BasicLit STRING вида "METHOD /path" (Go 1.22+ ServeMux pattern).
// Не-literal calls логируются как warning + skipped.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// methodPathRe — Go 1.22+ ServeMux pattern: "<METHOD> /<path>".
// Поддерживаем семь стандартных HTTP-методов.
var methodPathRe = regexp.MustCompile(`^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /`)

// WalkHandlers возвращает множество роутов "METHOD /path", найденных
// во всех *.go под handlerDir (рекурсивно, исключая *_test.go).
// Если handlerDir не существует, возвращает (пустое, nil) — это не
// ошибка (service может ещё не иметь handlers).
func WalkHandlers(handlerDir string) (map[string]bool, error) {
	routes := map[string]bool{}

	st, err := os.Stat(handlerDir)
	if err != nil {
		if os.IsNotExist(err) {
			return routes, nil
		}
		return nil, err
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("not a directory: %s", handlerDir)
	}

	err = filepath.WalkDir(handlerDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		fileRoutes, err := scanFile(path)
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		for r := range fileRoutes {
			routes[r] = true
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return routes, nil
}

// scanFile разбирает один .go и возвращает routes найденные в нём.
func scanFile(path string) (map[string]bool, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
	if err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}

	routes := map[string]bool{}
	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if sel.Sel == nil || sel.Sel.Name != "HandleFunc" {
			return true
		}
		// Принимаем любой receiver (mux / m / r / ...).
		// Идентификация по имени метода и форме первого аргумента.
		if len(call.Args) == 0 {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			pos := fset.Position(call.Pos())
			fmt.Fprintf(os.Stderr, "  [skip-non-literal] %s:%d HandleFunc with non-literal pattern\n",
				pos.Filename, pos.Line)
			return true
		}
		raw, err := strconv.Unquote(lit.Value)
		if err != nil {
			pos := fset.Position(call.Pos())
			fmt.Fprintf(os.Stderr, "  [skip-bad-string]  %s:%d unquote: %v\n",
				pos.Filename, pos.Line, err)
			return true
		}
		// Тут возможны не-роуты (например HandleFunc на ServeMux в тестах
		// или внешних библиотеках). Фильтр по шаблону "METHOD /path".
		if !methodPathRe.MatchString(raw) {
			return true
		}
		routes[raw] = true
		return true
	})
	return routes, nil
}
