import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/actions.js';
import { SSH_ERROR_CODES, SshError } from '../src/ssh.js';
import { createFakeRunner, createTestService, WINDOWS_FIELDS } from './helpers/fixtures.js';

test('show_public_key displays the integration public key', async () => {
  const ctx = await createTestService();
  try {
    const message = await ACTIONS.show_public_key(ctx.service, { fields: {} });
    assert.match(message.en, /ssh-ed25519 AAAA gladys-shutdown-pc/);
    assert.match(message.fr, /ssh-ed25519 AAAA gladys-shutdown-pc/);
  } finally {
    await ctx.cleanup();
  }
});

test('add_computer saves the computer and reports the connection test', async () => {
  const ctx = await createTestService();
  try {
    const message = await ACTIONS.add_computer(ctx.service, { fields: WINDOWS_FIELDS });
    assert.match(message.fr, /« Office PC » ajouté.*Découverte.*Connexion OK/);
    assert.equal(ctx.store.list().length, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('add_computer keeps the computer even when the computer is off', async () => {
  const runCommand = createFakeRunner(() => new SshError(SSH_ERROR_CODES.TIMEOUT, 'timeout'));
  const ctx = await createTestService({ runCommand });
  try {
    const message = await ACTIONS.add_computer(ctx.service, { fields: WINDOWS_FIELDS });
    assert.match(message.en, /added.*Connection failed/);
    assert.equal(ctx.store.list().length, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('add_computer refuses an invalid form', async () => {
  const ctx = await createTestService();
  try {
    await assert.rejects(
      ACTIONS.add_computer(ctx.service, { fields: { ...WINDOWS_FIELDS, host: '' } }),
      /valid host name.*nom d'hôte/,
    );
    assert.equal(ctx.store.list().length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('update_computer edits the chosen computer', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const message = await ACTIONS.update_computer(ctx.service, {
      fields: { ...WINDOWS_FIELDS, name: 'Gaming PC', device: ctx.externalIdOf(computer) },
    });
    assert.match(message.en, /"Gaming PC" updated/);
    assert.equal(ctx.store.get(computer.id).name, 'Gaming PC');
  } finally {
    await ctx.cleanup();
  }
});

test('test_computer answers the result, and throws on failure so the UI shows an error', async () => {
  const answers = [{ code: 0 }, new SshError(SSH_ERROR_CODES.UNREACHABLE, 'x')];
  const runCommand = createFakeRunner(() => answers.shift());
  const ctx = await createTestService({ runCommand });
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const fields = { device: ctx.externalIdOf(computer) };
    assert.match((await ACTIONS.test_computer(ctx.service, { fields })).en, /Connection OK/);
    await assert.rejects(ACTIONS.test_computer(ctx.service, { fields }), /unreachable/);
  } finally {
    await ctx.cleanup();
  }
});
