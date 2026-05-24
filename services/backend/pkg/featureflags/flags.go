// flags.go — Phase 1 / REL-03 + Phase 5 / Plan 05-06 / OBS-08 / D-22 / D-23.
//
// Registration table для known v1.0 feature flags. Single source of truth для
// flag names, default values и descriptions — consumed by:
//
//   - migration 0021_featureflags.up.sql (INSERT ... ON CONFLICT DO NOTHING)
//     для seed строк в production DB. Migration уже зашипилась в Phase 1; этот
//     файл документирует те же имена для compile-time-discoverable доступ из
//     Go-кода (избегает stringly-typed flag-name typos).
//
//   - admin UI / CLI tooling, которые могут перечислить registered flags для
//     показа в featureflags admin pane.
//
//   - DebugSessionMiddleware (Plan 05-06) — потребляет TesterDebugLogging
//     constant вместо raw string чтобы избежать typo regression.
//
// Convention: одна KnownFlags entry на flag, default=false (admin flips через
// /admin/featureflags/{name} per Phase 1 REL-03). Adding new flag — append
// entry here + add INSERT row в новую migration. NO global registry mutation
// at runtime.
package featureflags

// FlagSpec — registration entry для одного флага.
type FlagSpec struct {
	// Name — strict identifier; используется как featureflags.flag_name primary
	// key в Postgres. Convention: snake_case, ≤64 chars.
	Name string
	// DefaultEnabled — desired initial enabled_bool после migration seed. v1.0
	// scope: все флаги default=false (kill-switch hygiene per CONTEXT D-12;
	// admin must explicitly enable post-deploy). DefaultEnabled здесь —
	// documentation only; actual seed lives в migration SQL.
	DefaultEnabled bool
	// Description — human-readable purpose. Эмитится в admin UI; cross-link к
	// REQ-ID / D-XX / RESEARCH §-anchor для traceability.
	Description string
}

// Well-known flag names — refer to these constants instead of raw strings to
// avoid typo regressions (compile-time discoverable across the 8 services).
const (
	// StravaOAuthEnabled — HEALTH-04 / Phase 11/12. Gates the Strava read-only
	// activity sync seam (OAuth flow + token storage + per-user opt-in).
	StravaOAuthEnabled = "strava_oauth_enabled"

	// MapboxSDKv11 — Phase 13. Gates the @rnmapbox/maps 10.x → 11.x migration
	// soak (mobile-side); backend ignores this flag.
	MapboxSDKv11 = "mapbox_sdk_v11"

	// ReleaseChannelForceUpdate — Phase 4 emergency kill-switch. When ON,
	// clientversion middleware sends 426 Upgrade Required regardless of policy.
	ReleaseChannelForceUpdate = "release_channel_force_update"

	// TesterDebugLogging — Phase 5 / Plan 05-06 / OBS-08 / D-22. Per-user
	// rollout gate для DebugSessionMiddleware elevation. Coupled с X-Debug-
	// Session header + JWT IsTester claim per RESEARCH §1.8 three-gate model.
	// Default OFF; admin flips per-user via Phase 1 REL-03 admin UI.
	TesterDebugLogging = "tester_debug_logging"

	// CrashTelemetryOptIn — Phase 17 / CRASH-04. Mobile-side per-user opt-in
	// for crash reporting (RU consent banner UX in Phase 17).
	CrashTelemetryOptIn = "crash_telemetry_opt_in"
)

// KnownFlags — registration table consumed by tooling / docs / migration
// audits. Order matches migration 0021_featureflags.up.sql seed order.
//
// Note: migration is authoritative for production seed (this slice is
// documentation-grade Go-discoverable companion; admin tooling can use it to
// validate that DB rows match declared registry).
var KnownFlags = []FlagSpec{
	{
		Name:           StravaOAuthEnabled,
		DefaultEnabled: false,
		Description:    "Strava OAuth read-only sync (HEALTH-04, Phase 11/12).",
	},
	{
		Name:           MapboxSDKv11,
		DefaultEnabled: false,
		Description:    "Mapbox SDK 10→11 migration soak (Phase 13).",
	},
	{
		Name:           ReleaseChannelForceUpdate,
		DefaultEnabled: false,
		Description:    "Emergency kill-switch for force-update UX.",
	},
	{
		Name:           TesterDebugLogging,
		DefaultEnabled: false,
		Description:    "Per-user debug-log elevation gate; coupled with X-Debug-Session header + JWT is_tester claim per OBS-08 / RESEARCH §1.8 (Plan 05-06).",
	},
	{
		Name:           CrashTelemetryOptIn,
		DefaultEnabled: false,
		Description:    "Opt-in crash telemetry collection (CRASH-04, Phase 17).",
	},
}
