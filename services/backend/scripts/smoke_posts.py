#!/usr/bin/env python3
"""
End-to-end smoke test для Phase D: posts + likes + comments + home feed.

Покрывает:
  1. Регистрация двух юзеров (alice, bob).
  2. Bob → POST /follows/{alice}.
  3. Alice → POST /uploads → PUT bytes → POST /uploads/{id}/complete.
  4. Alice → POST /posts (kind=photo + caption) → 201.
  5. Alice → POST /posts (kind=text "беговой пост").
  6. Bob → GET /feed/home → видит оба поста (последний первый).
  7. Bob → POST /posts/{id}/likes → 204; like_count = 1, iLiked = true.
  8. Bob → POST /posts/{id}/comments "круто!" → 201; comment_count = 1.
  9. Bob → GET /posts/{id}/comments → видит свой коммент.
  10. Alice → DELETE /posts/{id}/comments/{cid} (owner-of-post может удалять чужие).
  11. Alice → DELETE /posts/{id}.
  12. Bob → GET /feed/home → один пост остался.

Запуск: python3 scripts/smoke_posts.py
"""

import os
import sys
import json
import uuid
import urllib.request
import urllib.error

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")


def req(method, path, *, token=None, body=None, headers=None, raw_body=None, full_url=None):
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


def must(status, expect, name, body=None):
    if status != expect:
        print(f"❌ {name}: expected {expect}, got {status}: {body}")
        sys.exit(1)
    print(f"✓ {name} → {status}")


def register(handle):
    email = f"{handle}-{uuid.uuid4().hex[:8]}@smoke.local"
    s, b = req("POST", "/auth/register", body={"email": email, "password": "smoke-pass-1234"})
    must(s, 201, f"register {handle}", b)
    return {"email": email, "user_id": b["user"]["id"], "access": b["accessToken"]}


def main():
    print(f"BASE = {BASE}")
    print("\n=== 1. Register users ===")
    alice = register("alice-d")
    bob = register("bob-d")
    print(f"alice = {alice['user_id']}")
    print(f"bob   = {bob['user_id']}")

    print("\n=== 2. Bob follows Alice ===")
    s, b = req("POST", f"/follows/{alice['user_id']}", token=bob["access"])
    if s not in (200, 201, 204):
        must(s, 204, "bob follows alice", b)
    print(f"✓ bob follows alice → {s}")

    print("\n=== 3. Alice uploads media ===")
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
        "ae426082"
    )
    s, b = req("POST", "/uploads", token=alice["access"],
               body={"kind": "image", "mime": "image/png", "sizeBytes": len(png)})
    must(s, 200, "init upload", b)
    media_id = b["mediaId"]
    upload_url = b["uploadUrl"]

    s, _ = req("PUT", "", full_url=upload_url, raw_body=png, headers={"Content-Type": "image/png"})
    must(s, 200, "PUT to S3", None)

    s, b = req("POST", f"/uploads/{media_id}/complete", token=alice["access"], body={})
    must(s, 200, "complete upload", b)

    print("\n=== 4. Alice publishes photo post ===")
    s, photo_post = req("POST", "/posts", token=alice["access"], body={
        "kind": "photo", "mediaId": media_id, "body": "новый PR на 10K!"
    })
    must(s, 201, "publish photo post", photo_post)
    photo_id = photo_post["id"]
    print(f"   photo_id = {photo_id}")

    print("\n=== 5. Alice publishes text post ===")
    s, text_post = req("POST", "/posts", token=alice["access"], body={
        "kind": "text", "body": "первый беговой пост в этой соцсети"
    })
    must(s, 201, "publish text post", text_post)
    text_id = text_post["id"]
    print(f"   text_id = {text_id}")

    print("\n=== 6. Bob's home feed ===")
    s, feed = req("GET", "/feed/home", token=bob["access"])
    must(s, 200, "feed/home", feed)
    items = feed["items"]
    if len(items) < 2:
        print(f"❌ expected at least 2 items, got {len(items)}: {feed}")
        sys.exit(1)
    print(f"✓ feed has {len(items)} item(s); first kind={items[0]['kind']} created={items[0]['createdAt']}")
    if items[0]["createdAt"] < items[1]["createdAt"]:
        print(f"❌ feed not in DESC order")
        sys.exit(1)
    print(f"✓ DESC order")

    print("\n=== 7. Bob likes Alice's photo post ===")
    s, b = req("POST", f"/posts/{photo_id}/likes", token=bob["access"], body={})
    must(s, 204, "like post", b)

    s, post_after_like = req("GET", f"/posts/{photo_id}", token=bob["access"])
    must(s, 200, "GET post after like", post_after_like)
    if post_after_like["likeCount"] != 1:
        print(f"❌ likeCount expected 1, got {post_after_like['likeCount']}")
        sys.exit(1)
    print(f"✓ likeCount = 1")

    # iLiked для bob viewer:
    s, feed2 = req("GET", "/feed/home", token=bob["access"])
    must(s, 200, "feed/home as bob after like", feed2)
    photo_in_feed = next((p for p in feed2["items"] if p["id"] == photo_id), None)
    if not photo_in_feed["iLiked"]:
        print(f"❌ iLiked should be true for bob")
        sys.exit(1)
    print(f"✓ iLiked = true for bob")

    print("\n=== 8. Bob comments ===")
    s, comment = req("POST", f"/posts/{photo_id}/comments", token=bob["access"],
                     body={"body": "круто! 🏃"})
    must(s, 201, "comment", comment)
    comment_id = comment["id"]
    print(f"   comment_id = {comment_id}")

    s, post_after_cmt = req("GET", f"/posts/{photo_id}", token=alice["access"])
    must(s, 200, "GET post after comment", post_after_cmt)
    if post_after_cmt["commentCount"] != 1:
        print(f"❌ commentCount expected 1, got {post_after_cmt['commentCount']}")
        sys.exit(1)
    print(f"✓ commentCount = 1")

    print("\n=== 9. List comments ===")
    s, cmts = req("GET", f"/posts/{photo_id}/comments", token=alice["access"])
    must(s, 200, "list comments", cmts)
    if len(cmts["items"]) != 1:
        print(f"❌ expected 1 comment, got {len(cmts['items'])}: {cmts}")
        sys.exit(1)
    print(f"✓ 1 comment listed")

    print("\n=== 10. Bob unlikes ===")
    s, b = req("DELETE", f"/posts/{photo_id}/likes", token=bob["access"])
    must(s, 204, "unlike", b)
    s, post_unliked = req("GET", f"/posts/{photo_id}", token=bob["access"])
    if post_unliked["likeCount"] != 0:
        print(f"❌ likeCount should be 0, got {post_unliked['likeCount']}")
        sys.exit(1)
    print(f"✓ likeCount = 0")

    print("\n=== 11. Alice (post owner) deletes Bob's comment ===")
    s, b = req("DELETE", f"/posts/{photo_id}/comments/{comment_id}", token=alice["access"])
    must(s, 204, "owner delete comment", b)
    s, post_after_del = req("GET", f"/posts/{photo_id}", token=alice["access"])
    if post_after_del["commentCount"] != 0:
        print(f"❌ commentCount should be 0, got {post_after_del['commentCount']}")
        sys.exit(1)
    print(f"✓ commentCount = 0")

    print("\n=== 12. Alice deletes photo post ===")
    s, b = req("DELETE", f"/posts/{photo_id}", token=alice["access"])
    must(s, 204, "delete photo post", b)

    print("\n=== 13. Bob's feed has only the text post left ===")
    s, feed3 = req("GET", "/feed/home", token=bob["access"])
    must(s, 200, "feed/home final", feed3)
    photo_still = next((p for p in feed3["items"] if p["id"] == photo_id), None)
    if photo_still:
        print(f"❌ deleted post still in feed: {photo_still}")
        sys.exit(1)
    text_still = next((p for p in feed3["items"] if p["id"] == text_id), None)
    if not text_still:
        print(f"❌ text post missing")
        sys.exit(1)
    print(f"✓ photo gone, text remains")

    print("\n=== 14. Forbidden: bob can't delete alice's post ===")
    s, b = req("DELETE", f"/posts/{text_id}", token=bob["access"])
    if s != 403:
        print(f"❌ expected 403, got {s}: {b}")
        sys.exit(1)
    print(f"✓ 403 forbidden")

    print("\n🎉 All Phase D smoke checks passed.")


if __name__ == "__main__":
    main()
