import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SSH_ERROR_CODES, SshError } from '../src/ssh.js';
import { createFakeRunner, createTestService, WINDOWS_FIELDS } from './helpers/fixtures.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredOutputs = manifest.scene_actions
  .find((action) => action.key === 'shutdown_computer')
  .outputs.map((output) => output.key);

test('shutdown_computer shuts the chosen computer down and returns the declared outputs', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const outputs = await SCENE_ACTIONS.shutdown_computer(ctx.service, {
      fields: { device: ctx.externalIdOf(computer) },
    });
    assert.deepEqual(outputs, { success: true });
    for (const key of Object.keys(outputs)) {
      assert.ok(declaredOutputs.includes(key), `output "${key}" is not declared`);
    }
    assert.equal(ctx.runCommand.calls[0].command, 'shutdown /s /f /t 0');
  } finally {
    await ctx.cleanup();
  }
});

test('an unreachable computer is an output, not a failed action', async () => {
  // A scene action is never a condition: the scene author gates on `success`.
  const runCommand = createFakeRunner(() => new SshError(SSH_ERROR_CODES.TIMEOUT, 'timeout'));
  const ctx = await createTestService({ runCommand });
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const outputs = await SCENE_ACTIONS.shutdown_computer(ctx.service, {
      fields: { device: ctx.externalIdOf(computer) },
    });
    assert.deepEqual(outputs, { success: false });
  } finally {
    await ctx.cleanup();
  }
});
