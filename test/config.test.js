import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces a numeric string coming from a form', () => {
  assert.equal(normalizeConfig({ connect_timeout_seconds: '15' }).connect_timeout_seconds, 15);
});

test('normalizeConfig clamps the timeout to the manifest bounds', () => {
  assert.equal(normalizeConfig({ connect_timeout_seconds: 1 }).connect_timeout_seconds, 3);
  assert.equal(normalizeConfig({ connect_timeout_seconds: 600 }).connect_timeout_seconds, 30);
});

test('normalizeConfig falls back to the default for a garbage timeout', () => {
  assert.equal(
    normalizeConfig({ connect_timeout_seconds: 'abc' }).connect_timeout_seconds,
    DEFAULT_CONFIG.connect_timeout_seconds,
  );
});
