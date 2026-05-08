#!/usr/bin/env python3
"""
Smoke test: realtime fanout для stories.

Проверяет:
  1. Bob follows Alice (BEFORE Alice publishes — иначе нет fanout-target).
  2. Alice publishes story → notifications-сервис создаёт row для bob
     (kind='feed.story.published').
  3. Self-fanout skip: alice не получает уведомление о своей story.
  4. Не-followers не получают уведомление: charlie без follow → 0 rows.

Запуск: python3 scripts/smoke_realtime_stories.py
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")
SSH_HOST = "root@148.253.214.156"


def req(method, path, *, token=None, body=None, raw_body=None, full_url=None, headers=None):
    url = full_url or (BASE + path)
    h = {"Accept": "application/json"}
    if headers:
        h.update(headers)
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    elif raw_body is not None:
        data = raw_body
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


def psql(sql):
    cmd = f'docker exec -i re_postgres psql -U re -d running_ecosystem -tA -c "{sql}"'
    return subprocess.run(
        ["ssh", SSH_HOST, cmd],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. Register users ===")
    alice = register("alice-st")
    bob = register("bob-st")
    charlie = register("charlie-st")
    print(f"alice={alice['user_id']}")
    print(f"bob={bob['user_id']}")
    print(f"charlie={charlie['user_id']}")

    print("\n=== 2. Bob follows Alice (charlie не follow) ===")
    s, _ = req("POST", f"/follows/{alice['user_id']}", token=bob["access"])
    if s not in (204, 200, 201):
        print(f"❌ follow returned {s}")
        sys.exit(1)
    print(f"✓ follow → {s}")

    # Время чтобы DB зафиксировал follow.
    time.sleep(0.5)

    print("\n=== 3. Alice uploads media + publishes story ===")
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
        "ae426082"
    )
    s, b = req("POST", "/uploads", token=alice["access"],
               body={"kind": "image", "mime": "image/png", "sizeBytes": len(png)})
    must(s, 200, "init upload", b)
    media_id = b["mediaId"]
    s, _ = req("PUT", "", full_url=b["uploadUrl"], raw_body=png, headers={"Content-Type": "image/png"})
    must(s, 200, "PUT to S3", None)
    s, _ = req("POST", f"/uploads/{media_id}/complete", token=alice["access"], body={})
    must(s, 200, "complete upload", None)

    s, story = req("POST", "/stories", token=alice["access"],
                   body={"mediaId": media_id, "overlayText": "RT fanout test"})
    must(s, 201, "publish story", story)

    time.sleep(1)

    print("\n=== 4. Bob получает уведомление feed.story.published ===")
    n_bob = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{bob['user_id']}' "
        f"AND kind='feed.story.published'"
    )
    if int(n_bob) < 1:
        print(f"❌ expected ≥1 для bob, got {n_bob}")
        sys.exit(1)
    print(f"✓ bob has {n_bob} story notification(s)")

    print("\n=== 5. Alice (self) НЕ получает уведомление ===")
    n_alice = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{alice['user_id']}' "
        f"AND kind='feed.story.published'"
    )
    if int(n_alice) > 0:
        print(f"❌ alice should not get notification, got {n_alice}")
        sys.exit(1)
    print(f"✓ alice has 0 (self skipped)")

    print("\n=== 6. Charlie (не follower) НЕ получает ===")
    n_charlie = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{charlie['user_id']}' "
        f"AND kind='feed.story.published'"
    )
    if int(n_charlie) > 0:
        print(f"❌ charlie should not get notification, got {n_charlie}")
        sys.exit(1)
    print(f"✓ charlie has 0 (not a follower)")

    print("\n🎉 Realtime stories fanout smoke passed.")


if __name__ == "__main__":
    main()
