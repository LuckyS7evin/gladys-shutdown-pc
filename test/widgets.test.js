import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { SHUTDOWN_WIDGET, WIDGETS, refreshWidgets } from '../src/widgets.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { createTestService, WINDOWS_FIELDS } from './helpers/fixtures.js';

const widget = WIDGETS[SHUTDOWN_WIDGET];

const getContent = (service, settings) =>
  widget.get(service, { settings, language: 'fr', units: 'metric' });

test('the content of a computer is rendered exactly as sent, reachable or not', async () => {
  for (const reachable of [true, false]) {
    const ctx = await createTestService({ reachable });
    try {
      const computer = await ctx.service.add(WINDOWS_FIELDS);
      const content = await getContent(ctx.service, { device: ctx.externalIdOf(computer) });
      // [] = nothing the core would drop, truncate or trim to the budget.
      assert.deepEqual(validateWidgetContent(content), []);
      const status = content.components.find((c) => c.type === 'status');
      assert.equal(status.items[0].color, reachable ? 'success' : 'neutral');
    } finally {
      await ctx.cleanup();
    }
  }
});

test('the empty states are valid contents too', async () => {
  const ctx = await createTestService();
  try {
    for (const settings of [{}, { device: 'ext:shutdown-pc:computer:gone' }]) {
      assert.deepEqual(validateWidgetContent(await getContent(ctx.service, settings)), []);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('the shutdown button asks for confirmation and shuts the computer down', async () => {
  const ctx = await createTestService();
  try {
    const computer = await ctx.service.add(WINDOWS_FIELDS);
    const content = await getContent(ctx.service, { device: ctx.externalIdOf(computer) });
    const button = content.components.find((c) => c.type === 'button');
    assert.equal(button.style, 'danger');
    assert.equal(button.action.confirm, true);

    const toast = await widget.action(ctx.service, {
      actionKey: button.action.key,
      params: button.action.params,
      settings: {},
    });
    assert.match(toast.fr, /Ordre d'extinction envoyé à Office PC/);
    assert.ok(toast.en.length <= 200 && toast.fr.length <= 200, 'toasts are capped');
    assert.equal(ctx.runCommand.calls.length, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const ctx = await createTestService();
  try {
    await assert.rejects(
      widget.action(ctx.service, { actionKey: 'unknown', params: {}, settings: {} }),
      /Unknown widget action/,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('refreshWidgets nudges every widget', () => {
  const fake = createFakeGladys();
  refreshWidgets(fake);
  assert.deepEqual(fake.widgetRefreshes, Object.keys(WIDGETS));
});
