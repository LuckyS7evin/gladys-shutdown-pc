import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fingerprint, runCommand, SSH_ERROR_CODES } from '../src/ssh.js';

const HOST_KEY = Buffer.from('fake-host-key');

/**
 * Fake ssh2 Client. `scenario(client)` runs once the client is connecting and
 * drives it: verify the host key, emit 'ready', answer exec, drop...
 */
function fakeClient(scenario) {
  const instances = [];
  class FakeClient extends EventEmitter {
    constructor() {
      super();
      instances.push(this);
      this.ended = false;
    }

    connect(cfg) {
      this.cfg = cfg;
      setImmediate(() => scenario(this));
    }

    // Mirrors ssh2: the host verifier decides whether the handshake goes on.
    handshake() {
      if (!this.cfg.hostVerifier(HOST_KEY)) {
        this.emit('error', Object.assign(new Error('Host denied'), { level: 'client-socket' }));
        return false;
      }
      return true;
    }

    exec(command, cb) {
      this.command = command;
      const stream = new EventEmitter();
      stream.stderr = new EventEmitter();
      this.stream = stream;
      cb(undefined, stream);
    }

    end() {
      this.ended = true;
    }
  }
  FakeClient.instances = instances;
  return FakeClient;
}

const TARGET = { host: '192.168.1.20', port: 22, username: 'john' };
const options = (Client, extra = {}) => ({ privateKey: 'KEY', timeoutMs: 1000, Client, ...extra });

test('runs the command and returns its exit code and output', async () => {
  const Client = fakeClient((client) => {
    if (!client.handshake()) return;
    client.emit('ready');
    client.stream.emit('data', 'office\\john\r\n');
    client.stream.emit('close', 0);
  });
  const result = await runCommand(TARGET, 'whoami', options(Client));
  assert.deepEqual(result, {
    code: 0,
    stdout: 'office\\john\r\n',
    stderr: '',
    disconnected: false,
  });
  const [client] = Client.instances;
  assert.equal(client.command, 'whoami');
  assert.equal(client.ended, true, 'the session is closed');
});

test('tries the key first, and the password only when one is set', async () => {
  const Client = fakeClient((client) => {
    client.emit('ready');
    client.stream.emit('close', 0);
  });
  await runCommand(TARGET, 'whoami', options(Client));
  await runCommand({ ...TARGET, password: 'secret' }, 'whoami', options(Client));
  const [keyOnly, withPassword] = Client.instances;
  assert.deepEqual(keyOnly.cfg.authHandler, ['publickey']);
  assert.equal(keyOnly.cfg.password, undefined);
  assert.deepEqual(withPassword.cfg.authHandler, ['publickey', 'password', 'keyboard-interactive']);
});

test('answers keyboard-interactive prompts with the password', async () => {
  let answers;
  const Client = fakeClient((client) => {
    client.emit('keyboard-interactive', '', '', '', [{ prompt: 'Password:' }], (a) => {
      answers = a;
    });
    client.emit('ready');
    client.stream.emit('close', 0);
  });
  await runCommand({ ...TARGET, password: 'secret' }, 'whoami', options(Client));
  assert.deepEqual(answers, ['secret']);
});

test('reports the host key seen on a first connection, so it can be pinned', async () => {
  const Client = fakeClient((client) => {
    client.handshake();
    client.emit('ready');
    client.stream.emit('close', 0);
  });
  let pinned;
  await runCommand(TARGET, 'whoami', options(Client, { onHostKey: (fp) => (pinned = fp) }));
  assert.equal(pinned, fingerprint(HOST_KEY));
  assert.match(pinned, /^SHA256:[A-Za-z0-9+/]+$/);
});

test('refuses a host whose key changed', async () => {
  const Client = fakeClient((client) => {
    if (client.handshake()) {
      client.emit('ready');
    }
  });
  await assert.rejects(
    runCommand({ ...TARGET, host_key: 'SHA256:another' }, 'whoami', options(Client)),
    { code: SSH_ERROR_CODES.HOST_KEY },
  );
});

test('classifies authentication, refused connection and timeout errors', async () => {
  const failWith = (err) => fakeClient((client) => client.emit('error', err));
  await assert.rejects(
    runCommand(
      TARGET,
      'whoami',
      options(failWith(Object.assign(new Error('x'), { level: 'client-authentication' }))),
    ),
    { code: SSH_ERROR_CODES.AUTH },
  );
  await assert.rejects(
    runCommand(
      TARGET,
      'whoami',
      options(failWith(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))),
    ),
    { code: SSH_ERROR_CODES.UNREACHABLE },
  );
  await assert.rejects(
    runCommand(
      TARGET,
      'whoami',
      options(failWith(Object.assign(new Error('x'), { level: 'client-timeout' }))),
    ),
    { code: SSH_ERROR_CODES.TIMEOUT },
  );
});

test('times out when the computer never answers', async () => {
  const Client = fakeClient(() => {});
  await assert.rejects(runCommand(TARGET, 'whoami', options(Client, { timeoutMs: 20 })), {
    code: SSH_ERROR_CODES.TIMEOUT,
  });
});

test('a session dropped by a powering-off computer counts as success when tolerated', async () => {
  const Client = fakeClient((client) => {
    client.emit('ready');
    client.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  });
  const result = await runCommand(
    TARGET,
    'shutdown /s /t 0',
    options(Client, { tolerateDisconnect: true }),
  );
  assert.equal(result.disconnected, true);
  assert.equal(result.code, null);
});

test('a dropped session is an error when not tolerated', async () => {
  const Client = fakeClient((client) => {
    client.emit('ready');
    client.emit('close');
  });
  await assert.rejects(runCommand(TARGET, 'whoami', options(Client)), {
    code: SSH_ERROR_CODES.UNKNOWN,
  });
});

test('a dropped connection BEFORE the command started is never a success', async () => {
  const Client = fakeClient((client) => {
    client.emit('error', Object.assign(new Error('x'), { code: 'EHOSTUNREACH' }));
  });
  await assert.rejects(
    runCommand(TARGET, 'shutdown /s /t 0', options(Client, { tolerateDisconnect: true })),
    { code: SSH_ERROR_CODES.UNREACHABLE },
  );
});
