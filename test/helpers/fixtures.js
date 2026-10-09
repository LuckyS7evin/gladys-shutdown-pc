// -----------------------------------------------------------------------------
// Shared test fixtures: a computer service wired to an in-memory store, a fake
// SSH runner and a fake reachability probe. Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../../src/config.js';
import { createComputerService } from '../../src/service.js';
import { createComputerStore } from '../../src/store.js';
import { createFakeGladys } from './fakeGladys.js';

export const WINDOWS_FIELDS = {
  name: 'Office PC',
  host: '192.168.1.20',
  port: 22,
  username: 'john',
  os: 'windows',
  force: true,
};

export const LINUX_FIELDS = {
  name: 'Media server',
  host: 'nas.local',
  port: 2222,
  username: 'media',
  os: 'linux',
};

/**
 * Fake `runCommand`: answers with `respond(target, command, options)` (an
 * object, or an Error to reject with) and records every call.
 */
export function createFakeRunner(respond = () => ({ code: 0, stdout: 'john\n', stderr: '' })) {
  const calls = [];
  async function runCommand(target, command, options) {
    calls.push({ target, command, options });
    const answer = await respond(target, command, options);
    if (answer instanceof Error) {
      throw answer;
    }
    return { stdout: '', stderr: '', disconnected: false, ...answer };
  }
  runCommand.calls = calls;
  return runCommand;
}

/** A service over a fresh temporary data directory. Call `cleanup()` after. */
export async function createTestService({
  runCommand = createFakeRunner(),
  reachable = true,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'shutdown-pc-'));
  const gladys = createFakeGladys();
  const store = createComputerStore({ dir });
  await store.load();
  const service = createComputerService({
    gladys,
    store,
    getConfig: () => normalizeConfig(),
    getKeys: async () => ({
      privateKey: 'PRIVATE',
      publicKey: 'ssh-ed25519 AAAA gladys-shutdown-pc',
    }),
    runCommand,
    isPortOpen: async () => reachable,
  });
  return {
    dir,
    gladys,
    store,
    service,
    runCommand,
    externalIdOf: (computer) => gladys.externalIds('computer', computer.id).device,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
