# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-016] idempotency retry returns current sent state without another audit or send
- Location: tests/system/agent.spec.ts:488:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "finished"
Received: "failed"
```

# Test source

```ts
  414 |       tool(`loop-${index}`, 'get_recent_messages', { limit: 10 }),
  415 |     ),
  416 |   );
  417 |   const run = await finished(qa, await trigger(qa, group));
  418 |   expect(run.steps.length).toBeLessThanOrEqual(12);
  419 |   expect(requests(qa).length).toBeLessThanOrEqual(12);
  420 |   expect(run.status).not.toBe('running');
  421 |   if (run.steps.length === 12) {
  422 |     expect(run.status).toBe('failed');
  423 |     expect(run.endReason).toBe('budget_exhausted');
  424 |   }
  425 | });
  426 | 
  427 | test('[AGENT-014] audit rejection blocks side effect and rejected key remains reusable', async ({
  428 |   qa,
  429 | }) => {
  430 |   await qa.api.login();
  431 |   const { group } = await qa.api.createGroup();
  432 |   qa.agent.enqueueAudits(
  433 |     { body: { verdict: 'fail', reason: 'rejected' } },
  434 |     { body: { verdict: 'pass', reason: 'permitted' } },
  435 |   );
  436 |   qa.agent.enqueueTurns(
  437 |     tool('send-1', 'send_message', { text: 'audited text', idempotency_key: 'reused' }),
  438 |     tool('send-2', 'send_message', { text: 'audited text', idempotency_key: 'reused' }),
  439 |     finish(),
  440 |   );
  441 |   const run = await finished(qa, await trigger(qa, group));
  442 |   expect(run.status).toBe('finished');
  443 |   expect(run.steps[0]).toMatchObject({
  444 |     isError: true,
  445 |     errorCode: 'AUDIT_REJECTED',
  446 |     auditVerdict: 'fail',
  447 |   });
  448 |   expect(run.steps[1]!.auditVerdict).toBe('pass');
  449 |   expect(qa.agent.snapshot().audits).toHaveLength(2);
  450 |   await eventually(
  451 |     async () => qa.gateway.snapshot().messages.filter((message) => message.text === 'audited text'),
  452 |     (value) => value.length === 1,
  453 |   );
  454 |   expect(
  455 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  456 |   ).toHaveLength(1);
  457 |   expect(qa.agent.snapshot().audits.map((request) => request.body)).toEqual([
  458 |     { text: 'audited text', groupId: group.id },
  459 |     { text: 'audited text', groupId: group.id },
  460 |   ]);
  461 | });
  462 | 
  463 | test('[AGENT-015] three inconclusive audit attempts block run without execution', async ({
  464 |   qa,
  465 | }) => {
  466 |   await qa.api.login();
  467 |   const { group } = await qa.api.createGroup();
  468 |   qa.agent.enqueueAudits(
  469 |     { status: 500, rawBody: 'error' },
  470 |     { rawBody: 'not json' },
  471 |     { body: { verdict: 'unknown' } },
  472 |   );
  473 |   qa.agent.enqueueTurns(
  474 |     tool('audit-block', 'send_message', { text: 'never execute', idempotency_key: 'blocked' }),
  475 |     finish(),
  476 |   );
  477 |   const run = await finished(qa, await trigger(qa, group));
  478 |   expect(run.status).toBe('blocked');
  479 |   expect(run.endReason).toBe('audit_blocked');
  480 |   expect(run.steps).toHaveLength(1);
  481 |   expect(qa.agent.snapshot().audits).toHaveLength(3);
  482 |   expect(requests(qa)).toHaveLength(1);
  483 |   expect(
  484 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  485 |   ).toHaveLength(0);
  486 | });
  487 | 
  488 | test('[AGENT-016] idempotency retry returns current sent state without another audit or send', async ({
  489 |   qa,
  490 | }) => {
  491 |   await qa.api.login();
  492 |   const { group } = await qa.api.createGroup();
  493 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/send`, {
  494 |     status: 504,
  495 |     code: 'NETWORK_TIMEOUT',
  496 |     effect: 'apply',
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
> 514 |   expect(run.status).toBe('finished');
      |                      ^ Error: expect(received).toBe(expected) // Object.is equality
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
```