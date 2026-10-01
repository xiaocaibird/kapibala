# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/capacity-control.spec.ts >> [CAP-005] group unreachability during admission wait cancels without a late kick
- Location: tests/system/capacity-control.spec.ts:455:1

# Error details

```
BlockedError: [BLOCKED] 有限观察内未建立真实GROUP_WRITE_FORBIDDEN消息及群不可写前提；不能由群主终态推导
```

# Test source

```ts
  407 |         !independentElapsedBounds ||
  408 |         !independentElapsedBounds.every(Number.isFinite) ||
  409 |         independentElapsedBounds[0] > independentElapsedBounds[1]
  410 |       )
  411 |         throw new BlockedError(
  412 |           '缺少有效独立running→terminal时间上下界，不能采信控制器自报精确60000',
  413 |         );
  414 |       expect(
  415 |         independentElapsedBounds[0],
  416 |         '独立单调时钟已确认晚于60秒，控制器精确值不能掩盖',
  417 |       ).toBeLessThanOrEqual(60_000);
  418 |       expect(
  419 |         independentElapsedBounds[1],
  420 |         '独立单调时钟已确认早于60秒，控制器精确值不能掩盖',
  421 |       ).toBeGreaterThanOrEqual(60_000);
  422 |       expect(
  423 |         Math.max(independentElapsedBounds[0], bounds[0]),
  424 |         '控制器实际活动区间与独立公开观察区间不相交',
  425 |       ).toBeLessThanOrEqual(Math.min(independentElapsedBounds[1], bounds[1]));
  426 |       expect(bounds[0], '已确定超过活动预算才停止').toBeLessThanOrEqual(60_000);
  427 |       expect(bounds[1], '已确定提前冒充预算耗尽').toBeGreaterThanOrEqual(60_000);
  428 |       if (bounds[1] > 60_000)
  429 |         throw new BlockedError('预算决定测量区间跨60秒边界；保留证据，不擅加计时容差');
  430 |       expect(
  431 |         run.steps.filter((step) => step.toolUseId === kick.toolUseId).length,
  432 |       ).toBeLessThanOrEqual(1);
  433 |       await lease.release();
  434 |       await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
  435 |       await captureKickEvidence(qa, 'capacity-budget-final', [kick]);
  436 |     },
  437 |     { clock: true },
  438 |   );
  439 | });
  440 | 
  441 | test('[CAP-004] policy is rechecked after confirmed zero-effect admission deferral', async ({
  442 |   qa,
  443 | }) => {
  444 |   await deferred(qa, 'capacity-policy', async (kick, lease) => {
  445 |     await qa.api.require(qa.api.patch(`/api/groups/${kick.group.id}`, { autoKickEnabled: false }));
  446 |     expect((await qa.api.group(kick.group.id)).autoKickEnabled).toBe(false);
  447 |     await lease.release();
  448 |     finalStep(qa, kick, await terminal(qa, kick), 'POLICY_DENIED');
  449 |     noKick(qa, kick);
  450 |     expect(targetIsPresent(qa, kick)).toBe(true);
  451 |     await captureKickEvidence(qa, 'capacity-policy-final', [kick]);
  452 |   });
  453 | });
  454 | 
  455 | test('[CAP-005] group unreachability during admission wait cancels without a late kick', async ({
  456 |   qa,
  457 | }) => {
  458 |   await deferred(qa, 'capacity-unreachable', async (kick, lease, _control, creationBounds) => {
  459 |     const path = `/groups/${kick.group.gatewayGroupId}/send`;
  460 |     qa.gateway.enqueue(path, { status: 403, code: 'GROUP_WRITE_FORBIDDEN', effect: 'none' });
  461 |     const sent = await qa.api.send(
  462 |       kick.group.id,
  463 |       kick.group.creatorAccountId,
  464 |       'capacity group forbidden probe',
  465 |     );
  466 |     const observation = await observe({
  467 |       read: async () => ({
  468 |         group: await qa.api.group(kick.group.id),
  469 |         messages: await qa.api.messages(kick.group.id),
  470 |       }),
  471 |       durationMs: 15_000,
  472 |       invariant: ({ messages }) => {
  473 |         noKick(qa, kick);
  474 |         const matching = messages.items.filter(
  475 |           (message) => message.clientMsgId === sent.clientMsgId,
  476 |         );
  477 |         expect(matching).toHaveLength(1);
  478 |         expect(
  479 |           qa.gateway
  480 |             .snapshot()
  481 |             .messages.some((message) => message.clientMsgId === sent.clientMsgId),
  482 |         ).toBe(false);
  483 |       },
  484 |       complete: ({ group, messages }) =>
  485 |         group.status === 'unreachable' &&
  486 |         messages.items.some(
  487 |           (message) =>
  488 |             message.clientMsgId === sent.clientMsgId &&
  489 |             message.deliveryStatus === 'failed' &&
  490 |             message.failCode === 'GROUP_WRITE_FORBIDDEN',
  491 |         ),
  492 |     });
  493 |     const request = qa.gateway
  494 |       .snapshot()
  495 |       .requests.find(
  496 |         (entry) =>
  497 |           entry.path === path &&
  498 |           (entry.body as { clientMsgId?: string }).clientMsgId === sent.clientMsgId,
  499 |       );
  500 |     await qa.evidence('capacity-group-write-forbidden-prerequisite', {
  501 |       clientMsgId: sent.clientMsgId,
  502 |       request,
  503 |       observation,
  504 |       gateway: qa.gateway.snapshot(),
  505 |     });
  506 |     if (!observation.complete)
> 507 |       throw new BlockedError(
      |             ^ BlockedError: [BLOCKED] 有限观察内未建立真实GROUP_WRITE_FORBIDDEN消息及群不可写前提；不能由群主终态推导
  508 |         '有限观察内未建立真实GROUP_WRITE_FORBIDDEN消息及群不可写前提；不能由群主终态推导',
  509 |       );
  510 |     expect(request?.responseStatus).toBe(403);
  511 |     expect(request?.completedAt).toBeTruthy();
  512 |     expect(
  513 |       qa.gateway.snapshot().groups.find((group) => group.groupId === kick.group.gatewayGroupId)
  514 |         ?.writable,
  515 |     ).toBe(false);
  516 |     await cancellationAfterRelease(qa, kick, lease, creationBounds, false);
  517 |     await captureKickEvidence(qa, 'capacity-unreachable-final', [kick]);
  518 |   });
  519 | });
  520 | 
  521 | test('[CAP-006] deferred execution rechecks online membership and administrator qualification', async ({
  522 |   qa,
  523 | }) => {
  524 |   for (const variant of ['creator-remains', 'no-qualified-actor'] as const) {
  525 |     await deferred(qa, `capacity-actor-${variant}`, async (kick, lease) => {
  526 |       const admin = kick.group.members.find((member) => member.role === 'admin')!;
  527 |       await disconnectAccount(qa, requireServiceAccountId(admin));
  528 |       if (variant === 'no-qualified-actor') {
  529 |         await disconnectAccount(qa, kick.group.creatorAccountId);
  530 |         qa.gateway.setMembership(kick.group.gatewayGroupId, admin.platformUserId, false);
  531 |         await eventually(
  532 |           () => qa.api.group(kick.group.id),
  533 |           (group) => !group.members.some((member) => member.accountId === admin.accountId),
  534 |         );
  535 |       }
  536 |       await lease.release();
  537 |       if (variant === 'creator-remains') {
  538 |         await assertSingleSuccess(qa, kick);
  539 |         expect((kickRequests(qa, kick.group)[0]!.body as { byAccountId: string }).byAccountId).toBe(
  540 |           kick.group.creatorAccountId,
  541 |         );
  542 |       } else {
  543 |         finalStep(qa, kick, await terminal(qa, kick), 'NO_AVAILABLE_ACCOUNT');
  544 |         noKick(qa, kick);
  545 |       }
  546 |       await captureKickEvidence(qa, `capacity-actor-${variant}-final`, [kick]);
  547 |     });
  548 |   }
  549 | });
  550 | 
  551 | test('[CAP-007] departure or rejoin before deferred dispatch preserves one tool identity and the specified removed-member result', async ({
  552 |   qa,
  553 | }) => {
  554 |   for (const rejoin of [false, true]) {
  555 |     await deferred(qa, `capacity-target-${rejoin ? 'rejoin' : 'leave'}`, async (kick, lease) => {
  556 |       qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, false, { repeat: 2 });
  557 |       if (rejoin)
  558 |         qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, true, { repeat: 2 });
  559 |       // GET is an observation only; the external user need not appear in the service-account member DTO.
  560 |       await qa.api.group(kick.group.id);
  561 |       await lease.release();
  562 |       const run = await terminal(qa, kick);
  563 |       finalStep(qa, kick, run, null);
  564 |       const turns = qa.agent
  565 |         .snapshot()
  566 |         .turns.filter((turn) => (turn.body as { runId?: string }).runId === kick!.runId);
  567 |       const content = turns.flatMap((turn) =>
  568 |         (
  569 |           turn.body as {
  570 |             messages: { content: { type: string; tool_use_id?: string; content?: string }[] }[];
  571 |           }
  572 |         ).messages.flatMap((message) => message.content),
  573 |       );
  574 |       const result = content.find(
  575 |         (block) => block.type === 'tool_result' && block.tool_use_id === kick.toolUseId,
  576 |       );
  577 |       expect(result).toBeDefined();
  578 |       expect(JSON.parse(result!.content!)).toMatchObject({ kicked: true });
  579 |       expect(targetIsPresent(qa, kick)).toBe(false);
  580 |       expect(kickRequests(qa, kick.group).length).toBeLessThanOrEqual(1);
  581 |       expect(kickEffects(qa, kick).length).toBeLessThanOrEqual(1);
  582 |       await captureKickEvidence(qa, `capacity-target-${rejoin ? 'rejoin' : 'leave'}-partial`, [
  583 |         kick,
  584 |       ]);
  585 |     });
  586 |   }
  587 | });
  588 | 
  589 | test('[CAP-008] capacity deferral does not replace a later explicit gateway ownership or permission error', async ({
  590 |   qa,
  591 | }) => {
  592 |   for (const [code, status] of [
  593 |     ['OWNER_LEFT', 409],
  594 |     ['NO_PERMISSION', 403],
  595 |   ] as const) {
  596 |     await deferred(qa, `capacity-error-${code}`, async (kick, lease) => {
  597 |       const beforeGroup = await qa.api.group(kick.group.id);
  598 |       const beforeAccounts = await qa.api.accounts();
  599 |       qa.gateway.enqueue(`/groups/${kick.group.gatewayGroupId}/kick`, {
  600 |         status,
  601 |         code,
  602 |         effect: 'none',
  603 |       });
  604 |       await lease.release();
  605 |       finalStep(qa, kick, await terminal(qa, kick), code);
  606 |       expect(kickRequests(qa, kick.group)).toHaveLength(1);
  607 |       expect(kickEffects(qa, kick)).toHaveLength(0);
```