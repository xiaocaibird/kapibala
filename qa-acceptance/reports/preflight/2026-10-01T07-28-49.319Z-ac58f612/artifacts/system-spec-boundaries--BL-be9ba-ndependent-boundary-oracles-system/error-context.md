# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/spec-boundaries.spec.ts >> [BLK-SPEC-006] versioned profile rules and explicit tool limits have independent boundary oracles
- Location: tests/system/spec-boundaries.spec.ts:532:1

# Error details

```
Error: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"
```

# Test source

```ts
  525 |         '第三次审计响应被屏障挂起时关闭 agent；允许实际已生效条件对应的两个终态。不证明同时发生、60秒预算重叠或永久稳定。',
  526 |     });
  527 |   } finally {
  528 |     qa.agent.barriers.release(barrier);
  529 |   }
  530 | });
  531 | 
  532 | test('[BLK-SPEC-006] versioned profile rules and explicit tool limits have independent boundary oracles', async ({
  533 |   qa,
  534 | }) => {
  535 |   await qa.api.login();
  536 |   const { group } = await qa.api.createGroup();
  537 |   type Profile = Group & { name: string | null; description: string | null };
  538 |   const readProfile = () => qa.api.require(qa.api.get<Profile>(`/api/groups/${group.id}`));
  539 |   await test.step('D024 retained profile: trim, UTF-16 lengths, omission and clearing', async () => {
  540 |     await qa.api.require(
  541 |       qa.api.patch(`/api/groups/${group.id}`, {
  542 |         name: ` ${'名'.repeat(80)} `,
  543 |         description: ` ${'介'.repeat(500)} `,
  544 |       }),
  545 |     );
  546 |     expect(await readProfile()).toMatchObject({
  547 |       name: '名'.repeat(80),
  548 |       description: '介'.repeat(500),
  549 |     });
  550 |     const invalid: Record<string, unknown>[] = [
  551 |       { name: '名'.repeat(81) },
  552 |       { name: '' },
  553 |       { name: '   ' },
  554 |       { name: null },
  555 |       { description: '介'.repeat(501) },
  556 |       { description: null },
  557 |     ];
  558 |     for (const body of invalid) {
  559 |       const before = await readProfile();
  560 |       const response = await qa.api.patch<ApiError>(`/api/groups/${group.id}`, body);
  561 |       expect(response.status).toBe(400);
  562 |       expect(await readProfile()).toMatchObject({
  563 |         name: before.name,
  564 |         description: before.description,
  565 |       });
  566 |     }
  567 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { name: '😀'.repeat(40) }));
  568 |     expect(await readProfile()).toMatchObject({
  569 |       name: '😀'.repeat(40),
  570 |       description: '介'.repeat(500),
  571 |     });
  572 |     expect((await qa.api.patch(`/api/groups/${group.id}`, { name: '😀'.repeat(41) })).status).toBe(
  573 |       400,
  574 |     );
  575 |     await qa.api.require(
  576 |       qa.api.patch(`/api/groups/${group.id}`, { description: '😀'.repeat(250) }),
  577 |     );
  578 |     expect(
  579 |       (await qa.api.patch(`/api/groups/${group.id}`, { description: '😀'.repeat(251) })).status,
  580 |     ).toBe(400);
  581 |     await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { description: '   ' }));
  582 |     expect(await readProfile()).toMatchObject({ name: '😀'.repeat(40), description: null });
  583 |     await qa.evidence('spec006-profile-policy', {
  584 |       profile: await readProfile(),
  585 |       source: 'D024 / docs/group-directory-profile-proposal.md:68',
  586 |       policyKind: 'versioned-retained-profile',
  587 |     });
  588 |   });
  589 | 
  590 |   await test.step('limit 100000 clamps to fifty independently of the advertised schema', async () => {
  591 |     const countGroup = (await qa.api.createGroup()).group;
  592 |     for (let index = 0; index < 51; index++)
  593 |       qa.gateway.emitMessage({
  594 |         groupId: countGroup.gatewayGroupId,
  595 |         msgId: `c${index}`,
  596 |         senderPlatformUserId: 'x',
  597 |         text: `${index}`,
  598 |         sentAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  599 |       });
  600 |     await eventually(
  601 |       () => qa.api.messages(countGroup.id),
  602 |       (page) => page.items.length === 50 && page.nextCursor !== null,
  603 |     );
  604 |     const runId = await startRun(
  605 |       qa,
  606 |       countGroup,
  607 |       'count-clamp',
  608 |       tool('count-clamp', 'get_recent_messages', { limit: 100000 }),
  609 |       [finish()],
  610 |     );
  611 |     const run = await finished(qa, runId);
  612 |     expect(run.status).toBe('finished');
  613 |     expect(run.steps[0]!.isError).toBe(false);
  614 |     const block = result(qa, runId, 'count-clamp');
  615 |     expect(block.is_error ?? false).toBe(false);
  616 |     const value = JSON.parse(block.content!) as ReadResult;
  617 |     expect(value.messages).toHaveLength(50);
  618 |     expect(value.messages.map((message) => message.msgId)).toEqual([
  619 |       ...Array.from({ length: 49 }, (_, index) => `c${index + 2}`),
  620 |       'spec-trigger-count-clamp',
  621 |     ]);
  622 |     const schema = turns(qa, runId)[0]!.tools.find(
  623 |       (item) => item.name === 'get_recent_messages',
  624 |     )!.input_schema;
> 625 |     const validate = new Ajv({ strict: false }).compile(schema);
      |                                                 ^ Error: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"
  626 |     expect(
  627 |       validate({ limit: 100000 }),
  628 |       'SUT advertised schema must permit the original explicit clamp example',
  629 |     ).toBe(true);
  630 |     await qa.evidence('spec006-limit-clamp', { schema, run, result: value });
  631 |   });
  632 | 
  633 |   await test.step('zero, negative and fractional limits obey the versioned advertised input schema', async () => {
  634 |     const inputGroup = (await qa.api.createGroup()).group;
  635 |     for (const [label, limit] of [
  636 |       ['zero', 0],
  637 |       ['negative', -1],
  638 |       ['fractional', 1.5],
  639 |     ] as const) {
  640 |       const toolUseId = `schema-${label}`;
  641 |       const runId = await startRun(
  642 |         qa,
  643 |         inputGroup,
  644 |         toolUseId,
  645 |         tool(toolUseId, 'get_recent_messages', { limit }),
  646 |         [finish()],
  647 |       );
  648 |       const run = await finished(qa, runId);
  649 |       expect(run.status).toBe('finished');
  650 |       const schema = turns(qa, runId)[0]!.tools.find(
  651 |         (item) => item.name === 'get_recent_messages',
  652 |       )!.input_schema;
  653 |       const schemaAccepts = new Ajv({ strict: false }).compile(schema)({ limit });
  654 |       const block = result(qa, runId, toolUseId);
  655 |       const content = JSON.parse(block.content!) as ReadResult & { code?: string };
  656 |       if (!schemaAccepts) {
  657 |         expect(block.is_error).toBe(true);
  658 |         expect(content.code).toBe('INVALID_INPUT');
  659 |         expect(run.steps[0]).toMatchObject({
  660 |           kind: 'tool_use',
  661 |           errorCode: 'INVALID_INPUT',
  662 |           isError: true,
  663 |         });
  664 |       } else {
  665 |         // This checks the advertised contract's own consistency, not a QA-invented
  666 |         // rounding/default/minimum policy. The exact returned selection is recorded only.
  667 |         expect(block.is_error ?? false).toBe(false);
  668 |         expect(Array.isArray(content.messages)).toBe(true);
  669 |         expect(content.messages.length).toBeLessThanOrEqual(50);
  670 |         expect(typeof content.truncated).toBe('boolean');
  671 |       }
  672 |       expect(Buffer.byteLength(block.content!, 'utf8')).toBeLessThanOrEqual(8192);
  673 |       await qa.evidence(`spec006-public-schema-${label}`, {
  674 |         input: { limit },
  675 |         schema,
  676 |         schemaAccepts,
  677 |         actual: content,
  678 |         judgment:
  679 |           '公开schema自洽检查；不固定0/-1/1.5的长期归一化业务规则。50上限与100000截50仍由原文独立裁判。',
  680 |       });
  681 |       await qa.api.require(qa.api.patch(`/api/groups/${inputGroup.id}`, { agentEnabled: false }));
  682 |     }
  683 |   });
  684 | 
  685 |   await test.step('ASCII/CJK text boundaries and byte caps, with Unicode tool behavior recorded separately', async () => {
  686 |     const sizeGroup = (await qa.api.createGroup()).group;
  687 |     const sourceText: Record<string, string> = {
  688 |       exact: 'A'.repeat(500),
  689 |       over: '文'.repeat(501),
  690 |       emoji: '😀'.repeat(501),
  691 |     };
  692 |     for (const [msgId, text] of Object.entries(sourceText))
  693 |       qa.gateway.emitMessage({
  694 |         groupId: sizeGroup.gatewayGroupId,
  695 |         msgId,
  696 |         senderPlatformUserId: 'x',
  697 |         text,
  698 |         sentAt: new Date(
  699 |           Date.UTC(2026, 0, 1, 0, 0, Object.keys(sourceText).indexOf(msgId)),
  700 |         ).toISOString(),
  701 |       });
  702 |     await eventually(
  703 |       () => qa.api.messages(sizeGroup.id),
  704 |       (page) => page.items.length === 3,
  705 |     );
  706 |     const runId = await startRun(
  707 |       qa,
  708 |       sizeGroup,
  709 |       'text-boundaries',
  710 |       tool('text-boundaries', 'get_recent_messages', { limit: 10 }),
  711 |       [finish()],
  712 |     );
  713 |     const run = await finished(qa, runId);
  714 |     expect(run.status).toBe('finished');
  715 |     const content = result(qa, runId, 'text-boundaries').content!;
  716 |     const value = JSON.parse(content) as ReadResult;
  717 |     expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(8192);
  718 |     expect(value.truncated).toBe(true);
  719 |     expect(value.messages.find((message) => message.msgId === 'exact')?.text).toBe(
  720 |       sourceText.exact,
  721 |     );
  722 |     const shortened = value.messages.find((message) => message.msgId === 'over')!.text;
  723 |     expect(shortened.length).toBeLessThanOrEqual(500);
  724 |     expect(shortened.length).toBeGreaterThan(0);
  725 |     expect(sourceText.over!.startsWith(shortened)).toBe(true);
```