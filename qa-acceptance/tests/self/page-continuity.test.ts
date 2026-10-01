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
  socket.emit('framereceived', { payload: Buffer.from('{"type":"scope_ready","startSeq":0}') });
  const baseline = await observer.capture();
  page.emit('framenavigated', { url: () => 'about:blank' });
  await observer.unchanged(baseline);
  await observer.dispose();
  assert.equal(disposed, 1);
  for (const event of ['framenavigated', 'websocket']) assert.equal(page.listenerCount(event), 0);
  for (const event of ['framereceived', 'close']) assert.equal(socket.listenerCount(event), 0);
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
