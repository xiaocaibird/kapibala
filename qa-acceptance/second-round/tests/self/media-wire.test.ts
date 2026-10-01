import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ProviderWireStub, decodeProviderWire, proposalWire } from '../../harness/provider-wire.js';
import { MediaSourceProxy } from '../../harness/media-source.js';
const path = '/v1beta/models/gemini-3.1-flash-lite:generateContent';
const wire = (payload: unknown) => ({ contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }], generationConfig: { candidateCount: 1 } });
const turn = { runId: 'qa-test-run', tools: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'original received input' }] }] };
const post = (url: string, data: unknown, signal?: AbortSignal) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'qa-key-never-logged' }, body: JSON.stringify(data), signal });

test('wire decoder preserves actual ordered history and identifies audit from received bytes', () => {
  const original = wire(turn); const decoded = decodeProviderWire(path, original);
  assert.equal(decoded.purpose, 'turn'); assert.deepEqual(decoded.messages, turn.messages);
  assert.equal(decodeProviderWire(path, wire({ groupId: 'g', text: 'audit body' })).purpose, 'audit');
  assert.throws(() => decodeProviderWire('/unknown', original));
  assert.throws(() => decodeProviderWire(path, { contents: [original.contents[0], original.contents[0]] }));
  assert.deepEqual(proposalWire({ kind: 'tool', name: 'send_message', input: { text: 'hello', idempotency_key: 'unchanged' } }), { decision: { name: 'send_message', input: { text: 'hello', idempotency_key: 'unchanged' } } });
});
test('upstream actual HTTP ledger retains original input and unknown/zero usage without credential', async () => {
  const stub = new ProviderWireStub(); await stub.start();
  try {
    stub.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'answer' }, actualUsage: { inputTokens: 0, outputTokens: 3 } });
    const response = await post(stub.url, wire(turn)); const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200); assert.deepEqual(body.usageMetadata, { promptTokenCount: 0, candidatesTokenCount: 3 });
    assert.deepEqual(stub.calls()[0]!.messages, turn.messages); assert.ok(!JSON.stringify(stub.snapshot()).includes('qa-key-never-logged'));
    assert.equal(stub.calls().length, 1); assert.equal(stub.snapshot().records[0]!.requestBytes, Buffer.byteLength(JSON.stringify(wire(turn))));
  } finally { await stub.close(); }
});
test('upstream barrier is reached by an actual request and release delivers planned response', async () => {
  const stub = new ProviderWireStub(1000); await stub.start();
  try {
    stub.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'after release' } }); const barrier = stub.holdNext('turn');
    const pending = post(stub.url, wire(turn)); const reached = await barrier.reached();
    assert.ok(JSON.stringify(reached.raw).includes(stub.calls()[0]!.id)); assert.equal(stub.snapshot().records[0]!.responseStatus, null);
    await barrier.release(); assert.equal((await pending).status, 200);
  } finally { await stub.close(); }
});
test('armed upstream barrier without real request cannot claim reached', async () => {
  const stub = new ProviderWireStub(30); await stub.start();
  try { const barrier = stub.holdNext('audit'); await assert.rejects(barrier.reached(), /No actual matching/); await barrier.release(); assert.equal(stub.calls().length, 0); }
  finally { await stub.close(); }
});
test('upstream cancellation settles timeout and does not retry', async () => {
  const stub = new ProviderWireStub(1000); await stub.start();
  try {
    stub.enqueue({ purpose: 'turn', fault: 'timeout' });
    await assert.rejects(post(stub.url, wire(turn), AbortSignal.timeout(80)));
    await new Promise((r) => setTimeout(r, 15)); assert.equal(stub.calls().length, 1); assert.equal(stub.snapshot().records[0]!.responseStatus, null);
  } finally { await stub.close(); }
});
test('upstream exposes configured distinct malformed/HTTP outcomes, no implicit retry', async () => {
  const stub = new ProviderWireStub(); await stub.start();
  try {
    for (const fault of ['http-401', 'http-429', 'bad-json', 'multiple-candidates', 'native-function-call', 'truncated', 'safety-blocked'] as const) {
      stub.enqueue({ purpose: 'turn', fault, actualUsage: { inputTokens: 3 } }); const response = await post(stub.url, wire(turn));
      assert.equal(response.status, fault === 'http-401' ? 401 : fault === 'http-429' ? 429 : 200);
      const content = await response.text(); if (fault === 'bad-json') assert.throws(() => JSON.parse(content)); else assert.equal((JSON.parse(content) as { usageMetadata: { promptTokenCount: number } }).usageMetadata.promptTokenCount, 3);
    }
    assert.equal(stub.calls().length, 7);
  } finally { await stub.close(); }
});
async function gateway() {
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain', 'x-qa-upstream': 'unchanged' }); res.end(`gateway:${req.method}:${req.url}`); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
test('media proxy preserves gateway routes and serves exact independent bytes', async () => {
  const backend = await gateway(), source = new MediaSourceProxy(backend.url); await source.start();
  try {
    const passthrough = await fetch(`${source.url}/accounts?limit=4`); assert.equal(await passthrough.text(), 'gateway:GET:/accounts?limit=4'); assert.equal(passthrough.headers.get('x-qa-upstream'), 'unchanged');
    const bytes = Uint8Array.from({ length: 8193 }, (_, i) => i % 251); const item = source.source({ id: 'media-one', bytes });
    assert.deepEqual(new Uint8Array(await (await fetch(item.url)).arrayBuffer()), bytes); assert.equal(source.requests().length, 1); assert.equal(source.requests()[0]!.responseBytes, bytes.length);
    assert.throws(() => source.source({ id: '../outside', bytes })); assert.throws(() => source.setFault(`${backend.url}/media/media-one`, 'none'));
  } finally { await source.close(); await backend.close(); }
});
test('media transient failure consumes one actual request then serves bytes', async () => {
  const backend = await gateway(), source = new MediaSourceProxy(backend.url); await source.start();
  try {
    for (const fault of ['503-once', '408-once', '429-once'] as const) {
      const item = source.source({ id: fault, bytes: Uint8Array.of(1, 2, 3), fault });
      assert.equal((await fetch(item.url)).status, Number(fault.slice(0, 3))); assert.equal((await fetch(item.url)).status, 200);
    }
    assert.equal(source.requests().length, 6);
  } finally { await source.close(); await backend.close(); }
});
test('media redirect/404/oversize are real HTTP responses and source ledger is not egress proof', async () => {
  const backend = await gateway(), source = new MediaSourceProxy(backend.url, 1024); await source.start();
  try {
    const missing = source.source({ id: 'missing', bytes: Uint8Array.of(1), fault: '404' }); assert.equal((await fetch(missing.url)).status, 404);
    const redirected = source.source({ id: 'redirect', bytes: Uint8Array.of(1), fault: 'redirect-foreign' });
    const response = await fetch(redirected.url, { redirect: 'manual' }); assert.equal(response.status, 302); assert.equal(response.headers.get('location'), 'https://qa-foreign.invalid/media/redirected');
    const stream = source.source({ id: 'stream', bytes: Uint8Array.of(1), fault: 'stream-oversize' }); assert.equal((await (await fetch(stream.url)).arrayBuffer()).byteLength, 1025);
    assert.equal(source.requests().length, 3);
  } finally { await source.close(); await backend.close(); }
});
test('media partial source barrier retains real bytes until release and settles client abort', async () => {
  const backend = await gateway(), source = new MediaSourceProxy(backend.url); await source.start();
  try {
    const bytes = Uint8Array.from({ length: 8192 }, (_, i) => i % 239), item = source.source({ id: 'partial-real', bytes });
    const gate = source.holdPartial('partial-real', 1000), pending = fetch(item.url);
    const reached = await gate.reached(); assert.ok(JSON.stringify(reached).includes('4096'));
    assert.equal(source.snapshot().records[0]!.finishedAt, null);
    await gate.release(); assert.deepEqual(new Uint8Array(await (await pending).arrayBuffer()), bytes);
  } finally { await source.close(); await backend.close(); }
});
test('unplanned inference remains an actual call in independent ledger, with explicit failure', async () => {
  const stub = new ProviderWireStub(); await stub.start();
  try { const response = await post(stub.url, wire(turn)); assert.equal(response.status, 503); assert.equal(stub.calls().length, 1); assert.match(stub.errors[0]!, /Unplanned/); }
  finally { await stub.close(); }
});
test('raw provider usage preserves JSON types and HTTP500 carries the same untrusted body', async () => {
  const stub = new ProviderWireStub(); await stub.start();
  try {
    const rawUsage = { promptTokenCount: null, candidatesTokenCount: '0', totalTokenCount: Number.MAX_SAFE_INTEGER + 1 };
    stub.enqueue({ purpose: 'turn', rawUsage });
    const accepted = await post(stub.url, wire(turn)); assert.deepEqual((await accepted.json() as { usageMetadata: unknown }).usageMetadata, rawUsage);
    stub.enqueue({ purpose: 'turn', fault: 'http-500', rawUsage });
    const rejected = await post(stub.url, wire(turn)); assert.equal(rejected.status, 500); assert.deepEqual((await rejected.json() as { usageMetadata: unknown }).usageMetadata, rawUsage);
    assert.equal(stub.calls().length, 2);
  } finally { await stub.close(); }
});
