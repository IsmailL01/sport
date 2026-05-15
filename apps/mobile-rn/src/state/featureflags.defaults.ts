// Phase 1 / REL-03: v1.0 bundled feature flag defaults.
//
// Все флаги дефолтом OFF — server overrides включают их per CONTEXT D-16.
// Обновляется когда добавляется новый flag в migration 0021_featureflags.up.sql.
//
// Object.freeze() обеспечивает runtime-immutability (T-01-C-10 mitigation;
// предотвращает случайное переопределение flag-defaults на этапе модулей).

export const DEFAULT_FLAGS: Readonly<Record<string, boolean>> = Object.freeze({
  strava_oauth_enabled: false, // Phase 11/12 HEALTH-04
  mapbox_sdk_v11: false, // Phase 13 migration
  release_channel_force_update: false, // Emergency kill-switch
  tester_debug_logging: false, // OBS-08 opt-in
  crash_telemetry_opt_in: false, // CRASH-04 opt-in
});
