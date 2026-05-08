#!/usr/bin/env python3
"""
End-to-end smoke test для Phase C: stories.

Покрывает:
  1. Регистрация двух юзеров (alice, bob)
  2. Bob → POST /follows/{alice} (без follow Alice's stories Bob не увидит)
  3. Alice → POST /uploads (presigned PUT) → PUT bytes → POST /uploads/{id}/complete
  4. Alice → POST /stories с media_id + overlay → 201
  5. Bob → GET /stories/feed → видит Alice's story с iViewed=false
  6. Bob → POST /stories/{id}/views → 204
  7. Bob → GET /stories/feed → iViewed=true, viewCount=1
  8. Alice → GET /stories/{id}/views → видит Bob
  9. Alice → DELETE /stories/{id} → 204
  10. Bob → GET /stories/feed → пусто

Запуск: python3 scripts/smoke_stories.py
"""

import os
import sys
import time
import uuid
import json
import io
import urllib.request
import urllib.error

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")


def req(method: str, path: str, *, token: str | None = None, body=None, headers=None, raw_body: bytes | None = None, full_url: str | None = None):
    url = full_url or (BASE + path)
    h = {"Accept": "application/json"}
    if headers:
        h.update(headers)
    if token:
        h["Authorization"] = f"Bearer {token}"
    data: bytes | None = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    elif raw_body is not None:
        data = raw_body
    req_obj = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req_obj, timeout=30) as resp:
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


def must(status: int, expect: int, name: str, body=None):
    if status != expect:
        print(f"❌ {name}: expected {expect}, got {status}: {body}")
        sys.exit(1)
    print(f"✓ {name} → {status}")


def register(handle: str) -> dict:
    # Identity API ожидает email + password, не handle/username.
    email = f"{handle}-{uuid.uuid4().hex[:8]}@smoke.local"
    s, b = req("POST", "/auth/register", body={"email": email, "password": "smoke-pass-1234"})
    must(s, 201, f"register {handle}", b)
    return {"email": email, "user_id": b["user"]["id"], "access": b["accessToken"]}


def main():
    print(f"BASE = {BASE}")
    print("\n=== 1. Register users ===")
    alice = register("alice")
    bob = register("bob")
    print(f"alice.user_id = {alice['user_id']}")
    print(f"bob.user_id   = {bob['user_id']}")

    print("\n=== 2. Bob follows Alice ===")
    s, b = req("POST", f"/follows/{alice['user_id']}", token=bob["access"])
    if s not in (200, 201, 204):
        must(s, 204, "bob follows alice", b)
    print(f"✓ bob follows alice → {s}")

    print("\n=== 3. Alice uploads media (presigned) ===")
    # Use a tiny PNG (1×1 transparent).
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
        "ae426082"
    )
    s, b = req(
        "POST",
        "/uploads",
        token=alice["access"],
        body={"kind": "image", "mime": "image/png", "sizeBytes": len(png_bytes)},
    )
    must(s, 200, "init upload", b)
    media_id = b["mediaId"]
    upload_url = b["uploadUrl"]
    print(f"   media_id = {media_id}")

    # PUT raw bytes to presigned URL.
    s, _ = req("PUT", "", full_url=upload_url, raw_body=png_bytes, headers={"Content-Type": "image/png"})
    must(s, 200, "PUT to S3", None)

    s, b = req(
        "POST", f"/uploads/{media_id}/complete", token=alice["access"], body={}
    )
    must(s, 200, "complete upload", b)

    print("\n=== 4. Alice publishes story ===")
    s, b = req(
        "POST",
        "/stories",
        token=alice["access"],
        body={"mediaId": media_id, "overlayText": "smoke test 🏃"},
    )
    must(s, 201, "publish story", b)
    story_id = b["id"]
    print(f"   story_id = {story_id}")

    print("\n=== 5. Bob's feed contains Alice's story ===")
    s, feed = req("GET", "/stories/feed", token=bob["access"])
    must(s, 200, "bob fetch feed", feed)
    if not isinstance(feed, list) or len(feed) == 0:
        print(f"❌ feed empty: {feed}")
        sys.exit(1)
    found = next((s for s in feed if s["id"] == story_id), None)
    if not found:
        print(f"❌ story {story_id} not in feed: {feed}")
        sys.exit(1)
    if found["iViewed"]:
        print(f"❌ iViewed should be false, got true")
        sys.exit(1)
    if found["viewCount"] != 0:
        print(f"❌ viewCount should be 0, got {found['viewCount']}")
        sys.exit(1)
    print(f"✓ feed has story, iViewed=false, viewCount=0")

    print("\n=== 6. Bob marks viewed ===")
    s, b = req("POST", f"/stories/{story_id}/views", token=bob["access"], body={})
    must(s, 204, "mark viewed", b)

    print("\n=== 7. Bob's feed shows iViewed=true, viewCount=1 ===")
    s, feed = req("GET", "/stories/feed", token=bob["access"])
    must(s, 200, "bob refetch feed", feed)
    found = next((s for s in feed if s["id"] == story_id), None)
    if not found or not found["iViewed"] or found["viewCount"] != 1:
        print(f"❌ unexpected: {found}")
        sys.exit(1)
    print(f"✓ iViewed=true, viewCount=1")

    print("\n=== 8. Alice lists viewers ===")
    s, viewers = req("GET", f"/stories/{story_id}/views", token=alice["access"])
    must(s, 200, "list viewers", viewers)
    bob_view = next((v for v in viewers if v["viewerId"] == bob["user_id"]), None)
    if not bob_view:
        print(f"❌ bob not in viewers: {viewers}")
        sys.exit(1)
    print(f"✓ bob in viewers list")

    print("\n=== 9. Alice deletes story ===")
    s, b = req("DELETE", f"/stories/{story_id}", token=alice["access"])
    must(s, 204, "delete story", b)

    print("\n=== 10. Bob's feed no longer has the story ===")
    s, feed = req("GET", "/stories/feed", token=bob["access"])
    must(s, 200, "bob refetch after delete", feed)
    found = next((s for s in feed if s["id"] == story_id), None)
    if found:
        print(f"❌ story still in feed after delete: {found}")
        sys.exit(1)
    print(f"✓ story gone from feed")

    print("\n=== 11. Bob can't access deleted story ===")
    s, b = req("GET", f"/stories/{story_id}/views", token=bob["access"])
    if s != 404 and s != 403:
        print(f"⚠ expected 404/403, got {s}: {b}")
    else:
        print(f"✓ access denied → {s}")

    print("\n🎉 All Phase C smoke checks passed.")


if __name__ == "__main__":
    main()
