# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-011] duplicate tool_use id is protocol error and has no repeated effect
- Location: tests/system/agent.spec.ts:358:1

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "errorCode": "DUPLICATE_TOOL_USE_ID",
+   "errorCode": "BAD_JSON",
    "input": null,
    "kind": "protocol_error",
    "name": null,
    "toolUseId": null,
  }
```

# Test source

```ts
  269 |     name: 'stop reason mismatch',
  270 |     plan: {
  271 |       body: {
  272 |         stop_reason: 'end_turn',
  273 |         content: [{ type: 'tool_use', id: 'x', name: 'finish', input: { summary: 'x' } }],
  274 |       },
  275 |     },
  276 |   },
  277 |   { id: 'AGENT-008', name: 'non-2xx', plan: { status: 503, rawBody: 'unavailable' } },
  278 |   {
  279 |     id: 'AGENT-034',
  280 |     name: 'missing stop reason',
  281 |     plan: { body: { content: [{ type: 'text', text: 'done' }] } },
  282 |   },
  283 |   {
  284 |     id: 'AGENT-035',
  285 |     name: 'zero content blocks',
  286 |     plan: { body: { stop_reason: 'end_turn', content: [] } },
  287 |   },
  288 |   {
  289 |     id: 'AGENT-036',
  290 |     name: 'text surrounding JSON',
  291 |     plan: {
  292 |       rawBody:
  293 |         'Here is the answer: {"stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}',
  294 |     },
  295 |   },
  296 | ];
  297 | for (const scenario of invalidTurns)
  298 |   test(`[${scenario.id}] ${scenario.name} produces BAD_JSON history without assistant block`, async ({
  299 |     qa,
  300 |   }) => {
  301 |     await qa.api.login();
  302 |     const { group } = await qa.api.createGroup();
  303 |     qa.agent.enqueueTurns(scenario.plan, finish());
  304 |     const id = await trigger(qa, group);
  305 |     const run = await finished(qa, id);
  306 |     expect(run.status).toBe('finished');
  307 |     expect(run.steps[0]).toMatchObject({
  308 |       kind: 'protocol_error',
  309 |       name: null,
  310 |       input: null,
  311 |       toolUseId: null,
  312 |       isError: true,
  313 |       errorCode: 'BAD_JSON',
  314 |     });
  315 |     expect(typeof run.steps[0]!.rawResponse).toBe('string');
  316 |     const history = requests(qa)[1]!.messages;
  317 |     expect(
  318 |       history.some(
  319 |         (message) =>
  320 |           message.role === 'user' &&
  321 |           message.content.some(
  322 |             (block) => block.type === 'text' && block.text?.startsWith('PROTOCOL_ERROR BAD_JSON:'),
  323 |           ),
  324 |       ),
  325 |     ).toBe(true);
  326 |     expect(history.filter((message) => message.role === 'assistant')).toHaveLength(0);
  327 |   });
  328 | 
  329 | for (const [id, name, input, code] of [
  330 |   ['AGENT-009', 'unlisted_tool', {}, 'UNKNOWN_TOOL'],
  331 |   ['AGENT-010', 'send_message', { text: 42 }, 'INVALID_INPUT'],
  332 | ] as const)
  333 |   test(`[${id}] ${code} appends assistant tool use and error result`, async ({ qa }) => {
  334 |     await qa.api.login();
  335 |     const { group } = await qa.api.createGroup();
  336 |     qa.agent.enqueueTurns(tool('bad-tool', name, input), finish());
  337 |     const run = await finished(qa, await trigger(qa, group));
  338 |     expect(run.steps[0]).toMatchObject({
  339 |       kind: 'tool_use',
  340 |       name,
  341 |       toolUseId: 'bad-tool',
  342 |       isError: true,
  343 |       errorCode: code,
  344 |     });
  345 |     const history = requests(qa)[1]!.messages;
  346 |     expect(
  347 |       history.some(
  348 |         (message) =>
  349 |           message.role === 'assistant' && message.content.some((block) => block.id === 'bad-tool'),
  350 |       ),
  351 |     ).toBe(true);
  352 |     const result = results(qa).find((block) => block.tool_use_id === 'bad-tool')!;
  353 |     expect(result.is_error).toBe(true);
  354 |     expect(JSON.parse(result.content!).code).toBe(code);
  355 |     expect(qa.agent.snapshot().audits).toHaveLength(0);
  356 |   });
  357 | 
  358 | test('[AGENT-011] duplicate tool_use id is protocol error and has no repeated effect', async ({
  359 |   qa,
  360 | }) => {
  361 |   await qa.api.login();
  362 |   const { group } = await qa.api.createGroup();
  363 |   qa.agent.enqueueTurns(
  364 |     tool('same-id', 'get_recent_messages', { limit: 10 }),
  365 |     tool('same-id', 'send_message', { text: 'must not send', idempotency_key: 'x' }),
  366 |     finish(),
  367 |   );
  368 |   const run = await finished(qa, await trigger(qa, group));
> 369 |   expect(run.steps[1]).toMatchObject({
      |                        ^ Error: expect(received).toMatchObject(expected)
  370 |     kind: 'protocol_error',
  371 |     errorCode: 'DUPLICATE_TOOL_USE_ID',
  372 |     toolUseId: null,
  373 |     name: null,
  374 |     input: null,
  375 |   });
  376 |   expect(
  377 |     requests(qa)[2]!
  378 |       .messages.flatMap((message) => message.content)
  379 |       .filter((block) => block.type === 'tool_use' && block.id === 'same-id'),
  380 |   ).toHaveLength(1);
  381 |   expect(qa.agent.snapshot().audits).toHaveLength(0);
  382 |   expect(
  383 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  384 |   ).toHaveLength(0);
  385 | });
  386 | 
  387 | test('[AGENT-012] three consecutive protocol errors fail and a legal response resets the count', async ({
  388 |   qa,
  389 | }) => {
  390 |   await qa.api.login();
  391 |   const { group } = await qa.api.createGroup();
  392 |   const bad = { rawBody: 'not JSON' };
  393 |   qa.agent.enqueueTurns(
  394 |     bad,
  395 |     bad,
  396 |     tool('valid-reset', 'get_recent_messages', { limit: 1 }),
  397 |     bad,
  398 |     bad,
  399 |     bad,
  400 |     finish('must not reach'),
  401 |   );
  402 |   const run = await finished(qa, await trigger(qa, group));
  403 |   expect(run.status).toBe('failed');
  404 |   expect(run.endReason).toBe('protocol_errors');
  405 |   expect(run.steps).toHaveLength(6);
  406 |   expect(requests(qa)).toHaveLength(6);
  407 | });
  408 | 
  409 | test('[AGENT-013] repeated read loop cannot exceed twelve turns', async ({ qa }) => {
  410 |   await qa.api.login();
  411 |   const { group } = await qa.api.createGroup();
  412 |   qa.agent.enqueueTurns(
  413 |     ...Array.from({ length: 14 }, (_, index) =>
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
```