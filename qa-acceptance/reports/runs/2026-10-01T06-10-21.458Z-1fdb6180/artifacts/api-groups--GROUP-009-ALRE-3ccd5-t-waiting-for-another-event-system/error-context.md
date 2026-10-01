# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api/groups.spec.ts >> [GROUP-009] ALREADY_MEMBER confirms existing membership without waiting for another event
- Location: tests/api/groups.spec.ts:244:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "finished"
Received: "failed"
```

# Test source

```ts
  163 |   );
  164 |   expect((leaves.at(-1)!.body as { accountId: string }).accountId).toBe(group.creatorAccountId);
  165 |   const updated = await qa.api.group(group.id);
  166 |   expect(updated.status).toBe('left');
  167 |   // This fixture has no external users; D042 therefore still yields an empty list.
  168 |   expect(updated.members).toEqual([]);
  169 |   const serviceIds = accounts.map((account) => account.platformUserId);
  170 |   expect(
  171 |     qa.gateway
  172 |       .snapshot()
  173 |       .groups[0]!.members.filter((member) => serviceIds.includes(member.platformUserId)),
  174 |   ).toEqual([]);
  175 | });
  176 | 
  177 | test('[GROUP-007] failed noncreator leave preserves owner and continues remaining accounts', async ({
  178 |   qa,
  179 | }) => {
  180 |   await qa.api.login();
  181 |   const { group, accounts } = await qa.api.createGroup();
  182 |   qa.gateway.enqueue(`/groups/${group.gatewayGroupId}/leave`, {
  183 |     status: 500,
  184 |     code: 'INTERNAL_ERROR',
  185 |     effect: 'none',
  186 |   });
  187 |   const { jobId } = await qa.api.require(
  188 |     qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`),
  189 |     202,
  190 |   );
  191 |   const job = await qa.api.waitJob(jobId);
  192 |   expect(job.status).toBe('failed');
  193 |   expect(job.errors.length).toBeGreaterThan(0);
  194 |   const leaves = qa.gateway
  195 |     .snapshot()
  196 |     .requests.filter((request) => request.path.endsWith('/leave'));
  197 |   expect(leaves).toHaveLength(accounts.length - 1);
  198 |   expect(
  199 |     leaves.some(
  200 |       (request) => (request.body as { accountId: string }).accountId === group.creatorAccountId,
  201 |     ),
  202 |   ).toBe(false);
  203 |   const failedId = (
  204 |     leaves.find((request) => request.responseStatus === 500)!.body as { accountId: string }
  205 |   ).accountId;
  206 |   expect(job.errors.some((error) => error.step === `leave:${failedId}`)).toBe(true);
  207 |   const local = await qa.api.group(group.id);
  208 |   const remote = qa.gateway.snapshot().groups[0]!;
  209 |   expect(local.members.some((member) => member.accountId === failedId)).toBe(true);
  210 |   expect(local.members.map((member) => member.platformUserId).sort()).toEqual(
  211 |     remote.members
  212 |       .filter((member) =>
  213 |         accounts.some((account) => account.platformUserId === member.platformUserId),
  214 |       )
  215 |       .map((member) => member.platformUserId)
  216 |       .sort(),
  217 |   );
  218 | });
  219 | 
  220 | test('[GROUP-008] member rows wait for actual joined event before promotion', async ({ qa }) => {
  221 |   await qa.api.login();
  222 |   const accounts = await qa.api.connectAll();
  223 |   requireSeeds(accounts);
  224 |   qa.gateway.configure({ joinDelayMs: 1_500 });
  225 |   const { jobId } = await qa.api.require(
  226 |     qa.api.post<{ jobId: string }>('/api/groups', {
  227 |       creatorAccountId: accounts[0]!.id,
  228 |       memberAccountIds: [accounts[1]!.id],
  229 |     }),
  230 |     202,
  231 |   );
  232 |   await qa.gateway.waitForRequest((request) => request.path.endsWith('/join'));
  233 |   const pending = await eventually(
  234 |     () => qa.api.require(qa.api.get<Group[]>('/api/groups')),
  235 |     (groups) => groups.length === 1,
  236 |   );
  237 |   expect(pending[0]!.members.map((member) => member.accountId)).toEqual([accounts[0]!.id]);
  238 |   expect(
  239 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/promote')),
  240 |   ).toHaveLength(0);
  241 |   expect((await qa.api.waitJob(jobId)).status).toBe('finished');
  242 | });
  243 | 
  244 | test('[GROUP-009] ALREADY_MEMBER confirms existing membership without waiting for another event', async ({
  245 |   qa,
  246 | }) => {
  247 |   await qa.api.login();
  248 |   const accounts = await qa.api.connectAll();
  249 |   requireSeeds(accounts);
  250 |   qa.gateway.enqueue('/groups', {
  251 |     barrier: { phase: 'before-response', name: 'preexisting-group' },
  252 |   });
  253 |   const pending = qa.api.post<{ jobId: string }>('/api/groups', {
  254 |     creatorAccountId: accounts[0]!.id,
  255 |     memberAccountIds: [accounts[1]!.id],
  256 |   });
  257 |   await qa.gateway.barriers.waitFor('preexisting-group');
  258 |   const remote = qa.gateway.snapshot().groups[0]!;
  259 |   qa.gateway.setMembership(remote.groupId, accounts[1]!.platformUserId!, true, { storeOnly: true });
  260 |   qa.gateway.barriers.release('preexisting-group');
  261 |   const response = await pending;
  262 |   expect(response.status).toBe(202);
> 263 |   expect((await qa.api.waitJob(response.body.jobId)).status).toBe('finished');
      |                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  264 |   const joins = qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/join'));
  265 |   expect(joins).toHaveLength(1);
  266 |   expect(joins[0]!.responseStatus).toBe(409);
  267 |   const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  268 |   expect(groups[0]!.members.find((member) => member.accountId === accounts[1]!.id)?.role).toBe(
  269 |     'admin',
  270 |   );
  271 |   expect(
  272 |     qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/promote')).length,
  273 |   ).toBeLessThanOrEqual(2);
  274 | });
  275 | 
  276 | test('[GROUP-010] leave-all preserves public external members and keeps left groups inactive', async ({
  277 |   qa,
  278 | }) => {
  279 |   test.setTimeout(90_000);
  280 |   await qa.api.login();
  281 |   const { group, accounts } = await qa.api.createGroup();
  282 |   const allAccounts = await qa.api.accounts();
  283 |   const externalIds = ['external-stays-1', 'external-stays-2'];
  284 |   for (const id of externalIds) qa.gateway.setMembership(group.gatewayGroupId, id, true);
  285 |   await eventually(
  286 |     () => qa.api.group(group.id),
  287 |     (value) =>
  288 |       externalIds.every((id) => value.members.some((member) => member.platformUserId === id)),
  289 |   );
  290 |   const sequence = await qa.api.require(
  291 |     qa.api.post<{ id: string }>('/api/sequences', {
  292 |       name: 'left-does-not-resume',
  293 |       steps: [
  294 |         { index: 1, text: 'must-not-send-after-left', accountRole: 'admin', delaySeconds: 3600 },
  295 |       ],
  296 |     }),
  297 |   );
  298 |   const start = await qa.api.require(
  299 |     qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
  300 |       sequenceId: sequence.id,
  301 |       vars: {},
  302 |       stepVars: {},
  303 |     }),
  304 |     201,
  305 |   );
  306 |   qa.agent.enqueueTurns(
  307 |     {
  308 |       body: {
  309 |         stop_reason: 'tool_use',
  310 |         content: [
  311 |           {
  312 |             type: 'tool_use',
  313 |             id: 'left-current',
  314 |             name: 'get_recent_messages',
  315 |             input: { limit: 1 },
  316 |           },
  317 |         ],
  318 |       },
  319 |       barrier: { phase: 'before-response', name: 'left-current-turn' },
  320 |     },
  321 |     { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'must-not-request' }] } },
  322 |   );
  323 |   await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  324 |   qa.gateway.emitMessage({
  325 |     groupId: group.gatewayGroupId,
  326 |     senderPlatformUserId: externalIds[0]!,
  327 |     text: 'before-leave-trigger',
  328 |   });
  329 |   try {
  330 |     await qa.agent.barriers.waitFor('left-current-turn');
  331 |     const heldAt = performance.now();
  332 |     const before = await qa.api.require(
  333 |       qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`),
  334 |     );
  335 |     expect(before).toHaveLength(1);
  336 |     expect(before[0]!.status).toBe('running');
  337 |     const { jobId } = await qa.api.require(
  338 |       qa.api.post<{ jobId: string }>(`/api/groups/${group.id}/leave-all`),
  339 |       202,
  340 |     );
  341 |     expect((await qa.api.waitJob(jobId)).status).toBe('finished');
  342 |     qa.agent.barriers.release('left-current-turn');
  343 |     const heldMs = performance.now() - heldAt;
  344 |     if (heldMs >= 9_000) {
  345 |       await qa.evidence('left-current-turn-prerequisite', { heldMs });
  346 |       throw new BlockedError(
  347 |         'Current turn barrier approached the minimum 10s timeout; cannot distinguish leave cancellation from turn timeout in this run',
  348 |       );
  349 |     }
  350 | 
  351 |     const read = async () => ({
  352 |       group: await qa.api.group(group.id),
  353 |       directory: await qa.api.require(qa.api.get<Group[]>('/api/groups')),
  354 |       sequence: await qa.api.require(qa.api.get<SequenceRun>(`/api/sequence-runs/${start.runId}`)),
  355 |       runs: await qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
  356 |       gateway: qa.gateway.snapshot(),
  357 |       agent: qa.agent.snapshot(),
  358 |     });
  359 |     const invariant = (value: Awaited<ReturnType<typeof read>>) => {
  360 |       const directoryGroup = value.directory.find((entry) => entry.id === group.id);
  361 |       expect(directoryGroup).toBeDefined();
  362 |       for (const exposed of [value.group, directoryGroup!]) {
  363 |         assertContract('group', exposed);
```