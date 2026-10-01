import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  RuntimeLease,
  RuntimeObservation,
  validateRuntimeSnapshot,
  type RuntimeEvent,
  type RuntimeCorrelation,
  type RuntimeSnapshot,
} from '../../harness/runtime-observation.js';
import {
  assertAgentLifecycle,
  assertMessageRecoveryAssociation,
  assertToolWaitBudget,
  assertToolWaitCompletion,
  toolWaitWindow,
  observationInterval,
} from '../../harness/lifecycle-observation.js';
import { BlockedError } from '../../harness/security.js';
import { optionalActivityObservation } from '../support/agent-activity-budget.js';

// Synthetic observer fixtures only: no SUT, database or product clock is used.
const target = {
  apiUrl: 'http://127.0.0.1:31099',
  revision: 'a'.repeat(40),
  pid: 501,
  ownerToken: '66666666-6666-4666-8666-666666666666',
};
const c: RuntimeCorrelation = {
  kind: 'tool-wait',
  groupId: 'g',
  runId: 'run',
  toolUseId: 'all-run-steps',
};
const clockDomain = 'process-performance:502:11111111-1111-4111-8111-111111111111';
const clientMsgId = '22222222-2222-4222-8222-222222222222';
const queryAttemptId = '33333333-3333-4333-8333-333333333333';
const at = '2026-10-01T00:00:00.000Z';
const event = (
  kind: RuntimeEvent['kind'],
  point: number,
  extra: Record<string, unknown> = {},
): RuntimeEvent => ({
  seq: 1,
  at,
  kind,
  correlation: c,
  attemptId: 'execution',
  instancePid: target.pid,
  applicationPid: 502,
  clockDomain,
  clockUnit: 'ms',
  monotonicMs: [point, point],
  groupId: 'g',
  runId: 'run',
  ...extra,
});
const attach = (extra: Record<string, unknown> = {}) =>
  event('lifecycle-observation-attached', 10_000, {
    attemptId: 'attachment-only',
    resourceId: 'run',
    databaseIdentity: 'b'.repeat(64),
    historyScope: 'this-process-only',
    includesPriorProcessHistory: false,
    droppedThroughSourceSeq: 0,
    ...extra,
  });
const stream = (business: RuntimeEvent[], metadata = attach()): RuntimeEvent[] => [
  metadata,
  ...business.map((e, i) => ({ ...e, seq: i + 2, sourceSeq: (i + 1) * 2 })),
];
const snapshot = (events: RuntimeEvent[]): RuntimeSnapshot => ({
  protocol: 'qa-runtime-observation/1',
  leaseId: 'lease',
  state: 'armed',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  binding: {
    apiUrl: target.apiUrl,
    revision: target.revision,
    pid: target.pid,
    observedOwnerToken: target.ownerToken,
  },
  correlation: c,
  events,
});
const toolFacts = (start: [number, number] = [100, 100], end: [number, number] = [5100, 5100]) => {
  const tool = { stepId: 'run:1', toolUseId: 'send', idempotencyKey: 'key', clientMsgId };
  return stream([
    event('send-tool-prepared', 80, {
      ...tool,
      attemptId: 'model-turn',
      commitBoundary: 'outer-commit-confirmed',
    }),
    event('send-tool-entered', 90, tool),
    event('send-key-resolved', start[0], { ...tool, keyReused: false }),
    event('send-wait-started', start[1], tool),
    event('send-wait-result-ready', end[0], { ...tool, errorCode: 'SEND_TIMEOUT' }),
    event('send-tool-result-returned', end[1], {
      ...tool,
      errorCode: 'SEND_TIMEOUT',
      result: { code: 'SEND_TIMEOUT' },
    }),
    event('send-tool-history-committed', end[1] + 1, {
      ...tool,
      errorCode: 'SEND_TIMEOUT',
      result: { code: 'SEND_TIMEOUT' },
      commitBoundary: 'outer-commit-confirmed',
    }),
  ]);
};
const valid = (events: RuntimeEvent[]) =>
  validateRuntimeSnapshot(snapshot(events), target, 'lease', c).events;

test('late attachment precedes older replay in lease order; real source gaps are legal and immutable', () => {
  const value = snapshot(toolFacts());
  const lease = new RuntimeLease('lease', target, c, async () => value);
  assert.doesNotThrow(() => lease.accept(value));
  assert.ok(
    observationInterval(value.events[0]!.monotonicMs)[0] >
      observationInterval(value.events[1]!.monotonicMs)[0],
  );
  const changed = structuredClone(value);
  changed.events[2]!.idempotencyKey = 'rewritten';
  assert.throws(() => lease.accept(changed), /改写/);
  const released = structuredClone(value);
  released.state = 'released';
  lease.accept(released);
  assert.throws(() => lease.accept(value), /复活/);
});

test('actual identity, process clocks, finite intervals, source order and history declarations are validated', () => {
  const changes: ((events: RuntimeEvent[]) => void)[] = [
    (e) => {
      e[0]!.resourceId = 'another-run';
    },
    (e) => {
      e[0]!.databaseIdentity = 'not-db';
    },
    (e) => {
      e[0]!.historyScope = 'invented-all-processes';
    },
    (e) => {
      e[0]!.includesPriorProcessHistory = true;
    },
    (e) => {
      e[0]!.droppedThroughSourceSeq = 100;
    },
    (e) => {
      e[2]!.groupId = 'other';
    },
    (e) => {
      e[2]!.runId = 'other';
    },
    (e) => {
      e[2]!.sourceSeq = e[1]!.sourceSeq;
    },
    (e) => {
      e[2]!.applicationPid = 700;
    },
    (e) => {
      e[2]!.clockDomain = 'process-performance:502:44444444-4444-4444-8444-444444444444';
    },
    (e) => {
      e[2]!.monotonicMs = [NaN, Infinity];
    },
    (e) => {
      e[2]!.monotonicMs = [90, 80];
    },
    (e) => {
      e[2]!.monotonicMs = [70, 70];
    },
    (e) => {
      e[7]!.commitBoundary = undefined;
    },
  ];
  for (const change of changes) {
    const events = toolFacts();
    change(events);
    assert.throws(() => valid(events), BlockedError);
  }
});

test('tool return uses paired true start/end without rounding away a sub-ms overrun', () => {
  const events = valid(toolFacts([399.768625, 399.828333], [5400.575083, 5400.618042]));
  const window = toolWaitWindow(events, 'send', 'key');
  assert.ok(window.elapsed[0] > 5000.7467 && window.elapsed[0] < 5000.7468);
  assert.ok(window.elapsed[1] > 5000.8494 && window.elapsed[1] < 5000.8495);
  assert.throws(
    () => assertToolWaitBudget(window, 'SEND_TIMEOUT'),
    (e: unknown) => !(e instanceof BlockedError) && /超过原始5000/.test(String(e)),
  );
});

test('tool exact upper bound can pass; overlapping bounds block and premature timeout fails', () => {
  const exact = toolWaitWindow(valid(toolFacts()), 'send', 'key');
  assert.doesNotThrow(() => {
    assertToolWaitBudget(exact, 'SEND_TIMEOUT');
    assertToolWaitCompletion(exact);
  });
  const overlap = toolWaitWindow(valid(toolFacts([100, 101], [5100, 5101])), 'send', 'key');
  assert.throws(() => assertToolWaitBudget(overlap, 'SEND_TIMEOUT'), BlockedError);
  const early = toolWaitWindow(valid(toolFacts([100, 100], [5099, 5099])), 'send', 'key');
  assert.throws(
    () => assertToolWaitBudget(early, 'SEND_TIMEOUT'),
    (e: unknown) => !(e instanceof BlockedError) && /提前/.test(String(e)),
  );
});

test('different real execution attempt cannot be guessed from the same toolUseId', () => {
  for (const alteration of ['missing', 'wrong-attempt'] as const) {
    const events = toolFacts();
    if (alteration === 'missing') events.pop();
    else events.at(-1)!.attemptId = 'lost-host-argument';
    const window = toolWaitWindow(valid(events), 'send', 'key');
    assertToolWaitBudget(window, 'SEND_TIMEOUT');
    assert.throws(() => assertToolWaitCompletion(window), /executionAttempt/);
  }
  const events = toolFacts([100, 100], [5100.74675, 5100.849417]);
  events.at(-1)!.attemptId = 'lost-host-argument';
  const window = toolWaitWindow(valid(events), 'send', 'key');
  assert.throws(
    () => {
      assertToolWaitBudget(window, 'SEND_TIMEOUT');
      assertToolWaitCompletion(window);
    },
    (e: unknown) => !(e instanceof BlockedError) && /5000/.test(String(e)),
  );
  const broken = toolFacts();
  broken[4]!.attemptId = 'unrelated-wait';
  assert.throws(() => toolWaitWindow(valid(broken), 'send', 'key'), BlockedError);
});

test('two different history events cannot jointly impersonate one correctly paired commit', () => {
  for (const wrongIdentity of [{ stepId: 'run:other' }, { toolUseId: 'other-tool' }]) {
    const events = toolFacts();
    const correct = structuredClone(events.at(-1)!);
    // A matches execution attempt but the wrong step/tool; B matches step/tool
    // but another attempt. Both individual filtered counts are exactly one.
    Object.assign(events.at(-1)!, wrongIdentity);
    events.push({
      ...correct,
      seq: correct.seq + 1,
      sourceSeq: Number(correct.sourceSeq) + 2,
      monotonicMs: [5102, 5102],
      attemptId: 'another-execution',
    });
    const window = toolWaitWindow(valid(events), 'send', 'key');
    assert.equal(window.history.length, 1);
    assert.equal(window.historyCandidates.length, 1);
    assert.notEqual(window.history[0]!.seq, window.historyCandidates[0]!.seq);
    assertToolWaitBudget(window, 'SEND_TIMEOUT');
    assert.throws(() => assertToolWaitCompletion(window), BlockedError);
  }
});

test('prepared must belong to the actual tool, while its model-turn attempt stays distinct', () => {
  const good = toolWaitWindow(valid(toolFacts()), 'send', 'key');
  assert.notEqual(good.earlierStages[0]!.attemptId, good.attemptId);
  assert.doesNotThrow(() => assertToolWaitCompletion(good));
  const wrong = toolFacts();
  wrong[1]!.toolUseId = 'other-tool';
  assert.throws(
    () => assertToolWaitCompletion(toolWaitWindow(valid(wrong), 'send', 'key')),
    BlockedError,
  );
});

test('truncated history cannot pass completion but cannot hide an independently observed overrun', () => {
  const events = toolFacts();
  events[0]!.droppedThroughSourceSeq = 1;
  const window = toolWaitWindow(valid(events), 'send', 'key');
  assert.throws(() => assertToolWaitCompletion(window), /截断/);
  const late = toolFacts([100, 100], [5101, 5102]);
  late[0]!.droppedThroughSourceSeq = 1;
  assert.throws(
    () => assertToolWaitBudget(toolWaitWindow(valid(late), 'send', 'key'), 'SEND_TIMEOUT'),
    (e: unknown) => !(e instanceof BlockedError) && /5000/.test(String(e)),
  );
});

const agentFacts = (end: [number, number]) =>
  stream([
    event('agent-run-created', 10, {
      attemptId: 'run',
      creationWindowMs: [0, 10],
      creationInsertWindowMs: [2, 5],
      transactionBeginAcknowledgedByMs: 1,
      commitBoundary: 'outer-commit-confirmed',
    }),
    event('agent-turn-dispatched', 15, { attemptId: 'turn', ordinal: 1, stepId: 'run:1' }),
    event('agent-termination-decided', end[1], {
      attemptId: 'finish',
      decisionWindowMs: end,
      status: 'failed',
      reason: 'wall_clock',
    }),
    event('agent-terminal-committed', end[1] + 4, {
      attemptId: 'finish',
      status: 'failed',
      reason: 'wall_clock',
      commitBoundary: 'outer-commit-confirmed',
    }),
  ]);
test('60005ms decision lower bound fails even if later commit/history is absent', () => {
  const events = agentFacts([60015, 60017]);
  assert.throws(() => assertAgentLifecycle(valid(events)), /超过原始60000/);
  events.pop();
  assert.throws(() => assertAgentLifecycle(valid(events)), /超过原始60000/);
});

test('agent lifecycle requires actual paired commit, creation bracket and retained history', () => {
  assert.doesNotThrow(() => assertAgentLifecycle(valid(agentFacts([60000, 60001]))));
  const wrong = agentFacts([60000, 60001]);
  wrong.at(-1)!.attemptId = 'other-terminal';
  assert.throws(() => assertAgentLifecycle(valid(wrong)), BlockedError);
  const noCommit = agentFacts([60000, 60001]);
  noCommit.pop();
  assert.throws(() => assertAgentLifecycle(valid(noCommit)), BlockedError);
  const badWindow = agentFacts([60000, 60001]);
  badWindow[1]!.creationInsertWindowMs = [5, 20];
  assert.throws(() => valid(badWindow), BlockedError);
});

function recovery() {
  const mc: RuntimeCorrelation = { kind: 'message-recovery', groupId: 'g', clientMsgId };
  const message = { clientMsgId, messageId: 'row', dispatchAttempt: 1, attemptId: 'row:1' };
  const old: RuntimeEvent[] = stream(
    [event('message-send-dispatch', 100, message)],
    attach({ resourceId: 'row' }),
  ).map((e) => ({ ...e, correlation: mc }));
  const fresh: RuntimeEvent[] = stream(
    [
      event('message-recovery-adopted', 10, {
        ...message,
        originalResponseReceipt: 'not-durably-recorded',
        recordedTimeoutAvailable: false,
        recoveryState: 'automatic-query-pending',
        commitBoundary: 'outer-commit-confirmed',
      }),
      event('message-recovery-query-started', 20, {
        ...message,
        queryAttemptId,
        recordedTimeoutAvailable: false,
        recoveryState: 'automatic-querying',
      }),
      event('message-query-dispatch', 21, { ...message, queryAttemptId }),
      event('message-query-response-body', 22, { ...message, queryAttemptId, responseStatus: 404 }),
      event('message-recovery-query-inconclusive', 23, {
        ...message,
        queryAttemptId,
        errorCode: 'NOT_FOUND',
        recordedTimeoutAvailable: false,
        recoveryState: 'automatic-query-pending',
      }),
    ],
    attach({ resourceId: 'row' }),
  ).map((e) => ({
    ...e,
    correlation: mc,
    instancePid: 601,
    applicationPid: 602,
    clockDomain: 'process-performance:602:55555555-5555-4555-8555-555555555555',
  }));
  return { mc, old, fresh };
}
test('restart diagnostics associate original dispatch without joining clocks or inventing negative completion', () => {
  const { old, fresh, mc } = recovery();
  validateRuntimeSnapshot({ ...snapshot(old), correlation: mc }, target, 'lease', mc);
  const nextTarget = { ...target, pid: 601 };
  validateRuntimeSnapshot(
    { ...snapshot(fresh), correlation: mc, binding: { ...snapshot(fresh).binding, pid: 601 } },
    nextTarget,
    'lease',
    mc,
  );
  const result = assertMessageRecoveryAssociation(old, fresh);
  assert.equal(result.automaticQueryObserved, true);
  assert.equal(result.silentNegativeCompletionProven, false);
  const wrong = structuredClone(fresh);
  wrong[1]!.attemptId = 'row:2';
  wrong[1]!.dispatchAttempt = 2;
  assert.throws(() => assertMessageRecoveryAssociation(old, wrong), BlockedError);
  assert.throws(() => assertMessageRecoveryAssociation(old, fresh.slice(0, 2)), BlockedError);
});

test('ordinary 404 never authorizes false terminal or a new dispatch', () => {
  const { old, fresh } = recovery();
  const falseTerminal = structuredClone(fresh);
  falseTerminal.push({
    ...fresh[2]!,
    seq: 9,
    kind: 'message-recovery-result-committed',
    decisionEvidence: 'recorded-timeout-and-late-404',
    deliveryStatus: 'failed',
  });
  assert.throws(
    () => assertMessageRecoveryAssociation(old, falseTerminal),
    (e: unknown) => !(e instanceof BlockedError),
  );
  const resend = structuredClone(fresh);
  resend.push({ ...fresh[1]!, seq: 9, kind: 'message-send-dispatch' });
  assert.throws(() => assertMessageRecoveryAssociation(old, resend), /盲重发/);
});

test('missing timing observation does not stop public checks or mask hard assertion failures', async () => {
  const missing: string[] = [];
  let publicChecks = 0;
  await optionalActivityObservation(
    'missing',
    async () => {
      throw new BlockedError('no observer');
    },
    missing,
  );
  publicChecks += 1;
  await assert.rejects(
    optionalActivityObservation(
      'hard',
      async () => {
        assert.fail('known violation');
      },
      missing,
    ),
    /known violation/,
  );
  assert.equal(publicChecks, 1);
  assert.equal(missing.length, 1);
});

test('new modes require explicit capability before any operation', async () => {
  const observation = new RuntimeObservation(
    { url: 'http://127.0.0.1:31100', contractReference: 'synthetic' },
    target,
  );
  await assert.rejects(observation.arm('observe-tool-wait', c), /先验证/);
  await assert.rejects(observation.arm('observe-agent-lifecycle', c), /先验证/);
  await assert.rejects(
    observation.arm('observe-message-recovery', {
      kind: 'message-recovery',
      groupId: 'g',
      clientMsgId,
    }),
    /先验证/,
  );
});

test('all three modes use verified binding and original lease cleanup, never sending ownerToken', async () => {
  const bodies: Record<string, unknown>[] = [];
  const leases = new Map<string, RuntimeSnapshot>();
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://127.0.0.1').pathname;
    const write = (body: unknown) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (path.endsWith('/capabilities'))
      return write({
        protocol: 'qa-runtime-observation/1',
        binding: snapshot([]).binding,
        capabilities: ['tool-wait-witness', 'agent-lifecycle-witness', 'message-recovery-witness'],
      });
    const id = path.split('/').at(-1)!;
    if (req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw) as Record<string, unknown>;
      bodies.push(body);
      const corr = body.correlation as RuntimeCorrelation;
      const events = corr.kind === 'message-recovery' ? recovery().old : toolFacts();
      const lease = { ...snapshot(events), leaseId: id, correlation: corr };
      leases.set(id, lease);
      return write(lease);
    }
    if (req.method === 'DELETE') {
      const lease = leases.get(id)!;
      lease.state = 'released';
      return write(lease);
    }
    return write(leases.get(id));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const observation = new RuntimeObservation(
    { url: `http://127.0.0.1:${address.port}`, contractReference: 'self-fixture' },
    target,
  );
  try {
    await observation.verify([
      'tool-wait-witness',
      'agent-lifecycle-witness',
      'message-recovery-witness',
    ]);
    await assert.rejects(
      observation.arm('observe-tool-wait', {
        kind: 'activity',
        groupId: 'g',
        runId: 'run',
        toolUseId: 'all-run-steps',
      }),
      /关联不一致/,
    );
    await observation.arm('observe-tool-wait', c);
    await observation.arm('observe-agent-lifecycle', c);
    await observation.arm('observe-message-recovery', recovery().mc);
    assert.deepEqual(
      bodies.map((body) => body.mode),
      ['observe-tool-wait', 'observe-agent-lifecycle', 'observe-message-recovery'],
    );
    for (const body of bodies)
      assert.deepEqual(body.target, {
        apiUrl: target.apiUrl,
        revision: target.revision,
        pid: target.pid,
      });
    assert.ok(!JSON.stringify(bodies).includes(target.ownerToken));
    await observation.close();
    assert.ok([...leases.values()].every((lease) => lease.state === 'released'));
  } finally {
    server.close();
    await once(server, 'close');
  }
});
