#!/usr/bin/env python3
"""
Smoke test: passwordless email + OTP login flow.

Покрывает:
  1. POST /auth/request-code → 202 + devCode (dev mode)
  2. POST /auth/login-with-code → 200 + accessToken + new user created
  3. Wrong code → 401 + не созданы дубли users
  4. Same code reuse → 401 (used_at marker)
  5. Repeat request-code для существующего email → новый код, старый невалиден
  6. /me с access token → 200 + user data
  7. Code expired (TTL 10 min) — skip в smoke (slow)

Запуск: python3 scripts/smoke_otp.py
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")
# Phase M9.5: identity service в IDENTITY_DEV_MODE=true принимает ЛЮБОЙ
# 6-значный код (для тестов с APK без email). Smoke в этом режиме
# пропускает шаги, проверяющие strict-OTP (reuse-401, wrong-401).
DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "true") == "true"


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


def main():
    print(f"BASE = {BASE}")
    email = f"otp-{uuid.uuid4().hex[:10]}@smoke.local"
    print(f"email = {email}")

    print("\n=== 1. Request first code ===")
    s, b = req("POST", "/auth/request-code", body={"email": email})
    must(s, 202, "request-code", b)
    code1 = b.get("devCode")
    if not code1 or len(code1) != 6:
        print(f"❌ no devCode in response: {b}")
        sys.exit(1)
    print(f"   devCode = {code1}")

    print("\n=== 2. Login with code → 200 + token + new user ===")
    s, b = req("POST", "/auth/login-with-code", body={"email": email, "code": code1})
    must(s, 200, "login-with-code", b)
    if not b.get("accessToken") or not b.get("user"):
        print(f"❌ malformed body: {b}")
        sys.exit(1)
    access = b["accessToken"]
    user_id = b["user"]["id"]
    print(f"   user_id = {user_id}")
    print(f"   displayName = {b['user']['displayName']}")

    if DEV_MODE:
        print("\n=== 3-5. SKIP в dev-mode (любой 6-значный код пропускается) ===")
        # Ensure non-digit ALL still rejected even в DevMode:
        s, _ = req("POST", "/auth/login-with-code", body={"email": email, "code": "abcdef"})
        if s != 401:
            print(f"❌ non-digit code: expected 401, got {s}")
            sys.exit(1)
        print(f"✓ non-digit code still → 401 (regardless of DevMode)")
    else:
        print("\n=== 3. Reuse used code → 401 ===")
        s, b = req("POST", "/auth/login-with-code", body={"email": email, "code": code1})
        if s != 401:
            print(f"❌ expected 401, got {s}: {b}")
            sys.exit(1)
        print(f"✓ reused code → 401")

        print("\n=== 4. Wrong code on fresh request → 401, attempts++ ===")
        s, b = req("POST", "/auth/request-code", body={"email": email})
        must(s, 202, "second request-code", b)
        code2 = b["devCode"]
        print(f"   new devCode = {code2}")

        for i in range(3):
            s, _ = req("POST", "/auth/login-with-code", body={"email": email, "code": "000000"})
            if s != 401:
                print(f"❌ attempt {i+1}: expected 401, got {s}")
                sys.exit(1)
        print(f"✓ 3 wrong attempts → 401")

        print("\n=== 5. Right code still works (attempts < 5) ===")
        s, b = req("POST", "/auth/login-with-code", body={"email": email, "code": code2})
        must(s, 200, "right code after 3 wrong", b)

    print("\n=== 6. /me with access token ===")
    s, me = req("GET", "/me", token=access)
    must(s, 200, "/me", me)
    if me.get("id") != user_id:
        print(f"❌ /me id mismatch")
        sys.exit(1)
    print(f"   /me id = {me['id']}")

    print("\n=== 7. Invalid email format → 4xx ===")
    s, _ = req("POST", "/auth/request-code", body={"email": "not-an-email"})
    if s == 202:
        print(f"❌ should reject invalid email; got 202")
        sys.exit(1)
    print(f"✓ invalid email → {s}")

    print("\n🎉 OTP smoke passed.")


if __name__ == "__main__":
    main()
