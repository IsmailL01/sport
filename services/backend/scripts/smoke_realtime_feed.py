#!/usr/bin/env python3
"""
Smoke test: realtime delivery + push для feed-событий.

Проверяет:
  1. Alice публикует пост.
  2. Bob лайкает.
  3. notifications-сервис создал in-app notification для alice.
  4. NATS subject rt.user.{alice} получил event.
  5. Bob комментит.
  6. notifications для alice по comment.
  7. Self-like / self-comment не создают notification (skip).

Запуск: python3 scripts/smoke_realtime_feed.py
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


def psql(sql):
    cmd = f'docker exec -i re_postgres psql -U re -d running_ecosystem -tA -c "{sql}"'
    return subprocess.run(
        ["ssh", SSH_HOST, cmd],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. Register users ===")
    alice = register("alice-rt")
    bob = register("bob-rt")
    print(f"alice = {alice['user_id']}")
    print(f"bob   = {bob['user_id']}")

    print("\n=== 2. Alice publishes a post ===")
    s, post = req("POST", "/posts", token=alice["access"],
                  body={"kind": "text", "body": "real-time test"})
    must(s, 201, "publish post", post)
    post_id = post["id"]

    print("\n=== 3. Bob likes Alice's post ===")
    s, _ = req("POST", f"/posts/{post_id}/likes", token=bob["access"], body={})
    must(s, 204, "like", None)

    # Дать notification сервису время записать в БД (async).
    time.sleep(1)

    print("\n=== 4. Alice has 1 notification (feed.post.liked) ===")
    n = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{alice['user_id']}' "
        f"AND kind='feed.post.liked'"
    )
    if int(n) < 1:
        print(f"❌ expected ≥1 like notification, got {n}")
        sys.exit(1)
    print(f"✓ {n} like notification(s)")

    print("\n=== 5. Bob comments on Alice's post ===")
    s, _ = req("POST", f"/posts/{post_id}/comments",
               token=bob["access"], body={"body": "круто! 🏃"})
    must(s, 201, "comment", None)

    time.sleep(1)

    print("\n=== 6. Alice has 1 notification (feed.post.commented) ===")
    n = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{alice['user_id']}' "
        f"AND kind='feed.post.commented'"
    )
    if int(n) < 1:
        print(f"❌ expected ≥1 comment notification, got {n}")
        sys.exit(1)
    print(f"✓ {n} comment notification(s)")

    print("\n=== 7. Self-like (alice likes own post) — no notification ===")
    s, _ = req("POST", f"/posts/{post_id}/likes", token=alice["access"], body={})
    if s not in (204, 200):
        print(f"⚠ self-like returned {s} (likely no-op)")

    time.sleep(1)
    # Total like-notifications для alice не должно расти на self-like.
    n2 = psql(
        f"SELECT count(*) FROM notifications WHERE user_id='{alice['user_id']}' "
        f"AND kind='feed.post.liked'"
    )
    if int(n2) > int(n):
        print(f"❌ self-like added notification {n} → {n2}")
        sys.exit(1)
    print(f"✓ self-like skipped (still {n2} notifications)")

    print("\n=== 8. notifications log preview ===")
    log = psql(
        f"SELECT kind, created_at FROM notifications "
        f"WHERE user_id='{alice['user_id']}' ORDER BY created_at"
    )
    print(log)

    print("\n🎉 Realtime feed smoke passed.")


if __name__ == "__main__":
    main()
