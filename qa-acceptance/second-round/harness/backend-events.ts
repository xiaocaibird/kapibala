import WebSocket from 'ws';
import { BlockedError } from '../../harness/security.js';
import type { QaEnvironment } from '../../harness/environment.js';
/** Public WS-only observation, opened before the action whose notification is asserted. */
export async function observeBackendEvents(qa: QaEnvironment) {
  const events: { seq?: number; type?: string; success?: boolean; payload?: Record<string, unknown> }[] = [];
  const ws = new WebSocket(qa.api.baseUrl.replace(/^http/, 'ws') + '/ws');
  let fault: unknown;
  ws.on('message', (raw) => { try { events.push(JSON.parse(raw.toString())); } catch (e) { fault = e; } });
  ws.on('error', (error) => { fault = error; });
  const wait = async (predicate: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    do {
      if (fault) throw new BlockedError(`Public WS observation failed: ${String(fault)}`);
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 20));
    } while (performance.now() < end);
    throw new BlockedError('Required public WS observation was not received in finite sampling window');
  };
  try {
    await wait(() => ws.readyState === WebSocket.OPEN, 5000);
    ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
    await wait(() => events.some((e) => e.type === 'auth' && e.success === true), 5000);
  } catch (error) { ws.terminate(); throw error; }
  return { events, close: () => ws.terminate(),
    waitFor: async (predicate: (e: typeof events[number]) => boolean, ms = 5000) => {
      await wait(() => events.some(predicate), ms); return events.find(predicate)!;
    },
  };
}
