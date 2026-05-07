.PHONY: help up down migrate run-identity test test-coverage tidy

DB_URL ?= postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable

help:
	@echo "Targets:"
	@echo "  up                Запустить Postgres + TimescaleDB через docker compose"
	@echo "  down              Остановить и удалить контейнеры"
	@echo "  migrate           Применить миграции (требует up)"
	@echo "  migrate-down      Откатить последнюю миграцию"
	@echo "  run-identity      Запустить identity service на :8081"
	@echo "  run-activity-sync Запустить activity-sync service на :8082"
	@echo "  test              Прогнать все Go-тесты"
	@echo "  test-coverage     Прогнать тесты с coverage report"
	@echo "  tidy              go mod tidy во всех модулях"

up:
	docker compose up -d postgres
	@echo "Waiting for postgres to be ready..."
	@until docker compose exec -T postgres pg_isready -U re >/dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready."

down:
	docker compose down

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
