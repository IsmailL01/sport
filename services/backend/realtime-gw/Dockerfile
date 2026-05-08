# syntax=docker/dockerfile:1.6
FROM golang:1.25-alpine AS build

WORKDIR /src

COPY go.work ./
COPY pkg/go.mod pkg/go.sum ./pkg/
COPY identity/go.mod identity/go.sum ./identity/
COPY activity-sync/go.mod activity-sync/go.sum ./activity-sync/
COPY social-graph/go.mod ./social-graph/
COPY messaging/go.mod ./messaging/
COPY realtime-gw/go.mod ./realtime-gw/

RUN cd realtime-gw && go mod download
RUN cd pkg && go mod download

COPY pkg ./pkg
COPY realtime-gw ./realtime-gw

RUN cd realtime-gw && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/realtime-gw ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/realtime-gw /app/realtime-gw

USER nonroot:nonroot
EXPOSE 8090

ENTRYPOINT ["/app/realtime-gw"]
