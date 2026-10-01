# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/agent.spec.ts >> [AGENT-002] duplicate inbound and own echo never duplicate triggers
- Location: tests/system/agent.spec.ts:159:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 1
Received length: 3
Received array:  [{"messages": [{"content": [{"text": "{\"groupId\":\"8d852a26-ef1a-4d10-9048-4af96ae074f2\",\"triggerMessages\":[{\"msgId\":\"duplicate-trigger\",\"senderPlatformUserId\":\"external\",\"text\":\"once\",\"sentAt\":\"2026-10-01T06:28:49.691Z\"}],\"policy\":{\"autoKickEnabled\":false},\"ownPlatformUserIds\":[\"platform-account-1\",\"platform-account-2\",\"platform-account-3\",\"platform-account-4\",\"platform-account-5\",\"platform-account-6\"]}", "type": "text"}], "role": "user"}], "runId": "659fcf63-d297-4805-9313-1cea440558f3", "tools": [{"description": "Read recent group messages.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"limit": {"exclusiveMinimum": 0, "maximum": 9007199254740991, "type": "integer"}}, "required": ["limit"], "type": "object"}, "name": "get_recent_messages"}, {"description": "Send an audited group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"idempotency_key": {"maxLength": 512, "minLength": 1, "type": "string"}, "text": {"maxLength": 20000, "minLength": 1, "type": "string"}}, "required": ["text", "idempotency_key"], "type": "object"}, "name": "send_message"}, {"description": "Remove a group member if policy permits.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"platform_user_id": {"maxLength": 512, "minLength": 1, "type": "string"}, "reason": {"maxLength": 2000, "minLength": 1, "type": "string"}}, "required": ["platform_user_id", "reason"], "type": "object"}, "name": "kick_user"}, {"description": "Finish this run without sending a group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"summary": {"maxLength": 20000, "type": "string"}}, "required": ["summary"], "type": "object"}, "name": "finish"}]}, {"messages": [{"content": [{"text": "{\"groupId\":\"8d852a26-ef1a-4d10-9048-4af96ae074f2\",\"triggerMessages\":[{\"msgId\":\"duplicate-trigger\",\"senderPlatformUserId\":\"external\",\"text\":\"once\",\"sentAt\":\"2026-10-01T06:28:49.691Z\"}],\"policy\":{\"autoKickEnabled\":false},\"ownPlatformUserIds\":[\"platform-account-1\",\"platform-account-2\",\"platform-account-3\",\"platform-account-4\",\"platform-account-5\",\"platform-account-6\"]}", "type": "text"}], "role": "user"}, {"content": [{"text": "PROTOCOL_ERROR BAD_JSON: Return one valid tool_use or end_turn block with a new tool id.", "type": "text"}], "role": "user"}], "runId": "659fcf63-d297-4805-9313-1cea440558f3", "tools": [{"description": "Read recent group messages.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"limit": {"exclusiveMinimum": 0, "maximum": 9007199254740991, "type": "integer"}}, "required": ["limit"], "type": "object"}, "name": "get_recent_messages"}, {"description": "Send an audited group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"idempotency_key": {"maxLength": 512, "minLength": 1, "type": "string"}, "text": {"maxLength": 20000, "minLength": 1, "type": "string"}}, "required": ["text", "idempotency_key"], "type": "object"}, "name": "send_message"}, {"description": "Remove a group member if policy permits.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"platform_user_id": {"maxLength": 512, "minLength": 1, "type": "string"}, "reason": {"maxLength": 2000, "minLength": 1, "type": "string"}}, "required": ["platform_user_id", "reason"], "type": "object"}, "name": "kick_user"}, {"description": "Finish this run without sending a group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"summary": {"maxLength": 20000, "type": "string"}}, "required": ["summary"], "type": "object"}, "name": "finish"}]}, {"messages": [{"content": [{"text": "{\"groupId\":\"8d852a26-ef1a-4d10-9048-4af96ae074f2\",\"triggerMessages\":[{\"msgId\":\"duplicate-trigger\",\"senderPlatformUserId\":\"external\",\"text\":\"once\",\"sentAt\":\"2026-10-01T06:28:49.691Z\"}],\"policy\":{\"autoKickEnabled\":false},\"ownPlatformUserIds\":[\"platform-account-1\",\"platform-account-2\",\"platform-account-3\",\"platform-account-4\",\"platform-account-5\",\"platform-account-6\"]}", "type": "text"}], "role": "user"}, {"content": [{"text": "PROTOCOL_ERROR BAD_JSON: Return one valid tool_use or end_turn block with a new tool id.", "type": "text"}], "role": "user"}, {"content": [{"text": "PROTOCOL_ERROR BAD_JSON: Return one valid tool_use or end_turn block with a new tool id.", "type": "text"}], "role": "user"}], "runId": "659fcf63-d297-4805-9313-1cea440558f3", "tools": [{"description": "Read recent group messages.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"limit": {"exclusiveMinimum": 0, "maximum": 9007199254740991, "type": "integer"}}, "required": ["limit"], "type": "object"}, "name": "get_recent_messages"}, {"description": "Send an audited group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"idempotency_key": {"maxLength": 512, "minLength": 1, "type": "string"}, "text": {"maxLength": 20000, "minLength": 1, "type": "string"}}, "required": ["text", "idempotency_key"], "type": "object"}, "name": "send_message"}, {"description": "Remove a group member if policy permits.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"platform_user_id": {"maxLength": 512, "minLength": 1, "type": "string"}, "reason": {"maxLength": 2000, "minLength": 1, "type": "string"}}, "required": ["platform_user_id", "reason"], "type": "object"}, "name": "kick_user"}, {"description": "Finish this run without sending a group message.", "input_schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"summary": {"maxLength": 20000, "type": "string"}}, "required": ["summary"], "type": "object"}, "name": "finish"}]}]
```

# Test source

```ts
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
  105 |     throw new BlockedError(
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
> 190 |   expect(requests(qa)).toHaveLength(1);
      |                        ^ Error: expect(received).toHaveLength(expected)
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
  206 |     groupId: group.gatewayGroupId,
  207 |     msgId: 'pending-later',
  208 |     senderPlatformUserId: 'outside',
  209 |     text: 'later',
  210 |     sentAt: '2026-01-01T00:00:00.002Z',
  211 |   });
  212 |   qa.gateway.emitMessage({
  213 |     groupId: group.gatewayGroupId,
  214 |     msgId: 'pending-earlier',
  215 |     senderPlatformUserId: 'outside',
  216 |     text: 'earlier',
  217 |     sentAt: '2026-01-01T00:00:00.001Z',
  218 |   });
  219 |   await eventually(
  220 |     () => qa.api.messages(group.id),
  221 |     (value) => value.items.some((message) => message.msgId === 'pending-earlier'),
  222 |   );
  223 |   expect(
  224 |     (await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`))).filter(
  225 |       (run) => run.status === 'running',
  226 |     ),
  227 |   ).toHaveLength(1);
  228 |   qa.agent.barriers.release('first-run');
  229 |   await finished(qa, first);
  230 |   const runs = await eventually(
  231 |     () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  232 |     (value) => value.length === 2 && value.every((run) => run.status !== 'running'),
  233 |   );
  234 |   expect(runs.every((run) => run.status === 'finished')).toBe(true);
  235 |   expect(requests(qa)).toHaveLength(2);
  236 |   const context = JSON.parse(requests(qa)[1]!.messages[0]!.content[0]!.text!);
  237 |   expect(context.triggerMessages.map((message: { msgId: string }) => message.msgId)).toEqual([
  238 |     'pending-earlier',
  239 |     'pending-later',
  240 |   ]);
  241 |   expect((await qa.api.group(group.id)).activeAgentRunId).toBeNull();
  242 |   await qa.stopSecondInstance();
  243 | });
  244 | 
  245 | const invalidTurns = [
  246 |   { id: 'AGENT-004', name: 'non-JSON', plan: { rawBody: '<html>invalid</html>' } },
  247 |   {
  248 |     id: 'AGENT-005',
  249 |     name: 'fenced JSON',
  250 |     plan: {
  251 |       rawBody: '```json\n{"stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}\n```',
  252 |     },
  253 |   },
  254 |   {
  255 |     id: 'AGENT-006',
  256 |     name: 'multiple blocks',
  257 |     plan: {
  258 |       body: {
  259 |         stop_reason: 'end_turn',
  260 |         content: [
  261 |           { type: 'text', text: 'one' },
  262 |           { type: 'text', text: 'two' },
  263 |         ],
  264 |       },
  265 |     },
  266 |   },
  267 |   {
  268 |     id: 'AGENT-007',
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
```