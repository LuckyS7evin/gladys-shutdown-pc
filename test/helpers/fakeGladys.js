// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on and records the
// calls so tests can assert them, without a running Gladys server or a real
// WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const discovered = [];
  const connectionStatuses = [];
  const widgetRefreshes = [];

  return {
    discovered,
    connectionStatuses,
    widgetRefreshes,

    externalIds(type, platformId) {
      const device = `ext:shutdown-pc:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    // Replaces the previous list, like the SDK.
    async publishDiscoveredDevices(devices) {
      discovered.splice(0, discovered.length, ...devices);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    // Fire-and-forget in the SDK too: synchronous, resolves nothing.
    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
    },
  };
}
