// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// `shutdown_pc`: one widget instance per computer, chosen in the widget
// settings (`"source": "devices"`). It shows whether the SSH port answers and
// offers a "Shut down" button that asks for confirmation before sending.
//
// Each entry of WIDGETS is keyed by the widget `key` of the manifest and
// exposes get(service, { settings }) and action(service, { actionKey, params }),
// registered by index.js with onWidgetGet / onWidgetAction.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'widgets' });

export const SHUTDOWN_WIDGET = 'shutdown_pc';

export const SHUTDOWN_WIDGET_ACTIONS = { SHUTDOWN: 'shutdown' };

function emptyState(text) {
  return { ttl_seconds: 300, components: [{ type: 'text', variant: 'body', text }] };
}

export const WIDGETS = {
  [SHUTDOWN_WIDGET]: {
    async get(service, { settings = {} }) {
      logger.debug(`onWidgetGet <- ${SHUTDOWN_WIDGET} (${settings.device})`);
      if (!settings.device) {
        return emptyState({
          en: 'Choose a computer in the widget settings.',
          fr: 'Choisissez un ordinateur dans les réglages du widget.',
        });
      }
      const computer = service.find(settings.device);
      if (!computer) {
        return emptyState({
          en: 'This computer no longer exists in the integration.',
          fr: "Cet ordinateur n'existe plus dans l'intégration.",
        });
      }
      const reachable = await service.isReachable(computer);
      return {
        // Reachability changes on its own (someone turns the computer on):
        // re-probe every minute, a TCP connect is cheap.
        ttl_seconds: 60,
        components: [
          { type: 'text', variant: 'heading', text: computer.name.slice(0, 40) },
          {
            type: 'status',
            items: [
              {
                label: { en: 'Status', fr: 'État' },
                icon: 'monitor',
                value: reachable
                  ? { en: 'Reachable', fr: 'Joignable' }
                  : { en: 'Unreachable', fr: 'Injoignable' },
                color: reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
              },
              {
                label: { en: 'Address', fr: 'Adresse' },
                icon: 'wifi',
                value: computer.host.slice(0, 40),
                color: WIDGET_COLORS.NEUTRAL,
              },
            ],
          },
          // `params` are declared HERE and sent back as-is: the handler never
          // receives user input (a dashboard can hang on a public wall).
          {
            type: 'button',
            label: { en: 'Shut down', fr: 'Éteindre' },
            icon: 'power',
            style: 'danger',
            action: {
              key: SHUTDOWN_WIDGET_ACTIONS.SHUTDOWN,
              params: { device: settings.device },
              confirm: true,
            },
          },
        ],
      };
    },

    // Resolve a toast (≤ 200 characters); throwing shows the error instead.
    async action(service, { actionKey, params }) {
      logger.info(`onWidgetAction <- ${SHUTDOWN_WIDGET}.${actionKey}`);
      if (actionKey !== SHUTDOWN_WIDGET_ACTIONS.SHUTDOWN) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const computer = await service.shutdown(params.device);
      const name = computer.name.slice(0, 60);
      return {
        en: `Shutdown order sent to ${name}.`,
        fr: `Ordre d'extinction envoyé à ${name}.`,
      };
    },
  },
};

/** Ask the core to re-pull every widget now (after a computer changed). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
