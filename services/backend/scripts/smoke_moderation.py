#!/usr/bin/env python3
"""
End-to-end smoke test для Phase E: модерация (reports + admin + audit_log).

Покрывает:
  1. Регистрация alice + bob.
  2. Alice публикует пост.
  3. Bob → POST /reports {targetKind=post, targetId=<post>, reason=spam} → 201.
  4. Bob → GET /reports/me → видит свой report со status='open'.
  5. Bob → GET /admin/reports → 403 (он не admin).
  6. Bob → POST /admin/reports/{id}/resolve → 403.
  7. Промоут bob → admin (через psql на сервере).
  8. Bob → GET /admin/reports → видит report Alice.
  9. Bob → POST /admin/reports/{id}/resolve {action=delete} → 204.
  10. Bob → GET /reports/me → status='resolved'.
  11. Audit log: SELECT * FROM audit_log WHERE actor_id=bob (через psql).

Запуск: python3 scripts/smoke_moderation.py
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


def req(method, path, *, token=None, body=None, full_url=None):
    url = full_url or (BASE + path)
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


def psql(sql):
    # Wrap entire docker exec command in single string for ssh — иначе квотинг
    # рвётся на пути к серверу.
    cmd = f'docker exec -i re_postgres psql -U re -d running_ecosystem -tA -c "{sql}"'
    return subprocess.run(
        ["ssh", SSH_HOST, cmd],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def main():
    print(f"BASE = {BASE}")

    print("\n=== 1. Register users ===")
    alice = register("alice-e")
    bob = register("bob-e")
    print(f"alice = {alice['user_id']}")
    print(f"bob   = {bob['user_id']}")

    print("\n=== 2. Alice publishes a post ===")
    s, post = req("POST", "/posts", token=alice["access"],
                  body={"kind": "text", "body": "пост который пожалуются"})
    must(s, 201, "publish post", post)
    post_id = post["id"]
    print(f"   post_id = {post_id}")

    print("\n=== 3. Bob reports the post ===")
    s, report = req("POST", "/reports", token=bob["access"], body={
        "targetKind": "post",
        "targetId": post_id,
        "reason": "spam",
        "body": "явный спам",
    })
    must(s, 201, "create report", report)
    report_id = report["id"]
    if report["status"] != "open":
        print(f"❌ status expected open, got {report['status']}")
        sys.exit(1)
    print(f"   report_id = {report_id}")
    print(f"✓ status=open")

    print("\n=== 4. Bob's report list ===")
    s, mine = req("GET", "/reports/me", token=bob["access"])
    must(s, 200, "my reports", mine)
    if not any(r["id"] == report_id for r in mine):
        print(f"❌ report missing from my list")
        sys.exit(1)
    print(f"✓ report in my list")

    print("\n=== 5. Bob (non-admin) cannot list admin queue ===")
    s, b = req("GET", "/admin/reports", token=bob["access"])
    if s != 403:
        print(f"❌ expected 403, got {s}: {b}")
        sys.exit(1)
    print(f"✓ 403")

    print("\n=== 6. Bob (non-admin) cannot resolve ===")
    s, b = req("POST", f"/admin/reports/{report_id}/resolve", token=bob["access"],
               body={"action": "delete"})
    if s != 403:
        print(f"❌ expected 403, got {s}: {b}")
        sys.exit(1)
    print(f"✓ 403")

    print("\n=== 7. Promote bob to admin via psql ===")
    # Trigger lazy profile creation first.
    s, _ = req("GET", f"/profiles/{bob['user_id']}", token=bob["access"])
    must(s, 200, "ensure bob profile exists", None)
    psql(f"UPDATE profiles SET global_role='admin' WHERE user_id='{bob['user_id']}'")
    role = psql(f"SELECT global_role FROM profiles WHERE user_id='{bob['user_id']}'")
    if role != "admin":
        print(f"❌ promote failed; role={role}")
        sys.exit(1)
    print(f"✓ bob promoted to admin")

    print("\n=== 8. Admin lists reports ===")
    s, queue = req("GET", "/admin/reports?status=open", token=bob["access"])
    must(s, 200, "admin queue", queue)
    if not any(r["id"] == report_id for r in queue):
        print(f"❌ report missing from admin queue: {queue}")
        sys.exit(1)
    print(f"✓ report in admin queue ({len(queue)} total)")

    print("\n=== 9. Admin resolves with action=delete ===")
    s, b = req("POST", f"/admin/reports/{report_id}/resolve", token=bob["access"],
               body={"action": "delete"})
    must(s, 204, "resolve report", b)

    print("\n=== 10. Bob's report shows resolved ===")
    s, mine2 = req("GET", "/reports/me", token=bob["access"])
    must(s, 200, "my reports after resolve", mine2)
    resolved = next((r for r in mine2 if r["id"] == report_id), None)
    if resolved is None:
        print(f"❌ report missing")
        sys.exit(1)
    if resolved["status"] != "resolved":
        print(f"❌ status expected resolved, got {resolved['status']}")
        sys.exit(1)
    if resolved.get("resolutionAction") != "delete":
        print(f"❌ resolutionAction expected delete, got {resolved.get('resolutionAction')}")
        sys.exit(1)
    print(f"✓ status=resolved, action=delete")

    print("\n=== 11. Audit log: bob has 2 entries (report_opened + report_resolved) ===")
    audit_count = psql(
        f"SELECT count(*) FROM audit_log WHERE actor_id='{bob['user_id']}'"
    )
    if int(audit_count) < 2:
        print(f"❌ expected ≥2 audit entries, got {audit_count}")
        sys.exit(1)
    print(f"✓ {audit_count} audit entries")

    audit_actions = psql(
        f"SELECT string_agg(action, ',' ORDER BY created_at) "
        f"FROM audit_log WHERE actor_id='{bob['user_id']}'"
    )
    print(f"   actions: {audit_actions}")
    if "report_opened" not in audit_actions or "report_resolved" not in audit_actions:
        print(f"❌ missing expected actions")
        sys.exit(1)

    print("\n🎉 All Phase E smoke checks passed.")


if __name__ == "__main__":
    main()
