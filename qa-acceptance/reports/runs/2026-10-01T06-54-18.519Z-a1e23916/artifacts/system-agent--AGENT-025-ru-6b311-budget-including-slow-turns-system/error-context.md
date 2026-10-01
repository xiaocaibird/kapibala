# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-025] run reaches sixty-second active wall-clock budget including slow turns
- Location: tests/system/agent.spec.ts:771:1

# Error details

```
BlockedError: [BLOCKED] Timing interval 60000..60138ms crosses required 60000..60000ms; lifecycle timestamp evidence is needed
```

# Test source

```ts
  5   | 
  6   | type Block = {
  7   |   type: string;
  8   |   id?: string;
  9   |   name?: string;
  10  |   input?: unknown;
  11  |   text?: string;
  12  |   tool_use_id?: string;
  13  |   content?: string;
  14  |   is_error?: boolean;
  15  | };
  16  | type TurnRequest = {
  17  |   runId: string;
  18  |   tools: {
  19  |     name: string;
  20  |     description: string;
  21  |     input_schema: { required: string[]; type: string };
  22  |   }[];
  23  |   messages: { role: string; content: Block[] }[];
  24  | };
  25  | const tool = (id: string, name: string, input: unknown) => ({
  26  |   body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
  27  | });
  28  | const finish = (text = 'done') => ({
  29  |   body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] },
  30  | });
  31  | const requests = (qa: QaEnvironment) =>
  32  |   qa.agent.snapshot().turns.map((request) => request.body as TurnRequest);
  33  | const results = (qa: QaEnvironment) =>
  34  |   requests(qa).flatMap((request) =>
  35  |     request.messages.flatMap((message) =>
  36  |       message.content.filter((block) => block.type === 'tool_result'),
  37  |     ),
  38  |   );
  39  | async function trigger(
  40  |   qa: QaEnvironment,
  41  |   group: Group,
  42  |   text = 'external question',
  43  | ): Promise<string> {
  44  |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  45  |   qa.gateway.emitMessage({
  46  |     groupId: group.gatewayGroupId,
  47  |     senderPlatformUserId: 'outside-user',
  48  |     text,
  49  |   });
  50  |   const runs = await eventually(
  51  |     () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  52  |     (value) => value.length > 0,
  53  |   );
  54  |   return runs[0]!.id;
  55  | }
  56  | const finished = (qa: QaEnvironment, id: string, timeoutMs = 20_000) =>
  57  |   qa.api.waitFor<AgentRun>(`/api/agent-runs/${id}`, (run) => run.status !== 'running', {
  58  |     timeoutMs,
  59  |   });
  60  | async function observeRun(
  61  |   qa: QaEnvironment,
  62  |   id: string,
  63  |   predicate: (run: AgentRun) => boolean,
  64  |   initialLower: number,
  65  |   timeoutMs: number,
  66  | ): Promise<{ run: AgentRun; lower: number; upper: number }> {
  67  |   let lower = initialLower;
  68  |   const run = await eventually(
  69  |     async () => {
  70  |       const beforeRead = Date.now();
  71  |       const value = await qa.api.agentRun(id);
  72  |       if (!predicate(value)) lower = beforeRead;
  73  |       return value;
  74  |     },
  75  |     predicate,
  76  |     { timeoutMs },
  77  |   );
  78  |   return { run, lower, upper: Date.now() };
  79  | }
  80  | async function timingInterval(
  81  |   qa: QaEnvironment,
  82  |   name: string,
  83  |   start: [number, number],
  84  |   end: [number, number],
  85  |   minimum: number,
  86  |   maximum: number,
  87  | ): Promise<void> {
  88  |   const bounds = {
  89  |     lowerMs: end[0] - start[1],
  90  |     upperMs: end[1] - start[0],
  91  |     minimum,
  92  |     maximum,
  93  |     start,
  94  |     end,
  95  |   };
  96  |   await qa.evidence(name, bounds);
  97  |   expect(bounds.lowerMs, 'Measured interval is entirely beyond deadline').toBeLessThanOrEqual(
  98  |     maximum,
  99  |   );
  100 |   expect(
  101 |     bounds.upperMs,
  102 |     'Measured interval is entirely before minimum duration',
  103 |   ).toBeGreaterThanOrEqual(minimum);
  104 |   if (bounds.lowerMs < minimum || bounds.upperMs > maximum)
> 105 |     throw new BlockedError(
      |           ^ BlockedError: [BLOCKED] Timing interval 60000..60138ms crosses required 60000..60000ms; lifecycle timestamp evidence is needed
  106 |       `Timing interval ${bounds.lowerMs}..${bounds.upperMs}ms crosses required ${minimum}..${maximum}ms; lifecycle timestamp evidence is needed`,
  107 |     );
  108 | }
  109 | 
  110 | test('[AGENT-001] four schema-complete tools and correct trigger context keep one run identity', async ({
  111 |   qa,
  112 | }) => {
  113 |   await qa.api.login();
  114 |   const { group, accounts } = await qa.api.createGroup();
  115 |   qa.agent.enqueueTurns(
  116 |     tool('t1', 'get_recent_messages', { limit: 10 }),
  117 |     finish('finished summary'),
  118 |   );
  119 |   const id = await trigger(qa, group);
  120 |   const run = await finished(qa, id);
  121 |   expect(run.status).toBe('finished');
  122 |   expect(run.endReason).toBe('final');
  123 |   expect(run.summary).toBe('finished summary');
  124 |   const calls = requests(qa);
  125 |   expect(calls).toHaveLength(2);
  126 |   expect(calls.every((call) => call.runId === id)).toBe(true);
  127 |   expect(calls[0]!.tools.map((value) => value.name).sort()).toEqual([
  128 |     'finish',
  129 |     'get_recent_messages',
  130 |     'kick_user',
  131 |     'send_message',
  132 |   ]);
  133 |   const required: Record<string, string[]> = {
  134 |     finish: ['summary'],
  135 |     get_recent_messages: ['limit'],
  136 |     kick_user: ['platform_user_id', 'reason'],
  137 |     send_message: ['text', 'idempotency_key'],
  138 |   };
  139 |   for (const value of calls[0]!.tools) {
  140 |     expect(value.input_schema.type).toBe('object');
  141 |     expect(value.input_schema.required.sort()).toEqual(required[value.name]!.sort());
  142 |   }
  143 |   const context = JSON.parse(calls[0]!.messages[0]!.content[0]!.text!);
  144 |   expect(context.groupId).toBe(group.id);
  145 |   expect(context.policy).toEqual({ autoKickEnabled: false });
  146 |   expect(context.ownPlatformUserIds).toEqual(
  147 |     expect.arrayContaining(accounts.map((account) => account.platformUserId)),
  148 |   );
  149 |   const allOwnIds = (await qa.api.accounts()).map((account) => account.platformUserId);
  150 |   expect(context.ownPlatformUserIds.every((id: string) => allOwnIds.includes(id))).toBe(true);
  151 |   expect(context.triggerMessages).toHaveLength(1);
  152 |   expect(context.triggerMessages[0].text).toBe('external question');
  153 |   expect(results(qa).some((value) => value.tool_use_id === 't1' && !value.is_error)).toBe(true);
  154 |   expect(
  155 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
  156 |   ).toHaveLength(0);
  157 | });
  158 | 
  159 | test('[AGENT-002] duplicate inbound and own echo never duplicate triggers', async ({ qa }) => {
  160 |   await qa.api.login();
  161 |   const { group, accounts } = await qa.api.createGroup();
  162 |   qa.agent.enqueueTurns(finish());
  163 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  164 |   qa.gateway.emitMessage(
  165 |     {
  166 |       groupId: group.gatewayGroupId,
  167 |       msgId: 'duplicate-trigger',
  168 |       senderPlatformUserId: 'external',
  169 |       text: 'once',
  170 |     },
  171 |     { repeat: 3 },
  172 |   );
  173 |   const runs = await eventually(
  174 |     () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  175 |     (value) => value.length === 1,
  176 |   );
  177 |   await finished(qa, runs[0]!.id);
  178 |   await qa.api.send(group.id, accounts[0]!.id, 'own echo');
  179 |   await eventually(
  180 |     () => qa.api.messages(group.id),
  181 |     (value) =>
  182 |       value.items.some(
  183 |         (message) => message.text === 'own echo' && message.deliveryStatus === 'sent',
  184 |       ),
  185 |   );
  186 |   await new Promise((resolve) => setTimeout(resolve, 1_200));
  187 |   expect(
  188 |     await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  189 |   ).toHaveLength(1);
  190 |   expect(requests(qa)).toHaveLength(1);
  191 | });
  192 | 
  193 | test('[AGENT-003] multi-instance active run excludes competitors and batches all pending messages', async ({
  194 |   qa,
  195 | }) => {
  196 |   await qa.api.login();
  197 |   const { group } = await qa.api.createGroup();
  198 |   qa.agent.enqueueTurns(
  199 |     { ...finish('first'), barrier: { phase: 'before-response', name: 'first-run' } },
  200 |     finish('second'),
  201 |   );
  202 |   await qa.startSecondInstance();
  203 |   const first = await trigger(qa, group);
  204 |   await qa.agent.barriers.waitFor('first-run');
  205 |   qa.gateway.emitMessage({
```