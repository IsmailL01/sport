#!/usr/bin/env python3
"""
Smoke test: shared pkg/permissions integration.

Покрывает:
  1. Regular user НЕ может удалить чужой post (403)
  2. Admin (promoted via psql) МОЖЕТ удалить чужой post — это и есть фикс бага
  3. Admin может удалить чужой comment
  4. Admin может удалить чужой story
  5. Banned user НЕ может создать post (банится в SQL, проверка ban-gate)
  6. Banned user НЕ может комментить
  7. После expired ban — снова может (skip — slow в smoke)

Запуск: python3 scripts/smoke_permissions.py
"""

import json
import os
import subprocess
import sys
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


def ensure_profile(actor):
    # Trigger lazy profile creation.
    s, _ = req("GET", f"/profiles/{actor['user_id']}", token=actor["access"])
    must(s, 200, "ensure profile", None)


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. Regular user: cannot delete others post ===")
    alice = register("alice-perm")
    bob = register("bob-perm")

    s, post = req("POST", "/posts", token=alice["access"],
                  body={"kind": "text", "body": "alice's post"})
    must(s, 201, "alice publishes", post)
    post_id = post["id"]

    s, _ = req("DELETE", f"/posts/{post_id}", token=bob["access"])
    if s != 403:
        print(f"❌ bob (regular user) should get 403, got {s}")
        sys.exit(1)
    print(f"✓ regular user → 403")

    print("\n=== 2. Admin can delete others post (bug fix) ===")
    admin = register("admin-perm")
    ensure_profile(admin)
    psql(f"UPDATE profiles SET global_role='admin' WHERE user_id='{admin['user_id']}'")

    s, _ = req("DELETE", f"/posts/{post_id}", token=admin["access"])
    must(s, 204, "admin delete others post", None)

    print("\n=== 3. Admin can delete others comment ===")
    s, post2 = req("POST", "/posts", token=alice["access"],
                   body={"kind": "text", "body": "alice's post 2"})
    must(s, 201, "alice publishes 2", None)
    post2_id = post2["id"]

    # Bob comments on alice's post.
    s, comment = req("POST", f"/posts/{post2_id}/comments",
                     token=bob["access"], body={"body": "bob's comment"})
    must(s, 201, "bob comment", None)
    comment_id = comment["id"]

    # Admin (NOT alice, NOT bob) deletes the comment — this was impossible before.
    s, _ = req("DELETE", f"/posts/{post2_id}/comments/{comment_id}",
               token=admin["access"])
    must(s, 204, "admin delete others comment", None)

    print("\n=== 4. Admin can delete others story ===")
    # Alice creates a story.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
        "ae426082"
    )
    s, b = req("POST", "/uploads", token=alice["access"],
               body={"kind": "image", "mime": "image/png", "sizeBytes": len(png)})
    must(s, 200, "init upload", b)
    media_id = b["mediaId"]
    s, _ = req("PUT", "", full_url=b["uploadUrl"], raw_body=png,
               headers={"Content-Type": "image/png"})
    must(s, 200, "PUT s3", None)
    s, _ = req("POST", f"/uploads/{media_id}/complete", token=alice["access"], body={})
    must(s, 200, "complete upload", None)

    s, story = req("POST", "/stories", token=alice["access"],
                   body={"mediaId": media_id, "overlayText": "delete me admin"})
    must(s, 201, "alice publish story", None)
    story_id = story["id"]

    s, _ = req("DELETE", f"/stories/{story_id}", token=admin["access"])
    must(s, 204, "admin delete others story", None)

    print("\n=== 5. Banned user cannot create post ===")
    villain = register("villain")
    ensure_profile(villain)
    # Бан до 1 часа в будущем.
    psql(f"UPDATE profiles SET banned_until=now() + interval '1 hour' WHERE user_id='{villain['user_id']}'")

    s, b = req("POST", "/posts", token=villain["access"],
               body={"kind": "text", "body": "should fail"})
    if s != 403:
        print(f"❌ banned user should get 403, got {s}: {b}")
        sys.exit(1)
    print(f"✓ banned user post → 403")

    print("\n=== 6. Banned user cannot comment ===")
    s, p3 = req("POST", "/posts", token=alice["access"],
                body={"kind": "text", "body": "alice's post for ban test"})
    must(s, 201, "alice post", None)
    p3_id = p3["id"]

    s, b = req("POST", f"/posts/{p3_id}/comments", token=villain["access"],
               body={"body": "banned comment"})
    if s != 403:
        print(f"❌ banned user should get 403 on comment, got {s}: {b}")
        sys.exit(1)
    print(f"✓ banned user comment → 403")

    print("\n=== 7. Banned user can still READ feed (read-only OK) ===")
    s, _ = req("GET", "/feed/home", token=villain["access"])
    must(s, 200, "banned user can read feed", None)

    print("\n🎉 Permissions integration smoke passed.")


if __name__ == "__main__":
    main()
