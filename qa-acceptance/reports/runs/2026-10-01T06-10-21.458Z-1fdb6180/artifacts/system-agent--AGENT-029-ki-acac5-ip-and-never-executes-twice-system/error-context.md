# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-029] kick timeout reconciles membership and never executes twice
- Location: tests/system/agent.spec.ts:891:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "finished"
Received: "failed"
```

# Test source

```ts
  811  |     errorCode: 'NO_AVAILABLE_ACCOUNT',
  812  |   });
  813  |   expect(
  814  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  815  |   ).toHaveLength(0);
  816  | });
  817  | 
  818  | test('[AGENT-027] raw protocol response truncates to two KiB and remains inspectable', async ({
  819  |   qa,
  820  | }) => {
  821  |   await qa.api.login();
  822  |   const { group } = await qa.api.createGroup();
  823  |   qa.agent.enqueueTurns({ rawBody: 'invalid'.repeat(1000) }, finish());
  824  |   const run = await finished(qa, await trigger(qa, group));
  825  |   expect(run.steps[0]!.kind).toBe('protocol_error');
  826  |   expect(Buffer.byteLength(run.steps[0]!.rawResponse ?? '', 'utf8')).toBeLessThanOrEqual(2048);
  827  |   expect(run.steps[0]!.rawResponse).toBeTruthy();
  828  |   expect('invalid'.repeat(1000).startsWith(run.steps[0]!.rawResponse!)).toBe(true);
  829  | });
  830  | 
  831  | test('[AGENT-028] unknown send times out in five seconds and same key still cannot resend', async ({
  832  |   qa,
  833  | }) => {
  834  |   await qa.api.login();
  835  |   const { group } = await qa.api.createGroup();
  836  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  837  |     status: 504,
  838  |     code: 'NETWORK_TIMEOUT',
  839  |     effect: 'apply',
  840  |     effectDelayMs: 1_500,
  841  |     omitEvent: true,
  842  |     barrier: { phase: 'before-response', name: 'query-down' },
  843  |   });
  844  |   qa.agent.enqueueTurns(
  845  |     tool('send-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  846  |     {
  847  |       ...tool('same-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  848  |       barrier: { phase: 'before-response', name: 'retry-same-key' },
  849  |     },
  850  |     finish(),
  851  |   );
  852  |   const id = await trigger(qa, group);
  853  |   await qa.gateway.barriers.waitFor('query-down');
  854  |   qa.gateway.configure({ unavailable: true });
  855  |   const sendRequestAt = Date.parse(
  856  |     qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!.at,
  857  |   );
  858  |   qa.gateway.barriers.release('query-down');
  859  |   await qa.agent.barriers.waitFor('retry-same-key', 8_000);
  860  |   const timeoutObservedAt = Date.parse(qa.agent.snapshot().turns[1]!.at);
  861  |   const toolResponseAt = Date.parse(qa.agent.snapshot().turns[0]!.completedAt!);
  862  |   const timeoutResult = results(qa).find((block) => block.tool_use_id === 'send-timeout')!;
  863  |   expect(timeoutResult.is_error).toBe(true);
  864  |   expect(JSON.parse(timeoutResult.content!).code).toBe('SEND_TIMEOUT');
  865  |   qa.gateway.configure({ unavailable: false });
  866  |   await eventually(
  867  |     () => qa.api.messages(group.id),
  868  |     (value) =>
  869  |       value.items.some(
  870  |         (message) => message.text === 'timeout key' && message.deliveryStatus === 'sent',
  871  |       ),
  872  |     { timeoutMs: 2_000 },
  873  |   );
  874  |   qa.agent.barriers.release('retry-same-key');
  875  |   expect((await finished(qa, id)).status).toBe('finished');
  876  |   expect(qa.agent.snapshot().audits).toHaveLength(1);
  877  |   expect(
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
> 911  |   expect(run.status).toBe('finished');
       |                      ^ Error: expect(received).toBe(expected) // Object.is equality
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
  978  |   expect(run.status).toBe('cancelled');
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
```