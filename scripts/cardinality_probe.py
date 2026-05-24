#!/usr/bin/env python3
# scripts/cardinality_probe.py — Phase 5 / OBS-07 / D-18 cardinality budget probe.
#
# Что делает:
#   1. Для каждого из 8 backend сервисов: GET http://localhost:<port>/metrics
#      (use --host=<host> чтобы переопределить).
#   2. Парсит Prometheus text exposition format (см. https://github.com/prometheus/
#      docs/blob/main/content/docs/instrumenting/exposition_formats.md).
#   3. Для каждой metric line собирает labelset; асертит:
#      - НЕТ запрещённых labels (D-18 FORBIDDEN_LABELS):
#          user_id, session_id, device_id, external_uuid, email, phone
#      - <=1000 series per metric (sanity cap; pkg/observability/metrics.go
#        предсказывает <1750 для http_request_duration_seconds под P-99 load —
#        1000 — conservative threshold).
#   4. На любой failure: sys.exit(1) с verbose report.  Иначе sys.exit(0).
#
# Запуск:
#   python3 scripts/cardinality_probe.py
#   python3 scripts/cardinality_probe.py --host=127.0.0.1
#   python3 scripts/cardinality_probe.py --strict   # fail also if any service down
#
# CI usage (backend-ci.yml cardinality-probe job):
#   docker compose -f services/backend/docker-compose.prod.yml up -d
#   # wait for /metrics
#   for i in $(seq 1 12); do
#     curl -sf http://localhost:8081/metrics >/dev/null && break
#     sleep 5
#   done
#   python3 scripts/cardinality_probe.py
#
# Pitfall #6 (Plan 05-04 RESEARCH §1.7): never raw r.URL.Path in route label —
# enforced at pkg/observability/promhttp_middleware.go::extractRouteTemplate().
# Этот probe — runtime check; если URL.Path просочился, cardinality взорвётся
# и cap >1000 series поймает.
"""Cardinality probe for backend /metrics endpoints (Phase 5 OBS-07)."""

import argparse
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict

# 8 Go-сервисов (gateway = Caddy, не Go-target; Plan 05-04 wires только Go).
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

# D-18: набор label-names который НИКОГДА не должен появляться в Prom metrics.
# Любое попадание = cardinality bomb + PII leak в наблюдаемость stack.
FORBIDDEN_LABELS = {
    "user_id",
    "session_id",
    "device_id",
    "external_uuid",
    "email",
    "phone",
    "phone_number",
    "phoneNumber",
}

# Conservative per-metric series cap. Если конкретная метрика преодолевает —
# либо route-extraction регрессировала (Pitfall #6 raw URL.Path), либо план
# плохо выбрал bucketed labels.
MAX_SERIES_PER_METRIC = 1000

# Regex для prometheus text format строк метрик:
#   metric_name{label1="value1",label2="value2"} <number> [<timestamp>]
#   metric_name <number>                                  (без labels)
METRIC_LINE = re.compile(
    r"^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)"  # metric name
    r"(?:\{(?P<labels>[^}]*)\})?"  # optional label block
    r"\s+\S+(?:\s+\S+)?$"  # value [timestamp]
)
LABEL_KV = re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"')


def fetch_metrics(host: str, port: int, timeout: int = 5) -> str | None:
    """GET /metrics. Returns body or None если service недоступен."""
    url = f"http://{host}:{port}/metrics"
    req = urllib.request.Request(url, headers={"Accept": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError:
        return None
    except (TimeoutError, OSError):
        return None


def parse_metrics(body: str) -> dict[str, list[dict[str, str]]]:
    """Парсит Prom exposition. Returns {metric_name: [labelset, ...]}.

    HELP/TYPE-комментарии игнорируются. Histogram suffixes (_bucket / _count /
    _sum) НЕ schwarz'аются — каждый buckets line идёт как отдельная series
    на bucketname, but they're still budget-relevant.
    """
    out: dict[str, list[dict[str, str]]] = defaultdict(list)
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = METRIC_LINE.match(line)
        if not m:
            continue
        name = m.group("name")
        labels_str = m.group("labels") or ""
        labels: dict[str, str] = {}
        for kv in LABEL_KV.finditer(labels_str):
            labels[kv.group(1)] = kv.group(2)
        out[name].append(labels)
    return out


def check_service(svc: str, host: str, port: int) -> tuple[bool, list[str]]:
    """Returns (ok, errors). Service-down — отдельный case: ok=False с
    error 'unreachable' для --strict, иначе skip."""
    errors: list[str] = []
    body = fetch_metrics(host, port)
    if body is None:
        return False, [f"  unreachable http://{host}:{port}/metrics"]

    # Sanity: должен быть HELP http_request_duration_seconds в body — иначе
    # сервис /metrics не зарегистрировал PromhttpMiddleware (Plan 05-04 Task 2).
    if "http_request_duration_seconds" not in body:
        errors.append("  missing http_request_duration_seconds — middleware not wired?")

    metrics = parse_metrics(body)

    # Check 1: forbidden labels.
    for metric_name, labelsets in metrics.items():
        for labels in labelsets:
            for label_name in labels:
                if label_name in FORBIDDEN_LABELS:
                    errors.append(
                        f"  D-18 violation: metric {metric_name!r} has forbidden label "
                        f"{label_name!r} (value={labels[label_name]!r})"
                    )

    # Check 2: cardinality cap (series count per metric family base — strip
    # _bucket/_count/_sum suffixes для histogram aggregation).
    family_counts: Counter[str] = Counter()
    for metric_name, labelsets in metrics.items():
        base = metric_name
        for suffix in ("_bucket", "_count", "_sum"):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
                break
        family_counts[base] += len(labelsets)

    for family, count in family_counts.items():
        if count > MAX_SERIES_PER_METRIC:
            errors.append(
                f"  cardinality cap: {family} = {count} series (>{MAX_SERIES_PER_METRIC})"
            )

    return len(errors) == 0, errors


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--host",
        default="localhost",
        help="host для /metrics endpoints (default: localhost)",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="fail also if any service unreachable (CI mode)",
    )
    args = p.parse_args()

    print(f"== Cardinality probe — {len(SERVICES)} services on {args.host} ==")
    print(f"   Forbidden labels: {sorted(FORBIDDEN_LABELS)}")
    print(f"   Max series/metric: {MAX_SERIES_PER_METRIC}")
    print()

    failed_services: list[str] = []
    skipped_services: list[str] = []
    max_series_seen = 0

    for svc, port in SERVICES.items():
        ok, errors = check_service(svc, args.host, port)
        if errors and errors[0].strip().startswith("unreachable"):
            if args.strict:
                print(f"❌ {svc} (port {port}) — unreachable (strict mode)")
                failed_services.append(svc)
            else:
                print(f"⊘  {svc} (port {port}) — unreachable (skipped)")
                skipped_services.append(svc)
            continue

        # Re-fetch для series-count summary (no-op IO, тот же body).
        body = fetch_metrics(args.host, port) or ""
        metrics = parse_metrics(body)
        local_max = max((len(v) for v in metrics.values()), default=0)
        max_series_seen = max(max_series_seen, local_max)

        if ok:
            print(f"✓ {svc} (port {port}) — {sum(len(v) for v in metrics.values())} series, max-per-metric={local_max}")
        else:
            print(f"❌ {svc} (port {port}):")
            for err in errors:
                print(err)
            failed_services.append(svc)

    print()
    if failed_services:
        print(f"FAIL: {len(failed_services)} services failed: {failed_services}")
        return 1

    summary = (
        f"PASS: {len(SERVICES) - len(skipped_services)} services scraped, "
        f"0 forbidden labels, max {max_series_seen} series/metric"
    )
    if skipped_services:
        summary += f" (skipped: {skipped_services} — non-strict mode)"
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
