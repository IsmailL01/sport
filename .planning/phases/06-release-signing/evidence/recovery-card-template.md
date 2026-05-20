# SPORT-RECOVERY-{A|B} card

(printed + laminated; goes in encrypted-DMG on USB stick. NEVER stores password — only mnemonic hint.)

## Что это

USB recovery для Running Ecosystem mobile signing. Содержит:
- `age-keys.txt` — приватный age-ключ для SOPS decrypt
- `mobile-signing.yaml` — SOPS-encrypted (Android keystore + iOS bundle)
- этот файл

## Другая копия (USB-{B|A})

Лежит в: <FILL_IN_DURING_PLAN_06_01_TASK_6>

## Password mnemonic hint

<FILL_IN_USER_CHOSEN_HINT — НЕ ПАРОЛЬ САМ, только hint to jog memory.
Реальный 32-byte random — в 1Password sealed entry "Sport mobile signing — USB DMG password">

## Recovery cheat-sheet (5 шагов, ~5 минут)

```bash
# 1. Insert this USB, mount encrypted DMG:
hdiutil attach /Volumes/SPORT-RECOVERY-{A|B}/sport-recovery-{a|b}.dmg
# (prompts for password — get from 1Password sealed entry)

# 2. Restore age key:
cp /Volumes/SPORT_RECOVERY_{A|B}/age-keys.txt ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt

# 3. Verify decrypt works:
sops -d /Volumes/SPORT_RECOVERY_{A|B}/mobile-signing.yaml | yq -r '.android.key_alias'
# expected output: runningecosystem-release

# 4. Restore mobile-signing.yaml if needed (rare — usually git has it):
cp /Volumes/SPORT_RECOVERY_{A|B}/mobile-signing.yaml .secrets/prod/mobile-signing.yaml

# 5. Eject:
hdiutil detach /Volumes/SPORT_RECOVERY_{A|B}
```

Подробности: `docs/SECRETS.md` §"Mobile signing — recovery" §Сценарий (a).
Контекст: `.planning/phases/06-release-signing/06-CONTEXT.md` D-07 + D-15.
