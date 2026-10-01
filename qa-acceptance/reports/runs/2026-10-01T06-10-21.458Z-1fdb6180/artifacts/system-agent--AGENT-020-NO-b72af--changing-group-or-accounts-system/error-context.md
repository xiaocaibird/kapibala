# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-020] NO_PERMISSION is returned as tool error without changing group or accounts
- Location: tests/system/agent.spec.ts:584:3

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "errorCode": "NO_PERMISSION",
+   "errorCode": "BAD_JSON",
    "isError": true,
  }
```

# Test source

```ts
  497 |     effectDelayMs: 1_500,
  498 |   });
  499 |   qa.agent.enqueueTurns(
  500 |     tool('send-first', 'send_message', {
  501 |       text: 'one logical message',
  502 |       idempotency_key: 'same-key',
  503 |     }),
  504 |     {
  505 |       ...tool('send-again', 'send_message', {
  506 |         text: 'one logical message',
  507 |         idempotency_key: 'same-key',
  508 |       }),
  509 |       responseDelayMs: 1_600,
  510 |     },
  511 |     finish(),
  512 |   );
  513 |   const run = await finished(qa, await trigger(qa, group));
  514 |   expect(run.status).toBe('finished');
  515 |   expect(qa.agent.snapshot().audits).toHaveLength(1);
  516 |   expect(
  517 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  518 |   ).toHaveLength(1);
  519 |   const result = results(qa).find((block) => block.tool_use_id === 'send-again')!;
  520 |   expect(result.is_error ?? false).toBe(false);
  521 |   expect(JSON.parse(result.content!).deliveryStatus).toBe('sent');
  522 |   expect(
  523 |     qa.gateway.snapshot().messages.filter((message) => message.text === 'one logical message'),
  524 |   ).toHaveLength(1);
  525 | });
  526 | 
  527 | test('[AGENT-017] kick denied by policy never calls external kick', async ({ qa }) => {
  528 |   await qa.api.login();
  529 |   const { group } = await qa.api.createGroup();
  530 |   qa.gateway.setMembership(group.gatewayGroupId, 'target-user', true);
  531 |   qa.agent.enqueueTurns(
  532 |     tool('kick-denied', 'kick_user', { platform_user_id: 'target-user', reason: 'policy check' }),
  533 |     finish(),
  534 |   );
  535 |   const run = await finished(qa, await trigger(qa, group));
  536 |   expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'POLICY_DENIED' });
  537 |   expect(
  538 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  539 |   ).toHaveLength(0);
  540 |   expect(
  541 |     qa.gateway
  542 |       .snapshot()
  543 |       .groups[0]!.members.some((member) => member.platformUserId === 'target-user'),
  544 |   ).toBe(true);
  545 | });
  546 | 
  547 | test('[AGENT-018] permitted kick audits exact action and uses owner or promoted member', async ({
  548 |   qa,
  549 | }) => {
  550 |   await qa.api.login();
  551 |   const { group } = await qa.api.createGroup();
  552 |   qa.gateway.setMembership(group.gatewayGroupId, 'target-user', true);
  553 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  554 |   qa.agent.enqueueTurns(
  555 |     tool('kick', 'kick_user', { platform_user_id: 'target-user', reason: 'test reason' }),
  556 |     finish(),
  557 |   );
  558 |   const run = await finished(qa, await trigger(qa, group));
  559 |   expect(run.status).toBe('finished');
  560 |   expect(run.steps[0]!.isError).toBe(false);
  561 |   expect(qa.agent.snapshot().audits[0]!.body).toEqual({
  562 |     text: JSON.stringify({
  563 |       action: 'kick',
  564 |       platform_user_id: 'target-user',
  565 |       reason: 'test reason',
  566 |     }),
  567 |     groupId: group.id,
  568 |   });
  569 |   const kick = qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/kick'))!;
  570 |   expect(
  571 |     group.members.filter((member) => member.role !== 'member').map((member) => member.accountId),
  572 |   ).toContain((kick.body as { byAccountId: string }).byAccountId);
  573 |   expect(
  574 |     qa.gateway
  575 |       .snapshot()
  576 |       .groups[0]!.members.some((member) => member.platformUserId === 'target-user'),
  577 |   ).toBe(false);
  578 | });
  579 | 
  580 | for (const [id, code, status] of [
  581 |   ['AGENT-019', 'OWNER_LEFT', 409],
  582 |   ['AGENT-020', 'NO_PERMISSION', 403],
  583 | ] as const)
  584 |   test(`[${id}] ${code} is returned as tool error without changing group or accounts`, async ({
  585 |     qa,
  586 |   }) => {
  587 |     await qa.api.login();
  588 |     const { group } = await qa.api.createGroup();
  589 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  590 |     const accounts = await qa.api.accounts();
  591 |     qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, { status, code, effect: 'none' });
  592 |     qa.agent.enqueueTurns(
  593 |       tool('kick-error', 'kick_user', { platform_user_id: 'target-user', reason: 'test' }),
  594 |       finish(),
  595 |     );
  596 |     const run = await finished(qa, await trigger(qa, group));
> 597 |     expect(run.steps[0]).toMatchObject({ isError: true, errorCode: code });
      |                          ^ Error: expect(received).toMatchObject(expected)
  598 |     expect((await qa.api.group(group.id)).status).toBe('active');
  599 |     expect(await qa.api.accounts()).toEqual(accounts);
  600 |   });
  601 | 
  602 | test('[AGENT-021] recent messages include new arrivals and obey text, count, byte and summary limits', async ({
  603 |   qa,
  604 | }) => {
  605 |   await qa.api.login();
  606 |   const { group } = await qa.api.createGroup();
  607 |   for (let index = 0; index < 55; index++)
  608 |     qa.gateway.emitMessage({
  609 |       groupId: group.gatewayGroupId,
  610 |       msgId: `long-${index}`,
  611 |       senderPlatformUserId: 'outside',
  612 |       text: '汉'.repeat(600),
  613 |       sentAt: new Date(Date.UTC(2026, 0, 1) + index).toISOString(),
  614 |     });
  615 |   await eventually(
  616 |     async () => {
  617 |       const page = await qa.api.messages(group.id);
  618 |       const older = page.nextCursor
  619 |         ? await qa.api.messages(group.id, page.nextCursor)
  620 |         : { items: [] };
  621 |       return page.items.length + older.items.length;
  622 |     },
  623 |     (count) => count === 55,
  624 |   );
  625 |   qa.agent.enqueueTurns(
  626 |     {
  627 |       ...tool('recent', 'get_recent_messages', { limit: 100000 }),
  628 |       barrier: { phase: 'before-response', name: 'read-fresh' },
  629 |     },
  630 |     finish(),
  631 |   );
  632 |   const id = await trigger(qa, group, 'trigger included');
  633 |   await qa.agent.barriers.waitFor('read-fresh');
  634 |   qa.gateway.emitMessage({
  635 |     groupId: group.gatewayGroupId,
  636 |     msgId: 'during-run',
  637 |     senderPlatformUserId: 'outside',
  638 |     text: 'new while running',
  639 |   });
  640 |   await eventually(
  641 |     () => qa.api.messages(group.id),
  642 |     (value) => value.items.some((message) => message.msgId === 'during-run'),
  643 |   );
  644 |   qa.agent.barriers.release('read-fresh');
  645 |   const run = await finished(qa, id);
  646 |   const content = results(qa).find((block) => block.tool_use_id === 'recent')!.content!;
  647 |   const value = JSON.parse(content);
  648 |   expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(8192);
  649 |   expect(value.truncated).toBe(true);
  650 |   expect(value.messages.length).toBeLessThanOrEqual(50);
  651 |   expect(
  652 |     value.messages.some((message: { text: string }) => message.text === 'trigger included'),
  653 |   ).toBe(true);
  654 |   expect(value.messages.some((message: { msgId: string }) => message.msgId === 'during-run')).toBe(
  655 |     true,
  656 |   );
  657 |   for (const message of value.messages) {
  658 |     expect(Array.from(message.text).length).toBeLessThanOrEqual(500);
  659 |     expect(typeof message.isOwn).toBe('boolean');
  660 |   }
  661 |   const times = value.messages.map((message: { sentAt: string }) => message.sentAt);
  662 |   expect(times).toEqual([...times].sort());
  663 |   expect(run.steps.every((value) => Array.from(value.resultSummary).length <= 200)).toBe(true);
  664 | });
  665 | 
  666 | test('[AGENT-022] disabling agent lets current step complete then cancels', async ({ qa }) => {
  667 |   await qa.api.login();
  668 |   const { group } = await qa.api.createGroup();
  669 |   qa.agent.enqueueTurns(
  670 |     {
  671 |       ...tool('current', 'get_recent_messages', { limit: 1 }),
  672 |       barrier: { phase: 'before-response', name: 'current-step' },
  673 |     },
  674 |     finish('must not execute'),
  675 |   );
  676 |   const id = await trigger(qa, group);
  677 |   await qa.agent.barriers.waitFor('current-step');
  678 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
  679 |   qa.agent.barriers.release('current-step');
  680 |   const run = await finished(qa, id);
  681 |   expect(run.status).toBe('cancelled');
  682 |   expect(run.endReason).toBe('cancelled');
  683 |   expect(requests(qa)).toHaveLength(1);
  684 |   expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
  685 | });
  686 | 
  687 | test('[AGENT-023] finish tool stores summary and does not ask another turn', async ({ qa }) => {
  688 |   await qa.api.login();
  689 |   const { group } = await qa.api.createGroup();
  690 |   qa.agent.enqueueTurns(
  691 |     tool('finish-tool', 'finish', { summary: 'stored summary' }),
  692 |     finish('must not request'),
  693 |   );
  694 |   const run = await finished(qa, await trigger(qa, group));
  695 |   expect(run.status).toBe('finished');
  696 |   expect(run.endReason).toBe('final');
  697 |   expect(run.summary).toBe('stored summary');
```