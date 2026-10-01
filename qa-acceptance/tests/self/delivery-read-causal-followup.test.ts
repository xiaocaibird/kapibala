import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BlockedError } from '../../harness/security.js';
import type { RuntimeEvent } from '../../harness/runtime-observation.js';
import {
  assertReadCausalEvidence,
  assertAgentSaveBoundary,
  type ReadIdentity,
  type CausalPgSample,
} from '../support/delivery-read-causal-followup.js';
import type { PgActivity } from '../support/delivery-read-observation.js';

const identity: ReadIdentity = {
  groupId: 'group',
  runId: 'run',
  stepId: 'run:1',
  toolUseId: 'send',
  attemptId: 'execution',
  clientMsgId: 'message',
  clockDomain: 'original-process',
};
const sql = 'SELECT id FROM public.messages WHERE client_msg_id=$1';
const hash = createHash('sha256').update(sql).digest('hex');
const backend = { pid: 41, backendStarted: 'server-start' };
const owner = {
  database: `qa_${'a'.repeat(24)}`,
  lockerPid: 40,
  lockerStart: 'locker-start',
  relationOid: 50,
};
function events(mode: 'commit' | 'rollback' = 'commit'): RuntimeEvent[] {
  let seq = 0;
  const event = (kind: string, extra: Record<string, unknown> = {}) =>
    ({
      ...identity,
      seq: ++seq,
      sourceSeq: seq,
      at: '2026-10-02T00:00:00.000Z',
      kind,
      applicationPid: 100,
      instancePid: 100,
      clockUnit: 'ms',
      monotonicMs: [seq, seq],
      correlation: {
        kind: 'tool-wait',
        groupId: identity.groupId,
        runId: identity.runId,
        toolUseId: 'all-run-steps',
      },
      ...extra,
    }) as RuntimeEvent;
  const read = (kind: string, extra: Record<string, unknown> = {}) =>
    event(kind, {
      readAttemptId: 'read',
      backend,
      ...extra,
    });
  const query = (kind: string, id: string, role: string, extra: Record<string, unknown> = {}) =>
    read(kind, {
      queryAttemptId: id,
      queryRole: role,
      querySha256: role === 'delivery-select' ? hash : 'b'.repeat(64),
      queryWindowMs: [seq + 1, seq + 1],
      ...extra,
    });
  const result = { clientMsgId: identity.clientMsgId, deliveryStatus: 'sent' };
  const prefix = [
    read('delivery-read-attempt-started'),
    read('delivery-read-client-acquired'),
    read('delivery-read-backend-identified'),
    query('delivery-read-query-started', 'read:1', 'delivery-select'),
    query('delivery-read-query-failed', 'read:1', 'delivery-select', {
      sqlState: '55P03',
      ownReadTimeout: true,
    }),
    query('delivery-read-query-started', 'read:2', 'rollback'),
    query('delivery-read-query-returned', 'read:2', 'rollback'),
    read('delivery-read-client-released', { disposition: 'returned-to-pool' }),
    event('send-tool-result-returned', { result, errorCode: null }),
    event('send-tool-history-save-started'),
  ];
  const tx = (phase: string, edge: string, extra: Record<string, unknown> = {}) =>
    event('agent-step-save-transaction', {
      transactionAttemptId: 'save-transaction',
      backendPid: 42,
      phase,
      edge,
      windowMs: [seq + 1, seq + 1],
      ...extra,
    });
  const pair = (phase: string, edge: string, extra: Record<string, unknown> = {}) => {
    const called = tx(phase, 'called');
    return [called, tx(phase, edge, { windowMs: [called.sourceSeq as number, seq + 1], ...extra })];
  };
  return [
    ...prefix,
    ...pair('begin', 'returned'),
    ...pair('step-result-update', 'returned'),
    ...pair(
      'run-history-update',
      mode === 'commit' ? 'returned' : 'rejected',
      mode === 'rollback' ? { sqlState: 'P0001' } : {},
    ),
    ...pair(mode, 'returned'),
    ...(mode === 'commit'
      ? [
          event('send-tool-history-committed', {
            commitBoundary: 'outer-commit-confirmed',
            result,
          }),
          event('send-tool-history-save-returned'),
        ]
      : [event('send-tool-history-save-failed')]),
  ];
}
function lockSample(all: RuntimeEvent[]): CausalPgSample {
  const row: PgActivity = {
    pid: 41,
    datname: owner.database,
    usename: 'qa',
    application_name: '',
    backend_start: backend.backendStarted,
    xact_start: 'xact',
    query_start: 'query',
    state: 'active',
    wait_event_type: 'Lock',
    wait_event: 'relation',
    query: sql,
    blockers: [40],
    relation_locks: [{ relation: 50, mode: 'AccessShareLock', granted: false }],
  };
  return {
    before: all.slice(0, 4),
    after: all.slice(0, 4),
    pg: {
      beforeMs: 200,
      afterMs: 201,
      at: 'now',
      database: owner.database,
      activities: [
        {
          ...row,
          pid: 40,
          backend_start: owner.lockerStart,
          application_name: 'qa-int-read-locker',
          relation_locks: [{ relation: 50, mode: 'AccessExclusiveLock', granted: true }],
        },
        row,
      ],
    },
  };
}
const input = (all = events(), sample = lockSample(all)) => ({
  events: all,
  identity,
  samples: [sample],
  lockOwner: owner,
});

test('original live query and independently sampled actual locker establish one causal chain', () => {
  const proof = assertReadCausalEvidence(input());
  assert.equal(proof.confirmedOriginalReadCleanup.length, 1);
  assert.equal(proof.confirmedOriginalReadCleanup[0]!.queryAttemptId, 'read:1');
});
test('PID alone cannot join a recycled backend or unrelated SQL', () => {
  for (const wrong of [{ backend_start: 'recycled' }, { query: sql + ' ' }, { blockers: [99] }]) {
    const all = events(),
      sample = lockSample(all);
    Object.assign(sample.pg.activities[1]!, wrong);
    assert.throws(() => assertReadCausalEvidence(input(all, sample)), BlockedError);
  }
});
test('a SELECT beginning after the independent PG observation cannot establish attribution', () => {
  const all = events(),
    sample = lockSample(all);
  sample.before = all.slice(0, 3);
  assert.throws(() => assertReadCausalEvidence(input(all, sample)), BlockedError);
});
test('two indistinguishable original live queries block rather than guessing from identical SQL', () => {
  const all = events(),
    sample = lockSample(all);
  sample.before = [...sample.before, { ...all[3]!, sourceSeq: 3.5, queryAttemptId: 'other-query' }];
  assert.throws(() => assertReadCausalEvidence(input(all, sample)), BlockedError);
});
test('called ROLLBACK without actual returned acknowledgement never certifies cleanup', () => {
  const all = events().filter((event) => event.sourceSeq !== 7);
  assert.throws(() => assertReadCausalEvidence(input(all)), BlockedError);
});
test('a query finishing across the PG sample is ambiguous with same-SQL backend reuse', () => {
  const all = events(),
    sample = lockSample(all);
  sample.after = all.slice(0, 5);
  assert.throws(() => assertReadCausalEvidence(input(all, sample)), BlockedError);
});
test('connection destruction or later idle cannot substitute for original reusable release', () => {
  const all = events();
  all[7]!.disposition = 'destroy-requested';
  assert.throws(() => assertReadCausalEvidence(input(all)), assert.AssertionError);
});
test('source ordering and actual execution identity remain mandatory', () => {
  const all = events();
  all[6]!.clockDomain = 'other-process';
  assert.throws(() => assertReadCausalEvidence(input(all)), BlockedError);
});
test('actual SQLSTATE is a fact and a mismatched injected failure is not a PASS', () => {
  const all = events();
  all[4]!.sqlState = '57014';
  assert.throws(() => assertReadCausalEvidence(input(all)), assert.AssertionError);
});
test('actual Agent domain writes and outer COMMIT remain a separate transaction', () => {
  const result = assertAgentSaveBoundary(events(), identity, 'commit');
  assert.equal(result.transactionAttemptId, 'save-transaction');
  assert.equal(result.backendPid, 42);
});
test('a simplified host wrapper and history marker cannot substitute for actual Agent transaction', () => {
  const all = events().filter((event) => String(event.kind) !== 'agent-step-save-transaction');
  assert.throws(() => assertAgentSaveBoundary(all, identity, 'commit'), BlockedError);
});
test('called COMMIT without actual returned confirmation never certifies durable history', () => {
  const all = events();
  all.find((event) => event.phase === 'commit' && event.edge === 'returned')!.edge = 'called';
  assert.throws(() => assertAgentSaveBoundary(all, identity, 'commit'), BlockedError);
});
test('multiple saving transactions cannot be stitched into one complete proof', () => {
  const all = events();
  all.find((event) => event.phase === 'run-history-update')!.transactionAttemptId = 'another';
  assert.throws(() => assertAgentSaveBoundary(all, identity, 'commit'), BlockedError);
});
test('actual history trigger rejection and ROLLBACK acknowledge the original failed save', () => {
  assert.equal(
    assertAgentSaveBoundary(events('rollback'), identity, 'rollback').outcome,
    'rollback',
  );
});
test('failed save with only a ROLLBACK call blocks rather than assuming rollback', () => {
  const all = events('rollback');
  all.find((event) => event.phase === 'rollback' && event.edge === 'returned')!.edge = 'called';
  assert.throws(() => assertAgentSaveBoundary(all, identity, 'rollback'), BlockedError);
});
test('failed save publishing history committed remains an assertion failure', () => {
  const all = events('rollback');
  all.push({ ...all[all.length - 1]!, kind: 'send-tool-history-committed' });
  assert.throws(() => assertAgentSaveBoundary(all, identity, 'rollback'), assert.AssertionError);
});
