// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Declared in the manifest `scene_actions` field and registered by index.js
// with `gladys.onSceneAction(key, ...)`. The `fields` arrive RESOLVED; a
// `"source": "devices"` field is the chosen device external_id.
//
// A scene action is never a condition: an unreachable computer is an OUTPUT
// (`success: false`) the scene author can gate the next actions on, not a
// thrown error.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async shutdown_computer(service, { fields }) {
    logger.info(`Scene action shutdown_computer <- ${fields.device}`);
    try {
      await service.shutdown(fields.device);
      return { success: true };
    } catch (err) {
      logger.warn(`Scene shutdown failed: ${err.message}`);
      return { success: false };
    }
  },
};
