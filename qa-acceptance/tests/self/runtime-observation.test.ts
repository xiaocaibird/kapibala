import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUNTIME_PROTOCOL,
  RuntimeObservation,
  RuntimeLease,
  readRuntimeConfig,
  validateRuntimeSnapshot,
  validateDiagnosticProfile,
  atPointer,
  diagnosticModule,
  assertActivityBudget,
  assertRecoveredActivity,
  assertNoRecoveryPause,
  type DiagnosticProfile,
  type RuntimeCorrelation,
  type RuntimeSnapshot,
} from '../../harness/runtime-observation.js';
import { loadTarget } from '../../harness/security.js';
import { observe } from '../../harness/observation.js';

const target = {
  apiUrl: 'http://127.0.0.1:38999',
  revision: 'a'.repeat(40),
  pid: 12345,
  ownerToken: '11111111-1111-1111-1111-111111111111',
};
const binding = {
  apiUrl: target.apiUrl,
  revision: target.revision,
  pid: target.pid,
  observedOwnerToken: target.ownerToken,
};
const correlation: RuntimeCorrelation = {
  kind: 'account',
  accountId: 'account',
  operation: 'connect',
  intentId: 'intent',
};
const snapshot = (leaseId = 'lease'): RuntimeSnapshot => ({
  protocol: RUNTIME_PROTOCOL,
  leaseId,
  state: 'held',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  binding,
  correlation,
  events: [
    {
      seq: 1,
      at: new Date().toISOString(),
      kind: 'remote-success',
      correlation,
      attemptId: 'real-attempt-1',
      instancePid: target.pid,
      transactionId: 'actual-tx-1',
      requestId: 'actual-request-1',
    },
  ],
});
const profile: DiagnosticProfile = {
  module: 'module',
  modulesPointer: '/modules',
  namePointer: '/name',
  statePointer: '/state',
  consecutiveFailuresPointer: '/failures',
  lastFailureAtPointer: '/lastFailureAt',
  lastSuccessAtPointer: '/lastSuccessAt',
  currentDurationMsPointer: '/duration',
  tickCountPointer: '/ticks',
  states: { failed: 'failed', running: 'running', healthy: 'idle' },
};
async function fake(
  handler: (req: IncomingMessage, body: unknown, res: ServerResponse) => void | Promise<void>,
) {
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += String(chunk);
      await handler(req, raw ? JSON.parse(raw) : undefined, res);
    } catch (error) {
      res.writeHead(500).end(JSON.stringify({ error: String(error) }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
const json = (res: ServerResponse, value: unknown, status = 200) =>
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));

test('runtime adapter is absent by default and rejects off-loopback or unversioned setup', () => {
  assert.throws(() => readRuntimeConfig({}), /BLOCKED/);
  for (const url of [
    'http://example.test:1',
    'http://localhost:2',
    'http://127.0.0.1:2/path',
    'http://x:y@127.0.0.1:2',
  ])
    assert.throws(
      () =>
        readRuntimeConfig({
          adapters: { runtimeObservation: { url, contractReference: 'contract' } },
        }),
      /BLOCKED/,
    );
  assert.deepEqual(
    readRuntimeConfig({
      adapters: {
        runtimeObservation: { url: 'http://127.0.0.1:2', contractReference: 'contract' },
      },
    }),
    { url: 'http://127.0.0.1:2', contractReference: 'contract' },
  );
});
test('runtime actual process mismatch prevents all mutations and owner token is not sent', async () => {
  const methods: string[] = [];
  const control = await fake((req, body, res) => {
    methods.push(req.method!);
    assert(!JSON.stringify({ url: req.url, body }).includes(target.ownerToken));
    json(res, {
      protocol: RUNTIME_PROTOCOL,
      binding: { ...binding, pid: 1 },
      capabilities: ['account-local-save'],
    });
  });
  try {
    const client = new RuntimeObservation(
      { url: control.url, contractReference: 'contract' },
      target,
    );
    await assert.rejects(client.verify(['account-local-save']), /BLOCKED/);
    await assert.rejects(client.arm('account-save-once', correlation), /BLOCKED/);
    assert.deepEqual(methods, ['GET']);
  } finally {
    await control.close();
  }
});
test('runtime lost create response still cleans up exactly its client-owned UUID', async () => {
  let putId: string | undefined, deleteId: string | undefined;
  let value: RuntimeSnapshot | undefined;
  const control = await fake((req, body, res) => {
    assert(!JSON.stringify({ url: req.url, body }).includes(target.ownerToken));
    if (req.url!.includes('capabilities'))
      return void json(res, {
        protocol: RUNTIME_PROTOCOL,
        binding,
        capabilities: ['account-local-save'],
      });
    const id = req.url!.split('/').at(-1)!;
    if (req.method === 'PUT') {
      putId = id;
      value = snapshot(id);
      return void res.writeHead(503).end('{}');
    }
    if (req.method === 'DELETE') {
      deleteId = id;
      return void json(res, { ...value!, state: 'released' });
    }
    json(res, value);
  });
  try {
    const client = new RuntimeObservation(
      { url: control.url, contractReference: 'contract' },
      target,
    );
    await client.verify(['account-local-save']);
    await assert.rejects(client.arm('account-save-once', correlation), /503/);
    await client.close();
    assert.match(putId!, /^[a-f0-9-]{36}$/);
    assert.equal(deleteId, putId);
  } finally {
    await control.close();
  }
});
test('runtime request permits modes and bounded leases but no arbitrary outcomes or time overrides', async () => {
  let value: RuntimeSnapshot | undefined;
  const bodies: Record<string, unknown>[] = [];
  const control = await fake((req, body, res) => {
    if (req.url!.includes('capabilities'))
      return void json(res, {
        protocol: RUNTIME_PROTOCOL,
        binding,
        capabilities: ['account-local-save'],
      });
    if (req.method === 'PUT') {
      bodies.push(body as Record<string, unknown>);
      value = snapshot(req.url!.split('/').at(-1)!);
    }
    if (req.method === 'DELETE') value = { ...value!, state: 'released' };
    json(res, value);
  });
  try {
    const client = new RuntimeObservation(
      { url: control.url, contractReference: 'contract' },
      target,
    );
    await client.verify(['account-local-save']);
    await assert.rejects(client.arm('account-save-once', correlation, { ttlMs: 120001 }), /TTL/);
    await assert.rejects(
      client.arm('account-save-once', correlation, { faultMarker: 'qa-runtime-forbidden' }),
      /marker/,
    );
    await client.arm('account-save-once', correlation);
    assert.deepEqual(Object.keys(bodies[0]!).sort(), [
      'correlation',
      'mode',
      'protocol',
      'target',
      'ttlMs',
    ]);
    await client.close();
  } finally {
    await control.close();
  }
});
test('runtime snapshot requires causal transaction and actual process evidence', () => {
  assert.doesNotThrow(() => validateRuntimeSnapshot(snapshot(), target, 'lease', correlation));
  for (const mutate of [
    (x: RuntimeSnapshot) => {
      x.events[0]!.transactionId = undefined;
    },
    (x: RuntimeSnapshot) => {
      x.events[0]!.attemptId = '';
    },
    (x: RuntimeSnapshot) => {
      x.events[0]!.instancePid++;
    },
    (x: RuntimeSnapshot) => {
      x.events[0]!.at = new Date(Date.now() + 60000).toISOString();
    },
    (x: RuntimeSnapshot) => {
      x.events[0]!.kind = 'module-failed';
    },
    (x: RuntimeSnapshot) => {
      x.correlation = { ...correlation, accountId: 'foreign' };
    },
    (x: RuntimeSnapshot) => {
      x.binding.observedOwnerToken = 'echoed-wrong-token';
    },
  ]) {
    const value = structuredClone(snapshot());
    mutate(value);
    assert.throws(() => validateRuntimeSnapshot(value, target, 'lease', correlation), /BLOCKED/);
  }
});
test('runtime history cannot rewrite evidence extend TTL or revive a released lease', () => {
  const initial = snapshot();
  const lease = new RuntimeLease('lease', target, correlation, async () => initial);
  lease.accept(initial);
  assert.doesNotThrow(() =>
    lease.accept({
      ...initial,
      events: [
        {
          ...initial.events[0]!,
          correlation: {
            intentId: 'intent',
            operation: 'connect',
            accountId: 'account',
            kind: 'account',
          },
        },
      ],
    }),
  );
  for (const mutate of [
    (x: RuntimeSnapshot) => {
      x.events[0]!.attemptId = 'rewritten';
    },
    (x: RuntimeSnapshot) => {
      x.events = [];
    },
    (x: RuntimeSnapshot) => {
      x.expiresAt = new Date(Date.parse(x.expiresAt) + 1).toISOString();
    },
  ]) {
    const next = structuredClone(initial);
    mutate(next);
    assert.throws(() => lease.accept(next), /BLOCKED/);
  }
  lease.accept({ ...initial, state: 'released' });
  assert.throws(() => lease.accept(initial), /BLOCKED/);
});
test('runtime activity checks never turn a lost crash tail or uncertain interval into a pass', () => {
  const event = {
    ...snapshot().events[0]!,
    kind: 'activity-terminal' as const,
    activeElapsedMs: [60000, 60000] as [number, number],
    includesUnsavedTail: true,
    epochIds: ['before', 'after'],
  };
  assert.doesNotThrow(() => assertActivityBudget(event, [59950, 60050]));
  assert.doesNotThrow(() =>
    assertActivityBudget({ ...event, activeElapsedMs: [59999, 60000] }, [59950, 60050]),
  );
  assert.throws(
    () => assertActivityBudget({ ...event, includesUnsavedTail: false }, [59950, 60050]),
    /BLOCKED/,
  );
  assert.throws(
    () => assertActivityBudget({ ...event, activeElapsedMs: [59950, 60050] }, [59900, 60100]),
    /BLOCKED/,
  );
  assert.doesNotThrow(() =>
    assertActivityBudget({ ...event, activeElapsedMs: [59000, 59500] }, [59000, 59500]),
  );
  // Online time may include a paused run; its lower bound is not activity truth.
  assert.doesNotThrow(() => assertActivityBudget(event, [61000, 61500]));
  assert.throws(() => assertActivityBudget(event, [59000, 59500]), /矛盾/);
  assert.throws(
    () => assertActivityBudget({ ...event, activeElapsedMs: [60001, 60002] }, [61000, 61500]),
    /超过原始60秒/,
  );
});
test('runtime incomplete tail accepts null or absent total truth without accepting malformed intervals', () => {
  const activity: RuntimeCorrelation = {
    kind: 'activity',
    runId: 'run',
    groupId: 'group',
    toolUseId: 'all-run-steps',
  };
  const event = {
    ...snapshot().events[0]!,
    kind: 'activity-checkpoint' as const,
    correlation: activity,
    activeElapsedMs: null,
    includesUnsavedTail: false,
    epochIds: ['recovered-epoch'],
    activityState: 'active' as const,
    observedEpochActiveMs: 150,
    persistedActiveMs: 14000,
    missingReason: 'hard-crash-tail-unavailable',
  };
  const value = { ...snapshot(), correlation: activity, events: [event] };
  for (const bounds of [null, undefined, [150, 160]]) {
    const parsed = validateRuntimeSnapshot(
      { ...value, events: [{ ...event, activeElapsedMs: bounds }] },
      target,
      'lease',
      activity,
    );
    assert.throws(() => assertActivityBudget(parsed.events[0]!, [61000, 62000]), /BLOCKED/);
  }
  // A newly observed single epoch can have genuine complete truth. Completeness
  // is about the real run, not an artificial minimum count of epochs.
  assert.doesNotThrow(() =>
    validateRuntimeSnapshot(
      { ...value, events: [{ ...event, includesUnsavedTail: true, activeElapsedMs: [150, 160] }] },
      target,
      'lease',
      activity,
    ),
  );
  for (const patch of [
    { activeElapsedMs: [1] },
    { activeElapsedMs: [-1, 1] },
    { activeElapsedMs: [2, 1] },
    { activeElapsedMs: [1, Number.NaN] },
    { activeElapsedMs: '14000' },
    { includesUnsavedTail: true },
    { includesUnsavedTail: true, activeElapsedMs: undefined },
  ])
    assert.throws(
      () =>
        validateRuntimeSnapshot(
          { ...value, events: [{ ...event, ...patch }] },
          target,
          'lease',
          activity,
        ),
      /BLOCKED/,
    );
});
test('runtime incomplete checkpoints cannot hide a later independently witnessed recovery pause', async () => {
  const activity: RuntimeCorrelation = {
    kind: 'activity',
    runId: 'run',
    groupId: 'group',
    toolUseId: 'all-run-steps',
  };
  const event = {
    ...snapshot().events[0]!,
    kind: 'activity-checkpoint' as const,
    correlation: activity,
    activeElapsedMs: null,
    includesUnsavedTail: false,
    epochIds: ['original-epoch', 'recovered-epoch'],
    activityState: 'unknown' as const,
  };
  const early = { ...snapshot(), correlation: activity, events: [event] };
  const paused = {
    ...early,
    events: [
      event,
      {
        ...event,
        seq: 2,
        activityState: 'recovery-paused' as const,
      },
    ],
  };
  let reads = 0;
  await assert.rejects(
    observe({
      read: async () =>
        validateRuntimeSnapshot(++reads === 1 ? early : paused, target, 'lease', activity),
      invariant: (value) => assertNoRecoveryPause(value.events),
      complete: () => false,
      durationMs: 1000,
      intervalMs: 0,
    }),
    /A5.8强恢复未满足/,
  );
  assert.equal(reads, 2, '不完整的先前记录不得提前阻塞独立恢复观察');
  assert.throws(() => assertNoRecoveryPause(paused.events), /A5.8强恢复未满足/);
  assert.throws(() => assertActivityBudget(event, [61000, 62000]), /BLOCKED/);
});
test('runtime empty observed epochs are honest incomplete evidence but never complete budget proof', () => {
  const activity: RuntimeCorrelation = {
    kind: 'activity',
    runId: 'run',
    groupId: 'group',
    toolUseId: 'all-run-steps',
  };
  const event = {
    ...snapshot().events[0]!,
    kind: 'activity-checkpoint' as const,
    correlation: activity,
    includesUnsavedTail: false,
    epochIds: [],
    activityState: 'recovery-paused' as const,
    observedEpochActiveMs: [0, 0],
    persistedActiveMs: 14000,
    incompleteReason: 'Run creation or earlier epoch tail was not witnessed by this process.',
  };
  const value = { ...snapshot(), correlation: activity, events: [event] };
  const parsed = validateRuntimeSnapshot(value, target, 'lease', activity);
  assert.throws(() => assertNoRecoveryPause(parsed.events), /A5.8强恢复未满足/);
  assert.throws(() => assertActivityBudget(parsed.events[0]!, [61000, 62000]), /BLOCKED/);
  for (const patch of [
    { includesUnsavedTail: true, activeElapsedMs: [60000, 60000] },
    { epochIds: undefined },
    { epochIds: [null] },
    { epochIds: [''] },
  ])
    assert.throws(
      () =>
        validateRuntimeSnapshot(
          { ...value, events: [{ ...event, ...patch }] },
          target,
          'lease',
          activity,
        ),
      /BLOCKED/,
    );
});
test('runtime recovery pause is a recovery failure while unknown actual activity is blocked', () => {
  const base = snapshot().events[0]!;
  assert.throws(
    () => assertRecoveredActivity({ ...base, activityState: 'recovery-paused' }),
    /A5.8强恢复未满足/,
  );
  assert.throws(() => assertRecoveredActivity({ ...base, activityState: 'unknown' }), /BLOCKED/);
  assert.throws(() => assertRecoveredActivity(base), /BLOCKED/);
  assert.doesNotThrow(() => assertRecoveredActivity({ ...base, activityState: 'active' }));
  assert.doesNotThrow(() => assertRecoveredActivity({ ...base, activityState: 'terminal' }));
});
test('runtime safe crash boundary needs actual durable continuation and no remote request in flight', () => {
  const activity: RuntimeCorrelation = {
    kind: 'activity',
    runId: 'run',
    groupId: 'group',
    toolUseId: 'all-run-steps',
  };
  const value: RuntimeSnapshot = {
    ...snapshot(),
    correlation: activity,
    events: [
      {
        ...snapshot().events[0]!,
        kind: 'activity-safe-held',
        correlation: activity,
        activeElapsedMs: [21000, 21000],
        epochIds: ['original-epoch'],
        includesUnsavedTail: true,
        activityState: 'active',
        stepId: 'durable-step-3',
        continuationDurable: true,
        remoteInFlightCount: 0,
      },
    ],
  };
  assert.doesNotThrow(() => validateRuntimeSnapshot(value, target, 'lease', activity));
  for (const patch of [
    { continuationDurable: false },
    { remoteInFlightCount: 1 },
    { stepId: '' },
    { activityState: 'unknown' },
    { activityState: undefined },
  ])
    assert.throws(
      () =>
        validateRuntimeSnapshot(
          { ...value, events: [{ ...value.events[0]!, ...patch }] },
          target,
          'lease',
          activity,
        ),
      /BLOCKED/,
    );
});
test('runtime save recovery proves original transaction commit and an actually waiting later request', async () => {
  const base = snapshot();
  const failure = {
    ...base.events[0]!,
    kind: 'local-save-failed' as const,
    recoverableInOriginalTransaction: true,
  };
  const committed = {
    ...base.events[0]!,
    kind: 'local-save-committed' as const,
    commitBoundary: 'outer-commit-confirmed' as const,
  };
  const waiting = {
    ...base.events[0]!,
    kind: 'newer-account-intent-waiting' as const,
    waitingIntent: {
      requestId: 'actual-later-request',
      accountId: 'account',
      expectedFrom: 'online' as const,
      to: 'disconnected' as const,
      waitingForTransactionId: 'actual-tx-1',
    },
  };
  for (const event of [failure, committed, waiting])
    assert.doesNotThrow(() =>
      validateRuntimeSnapshot({ ...base, events: [event] }, target, 'lease', correlation),
    );
  for (const event of [
    { ...failure, recoverableInOriginalTransaction: false },
    { ...committed, commitBoundary: 'savepoint-released' },
    { ...waiting, waitingIntent: undefined },
    { ...waiting, waitingIntent: { ...waiting.waitingIntent, requestId: waiting.requestId } },
    { ...waiting, waitingIntent: { ...waiting.waitingIntent, waitingForTransactionId: 'new-tx' } },
  ])
    assert.throws(
      () => validateRuntimeSnapshot({ ...base, events: [event] }, target, 'lease', correlation),
      /BLOCKED/,
    );
  const lease = new RuntimeLease('lease', target, correlation, async () => ({
    ...base,
    state: 'released',
    events: [waiting],
  }));
  await assert.rejects(lease.waitFor('newer-account-intent-waiting', 1), /没有真实保持/);
});
test('runtime failed module hold cannot already have started activity or diagnostic tick accounting', () => {
  const module: RuntimeCorrelation = {
    kind: 'module',
    module: 'scheduler',
    attemptLabel: 'real-attempt',
  };
  const value = {
    ...snapshot(),
    correlation: module,
    events: [
      {
        ...snapshot().events[0]!,
        correlation: module,
        kind: 'module-before-next-held',
        tickBoundary: 'before-activity-and-diagnostics-start',
      },
    ],
  };
  assert.doesNotThrow(() => validateRuntimeSnapshot(value, target, 'lease', module));
  assert.throws(
    () =>
      validateRuntimeSnapshot(
        { ...value, events: [{ ...value.events[0], tickBoundary: undefined }] },
        target,
        'lease',
        module,
      ),
    /BLOCKED/,
  );
});
test('runtime diagnostic mappings are data-only and locate the exact controlled module', () => {
  assert.doesNotThrow(() => validateDiagnosticProfile(profile));
  assert.throws(() => validateDiagnosticProfile({ ...profile, statePointer: '/bad~2' }), /BLOCKED/);
  assert.throws(
    () =>
      validateDiagnosticProfile({
        ...profile,
        states: { failed: 'same', running: 'same', healthy: 'same' },
      }),
    /BLOCKED/,
  );
  assert.equal(atPointer({ 'a/b': { '~c': 2 } }, '/a~1b/~0c'), 2);
  assert.equal(atPointer({}, '/constructor'), undefined);
  assert.deepEqual(diagnosticModule({ modules: [{ name: 'module', state: 'failed' }] }, profile), {
    name: 'module',
    state: 'failed',
  });
  assert.throws(() => diagnosticModule({ modules: [{ name: 'other' }] }, profile));
});
test('shared target loader validates and retains runtime endpoint and diagnostic profile', async () => {
  const qaRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  await mkdir(resolve(qaRoot, '.runtime'), { recursive: true });
  const dir = await mkdtemp(resolve(qaRoot, '.runtime/runtime-config-'));
  const file = resolve(dir, 'target.json');
  const base = JSON.parse(await readFile(resolve(qaRoot, 'config/target.example.json'), 'utf8'));
  base.sut.revision = 'a'.repeat(40);
  base.sut.cwd = qaRoot;
  try {
    for (const bad of [
      { url: 'http://example.test:2', contractReference: 'contract' },
      { url: 'http://127.0.0.1:2', contractReference: 'REQUIRED' },
      {
        url: 'http://127.0.0.1:2',
        contractReference: 'contract',
        diagnostics: { ...profile, statePointer: 'code()' },
      },
      {
        url: 'http://127.0.0.1:2',
        contractReference: 'contract',
        diagnostics: { ...profile, states: { failed: 'x', running: 'x', healthy: 'y' } },
      },
    ]) {
      await writeFile(file, JSON.stringify({ ...base, adapters: { runtimeObservation: bad } }));
      await assert.rejects(loadTarget(file, qaRoot), /BLOCKED/);
    }
    await writeFile(
      file,
      JSON.stringify({
        ...base,
        adapters: {
          runtimeObservation: {
            url: 'http://127.0.0.1:2',
            contractReference: 'contract',
            diagnostics: profile,
          },
        },
      }),
    );
    const loaded = await loadTarget(file, qaRoot);
    assert.deepEqual(loaded.adapters!.runtimeObservation!.diagnostics, profile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
