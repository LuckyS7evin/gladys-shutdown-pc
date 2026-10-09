// -----------------------------------------------------------------------------
// Target computers: validation, Gladys device payload, shutdown commands.
//
// One computer = one Gladys device carrying ONE push button feature
// ("Shut down"): pressing it from a dashboard, a scene "control a device"
// action, the dedicated scene action or the widget runs the shutdown.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { SSH_ERROR_CODES } from './ssh.js';

export const DEVICE_TYPE = 'computer';
export const SHUTDOWN_FEATURE = 'shutdown';

export const OS = { WINDOWS: 'windows', LINUX: 'linux' };

export const DEFAULT_PORT = 22;

// A thrown error reaches the user as ONE string (the SDK acks
// `error: err.message`): carry both languages in it, and keep the
// translations for the callers that can return a multi-language object.
export function bilingual(message) {
  return `${message.en} / ${message.fr}`;
}

// Raised on an invalid form.
export class ValidationError extends Error {
  constructor(message) {
    super(bilingual(message));
    this.name = 'ValidationError';
    this.translations = message;
  }
}

const HOST_PATTERN = /^[A-Za-z0-9._:-]+$/;
const USERNAME_PATTERN = /^[^\s"'`;|&<>$]+$/;
const MAX_TEXT_LENGTH = 255;

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Validate the `add_computer` / `update_computer` form and build the stored
 * computer. `existing` is the computer being updated: its id, password and
 * history stay unless the form changes them.
 */
export function computerFromFields(fields = {}, existing = undefined) {
  const name = text(fields.name);
  const host = text(fields.host);
  const username = text(fields.username);
  const os = text(fields.os) || OS.WINDOWS;
  const port = fields.port === undefined || fields.port === '' ? DEFAULT_PORT : Number(fields.port);
  const customCommand = text(fields.custom_command);

  if (!name || name.length > MAX_TEXT_LENGTH) {
    throw new ValidationError({ en: 'The name is required.', fr: 'Le nom est obligatoire.' });
  }
  if (!host || host.length > MAX_TEXT_LENGTH || !HOST_PATTERN.test(host)) {
    throw new ValidationError({
      en: 'Enter a valid host name or IP address.',
      fr: "Saisissez un nom d'hôte ou une adresse IP valide.",
    });
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError({
      en: 'The SSH port must be between 1 and 65535.',
      fr: 'Le port SSH doit être compris entre 1 et 65535.',
    });
  }
  if (!username || username.length > MAX_TEXT_LENGTH || !USERNAME_PATTERN.test(username)) {
    throw new ValidationError({
      en: 'Enter a valid user name.',
      fr: "Saisissez un nom d'utilisateur valide.",
    });
  }
  if (!Object.values(OS).includes(os)) {
    throw new ValidationError({
      en: 'Unknown operating system.',
      fr: "Système d'exploitation inconnu.",
    });
  }
  if (customCommand.length > 1000) {
    throw new ValidationError({
      en: 'The custom command is too long.',
      fr: 'La commande personnalisée est trop longue.',
    });
  }

  // A blank password keeps the stored one (secret fields are never sent back
  // to the form, so the user cannot see it), unless asked to remove it.
  const newPassword = typeof fields.password === 'string' ? fields.password : '';
  let password = newPassword || existing?.password || '';
  if (asBoolean(fields.clear_password, false) && !newPassword) {
    password = '';
  }

  const computer = {
    id: existing?.id ?? randomUUID(),
    name,
    host,
    port,
    username,
    os,
    force: asBoolean(fields.force, true),
    custom_command: customCommand,
  };
  if (password) {
    computer.password = password;
  }
  // No host_key: an update re-pins the key on the next connection, which is
  // also how a reinstalled computer gets trusted again.
  return computer;
}

/** External ids of a computer's device, built from its stable random id. */
export function computerIds(gladys, computer) {
  return gladys.externalIds(DEVICE_TYPE, computer.id);
}

export function findComputerByExternalId(gladys, computers, externalId) {
  return computers.find((computer) => computerIds(gladys, computer).device === externalId);
}

/** Discovery payload of a computer. */
export function buildDevice(gladys, computer) {
  const ids = computerIds(gladys, computer);
  return {
    name: computer.name,
    external_id: ids.device,
    // Shown in the device page; never the password.
    params: [
      { name: 'HOST', value: `${computer.host}:${computer.port}` },
      { name: 'OS', value: computer.os },
      { name: 'USER', value: computer.username },
    ],
    features: [
      {
        name: 'Shut down',
        external_id: ids.feature(SHUTDOWN_FEATURE),
        category: DEVICE_FEATURE_CATEGORIES.BUTTON,
        type: DEVICE_FEATURE_TYPES.BUTTON.PUSH,
        read_only: false,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 1,
      },
    ],
  };
}

/** The command that powers the computer off. */
export function buildShutdownCommand(computer) {
  if (computer.custom_command) {
    return computer.custom_command;
  }
  if (computer.os === OS.WINDOWS) {
    // /f closes the running applications without asking: otherwise a single
    // "unsaved document" dialog blocks the shutdown until someone clicks.
    return computer.force ? 'shutdown /s /f /t 0' : 'shutdown /s /t 0';
  }
  // -n: fail instead of waiting for a sudo password nobody can type.
  return computer.username === 'root' ? 'systemctl poweroff' : 'sudo -n systemctl poweroff';
}

/**
 * The harmless command of the connection test. On Linux it also checks that
 * sudo would let the user power off without a password.
 */
export function buildTestCommand(computer) {
  if (computer.os === OS.LINUX && !computer.custom_command && computer.username !== 'root') {
    return 'sudo -n -l systemctl poweroff';
  }
  return 'whoami';
}

const SSH_ERROR_MESSAGES = {
  [SSH_ERROR_CODES.AUTH]: {
    en: 'authentication refused: check the user, the password or the public key on the computer',
    fr: "authentification refusée : vérifiez l'utilisateur, le mot de passe ou la clé publique sur l'ordinateur",
  },
  [SSH_ERROR_CODES.TIMEOUT]: {
    en: 'no answer: the computer is off, asleep or the SSH server is not running',
    fr: "pas de réponse : l'ordinateur est éteint, en veille, ou le serveur SSH n'est pas démarré",
  },
  [SSH_ERROR_CODES.UNREACHABLE]: {
    en: 'unreachable: check the address, the port and the firewall',
    fr: "injoignable : vérifiez l'adresse, le port et le pare-feu",
  },
  [SSH_ERROR_CODES.HOST_KEY]: {
    en: 'the SSH host key changed: if the computer was reinstalled, use "Edit a computer" to trust it again',
    fr: "la clé d'hôte SSH a changé : si l'ordinateur a été réinstallé, utilisez « Modifier un ordinateur » pour lui refaire confiance",
  },
};

/** Bilingual, user-facing reason of a failure (never contains a secret). */
export function describeError(err) {
  if (err instanceof ValidationError) {
    return err.translations;
  }
  if (err?.code === SSH_ERROR_CODES.COMMAND) {
    const output = (err.output || '').slice(0, 120);
    return {
      en: `the command failed (exit code ${err.exitCode})${output ? `: ${output}` : ''}`,
      fr: `la commande a échoué (code ${err.exitCode})${output ? ` : ${output}` : ''}`,
    };
  }
  return (
    SSH_ERROR_MESSAGES[err?.code] ?? {
      en: `unexpected error: ${err?.message ?? err}`,
      fr: `erreur inattendue : ${err?.message ?? err}`,
    }
  );
}
