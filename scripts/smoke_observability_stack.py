#!/usr/bin/env python3
"""
Phase 5 / Plan 05-07 v2 — observability-stack smoke probe

Verifies all 3 containers (Loki + Prometheus + Grafana) are reachable + healthy
via the Caddy :8443 ingress on srv1561293. Self-signed cert handled via
ssl.CERT_NONE (D-37 accepted risk for v1.0).

Stdlib-only — matches scripts/smoke_otp.py shape from Phase 2.

Exit codes:
  0  — all checks PASS
  1  — at least one check FAILED (first failure printed; subsequent skipped)

Env vars:
  BASE   — base URL (default: https://82.25.71.215:8443)
  GRAFANA_USER  — basicauth user (default: admin)
  GRAFANA_PASS  — basicauth pass (REQUIRED — read from SOPS or local file)

Usage:
  GRAFANA_PASS=$(sops -d .secrets/prod/sentry.yaml | grep '^GRAFANA_ADMIN_PASSWORD:' | sed 's/.*"\\(.*\\)"$/\\1/') \\
      python3 scripts/smoke_observability_stack.py
"""

import base64
import os
import ssl
import sys
import urllib.error
import urllib.request


BASE = os.environ.get("BASE", "https://82.25.71.215:8443")
GRAFANA_USER = os.environ.get("GRAFANA_USER", "admin")
GRAFANA_PASS = os.environ.get("GRAFANA_PASS", "")

# Self-signed cert (D-37) — disable verification for v1.0
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def basicauth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def req(method: str, path: str, *, headers: dict = None, timeout: int = 10):
    """HTTP request returning (status, body_str). Handles 401/403/4xx/5xx as non-exceptions."""
    headers = headers or {}
    full_url = f"{BASE}{path}"
    request = urllib.request.Request(full_url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, context=CTX, timeout=timeout) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except urllib.error.URLError as e:
        return -1, str(e.reason)
    except Exception as e:
        return -1, str(e)


def must(label: str, ok: bool, detail: str = ""):
    """Pass/fail printer + early-exit on first failure."""
    if ok:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")
        if detail:
            print(f"      {detail}")
        sys.exit(1)


def check_loki_ready():
    status, body = req("GET", "/loki/ready")
    must(
        "Loki /ready returns 200",
        status == 200,
        f"got HTTP {status}: {body[:120]!r}",
    )
    must(
        "Loki body contains 'ready'",
        "ready" in body.lower(),
        f"unexpected body: {body[:120]!r}",
    )


def check_prometheus_healthy():
    if not GRAFANA_PASS:
        must("GRAFANA_PASS env set (required for /prometheus basicauth)", False)
    auth = {"Authorization": basicauth_header(GRAFANA_USER, GRAFANA_PASS)}
    status, body = req("GET", "/prometheus/-/healthy", headers=auth)
    must(
        "Prometheus /-/healthy returns 200",
        status == 200,
        f"got HTTP {status}: {body[:120]!r}",
    )


def check_prometheus_targets():
    auth = {"Authorization": basicauth_header(GRAFANA_USER, GRAFANA_PASS)}
    status, body = req("GET", "/prometheus/api/v1/targets", headers=auth)
    must(
        "Prometheus /api/v1/targets returns 200",
        status == 200,
        f"got HTTP {status}: {body[:120]!r}",
    )
    # v1.0 acceptance: relaxed — at least 1 active target (self-scrape).
    # Plan 05-04 ships /metrics on 8 services; that's when targets count grows to 9.
    import json
    try:
        data = json.loads(body)
        active = data.get("data", {}).get("activeTargets", [])
        n_active = len(active)
    except json.JSONDecodeError:
        n_active = 0
    must(
        f"Prometheus active targets >= 1 (got {n_active})",
        n_active >= 1,
        f"need at least 1 active target (Prom self-scrape); Plan 05-04 grows this to 9",
    )


def check_grafana_health():
    if not GRAFANA_PASS:
        must("GRAFANA_PASS env set (required for /grafana basicauth)", False)
    auth = {"Authorization": basicauth_header(GRAFANA_USER, GRAFANA_PASS)}
    status, body = req("GET", "/grafana/api/health", headers=auth)
    must(
        "Grafana /api/health returns 200",
        status == 200,
        f"got HTTP {status}: {body[:200]!r}",
    )
    must(
        "Grafana health body has 'ok' or 'database'",
        "ok" in body.lower() or "database" in body.lower(),
        f"unexpected body: {body[:200]!r}",
    )


def check_caddy_root():
    status, body = req("GET", "/")
    must(
        "Caddy root / returns 200 (sanity)",
        status == 200,
        f"got HTTP {status}",
    )


def check_loki_push_forbidden_from_dev():
    """Loki push endpoint should return 403 from non-prod-VPS IP (Caddy @allowed_loki matcher)."""
    status, body = req("POST", "/loki/api/v1/push", headers={"Content-Type": "application/json"})
    must(
        "Loki /api/v1/push returns 403 from dev workstation (D-36 allowlist)",
        status == 403,
        f"got HTTP {status}: {body[:120]!r}",
    )


def main():
    print(f"[smoke] BASE={BASE}")
    print(f"[smoke] GRAFANA_USER={GRAFANA_USER!r}, GRAFANA_PASS={'set' if GRAFANA_PASS else 'UNSET'}")
    print()
    check_caddy_root()
    check_loki_ready()
    check_prometheus_healthy()
    check_prometheus_targets()
    check_grafana_health()
    check_loki_push_forbidden_from_dev()
    print()
    print("[smoke] ALL CHECKS PASS — observability-stack healthy on srv1561293:8443")


if __name__ == "__main__":
    main()
