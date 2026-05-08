#!/usr/bin/env python3
"""
Smoke test: rate limiting (Redis sliding window).

Покрывает:
  1. createPost: 5 за минуту разрешено, 6-й даёт 429 + Retry-After.
  2. follow: 5 за минуту разрешено, 6-й 429.
  3. report: 5 за час разрешено, 6-й 429.
  4. После окна — снова allowed (skip — окно 1 минута, не ждём в smoke).

Запуск: python3 scripts/smoke_ratelimit.py
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

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
            return resp.status, dict(resp.headers), raw
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def must(s, expect, name):
    if s != expect:
        print(f"❌ {name}: expected {expect}, got {s}")
        sys.exit(1)
    print(f"✓ {name} → {s}")


def register(handle):
    email = f"{handle}-{uuid.uuid4().hex[:8]}@smoke.local"
    s, _, b = req("POST", "/auth/register", body={"email": email, "password": "smoke-pass-1234"})
    must(s, 201, f"register {handle}")
    body = json.loads(b)
    return {"user_id": body["user"]["id"], "access": body["accessToken"]}


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. createPost limit (5/min) ===")
    alice = register("alice-rl")
    # 5 успешных
    for i in range(5):
        s, _, _ = req("POST", "/posts", token=alice["access"],
                      body={"kind": "text", "body": f"post #{i+1}"})
        must(s, 201, f"post {i+1}")
    # 6-й — 429
    s, headers, b = req("POST", "/posts", token=alice["access"],
                        body={"kind": "text", "body": "post 6 should fail"})
    if s != 429:
        print(f"❌ expected 429, got {s}: {b!r}")
        sys.exit(1)
    retry_after = headers.get("Retry-After") or headers.get("retry-after")
    if not retry_after:
        print(f"❌ Retry-After header missing: {headers}")
        sys.exit(1)
    print(f"✓ 6th → 429 with Retry-After={retry_after}")

    print("\n=== 2. follow limit (5/min) ===")
    bob = register("bob-rl")
    # alice follow-ит 5 разных юзеров (через одного и того же — конфликт; нужна
    # уникальность). Сделаем 5 разных регистраций.
    targets = [register(f"target-{i}") for i in range(5)]
    for i, t in enumerate(targets):
        s, _, _ = req("POST", f"/follows/{t['user_id']}", token=bob["access"])
        if s not in (200, 201, 204):
            print(f"❌ follow {i+1} returned {s}")
            sys.exit(1)
        print(f"✓ follow {i+1} → {s}")
    # 6-й follow на нового пользователя
    sixth = register("target-6")
    s, headers, _ = req("POST", f"/follows/{sixth['user_id']}", token=bob["access"])
    if s != 429:
        print(f"❌ expected 429 for 6th follow, got {s}")
        sys.exit(1)
    retry = headers.get("Retry-After") or headers.get("retry-after")
    print(f"✓ 6th follow → 429, Retry-After={retry}")

    print("\n=== 3. report limit (5/hour) ===")
    charlie = register("charlie-rl")
    # Будем репортить тот же post — id неважен с точки зрения rate-limit.
    target_post_id = "00000000-0000-0000-0000-000000000000"
    for i in range(5):
        s, _, _ = req("POST", "/reports", token=charlie["access"], body={
            "targetKind": "post", "targetId": target_post_id, "reason": "spam",
        })
        must(s, 201, f"report {i+1}")
    s, headers, _ = req("POST", "/reports", token=charlie["access"], body={
        "targetKind": "post", "targetId": target_post_id, "reason": "spam",
    })
    if s != 429:
        print(f"❌ expected 429 for 6th report, got {s}")
        sys.exit(1)
    retry = headers.get("Retry-After") or headers.get("retry-after")
    print(f"✓ 6th report → 429, Retry-After={retry}")

    print("\n🎉 Rate limiting smoke passed.")


if __name__ == "__main__":
    main()
