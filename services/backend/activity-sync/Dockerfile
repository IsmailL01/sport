# syntax=docker/dockerfile:1.6
# Multi-stage build для activity-sync. Контекст сборки = services/backend/.

# === build stage ===
FROM golang:1.25-alpine AS build

WORKDIR /src

# go.work workspace mode: копируем go.mod всех 3 модулей, но исходники
# только pkg + activity-sync.
COPY go.work ./
COPY pkg/go.mod pkg/go.sum ./pkg/
COPY identity/go.mod identity/go.sum ./identity/
COPY activity-sync/go.mod activity-sync/go.sum ./activity-sync/

RUN cd activity-sync && go mod download
RUN cd pkg && go mod download

COPY pkg ./pkg
COPY activity-sync ./activity-sync

RUN cd activity-sync && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/activity-sync ./cmd/server

# === runtime stage ===
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/activity-sync /app/activity-sync

USER nonroot:nonroot
EXPOSE 8082

ENTRYPOINT ["/app/activity-sync"]
