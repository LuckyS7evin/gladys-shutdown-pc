// -----------------------------------------------------------------------------
// Computer service: the one place that owns the computers and talks SSH.
//
// Every surface (device button, manifest actions, scene action, widget) goes
// through it, so a computer is validated, shut down and reported the same way
// wherever the order comes from.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  bilingual,
  buildDevice,
  buildShutdownCommand,
  buildTestCommand,
  computerFromFields,
  describeError,
  findComputerByExternalId,
  OS,
} from './computers.js';
import { isPortOpen as defaultIsPortOpen } from './probe.js';
import { runCommand as defaultRunCommand, SSH_ERROR_CODES, SshError } from './ssh.js';

const logger = createLogger({ name: 'computers' });

const UNKNOWN_COMPUTER = {
  en: 'Unknown computer: it may have been removed.',
  fr: 'Ordinateur inconnu : il a peut-être été supprimé.',
};

/**
 * @param {object} deps
 * @param {object} deps.gladys SDK instance (or the test fake)
 * @param {object} deps.store see src/store.js
 * @param {() => object} deps.getConfig current normalized config
 * @param {() => Promise<{ privateKey: string, publicKey: string }>} deps.getKeys
 * @param {Function} [deps.runCommand] injectable for tests
 * @param {Function} [deps.isPortOpen] injectable for tests
 */
export function createComputerService({
  gladys,
  store,
  getConfig,
  getKeys,
  runCommand = defaultRunCommand,
  isPortOpen = defaultIsPortOpen,
}) {
  // Run one command, pinning the host key on the first successful connection.
  async function run(computer, command, { tolerateDisconnect = false } = {}) {
    const { privateKey } = await getKeys();
    let pinned;
    const result = await runCommand(computer, command, {
      privateKey,
      timeoutMs: getConfig().connect_timeout_seconds * 1000,
      tolerateDisconnect,
      onHostKey: (fingerprint) => {
        pinned = fingerprint;
      },
    });
    if (pinned) {
      // Re-read: the computer may have been edited while connecting.
      const current = store.get(computer.id);
      if (current && !current.host_key) {
        await store.upsert({ ...current, host_key: pinned });
        logger.info(`Host key of "${computer.name}" pinned: ${pinned}`);
      }
    }
    return result;
  }

  function requireComputer(externalId) {
    const computer = findComputerByExternalId(gladys, store.list(), externalId);
    if (!computer) {
      throw new Error(bilingual(UNKNOWN_COMPUTER));
    }
    return computer;
  }

  return {
    list() {
      return store.list();
    },

    find(externalId) {
      return findComputerByExternalId(gladys, store.list(), externalId);
    },

    async publicKey() {
      return (await getKeys()).publicKey;
    },

    /** Is the SSH port of the computer answering? */
    isReachable(computer) {
      return isPortOpen(computer.host, computer.port);
    },

    buildDevices() {
      return store.list().map((computer) => buildDevice(gladys, computer));
    },

    async publishDevices() {
      await gladys.publishDiscoveredDevices(this.buildDevices());
    },

    async add(fields) {
      const computer = computerFromFields(fields);
      await store.upsert(computer);
      logger.info(`Computer "${computer.name}" added (${computer.host}:${computer.port})`);
      await this.publishDevices();
      return computer;
    },

    async update(externalId, fields) {
      const existing = requireComputer(externalId);
      const computer = computerFromFields(fields, existing);
      await store.upsert(computer);
      logger.info(`Computer "${computer.name}" updated (${computer.host}:${computer.port})`);
      await this.publishDevices();
      return computer;
    },

    /** Forget a computer whose device was deleted in Gladys. */
    async forget(externalId) {
      const computer = this.find(externalId);
      if (!computer) {
        return false;
      }
      await store.remove(computer.id);
      logger.info(`Computer "${computer.name}" removed`);
      await this.publishDevices();
      return true;
    },

    /**
     * Connect and run a harmless command. Resolves
     * `{ ok, message }`, never throws on an SSH failure.
     */
    async test(computer) {
      try {
        const result = await run(computer, buildTestCommand(computer));
        if (result.code !== 0) {
          if (computer.os === OS.LINUX) {
            return {
              ok: false,
              message: {
                en: 'Connected, but sudo asks for a password: add the sudoers rule from the documentation.',
                fr: 'Connecté, mais sudo demande un mot de passe : ajoutez la règle sudoers de la documentation.',
              },
            };
          }
          throw new SshError(SSH_ERROR_CODES.COMMAND, 'Command failed', {
            exitCode: result.code,
            output: (result.stderr || result.stdout).trim(),
          });
        }
        return {
          ok: true,
          message: {
            en: `Connection OK as ${computer.username}.`,
            fr: `Connexion OK en tant que ${computer.username}.`,
          },
        };
      } catch (err) {
        logger.warn(`Connection test of "${computer.name}" failed: ${err.message}`);
        const reason = describeError(err);
        return {
          ok: false,
          message: {
            en: `Connection failed: ${reason.en}.`,
            fr: `Échec de la connexion : ${reason.fr}.`,
          },
        };
      }
    },

    async testByExternalId(externalId) {
      return this.test(requireComputer(externalId));
    },

    /**
     * Send the shutdown order. Throws (bilingual message) when the computer
     * could not be reached or refused the command.
     */
    async shutdown(externalId) {
      const computer = requireComputer(externalId);
      logger.info(`Shutting down "${computer.name}" (${computer.host})`);
      try {
        const result = await run(computer, buildShutdownCommand(computer), {
          tolerateDisconnect: true,
        });
        // null: the session dropped once the command started, which is what
        // a computer powering off does.
        if (result.code !== null && result.code !== 0) {
          throw new SshError(SSH_ERROR_CODES.COMMAND, 'Command failed', {
            exitCode: result.code,
            output: (result.stderr || result.stdout).trim(),
          });
        }
      } catch (err) {
        logger.error(`Shutdown of "${computer.name}" failed: ${err.message}`);
        const reason = describeError(err);
        throw new Error(
          bilingual({
            en: `Could not shut down ${computer.name}: ${reason.en}`,
            fr: `Impossible d'éteindre ${computer.name} : ${reason.fr}`,
          }),
          { cause: err },
        );
      }
      logger.info(`Shutdown order accepted by "${computer.name}"`);
      return computer;
    },
  };
}
