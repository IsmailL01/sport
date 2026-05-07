# syntax=docker/dockerfile:1.6
# Multi-stage build для identity-сервиса.
# Контекст сборки = services/backend/ (а не identity/), потому что нужен доступ
# к pkg/ через replace directive в go.mod.

# === build stage ===
FROM golang:1.25-alpine AS build

WORKDIR /src

# go.work лежит в корне backend/, листит все 3 модуля. Копируем go.mod-ы
# всех 3-х (для workspace resolve), но исходники — только pkg + identity.
COPY go.work ./
COPY pkg/go.mod pkg/go.sum ./pkg/
COPY identity/go.mod identity/go.sum ./identity/
COPY activity-sync/go.mod activity-sync/go.sum ./activity-sync/

RUN cd identity && go mod download
RUN cd pkg && go mod download

# Теперь — исходники.
COPY pkg ./pkg
COPY identity ./identity

# Сборка статически-линкованного бинаря.
RUN cd identity && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/identity ./cmd/server

# === runtime stage ===
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/identity /app/identity

USER nonroot:nonroot
EXPOSE 8081

ENTRYPOINT ["/app/identity"]
