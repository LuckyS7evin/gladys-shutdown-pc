// -----------------------------------------------------------------------------
// The integration's own SSH key pair.
//
// Generated once (ed25519) and kept in /data, so the user only has to paste
// the public key into the target computer's authorized keys: no password of
// the computer needs to be stored. The private key never leaves the container
// and is never logged.
// -----------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ssh2 from 'ssh2';

const PRIVATE_KEY_FILE = 'id_ed25519';
const PUBLIC_KEY_FILE = 'id_ed25519.pub';
const KEY_COMMENT = 'gladys-shutdown-pc';

/**
 * Load the key pair from `dir`, generating it on first use.
 * @returns {Promise<{ privateKey: string, publicKey: string }>}
 */
export async function loadOrCreateKeyPair(dir) {
  const privatePath = join(dir, PRIVATE_KEY_FILE);
  const publicPath = join(dir, PUBLIC_KEY_FILE);
  try {
    const [privateKey, publicKey] = await Promise.all([
      readFile(privatePath, 'utf8'),
      readFile(publicPath, 'utf8'),
    ]);
    return { privateKey, publicKey: publicKey.trim() };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  const pair = ssh2.utils.generateKeyPairSync('ed25519', { comment: KEY_COMMENT });
  await mkdir(dir, { recursive: true });
  await writeFile(privatePath, pair.private, { mode: 0o600 });
  await writeFile(publicPath, `${pair.public.trim()}\n`, { mode: 0o644 });
  return { privateKey: pair.private, publicKey: pair.public.trim() };
}
