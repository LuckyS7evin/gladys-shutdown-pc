import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { loadOrCreateKeyPair } from '../src/keys.js';

test('the key pair is generated once, then reloaded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shutdown-pc-keys-'));
  try {
    const first = await loadOrCreateKeyPair(dir);
    assert.match(first.publicKey, /^ssh-ed25519 \S+ gladys-shutdown-pc$/);
    assert.ok(!(ssh2.utils.parseKey(first.privateKey) instanceof Error), 'a usable private key');

    const second = await loadOrCreateKeyPair(dir);
    assert.deepEqual(second, first);

    const { mode } = await stat(join(dir, 'id_ed25519'));
    assert.equal(mode & 0o077, 0, 'the private key is readable by its owner only');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
