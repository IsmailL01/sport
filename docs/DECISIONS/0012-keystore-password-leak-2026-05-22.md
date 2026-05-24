# ADR-0012: Android keystore password leak — incident & rotation (2026-05-21..22)

**Status:** Accepted
**Date:** 2026-05-22
**Decider:** Solo dev (Ismail)
**Phase:** 7 / Plan 07-01 Task 5 — tag-triggered Android release pipeline (`.github/workflows/android-release.yml`)
**Related:**
- ADR-0006 (Mapbox token incident — sibling treat-as-compromise precedent on a different secret family)
- ADR-0011 + Amendment 4 (lean key custody — SOPS-only, no external backup; informs why the rotation does NOT also update OneDrive / RECOVERY-CARD)

**Amendments:**
- 2026-05-22 — Self-inflicted chat-dump leak + re-rotation (see §"Amendment 2026-05-22 — Re-rotation after self-inflicted chat leak" below)

## Контекст

CI run `26245775886` (workflow `android-release.yml`, push to tag `v1.0.0-beta.0` at 2026-05-21T18:38:03Z) failed at the "Trigger EAS build" step with `npm error could not determine executable to run`. Inspection of the run's log revealed plaintext exposure of the Android keystore password value in three step env blocks:

- `Install dependencies` step env block
- `Setup EAS` (expo/expo-github-action@v8) step env block
- `Trigger EAS build` step env block

The value was the keystore_password (= key_password by PKCS12 invariant) decrypted from `.secrets/prod/mobile-signing.yaml` and written to `$GITHUB_ENV` by the preceding "Decrypt mobile signing bundle" step.

### Root cause — single-line summary

```bash
# Workflow line (lines 73-77 of android-release.yml at the time of leak):
{
  echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$(yq -r '.android.keystore_password' /tmp/mobile-signing.yaml)"
  echo "RUNNING_ECO_RELEASE_KEY_PASSWORD=$(yq -r '.android.key_password' /tmp/mobile-signing.yaml)"
} >> "$GITHUB_ENV"
```

`echo "VAR=$value" >> $GITHUB_ENV` writes the resolved value into `$GITHUB_ENV` for subsequent steps. GitHub Actions logs the resolved env block of each step at step-start. **`$GITHUB_ENV` writes do NOT engage the log masker.** Only `${{ secrets.X }}` references (which the runner sees as opaque template variables and registers with the masker at resolution time) are auto-masked. Once a secret is decrypted at runtime and propagated via `echo … >> $GITHUB_ENV`, it is, from the runner's perspective, just data — masking must be requested explicitly via the `::add-mask::` workflow command.

### Repo posture mitigating blast radius

- **Repo visibility:** private (`IsmailL01/sport`). The leak was not exposed to the public internet.
- **Log access:** restricted to the solo dev's GitHub account + (transitively) GitHub itself.
- **One leaked run:** `26245775886` only. STEP 2 audit (below) confirmed zero matches in all other CI runs since 2026-05-21T00:00:00Z.

### Treat-as-compromise rationale (carry-over from ADR-0006)

GitHub log access is auditable but not under our control end-to-end:

- The leaked value was visible inside GitHub's infrastructure between 2026-05-21T18:38:03Z and the moment of log deletion ~6 hours later. We cannot enumerate who, if anyone, accessed the log in that window via the GitHub-side audit log (admin-only feature, not enabled on a free private repo).
- Once a credential value is observable in any log-shipping pipe outside our process, the operationally responsible posture is **treat-as-compromise**, identical to the chain-of-custody reasoning in ADR-0006 (chat-with-AI leak).
- Cost of rotation: ~5 minutes (PKCS12 keystore stays intact; only the password layer rotates). Cost of "no-op + monitoring": no Mapbox-style usage dashboard exists for keystore passwords. Rotation is overwhelmingly the right call.

## Решение

Execute a 5-step incident response in order, with explicit pause-points between each step:

1. **STEP 1 — Delete leaked CI run.** `gh run delete 26245775886 --repo IsmailL01/sport`. Verified HTTP 404 post-deletion. _Caveat: this is irreversible; see "false-positive sub-incident" below for why this choice carries a small evidence-destruction risk._
2. **STEP 2 — Audit other runs.** Decrypt password into a shell var only (never echoed). Grep CI run logs since 2026-05-21T00:00:00Z by exact string match. Result: 0 matches across `backend-cd` × 2 runs + `backend-ci` × 1 run.
3. **STEP 3 — Rotate keystore password atomically.** Extract PKCS12 keystore from SOPS → `keytool -storepasswd` (PKCS12 invariant: this rotates both store and key passwords atomically; `-keypasswd` is not supported on PKCS12) → re-base64 → update SOPS bundle via `sops set --value-stdin` × 3 fields (`keystore_base64`, `keystore_password`, `key_password`) → round-trip verify decrypt + keystore-sha + cert-SHA preservation.
4. **STEP 4 — Patch `.github/workflows/android-release.yml`.** Two changes (single commit):
   - Read passwords into shell vars first; emit `echo "::add-mask::$VAR"` BEFORE any `>> $GITHUB_ENV` write.
   - Replace `expo/expo-github-action@v8` + `npx eas build` with explicit `npm install -g eas-cli` + bare `eas build`. EXPO_TOKEN passed via step env. Removes the transient-PATH dependency that caused the original failure.
5. **STEP 5 — Document via this ADR.** Captures timeline, root cause, blast radius, mitigation, detection improvement.

## False-positive sub-incident (lesson learned)

During earlier analysis (prior to the final diagnosis), the leak was first dismissed as a false positive based on a hash-comparison check:

```bash
# The flawed check
sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_password' | shasum -a 256
```

When run in a shell **without `SOPS_AGE_KEY_FILE` exported**, SOPS silently fails to decrypt (no age identity found in env), `yq -r '.android.keystore_password'` then operates on empty/partial input and returns the literal string `null`, and `shasum -a 256` on the four-character string `null` produces sha256 prefix `74234e98` — a value that did NOT match the value visible in the leaked log. The false-positive was accepted on that basis.

The check was later re-run in a properly-configured shell (`SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt`), revealing the real fingerprint `e54d3cfbb4ab`, which matched the value in the leaked log. The incident was re-opened.

**Lesson:** secret-decrypt verification must validate the decrypt itself, not just the downstream hash. Specifically:

- Verify decrypted value length > 0 / matches expected schema before hashing.
- Check `sops -d` exit code (with `2>/dev/null` removed) — the failure-to-find-age-identity error is informative.
- Make `SOPS_AGE_KEY_FILE` a required env var in any verification script (the existing `smoke-sops-roundtrip.sh` already does this — `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`).

**Carrying risk:** STEP 1 deleted the only known instance of the leak before STEP 3 confirmed the leak was real. If the leak had been a true false-positive, STEP 1 would have destroyed innocent evidence and any forensic trail. The lesson: STEP 2 audit + ground-truth fingerprint verification should happen BEFORE destructive STEP 1 in the future playbook (see `docs/SECRETS.md` §"Incident response — credential leak" amendment, below).

## Альтернативы

1. **No-op + monitoring.**
   **Rejected.** No usage dashboard exists for keystore passwords (unlike Mapbox tokens). The only observable consequence of compromise is malicious APK signing under our identity — a lagging indicator that would only surface after a malicious APK was distributed to a tester or published. No prevention path.

2. **Patch workflow only, skip rotation.**
   **Rejected.** Closes the future-leak vector but leaves the already-leaked value valid indefinitely. Treat-as-compromise (ADR-0006 precedent) is the correct posture.

3. **Rotate the entire keystore (new private key + new certificate).**
   **Rejected for v1.0.** Would break upgrade signature continuity for existing closed-beta installs — every tester would need to uninstall + reinstall. The compromise is on the password layer, not the key material. PKCS12 stores the key under a password-derived KEK; rotating the KEK (via `keytool -storepasswd`) does not regenerate the underlying key. Verified post-rotation: certificate SHA-256 preserved (`C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB` matches original recorded value in `evidence/keystore-sha256.txt`). Reserve full key rotation for a scenario where the keystore file itself leaks (not just the password).

4. **Adopted: full incident response per §"Решение".**

## Обоснование

The chain-of-custody reasoning is identical to ADR-0006:

- Once a secret value is observable in any log pipe outside our local process, **revoke + rotate is the only response that doesn't require a trust assumption we cannot verify.**
- For keystore passwords, "rotate" means `keytool -storepasswd` (cheap, ~5 min, preserves key identity).
- The workflow-level fix (`::add-mask::`) is necessary but not sufficient — it closes the future-leak vector but does not retroactively un-leak the already-exposed value.

## Последствия

### Положительные

- **Leak vector closed.** `echo "::add-mask::$STORE_PASS"` registers the password with the runner's log masker BEFORE any subsequent step's env block can expose it. Pattern is reusable for any future workflow that propagates a decrypted secret via `$GITHUB_ENV`.
- **Workflow stability improved.** Removing `expo/expo-github-action@v8` + `npx eas` in favor of explicit `npm install -g eas-cli` + bare `eas` removes a transient-PATH failure mode. The action-vs-explicit-install trade-off favors explicit-install for any pipeline where reproducibility outweighs convenience.
- **Cert identity preserved.** Existing-install upgrade path uncompromised — when Phase 9 ships an updated APK to the same testers, signature continuity holds.
- **Documented for future.** This ADR + the workflow comment-block link (line 28: `See docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md for incident context`) anchors the lesson at the code site where the next dev (or future-me) would touch the dangerous pattern.

### Отрицательные / риски

- **Evidence destruction risk (closed).** STEP 1 deleted the only known leaked log before STEP 3 confirmed reality. Mitigated forward by `docs/SECRETS.md` amendment (below) reordering the playbook: audit + ground-truth verification BEFORE destructive deletion.
- **OneDrive backup gap unchanged.** Per ADR-0011 Amendment 4, no external backup exists. If `.secrets/prod/mobile-signing.yaml` is lost and the age key file is also lost (`~/.config/sops/age/keys.txt`), the new keystore — like the old one — is unrecoverable. This is an accepted v1.0 risk per Amendment 4; rotation does not change the calculus.
- **Pre-rotation backup is on local /tmp.** `/tmp/mobile-signing.pre-rotation.1779397205.yaml` is the rollback artifact. macOS does not purge `/tmp` until reboot. Delete manually (`rm -P /tmp/mobile-signing.pre-rotation.*.yaml`) after a few days of confidence in the rotation.
- **No automated detection.** A future workflow change could re-introduce the same anti-pattern. Future hardening: pre-commit grep for `echo "[A-Z_]*=\$[A-Za-z_]" >> "?\$GITHUB_ENV` patterns combined with no preceding `::add-mask::` line. Out of scope for closed-beta; tracked in `v1.0.1 Backlog` as `CI-MASK-LINT`.

## Митигации

### Phase A — executed in this incident (2026-05-22)

| Mitigation | Status | Evidence |
|---|---|---|
| Delete leaked CI run | ✅ Done | `gh run delete 26245775886` → HTTP 404 on view |
| Audit other CI runs since 2026-05-21 | ✅ Done | 0 matches across 3 runs (`backend-cd` × 2 + `backend-ci` × 1) |
| Rotate keystore password | ✅ Done | `keytool -storepasswd` + SOPS update + smoke-sops-roundtrip.sh green; commit `f35b4c6` |
| Patch workflow with `::add-mask::` | ✅ Done | `.github/workflows/android-release.yml` lines 87-91; commit `fbc5186` (feat) + `b461ea6` (main cherry-pick) |
| Replace `npx eas` with explicit install | ✅ Done | Same commit; closes the failure that surfaced the leak |
| Document via ADR | ✅ Done | This file |

### Phase B — `docs/SECRETS.md` playbook amendment (deferred)

Append a §"Incident response — credential leak in CI logs" section to `docs/SECRETS.md` codifying the corrected step order:

1. **Verify the leak is real** with a properly-decrypted ground-truth check (`SOPS_AGE_KEY_FILE` set explicitly; verify decrypted value length > 0 before hashing).
2. **Audit blast radius** before any destructive action (list all runs since incident-start time; grep each for the exact value).
3. **Then delete** the leaking runs.
4. **Rotate** the credential.
5. **Patch** the leak vector (workflow / code / config).
6. **Document** via ADR.

Tracked in `v1.0.1 Backlog` as `SECRETS-LEAK-PLAYBOOK-AMEND` (alongside `CI-MASK-LINT` from "Negative consequences" above).

### Phase C — `v1.0.1 Backlog` items (post-beta)

- **`CI-MASK-LINT`** — pre-commit / `actionlint` rule that flags `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::` line. Generalize to any `$GITHUB_OUTPUT` / `$GITHUB_STEP_SUMMARY` write of a non-`${{ secrets.X }}` value too.
- **`SECRETS-LEAK-PLAYBOOK-AMEND`** — finalize the corrected playbook in `docs/SECRETS.md`.
- **`SOPS-VERIFY-HARDENING`** — every verification script in `evidence/` and `scripts/` must (a) require `SOPS_AGE_KEY_FILE` explicitly, (b) check `sops -d` exit code, (c) validate decrypted value shape (length, schema) before downstream processing.

## Сценарии пересмотра

| Trigger | Action |
|---|---|
| Another CI workflow propagates a decrypted SOPS secret via `$GITHUB_ENV` | Pre-merge check: confirm `::add-mask::$VAR` precedes the write. If not, block PR. (Currently manual; `CI-MASK-LINT` automates.) |
| Keystore file itself leaks (vs. just the password) | Full key rotation: generate new keystore + cert, accept break of upgrade signature continuity for existing installs, distribute fresh APK with explicit "uninstall + reinstall" instruction to testers. ADR-0012.1 amendment for the new keystore identity. |
| GitHub branch protection prevents future direct push to `main` for incident response | Acceptable. Admin-bypass push was used here for cherry-pick velocity (`Bypassed rule violations` recorded in push output). For future incidents, the PR + admin-merge path is the documented fallback per the rollback drill flow. |
| Public launch (v1.5+) | Treat private-repo blast-radius mitigation as no longer load-bearing. Add: GitHub repo audit log enablement, automated log-grep monitoring for known secret patterns, separation of CI age key into a per-workflow least-privilege identity. |
| `keytool -storepasswd` not sufficient (e.g., keystore migrates to JKS or HSM) | Re-validate the PKCS12 invariant (key_pass = store_pass) does not apply; may need explicit `-keypasswd` step in rotation runbook. |

## Ссылки

- `.github/workflows/android-release.yml` — patched workflow (post-incident state). See lines 87-91 for `::add-mask::` block; lines 100-101 for explicit eas-cli install.
- `.secrets/prod/mobile-signing.yaml` — rotated SOPS bundle (post-incident state; pre-rotation commit `e8035d042e4b339fcfeaa690bdafad412bace1a1` available via `git log` of this file for forensic context if needed).
- Commit `f35b4c6` (feat/cursona-redesign) — STEP 3 SOPS rotation.
- Commit `fbc5186` (feat/cursona-redesign) + `b461ea6` (main cherry-pick) — STEP 4 workflow patch.
- `/tmp/mobile-signing.pre-rotation.1779397205.yaml` — rollback artifact (local; delete after confidence period).
- `.planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh` — orthogonal verification script, green post-rotation.
- ADR-0006 — sibling treat-as-compromise precedent (Mapbox tokens) — same chain-of-custody reasoning, different secret family.
- ADR-0011 Amendment 4 — explains why rotation does NOT update OneDrive / RECOVERY-CARD (no external backup by design).
- `docs/SECRETS.md` (to be amended Phase B above) — leak-response playbook.

## Amendment 2026-05-22 — Re-rotation after self-inflicted chat leak

**Status:** Closed.
**Trigger:** During post-rotation verification of the original incident response (above), the executing AI agent (Claude / Anthropic) leaked the freshly-rotated keystore password into the agent chat transcript via an `xxd | tail -3` byte-dump diagnostic. The diagnostic was issued while investigating an apparent fingerprint discrepancy between two shell-pipeline forms.

### Root cause of the diagnostic detour

Two shell pipelines computing the "same" fingerprint disagreed:

```bash
# Form A: live pipeline
sops -d ... | yq -r '.android.keystore_password' | shasum -a 256 | cut -c1-12
# → produces sha256(value + "\n")

# Form B: capture then process
P=$(sops -d ... | yq -r '.android.keystore_password')
printf '%s' "$P" | shasum -a 256 | cut -c1-12
# → produces sha256(value), no trailing newline
```

`yq -r` always appends a trailing newline to its output. In Form A, `shasum` reads value-plus-newline from the pipe. In Form B, `$()` command substitution strips trailing newlines, and `printf '%s'` adds none — so `shasum` reads value-only. Both fingerprints are "valid" hashes of related strings, but they differ. Treating this as evidence of corruption was incorrect.

### Root cause of the leak

The investigation used `xxd | tail -3` on the value variables to confirm they were byte-identical. `xxd` output renders the value bytes as both hex and ASCII, exposing the plaintext. The output entered the agent's tool-result stream, which is logged into the conversation transcript on the AI vendor's infrastructure (Anthropic).

### Blast radius

- Anthropic conversation logs (out of solo-dev control; treat-as-compromise per ADR-0006 chain-of-custody reasoning).
- The agent's own in-context memory (in-session only).
- Not in any git commit, not in any CI log, not in any external system controlled by the dev.

### Re-rotation

Same process as STEP 3 of the original incident — `keytool -storepasswd` (PKCS12 invariant) + SOPS bundle update + round-trip verify + cert-SHA preservation check. Commit `21b992c` (feat/cursona-redesign).

Old fp (compromised via chat-dump) → DESTROYED.
New fp held in shell var only during rotation; never printed; SOPS bundle is the only durable home.

### Lessons added to ADR mitigations

**Phase A — discipline rules** (effective immediately for all future credential handling in this codebase):

1. **Single canonical fingerprint form.** Use `printf '%s' "$VAR" | shasum -a 256 | cut -c1-12` exclusively. Do not mix forms. Trailing-newline discrepancies are NOT a security signal.
2. **No byte-level inspection of values.** Never `xxd`, never `od -c`, never `hexdump`, never `wc -c` paired with sample-char display, never `${VAR:0:N}` / `${VAR: -N}` extraction. The bytes ARE the secret.
3. **Length is acceptable; bytes are not.** `echo "len=${#PASS}"` is fine. `echo "first=${PASS:0:1}"` is not.
4. **Fingerprint discrepancies are a shape problem, not a value problem.** If two checks disagree, suspect the pipeline shape (newlines, encoding, exit codes), not the underlying secret. Reproduce on a known-good test value (e.g., literal `"test123"`) to isolate the shape difference before touching the real secret.

**Phase C — added v1.0.1 backlog item**:
- **`CRED-DIAG-DISCIPLINE`** — codify the four rules above in `docs/SECRETS.md` as a "Credential diagnostics" section. Add a pre-commit grep rule for `xxd .*\$[A-Z_]+` patterns in shell scripts under `evidence/` and `scripts/` (lightweight, false-positive-tolerant — humans can override).

### Sub-incident "evidence destruction" risk repeated, this time cleanly

For this re-rotation, NO logs were destroyed. Anthropic conversation logs are not under solo-dev control to delete — accepting that exposure window (mitigation: rotation invalidates the credential) is the only path forward, identical to ADR-0006's reasoning about the Mapbox chat leak being beyond user-side revoke.

### Updated references

- Commit `21b992c` — re-rotation SOPS update.
- `/tmp/mobile-signing.pre-rerotation.1779404090.yaml` — rollback artifact for THIS rotation (separate from the original `pre-rotation.1779397205.yaml`).
- This amendment supersedes the "STEP 3 rotation" mention earlier — the new operative fingerprint replaces the previously-cited one for any forward verification.

---

_Phase: 07 Release builds + mobile stability (Plan 07-01 Task 5 → tag-triggered Android pipeline) — incident occurred during Stage A' CI smoke validation. Plan 07-01 Task 6 (R8 device smoke) remains pending re-fire of CI under the patched workflow + re-rotated credentials, per the post-incident pause discipline._
_Подписано: 2026-05-22. Поправки append-only — отдельный ADR (например 0012.1 или новый N) если sub-decision требует material revision._
