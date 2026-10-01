# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/protocol-boundaries.spec.ts >> [BLK-EXT-004] an already effective kick is not repeated against a rejoined target after restart
- Location: tests/system/protocol-boundaries.spec.ts:294:1

# Error details

```
BlockedError: [BLOCKED] Restarted kick run remains open within 20s observation budget; no arbitrary recovery deadline asserted
```

# Test source

```ts
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
  288 |     throw new BlockedError(
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
> 362 |       throw new BlockedError(
      |             ^ BlockedError: [BLOCKED] Restarted kick run remains open within 20s observation budget; no arbitrary recovery deadline asserted
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
  389 |   await enable(qa, group);
  390 |   const text = 'effect before lost model turn';
  391 |   qa.agent.enqueueTurns(
  392 |     tool('persisted-send', 'send_message', { text, idempotency_key: 'persisted-send-key' }),
  393 |     {
  394 |       ...tool('lost-read', 'get_recent_messages', { limit: 2 }),
  395 |       barrier: { phase: 'before-response', name: 'lost-model-response' },
  396 |     },
  397 |     final('different but legal response after restart'),
  398 |   );
  399 |   try {
  400 |     trigger(qa, group, 'start response-loss test');
  401 |     await qa.agent.barriers.waitFor('lost-model-response');
  402 |     const id = await runId(qa, group);
  403 |     const before = qa.agent.snapshot().turns.at(-1)!;
  404 |     const persisted = (before.body as TurnBody).messages
  405 |       .flatMap((message) => message.content)
  406 |       .find((block) => block.type === 'tool_result' && block.tool_use_id === 'persisted-send');
  407 |     expect(persisted).toBeDefined();
  408 |     expect(before.completedAt).toBeUndefined();
  409 |     await eventually(
  410 |       async () => qa.gateway.snapshot().messages.filter((entry) => entry.text === text),
  411 |       (messages) => messages.length > 0,
  412 |     );
  413 |     expect(qa.gateway.snapshot().messages.filter((entry) => entry.text === text)).toHaveLength(1);
  414 |     await qa.kill();
  415 |     qa.agent.barriers.release('lost-model-response');
  416 |     await evidence(qa, 'lost-model-response-at-crash', { id, persisted });
  417 |     await qa.start();
  418 |     await qa.api.login();
  419 |     const result = await observe({
  420 |       durationMs: 20_000,
  421 |       read: () => qa.api.agentRun(id),
  422 |       complete: (run) => run.status !== 'running',
  423 |       invariant: (run) => {
  424 |         expect(run.id).toBe(id);
  425 |         expect(run.steps.length).toBeLessThanOrEqual(12);
  426 |         expect(qa.gateway.snapshot().messages.filter((entry) => entry.text === text)).toHaveLength(
  427 |           1,
  428 |         );
  429 |         const all = qa.agent.snapshot().turns;
  430 |         expect(all.every((turn) => (turn.body as TurnBody).runId === id)).toBe(true);
  431 |         for (const turn of all.filter((turn) => turn.id > before.id))
  432 |           expect(
  433 |             (turn.body as TurnBody).messages.flatMap((message) => message.content),
  434 |           ).toContainEqual(persisted);
  435 |       },
  436 |     });
  437 |     await evidence(qa, 'lost-model-response-resumed', result);
  438 |     if (!result.complete)
  439 |       throw new BlockedError(
  440 |         'Run not terminal within 20s probe; original recovery obligation retained without inventing a deadline',
  441 |       );
  442 |     expect(qa.agent.snapshot().turns.some((turn) => turn.id > before.id)).toBe(true);
  443 |     expect(result.last.status).toBe('finished');
  444 |     expect(result.last.endReason).toBe('final');
  445 |     expect(result.last.steps.filter((step) => step.toolUseId === 'persisted-send')).toHaveLength(1);
  446 |     expect(result.last.steps.find((step) => step.toolUseId === 'persisted-send')?.isError).toBe(
  447 |       false,
  448 |     );
  449 |     expect(
  450 |       qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  451 |     ).toHaveLength(1);
  452 |   } finally {
  453 |     qa.agent.barriers.release('lost-model-response');
  454 |     await evidence(qa, 'lost-model-response-final-ledger');
  455 |   }
  456 | });
  457 | 
```