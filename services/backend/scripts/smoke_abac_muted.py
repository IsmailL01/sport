#!/usr/bin/env python3
"""
Smoke: ABAC (premium-only video) + muted_until + admin/audit endpoint.

Покрывает:
  1. Non-premium user НЕ может создать post.kind=video — но это NOT-implemented
     в feed handler (kind validates только text/photo/session) — пропустим.
     Verify ABAC через permissions test (jest 37/37). Здесь — реальный fix.
  2. Muted user НЕ может отправить message в conv где muted_until > now.
  3. /admin/audit как admin → 200 + список с capability в metadata.
  4. /admin/audit как regular user → 403.

Запуск: python3 scripts/smoke_abac_muted.py
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


def must(s, expect, name):
    if s != expect:
        print(f"❌ {name}: expected {expect}, got {s}")
        sys.exit(1)
    print(f"✓ {name} → {s}")


def register(handle):
    email = f"{handle}-{uuid.uuid4().hex[:8]}@smoke.local"
    s, b = req("POST", "/auth/register", body={"email": email, "password": "smoke-pass-1234"})
    must(s, 201, f"register {handle}")
    return {"user_id": b["user"]["id"], "access": b["accessToken"]}


def psql(sql):
    cmd = f'docker exec -i re_postgres psql -U re -d running_ecosystem -tA -c "{sql}"'
    return subprocess.run(
        ["ssh", SSH_HOST, cmd],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. muted_until enforcement ===")
    alice = register("alice-mute")
    bob = register("bob-mute")

    # Create DM (alice -> bob).
    s, conv = req("POST", "/conversations", token=alice["access"],
                  body={"type": "dm", "peerId": bob["user_id"]})
    must(s, 200, "create dm conv")
    conv_id = conv["id"] if "id" in conv else conv.get("conversation", {}).get("id")
    if not conv_id:
        print(f"❌ no conv id in {conv}")
        sys.exit(1)
    print(f"   conv_id = {conv_id}")

    # Send message — should work (200 или 201 в зависимости от idempotency).
    s, _ = req("POST", f"/conversations/{conv_id}/messages",
               token=alice["access"],
               body={"clientMsgId": str(uuid.uuid4()), "kind": "text", "body": "before mute"})
    if s not in (200, 201):
        print(f"❌ send msg before mute: got {s}")
        sys.exit(1)
    print(f"✓ send msg before mute → {s}")

    # Mute alice in this conv until 1h from now.
    psql(f"""UPDATE conversation_members
             SET muted_until = now() + interval '1 hour'
             WHERE conversation_id='{conv_id}' AND user_id='{alice['user_id']}'""")

    # Try to send again.
    s, _ = req("POST", f"/conversations/{conv_id}/messages",
               token=alice["access"],
               body={"clientMsgId": str(uuid.uuid4()), "kind": "text", "body": "muted send"})
    if s != 403:
        print(f"❌ muted send expected 403, got {s}")
        sys.exit(1)
    print(f"✓ muted send → 403")

    # Bob still can send (not muted).
    s, _ = req("POST", f"/conversations/{conv_id}/messages",
               token=bob["access"],
               body={"clientMsgId": str(uuid.uuid4()), "kind": "text", "body": "bob can send"})
    if s not in (200, 201):
        print(f"❌ bob send: got {s}")
        sys.exit(1)
    print(f"✓ non-muted user can still send → {s}")

    print("\n=== 2. /admin/audit as admin ===")
    admin = register("admin-audit")
    s, _ = req("GET", f"/profiles/{admin['user_id']}", token=admin["access"])
    must(s, 200, "ensure profile")
    psql(f"UPDATE profiles SET global_role='admin' WHERE user_id='{admin['user_id']}'")

    # Trigger an auditable action: admin deletes alice's post.
    s, post = req("POST", "/posts", token=alice["access"],
                  body={"kind": "text", "body": "for audit"})
    must(s, 201, "alice post")
    s, _ = req("DELETE", f"/posts/{post['id']}", token=admin["access"])
    must(s, 204, "admin delete post (audited)")

    s, audit = req("GET", "/admin/audit", token=admin["access"])
    must(s, 200, "admin audit list")
    if not isinstance(audit, list):
        print(f"❌ audit not list: {audit}")
        sys.exit(1)
    found = next((e for e in audit if e["targetId"] == post["id"] and e["action"] == "delete_post"), None)
    if not found:
        print(f"❌ audit entry not found")
        print(f"   first entries: {audit[:3]}")
        sys.exit(1)
    cap = (found.get("metadata") or {}).get("capability")
    if cap != "post.delete_others":
        print(f"❌ expected capability=post.delete_others, got {cap}")
        sys.exit(1)
    print(f"✓ delete_post entry has capability='post.delete_others'")

    print("\n=== 3. /admin/audit as regular user → 403 ===")
    s, _ = req("GET", "/admin/audit", token=alice["access"])
    if s != 403:
        print(f"❌ expected 403 for non-admin, got {s}")
        sys.exit(1)
    print(f"✓ non-admin → 403")

    print("\n=== 4. Web admin dashboard HTML serves ===")
    s, _ = req("GET", "/admin/")
    must(s, 200, "/admin/ HTML")

    print("\n🎉 ABAC + muted + audit smoke passed.")


if __name__ == "__main__":
    main()
