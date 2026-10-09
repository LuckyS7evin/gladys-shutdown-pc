// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
// The manifest `config_schema` is a flat form with no list type, so the
// computers are managed here: each action declares its own form (`fields`),
// and `"source": "devices"` selects let the user pick one of the computers
// already created in Gladys. A resolved value is displayed under the button;
// a thrown error displays its message instead.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { bilingual } from './computers.js';

const logger = createLogger({ name: 'actions' });

function withTest(prefix, test) {
  return {
    en: `${prefix.en} ${test.message.en}`,
    fr: `${prefix.fr} ${test.message.fr}`,
  };
}

export const ACTIONS = {
  async show_public_key(service) {
    const publicKey = await service.publicKey();
    // A public key is not a secret: logging it gives a second place to copy
    // it from if the message is hard to select.
    logger.info(`Public key: ${publicKey}`);
    return {
      en: `Add this line to the authorized keys of the computer: ${publicKey}`,
      fr: `Ajoutez cette ligne aux clés autorisées de l'ordinateur : ${publicKey}`,
    };
  },

  async add_computer(service, { fields }) {
    const computer = await service.add(fields);
    const test = await service.test(computer);
    return withTest(
      {
        en: `"${computer.name}" added: create it from the Discovery tab.`,
        fr: `« ${computer.name} » ajouté : créez-le depuis l'onglet Découverte.`,
      },
      test,
    );
  },

  async update_computer(service, { fields }) {
    const computer = await service.update(fields.device, fields);
    const test = await service.test(computer);
    return withTest(
      { en: `"${computer.name}" updated.`, fr: `« ${computer.name} » modifié.` },
      test,
    );
  },

  async test_computer(service, { fields }) {
    const test = await service.testByExternalId(fields.device);
    if (!test.ok) {
      throw new Error(bilingual(test.message));
    }
    return test.message;
  },
};
