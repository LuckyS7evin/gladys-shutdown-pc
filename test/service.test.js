import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SSH_ERROR_CODES, SshError } from '../src/ssh.js';
import {
  createFakeRunner,
  createTestService,
  LINUX_FIELDS,
  WINDOWS_FIELDS,
} from './helpers/fixtures.js';

test('adding a computer stores it and publishes its device', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    assert.equal(ctx.store.list().length, 1);
    assert.deepEqual(
      ctx.gladys.discovered.map((d) => d.external_id),
      [ctx.externalIdOf(computer)],
    );
  } finally {
    await ctx.cleanup();
  }
});

test('several computers become several devices', async () => {
  const ctx = await createTestService();
  try {
    await ctx.service.add(WINDOWS_FIELDS);
    await ctx.service.add(LINUX_FIELDS);
    assert.deepEqual(
      ctx.gladys.discovered.map((d) => d.name),
      ['Office PC', 'Media server'],
    );
  } finally {
    await ctx.cleanup();
  }
});

test('shutdown runs the OS command with the key and the configured timeout', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const done = await ctx.service.shutdown(ctx.externalIdOf(computer));
    assert.equal(done.id, computer.id);
    const [call] = ctx.runCommand.calls;
    assert.equal(call.command, 'shutdown /s /f /t 0');
    assert.equal(call.target.host, '192.168.1.20');
    assert.equal(call.options.privateKey, 'PRIVATE');
    assert.equal(call.options.timeoutMs, 10_000);
    assert.equal(call.options.tolerateDisconnect, true);
  } finally {
    await ctx.cleanup();
  }
});

test('a session dropped by the powering-off computer is a successful shutdown', async () => {
  const runCommand = createFakeRunner(() => ({ code: null, disconnected: true }));
  const ctx = await createTestService({ runCommand });
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    await ctx.service.shutdown(ctx.externalIdOf(computer));
  } finally {
    await ctx.cleanup();
  }
});

test('a refused command or an unreachable computer fails with a bilingual reason', async () => {
  const answers = [
    { code: 5, stderr: 'Access is denied.(5)' },
    new SshError(SSH_ERROR_CODES.UNREACHABLE, 'Host unreachable'),
  ];
  const runCommand = createFakeRunner(() => answers.shift());
  const ctx = await createTestService({ runCommand });
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    await assert.rejects(ctx.service.shutdown(ctx.externalIdOf(computer)), (err) => {
      assert.match(err.message, /Could not shut down Office PC: .*exit code 5.*Access is denied/);
      assert.match(err.message, /Impossible d'éteindre Office PC/);
      return true;
    });
    await assert.rejects(
      ctx.service.shutdown(ctx.externalIdOf(computer)),
      /unreachable.*injoignable/,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('an unknown computer is reported, never a crash', async () => {
  const ctx = await createTestService();
  try {
    await assert.rejects(ctx.service.shutdown('ext:shutdown-pc:computer:nope'), /Unknown computer/);
  } finally {
    await ctx.cleanup();
  }
});

test('the first successful connection pins the host key', async () => {
  const runCommand = createFakeRunner((_target, _command, options) => {
    options.onHostKey('SHA256:pinned');
    return { code: 0 };
  });
  const ctx = await createTestService({ runCommand });
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    await ctx.service.test(computer);
    assert.equal(ctx.store.get(computer.id).host_key, 'SHA256:pinned');
  } finally {
    await ctx.cleanup();
  }
});

test('the connection test reports success, sudo refusal and SSH failures', async () => {
  const answers = [
    { code: 0 },
    { code: 1, stderr: 'sudo: a password is required' },
    new SshError(SSH_ERROR_CODES.AUTH, 'Authentication failed'),
  ];
  const runCommand = createFakeRunner(() => answers.shift());
  const ctx = await createTestService({ runCommand });
  try {
    const windows = await ctx.service.add(WINDOWS_FIELDS);
    const linux = await ctx.service.add(LINUX_FIELDS);

    const ok = await ctx.service.test(windows);
    assert.equal(ok.ok, true);
    assert.match(ok.message.fr, /Connexion OK/);

    const sudo = await ctx.service.test(linux);
    assert.equal(sudo.ok, false);
    assert.match(sudo.message.en, /sudoers/);

    const auth = await ctx.service.test(windows);
    assert.equal(auth.ok, false);
    assert.match(auth.message.fr, /authentification refusée/);
  } finally {
    await ctx.cleanup();
  }
});

test('updating keeps the device external id', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const externalId = ctx.externalIdOf(computer);
    const updated = await ctx.service.update(externalId, { ...WINDOWS_FIELDS, host: '10.0.0.5' });
    assert.equal(ctx.externalIdOf(updated), externalId);
    assert.equal(ctx.store.list().length, 1);
    assert.equal(ctx.store.get(computer.id).host, '10.0.0.5');
  } finally {
    await ctx.cleanup();
  }
});

test('forgetting a deleted device removes the computer', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    assert.equal(await ctx.service.forget(ctx.externalIdOf(computer)), true);
    assert.equal(await ctx.service.forget(ctx.externalIdOf(computer)), false);
    assert.deepEqual(ctx.store.list(), []);
    assert.deepEqual(ctx.gladys.discovered, []);
  } finally {
    await ctx.cleanup();
  }
});
