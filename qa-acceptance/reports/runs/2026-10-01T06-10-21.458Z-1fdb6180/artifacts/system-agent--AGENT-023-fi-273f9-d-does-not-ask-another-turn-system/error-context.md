# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-023] finish tool stores summary and does not ask another turn
- Location: tests/system/agent.spec.ts:687:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "finished"
Received: "failed"
```

# Test source

```ts
  595 |     );
  596 |     const run = await finished(qa, await trigger(qa, group));
  597 |     expect(run.steps[0]).toMatchObject({ isError: true, errorCode: code });
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
> 695 |   expect(run.status).toBe('finished');
      |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  696 |   expect(run.endReason).toBe('final');
  697 |   expect(run.summary).toBe('stored summary');
  698 |   expect(run.steps[0]).toMatchObject({ name: 'finish', isError: false });
  699 |   expect(requests(qa)).toHaveLength(1);
  700 |   expect(
  701 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  702 |   ).toHaveLength(0);
  703 | });
  704 | 
  705 | test('[AGENT-024] turn timeout records error and late response never sends a message', async ({
  706 |   qa,
  707 | }) => {
  708 |   test.setTimeout(45_000);
  709 |   await qa.api.login();
  710 |   const { group } = await qa.api.createGroup();
  711 |   qa.agent.enqueueTurns(
  712 |     {
  713 |       ...tool('too-late', 'send_message', { text: 'late must not send', idempotency_key: 'late' }),
  714 |       responseDelayMs: 16_000,
  715 |     },
  716 |     finish(),
  717 |   );
  718 |   const earliestTurnStart = Date.now();
  719 |   const id = await trigger(qa, group);
  720 |   const observed = await observeRun(
  721 |     qa,
  722 |     id,
  723 |     (run) => run.steps.some((step) => step.errorCode === 'TURN_TIMEOUT'),
  724 |     earliestTurnStart,
  725 |     20_000,
  726 |   );
  727 |   expect(observed.run.steps[0]).toMatchObject({
  728 |     kind: 'protocol_error',
  729 |     errorCode: 'TURN_TIMEOUT',
  730 |   });
  731 |   const firstRequestAt = Date.parse(qa.agent.snapshot().turns[0]!.at);
  732 |   await finished(qa, id);
  733 |   await new Promise((resolve) =>
  734 |     setTimeout(resolve, Math.max(0, firstRequestAt + 16_500 - Date.now())),
  735 |   );
  736 |   expect(
  737 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  738 |   ).toHaveLength(0);
  739 |   expect(qa.agent.snapshot().audits).toHaveLength(0);
  740 |   await timingInterval(
  741 |     qa,
  742 |     'turn-timeout-window',
  743 |     [earliestTurnStart, firstRequestAt],
  744 |     [observed.lower, observed.upper],
  745 |     10_000,
  746 |     15_000,
  747 |   );
  748 | });
  749 | 
  750 | test('[AGENT-025] run reaches sixty-second active wall-clock budget including slow turns', async ({
  751 |   qa,
  752 | }) => {
  753 |   test.setTimeout(80_000);
  754 |   await qa.api.login();
  755 |   const { group } = await qa.api.createGroup();
  756 |   qa.agent.enqueueTurns(
  757 |     ...Array.from({ length: 12 }, (_, index) => ({
  758 |       ...tool(`slow-${index}`, 'get_recent_messages', { limit: (index % 2) + 1 }),
  759 |       responseDelayMs: 8_000,
  760 |     })),
  761 |   );
  762 |   const creationLower = Date.now();
  763 |   const id = await trigger(qa, group);
  764 |   const creationUpper = Date.now();
  765 |   const observed = await observeRun(
  766 |     qa,
  767 |     id,
  768 |     (run) => run.status !== 'running',
  769 |     creationLower,
  770 |     65_000,
  771 |   );
  772 |   expect(observed.run.status).toBe('failed');
  773 |   expect(observed.run.endReason).toBe('wall_clock');
  774 |   expect(observed.run.steps.length).toBeLessThan(12);
  775 |   for (const request of qa.agent.snapshot().turns)
  776 |     expect(
  777 |       Date.parse(request.at) - creationUpper,
  778 |       'A new turn after the latest possible budget deadline is forbidden',
  779 |     ).toBeLessThanOrEqual(60_000);
  780 |   await timingInterval(
  781 |     qa,
  782 |     'wall-clock-window',
  783 |     [creationLower, creationUpper],
  784 |     [observed.lower, observed.upper],
  785 |     60_000,
  786 |     60_000,
  787 |   );
  788 | });
  789 | 
  790 | test('[AGENT-026] no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error', async ({
  791 |   qa,
  792 | }) => {
  793 |   await qa.api.login();
  794 |   const { group, accounts } = await qa.api.createGroup();
  795 |   for (const account of accounts)
```