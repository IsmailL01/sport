#!/usr/bin/env python3
"""
Phase 5 / Plan 05-07 v2 — Grafana D-26 alert provisioning smoke

Verifies via Grafana provisioning API that:
  - Telegram contact-point 'telegram-alerts' exists
  - 6 alert rules (3 critical + 3 warning per D-26) are loaded
  - night-mute-msk mute timing exists
  - Notification policy routes severity=critical + severity=warning paths

Stdlib-only. Self-signed cert handled via ssl.CERT_NONE (D-37).

Env vars:
  BASE          — base URL (default: https://82.25.71.215:8443)
  GRAFANA_USER  — basicauth user (default: admin)
  GRAFANA_PASS  — basicauth pass (REQUIRED — from SOPS)
"""

import base64
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "https://82.25.71.215:8443")
GRAFANA_USER = os.environ.get("GRAFANA_USER", "admin")
GRAFANA_PASS = os.environ.get("GRAFANA_PASS", "")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def basicauth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def get_json(path: str):
    if not GRAFANA_PASS:
        print(f"  ✗ GRAFANA_PASS env unset"); sys.exit(1)
    auth = {"Authorization": basicauth_header(GRAFANA_USER, GRAFANA_PASS),
            "Accept": "application/json"}
    req = urllib.request.Request(f"{BASE}{path}", headers=auth)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode(errors="replace")}
    except Exception as e:
        return -1, {"error": str(e)}


def must(label: str, ok: bool, detail=""):
    if ok:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")
        if detail:
            print(f"      {detail}")
        sys.exit(1)


def check_contact_point():
    status, body = get_json("/grafana/api/v1/provisioning/contact-points")
    must("contact-points API returns 200", status == 200, f"got {status}: {body!r}")
    names = []
    if isinstance(body, list):
        names = [cp.get("name") for cp in body]
    elif isinstance(body, dict) and "contactPoints" in body:
        names = [cp.get("name") for cp in body["contactPoints"]]
    must("contact-point 'telegram-alerts' present",
         "telegram-alerts" in names,
         f"found: {names}")


def check_alert_rules():
    status, body = get_json("/grafana/api/v1/provisioning/alert-rules")
    must("alert-rules API returns 200", status == 200, f"got {status}")
    rules = body if isinstance(body, list) else []
    must(f"6 alert rules loaded (got {len(rules)})", len(rules) == 6,
         f"rule titles: {[r.get('title') for r in rules]}")
    titles = {r.get("title") for r in rules}
    expected = {
        "5xx_rate_over_5pct",
        "jwt_validation_failure_spike",
        "nats_consumer_lag_gt_1000",
        "http_p99_over_2x_baseline",
        "db_p99_over_500ms",
        "external_api_error_rate_over_10pct",
    }
    missing = expected - titles
    must(f"all 6 D-26 rules present (missing: {missing or 'none'})", not missing)


def check_mute_timing():
    status, body = get_json("/grafana/api/v1/provisioning/mute-timings")
    must("mute-timings API returns 200", status == 200, f"got {status}")
    names = [mt.get("name") for mt in body] if isinstance(body, list) else []
    must("mute-timing 'night-mute-msk' present",
         "night-mute-msk" in names,
         f"found: {names}")


def check_policies():
    status, body = get_json("/grafana/api/v1/provisioning/policies")
    must("policies API returns 200", status == 200, f"got {status}")
    # body is the root policy; routes carry the severity matchers
    routes = body.get("routes", []) if isinstance(body, dict) else []
    matchers = []
    for r in routes:
        m = r.get("object_matchers") or r.get("matchers") or []
        matchers.extend(m)
    matcher_strs = [str(m) for m in matchers]
    crit = any("critical" in s for s in matcher_strs)
    warn = any("warning" in s for s in matcher_strs)
    must("policy has severity=critical route", crit, f"routes: {routes}")
    must("policy has severity=warning route", warn, f"routes: {routes}")


def main():
    print(f"[smoke-alerts] BASE={BASE}")
    print(f"[smoke-alerts] GRAFANA_PASS={'set' if GRAFANA_PASS else 'UNSET'}")
    print()
    check_contact_point()
    check_alert_rules()
    check_mute_timing()
    check_policies()
    print()
    print("[smoke-alerts] ALL CHECKS PASS — D-26 alert provisioning healthy")


if __name__ == "__main__":
    main()
