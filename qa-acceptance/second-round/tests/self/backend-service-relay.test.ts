import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ServiceRelay } from '../../harness/service-relay.js';
import { PreparationBlocked } from '../../contracts/media-provider.js';
import { assertDelayedAgentResponse } from '../../harness/backend-provider-regressions.js';

async function fixture(budget = 30000) {
  const bytes = Buffer.from('{"stop_reason":"tool_use","content":[{"type":"tool_use","name":"send_message","text":"原字节"}]}');
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': bytes.length, 'x-real-source': 'self-fixture' });
    res.end(bytes);
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const relay = new ServiceRelay(budget);
  await relay.start(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return { relay, bytes, requests, close: async () => {
    await relay.close(); server.closeAllConnections(); await new Promise<void>((ok, bad) => server.close(error => error ? bad(error) : ok()));
  } };
}
async function waitFor(check: () => boolean) {
  const end = performance.now() + 2000;
  while (!check() && performance.now() < end) await new Promise(ok => setTimeout(ok, 5));
  assert.ok(check(), 'finite self-test causal observation missing');
}
test('ordinary relay forwarding stays transparent when no response hold is armed', async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.relay.url + '/agent/audit', { method: 'POST', body: '{"groupId":"ordinary"}' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-real-source'), 'self-fixture');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bytes);
    assert.deepEqual(f.requests, ['{"groupId":"ordinary"}']);
    assert.equal(f.relay.ledger.length, 1); assert.equal(f.relay.ledger[0]?.heldResponse, undefined);
    assert.deepEqual(f.relay.errors, []);
  } finally { await f.close(); }
});
test('held actual Agent response preserves original bytes, status, request identity and headers', async () => {
  const f = await fixture();
  try {
    const hold = f.relay.holdNextResponse('/agent/turn');
    const request = fetch(f.relay.url + '/agent/turn', { method: 'POST', body: '{"runId":"owned-run"}' });
    const held = await hold.reached();
    const row = (held.raw as any).record;
    assert.equal(row.requestBody, '{"runId":"owned-run"}');
    assert.deepEqual(Buffer.from(row.heldResponse.bodyBase64, 'base64'), f.bytes);
    assert.equal(row.heldResponse.sha256, createHash('sha256').update(f.bytes).digest('hex'));
    assert.equal(row.responseFinishedAt, undefined);
    await hold.release();
    const reply = await request;
    assert.equal(reply.status, 200); assert.equal(reply.headers.get('x-real-source'), 'self-fixture');
    assert.deepEqual(Buffer.from(await reply.arrayBuffer()), f.bytes);
    assert.equal(f.requests.length, 1);
    await waitFor(() => !!f.relay.ledger[0]?.responseFinishedAt);
    assert.equal(f.relay.ledger[0]?.releaseOutcome, 'forwarded-original-response');
  } finally { await f.close(); }
});
test('real downstream abort followed by release retains upstream completion and does not retry or claim delivery', async () => {
  const f = await fixture();
  try {
    const hold = f.relay.holdNextResponse('/agent/turn'), cancel = new AbortController();
    const request = fetch(f.relay.url + '/agent/turn', { method: 'POST', body: '{"runId":"owned-run"}', signal: cancel.signal }).then(() => 'unexpected response', () => 'aborted');
    const held = await hold.reached(), first = (held.raw as any).record;
    const timeoutLower = Date.now(); cancel.abort(); assert.equal(await request, 'aborted');
    await waitFor(() => !!f.relay.ledger[0]?.closedAt);
    const timeoutUpper = Date.now();
    await hold.release(); const late = await hold.facts();
    assertDelayedAgentResponse(held.raw, late.raw, 'owned-run', [timeoutLower, timeoutUpper]);
    assert.equal((late.raw as any).record.releaseOutcome, 'downstream-already-closed');
    assert.equal((late.raw as any).record.responseFinishedAt, undefined);
    assert.deepEqual((late.raw as any).record.heldResponse, first.heldResponse);
    assert.equal(f.requests.length, 1);
    const changed = structuredClone(late.raw) as any; changed.record.heldResponse.bodyBase64 = Buffer.from('substituted').toString('base64');
    assert.throws(() => assertDelayedAgentResponse(held.raw, changed, 'owned-run', [timeoutLower, timeoutUpper]), assert.AssertionError);
    const fabricated = structuredClone(late.raw) as any; fabricated.record.responseFinishedAt = fabricated.record.closedAt;
    assert.throws(() => assertDelayedAgentResponse(held.raw, fabricated, 'owned-run', [timeoutLower, timeoutUpper]), assert.AssertionError);
  } finally { await f.close(); }
});
test('unreached relay hold expires with BLOCKED rather than becoming a fabricated response', async () => {
  const f = await fixture(40);
  try {
    const hold = f.relay.holdNextResponse('/agent/turn');
    await assert.rejects(hold.reached(), PreparationBlocked);
    assert.equal((await hold.facts()).raw && ((await hold.facts()).raw as any).expired, true);
    assert.equal(f.requests.length, 0); assert.equal(f.relay.ledger.length, 0);
  } finally { await f.close(); }
});
