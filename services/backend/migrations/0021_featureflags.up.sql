-- Phase 1 / REL-03: feature flags table.
--
-- Один row на флаг. `enabled_bool` — глобальный on/off; `rollout_percent`
-- (0-100) определяет детерминированное per-user assignment через FNV-1a
-- hash (user_id, flag_name), вычисляется в pkg/featureflags.
--
-- Single writer (admin UI через PUT /admin/featureflags/{name}); N readers
-- (каждый сервис через pkg/featureflags.IsEnabled). 30s in-memory cache
-- per-process; cross-service invalidation — только через TTL expiry.
--
-- Audit: каждый Set() пишет audit_log row через pkg/audit с capability
-- = "featureflag.toggle". См. pkg/permissions для регистрации capability.
--
-- v1.0 scope: boolean + percentage rollout only (D-12). Variants и
-- per-user targeting — v1.1+. См. ADR-0007 §3.

CREATE TABLE IF NOT EXISTS featureflags (
    flag_name          TEXT PRIMARY KEY,
    enabled_bool       BOOLEAN NOT NULL DEFAULT false,
    rollout_percent    INTEGER NOT NULL DEFAULT 0
                       CHECK (rollout_percent BETWEEN 0 AND 100),
    description        TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id UUID REFERENCES users(id)
);

-- Initial v1.0 flag rows (все OFF; flipped через admin UI в следующих фазах).
-- Источник: CONTEXT D-16.
INSERT INTO featureflags (flag_name, description) VALUES
    ('strava_oauth_enabled',         'Strava OAuth read-only sync (HEALTH-04, Phase 11/12).'),
    ('mapbox_sdk_v11',               'Mapbox SDK 10→11 migration soak (Phase 13).'),
    ('release_channel_force_update', 'Emergency kill-switch for force-update UX.'),
    ('tester_debug_logging',         'Opt-in verbose logging for testers (OBS-08).'),
    ('crash_telemetry_opt_in',       'Opt-in crash telemetry collection (CRASH-04).')
ON CONFLICT (flag_name) DO NOTHING;

COMMENT ON TABLE featureflags IS 'Boolean + percentage rollout flags (Phase 1 / REL-03).';
