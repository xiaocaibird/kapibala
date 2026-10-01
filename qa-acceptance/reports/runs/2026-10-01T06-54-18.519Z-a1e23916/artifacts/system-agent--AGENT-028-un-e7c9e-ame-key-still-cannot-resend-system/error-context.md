# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-028] unknown send times out in five seconds and same key still cannot resend
- Location: tests/system/agent.spec.ts:852:1

# Error details

```
BlockedError: [BLOCKED] SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied
```

# Test source

```ts
  807  |     60_000,
  808  |   );
  809  | });
  810  | 
  811  | test('[AGENT-026] no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error', async ({
  812  |   qa,
  813  | }) => {
  814  |   await qa.api.login();
  815  |   const { group, accounts } = await qa.api.createGroup();
  816  |   for (const account of accounts)
  817  |     await qa.api.require(
  818  |       qa.api.post(`/api/accounts/${account.id}/transition`, {
  819  |         expectedFrom: 'online',
  820  |         to: 'disconnected',
  821  |       }),
  822  |     );
  823  |   qa.agent.enqueueTurns(
  824  |     tool('no-account', 'send_message', { text: 'cannot send', idempotency_key: 'no-account' }),
  825  |     finish(),
  826  |   );
  827  |   const run = await finished(qa, await trigger(qa, group));
  828  |   expect(run.status).toBe('finished');
  829  |   expect(run.steps[0]).toMatchObject({
  830  |     kind: 'tool_use',
  831  |     isError: true,
  832  |     errorCode: 'NO_AVAILABLE_ACCOUNT',
  833  |   });
  834  |   expect(
  835  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  836  |   ).toHaveLength(0);
  837  | });
  838  | 
  839  | test('[AGENT-027] raw protocol response truncates to two KiB and remains inspectable', async ({
  840  |   qa,
  841  | }) => {
  842  |   await qa.api.login();
  843  |   const { group } = await qa.api.createGroup();
  844  |   qa.agent.enqueueTurns({ rawBody: 'invalid'.repeat(1000) }, finish());
  845  |   const run = await finished(qa, await trigger(qa, group));
  846  |   expect(run.steps[0]!.kind).toBe('protocol_error');
  847  |   expect(Buffer.byteLength(run.steps[0]!.rawResponse ?? '', 'utf8')).toBeLessThanOrEqual(2048);
  848  |   expect(run.steps[0]!.rawResponse).toBeTruthy();
  849  |   expect('invalid'.repeat(1000).startsWith(run.steps[0]!.rawResponse!)).toBe(true);
  850  | });
  851  | 
  852  | test('[AGENT-028] unknown send times out in five seconds and same key still cannot resend', async ({
  853  |   qa,
  854  | }) => {
  855  |   await qa.api.login();
  856  |   const { group } = await qa.api.createGroup();
  857  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  858  |     status: 504,
  859  |     code: 'NETWORK_TIMEOUT',
  860  |     effect: 'apply',
  861  |     effectDelayMs: 1_500,
  862  |     omitEvent: true,
  863  |     barrier: { phase: 'before-response', name: 'query-down' },
  864  |   });
  865  |   qa.agent.enqueueTurns(
  866  |     tool('send-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  867  |     {
  868  |       ...tool('same-timeout', 'send_message', { text: 'timeout key', idempotency_key: 'timeout' }),
  869  |       barrier: { phase: 'before-response', name: 'retry-same-key' },
  870  |     },
  871  |     finish(),
  872  |   );
  873  |   const id = await trigger(qa, group);
  874  |   await qa.gateway.barriers.waitFor('query-down');
  875  |   qa.gateway.configure({ unavailable: true });
  876  |   const sendRequestAt = Date.parse(
  877  |     qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!.at,
  878  |   );
  879  |   qa.gateway.barriers.release('query-down');
  880  |   await qa.agent.barriers.waitFor('retry-same-key', 8_000);
  881  |   const timeoutObservedAt = Date.parse(qa.agent.snapshot().turns[1]!.at);
  882  |   const toolResponseAt = Date.parse(qa.agent.snapshot().turns[0]!.completedAt!);
  883  |   const timeoutResult = results(qa).find((block) => block.tool_use_id === 'send-timeout')!;
  884  |   expect(timeoutResult.is_error).toBe(true);
  885  |   expect(JSON.parse(timeoutResult.content!).code).toBe('SEND_TIMEOUT');
  886  |   qa.gateway.configure({ unavailable: false });
  887  |   await eventually(
  888  |     () => qa.api.messages(group.id),
  889  |     (value) =>
  890  |       value.items.some(
  891  |         (message) => message.text === 'timeout key' && message.deliveryStatus === 'sent',
  892  |       ),
  893  |     { timeoutMs: 2_000 },
  894  |   );
  895  |   qa.agent.barriers.release('retry-same-key');
  896  |   expect((await finished(qa, id)).status).toBe('finished');
  897  |   expect(qa.agent.snapshot().audits).toHaveLength(1);
  898  |   expect(
  899  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  900  |   ).toHaveLength(1);
  901  |   await qa.evidence('send-timeout-window', {
  902  |     startBounds: [toolResponseAt, sendRequestAt],
  903  |     latestCompletionObservation: timeoutObservedAt,
  904  |     requiredMaximumMs: 5_000,
  905  |   });
  906  |   if (timeoutObservedAt - toolResponseAt > 5_000)
> 907  |     throw new BlockedError(
       |           ^ BlockedError: [BLOCKED] SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied
  908  |       'SEND_TIMEOUT was observed but public endpoints cannot locate tool-result creation precisely enough to certify the five-second limit; no tolerance was applied',
  909  |     );
  910  | });
  911  | 
  912  | test('[AGENT-029] kick timeout reconciles membership and never executes twice', async ({ qa }) => {
  913  |   await qa.api.login();
  914  |   const { group } = await qa.api.createGroup();
  915  |   qa.gateway.setMembership(group.gatewayGroupId, 'kick-timeout-target', true);
  916  |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { autoKickEnabled: true }));
  917  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/kick`, {
  918  |     status: 504,
  919  |     code: 'NETWORK_TIMEOUT',
  920  |     effect: 'apply',
  921  |     effectDelayMs: 1_500,
  922  |     omitEvent: true,
  923  |   });
  924  |   qa.agent.enqueueTurns(
  925  |     tool('kick-timeout', 'kick_user', {
  926  |       platform_user_id: 'kick-timeout-target',
  927  |       reason: 'reconcile',
  928  |     }),
  929  |     finish(),
  930  |   );
  931  |   const run = await finished(qa, await trigger(qa, group));
  932  |   expect(run.status).toBe('finished');
  933  |   expect(run.steps[0]!.isError).toBe(false);
  934  |   expect(
  935  |     qa.gateway
  936  |       .snapshot()
  937  |       .groups[0]!.members.some((member) => member.platformUserId === 'kick-timeout-target'),
  938  |   ).toBe(false);
  939  |   expect(
  940  |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/kick')),
  941  |   ).toHaveLength(1);
  942  | });
  943  | 
  944  | test('[AGENT-030] account becoming terminal during send returns SEND_FAILED and run continues', async ({
  945  |   qa,
  946  | }) => {
  947  |   await qa.api.login();
  948  |   const { group } = await qa.api.createGroup();
  949  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  950  |     barrier: { phase: 'request', name: 'send-before-effect' },
  951  |     effectDelayMs: 1_000,
  952  |   });
  953  |   qa.agent.enqueueTurns(
  954  |     tool('terminal-send', 'send_message', {
  955  |       text: 'terminal in flight',
  956  |       idempotency_key: 'terminal',
  957  |     }),
  958  |     finish('continued'),
  959  |   );
  960  |   const id = await trigger(qa, group);
  961  |   const hit = await qa.gateway.barriers.waitFor('send-before-effect');
  962  |   const request = qa.gateway.snapshot().requests.find((request) => request.path.endsWith('/send'))!;
  963  |   const sender = (request.body as { accountId: string }).accountId;
  964  |   qa.gateway.emitStatus(sender, 'suspended');
  965  |   await eventually(
  966  |     () => qa.api.accounts(),
  967  |     (values) => values.find((account) => account.id === sender)?.status === 'suspended',
  968  |   );
  969  |   qa.gateway.barriers.release('send-before-effect');
  970  |   const run = await finished(qa, id);
  971  |   expect(run.status).toBe('finished');
  972  |   expect(run.summary).toBe('continued');
  973  |   expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'SEND_FAILED' });
  974  |   expect(
  975  |     qa.gateway.snapshot().messages.filter((message) => message.text === 'terminal in flight'),
  976  |   ).toHaveLength(0);
  977  |   await qa.evidence('terminal-during-send-barrier', hit);
  978  | });
  979  | 
  980  | test('[AGENT-031] group write error cancels current run after its step and stops future triggers', async ({
  981  |   qa,
  982  | }) => {
  983  |   await qa.api.login();
  984  |   const { group } = await qa.api.createGroup();
  985  |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  986  |     status: 403,
  987  |     code: 'GROUP_WRITE_FORBIDDEN',
  988  |     effect: 'none',
  989  |   });
  990  |   qa.agent.enqueueTurns(
  991  |     tool('unreachable-send', 'send_message', {
  992  |       text: 'blocked group',
  993  |       idempotency_key: 'unreachable',
  994  |     }),
  995  |     finish('must not request'),
  996  |   );
  997  |   const id = await trigger(qa, group);
  998  |   const run = await finished(qa, id);
  999  |   expect(run.status).toBe('cancelled');
  1000 |   expect(run.endReason).toBe('cancelled');
  1001 |   expect(run.steps[0]).toMatchObject({ isError: true, errorCode: 'GROUP_UNREACHABLE' });
  1002 |   expect((await qa.api.group(group.id)).status).toBe('unreachable');
  1003 |   qa.gateway.emitMessage({
  1004 |     groupId: group.gatewayGroupId,
  1005 |     senderPlatformUserId: 'external',
  1006 |     text: 'must not trigger',
  1007 |   });
```