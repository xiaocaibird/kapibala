# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/integration-streams.spec.ts >> [INT-STREAM-001] real paused reader leaves healthy consumer working and received-cursor replay complete
- Location: tests/system/integration-streams.spec.ts:62:1

# Error details

```
BlockedError: [BLOCKED] Bounded slow-reader injection did not establish the complete healthy receipt set; no throughput SLA inferred
```

# Test source

```ts
  37  |   api: PlatformClient,
  38  |   groupId: string,
  39  |   options: { maxPages?: number; inspect?: (items: Message[]) => void; budgetMs?: number } = {},
  40  | ): Promise<Message[]> {
  41  |   const items: Message[] = [];
  42  |   let cursor: string | undefined;
  43  |   const cursors = new Set<string>();
  44  |   const started = performance.now();
  45  |   for (let pages = 0; pages < (options.maxPages ?? 20); pages++) {
  46  |     const page = await api.messages(groupId, cursor, 50);
  47  |     items.push(...page.items);
  48  |     uniqueMessages(items);
  49  |     options.inspect?.(items);
  50  |     if (performance.now() - started > (options.budgetMs ?? 15000))
  51  |       throw new BlockedError(
  52  |         'QA snapshot traversal time budget exhausted; no product throughput SLA inferred',
  53  |       );
  54  |     if (!page.nextCursor) return items;
  55  |     expect(cursors.has(page.nextCursor), 'cursor cycle').toBe(false);
  56  |     cursors.add(page.nextCursor);
  57  |     cursor = page.nextCursor;
  58  |   }
  59  |   throw new BlockedError('QA traversal budget exhausted before end of snapshot');
  60  | }
  61  | 
  62  | test('[INT-STREAM-001] real paused reader leaves healthy consumer working and received-cursor replay complete', async ({
  63  |   qa,
  64  | }) => {
  65  |   test.setTimeout(180_000);
  66  |   await qa.api.login();
  67  |   const { group } = await qa.api.createGroup();
  68  |   const slow = new ReceiptSocket(qa.api.baseUrl);
  69  |   const healthy = new ReceiptSocket(qa.api.baseUrl);
  70  |   let replay: ReceiptSocket | undefined;
  71  |   const expected = new Map<string, string>();
  72  |   let checkpoint = 0;
  73  |   let primaryFailed = false;
  74  |   const ancillary = new Set(['pause-checkpoint']);
  75  |   const projectFrame = (frame: ReceivedFrame) => ({
  76  |     seq: frame.seq,
  77  |     type: frame.type,
  78  |     groupId: frame.groupId,
  79  |     msgId: frame.msgId,
  80  |     isOwn: frame.isOwn,
  81  |   });
  82  |   const receipts = (client: ReceiptSocket) => {
  83  |     client.assertNoErrors();
  84  |     const selected = assertReceiptSubset(client.frames, new Set(expected.keys()), ancillary);
  85  |     for (const frame of selected) expect(frame).toMatchObject({ groupId: group.id, isOwn: false });
  86  |     return selected;
  87  |   };
  88  |   try {
  89  |     await Promise.all([slow.authenticate(qa.api.token!), healthy.authenticate(qa.api.token!)]);
  90  |     qa.gateway.emitMessage({
  91  |       groupId: group.gatewayGroupId,
  92  |       msgId: 'pause-checkpoint',
  93  |       senderPlatformUserId: 'outside',
  94  |       text: 'checkpoint',
  95  |     });
  96  |     const ready = await observe({
  97  |       read: async () => [slow.frames, healthy.frames],
  98  |       invariant: () => {
  99  |         slow.assertHealthy();
  100 |         healthy.assertHealthy();
  101 |         receipts(slow);
  102 |         receipts(healthy);
  103 |       },
  104 |       complete: (values) =>
  105 |         values.every((frames) => frames.some((f) => f.msgId === 'pause-checkpoint')),
  106 |       durationMs: 10000,
  107 |     });
  108 |     if (!ready.complete) throw new BlockedError('Initial received cursor was not established');
  109 |     checkpoint = slow.pause();
  110 |     expect(checkpoint).toBeGreaterThan(0);
  111 |     const receiptCount = slow.frames.length;
  112 |     // A bounded QA injection profile, not a production capacity or latency target.
  113 |     const end = performance.now() + 45000;
  114 |     for (let offset = 0; offset < 2048; offset += 32) {
  115 |       for (let i = offset; i < offset + 32; i++) {
  116 |         const msgId = `slow-stream-${i}`;
  117 |         const text = `${msgId}:` + 'x'.repeat(8192);
  118 |         expected.set(msgId, hash(text));
  119 |         qa.gateway.emitMessage({
  120 |           groupId: group.gatewayGroupId,
  121 |           msgId,
  122 |           senderPlatformUserId: 'outside',
  123 |           text,
  124 |         });
  125 |       }
  126 |       const observed = await observe({
  127 |         read: async () => receipts(healthy),
  128 |         invariant: () => {
  129 |           healthy.assertHealthy();
  130 |           receipts(slow);
  131 |           expect(slow.lastReceivedSeq).toBe(checkpoint);
  132 |         },
  133 |         complete: (frames) => frames.length === expected.size,
  134 |         durationMs: Math.max(0, Math.min(10000, end - performance.now())),
  135 |       });
  136 |       if (!observed.complete || performance.now() > end)
> 137 |         throw new BlockedError(
      |               ^ BlockedError: [BLOCKED] Bounded slow-reader injection did not establish the complete healthy receipt set; no throughput SLA inferred
  138 |           'Bounded slow-reader injection did not establish the complete healthy receipt set; no throughput SLA inferred',
  139 |         );
  140 |     }
  141 |     expect(slow.frames).toHaveLength(receiptCount);
  142 |     // WS requires message identity, not payload.text. Check text via public history.
  143 |     const apiExpected = new Map<string, { text: string }>([
  144 |       ['message:pause-checkpoint', { text: 'checkpoint' }],
  145 |     ]);
  146 |     for (const msgId of expected.keys())
  147 |       apiExpected.set(`message:${msgId}`, { text: `${msgId}:` + 'x'.repeat(8192) });
  148 |     const history = await allMessages(qa.api, group.id, {
  149 |       maxPages: 60,
  150 |       budgetMs: 30000,
  151 |       inspect: (items) => messageSubset(items, apiExpected),
  152 |     });
  153 |     expect(history).toHaveLength(expected.size + 1);
  154 |     for (const message of history.filter((entry) => entry.msgId?.startsWith('slow-stream-')))
  155 |       expect(hash(message.text)).toBe(expected.get(message.msgId!));
  156 |     // No reading or application-level discarding while waiting for a server-side close.
  157 |     await observe({
  158 |       read: async () => healthy.closed,
  159 |       invariant: () => {
  160 |         healthy.assertHealthy();
  161 |         receipts(healthy);
  162 |         receipts(slow);
  163 |       },
  164 |       complete: () => false,
  165 |       durationMs: 8000,
  166 |     });
  167 |     slow.resume();
  168 |     const closure = await observe({
  169 |       read: async () => slow.closed,
  170 |       invariant: () => {
  171 |         healthy.assertHealthy();
  172 |         receipts(healthy);
  173 |         receipts(slow);
  174 |       },
  175 |       complete: (value) => !!value,
  176 |       durationMs: 8000,
  177 |     });
  178 |     if (!closure.complete)
  179 |       throw new BlockedError(
  180 |         'Real reader was paused, but this bounded profile did not prove server-side closure; increase an explicitly reviewed workload or supply transport observation, never fake sender callbacks',
  181 |       );
  182 | 
  183 |     // Use the last actually received cursor after draining the old connection,
  184 |     // never a server attempted-send position or the healthy client's cursor.
  185 |     const receivedBeforeReconnect = slow.lastReceivedSeq;
  186 |     const receivedHealthy = receipts(healthy);
  187 |     const receivedSlow = receipts(slow);
  188 |     expect(receivedSlow.map(projectFrame)).toEqual(
  189 |       receivedHealthy.filter((frame) => frame.seq! <= receivedBeforeReconnect).map(projectFrame),
  190 |     );
  191 |     const missing = healthy.frames.filter(
  192 |       (f) =>
  193 |         f.seq !== undefined &&
  194 |         f.seq > receivedBeforeReconnect &&
  195 |         f.msgId?.startsWith('slow-stream-'),
  196 |     );
  197 |     if (!missing.length)
  198 |       throw new BlockedError(
  199 |         'Peer closed but old buffered data fully drained; replay-gap prerequisite was not demonstrated',
  200 |       );
  201 |     replay = new ReceiptSocket(qa.api.baseUrl);
  202 |     await replay.authenticate(qa.api.token!, receivedBeforeReconnect);
  203 |     const replayClient = replay;
  204 |     const restored = await observe({
  205 |       read: async () => {
  206 |         replayClient.assertNoErrors();
  207 |         return assertReceiptSubset(
  208 |           replayClient.frames,
  209 |           new Set(missing.map((frame) => frame.msgId!)),
  210 |         );
  211 |       },
  212 |       invariant: () => {
  213 |         replayClient.assertHealthy();
  214 |         healthy.assertHealthy();
  215 |         receipts(healthy);
  216 |         receipts(slow);
  217 |       },
  218 |       complete: (frames) => frames.length === missing.length,
  219 |       durationMs: 15000,
  220 |     });
  221 |     if (!restored.complete)
  222 |       throw new BlockedError(
  223 |         'Replay observation budget exhausted; no arbitrary server replay SLA inferred',
  224 |       );
  225 |     expect(restored.last.map(projectFrame)).toEqual(missing.map(projectFrame));
  226 |     const received = receipts(healthy);
  227 |     expect(received).toHaveLength(expected.size);
  228 |     const completeSlowHistory = [...receivedSlow, ...restored.last];
  229 |     assertCompleteReceipts(completeSlowHistory, new Set(expected.keys()));
  230 |     expect(completeSlowHistory.map(projectFrame)).toEqual(received.map(projectFrame));
  231 |     expect(new Set(completeSlowHistory.map((frame) => frame.msgId))).toEqual(
  232 |       new Set(expected.keys()),
  233 |     );
  234 |     await observe({
  235 |       read: async () => replayClient.frames,
  236 |       invariant: () => {
  237 |         replayClient.assertHealthy();
```