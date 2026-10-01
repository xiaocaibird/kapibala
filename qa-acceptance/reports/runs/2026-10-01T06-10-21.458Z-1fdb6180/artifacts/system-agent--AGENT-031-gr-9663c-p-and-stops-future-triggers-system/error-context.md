# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-031] group write error cancels current run after its step and stops future triggers
- Location: tests/system/agent.spec.ts:959:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "cancelled"
Received: "failed"
```

# Test source

```ts
  878  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  879  |   ).toHaveLength(1);
  880  |   await qa.evidence('send-timeout-window', {
  881  |     startBounds: [toolResponseAt, sendRequestAt],
  882  |     latestCompletionObservation: timeoutObservedAt,
  883  |     requiredMaximumMs: 5_000,
  884  |   });
  885  |   if (timeoutObservedAt - toolResponseAt > 5_000)
  886  |     throw new BlockedError(
  887  |       'SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied',
  888  |     );
  889  | });
  890  | 
  891  | test('[AGENT-029] kick timeout reconciles membership and never executes twice', async ({ qa }) => {
  892  |   await qa.api.login();
  893  |   const { group } = await qa.api.createGroup();
  894  |   qa.gateway.setMembership(group.gatewayGroupId, 'kick-timeout-target', true);
  895  |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  896  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
  897  |     status: 504,
  898  |     code: 'NETWORK_TIMEOUT',
  899  |     effect: 'apply',
  900  |     effectDelayMs: 1_500,
  901  |     omitEvent: true,
  902  |   });
  903  |   qa.agent.enqueueTurns(
  904  |     tool('kick-timeout', 'kick_user', {
  905  |       platform_user_id: 'kick-timeout-target',
  906  |       reason: 'reconcile',
  907  |     }),
  908  |     finish(),
  909  |   );
  910  |   const run = await finished(qa, await trigger(qa, group));
  911  |   expect(run.status).toBe('finished');
  912  |   expect(run.steps[0]!.isError).toBe(false);
  913  |   expect(
  914  |     qa.gateway
  915  |       .snapshot()
  916  |       .groups[0]!.members.some((member) => member.platformUserId === 'kick-timeout-target'),
  917  |   ).toBe(false);
  918  |   expect(
  919  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  920  |   ).toHaveLength(1);
  921  | });
  922  | 
  923  | test('[AGENT-030] account becoming terminal during send returns SEND_FAILED and run continues', async ({
  924  |   qa,
  925  | }) => {
  926  |   await qa.api.login();
  927  |   const { group } = await qa.api.createGroup();
  928  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  929  |     barrier: { phase: 'request', name: 'send-before-effect' },
  930  |     effectDelayMs: 1_000,
  931  |   });
  932  |   qa.agent.enqueueTurns(
  933  |     tool('terminal-send', 'send_message', {
  934  |       text: 'terminal in flight',
  935  |       idempotency_key: 'terminal',
  936  |     }),
  937  |     finish('continued'),
  938  |   );
  939  |   const id = await trigger(qa, group);
  940  |   const hit = await qa.gateway.barriers.waitFor('send-before-effect');
  941  |   const request = qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!;
  942  |   const sender = (request.body as { accountId: string }).accountId;
  943  |   qa.gateway.emitStatus(sender, 'suspended');
  944  |   await eventually(
  945  |     () => qa.api.accounts(),
  946  |     (values) => values.find((account) => account.id === sender)?.status === 'suspended',
  947  |   );
  948  |   qa.gateway.barriers.release('send-before-effect');
  949  |   const run = await finished(qa, id);
  950  |   expect(run.status).toBe('finished');
  951  |   expect(run.summary).toBe('continued');
  952  |   expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'SEND_FAILED' });
  953  |   expect(
  954  |     qa.gateway.snapshot().messages.filter((message) => message.text === 'terminal in flight'),
  955  |   ).toHaveLength(0);
  956  |   await qa.evidence('terminal-during-send-barrier', hit);
  957  | });
  958  | 
  959  | test('[AGENT-031] group write error cancels current run after its step and stops future triggers', async ({
  960  |   qa,
  961  | }) => {
  962  |   await qa.api.login();
  963  |   const { group } = await qa.api.createGroup();
  964  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  965  |     status: 403,
  966  |     code: 'GROUP_WRITE_FORBIDDEN',
  967  |     effect: 'none',
  968  |   });
  969  |   qa.agent.enqueueTurns(
  970  |     tool('unreachable-send', 'send_message', {
  971  |       text: 'blocked group',
  972  |       idempotency_key: 'unreachable',
  973  |     }),
  974  |     finish('must not request'),
  975  |   );
  976  |   const id = await trigger(qa, group);
  977  |   const run = await finished(qa, id);
> 978  |   expect(run.status).toBe('cancelled');
       |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  979  |   expect(run.endReason).toBe('cancelled');
  980  |   expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'GROUP_UNREACHABLE' });
  981  |   expect((await qa.api.group(group.id)).status).toBe('unreachable');
  982  |   qa.gateway.emitMessage({
  983  |     groupId: group.gatewayGroupId,
  984  |     senderPlatformUserId: 'external',
  985  |     text: 'must not trigger',
  986  |   });
  987  |   await new Promise((resolve) => setTimeout(resolve, 1_100));
  988  |   expect(
  989  |     await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  990  |   ).toHaveLength(1);
  991  |   expect(requests(qa)).toHaveLength(1);
  992  | });
  993  | 
  994  | test('[AGENT-032] twelve distinct turns exhaust budget without a thirteenth request', async ({
  995  |   qa,
  996  | }) => {
  997  |   await qa.api.login();
  998  |   const { group } = await qa.api.createGroup();
  999  |   qa.agent.enqueueTurns(
  1000 |     ...Array.from({ length: 13 }, (_, index) =>
  1001 |       tool(`budget-${index}`, 'get_recent_messages', { limit: index + 1 }),
  1002 |     ),
  1003 |   );
  1004 |   const run = await finished(qa, await trigger(qa, group));
  1005 |   expect(run.status).toBe('failed');
  1006 |   expect(run.endReason).toBe('budget_exhausted');
  1007 |   expect(run.steps).toHaveLength(12);
  1008 |   expect(requests(qa)).toHaveLength(12);
  1009 | });
  1010 | 
  1011 | test('[AGENT-033] audit retries resolve before informing agent and do not consume turn budget', async ({
  1012 |   qa,
  1013 | }) => {
  1014 |   await qa.api.login();
  1015 |   const { group } = await qa.api.createGroup();
  1016 |   qa.agent.enqueueAudits(
  1017 |     { status: 500 },
  1018 |     { body: {} },
  1019 |     { body: { verdict: 'pass', reason: 'third attempt' } },
  1020 |   );
  1021 |   qa.agent.enqueueTurns(
  1022 |     tool('audit-retry', 'send_message', {
  1023 |       text: 'after valid verdict',
  1024 |       idempotency_key: 'audit-retry',
  1025 |     }),
  1026 |     finish(),
  1027 |   );
  1028 |   const run = await finished(qa, await trigger(qa, group));
  1029 |   expect(run.status).toBe('finished');
  1030 |   expect(run.steps).toHaveLength(2);
  1031 |   expect(run.steps[0]!.isError).toBe(false);
  1032 |   expect(qa.agent.snapshot().audits).toHaveLength(3);
  1033 |   expect(requests(qa)).toHaveLength(2);
  1034 |   expect(
  1035 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  1036 |   ).toHaveLength(1);
  1037 | });
  1038 | 
```