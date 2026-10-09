// -----------------------------------------------------------------------------
// Reachability probe: can a TCP connection be opened on the SSH port?
// Cheap enough for the widget, and needs no credentials.
// -----------------------------------------------------------------------------

import { connect } from 'node:net';

export function isPortOpen(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
