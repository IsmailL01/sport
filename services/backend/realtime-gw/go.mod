module github.com/runningecosystem/backend/realtime-gw

go 1.25.0

require (
	github.com/coder/websocket v1.8.13
	github.com/nats-io/nats.go v1.39.1
	github.com/runningecosystem/backend/pkg v0.0.0
)

require (
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/klauspost/compress v1.17.9 // indirect
	github.com/nats-io/nkeys v0.4.9 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
)

replace github.com/runningecosystem/backend/pkg => ../pkg
