# syntax=docker/dockerfile:1.6
# Custom Caddy build with DNS-01 plugin baked in.
#
# The stock caddy:2.8-alpine image has NO DNS providers. For Let's Encrypt
# via DNS-01 (the only viable challenge on this host because casino's nginx
# owns :80 + :443), we need a plugin like caddy-dns/cloudflare.
#
# Build pattern follows official Caddy docs:
#   https://caddyserver.com/docs/build#xcaddy
#
# Used only by docker-compose.deploy-le.yml (the LE-enabled deploy variant).
# `Caddyfile.server` deploy uses stock caddy:2.8-alpine via base prod compose.

FROM caddy:2.10-builder-alpine AS builder

# Add DNS providers here as needed. DuckDNS is the current default (free,
# wildcard subdomain hosting). Swap or add others later if domain moves
# elsewhere (see https://github.com/caddy-dns for full list).
#
# Pinned to 2.10 because caddy-dns/duckdns v0.5.0 requires Go ≥ 1.24
# which 2.8 builder doesn't have (it ships Go 1.23.4).
RUN xcaddy build \
  --with github.com/caddy-dns/duckdns

FROM caddy:2.10-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
