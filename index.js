// -----------------------------------------------------------------------------
// Entry point of the "Shutdown PC" Gladys external integration.
//
// Role of this file: wire the SDK to the computer service (src/service.js). It
// holds NO SSH logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects and publishes the computers as devices.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { loadOrCreateKeyPair } from './src/keys.js';
import { createComputerStore, dataDir } from './src/store.js';
import { createComputerService } from './src/service.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

const store = createComputerStore({ dir: dataDir() });

// The key pair is generated on first use and then kept in memory.
let keysPromise;
function getKeys() {
  keysPromise ??= loadOrCreateKeyPair(dataDir()).catch((err) => {
    keysPromise = undefined;
    throw err;
  });
  return keysPromise;
}

const service = createComputerService({ gladys, store, getConfig: () => config, getKeys });

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the computers');
  await service.publishDevices();
});

// --- Command: the user pressed the "Shut down" button of a computer ----------
// From a dashboard or a scene "control a device" action. Throwing sends a
// success:false acknowledgement: the user sees why it failed.
gladys.onSetValue(async (device, feature) => {
  logger.info(`onSetValue <- ${feature.external_id}`);
  await service.shutdown(device.external_id);
});

// --- A computer's device was deleted in Gladys: forget the computer ----------
gladys.onDeviceDeleted(async (device) => {
  if (await service.forget(device.external_id)) {
    refreshWidgets(gladys);
  }
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, async (fields) => {
    const message = await handler(service, { fields });
    refreshWidgets(gladys);
    return message;
  });
}

// --- Scene actions: operations a scene author placed in a scene -------------
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(service, { fields }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(service, request));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action(service, { actionKey, params, settings }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await store.load();
    // Generate the key pair now, so "Show the public key" answers at once.
    await getKeys();
    await service.publishDevices();
    // The nudges sent while the socket was down were dropped.
    refreshWidgets(gladys);
    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Shutdown PC integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
