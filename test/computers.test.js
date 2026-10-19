import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  buildDevice,
  buildShutdownCommand,
  buildTestCommand,
  computerFromFields,
  describeError,
  ValidationError,
} from '../src/computers.js';
import { SSH_ERROR_CODES, SshError } from '../src/ssh.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { LINUX_FIELDS, WINDOWS_FIELDS } from './helpers/fixtures.js';

test('computerFromFields builds a computer with a random stable id', () => {
  const computer = computerFromFields(WINDOWS_FIELDS);
  assert.match(computer.id, /^[0-9a-f-]{36}$/);
  assert.equal(computer.name, 'Office PC');
  assert.equal(computer.port, 22);
  assert.equal(computer.os, 'windows');
  assert.equal(computer.force, true);
  assert.equal(computer.password, undefined, 'no password: key authentication');
  assert.notEqual(computerFromFields(WINDOWS_FIELDS).id, computer.id);
});

test('computerFromFields trims and coerces form values', () => {
  const computer = computerFromFields({ ...LINUX_FIELDS, host: ' nas.local ', port: '2222' });
  assert.equal(computer.host, 'nas.local');
  assert.equal(computer.port, 2222);
});

test('computerFromFields defaults to port 22, Windows and force', () => {
  const computer = computerFromFields({ name: 'PC', host: '10.0.0.2', username: 'admin' });
  assert.equal(computer.port, 22);
  assert.equal(computer.os, 'windows');
  assert.equal(computer.force, true);
});

test('computerFromFields rejects invalid values with a bilingual message', () => {
  const invalid = [
    { ...WINDOWS_FIELDS, name: '  ' },
    { ...WINDOWS_FIELDS, host: '' },
    { ...WINDOWS_FIELDS, host: '192.168.1.20; rm -rf /' },
    { ...WINDOWS_FIELDS, port: 0 },
    { ...WINDOWS_FIELDS, port: 70000 },
    { ...WINDOWS_FIELDS, port: 'abc' },
    { ...WINDOWS_FIELDS, username: '' },
    { ...WINDOWS_FIELDS, username: 'john\ndoe' },
    { ...WINDOWS_FIELDS, os: 'macos' },
  ];
  for (const fields of invalid) {
    assert.throws(
      () => computerFromFields(fields),
      (err) =>
        err instanceof ValidationError && Boolean(err.translations.en && err.translations.fr),
      JSON.stringify(fields),
    );
  }
});

test('computerFromFields accepts Windows user names with a space or a domain', () => {
  // The user name travels in the SSH protocol only, never through a shell.
  for (const username of ['Jean Dupont', 'OFFICE\\jean', 'jean@example.com']) {
    assert.equal(computerFromFields({ ...WINDOWS_FIELDS, username }).username, username);
  }
  assert.equal(
    computerFromFields({ ...WINDOWS_FIELDS, username: '  Jean Dupont ' }).username,
    'Jean Dupont',
  );
});

test('an update keeps the id and the password left blank, and drops the pinned host key', () => {
  const existing = {
    ...computerFromFields({ ...WINDOWS_FIELDS, password: 'secret' }),
    host_key: 'SHA256:abc',
  };
  const updated = computerFromFields({ ...WINDOWS_FIELDS, host: '192.168.1.21' }, existing);
  assert.equal(updated.id, existing.id);
  assert.equal(updated.password, 'secret');
  assert.equal(updated.host, '192.168.1.21');
  assert.equal(updated.host_key, undefined);
});

test('an update can replace or remove the password', () => {
  const existing = computerFromFields({ ...WINDOWS_FIELDS, password: 'secret' });
  assert.equal(
    computerFromFields({ ...WINDOWS_FIELDS, password: 'new' }, existing).password,
    'new',
  );
  const cleared = computerFromFields({ ...WINDOWS_FIELDS, clear_password: true }, existing);
  assert.equal(cleared.password, undefined);
});

test('the device carries one push button and no secret', () => {
  const gladys = createFakeGladys();
  const computer = computerFromFields({ ...WINDOWS_FIELDS, password: 'secret' });
  const device = buildDevice(gladys, computer);
  assert.equal(device.external_id, gladys.externalIds('computer', computer.id).device);
  assert.equal(device.name, 'Office PC');
  assert.equal(device.features.length, 1);
  const [feature] = device.features;
  assert.equal(feature.category, DEVICE_FEATURE_CATEGORIES.BUTTON);
  assert.equal(feature.type, DEVICE_FEATURE_TYPES.BUTTON.PUSH);
  assert.equal(feature.read_only, false);
  assert.ok(!JSON.stringify(device).includes('secret'), 'the password never reaches Gladys');
});

test('Windows shutdown command, with and without force', () => {
  const computer = computerFromFields(WINDOWS_FIELDS);
  assert.equal(buildShutdownCommand(computer), 'shutdown /s /f /t 0');
  assert.equal(buildShutdownCommand({ ...computer, force: false }), 'shutdown /s /t 0');
});

test('Linux shutdown command goes through sudo unless the user is root', () => {
  const computer = computerFromFields(LINUX_FIELDS);
  assert.equal(buildShutdownCommand(computer), 'sudo -n systemctl poweroff');
  assert.equal(buildShutdownCommand({ ...computer, username: 'root' }), 'systemctl poweroff');
});

test('a custom command replaces the default one', () => {
  const computer = computerFromFields({ ...WINDOWS_FIELDS, custom_command: ' shutdown /h ' });
  assert.equal(buildShutdownCommand(computer), 'shutdown /h');
  assert.equal(buildTestCommand(computer), 'whoami');
});

test('the Linux connection test checks the sudo rule', () => {
  assert.equal(buildTestCommand(computerFromFields(LINUX_FIELDS)), 'sudo -n -l systemctl poweroff');
  assert.equal(buildTestCommand(computerFromFields(WINDOWS_FIELDS)), 'whoami');
});

test('describeError explains every SSH failure in both languages', () => {
  for (const code of Object.values(SSH_ERROR_CODES)) {
    const message = describeError(
      new SshError(code, 'boom', { exitCode: 5, output: 'Access is denied.(5)' }),
    );
    assert.ok(message.en && message.fr, code);
  }
  assert.match(
    describeError(
      new SshError(SSH_ERROR_CODES.COMMAND, 'x', { exitCode: 5, output: 'Access is denied.' }),
    ).en,
    /exit code 5.*Access is denied/,
  );
});
