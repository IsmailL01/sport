.PHONY: help up up-stack down migrate migrate-down run-identity run-activity-sync test test-coverage tidy docker-build observability-up observability-down check-routes

DB_URL ?= postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable

help:
	@echo "Targets:"
	@echo "  up                  Запустить Postgres + TimescaleDB"
	@echo "  up-stack            Поднять полный stack (postgres + identity + sync + gateway)"
	@echo "  observability-up    Поднять Prometheus + Loki + Grafana"
	@echo "  down                Остановить контейнеры stack"
	@echo "  observability-down  Остановить observability stack"
	@echo "  migrate             Применить миграции (требует up)"
	@echo "  migrate-down        Откатить последнюю миграцию"
	@echo "  run-identity        Запустить identity service локально на :8081"
	@echo "  run-activity-sync   Запустить activity-sync service локально на :8082"
	@echo "  test                Прогнать все Go-тесты"
	@echo "  test-coverage       Тесты с coverage report"
	@echo "  tidy                go mod tidy во всех модулях"
	@echo "  docker-build        Собрать Docker images stack-сервисов"
	@echo "  check-routes        OpenAPI route-vs-handler drift check (Phase 1 / REL-01)"

up:
	docker compose up -d postgres
	@echo "Waiting for postgres to be ready..."
	@until docker compose exec -T postgres pg_isready -U re >/dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready."

up-stack:
	@test -n "$$JWT_SECRET" || (echo "Set JWT_SECRET (>=32 chars) before up-stack"; exit 1)
	docker compose --profile stack up -d --build
	@echo "Stack up. Gateway: http://localhost:8080  •  identity: :8081  •  activity-sync: :8082"

down:
	docker compose --profile stack down

docker-build:
	docker compose --profile stack build

observability-up:
	docker compose -f docker-compose.observability.yml up -d
	@echo "Grafana: http://localhost:3000 (admin/admin)  •  Prometheus: :9090  •  Loki: :3100"

observability-down:
	docker compose -f docker-compose.observability.yml down

migrate:
	@command -v migrate >/dev/null 2>&1 || { \
		echo "golang-migrate не установлен. Установите: brew install golang-migrate"; exit 1; }
	migrate -path migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path migrations -database "$(DB_URL)" down 1

run-identity:
	cd identity && go run ./cmd/server

run-activity-sync:
	cd activity-sync && go run ./cmd/server

test:
	cd pkg && go test ./...
	cd identity && go test ./...
	cd activity-sync && go test ./...

test-coverage:
	cd pkg && go test -coverprofile=../coverage-pkg.out ./...
	cd identity && go test -coverprofile=../coverage-identity.out ./...
	cd activity-sync && go test -coverprofile=../coverage-activity-sync.out ./...
	@echo "Coverage:"
	@go tool cover -func=coverage-pkg.out | tail -1
	@go tool cover -func=coverage-identity.out | tail -1
	@go tool cover -func=coverage-activity-sync.out | tail -1

tidy:
	cd pkg && go mod tidy
	cd identity && go mod tidy
	cd activity-sync && go mod tidy

check-routes:
	cd scripts/openapi-routes-check && GOWORK=off go test -race ./...
	cd scripts/openapi-routes-check && GOWORK=off go run . --repo-root $$(git rev-parse --show-toplevel)
