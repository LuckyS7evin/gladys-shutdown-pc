// -----------------------------------------------------------------------------
// Persistent list of the target computers.
//
// The manifest `config_schema` has no list type, so the computers the user
// adds through the `add_computer` action live in a JSON file under /data, the
// only writable volume of the container. The file holds the optional SSH
// passwords: it is written with 0600 permissions and never logged.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_NAME = 'computers.json';

/** Writable data directory: /data in the container, overridable for tests. */
export function dataDir() {
  return process.env.DATA_DIR || '/data';
}

/**
 * In-memory store of the computers, backed by `<dir>/computers.json`.
 * Every mutation is written to disk before it resolves.
 */
export function createComputerStore({ dir = dataDir() } = {}) {
  const file = join(dir, FILE_NAME);
  let computers = [];

  async function persist() {
    await mkdir(dir, { recursive: true });
    // Write then rename: a crash mid-write never leaves a truncated file.
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(computers, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, file);
  }

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        computers = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
        computers = [];
      }
      return this.list();
    },

    list() {
      return computers.map((computer) => ({ ...computer }));
    },

    get(id) {
      const found = computers.find((computer) => computer.id === id);
      return found ? { ...found } : undefined;
    },

    async upsert(computer) {
      const index = computers.findIndex((existing) => existing.id === computer.id);
      if (index === -1) {
        computers.push({ ...computer });
      } else {
        computers[index] = { ...computer };
      }
      await persist();
    },

    async remove(id) {
      const before = computers.length;
      computers = computers.filter((computer) => computer.id !== id);
      if (computers.length !== before) {
        await persist();
        return true;
      }
      return false;
    },
  };
}
