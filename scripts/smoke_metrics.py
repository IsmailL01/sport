#!/usr/bin/env python3
# scripts/smoke_metrics.py — Phase 5 / OBS-05 / VALIDATION row OBS-05 smoke.
#
# Проверяет что все 8 backend сервисов отвечают HTTP 200 на /metrics +
# тело содержит HELP http_request_duration_seconds. То есть Plan 05-04
# Task 2 (PromhttpMiddleware wire) реально зарегистрирован на каждом
# /metrics endpoint.
#
# Запуск:
#   python3 scripts/smoke_metrics.py                     # check 8 services
#   python3 scripts/smoke_metrics.py --strict            # also check все 6
#                                                          D-17 семейств present
#   python3 scripts/smoke_metrics.py --host=127.0.0.1
#
# Distinct from cardinality_probe.py: smoke_metrics — простой endpoint-up
# check; cardinality_probe — глубокий парсинг + D-18 enforcement.
"""Smoke test: backend /metrics endpoints up and serving Prom format."""

import argparse
import sys
import urllib.error
import urllib.request

# Same 8 services как в cardinality_probe.py — single source of truth could
# be a shared config, но 2 файла-копии — это OK trade-off (2 dev team).
SERVICES = {
    "identity": 8081,
    "activity-sync": 8082,
    "messaging": 8083,
    "social-graph": 8084,
    "feed": 8085,
    "media": 8086,
    "notifications": 8087,
    "realtime-gw": 8090,
}

# D-17: 6 семейств метрик что должны быть зарегистрированы каждым сервисом
# через pkg/observability/metrics.go promauto.New*Vec.  При --strict
# проверяем все 6 HELP-строк в body каждого /metrics output.
D17_FAMILIES = [
    "http_request_duration_seconds",
    "http_requests_total",
    "jwt_validation_total",
    "nats_consumer_pending",
    "db_query_duration_seconds",
    "external_api_duration_seconds",
]


def req(url: str, timeout: int = 5) -> tuple[int, str]:
    """GET. Returns (status, body). Status=0 если network error."""
    r = urllib.request.Request(url, headers={"Accept": "text/plain"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace") if e.fp else ""
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, str(e)


def must(cond: bool, name: str, detail: str = "") -> None:
    if not cond:
        print(f"❌ {name}{(': ' + detail) if detail else ''}")
        sys.exit(1)
    print(f"✓ {name}")


def check_service(svc: str, host: str, port: int, strict: bool) -> bool:
    url = f"http://{host}:{port}/metrics"
    status, body = req(url)
    if status != 200:
        print(f"❌ {svc} ({url}) → status={status}")
        return False

    if "# HELP http_request_duration_seconds" not in body:
        print(f"❌ {svc} ({url}) → missing HELP http_request_duration_seconds")
        return False

    if strict:
        missing = [
            f for f in D17_FAMILIES
            if f"# HELP {f}" not in body
        ]
        if missing:
            print(f"❌ {svc} → missing HELP lines for: {missing}")
            return False

    print(f"✓ {svc} ({url}) — Prom format, all D-17 families={'yes' if strict else 'http_request_duration_seconds only'}")
    return True


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="localhost")
    p.add_argument(
        "--strict",
        action="store_true",
        help="assert all 6 D-17 metric family HELP lines present",
    )
    args = p.parse_args()

    print(f"== /metrics smoke — {len(SERVICES)} services on {args.host} ==")
    print()

    failures = []
    for svc, port in SERVICES.items():
        if not check_service(svc, args.host, port, args.strict):
            failures.append(svc)

    print()
    if failures:
        print(f"FAIL: {len(failures)} services failed: {failures}")
        return 1

    mode = "strict (6/6 D-17 families)" if args.strict else "default (HELP http_request_duration_seconds)"
    print(f"PASS: {len(SERVICES)} services serve /metrics with {mode}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
