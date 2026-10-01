# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/capacity-control.spec.ts >> [CAP-003] persistent admission refusal consumes the original active budget without resetting the clock
- Location: tests/system/capacity-control.spec.ts:239:1

# Error details

```
Error: 已确定超过活动预算才停止

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 60000
Received:    60010
```

# Test source

```ts
  230 |         .snapshot()
  231 |         .turns.filter((turn) => (turn.body as { runId?: string }).runId === kick.runId),
  232 |     ).toHaveLength(1);
  233 |     await lease.release();
  234 |     await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
  235 |     await captureKickEvidence(qa, 'capacity-cancel-final', [kick]);
  236 |   });
  237 | });
  238 | 
  239 | test('[CAP-003] persistent admission refusal consumes the original active budget without resetting the clock', async ({
  240 |   qa,
  241 | }) => {
  242 |   test.setTimeout(120_000);
  243 |   await deferred(
  244 |     qa,
  245 |     'capacity-budget',
  246 |     async (kick, lease, _control, creationBounds) => {
  247 |       let lastRunningRequestBefore: number | undefined;
  248 |       let firstTerminalResponseAfter: number | undefined;
  249 |       const publicSamples: {
  250 |         requestBefore: number;
  251 |         responseAfter: number;
  252 |         status: string;
  253 |         endReason: string | null;
  254 |       }[] = [];
  255 |       const samplePublicRun = async (): Promise<AgentRun> => {
  256 |         const requestBefore = performance.now();
  257 |         const current = await qa.api.agentRun(kick.runId);
  258 |         const responseAfter = performance.now();
  259 |         publicSamples.push({
  260 |           requestBefore,
  261 |           responseAfter,
  262 |           status: current.status,
  263 |           endReason: current.endReason,
  264 |         });
  265 |         if (current.status === 'running') {
  266 |           expect(firstTerminalResponseAfter, '已公开的终态不能重新变为running').toBeUndefined();
  267 |           lastRunningRequestBefore = requestBefore;
  268 |         } else firstTerminalResponseAfter ??= responseAfter;
  269 |         return current;
  270 |       };
  271 |       await samplePublicRun();
  272 |       const snapshot = await lease.waitFor(
  273 |         (value) => value.events.some((event) => event.kind === 'run-terminal'),
  274 |         {
  275 |           timeoutMs: 65_000,
  276 |           inspect: async () => {
  277 |             noKick(qa, kick);
  278 |             onceAudited(qa, kick);
  279 |             await samplePublicRun();
  280 |           },
  281 |         },
  282 |       );
  283 |       const end = snapshot.events.find((event) => event.kind === 'run-terminal')!;
  284 |       expect(end.status).toBe('failed');
  285 |       expect(end.endReason).toBe('wall_clock');
  286 |       const run = await eventually(samplePublicRun, (current) => current.status !== 'running', {
  287 |         timeoutMs: 30_000,
  288 |       });
  289 |       expect(run).toMatchObject({ status: 'failed', endReason: 'wall_clock' });
  290 |       const bounds = end.activeElapsedMs;
  291 |       const independentElapsedBounds =
  292 |         lastRunningRequestBefore === undefined || firstTerminalResponseAfter === undefined
  293 |           ? undefined
  294 |           : ([
  295 |               Math.max(0, lastRunningRequestBefore - creationBounds[1]),
  296 |               firstTerminalResponseAfter - creationBounds[0],
  297 |             ] as const);
  298 |       await qa.evidence('capacity-active-budget', {
  299 |         bounds,
  300 |         requiredMs: 60_000,
  301 |         diagnostic: end,
  302 |         creationBounds,
  303 |         publicSamples,
  304 |         independentElapsedBounds,
  305 |         independentClock:
  306 |           'QA performance.now；终态下界取最后running请求开始，上界取首次terminal响应完成，均减去保守创建区间',
  307 |         limit: '相交仅说明独立观察未证伪控制器；不将轮询或预设deadline宣称为精确60秒实测',
  308 |       });
  309 |       if (!bounds) throw new BlockedError('控制器未提供原 run 活动预算决定的权威时间区间');
  310 |       if (
  311 |         !independentElapsedBounds ||
  312 |         !independentElapsedBounds.every(Number.isFinite) ||
  313 |         independentElapsedBounds[0] > independentElapsedBounds[1]
  314 |       )
  315 |         throw new BlockedError(
  316 |           '缺少有效独立running→terminal时间上下界，不能采信控制器自报精确60000',
  317 |         );
  318 |       expect(
  319 |         independentElapsedBounds[0],
  320 |         '独立单调时钟已确认晚于60秒，控制器精确值不能掩盖',
  321 |       ).toBeLessThanOrEqual(60_000);
  322 |       expect(
  323 |         independentElapsedBounds[1],
  324 |         '独立单调时钟已确认早于60秒，控制器精确值不能掩盖',
  325 |       ).toBeGreaterThanOrEqual(60_000);
  326 |       expect(
  327 |         Math.max(independentElapsedBounds[0], bounds[0]),
  328 |         '控制器实际活动区间与独立公开观察区间不相交',
  329 |       ).toBeLessThanOrEqual(Math.min(independentElapsedBounds[1], bounds[1]));
> 330 |       expect(bounds[0], '已确定超过活动预算才停止').toBeLessThanOrEqual(60_000);
      |                                         ^ Error: 已确定超过活动预算才停止
  331 |       expect(bounds[1], '已确定提前冒充预算耗尽').toBeGreaterThanOrEqual(60_000);
  332 |       if (bounds[0] !== 60_000 || bounds[1] !== 60_000)
  333 |         throw new BlockedError('预算决定测量区间跨60秒边界；保留证据，不擅加计时容差');
  334 |       expect(
  335 |         run.steps.filter((step) => step.toolUseId === kick.toolUseId).length,
  336 |       ).toBeLessThanOrEqual(1);
  337 |       await lease.release();
  338 |       await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
  339 |       await captureKickEvidence(qa, 'capacity-budget-final', [kick]);
  340 |     },
  341 |     { clock: true },
  342 |   );
  343 | });
  344 | 
  345 | test('[CAP-004] policy is rechecked after confirmed zero-effect admission deferral', async ({
  346 |   qa,
  347 | }) => {
  348 |   await deferred(qa, 'capacity-policy', async (kick, lease) => {
  349 |     await qa.api.require(qa.api.patch(`/api/groups/${kick.group.id}`, { autoKickEnabled: false }));
  350 |     expect((await qa.api.group(kick.group.id)).autoKickEnabled).toBe(false);
  351 |     await lease.release();
  352 |     finalStep(qa, kick, await terminal(qa, kick), 'POLICY_DENIED');
  353 |     noKick(qa, kick);
  354 |     expect(targetIsPresent(qa, kick)).toBe(true);
  355 |     await captureKickEvidence(qa, 'capacity-policy-final', [kick]);
  356 |   });
  357 | });
  358 | 
  359 | test('[CAP-005] group unreachability during admission wait cancels without a late kick', async ({
  360 |   qa,
  361 | }) => {
  362 |   await deferred(qa, 'capacity-unreachable', async (kick, lease) => {
  363 |     qa.gateway.emitStatus(kick.group.creatorAccountId, 'suspended');
  364 |     await eventually(
  365 |       () => qa.api.group(kick.group.id),
  366 |       (group) => group.status === 'unreachable',
  367 |     );
  368 |     const run = await terminal(qa, kick);
  369 |     expect(run).toMatchObject({ status: 'cancelled', endReason: 'cancelled' });
  370 |     noKick(qa, kick);
  371 |     onceAudited(qa, kick);
  372 |     await lease.release();
  373 |     await observeNoLateKick(qa, kick, { status: run.status, endReason: run.endReason });
  374 |     await captureKickEvidence(qa, 'capacity-unreachable-final', [kick]);
  375 |   });
  376 | });
  377 | 
  378 | test('[CAP-006] deferred execution rechecks online membership and administrator qualification', async ({
  379 |   qa,
  380 | }) => {
  381 |   for (const variant of ['creator-remains', 'no-qualified-actor'] as const) {
  382 |     await deferred(qa, `capacity-actor-${variant}`, async (kick, lease) => {
  383 |       const admin = kick.group.members.find((member) => member.role === 'admin')!;
  384 |       await disconnectAccount(qa, requireServiceAccountId(admin));
  385 |       if (variant === 'no-qualified-actor') {
  386 |         await disconnectAccount(qa, kick.group.creatorAccountId);
  387 |         qa.gateway.setMembership(kick.group.gatewayGroupId, admin.platformUserId, false);
  388 |         await eventually(
  389 |           () => qa.api.group(kick.group.id),
  390 |           (group) => !group.members.some((member) => member.accountId === admin.accountId),
  391 |         );
  392 |       }
  393 |       await lease.release();
  394 |       if (variant === 'creator-remains') {
  395 |         await assertSingleSuccess(qa, kick);
  396 |         expect((kickRequests(qa, kick.group)[0]!.body as { byAccountId: string }).byAccountId).toBe(
  397 |           kick.group.creatorAccountId,
  398 |         );
  399 |       } else {
  400 |         finalStep(qa, kick, await terminal(qa, kick), 'NO_AVAILABLE_ACCOUNT');
  401 |         noKick(qa, kick);
  402 |       }
  403 |       await captureKickEvidence(qa, `capacity-actor-${variant}-final`, [kick]);
  404 |     });
  405 |   }
  406 | });
  407 | 
  408 | test('[CAP-007] departure or rejoin before deferred dispatch preserves one tool identity and the specified removed-member result', async ({
  409 |   qa,
  410 | }) => {
  411 |   for (const rejoin of [false, true]) {
  412 |     await deferred(qa, `capacity-target-${rejoin ? 'rejoin' : 'leave'}`, async (kick, lease) => {
  413 |       qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, false, { repeat: 2 });
  414 |       if (rejoin)
  415 |         qa.gateway.setMembership(kick.group.gatewayGroupId, kick.target, true, { repeat: 2 });
  416 |       // GET is an observation only; the external user need not appear in the service-account member DTO.
  417 |       await qa.api.group(kick.group.id);
  418 |       await lease.release();
  419 |       const run = await terminal(qa, kick);
  420 |       finalStep(qa, kick, run, null);
  421 |       const turns = qa.agent
  422 |         .snapshot()
  423 |         .turns.filter((turn) => (turn.body as { runId?: string }).runId === kick!.runId);
  424 |       const content = turns.flatMap((turn) =>
  425 |         (
  426 |           turn.body as {
  427 |             messages: { content: { type: string; tool_use_id?: string; content?: string }[] }[];
  428 |           }
  429 |         ).messages.flatMap((message) => message.content),
  430 |       );
```