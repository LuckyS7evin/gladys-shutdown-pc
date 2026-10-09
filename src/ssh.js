// -----------------------------------------------------------------------------
// Minimal SSH client: open a session, run ONE command, close.
//
// SSH reaches both Windows (built-in OpenSSH Server) and Linux without any
// agent to install, and plain TCP unicast crosses the bridge network the
// integration container runs on.
//
// Host key pinning (trust on first use): the first successful connection
// records the server key fingerprint, later connections refuse another key, so
// a machine impersonating the computer never receives the password.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import ssh2 from 'ssh2';

export const SSH_ERROR_CODES = {
  AUTH: 'AUTH',
  TIMEOUT: 'TIMEOUT',
  UNREACHABLE: 'UNREACHABLE',
  HOST_KEY: 'HOST_KEY',
  COMMAND: 'COMMAND',
  UNKNOWN: 'UNKNOWN',
};

export class SshError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SshError';
    this.code = code;
    Object.assign(this, details);
  }
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
]);

/** SHA256 fingerprint of a raw host key, in the `ssh-keygen -l` format. */
export function fingerprint(rawKey) {
  return `SHA256:${createHash('sha256').update(rawKey).digest('base64').replace(/=+$/, '')}`;
}

function classify(err, hostKeyRejected) {
  if (err instanceof SshError) {
    return err;
  }
  if (hostKeyRejected) {
    return new SshError(SSH_ERROR_CODES.HOST_KEY, 'Host key mismatch');
  }
  if (err.level === 'client-authentication') {
    return new SshError(SSH_ERROR_CODES.AUTH, 'Authentication failed');
  }
  if (err.level === 'client-timeout' || err.code === 'ETIMEDOUT') {
    return new SshError(SSH_ERROR_CODES.TIMEOUT, 'Connection timed out');
  }
  if (UNREACHABLE_CODES.has(err.code)) {
    return new SshError(SSH_ERROR_CODES.UNREACHABLE, `Host unreachable (${err.code})`);
  }
  return new SshError(SSH_ERROR_CODES.UNKNOWN, err.message);
}

/**
 * Run one command on a computer over SSH.
 *
 * @param {object} target { host, port, username, password?, host_key? }
 * @param {string} command
 * @param {object} options
 * @param {string} [options.privateKey] the integration's private key
 * @param {number} options.timeoutMs connection AND overall timeout
 * @param {boolean} [options.tolerateDisconnect] a shutdown command may kill
 *   the session before it reports: once the command started, a dropped
 *   connection counts as success
 * @param {(fingerprint: string) => void} [options.onHostKey] called with the
 *   server fingerprint when the target has none pinned yet
 * @param {Function} [options.Client] injectable for tests
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, disconnected: boolean }>}
 */
export function runCommand(target, command, options) {
  const {
    privateKey,
    timeoutMs,
    tolerateDisconnect = false,
    onHostKey,
    Client = ssh2.Client,
  } = options;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let started = false;
    let settled = false;
    let hostKeyRejected = false;
    let seenFingerprint;
    let stdout = '';
    let stderr = '';

    const finish = (err, result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        conn.end();
      } catch {
        // already closed
      }
      if (err) {
        reject(classify(err, hostKeyRejected));
        return;
      }
      if (seenFingerprint && !target.host_key) {
        onHostKey?.(seenFingerprint);
      }
      resolve(result);
    };

    const droppedAfterStart = () =>
      finish(null, { code: null, stdout, stderr, disconnected: true });

    const timer = setTimeout(() => {
      if (started && tolerateDisconnect) {
        droppedAfterStart();
      } else {
        finish(new SshError(SSH_ERROR_CODES.TIMEOUT, 'Connection timed out'));
      }
    }, timeoutMs);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          finish(err);
          return;
        }
        started = true;
        stream.on('data', (chunk) => {
          stdout += chunk;
        });
        stream.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        stream.on('close', (code) => {
          finish(null, { code: code ?? null, stdout, stderr, disconnected: code == null });
        });
      });
    });

    // Windows OpenSSH may offer the password as keyboard-interactive only.
    conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, reply) => {
      reply(prompts.map(() => target.password ?? ''));
    });

    conn.on('error', (err) => {
      if (started && tolerateDisconnect) {
        droppedAfterStart();
      } else {
        finish(err);
      }
    });

    conn.on('close', () => {
      if (started && tolerateDisconnect) {
        droppedAfterStart();
      } else {
        finish(new SshError(SSH_ERROR_CODES.UNKNOWN, 'Connection closed'));
      }
    });

    // Key first (nothing secret to send), then the password if one is set.
    const authHandler = [];
    if (privateKey) {
      authHandler.push('publickey');
    }
    if (target.password) {
      authHandler.push('password', 'keyboard-interactive');
    }

    try {
      conn.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password || undefined,
        privateKey: privateKey || undefined,
        tryKeyboard: Boolean(target.password),
        authHandler,
        readyTimeout: timeoutMs,
        hostVerifier: (rawKey) => {
          seenFingerprint = fingerprint(rawKey);
          if (target.host_key && target.host_key !== seenFingerprint) {
            hostKeyRejected = true;
            return false;
          }
          return true;
        },
      });
    } catch (err) {
      finish(err);
    }
  });
}
