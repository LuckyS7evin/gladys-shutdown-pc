import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComputerStore } from '../src/store.js';

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'shutdown-pc-store-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a missing file is an empty list', () =>
  withDir(async (dir) => {
    const store = createComputerStore({ dir });
    assert.deepEqual(await store.load(), []);
  }));

test('computers survive a restart, in a file only the owner can read', () =>
  withDir(async (dir) => {
    const store = createComputerStore({ dir });
    await store.load();
    await store.upsert({ id: 'a', name: 'A', password: 'secret' });
    await store.upsert({ id: 'b', name: 'B' });
    await store.upsert({ id: 'a', name: 'A2', password: 'secret' });

    const reloaded = createComputerStore({ dir });
    assert.deepEqual(
      (await reloaded.load()).map((c) => c.name),
      ['A2', 'B'],
    );
    const { mode } = await stat(join(dir, 'computers.json'));
    assert.equal(mode & 0o077, 0, 'no access for the group or the others');
  }));

test('remove deletes one computer and says whether it existed', () =>
  withDir(async (dir) => {
    const store = createComputerStore({ dir });
    await store.load();
    await store.upsert({ id: 'a', name: 'A' });
    assert.equal(await store.remove('a'), true);
    assert.equal(await store.remove('a'), false);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'computers.json'), 'utf8')), []);
  }));

test('the store hands out copies, never its own objects', () =>
  withDir(async (dir) => {
    const store = createComputerStore({ dir });
    await store.load();
    await store.upsert({ id: 'a', name: 'A' });
    store.get('a').name = 'changed';
    store.list()[0].name = 'changed';
    assert.equal(store.get('a').name, 'A');
  }));

test('a corrupted file is reported, not silently wiped', () =>
  withDir(async (dir) => {
    await writeFile(join(dir, 'computers.json'), '{not json');
    await assert.rejects(createComputerStore({ dir }).load(), SyntaxError);
  }));
