import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import {
  ContinuityLedger,
  observePageContinuity,
  withContinuityEvidence,
  type ContinuityOutcome,
} from '../ui/page-continuity.js';
import { BlockedError } from '../../harness/security.js';

const url = 'http://127.0.0.1:1234/#/groups';
test('new socket needs its own marker; delayed old ready/close cannot establish or clear it', () => {
  const ledger = new ContinuityLedger();
  const old = ledger.socket('open')!;
  ledger.frame('{"type":"scope_ready","startSeq":0}', old);
  ledger.socket('close', old);
  const fresh = ledger.socket('open')!;
  ledger.frame('{"type":"scope_ready","startSeq":99}', old);
  assert.throws(() => ledger.assertUnchanged(ledger.snapshot(url), url, true), /BLOCKED/);
  ledger.frame('{"type":"scope_ready","startSeq":100}', fresh);
  ledger.socket('close', old);
  assert.doesNotThrow(() => ledger.assertUnchanged(ledger.snapshot(url), url, true));
  ledger.socket('close', fresh);
  ledger.frame('{"type":"scope_ready","startSeq":101}', fresh);
  assert.throws(() => ledger.assertUnchanged(ledger.snapshot(url), url, true), /BLOCKED/);
});
function ready() {
  const ledger = new ContinuityLedger();
  ledger.socket('open');
  ledger.frame(Buffer.from('{"type":"scope_ready","startSeq":0}'));
  return ledger;
}

test('a stale socket acknowledgement arriving inside the action blocks both continuity modes', () => {
  let now = 1;
  const ledger = new ContinuityLedger(() => now);
  const old = ledger.socket('open')!;
  ledger.frame('{"type":"scope_ready","requestId":"old","startSeq":0}', old);
  ledger.socket('close', old);
  const current = ledger.socket('open')!;
  ledger.sent('{"type":"scope_marker","requestId":"current"}', current);
  ledger.frame('{"type":"scope_ready","requestId":"current","startSeq":7}', current);
  const before = ledger.snapshot(url);
  now = 21;
  ledger.sent('{"type":"scope_marker","requestId":"post-success"}', current);
  now = 22;
  ledger.frame('{"type":"scope_ready","requestId":"post-success","startSeq":7}', current);
  const sync = { requestAt: 10, responseAt: 20, requireReady: true };
  assert.doesNotThrow(() => ledger.assertUnchanged(before, url, true, sync));
  const strictBefore = ledger.snapshot(url);
  ledger.frame('{"type":"scope_ready","requestId":"late-old","startSeq":100}', old);
  assert.throws(() => ledger.assertUnchanged(strictBefore, url, true), /BLOCKED/);
  assert.throws(() => ledger.assertUnchanged(before, url, true, sync), /BLOCKED/);
  assert.equal(ledger.snapshot(url).scopeReady, strictBefore.scopeReady);
  assert.equal(ledger.snapshot(url).staleScopeReady, strictBefore.staleScopeReady + 1);
});

test('a route round trip cannot pass by ending at the same URL and document', () => {
  const ledger = ready(),
    before = ledger.snapshot(url);
  ledger.navigation('http://127.0.0.1:1234/#/accounts');
  ledger.navigation(url);
  assert.throws(() => ledger.assertUnchanged(before, url, true), /BLOCKED/);
});
test('same-route reload and reconnect/scope replacement cannot masquerade as recovery', () => {
  const ledger = ready(),
    before = ledger.snapshot(url);
  assert.throws(() => ledger.assertUnchanged(before, url, false), /BLOCKED/);
  ledger.socket('close');
  ledger.socket('open');
  ledger.frame('{"type":"scope_ready","startSeq":0}');
  assert.throws(() => ledger.assertUnchanged(before, url, true), /BLOCKED/);
  const sameSocket = ready(),
    previous = sameSocket.snapshot(url);
  sameSocket.frame('{"type":"scope_ready","startSeq":0}');
  assert.throws(() => sameSocket.assertUnchanged(previous, url, true), /BLOCKED/);
});
test('ordinary business updates are allowed; unknown initial scope never proves continuity', () => {
  const ledger = ready(),
    before = ledger.snapshot(url);
  for (const raw of [
    '{',
    'null',
    '[]',
    '{"type":"group_changed","seq":4}',
    '{"type":"message","seq":5}',
  ])
    ledger.frame(raw);
  assert.doesNotThrow(() => ledger.assertUnchanged(before, url, true));
  const unknown = new ContinuityLedger();
  unknown.frame('{"type":"scope_ready","startSeq":-1}');
  assert.throws(() => unknown.assertUnchanged(unknown.snapshot(url), url, true), /BLOCKED/);
});
test('observer is passive, ignores subframes, and disposes all page/socket listeners and handles', async () => {
  const page = new EventEmitter(),
    socket = new EventEmitter();
  const main = { url: () => url },
    handle = {
      dispose: async () => {
        disposed++;
      },
    };
  let disposed = 0;
  Object.assign(page, {
    mainFrame: () => main,
    url: () => url,
    evaluateHandle: async () => handle,
    evaluate: async () => true,
  });
  Object.assign(socket, { url: () => 'ws://127.0.0.1:1234/ws' });
  const observer = observePageContinuity(page as unknown as Page);
  page.emit('websocket', socket);
  socket.emit('framesent', { payload: '{"type":"scope_marker","requestId":"initial"}' });
  socket.emit('framereceived', { payload: Buffer.from('{"type":"scope_ready","startSeq":0}') });
  assert.equal(observer.ledger.scopeMarkers[0]?.requestId, 'initial');
  const baseline = await observer.capture();
  page.emit('framenavigated', { url: () => 'about:blank' });
  await observer.unchanged(baseline);
  await observer.dispose();
  assert.equal(disposed, 1);
  for (const event of ['framenavigated', 'websocket']) assert.equal(page.listenerCount(event), 0);
  for (const event of ['framesent', 'framereceived', 'close'])
    assert.equal(socket.listenerCount(event), 0);
});

function responseScope() {
  let now = 1;
  const ledger = new ContinuityLedger(() => now);
  const socket = ledger.socket('open')!;
  const sent = (at: number, requestId = 'after-response') => {
    now = at;
    ledger.sent(JSON.stringify({ type: 'scope_marker', requestId }), socket);
  };
  const reply = (at: number, requestId = 'after-response', startSeq = 7) => {
    now = at;
    ledger.frame(JSON.stringify({ type: 'scope_ready', requestId, startSeq }), socket);
  };
  sent(2, 'initial');
  reply(3, 'initial');
  const before = ledger.snapshot(url);
  const sync = { requestAt: 10, responseAt: 20 };
  return { ledger, socket, before, sync, sent, reply };
}

test('only explicit response mode admits a later same-socket matched marker with unchanged watermark', () => {
  const { ledger, before, sync, sent, reply } = responseScope();
  sent(21);
  reply(22);
  assert.throws(() => ledger.assertUnchanged(before, url, true), /BLOCKED/);
  assert.doesNotThrow(() =>
    ledger.assertUnchanged(before, url, true, { ...sync, requireReady: true }),
  );
  assert.equal(ledger.scopeMarkers[1]?.socketId, ledger.scopeReplies[1]?.socketId);
});

test('response mode cannot accept a marker sent before or at success, even when its ack arrives later', () => {
  for (const at of [9, 19, 20]) {
    const { ledger, before, sync, sent, reply } = responseScope();
    sent(at);
    reply(23);
    assert.throws(() => ledger.assertUnchanged(before, url, true, sync), /BLOCKED/);
  }
});

test('response mode requires actual paired identity, unchanged watermark, and unique marker/ack', () => {
  const scenarios = [
    (x: ReturnType<typeof responseScope>) => x.reply(22),
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21);
      x.reply(22, 'wrong');
    },
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21);
      x.reply(22, 'after-response', 8);
    },
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21, 'initial');
      x.reply(22, 'initial');
    },
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21);
      x.sent(22);
      x.reply(23);
    },
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21);
      x.reply(22);
      x.reply(23);
    },
    (x: ReturnType<typeof responseScope>) => {
      x.sent(21);
      x.ledger.frame('{"type":"scope_ready","requestId":"after-response"}', x.socket);
    },
  ];
  for (const arrange of scenarios) {
    const x = responseScope();
    arrange(x);
    assert.throws(() => x.ledger.assertUnchanged(x.before, url, true, x.sync), /BLOCKED/);
  }
});

test('a pending post-response marker cannot pass the final boundary; no marker needs no fabricated ack', () => {
  const x = responseScope();
  assert.doesNotThrow(() =>
    x.ledger.assertUnchanged(x.before, url, true, { ...x.sync, requireReady: true }),
  );
  x.sent(21);
  assert.doesNotThrow(() => x.ledger.assertUnchanged(x.before, url, true, x.sync));
  assert.throws(
    () => x.ledger.assertUnchanged(x.before, url, true, { ...x.sync, requireReady: true }),
    /BLOCKED/,
  );
  x.reply(23);
  assert.doesNotThrow(() =>
    x.ledger.assertUnchanged(x.before, url, true, { ...x.sync, requireReady: true }),
  );
});

test('response mode never excuses document/navigation/socket changes or invalid timing', () => {
  const x = responseScope();
  x.sent(21);
  x.reply(22);
  assert.throws(() => x.ledger.assertUnchanged(x.before, url, false, x.sync), /BLOCKED/);
  assert.throws(() => x.ledger.assertUnchanged(x.before, `${url}/other`, true, x.sync), /BLOCKED/);
  for (const responseAt of [NaN, Infinity, 9, 10])
    assert.throws(
      () => x.ledger.assertUnchanged(x.before, url, true, { ...x.sync, responseAt }),
      /BLOCKED/,
    );
  x.ledger.navigation(url);
  assert.throws(() => x.ledger.assertUnchanged(x.before, url, true, x.sync), /BLOCKED/);
  const fresh = responseScope();
  fresh.ledger.socket('close', fresh.socket);
  const next = fresh.ledger.socket('open')!;
  fresh.ledger.sent('{"type":"scope_marker","requestId":"after-response"}', next);
  fresh.ledger.frame('{"type":"scope_ready","requestId":"after-response","startSeq":7}', next);
  assert.throws(() => fresh.ledger.assertUnchanged(fresh.before, url, true, fresh.sync), /BLOCKED/);
});

test('post-response synchronization does not replace a real response/presentation failure with BLOCKED', async () => {
  const x = responseScope();
  x.sent(21);
  x.reply(22);
  const violation = new Error('successful response omitted the seeded sequence');
  let outcome: ContinuityOutcome | undefined;
  await assert.rejects(
    withContinuityEvidence(
      async () => x.ledger.assertUnchanged(x.before, url, true, x.sync),
      async (check) =>
        check('refresh-response', () => {
          throw violation;
        }),
      (value) => {
        outcome = value;
      },
    ),
    (error) => error === violation,
  );
  assert.equal(outcome?.outcome, 'confirmed-business-failure');
  assert.equal(outcome?.confirmedBusinessFailure?.message, violation.message);
});

test('confirmed cursor violation survives a later final navigation and retains both errors', async () => {
  const violation = new Error('old cursor requested after confirmation');
  const navigation = new BlockedError('later document replaced');
  let checks = 0;
  let outcome: ContinuityOutcome | undefined;
  await assert.rejects(
    withContinuityEvidence(
      async () => {
        if (++checks === 3) throw navigation;
      },
      async (check) =>
        check('cursor', () => {
          throw violation;
        }),
      (value) => {
        outcome = value;
      },
    ),
    (error) => error === violation,
  );
  assert.equal(outcome?.outcome, 'confirmed-business-failure');
  assert.equal(outcome?.confirmedBusinessFailure?.message, violation.message);
  assert.equal(outcome?.boundaryErrors[0]?.error.message, navigation.message);
});

test('title timeout spanning a scope replacement is evidence, not an independent product FAIL', async () => {
  const timeout = new Error('title expectation timed out');
  const scope = new BlockedError('scope_ready changed while waiting');
  let changed = false;
  let outcome: ContinuityOutcome | undefined;
  await assert.rejects(
    withContinuityEvidence(
      async () => {
        if (changed) throw scope;
      },
      async (check) =>
        check('title', () => {
          changed = true;
          throw timeout;
        }),
      (value) => {
        outcome = value;
      },
    ),
    (error) => error === scope,
  );
  assert.equal(outcome?.outcome, 'blocked-continuity');
  assert.equal(outcome?.confirmedBusinessFailure, undefined);
  assert.equal(outcome?.assertions[0]?.error?.message, timeout.message);
  assert.equal(outcome?.assertions[0]?.continuityAfter, false);
});

test('uncontaminated assertion failure remains FAIL, while final-only contamination blocks success', async () => {
  const violation = new Error('title never cleared in original scope');
  await assert.rejects(
    withContinuityEvidence(
      async () => {},
      async (check) =>
        check('title', () => {
          throw violation;
        }),
      () => {},
    ),
    (error) => error === violation,
  );
  const replaced = new BlockedError('navigation after otherwise successful operation');
  let calls = 0;
  await assert.rejects(
    withContinuityEvidence(
      async () => {
        if (++calls === 3) throw replaced;
      },
      async (check) => check('successful presentation', () => {}),
      () => {},
    ),
    (error) => error === replaced,
  );
});
