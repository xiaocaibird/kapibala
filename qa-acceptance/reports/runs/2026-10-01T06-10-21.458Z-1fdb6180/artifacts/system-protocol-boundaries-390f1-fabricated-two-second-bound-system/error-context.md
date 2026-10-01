# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/protocol-boundaries.spec.ts >> [BLK-EXT-001] unacknowledged send has paired pending prefixes without a fabricated two-second bound
- Location: tests/system/protocol-boundaries.spec.ts:199:1

# Error details

```
BlockedError: [BLOCKED] No terminal evidence within observation budget for does-not-land. The 10s probe is not a product deadline or proof of permanent non-recovery; retain CL-01 protocol risk.
```

# Test source

```ts
  188 |         );
  189 |     }
  190 |     invariant();
  191 |     await completedCreation(qa, jobId, remoteId, accounts[0]!.id, accounts[1]!.id);
  192 |   } finally {
  193 |     for (const name of ['prepare-promotion', 'promotion-first', 'promotion-second'])
  194 |       qa.gateway.barriers.release(name);
  195 |     await evidence(qa, 'promotion-final-ledger');
  196 |   }
  197 | });
  198 | 
  199 | test('[BLK-EXT-001] unacknowledged send has paired pending prefixes without a fabricated two-second bound', async ({
  200 |   qa,
  201 | }) => {
  202 |   test.setTimeout(180_000);
  203 |   await qa.api.login();
  204 |   const incomplete: string[] = [];
  205 |   for (const outcome of ['lands', 'does-not-land'] as const) {
  206 |     const { group, accounts } = await qa.api.createGroup();
  207 |     const barrier = `unacknowledged-${outcome}`;
  208 |     const path = `/groups/${group.gatewayGroupId}/send`;
  209 |     const text = `unacknowledged original ${outcome}`;
  210 |     qa.gateway.enqueue(path, {
  211 |       barrier: { phase: 'request', name: barrier },
  212 |       effect: outcome === 'lands' ? 'apply' : 'none',
  213 |       effectDelayMs: 0,
  214 |       neverRespond: true,
  215 |     });
  216 |     try {
  217 |       const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, text);
  218 |       await qa.gateway.barriers.waitFor(barrier);
  219 |       const request = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
  220 |       expect(request.responseStatus).toBeUndefined();
  221 |       expect(
  222 |         qa.gateway.snapshot().messages.filter((entry) => entry.clientMsgId === clientMsgId),
  223 |       ).toHaveLength(0);
  224 |       await qa.kill();
  225 |       await evidence(qa, `${outcome}-pending-at-crash`, { clientMsgId });
  226 |       await qa.start();
  227 |       await qa.api.login();
  228 |       // The original is still in flight. A negative lookup (including after two
  229 |       // seconds) cannot prove it will not land: no 504 was received.
  230 |       const prefix = await observe({
  231 |         read: () => qa.api.messages(group.id),
  232 |         durationMs: 2_500,
  233 |         complete: () => false,
  234 |         invariant: ({ items }) => {
  235 |           expect(items.filter((item) => item.clientMsgId === clientMsgId)).toHaveLength(1);
  236 |           expect(['sent', 'failed', 'cancelled']).not.toContain(
  237 |             items.find((item) => item.clientMsgId === clientMsgId)!.deliveryStatus,
  238 |           );
  239 |           expect(
  240 |             qa.gateway.snapshot().requests.filter((entry) => entry.path === path),
  241 |           ).toHaveLength(1);
  242 |           expect(
  243 |             qa.gateway.snapshot().messages.filter((entry) => entry.clientMsgId === clientMsgId),
  244 |           ).toHaveLength(0);
  245 |         },
  246 |       });
  247 |       await evidence(qa, `${outcome}-indistinguishable-prefix`, prefix);
  248 |       qa.gateway.barriers.release(barrier);
  249 |       const observation = await observe({
  250 |         durationMs: 10_000,
  251 |         read: () => qa.api.messages(group.id),
  252 |         invariant: ({ items }) => {
  253 |           const local = items.filter((item) => item.clientMsgId === clientMsgId);
  254 |           const remote = qa.gateway
  255 |             .snapshot()
  256 |             .messages.filter((item) => item.clientMsgId === clientMsgId);
  257 |           // Releasing a QA barrier, or privately choosing effect:none, supplies
  258 |           // no new public non-delivery guarantee to the SUT. A late blind retry
  259 |           // must not pass merely because it became the only landed message.
  260 |           expect(
  261 |             qa.gateway.snapshot().requests.filter((entry) => entry.path === path),
  262 |           ).toHaveLength(1);
  263 |           expect(local).toHaveLength(1);
  264 |           expect(remote.length).toBeLessThanOrEqual(1);
  265 |           if (local[0]!.deliveryStatus === 'sent') {
  266 |             expect(remote).toHaveLength(1);
  267 |             expect(local[0]!.msgId).toBe(remote[0]!.msgId);
  268 |           }
  269 |           // There is no explicit failure/cancellation event in either branch.
  270 |           // A 404 plus a missing response cannot justify inventing a terminal
  271 |           // failure, even when the QA-only ledger has privately chosen no effect.
  272 |           expect(['failed', 'cancelled']).not.toContain(local[0]!.deliveryStatus);
  273 |         },
  274 |         complete: ({ items }) =>
  275 |           items.some(
  276 |             (item) =>
  277 |               item.clientMsgId === clientMsgId && ['sent', 'failed'].includes(item.deliveryStatus),
  278 |           ),
  279 |       });
  280 |       await evidence(qa, `${outcome}-outcome`, observation);
  281 |       if (!observation.complete) incomplete.push(outcome);
  282 |     } finally {
  283 |       qa.gateway.barriers.release(barrier);
  284 |       await evidence(qa, `${outcome}-final-ledger`);
  285 |     }
  286 |   }
  287 |   if (incomplete.length)
> 288 |     throw new BlockedError(
      |           ^ BlockedError: [BLOCKED] No terminal evidence within observation budget for does-not-land. The 10s probe is not a product deadline or proof of permanent non-recovery; retain CL-01 protocol risk.
  289 |       `No terminal evidence within observation budget for ${incomplete.join(', ')}. ` +
  290 |         'The 10s probe is not a product deadline or proof of permanent non-recovery; retain CL-01 protocol risk.',
  291 |     );
  292 | });
  293 | 
  294 | test('[BLK-EXT-004] an already effective kick is not repeated against a rejoined target after restart', async ({
  295 |   qa,
  296 | }) => {
  297 |   await qa.api.login();
  298 |   const { group } = await qa.api.createGroup();
  299 |   const target = 'kick-rejoin-target';
  300 |   const path = `/groups/${group.gatewayGroupId}/kick`;
  301 |   qa.gateway.setMembership(group.gatewayGroupId, target, true);
  302 |   await enable(qa, group);
  303 |   qa.agent.enqueueTurns(
  304 |     tool('kick-before-rejoin', 'kick_user', {
  305 |       platform_user_id: target,
  306 |       reason: 'single authorized removal',
  307 |     }),
  308 |     final('resumed existing run'),
  309 |   );
  310 |   qa.gateway.enqueue(path, {
  311 |     effect: 'apply',
  312 |     barrier: { phase: 'after-effect', name: 'kick-before-rejoin' },
  313 |   });
  314 |   try {
  315 |     trigger(qa, group, 'remove once');
  316 |     await qa.gateway.barriers.waitFor('kick-before-rejoin');
  317 |     const id = await runId(qa, group);
  318 |     const original = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
  319 |     expect(original.responseStatus).toBeUndefined();
  320 |     expect(
  321 |       qa.gateway
  322 |         .snapshot()
  323 |         .effects.filter((entry) => entry.kind === 'kick' && entry.groupId === group.gatewayGroupId),
  324 |     ).toHaveLength(1);
  325 |     await qa.kill();
  326 |     qa.gateway.barriers.release('kick-before-rejoin');
  327 |     // Finish the external operation and record its member_left event while the
  328 |     // SUT is down, then join again. Neither event is erased or reordered.
  329 |     await eventually(
  330 |       async () => qa.gateway.snapshot(),
  331 |       (snapshot) =>
  332 |         snapshot.requests.some((entry) => entry.id === original.id && entry.completedAt) &&
  333 |         snapshot.events.some(
  334 |           (entry) => entry.type === 'member_left' && entry.data.platformUserId === target,
  335 |         ),
  336 |     );
  337 |     qa.gateway.setMembership(group.gatewayGroupId, target, true);
  338 |     await evidence(qa, 'kick-applied-then-rejoined', { id });
  339 |     await qa.start();
  340 |     await qa.api.login();
  341 |     const result = await observe({
  342 |       durationMs: 20_000,
  343 |       read: () => qa.api.agentRun(id),
  344 |       complete: (run) => run.status !== 'running',
  345 |       invariant: (run) => {
  346 |         expect(run.id).toBe(id);
  347 |         expect(qa.gateway.snapshot().requests.filter((entry) => entry.path === path)).toHaveLength(
  348 |           1,
  349 |         );
  350 |         expect(
  351 |           qa.gateway
  352 |             .snapshot()
  353 |             .groups.find((item) => item.groupId === group.gatewayGroupId)!
  354 |             .members.some((item) => item.platformUserId === target),
  355 |         ).toBe(true);
  356 |         for (const step of run.steps.filter((step) => step.toolUseId === 'kick-before-rejoin'))
  357 |           expect(step.isError, 'already effective tool must not be recorded as failed').toBe(false);
  358 |       },
  359 |     });
  360 |     await evidence(qa, 'kick-rejoin-resumed', result);
  361 |     if (!result.complete)
  362 |       throw new BlockedError(
  363 |         'Restarted kick run remains open within 20s observation budget; no arbitrary recovery deadline asserted',
  364 |       );
  365 |     expect(result.last.status).toBe('finished');
  366 |     expect(result.last.endReason).toBe('final');
  367 |     expect(
  368 |       result.last.steps.filter((step) => step.toolUseId === 'kick-before-rejoin'),
  369 |     ).toHaveLength(1);
  370 |   } finally {
  371 |     qa.gateway.barriers.release('kick-before-rejoin');
  372 |     await evidence(qa, 'kick-rejoin-final-ledger');
  373 |   }
  374 | });
  375 | 
  376 | type TurnBody = {
  377 |   runId: string;
  378 |   messages: {
  379 |     role: string;
  380 |     content: { type: string; tool_use_id?: string; [key: string]: unknown }[];
  381 |   }[];
  382 | };
  383 | 
  384 | test('[BLK-EXT-005] a lost unexecuted model response may change while persisted history and effects survive', async ({
  385 |   qa,
  386 | }) => {
  387 |   await qa.api.login();
  388 |   const { group } = await qa.api.createGroup();
```