// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// The target computers are NOT part of it: the config_schema is a flat form,
// with no list type, so they are managed through the manifest actions and
// stored in /data (see src/store.js).
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  connect_timeout_seconds: 10, // SSH connection timeout
};

export const CONNECT_TIMEOUT_BOUNDS = { min: 3, max: 30 };

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const timeout = Number(raw.connect_timeout_seconds ?? DEFAULT_CONFIG.connect_timeout_seconds);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Config may arrive as strings from a form; clamp to what the manifest
    // allows so a hand-edited value never blocks an action for minutes.
    connect_timeout_seconds: Number.isFinite(timeout)
      ? Math.min(Math.max(timeout, CONNECT_TIMEOUT_BOUNDS.min), CONNECT_TIMEOUT_BOUNDS.max)
      : DEFAULT_CONFIG.connect_timeout_seconds,
  };
}
