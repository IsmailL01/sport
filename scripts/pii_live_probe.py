#!/usr/bin/env python3
# scripts/pii_live_probe.py — Phase 5 / Plan 05-06 / OBS-06 runtime row.
#
# Tails Loki via Grafana proxy datasource over --duration seconds, regex-scans
# every captured log line against PII_PATTERNS (GPS / phone / displayName /
# external_uuid / OTP). Exit 0 with "0 PII matches" on clean capture; exit 1
# with offending excerpts on first match.
#
# Plan 05-03 + 05-04 + 05-05 ensure PII never reaches the wire at the
# attribute-key level (PIIDenyList) и at the span-attribute level
# (piiScrubProcessor). This probe is the runtime audit that proves it —
# regex matches PII patterns в log line CONTENT, defense-in-depth complement
# к scripts/pii_audit.sh (which audits Go source for D-12 attribute names).
#
# Usage:
#   python3 scripts/pii_live_probe.py                        # 60s window, $GRAFANA_BASE
#   python3 scripts/pii_live_probe.py --duration 300         # 5-min window
#   GRAFANA_BASE=https://... python3 scripts/pii_live_probe.py
#   BASIC_AUTH_USER=admin BASIC_AUTH_PASS=... python3 scripts/pii_live_probe.py
#
# Idempotent — re-run yields identical exit semantics (read-only Loki query).
"""Runtime PII audit: tail Loki + regex-scan log lines for D-12 leakage."""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Default Grafana base — Plan 05-07 deployed Caddy-fronted Grafana at this
# sslip.io hostname on observability VPS srv1561293 (per ADR-0010 amendment).
# Self-signed cert per D-37 — pii_live_probe trusts via context.
DEFAULT_GRAFANA_BASE = "https://82-25-71-215.sslip.io:8443"

# Grafana's datasource ID for Loki. Provisioned by Plan 05-07 as uid="loki" with
# numeric ID resolved at runtime via /api/datasources/uid/loki — Grafana API
# convention. For v1.0 single-tenant, ID stays stable; if it drifts, override
# via --loki-datasource-id arg.
DEFAULT_LOKI_DS_UID = "loki"

DEFAULT_DURATION_SEC = 60

# =============================================================================
# PII_PATTERNS — regex map per RESEARCH §2 + D-12 deny-list (content-level).
# Each pattern has documented false-positive risk vs detection coverage trade-
# off. A match here = PII bypassed the slog handler scrub (which drops by
# ATTRIBUTE KEY, not content) — meaning somebody string-interpolated PII into
# a log message body. That's the audit signal we want.
# =============================================================================
PII_PATTERNS: dict[str, re.Pattern] = {
    # GPS coords — 3+ decimal places. Real GPS precision is ≥4dp; 3dp is
    # the conservative lower bound. False-positive risk: legitimate floats
    # in messages (prices, timing durations) may match. Mitigation: the slog
    # handler convention is "numbers go in structured attrs, not in message
    # text" — so a hit here indicates a discipline violation, regardless of
    # whether the float is GPS-shaped per-se.
    "gps_coords": re.compile(r"\b-?\d{1,3}\.\d{3,}\b"),
    # International phone format — `+` + 10..15 digits or bare 10..15 digits.
    # The `+`-prefix anchor catches E.164; bare-digit fallback catches
    # de-normalized forms (just country code + national number).
    "phone": re.compile(r"\+?\d{10,15}"),
    # UUIDv4 shape — 8-4-4-4-12 hex. Catches external_uuid from Strava /
    # Garmin sync as well as internal user_id leaks. Either is a finding per
    # D-18 (no user_id in log messages — should be structured attr with
    # request_id correlation instead).
    "external_uuid": re.compile(
        r"\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b",
        re.IGNORECASE,
    ),
    # 6-digit OTP. False-positive risk: zip codes, 6-digit timestamps, error
    # codes. Defense-in-depth: Plan 05-03 D-13 OTP fix already drops `code`
    # by attribute key; a regex hit here means string-interpolation bypass.
    "otp_code": re.compile(r"\b\d{6}\b"),
    # JSON attr "displayName" / "display_name" / "name" with a Latin or
    # Cyrillic letter value — catches structured field bypasses where a
    # name attr slipped past the deny-list (e.g., new attribute keys not
    # yet in D-12).
    "displayName_attr": re.compile(
        r'"(?:displayName|display_name|name)"\s*:\s*"[A-Za-zЀ-ӿ]'
    ),
}


def build_loki_query_url(grafana_base: str, ds_uid: str, duration_sec: int) -> str:
    """Build Grafana datasource proxy URL for Loki query_range over last
    duration_sec seconds. Uses uid-based proxy (Grafana >=9) to avoid the
    deprecated numeric-ID path."""
    now_ns = int(time.time() * 1_000_000_000)
    start_ns = now_ns - duration_sec * 1_000_000_000
    # `{service=~".+"}` matches every stream with a `service` label — Plan 05-03
    # slog default attr ensures every service emits this. limit=5000 keeps
    # response bounded (5000 lines / 60s = 83 lines/sec is plenty for a
    # closed-beta scale window; if window saturates, exit 0 still safe — we
    # only audit what we see, and CI runs this every commit).
    query = urllib.parse.quote('{service=~".+"}')
    return (
        f"{grafana_base.rstrip('/')}/api/datasources/proxy/uid/{ds_uid}"
        f"/loki/api/v1/query_range"
        f"?query={query}&start={start_ns}&end={now_ns}&limit=5000"
    )


def fetch_loki(url: str, timeout_sec: int = 30) -> dict:
    """GET the Loki query URL; return parsed JSON. Raises on auth/network."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})

    # Auth — prefer API key (Authorization: Bearer); fall back to basic auth.
    api_key = os.environ.get("GRAFANA_API_KEY")
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")
    elif os.environ.get("BASIC_AUTH_USER") and os.environ.get("BASIC_AUTH_PASS"):
        userpass = f"{os.environ['BASIC_AUTH_USER']}:{os.environ['BASIC_AUTH_PASS']}"
        b64 = base64.b64encode(userpass.encode("ascii")).decode("ascii")
        req.add_header("Authorization", f"Basic {b64}")
    # If neither set — try unauthenticated; Caddy basicauth on observability
    # VPS will respond 401. Probe surfaces that as exit 3 with a friendly hint.

    # TLS — observability VPS uses self-signed Caddy cert per D-37.  Use
    # unverified context for v1.0 (matches Alloy's tls_config insecure_skip_
    # verify=true). v1.1 domain migration to a real cert removes this.
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    with urllib.request.urlopen(req, timeout=timeout_sec, context=ctx) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    return json.loads(body)


def scan_streams_for_pii(streams: list[dict]) -> tuple[int, list[dict]]:
    """Iterate Loki streams + lines, regex-scan against PII_PATTERNS. Returns
    (total_lines, matches[]). Each match is {category, line_excerpt, stream_labels,
    timestamp_ns}."""
    matches: list[dict] = []
    total_lines = 0
    for stream in streams:
        labels = stream.get("stream", {})
        values = stream.get("values", [])
        for ts_ns_str, line in values:
            total_lines += 1
            for category, pattern in PII_PATTERNS.items():
                if pattern.search(line):
                    matches.append({
                        "category": category,
                        "line_excerpt": line[:120],
                        "stream_labels": labels,
                        "timestamp_ns": ts_ns_str,
                    })
                    # First match per line is enough — bail to next line.
                    break
    return total_lines, matches


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tail Loki, regex-scan log lines for D-12 PII leakage."
    )
    parser.add_argument(
        "--duration", type=int, default=DEFAULT_DURATION_SEC,
        help=f"Lookback window in seconds (default {DEFAULT_DURATION_SEC}).",
    )
    parser.add_argument(
        "--grafana-base", type=str,
        default=os.environ.get("GRAFANA_BASE", DEFAULT_GRAFANA_BASE),
        help="Grafana base URL (default $GRAFANA_BASE or builtin).",
    )
    parser.add_argument(
        "--loki-datasource-uid", type=str,
        default=os.environ.get("LOKI_DS_UID", DEFAULT_LOKI_DS_UID),
        help="Loki datasource UID in Grafana (default 'loki').",
    )
    args = parser.parse_args()

    url = build_loki_query_url(args.grafana_base, args.loki_datasource_uid, args.duration)
    print(f"PII live probe — querying Loki: {args.grafana_base} "
          f"(window={args.duration}s, ds_uid={args.loki_datasource_uid})", file=sys.stderr)

    try:
        data = fetch_loki(url)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(f"❌ Loki auth failed (HTTP {e.code}). "
                  "Set GRAFANA_API_KEY or BASIC_AUTH_USER+BASIC_AUTH_PASS.",
                  file=sys.stderr)
            return 3
        print(f"❌ Loki HTTP error {e.code}: {e.reason}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"❌ Loki network error: {e}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"❌ Loki returned non-JSON: {e}", file=sys.stderr)
        return 2

    streams = data.get("data", {}).get("result", [])
    total_lines, matches = scan_streams_for_pii(streams)

    print(f"Scanned {total_lines} log lines across {len(streams)} streams "
          f"over {args.duration}s window")

    if matches:
        print(f"❌ {len(matches)} PII matches found:", file=sys.stderr)
        for i, m in enumerate(matches[:5], start=1):
            svc = m["stream_labels"].get("service", "?")
            print(
                f"  [{i}] category={m['category']} service={svc}\n"
                f"      line: {m['line_excerpt']}",
                file=sys.stderr,
            )
        if len(matches) > 5:
            print(f"  ... ({len(matches) - 5} more matches truncated)", file=sys.stderr)
        return 1

    print(f"✓ 0 PII matches in {total_lines} log lines")
    print("🎉 Phase 5 / OBS-06 runtime check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
