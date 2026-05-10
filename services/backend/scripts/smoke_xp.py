#!/usr/bin/env python3
"""
Smoke test: XP + grade gamification pipeline.

Покрывает:
  1. Регистрация alice
  2. Trigger lazy profile creation (GET /profiles/{me})
  3. Initial xp_total=0, grade=D
  4. Upsert session (finalized, 16 km, 1h18m, avgHr=146) → XP = 16+5+0 = 21
  5. GET /profiles/{me} → xp_total=21, grade=D (need 100 for D+)
  6. Upsert ANOTHER session (10 km, avgHr=155) → XP = 10+5+3 = 18 → total 39, still D
  7. Upsert MANY sessions → grade upgrades
  8. Idempotency: повторный upsert той же сессии НЕ удваивает XP

Запуск: python3 scripts/smoke_xp.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")


def req(method, path, *, token=None, body=None):
    url = BASE + path
    h = {"Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype and raw:
                return resp.status, json.loads(raw)
            return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "replace")


def must(s, expect, name, body=None):
    if s != expect:
        print(f"❌ {name}: expected {expect}, got {s}: {body}")
        sys.exit(1)
    print(f"✓ {name} → {s}")


def register(handle):
    email = f"{handle}-{uuid.uuid4().hex[:8]}@smoke.local"
    s, b = req("POST", "/auth/register", body={"email": email, "password": "smoke-pass-1234"})
    must(s, 201, f"register {handle}", b)
    return {"user_id": b["user"]["id"], "access": b["accessToken"]}


def upsert_session(token, distance_m, duration_s, avg_hr=None, client_session_id=None):
    """Upsert a finalized session. Returns server session id."""
    if client_session_id is None:
        client_session_id = int(time.time() * 1000) + int(uuid.uuid4().int % 1000)
    now = datetime.now(timezone.utc)
    started = now.timestamp() - duration_s
    body = {
        "clientSessionId": client_session_id,
        "startedAt": datetime.fromtimestamp(started, timezone.utc).isoformat().replace("+00:00", "Z"),
        "endedAt": now.isoformat().replace("+00:00", "Z"),
        "distanceM": distance_m,
        "isClosed": True,
        "source": "phone",
    }
    if avg_hr is not None:
        body["avgHrBpm"] = avg_hr
    s, b = req("POST", "/sessions", token=token, body=body)
    if s not in (200, 201):
        print(f"❌ upsert: got {s}: {b}")
        sys.exit(1)
    print(f"✓ upsert session (d={distance_m}m, dur={duration_s}s, hr={avg_hr}) → {s}")
    return b["id"], client_session_id


def get_profile(token, user_id):
    s, b = req("GET", f"/profiles/{user_id}", token=token)
    must(s, 200, "get profile", b)
    return b


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. Register + lazy profile ===")
    alice = register("alice-xp")
    p = get_profile(alice["access"], alice["user_id"])
    print(f"   initial xp_total={p.get('xpTotal')} grade={p.get('grade')}")
    if p.get("xpTotal") != 0 or p.get("grade") != "D":
        print(f"❌ expected xp=0 grade=D, got {p.get('xpTotal')}/{p.get('grade')}")
        sys.exit(1)

    print("\n=== 2. Session 16 km / 1h18m / hr=146 → 16 + 5 (long) + 0 (hr<150) = 21 XP ===")
    upsert_session(alice["access"], distance_m=16000, duration_s=4736, avg_hr=146)
    time.sleep(0.5)
    p = get_profile(alice["access"], alice["user_id"])
    print(f"   xp_total={p['xpTotal']} grade={p['grade']}")
    if p["xpTotal"] != 21:
        print(f"❌ expected 21 xp, got {p['xpTotal']}")
        sys.exit(1)
    if p["grade"] != "D":
        print(f"❌ expected grade D, got {p['grade']}")
        sys.exit(1)

    print("\n=== 3. Session 10 km / 50m / hr=155 → 10 + 5 + 3 = 18 XP. Total 39 ===")
    upsert_session(alice["access"], distance_m=10000, duration_s=3000, avg_hr=155)
    time.sleep(0.5)
    p = get_profile(alice["access"], alice["user_id"])
    print(f"   xp_total={p['xpTotal']} grade={p['grade']}")
    if p["xpTotal"] != 39:
        print(f"❌ expected 39 xp, got {p['xpTotal']}")
        sys.exit(1)

    print("\n=== 4. Idempotency: повторный upsert (тот же clientSessionId) НЕ удваивает XP ===")
    # Get last session and re-upsert with same client_session_id.
    s, sessions = req("GET", "/sessions?limit=2", token=alice["access"])
    must(s, 200, "list sessions", sessions)
    last_cid = sessions[0]["clientSessionId"]
    upsert_session(alice["access"], distance_m=10000, duration_s=3000, avg_hr=155, client_session_id=last_cid)
    time.sleep(0.5)
    p = get_profile(alice["access"], alice["user_id"])
    if p["xpTotal"] != 39:
        print(f"❌ re-upsert added xp! 39 → {p['xpTotal']}")
        sys.exit(1)
    print(f"✓ idempotency holds: xp_total still 39")

    print("\n=== 5. Crank up to D+ (100 XP): нужно ещё 61 XP ===")
    # 5×16km = 5 × 21 = 105. Should push us to ≥139 → still D actually (100→D+).
    for i in range(5):
        upsert_session(alice["access"], distance_m=16000, duration_s=4500, avg_hr=146)
        time.sleep(0.3)
    p = get_profile(alice["access"], alice["user_id"])
    print(f"   xp_total={p['xpTotal']} grade={p['grade']}")
    if p["xpTotal"] < 100:
        print(f"❌ should be ≥100 xp by now")
        sys.exit(1)
    if p["grade"] not in ("D+", "C"):
        print(f"❌ expected D+ or higher after >100 xp, got {p['grade']}")
        sys.exit(1)
    print(f"✓ grade upgraded to {p['grade']}")

    print("\n🎉 XP + grade smoke passed.")


if __name__ == "__main__":
    main()
