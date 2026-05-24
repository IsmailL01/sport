#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-03 Task 1 — notification icon + app.json smoke
test -f apps/mobile-rn/assets/notification-icon.png || { echo "FAIL: notification-icon.png missing"; exit 1; }
python3 -c "
import json
d = json.load(open('apps/mobile-rn/app.json'))
assert d['expo']['notification']['icon'] == './assets/notification-icon.png', 'app.json notification.icon wrong'
assert d['expo']['notification']['color'] == '#0F1419', 'app.json notification.color wrong'
# expo-location plugin notificationTitle/Body:
plugins = d['expo']['plugins']
loc = next((p for p in plugins if isinstance(p, list) and p[0] == 'expo-location'), None)
assert loc is not None, 'expo-location plugin missing'
assert loc[1].get('notificationTitle') == 'Running Ecosystem', 'expo-location notificationTitle missing'
assert loc[1].get('notificationBody') == 'Запись пробежки активна', 'expo-location notificationBody missing'
print('OK app.json notification + expo-location plugin')
"
