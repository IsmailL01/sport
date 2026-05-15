// Чтение версии нативного бинарника через expo-application.
//
// EAS OTA НЕ обновляет nativeApplicationVersion — это binary-version,
// корректная семантика для compat negotiation (см. ADR-0007 §2):
// OTA-патчи не могут вносить нативные breaking-changes, значит мобильный
// клиент с конкретной нативной версией обращается к серверу всегда с одним
// и тем же binary-version'ом независимо от OTA-апдейтов JS-бандла.
//
// Phase 1 / REL-02.
//
// Контракт инкапсуляции: ЭТОТ файл — единственное место, импортирующее
// `expo-application`. Любой другой потребитель (apiClient и проч.) идёт
// через getClientVersionHeader() (per CLAUDE.md §Adapters / sensor-agnostic
// принцип).

import * as Application from 'expo-application';

// Module-init memoization: значения читаются ОДИН РАЗ при загрузке модуля.
// На запущенном binary они константны (Application.nativeApplicationVersion —
// readonly строка из manifest'a). Дальнейшие вызовы возвращают этот же string
// без обращения к expo-application.
const semver: string = Application.nativeApplicationVersion ?? '0.0.0';
const build: string = Application.nativeBuildVersion ?? '0';
const headerValue: string = `${semver} (${build})`;

/**
 * Возвращает строку для HTTP-заголовка X-Client-Version в формате
 * "<semver> (<build>)" — например "1.0.0 (42)".
 *
 * Значения берутся из expo-application:
 *   - semver = Application.nativeApplicationVersion ?? "0.0.0"
 *   - build  = Application.nativeBuildVersion       ?? "0"
 *
 * Memoized at module load — повторные вызовы не дёргают expo-application.
 */
export function getClientVersionHeader(): string {
  return headerValue;
}
