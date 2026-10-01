# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-026] no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error
- Location: tests/system/agent.spec.ts:790:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "finished"
Received: "failed"
```

# Test source

```ts
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
  796 |     await qa.api.require(
  797 |       qa.api.post(`/api/accounts/${account.id}/transition`, {
  798 |         expectedFrom: 'online',
  799 |         to: 'disconnected',
  800 |       }),
  801 |     );
  802 |   qa.agent.enqueueTurns(
  803 |     tool('no-account', 'send_message', { text: 'cannot send', idempotency_key: 'no-account' }),
  804 |     finish(),
  805 |   );
  806 |   const run = await finished(qa, await trigger(qa, group));
> 807 |   expect(run.status).toBe('finished');
      |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  808 |   expect(run.steps[0]).toMatchObject({
  809 |     kind: 'tool_use',
  810 |     isError: true,
  811 |     errorCode: 'NO_AVAILABLE_ACCOUNT',
  812 |   });
  813 |   expect(
  814 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  815 |   ).toHaveLength(0);
  816 | });
  817 | 
  818 | test('[AGENT-027] raw protocol response truncates to two KiB and remains inspectable', async ({
  819 |   qa,
  820 | }) => {
  821 |   await qa.api.login();
  822 |   const { group } = await qa.api.createGroup();
  823 |   qa.agent.enqueueTurns({ rawBody: 'invalid'.repeat(1000) }, finish());
  824 |   const run = await finished(qa, await trigger(qa, group));
  825 |   expect(run.steps[0]!.kind).toBe('protocol_error');
  826 |   expect(Buffer.byteLength(run.steps[0]!.rawResponse ?? '', 'utf8')).toBeLessThanOrEqual(2048);
  827 |   expect(run.steps[0]!.rawResponse).toBeTruthy();
  828 |   expect('invalid'.repeat(1000).startsWith(run.steps[0]!.rawResponse!)).toBe(true);
  829 | });
  830 | 
  831 | test('[AGENT-028] unknown send times out in five seconds and same key still cannot resend', async ({
  832 |   qa,
  833 | }) => {
  834 |   await qa.api.login();
  835 |   const { group } = await qa.api.createGroup();
  836 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  837 |     status: 504,
  838 |     code: 'NETWORK_TIMEOUT',
  839 |     effect: 'apply',
  840 |     effectDelayMs: 1_500,
  841 |     omitEvent: true,
  842 |     barrier: { phase: 'before-response', name: 'query-down' },
  843 |   });
  844 |   qa.agent.enqueueTurns(
  845 |     tool('send-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  846 |     {
  847 |       ...tool('same-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  848 |       barrier: { phase: 'before-response', name: 'retry-same-key' },
  849 |     },
  850 |     finish(),
  851 |   );
  852 |   const id = await trigger(qa, group);
  853 |   await qa.gateway.barriers.waitFor('query-down');
  854 |   qa.gateway.configure({ unavailable: true });
  855 |   const sendRequestAt = Date.parse(
  856 |     qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!.at,
  857 |   );
  858 |   qa.gateway.barriers.release('query-down');
  859 |   await qa.agent.barriers.waitFor('retry-same-key', 8_000);
  860 |   const timeoutObservedAt = Date.parse(qa.agent.snapshot().turns[1]!.at);
  861 |   const toolResponseAt = Date.parse(qa.agent.snapshot().turns[0]!.completedAt!);
  862 |   const timeoutResult = results(qa).find((block) => block.tool_use_id === 'send-timeout')!;
  863 |   expect(timeoutResult.is_error).toBe(true);
  864 |   expect(JSON.parse(timeoutResult.content!).code).toBe('SEND_TIMEOUT');
  865 |   qa.gateway.configure({ unavailable: false });
  866 |   await eventually(
  867 |     () => qa.api.messages(group.id),
  868 |     (value) =>
  869 |       value.items.some(
  870 |         (message) => message.text === 'timeout key' && message.deliveryStatus === 'sent',
  871 |       ),
  872 |     { timeoutMs: 2_000 },
  873 |   );
  874 |   qa.agent.barriers.release('retry-same-key');
  875 |   expect((await finished(qa, id)).status).toBe('finished');
  876 |   expect(qa.agent.snapshot().audits).toHaveLength(1);
  877 |   expect(
  878 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  879 |   ).toHaveLength(1);
  880 |   await qa.evidence('send-timeout-window', {
  881 |     startBounds: [toolResponseAt, sendRequestAt],
  882 |     latestCompletionObservation: timeoutObservedAt,
  883 |     requiredMaximumMs: 5_000,
  884 |   });
  885 |   if (timeoutObservedAt - toolResponseAt > 5_000)
  886 |     throw new BlockedError(
  887 |       'SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied',
  888 |     );
  889 | });
  890 | 
  891 | test('[AGENT-029] kick timeout reconciles membership and never executes twice', async ({ qa }) => {
  892 |   await qa.api.login();
  893 |   const { group } = await qa.api.createGroup();
  894 |   qa.gateway.setMembership(group.gatewayGroupId, 'kick-timeout-target', true);
  895 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  896 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
  897 |     status: 504,
  898 |     code: 'NETWORK_TIMEOUT',
  899 |     effect: 'apply',
  900 |     effectDelayMs: 1_500,
  901 |     omitEvent: true,
  902 |   });
  903 |   qa.agent.enqueueTurns(
  904 |     tool('kick-timeout', 'kick_user', {
  905 |       platform_user_id: 'kick-timeout-target',
  906 |       reason: 'reconcile',
  907 |     }),
```