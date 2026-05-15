---
phase: 01-validate-close-territory-core
plan: 03
type: execute
wave: 2
depends_on: [02]
files_modified:
  - apps/mobile-rn/package.json
  - apps/mobile-rn/src/ui/Toast.tsx
  - apps/mobile-rn/App.tsx
  - apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
  - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
  - apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx
  - apps/mobile-rn/src/__tests__/Toast.test.tsx
autonomous: true
requirements: [PHASE1-08]
maps_to_existing_plan: P1-G-09 (closure haptic feedback + toast — "отложено до runtime" per DEVELOPMENT_PLAN.md)

must_haves:
  truths:
    - "expo-haptics is installed at pinned version ~14.1.4 (SDK 54 compatible)"
    - "Toast component exists in src/ui/Toast.tsx with ToastProvider context + useToast() hook"
    - "ToastProvider is mounted above RootNavigator in App.tsx, between ThemeProvider and RootNavigator"
    - "useClosureFeedback hook fires Haptics.notificationAsync(Success) AND show('Зона замкнута! Площадь: N') exactly once when closureFired transitions false→true"
    - "Haptic failures (iOS sim / unsupported Android) are silently swallowed via .catch — no yellow boxes"
    - "Toast text matches the locked Russian copy: «Зона замкнута! Площадь: <formatArea(areaM2)>»"
  artifacts:
    - path: apps/mobile-rn/src/ui/Toast.tsx
      provides: "ToastProvider Context + useToast hook + Animated.View overlay"
      min_lines: 50
    - path: apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
      provides: "Hook that fires haptic + toast on closureFired"
      min_lines: 20
  key_links:
    - from: apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
      to: apps/mobile-rn/src/ui/Toast.tsx
      via: useToast() context consumer
      pattern: "useToast\\(\\)"
    - from: apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
      to: apps/mobile-rn/src/state/activity.ts
      via: useActivityStore(s => s.closureFired) + useActivityStore(s => s.areaM2)
      pattern: "closureFired|areaM2"
    - from: apps/mobile-rn/App.tsx
      to: apps/mobile-rn/src/ui/Toast.tsx
      via: <ToastProvider> wrap around RootNavigator
      pattern: "<ToastProvider>"
---

<objective>
Wire the closure-feedback effect that fires when ClosureDetector closes a zone for the first time in a session: trigger `Haptics.notificationAsync(Success)` AND show a toast «Зона замкнута! Площадь: N м²» (or km² ≥10000 m²) per CONTEXT.md D-16/D-17/D-18/D-19. This is the only plan that introduces a new dependency (`expo-haptics@~14.1.4`).

Purpose: Closure detection has shipped for many months but produces no UX feedback. Users miss the moment their territory is captured. This plan ships the missing micro-interaction and proves the haptic-on-event pattern for future events (records broken, achievements unlocked, etc.).
Output: `expo-haptics` installed and pinned; in-house `Toast.tsx` component + Context provider; `useClosureFeedback` hook; ToastProvider mounted in App.tsx; useClosureFeedback called from TrackerLiveScreen.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-validate-close-territory-core/01-CONTEXT.md
@.planning/phases/01-validate-close-territory-core/01-RESEARCH.md
@.planning/phases/01-validate-close-territory-core/01-PATTERNS.md
@CLAUDE.md

@apps/mobile-rn/App.tsx
@apps/mobile-rn/src/ui/format.ts
@apps/mobile-rn/src/state/activity.ts
@apps/mobile-rn/src/design/ThemeProvider.tsx
@apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
@apps/mobile-rn/src/__tests__/walletStore.test.ts
@.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md

<interfaces>
<!-- Toast contract (NEW). -->

```typescript
// apps/mobile-rn/src/ui/Toast.tsx (NEW)
type Ctx = { show: (text: string, durationMs?: number) => void };
export function useToast(): Ctx;
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element;
```

<!-- useClosureFeedback contract (NEW). -->

```typescript
// apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts (NEW)
export function useClosureFeedback(): void; // side-effect hook — no return
```

<!-- Existing format helper (DO NOT reimplement). -->

```typescript
// apps/mobile-rn/src/ui/format.ts (existing, lines 18-22 per PATTERNS.md)
export function formatArea(m2: number): string; // returns "1 234 м²" or "12.3 км²" based on size
```

<!-- Existing closureFired event (DO NOT change shape). -->

```typescript
// apps/mobile-rn/src/state/activity.ts (existing — Plan 01 preserved this snapshot field)
useActivityStore((s) => s.closureFired): boolean
useActivityStore((s) => s.areaM2): number | null
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install expo-haptics + create Toast component + tests</name>
  <files>apps/mobile-rn/package.json, apps/mobile-rn/src/ui/Toast.tsx, apps/mobile-rn/src/__tests__/Toast.test.tsx</files>
  <action>
    Per CONTEXT.md D-16 + D-17, RESEARCH.md §Standard Stack + Code Examples lines 532-577:

    Step 1a — Install expo-haptics with EXACT version pin to `~14.1.4` (Expo SDK 54 compatible). Per RESEARCH.md §Version Verification:
    ```
    cd apps/mobile-rn && npx expo install expo-haptics
    ```
    Then verify resolution: `cat apps/mobile-rn/package.json | grep expo-haptics`. The version MUST be `~14.1.4` (NOT `^14.1.4`, NOT `~15.x.x`, NOT `latest`). If npm resolved to `15.x.x` (RESEARCH.md flags this as the SDK 55 version), force the SDK 54 version: `cd apps/mobile-rn && npm install expo-haptics@~14.1.4 --save-exact` — re-verify version in package.json. ABSOLUTELY DO NOT use `expo install expo-haptics@latest` — that pulls SDK 55 version incompatible with this project's `expo@~54.0.x`.

    Step 1b — Create `apps/mobile-rn/src/ui/Toast.tsx`. Source pattern: PATTERNS.md §Toast.tsx lines 254-307 + RESEARCH.md Code Examples lines 534-577. EXACT structure:
    - Module header: `// Toast: in-house overlay для лёгких уведомлений (closure haptic+toast и т.д.). // Phase 1 / PHASE1-08. См. ТЗ §3 / DEVELOPMENT_PLAN.md §3 P1-G-09. // No new dependency — Animated.View + Context.`
    - Imports: `import { createContext, useCallback, useContext, useRef, useState } from 'react'; import { Animated, StyleSheet, Text, View } from 'react-native';`
    - Optional: `import { useTheme } from '../design';` to pull `t.lime` for background and `t.text` for text color — per PATTERNS.md line 295 use design tokens rather than hard-coded `#10B981` IF the existing theme has a `.lime` token, else fall back to literal `#10B981` (D-17 specifies the accent color).
    - Context: `type Ctx = { show: (text: string, durationMs?: number) => void }; const ToastCtx = createContext<Ctx>({ show: () => {} }); export const useToast = () => useContext(ToastCtx);`
    - Provider: state `msg: string | null` + opacity Animated.Value. `show` wraps `Animated.sequence([fadeIn 200ms, delay durationMs (default 2500), fadeOut 300ms])` with `useNativeDriver: true`. After the sequence ends, `setMsg(null)`. `useCallback([opacity])` for `show` so it is stable across re-renders.
    - JSX: `<ToastCtx.Provider value={{ show }}>{children}{msg && <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none"><Text style={styles.text}>{msg}</Text></Animated.View>}</ToastCtx.Provider>`
    - Styles: position absolute bottom 100, alignSelf center, paddingHorizontal 20, paddingVertical 12, borderRadius 24, elevation 8, shadowColor #000, shadowOpacity 0.3, shadowRadius 8, shadowOffset {0,4}. Text color #fff (or theme.text), fontSize 15, fontWeight '600'. Background `#10B981` OR `theme.lime`.

    Step 1c — Tests at `apps/mobile-rn/src/__tests__/Toast.test.tsx`:
    1. `useToast()` outside `<ToastProvider>` returns a no-op `show` (default Ctx value used).
    2. Inside `<ToastProvider>`, calling `show('hi')` mounts the `<Text>` with content "hi"; advance fake timers past 3000ms; the `<Text>` unmounts (msg returns to null).
    3. `show('first'); show('second')` — second call replaces first; only "second" renders after fade-in completes.

    Use `render` from `@testing-library/react-native` (per `package.json` v13.3.3 — already installed). Use `jest.useFakeTimers()` for animation timing.

    Implements D-16 (haptics install pinned) + D-17 (in-house Toast). NEVER install `react-native-toast-message` / `burnt` / `react-native-flash-message` — D-17 locks zero new toast deps. NEVER bump expo-haptics to 15.x — that breaks SDK 54.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && grep '"expo-haptics"' package.json | grep -E '~14\.1\.[0-9]+' && npm test -- --testPathPattern=Toast.test</automated>
  </verify>
  <done>package.json has `"expo-haptics": "~14.1.4"` (or equivalent ~14.1.x). Toast.tsx exists with provider+useToast+overlay. Toast.test.tsx green with ≥3 tests. `npm run typecheck` clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create useClosureFeedback hook + tests</name>
  <files>apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts, apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx</files>
  <behavior>
    - Test 1: Hook calls `Haptics.notificationAsync(NotificationFeedbackType.Success)` exactly once when `closureFired` flips from `false` to `true` (and `areaM2 !== null`).
    - Test 2: Hook calls `useToast().show(...)` with the Russian-formatted string `«Зона замкнута! Площадь: <formatArea(areaM2)>»`. Verify by mocking `useToast` to capture the call argument and asserting it matches the formatArea output for `areaM2 === 1234` → expected substring "1 234 м²" (or whatever `formatArea` returns for that input — call the real `formatArea` in the assertion to derive the expected string, not a hardcoded value).
    - Test 3: Hook does NOT call haptic OR toast on a re-render where `closureFired === true` AND `areaM2 === <same>` (effect dependency stability — React useEffect with `[closureFired, areaM2, show]` only fires once per transition).
    - Test 4: Hook does NOT call haptic OR toast when `closureFired === true` BUT `areaM2 === null` (guard against firing before area is computed).
    - Test 5: When `Haptics.notificationAsync` rejects (mock it to return a rejected Promise), the rejection is silently swallowed via `.catch(() => {})` — no unhandled promise rejection warning, hook still calls `show(...)` (toast remains best-effort).
  </behavior>
  <action>
    Per PATTERNS.md §useClosureFeedback.ts lines 226-249 + RESEARCH.md Pattern 3 lines 305-323:

    Create `apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts`. Module header:
    ```
    // useClosureFeedback: haptic + toast побочный эффект при первом закрытии зоны в сессии.
    // Phase 1 / PHASE1-08. См. CONTEXT.md D-16..D-19, ТЗ §3, DEVELOPMENT_PLAN.md §3 P1-G-09.
    // Side-effect hook — никакого возврата. Слушает closureFired event из useActivityStore.
    ```

    Imports (per PATTERNS.md):
    ```
    import { useEffect } from 'react';
    import * as Haptics from 'expo-haptics';

    import { useActivityStore } from '../../../../state/activity';
    import { useToast } from '../../../../ui/Toast';
    import { formatArea } from '../../../../ui/format';
    ```

    Body (exact code from PATTERNS.md lines 233-244):
    ```
    export function useClosureFeedback(): void {
      const closureFired = useActivityStore((s) => s.closureFired);
      const areaM2 = useActivityStore((s) => s.areaM2);
      const { show } = useToast();
      useEffect(() => {
        if (!closureFired || areaM2 === null) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          .catch(() => { /* iOS sim / unsupported — silent (Pitfall 2) */ });
        show(`Зона замкнута! Площадь: ${formatArea(areaM2)}`);
      }, [closureFired, areaM2, show]);
    }
    ```

    Test file `apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx` follows PATTERNS.md lines 619-650:
    - `jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Success: 'success' } }));`
    - Mock useToast: `const showMock = jest.fn(); jest.mock('../ui/Toast', () => ({ useToast: () => ({ show: showMock }), ToastProvider: ({ children }: any) => children }));`
    - Mock useActivityStore the same way Plan 02 mocked it (per-selector fake).
    - Use `renderHook(() => useClosureFeedback(), { ... })` with mutable mock-state and `rerender()` to drive scenarios.
    - For Test 5, override the mock for that one case: `(Haptics.notificationAsync as jest.Mock).mockReturnValueOnce(Promise.reject(new Error('sim no haptic')))` — assert no unhandled rejection (use `process.on('unhandledRejection', ...)` listener inside `beforeAll`/`afterAll` and assert it was never called) AND assert `showMock` still ran.

    Per PATTERNS.md §Adapter discipline + CLAUDE.md project rules: this hook is allowed to import `expo-haptics` (it is platform-bound but not Mapbox-bound, so the `no-restricted-imports` rule does NOT apply to expo-haptics). The hook is the SOLE call site for `Haptics.*` in the codebase — per RESEARCH.md §Anti-Patterns "Importing expo-haptics outside useClosureFeedback hook — keep one call site so the catch-swallow pattern is consistent."

    ABSOLUTELY DO NOT call `Haptics.notificationAsync` synchronously inside the closureDetector callback in `activity.ts` (per RESEARCH.md Anti-Patterns — that callback runs during Zustand `set`, and native async calls inside a reducer cycle introduce reentrancy). Always go through this useEffect-based hook. NEVER omit the `.catch(() => {})` — iOS Simulator and many Android devices reject the promise and the yellow box defeats the UX (Pitfall 2).

    Implements PHASE1-08 hook layer (D-16, D-18, D-19).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=useClosureFeedback.test</automated>
  </verify>
  <done>useClosureFeedback.ts exists with mandatory `.catch(() => {})`. Test file has ≥5 tests all green. `npm run typecheck` clean.</done>
</task>

<task type="auto">
  <name>Task 3: Mount ToastProvider in App.tsx + call useClosureFeedback from TrackerLiveScreen</name>
  <files>apps/mobile-rn/App.tsx, apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx</files>
  <action>
    Per PATTERNS.md §Wire-up in App.tsx lines 296-307 + §TrackerLiveScreen.tsx lines 320:

    Step 3a — Edit `apps/mobile-rn/App.tsx`. Read the current `<ThemeProvider> ... <RootNavigator />` block (per PATTERNS.md the existing structure mirrors lines 70-86). Wrap `<RootNavigator />` (and any siblings like `<StatusBar style="light" />` if they live inside ThemeProvider) with `<ToastProvider>`:
    ```
    <ThemeProvider>
      <ToastProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </ToastProvider>
    </ThemeProvider>
    ```
    The order matters: ThemeProvider OUTSIDE so `useTheme()` inside ToastProvider works for the toast pill color. RootNavigator INSIDE ToastProvider so every screen can call `useToast().show(...)`.

    Import `ToastProvider` at the top of App.tsx: `import { ToastProvider } from './src/ui/Toast';`. NEVER place `ToastProvider` outside `ThemeProvider` — that breaks `useTheme()` access from inside the toast component.

    Step 3b — Edit `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx`. Add the hook call near the other hook calls introduced by Plan 02 (immediately after `useTrackerCamera() / useLayerVisibility() / usePauseUI()` lines):
    ```
    import { useClosureFeedback } from './hooks/useClosureFeedback';

    // ... inside the component body, near other hook calls:
    useClosureFeedback(); // PHASE1-08 — fires haptic + toast on closureFired transition false→true
    ```
    The hook is fire-and-forget (returns void). PRESERVE everything else in the screen. Plan 02 already trimmed the screen — this task only adds one import line + one call site.

    Step 3c — Manual smoke test: launch the app on Pixel emulator. Start a session. Walk in a circle (use the existing dev simulation if available — `apps/mobile-rn/src/dev/<sim>.ts` may have a closure-fake utility; if not, manually toggle `useActivityStore.setState({ closureFired: true, areaM2: 1234 })` from a debugger). Confirm: (a) haptic fires on real device (best-effort on emulator), (b) toast appears with `«Зона замкнута! Площадь: 1 234 м²»` centered near the bottom, (c) toast fades in over 200ms, holds 2.5s, fades out over 300ms.

    NEVER hard-code the toast text — it is `formatArea(areaM2)` which auto-switches m² ↔ км² when ≥10000 m² per D-19.

    Implements PHASE1-08 wire-up.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test && npm run typecheck && npm run lint && grep -c "ToastProvider" apps/mobile-rn/App.tsx</automated>
  </verify>
  <done>App.tsx has ToastProvider mounted between ThemeProvider and RootNavigator. TrackerLiveScreen calls useClosureFeedback(). Full test suite passes. Manual smoke confirms haptic+toast UX. Atomic commit: `feat(phase1): closure haptic + toast feedback (PHASE1-08)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User device → expo-haptics native module | Native bridge call (notificationAsync). Untrusted input crosses NONE — the call is parameter-less from our side (`NotificationFeedbackType.Success`). |
| In-app event (closureFired) → UX feedback | No trust boundary. ClosureDetector runs in-process; the hook consumes a snapshot field. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-03-01 | Information Disclosure | Toast text reveals area to anyone shoulder-surfing | accept | Area is non-sensitive (a number of square meters). Privacy zones are explicitly Phase 4 (per ROADMAP). No PII in the toast. |
| T-01-03-02 | Denial of Service | Repeated closureFired events → repeated haptics | mitigate | ClosureDetector fires exactly once per session (existing invariant — see `ClosureDetector.ts` `fired` flag at line 14-15 of the existing file). useEffect dependency on `[closureFired, areaM2, show]` ensures one haptic per transition. Test 3 in Task 2 covers idempotency. |
| T-01-03-03 | Tampering | expo-haptics from npm registry | accept | Dependency installed via npm with version pin `~14.1.4`. Lockfile (package-lock.json) integrity-checks the tarball. Standard supply-chain stance for the project — no enhanced controls introduced. |
| T-01-03-04 | Information Disclosure | Toast text leaked in screenshots/screen recordings | accept | Documented behavior. User opt-in by starting a recording. |
| T-01-03-05 | Elevation of Privilege | Haptics API exposing private system functions | accept | expo-haptics is a thin wrapper over UIImpactFeedbackGenerator (iOS) / Vibrator (Android). No privilege escalation surface. |

This plan has low security surface. The new dependency (expo-haptics) is a well-known Expo-managed package; the toast is purely UI.
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full suite green including Toast.test.tsx + useClosureFeedback.test.tsx.
- `cd apps/mobile-rn && npm run typecheck` clean.
- `cd apps/mobile-rn && npm run lint` clean.
- `cd apps/mobile-rn && grep '"expo-haptics"' package.json | grep -E '~14\.1\.[0-9]+'` — confirms pinned version.
- Manual: launch app on Pixel emulator → trigger closure → toast appears with expected text + haptic fires on physical device.
- `grep -c "Haptics" apps/mobile-rn/src/**/*.ts` (excluding tests) returns 1 — single call site is the hook.
</verification>

<success_criteria>
- expo-haptics installed at `~14.1.4` exactly.
- Toast component reusable via `useToast()` from any screen post-this-plan.
- Closure haptic+toast micro-interaction shipped end-to-end.
- All must_haves.truths above are observably TRUE.
- Atomic commits per task: `feat(phase1): add expo-haptics + Toast component (PHASE1-08)`, `feat(phase1): useClosureFeedback hook (PHASE1-08)`, `feat(phase1): wire ToastProvider + closure feedback (PHASE1-08)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-03-SUMMARY.md` capturing:
- expo-haptics resolved version (confirm exactly `14.1.4`)
- Toast LOC + theme integration choice (used `t.lime` OR literal `#10B981`)
- Manual smoke outcome (haptic worked on emulator? on a real phone?)
- Total new tests added
- Cross-link: closes PHASE1-08 + P1-G-09
</output>
