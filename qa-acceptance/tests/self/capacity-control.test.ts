import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import {
  CAPACITY_PROTOCOL,
  CapacityControl,
  CapacityLease,
  controlLoopbackUrl,
  readCapacityControlConfig,
  validateCapacitySnapshot,
  type CapacityControlTarget,
  type CapacityCorrelation,
  type CapacitySnapshot,
} from '../../harness/capacity-control.js';

const target: CapacityControlTarget = {
  apiUrl: 'http://127.0.0.1:39999',
  revision: 'a'.repeat(40),
  pid: 12345,
  ownerToken: '11111111-1111-1111-1111-111111111111',
};
const correlation: CapacityCorrelation = { groupId: 'group', runId: 'run', toolUseId: 'tool' };
const binding = {
  apiUrl: target.apiUrl,
  revision: target.revision,
  pid: target.pid,
  observedOwnerToken: target.ownerToken,
};
const snapshot = (leaseId: string, state: 'held' | 'released' = 'held'): CapacitySnapshot => ({
  protocol: CAPACITY_PROTOCOL,
  leaseId,
  state,
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  binding,
  correlation,
  events: [{ seq: 1, at: new Date().toISOString(), kind: 'capacity-held', ...correlation }],
});
async function fakeControl(
  handler: (
    request: IncomingMessage,
    body: unknown,
    response: ServerResponse,
  ) => void | Promise<void>,
) {
  const server = createServer(async (request, response) => {
    try {
      let text = '';
      for await (const chunk of request) text += String(chunk);
      await handler(request, text ? JSON.parse(text) : undefined, response);
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ error: String(error) }));
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
const json = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
};

test('capacity configuration requires an explicit contract and exact loopback origin', () => {
  assert.throws(() => readCapacityControlConfig({}), /BLOCKED/);
  for (const url of [
    'https://127.0.0.1:1',
    'http://localhost:1',
    'http://example.com:1',
    'http://127.0.0.1:1/extra',
    'http://u:p@127.0.0.1:1',
    'http://127.0.0.1:1/?x=1',
  ])
    assert.throws(() => controlLoopbackUrl(url), /BLOCKED/);
  assert.deepEqual(
    readCapacityControlConfig({
      adapters: {
        capacityControl: {
          url: 'http://127.0.0.1:1234',
          contractReference: 'approved fixture contract',
        },
      },
    }),
    { url: 'http://127.0.0.1:1234', contractReference: 'approved fixture contract' },
  );
});

test('fake controller lifecycle verifies independent process ownership and only releases its created lease', async () => {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let current: CapacitySnapshot | undefined;
  const fake = await fakeControl((request, body, response) => {
    calls.push({ method: request.method!, path: request.url!, body });
    assert(!request.url!.includes(target.ownerToken));
    assert(!JSON.stringify(body ?? '').includes(target.ownerToken));
    if (request.method === 'GET' && request.url!.startsWith('/qa/capacity/v1/capabilities?'))
      return json(response, {
        protocol: CAPACITY_PROTOCOL,
        binding,
        capabilities: ['admission-hold', 'before-ready-window'],
      });
    const id = request.url!.split('/').at(-1)!;
    if (request.method === 'PUT') {
      current = snapshot(id);
      return json(response, current);
    }
    assert.equal(id, current!.leaseId);
    if (request.method === 'DELETE') current!.state = 'released';
    json(response, current);
  });
  const control = new CapacityControl(
    { url: fake.url, contractReference: 'SELF TEST FAKE ONLY' },
    target,
  );
  try {
    await assert.rejects(control.hold(correlation), /必须先验证/);
    await control.verify(['admission-hold', 'before-ready-window']);
    const lease = await control.hold(correlation, { beforeReady: true });
    assert.equal((await lease.snapshot()).state, 'held');
    await lease.release();
    await lease.release();
    await control.close();
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal(
      calls.find((call) => call.method === 'PUT')!.path,
      calls.find((call) => call.method === 'DELETE')!.path,
    );
  } finally {
    await fake.close();
  }
});

test('wrong process token prevents all mutating controller requests', async () => {
  const methods: string[] = [];
  const fake = await fakeControl((request, _body, response) => {
    methods.push(request.method!);
    json(response, {
      protocol: CAPACITY_PROTOCOL,
      binding: { ...binding, observedOwnerToken: 'wrong-environment' },
      capabilities: ['admission-hold'],
    });
  });
  try {
    const control = new CapacityControl({ url: fake.url, contractReference: 'fake' }, target);
    await assert.rejects(control.verify(), /专属进程/);
    await assert.rejects(control.hold(correlation), /必须先验证/);
    await control.close();
    assert.deepEqual(methods, ['GET']);
  } finally {
    await fake.close();
  }
});

test('lost create response still cleans the known locally-created lease ID', async () => {
  let current: CapacitySnapshot | undefined;
  const removed: string[] = [];
  const fake = await fakeControl((request, _body, response) => {
    if (request.url!.includes('/capabilities?'))
      return json(response, {
        protocol: CAPACITY_PROTOCOL,
        binding,
        capabilities: ['admission-hold'],
      });
    const id = request.url!.split('/').at(-1)!;
    if (request.method === 'PUT') {
      current = snapshot(id);
      return json(response, { error: 'response failed after creation' }, 503);
    }
    if (request.method === 'DELETE') {
      removed.push(id);
      current!.state = 'released';
      return json(response, current);
    }
    json(response, current);
  });
  try {
    const control = new CapacityControl({ url: fake.url, contractReference: 'fake' }, target);
    await control.verify();
    await assert.rejects(control.hold(correlation), /503/);
    await control.close();
    assert.deepEqual(removed, [current!.leaseId]);
  } finally {
    await fake.close();
  }
});

test('cross-run, entity contention, dispatched callbacks and stale diagnostic history cannot prove capacity refusal', () => {
  const base = snapshot('lease');
  const refusal = {
    seq: 2,
    at: new Date().toISOString(),
    kind: 'admission-refused' as const,
    ...correlation,
    attemptId: 'attempt-1',
    reason: 'capacity' as const,
    callbackEntered: false,
    remoteRequestCount: 0,
  };
  const good = { ...base, events: [...base.events, refusal] };
  assert.equal(validateCapacitySnapshot(good, target, 'lease', correlation).events.length, 2);
  for (const patch of [
    { runId: 'other-run' },
    { reason: 'entity' },
    { callbackEntered: true },
    { remoteRequestCount: 1 },
    { seq: 1 },
    { activeElapsedMs: [2, 1] },
  ])
    assert.throws(
      () =>
        validateCapacitySnapshot(
          { ...good, events: [...base.events, { ...refusal, ...patch }] },
          target,
          'lease',
          correlation,
        ),
      /BLOCKED/,
    );
  const lease = new CapacityLease('lease', target, correlation, async () => base);
  lease.accept(good);
  assert.throws(() => lease.accept(base), /历史被修改或倒退/);
  assert.throws(
    () =>
      lease.accept({
        ...good,
        events: [base.events[0], { ...refusal, at: '2020-01-01T00:00:00.000Z' }],
      }),
    /历史被修改或倒退/,
  );
});

test('unreached fault window is BLOCKED rather than an empty PASS', async () => {
  const value = snapshot('lease');
  const lease = new CapacityLease('lease', target, correlation, async () => value);
  await assert.rejects(
    lease.waitFor((item) => item.events.some((event) => event.kind === 'before-ready-held'), {
      timeoutMs: 1,
    }),
    /未取得指定容量事件/,
  );
});

test('an undeclared crash-window capability never creates a mutation', async () => {
  const methods: string[] = [];
  const fake = await fakeControl((request, _body, response) => {
    methods.push(request.method!);
    json(response, { protocol: CAPACITY_PROTOCOL, binding, capabilities: ['admission-hold'] });
  });
  try {
    const control = new CapacityControl({ url: fake.url, contractReference: 'fake' }, target);
    await control.verify();
    await assert.rejects(
      control.hold(correlation, { beforeReady: true }),
      /未声明精确before-ready/,
    );
    await control.close();
    assert.deepEqual(methods, ['GET']);
  } finally {
    await fake.close();
  }
});

test('an expired or released lease cannot satisfy a previously reached fault predicate', async () => {
  for (const value of [
    { ...snapshot('lease'), expiresAt: new Date(Date.now() - 1000).toISOString() },
    snapshot('lease', 'released'),
  ]) {
    const lease = new CapacityLease('lease', target, correlation, async () => value);
    await assert.rejects(
      lease.waitFor(() => true),
      /已释放\/租约到期/,
    );
  }
});
