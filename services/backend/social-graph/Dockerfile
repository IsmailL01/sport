# syntax=docker/dockerfile:1.6
# Multi-stage build для social-graph сервиса.
# Контекст сборки = services/backend/.

# === build stage ===
FROM golang:1.25-alpine AS build

WORKDIR /src

# go.work workspace mode: копируем go.mod всех модулей, исходники только pkg + social-graph.
COPY go.work ./
COPY pkg/go.mod pkg/go.sum ./pkg/
COPY identity/go.mod identity/go.sum ./identity/
COPY activity-sync/go.mod activity-sync/go.sum ./activity-sync/
COPY social-graph/go.mod ./social-graph/

RUN cd social-graph && go mod download
RUN cd pkg && go mod download

COPY pkg ./pkg
COPY social-graph ./social-graph

RUN cd social-graph && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/social-graph ./cmd/server

# === runtime stage ===
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/social-graph /app/social-graph

USER nonroot:nonroot
EXPOSE 8084

ENTRYPOINT ["/app/social-graph"]
