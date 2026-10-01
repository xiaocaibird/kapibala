# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/integration-runtime.spec.ts >> [INT-ACT-001] activity budget accumulates across restart and excludes proven downtime without tail tolerance
- Location: tests/system/integration-runtime.spec.ts:130:1

# Error details

```
BlockedError: [BLOCKED] 活动终态缺少原有及接管epoch完整关联，不能证明重启累计
```

# Test source

```ts
  179 |     const safeBoundary = await safeLease.waitFor('activity-safe-held');
  180 |     const agentBeforeCrash = qa.agent.snapshot();
  181 |     const runRequestIds = new Set(
  182 |       agentBeforeCrash.sessions.find((entry) => entry.runId === runId)?.requestIds,
  183 |     );
  184 |     const runRequests = agentBeforeCrash.turns.filter((entry) => runRequestIds.has(entry.id));
  185 |     if (!runRequests.length || runRequests.some((entry) => !entry.completedAt))
  186 |       throw new BlockedError('独立Agent账本未证明安全屏障时所有已发turn均已响应，不执行崩溃');
  187 |     expect((await qa.api.agentRun(runId)).status).toBe('running');
  188 |     await qa.evidence('activity-before-crash', { checkpoint, safeBoundary, agentBeforeCrash });
  189 |     // The lease remains held while this actual process is killed. No next
  190 |     // remote dispatch is permitted between this witness and the kill.
  191 |     const safetyBeforeKill = await safeLease.snapshot();
  192 |     const killBeforeUtc = Date.now();
  193 |     if (
  194 |       safetyBeforeKill.state !== 'held' ||
  195 |       Date.parse(safetyBeforeKill.expiresAt) <= killBeforeUtc
  196 |     )
  197 |       throw new BlockedError('即将崩溃时安全屏障已释放或到期，不执行未经证明的安全阶段崩溃');
  198 |     const stopBefore = performance.now();
  199 |     await qa.kill();
  200 |     const stopAfter = performance.now();
  201 |     const killAfterUtc = Date.now();
  202 |     await qa.evidence('activity-kill-window', { safetyBeforeKill, killBeforeUtc, killAfterUtc });
  203 |     if (killAfterUtc >= Date.parse(safetyBeforeKill.expiresAt))
  204 |       throw new BlockedError('kill完成已跨过安全屏障TTL，不能声称此次发生于安全阶段');
  205 |     await delay(5000);
  206 |     const startBefore = performance.now();
  207 |     await qa.start();
  208 |     const startAfter = performance.now();
  209 |     await qa.api.login();
  210 |     const next = runtimeObservationFor(qa);
  211 |     let primary = false;
  212 |     try {
  213 |       await next.verify(['activity-witness']);
  214 |       expect(next.target.pid).not.toBe(first.target.pid);
  215 |       const lease = await next.arm('observe-activity', correlation);
  216 |       const resumed = await lease.waitFor('activity-checkpoint');
  217 |       assertNoRecoveryPause(resumed.events);
  218 |       const offline: [number, number] = [startBefore - stopAfter, startAfter - stopBefore];
  219 |       let lastRunning: number | undefined, firstTerminal: number | undefined;
  220 |       const samples: { before: number; after: number; status: string }[] = [];
  221 |       const result = await observe({
  222 |         read: async () => {
  223 |           const before = performance.now();
  224 |           const run = await qa.api.agentRun(runId);
  225 |           const after = performance.now();
  226 |           samples.push({ before, after, status: run.status });
  227 |           if (run.status === 'running') lastRunning = before;
  228 |           else firstTerminal ??= after;
  229 |           const witness = await lease.snapshot();
  230 |           return { run, witness };
  231 |         },
  232 |         invariant: ({ run, witness }) => {
  233 |           expect(run.id).toBe(runId);
  234 |           assertNoRecoveryPause(witness.events);
  235 |           // An incomplete tail/unknown state blocks a budget conclusion, not
  236 |           // the remaining bounded observation of independent recovery/public
  237 |           // invariants. Never turn persisted/current-epoch time into run truth.
  238 |           for (const event of witness.events) {
  239 |             if (event.includesUnsavedTail && event.activeElapsedMs)
  240 |               expect(
  241 |                 event.activeElapsedMs[0],
  242 |                 '实际活动下界已证明超过原始60秒预算',
  243 |               ).toBeLessThanOrEqual(60_000);
  244 |           }
  245 |           expect(
  246 |             qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  247 |           ).toHaveLength(0);
  248 |           if (run.status !== 'running')
  249 |             expect(run).toMatchObject({ status: 'failed', endReason: 'wall_clock' });
  250 |         },
  251 |         complete: ({ run }) => run.status !== 'running',
  252 |         durationMs: 85_000,
  253 |         intervalMs: 100,
  254 |       });
  255 |       if (!result.complete) {
  256 |         await qa.evidence('activity-incomplete-observation', {
  257 |           run: result.last.run,
  258 |           witness: result.last.witness,
  259 |           samples,
  260 |           elapsedMs: result.elapsedMs,
  261 |           claim:
  262 |             '未观察到独立恢复违约；终态或完整活动证据不足，不能判预算通过，也不增设85秒业务SLA',
  263 |         });
  264 |         throw new BlockedError('预算终态或完整活动证据未在诊断观察期间获得；不增设85秒业务SLA');
  265 |       }
  266 |       // Public terminal cleanup is independent of activity interval availability.
  267 |       expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
  268 |       const witness = await lease.waitFor('activity-terminal');
  269 |       assertNoRecoveryPause(witness.events);
  270 |       const event = witness.events.find((entry) => entry.kind === 'activity-terminal')!;
  271 |       const originalEpochs = safeBoundary.events.find(
  272 |         (entry) => entry.kind === 'activity-safe-held',
  273 |       )!.epochIds!;
  274 |       const recoveredEpochs = new Set(event.epochIds);
  275 |       if (
  276 |         !originalEpochs.every((epoch) => recoveredEpochs.has(epoch)) ||
  277 |         ![...recoveredEpochs].some((epoch) => !originalEpochs.includes(epoch))
  278 |       )
> 279 |         throw new BlockedError('活动终态缺少原有及接管epoch完整关联，不能证明重启累计');
      |               ^ BlockedError: [BLOCKED] 活动终态缺少原有及接管epoch完整关联，不能证明重启累计
  280 |       if (lastRunning === undefined || firstTerminal === undefined)
  281 |         throw new BlockedError('缺少重启后的running→terminal独立区间');
  282 |       const processOnline: [number, number] = [
  283 |         Math.max(0, lastRunning - createAfter - offline[1]),
  284 |         firstTerminal - createBefore - offline[0],
  285 |       ];
  286 |       await qa.evidence('activity-restart-budget', {
  287 |         checkpoint,
  288 |         safeBoundary,
  289 |         safetyBeforeKill,
  290 |         killBeforeUtc,
  291 |         killAfterUtc,
  292 |         resumed,
  293 |         witness,
  294 |         create: [createBefore, createAfter],
  295 |         stop: [stopBefore, stopAfter],
  296 |         start: [startBefore, startAfter],
  297 |         offline,
  298 |         processOnline,
  299 |         samples,
  300 |         claim:
  301 |           '进程在线仅给出实际活动上界；真实恢复状态和完整epoch/崩溃尾段另由独立见证证明，不接受固定误差容忍',
  302 |       });
  303 |       for (const entry of witness.events) assertRecoveredActivity(entry);
  304 |       assertActivityBudget(event, processOnline);
  305 |     } catch (error) {
  306 |       primary = true;
  307 |       throw error;
  308 |     } finally {
  309 |       try {
  310 |         await next.close();
  311 |       } catch (error) {
  312 |         await recordCleanupFailure(qa, 'activity-rebound-cleanup', error);
  313 |         if (!primary) throw error;
  314 |       }
  315 |     }
  316 |   });
  317 | });
  318 | 
  319 | test('[INT-ACCOUNT-001] remote success local transient save retries in the original transaction before a newer disconnect', async ({
  320 |   qa,
  321 | }) => {
  322 |   await withControl(qa, ['account-local-save', 'account-intent-wait'], async (control) => {
  323 |     await qa.api.login();
  324 |     const account = (await qa.api.accounts()).find((value) => value.status === 'idle');
  325 |     if (!account) throw new BlockedError('此例要求独立idle服务账号');
  326 |     const lease = await control.arm('account-save-once', {
  327 |       kind: 'account',
  328 |       accountId: account.id,
  329 |       operation: 'connect',
  330 |       intentId: randomUUID(),
  331 |     });
  332 |     const ws = await stream(qa);
  333 |     let failed = false;
  334 |     let connect: ReturnType<typeof qa.api.post> | undefined;
  335 |     let disconnect: ReturnType<typeof qa.api.post> | undefined;
  336 |     try {
  337 |       connect = qa.api.post(`/api/accounts/${account.id}/connect`);
  338 |       void connect.catch(() => {});
  339 |       const held = await lease.waitFor('local-retry-held');
  340 |       const events = transactionEvents(lease);
  341 |       expect(events.findIndex((event) => event.kind === 'remote-success')).toBeLessThan(
  342 |         events.findIndex((event) => event.kind === 'local-save-failed'),
  343 |       );
  344 |       expect(
  345 |         qa.gateway
  346 |           .snapshot()
  347 |           .requests.filter((request) => request.path === `/accounts/${account.id}/connect`),
  348 |       ).toHaveLength(1);
  349 |       expect((await qa.api.accounts()).find((value) => value.id === account.id)?.status).toBe(
  350 |         'idle',
  351 |       );
  352 |       ws.check();
  353 |       expect(accountEvents(ws.frames, account.id)).toHaveLength(0);
  354 |       disconnect = qa.api.post(`/api/accounts/${account.id}/transition`, {
  355 |         expectedFrom: 'online',
  356 |         to: 'disconnected',
  357 |       });
  358 |       void disconnect.catch(() => {});
  359 |       // A local Promise only proves dispatch was requested. The controller must
  360 |       // see the later HTTP request waiting behind this real original transaction.
  361 |       const competing = await lease.waitFor('newer-account-intent-waiting');
  362 |       transactionEvents(lease);
  363 |       const waitEvent = competing.events.find(
  364 |         (event) => event.kind === 'newer-account-intent-waiting',
  365 |       )!;
  366 |       expect(waitEvent.waitingIntent!.requestId).not.toBe(waitEvent.requestId);
  367 |       expect((await qa.api.accounts()).find((value) => value.id === account.id)?.status).toBe(
  368 |         'idle',
  369 |       );
  370 |       ws.check();
  371 |       expect(accountEvents(ws.frames, account.id)).toHaveLength(0);
  372 |       expect(
  373 |         qa.gateway
  374 |           .snapshot()
  375 |           .requests.filter((request) => request.path === `/accounts/${account.id}/disconnect`),
  376 |       ).toHaveLength(0);
  377 |       await lease.advance();
  378 |       expect((await connect).status).toBe(200);
  379 |       expect((await disconnect).status).toBe(200);
```