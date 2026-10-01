# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/integration-streams.spec.ts >> [INT-STREAM-002] changing continuation page size preserves frozen identity order and contents across confirmations and backfill
- Location: tests/system/integration-streams.spec.ts:283:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Object {
    "clientMsgId": "c8401835-d92a-4c94-b30d-f436f5f9bba3",
-   "deliveryStatus": "accepted",
+   "deliveryStatus": "sent",
    "failCode": null,
    "id": "4e051f82-3d2e-49a8-8191-a05b640ee597",
    "isOwn": true,
-   "msgId": null,
+   "msgId": "gateway-message-1",
    "senderPlatformUserId": "platform-account-1",
-   "sentAt": "2026-10-01T06:35:00.283Z",
+   "sentAt": "2026-10-01T06:35:00.394Z",
    "text": "accepted during snapshot",
  }
```

# Test source

```ts
  289 |     msgId: `frozen-${String(i).padStart(3, '0')}`,
  290 |     text: `baseline ${i}`,
  291 |     sentAt: new Date(Date.now() + 60000 + i * 1000).toISOString(),
  292 |   }));
  293 |   for (const m of baseline)
  294 |     qa.gateway.emitMessage({
  295 |       ...m,
  296 |       groupId: group.gatewayGroupId,
  297 |       senderPlatformUserId: 'outside',
  298 |     });
  299 |   const baselineExpected = new Map(
  300 |     baseline.map((message) => [
  301 |       `message:${message.msgId}`,
  302 |       { text: message.text, sentAt: message.sentAt },
  303 |     ]),
  304 |   );
  305 |   const loaded = await observe({
  306 |     read: () =>
  307 |       allMessages(qa.api, group.id, { inspect: (items) => messageSubset(items, baselineExpected) }),
  308 |     invariant: () => {},
  309 |     complete: (items) => items.length === 58,
  310 |     durationMs: 15000,
  311 |   });
  312 |   if (!loaded.complete) throw new BlockedError('Initial frozen collection not fully materialized');
  313 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, { omitEvent: true });
  314 |   const own = await qa.api.send(group.id, accounts[0]!.id, 'accepted during snapshot');
  315 |   const acceptedExpected = new Map<string, { text: string; sentAt?: string }>(baselineExpected);
  316 |   acceptedExpected.set(`client:${own.clientMsgId}`, { text: 'accepted during snapshot' });
  317 |   const accepted = await observe({
  318 |     read: () =>
  319 |       allMessages(qa.api, group.id, { inspect: (items) => messageSubset(items, acceptedExpected) }),
  320 |     invariant: () => {},
  321 |     complete: (items) =>
  322 |       items.some((m) => m.clientMsgId === own.clientMsgId && m.deliveryStatus === 'accepted'),
  323 |     durationMs: 15000,
  324 |   });
  325 |   if (!accepted.complete) throw new BlockedError('Accepted record not observable before snapshot');
  326 |   const acceptedOwn = accepted.last.find((m) => m.clientMsgId === own.clientMsgId)!;
  327 |   const first = await qa.api.messages(group.id, undefined, 7);
  328 |   const expectedOrder = [...baseline]
  329 |     .reverse()
  330 |     .map((m) => `message:${m.msgId}`)
  331 |     .concat(`client:${own.clientMsgId}`);
  332 |   const frozen = [...first.items];
  333 |   messageSubset(frozen, acceptedExpected);
  334 |   let cursor = first.nextCursor;
  335 |   const landed = qa.gateway.snapshot().messages.find((m) => m.clientMsgId === own.clientMsgId);
  336 |   if (!landed) throw new BlockedError('Gateway has not landed held-confirmation fixture');
  337 |   qa.gateway.emit('message_sent', {
  338 |     clientMsgId: own.clientMsgId,
  339 |     msgId: landed.msgId,
  340 |     sentAt: landed.sentAt,
  341 |   });
  342 |   qa.gateway.emitMessage({
  343 |     groupId: group.gatewayGroupId,
  344 |     msgId: 'new-during-frozen',
  345 |     senderPlatformUserId: 'outside',
  346 |     text: 'new',
  347 |     sentAt: new Date(Date.now() + 120000).toISOString(),
  348 |   });
  349 |   qa.gateway.emitMessage({
  350 |     groupId: group.gatewayGroupId,
  351 |     msgId: 'backfill-during-frozen',
  352 |     senderPlatformUserId: 'outside',
  353 |     text: 'old',
  354 |     sentAt: '2010-01-01T00:00:00.000Z',
  355 |   });
  356 |   const mergedExpected = new Map(acceptedExpected);
  357 |   mergedExpected.set('message:new-during-frozen', { text: 'new' });
  358 |   mergedExpected.set('message:backfill-during-frozen', {
  359 |     text: 'old',
  360 |     sentAt: '2010-01-01T00:00:00.000Z',
  361 |   });
  362 |   const merged = await observe({
  363 |     read: () =>
  364 |       allMessages(qa.api, group.id, { inspect: (items) => messageSubset(items, mergedExpected) }),
  365 |     invariant: () => {},
  366 |     complete: (items) =>
  367 |       items.length === 61 &&
  368 |       items.some((m) => m.clientMsgId === own.clientMsgId && m.deliveryStatus === 'sent'),
  369 |     durationMs: 15000,
  370 |   });
  371 |   if (!merged.complete)
  372 |     throw new BlockedError('Concurrent update/backfill fixture did not become visible');
  373 |   const cursors = new Set<string>();
  374 |   const sizes = [1, 9, 4, 17, 3];
  375 |   let pageIndex = 0;
  376 |   while (cursor) {
  377 |     expect(cursors.has(cursor)).toBe(false);
  378 |     cursors.add(cursor);
  379 |     const limit = sizes[pageIndex++ % sizes.length]!;
  380 |     const page = await qa.api.messages(group.id, cursor, limit);
  381 |     expect(page.items.length).toBeLessThanOrEqual(limit);
  382 |     frozen.push(...page.items);
  383 |     messageSubset(frozen, acceptedExpected);
  384 |     cursor = page.nextCursor;
  385 |     expect(pageIndex).toBeLessThan(30);
  386 |   }
  387 |   expect(frozen.map(identity)).toEqual(expectedOrder);
  388 |   expect(new Set(frozen.map(identity)).size).toBe(59);
> 389 |   expect(frozen.find((m) => m.clientMsgId === own.clientMsgId)).toEqual(acceptedOwn);
      |                                                                 ^ Error: expect(received).toEqual(expected) // deep equality
  390 |   for (const m of baseline) expect(frozen.find((row) => row.msgId === m.msgId)).toMatchObject(m);
  391 |   const refreshed = merged.last;
  392 |   expect(refreshed.map(identity)).toEqual([
  393 |     'message:new-during-frozen',
  394 |     ...expectedOrder,
  395 |     'message:backfill-during-frozen',
  396 |   ]);
  397 |   expect(refreshed.filter((m) => m.clientMsgId === own.clientMsgId)).toHaveLength(1);
  398 |   expect(refreshed.find((m) => m.clientMsgId === own.clientMsgId)).toMatchObject({
  399 |     msgId: landed.msgId,
  400 |     deliveryStatus: 'sent',
  401 |     sentAt: landed.sentAt,
  402 |   });
  403 |   await qa.evidence('frozen-page-size-change', {
  404 |     baseline,
  405 |     expectedOrder,
  406 |     pageSizes: sizes,
  407 |     frozen,
  408 |     refreshed,
  409 |     acceptedOwn,
  410 |     landed,
  411 |   });
  412 | });
  413 | 
```