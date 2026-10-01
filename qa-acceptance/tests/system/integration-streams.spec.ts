import { createHash } from 'node:crypto';
import { test, expect } from '../fixtures.js';
import {
  ReceiptSocket,
  assertReceiptSubset,
  assertCompleteReceipts,
  finalizeReceipts,
  type ReceivedFrame,
} from '../../harness/receipt-socket.js';
import { observe } from '../../harness/observation.js';
import { BlockedError, redact } from '../../harness/security.js';
import type { Message, PlatformClient } from '../../harness/platform-client.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const identity = (message: Message) =>
  message.clientMsgId ? `client:${message.clientMsgId}` : `message:${message.msgId}`;
function uniqueMessages(items: readonly Message[]): void {
  for (const message of items)
    expect(Boolean(message.clientMsgId || message.msgId), 'Message lacks a stable identity').toBe(
      true,
    );
  expect(new Set(items.map(identity)).size, 'Duplicate identity in snapshot').toBe(items.length);
}
function messageSubset(
  items: readonly Message[],
  expected: ReadonlyMap<string, { text: string; sentAt?: string }>,
): void {
  uniqueMessages(items);
  for (const item of items) {
    const value = expected.get(identity(item));
    expect(value, 'Unexpected message identity in snapshot').toBeDefined();
    expect(item.text).toBe(value!.text);
    if (value!.sentAt !== undefined) expect(item.sentAt).toBe(value!.sentAt);
  }
}
async function allMessages(
  api: PlatformClient,
  groupId: string,
  options: { maxPages?: number; inspect?: (items: Message[]) => void; budgetMs?: number } = {},
): Promise<Message[]> {
  const items: Message[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  const started = performance.now();
  for (let pages = 0; pages < (options.maxPages ?? 20); pages++) {
    const page = await api.messages(groupId, cursor, 50);
    items.push(...page.items);
    uniqueMessages(items);
    options.inspect?.(items);
    if (performance.now() - started > (options.budgetMs ?? 15000))
      throw new BlockedError(
        'QA snapshot traversal time budget exhausted; no product throughput SLA inferred',
      );
    if (!page.nextCursor) return items;
    expect(cursors.has(page.nextCursor), 'cursor cycle').toBe(false);
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new BlockedError('QA traversal budget exhausted before end of snapshot');
}

test('[INT-STREAM-001] real paused reader leaves healthy consumer working and received-cursor replay complete', async ({
  qa,
}) => {
  test.setTimeout(180_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const slow = new ReceiptSocket(qa.api.baseUrl);
  const healthy = new ReceiptSocket(qa.api.baseUrl);
  let replay: ReceiptSocket | undefined;
  const expected = new Map<string, string>();
  let checkpoint = 0;
  let primaryFailed = false;
  const ancillary = new Set(['pause-checkpoint']);
  const projectFrame = (frame: ReceivedFrame) => ({
    seq: frame.seq,
    type: frame.type,
    groupId: frame.groupId,
    msgId: frame.msgId,
    isOwn: frame.isOwn,
  });
  const receipts = (client: ReceiptSocket) => {
    client.assertNoErrors();
    const selected = assertReceiptSubset(client.frames, new Set(expected.keys()), ancillary);
    for (const frame of selected) expect(frame).toMatchObject({ groupId: group.id, isOwn: false });
    return selected;
  };
  try {
    await Promise.all([slow.authenticate(qa.api.token!), healthy.authenticate(qa.api.token!)]);
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'pause-checkpoint',
      senderPlatformUserId: 'outside',
      text: 'checkpoint',
    });
    const ready = await observe({
      read: async () => [slow.frames, healthy.frames],
      invariant: () => {
        slow.assertHealthy();
        healthy.assertHealthy();
        receipts(slow);
        receipts(healthy);
      },
      complete: (values) =>
        values.every((frames) => frames.some((f) => f.msgId === 'pause-checkpoint')),
      durationMs: 10000,
    });
    if (!ready.complete) throw new BlockedError('Initial received cursor was not established');
    checkpoint = slow.pause();
    expect(checkpoint).toBeGreaterThan(0);
    const receiptCount = slow.frames.length;
    // A bounded QA injection profile, not a production capacity or latency target.
    const end = performance.now() + 45000;
    for (let offset = 0; offset < 2048; offset += 32) {
      for (let i = offset; i < offset + 32; i++) {
        const msgId = `slow-stream-${i}`;
        const text = `${msgId}:` + 'x'.repeat(8192);
        expected.set(msgId, hash(text));
        qa.gateway.emitMessage({
          groupId: group.gatewayGroupId,
          msgId,
          senderPlatformUserId: 'outside',
          text,
        });
      }
      const observed = await observe({
        read: async () => receipts(healthy),
        invariant: () => {
          healthy.assertHealthy();
          receipts(slow);
          expect(slow.lastReceivedSeq).toBe(checkpoint);
        },
        complete: (frames) => frames.length === expected.size,
        durationMs: Math.max(0, Math.min(10000, end - performance.now())),
      });
      if (!observed.complete || performance.now() > end)
        throw new BlockedError(
          'Bounded slow-reader injection did not establish the complete healthy receipt set; no throughput SLA inferred',
        );
    }
    expect(slow.frames).toHaveLength(receiptCount);
    // WS requires message identity, not payload.text. Check text via public history.
    const apiExpected = new Map<string, { text: string }>([
      ['message:pause-checkpoint', { text: 'checkpoint' }],
    ]);
    for (const msgId of expected.keys())
      apiExpected.set(`message:${msgId}`, { text: `${msgId}:` + 'x'.repeat(8192) });
    const history = await allMessages(qa.api, group.id, {
      maxPages: 60,
      budgetMs: 30000,
      inspect: (items) => messageSubset(items, apiExpected),
    });
    expect(history).toHaveLength(expected.size + 1);
    for (const message of history.filter((entry) => entry.msgId?.startsWith('slow-stream-')))
      expect(hash(message.text)).toBe(expected.get(message.msgId!));
    // No reading or application-level discarding while waiting for a server-side close.
    await observe({
      read: async () => healthy.closed,
      invariant: () => {
        healthy.assertHealthy();
        receipts(healthy);
        receipts(slow);
      },
      complete: () => false,
      durationMs: 8000,
    });
    slow.resume();
    const closure = await observe({
      read: async () => slow.closed,
      invariant: () => {
        healthy.assertHealthy();
        receipts(healthy);
        receipts(slow);
      },
      complete: (value) => !!value,
      durationMs: 8000,
    });
    if (!closure.complete)
      throw new BlockedError(
        'Real reader was paused, but this bounded profile did not prove server-side closure; increase an explicitly reviewed workload or supply transport observation, never fake sender callbacks',
      );

    // Use the last actually received cursor after draining the old connection,
    // never a server attempted-send position or the healthy client's cursor.
    const receivedBeforeReconnect = slow.lastReceivedSeq;
    const receivedHealthy = receipts(healthy);
    const receivedSlow = receipts(slow);
    expect(receivedSlow.map(projectFrame)).toEqual(
      receivedHealthy.filter((frame) => frame.seq! <= receivedBeforeReconnect).map(projectFrame),
    );
    const missing = healthy.frames.filter(
      (f) =>
        f.seq !== undefined &&
        f.seq > receivedBeforeReconnect &&
        f.msgId?.startsWith('slow-stream-'),
    );
    if (!missing.length)
      throw new BlockedError(
        'Peer closed but old buffered data fully drained; replay-gap prerequisite was not demonstrated',
      );
    replay = new ReceiptSocket(qa.api.baseUrl);
    await replay.authenticate(qa.api.token!, receivedBeforeReconnect);
    const replayClient = replay;
    const restored = await observe({
      read: async () => {
        replayClient.assertNoErrors();
        return assertReceiptSubset(
          replayClient.frames,
          new Set(missing.map((frame) => frame.msgId!)),
        );
      },
      invariant: () => {
        replayClient.assertHealthy();
        healthy.assertHealthy();
        receipts(healthy);
        receipts(slow);
      },
      complete: (frames) => frames.length === missing.length,
      durationMs: 15000,
    });
    if (!restored.complete)
      throw new BlockedError(
        'Replay observation budget exhausted; no arbitrary server replay SLA inferred',
      );
    expect(restored.last.map(projectFrame)).toEqual(missing.map(projectFrame));
    const received = receipts(healthy);
    expect(received).toHaveLength(expected.size);
    const completeSlowHistory = [...receivedSlow, ...restored.last];
    assertCompleteReceipts(completeSlowHistory, new Set(expected.keys()));
    expect(completeSlowHistory.map(projectFrame)).toEqual(received.map(projectFrame));
    expect(new Set(completeSlowHistory.map((frame) => frame.msgId))).toEqual(
      new Set(expected.keys()),
    );
    await observe({
      read: async () => replayClient.frames,
      invariant: () => {
        replayClient.assertHealthy();
        healthy.assertHealthy();
        receipts(healthy);
        receipts(slow);
        const later = assertReceiptSubset(
          replayClient.frames,
          new Set(missing.map((frame) => frame.msgId!)),
        );
        expect(later.map(projectFrame)).toEqual(missing.map(projectFrame));
        assertCompleteReceipts([...receivedSlow, ...later], new Set(expected.keys()));
      },
      complete: () => false,
      durationMs: 1000,
    });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    const secondary = await finalizeReceipts(
      () =>
        qa.evidence('real-reader-receipts', {
          checkpoint,
          profile: { maxMessages: 2048, textPaddingBytes: 8192, injectionBudgetMs: 45000 },
          expected: [...expected],
          slow: { frames: slow.frames, closed: slow.closed, errors: slow.errors },
          healthy: { frames: healthy.frames, closed: healthy.closed, errors: healthy.errors },
          replay: replay
            ? { frames: replay.frames, closed: replay.closed, errors: replay.errors }
            : null,
          limit:
            'Pause/closure/replay are observed externally; does not prove exact buffer high-water, memory bound, timeout cause or browser three-second recovery.',
        }),
      [slow, healthy, ...(replay ? [replay] : [])],
      primaryFailed,
    );
    if (secondary.length) {
      const detail = { errors: secondary.map(String), primaryFailurePreserved: true };
      try {
        await qa.evidence('receipt-finalization-errors', detail);
      } catch {
        console.error(redact(detail));
      }
    }
  }
});

test('[INT-STREAM-002] changing continuation page size preserves frozen identity order and contents across confirmations and backfill', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const baseline = Array.from({ length: 58 }, (_, i) => ({
    msgId: `frozen-${String(i).padStart(3, '0')}`,
    text: `baseline ${i}`,
    sentAt: new Date(Date.now() + 60000 + i * 1000).toISOString(),
  }));
  for (const m of baseline)
    qa.gateway.emitMessage({
      ...m,
      groupId: group.gatewayGroupId,
      senderPlatformUserId: 'outside',
    });
  const baselineExpected = new Map(
    baseline.map((message) => [
      `message:${message.msgId}`,
      { text: message.text, sentAt: message.sentAt },
    ]),
  );
  const loaded = await observe({
    read: () =>
      allMessages(qa.api, group.id, { inspect: (items) => messageSubset(items, baselineExpected) }),
    invariant: () => {},
    complete: (items) => items.length === 58,
    durationMs: 15000,
  });
  if (!loaded.complete) throw new BlockedError('Initial frozen collection not fully materialized');
  const sendBarrier = `snapshot-send-${group.id}`;
  const queryBarrier = `snapshot-query-${group.id}`;
  qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
    omitEvent: true,
    barrier: { phase: 'request', name: sendBarrier },
  });
  const pendingSend = qa.api
    .post<{ clientMsgId: string }>(`/api/groups/${group.id}/send`, {
      accountId: accounts[0]!.id,
      text: 'accepted during snapshot',
    })
    .then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
  let primaryError: unknown;
  try {
    let hit;
    try {
      hit = await qa.gateway.barriers.waitFor(sendBarrier);
    } catch {
      throw new BlockedError('Actual send request did not reach the prerequisite barrier');
    }
    const request = hit.context as { body?: { clientMsgId?: unknown } };
    expect(request.body?.clientMsgId).toEqual(expect.any(String));
    const requestClientMsgId = request.body!.clientMsgId as string;
    const queryPath = `/groups/${group.gatewayGroupId}/messages/by-client-id/${encodeURIComponent(requestClientMsgId)}`;
    // Suppressing SSE alone cannot keep accepted stable: a real successful
    // by-client-id query can independently confirm the send. Hold those genuine
    // responses until the exact cursor's initial contents have been recorded.
    qa.gateway.enqueue(
      queryPath,
      ...Array.from({ length: 32 }, () => ({
        method: 'GET',
        barrier: { phase: 'before-response' as const, name: queryBarrier },
      })),
    );
    qa.gateway.barriers.release(sendBarrier);
    const outcome = await pendingSend;
    if ('error' in outcome) throw outcome.error;
    expect(outcome.value.status).toBe(202);
    const own = outcome.value.body;
    expect(own.clientMsgId).toBe(requestClientMsgId);
    const acceptedExpected = new Map<string, { text: string; sentAt?: string }>(baselineExpected);
    acceptedExpected.set(`client:${own.clientMsgId}`, { text: 'accepted during snapshot' });
    const accepted = await observe({
      read: () =>
        allMessages(qa.api, group.id, {
          inspect: (items) => messageSubset(items, acceptedExpected),
        }),
      invariant: () => {},
      complete: (items) =>
        items.some((m) => m.clientMsgId === own.clientMsgId && m.deliveryStatus === 'accepted'),
      durationMs: 15000,
    });
    if (!accepted.complete)
      throw new BlockedError('Accepted record not observable before snapshot');
    const expectedOrder = [...baseline]
      .reverse()
      .map((m) => `message:${m.msgId}`)
      .concat(`client:${own.clientMsgId}`);
    const first = await qa.api.messages(group.id, undefined, 7);
    expect(first.items.length).toBeLessThanOrEqual(7);
    const initialSnapshot = [...first.items];
    messageSubset(initialSnapshot, acceptedExpected);
    let referenceCursor = first.nextCursor;
    const referenceCursors = new Set<string>();
    const referenceStarted = performance.now();
    while (referenceCursor) {
      expect(referenceCursors.has(referenceCursor)).toBe(false);
      referenceCursors.add(referenceCursor);
      const page = await qa.api.messages(group.id, referenceCursor, 50);
      expect(page.items.length).toBeLessThanOrEqual(50);
      initialSnapshot.push(...page.items);
      messageSubset(initialSnapshot, acceptedExpected);
      referenceCursor = page.nextCursor;
      if (
        referenceCursor &&
        (referenceCursors.size >= 75 || performance.now() - referenceStarted > 15_000)
      )
        throw new BlockedError('Finite same-cursor reference traversal budget exhausted');
    }
    expect(initialSnapshot.map(identity)).toEqual(expectedOrder);
    const acceptedOwn = initialSnapshot.find((m) => m.clientMsgId === own.clientMsgId)!;
    if (acceptedOwn?.deliveryStatus !== 'accepted')
      throw new BlockedError(
        'The tested cursor did not freeze the intended accepted record before confirmation',
      );
    await qa.evidence('same-cursor-before-confirmation', {
      first,
      initialSnapshot,
      acceptedOwn,
      queryRequests: qa.gateway.snapshot().requests.filter((r) => r.path === queryPath),
    });
    const frozen = [...first.items];
    messageSubset(frozen, acceptedExpected);
    let cursor = first.nextCursor;
    const landed = qa.gateway.snapshot().messages.find((m) => m.clientMsgId === own.clientMsgId);
    if (!landed) throw new BlockedError('Gateway has not landed held-confirmation fixture');
    qa.gateway.barriers.release(queryBarrier);
    qa.gateway.emit('message_sent', {
      clientMsgId: own.clientMsgId,
      msgId: landed.msgId,
      sentAt: landed.sentAt,
    });
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'new-during-frozen',
      senderPlatformUserId: 'outside',
      text: 'new',
      sentAt: new Date(Date.now() + 120000).toISOString(),
    });
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'backfill-during-frozen',
      senderPlatformUserId: 'outside',
      text: 'old',
      sentAt: '2010-01-01T00:00:00.000Z',
    });
    const mergedExpected = new Map(acceptedExpected);
    mergedExpected.set('message:new-during-frozen', { text: 'new' });
    mergedExpected.set('message:backfill-during-frozen', {
      text: 'old',
      sentAt: '2010-01-01T00:00:00.000Z',
    });
    const merged = await observe({
      read: () =>
        allMessages(qa.api, group.id, { inspect: (items) => messageSubset(items, mergedExpected) }),
      invariant: () => {},
      complete: (items) =>
        items.length === 61 &&
        items.some((m) => m.clientMsgId === own.clientMsgId && m.deliveryStatus === 'sent'),
      durationMs: 15000,
    });
    if (!merged.complete)
      throw new BlockedError('Concurrent update/backfill fixture did not become visible');
    const cursors = new Set<string>();
    const sizes = [1, 9, 4, 17, 3];
    let pageIndex = 0;
    while (cursor) {
      expect(cursors.has(cursor)).toBe(false);
      cursors.add(cursor);
      const limit = sizes[pageIndex++ % sizes.length]!;
      const page = await qa.api.messages(group.id, cursor, limit);
      expect(page.items.length).toBeLessThanOrEqual(limit);
      frozen.push(...page.items);
      messageSubset(frozen, acceptedExpected);
      cursor = page.nextCursor;
      expect(pageIndex).toBeLessThan(30);
    }
    expect(frozen.map(identity)).toEqual(expectedOrder);
    expect(new Set(frozen.map(identity)).size).toBe(59);
    expect(frozen.find((m) => m.clientMsgId === own.clientMsgId)).toEqual(acceptedOwn);
    for (const m of baseline) expect(frozen.find((row) => row.msgId === m.msgId)).toMatchObject(m);
    const refreshed = merged.last;
    expect(refreshed.map(identity)).toEqual([
      'message:new-during-frozen',
      ...expectedOrder,
      'message:backfill-during-frozen',
    ]);
    expect(refreshed.filter((m) => m.clientMsgId === own.clientMsgId)).toHaveLength(1);
    expect(refreshed.find((m) => m.clientMsgId === own.clientMsgId)).toMatchObject({
      msgId: landed.msgId,
      deliveryStatus: 'sent',
      sentAt: landed.sentAt,
    });
    await qa.evidence('frozen-page-size-change', {
      baseline,
      expectedOrder,
      pageSizes: sizes,
      frozen,
      refreshed,
      acceptedOwn,
      landed,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    qa.gateway.barriers.release(sendBarrier);
    qa.gateway.barriers.release(queryBarrier);
    // The result is handled from creation, including a setup failure before clientMsgId was known.
    const outcome = await pendingSend;
    if (primaryError instanceof BlockedError && 'value' in outcome)
      expect(outcome.value.status).toBe(202); // An actual invalid response must not hide behind setup BLOCKED.
  }
});
