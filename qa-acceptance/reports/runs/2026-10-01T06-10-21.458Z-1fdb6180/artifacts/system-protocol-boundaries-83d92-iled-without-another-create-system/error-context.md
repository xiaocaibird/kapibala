# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/protocol-boundaries.spec.ts >> [BLK-EXT-002] a created group whose response was lost is reconciled without another create
- Location: tests/system/protocol-boundaries.spec.ts:79:1

# Error details

```
BlockedError: [BLOCKED] Created group job has no terminal evidence within 20s probe; CL-01 recovery still unresolved
```

# Test source

```ts
  11  |   body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] },
  12  | });
  13  | 
  14  | async function enable(qa: QaEnvironment, group: Group) {
  15  |   await qa.api.require(
  16  |     qa.api.patch(`/api/groups/${group.id}`, {
  17  |       agentEnabled: true,
  18  |       autoKickEnabled: true,
  19  |     }),
  20  |   );
  21  | }
  22  | function trigger(qa: QaEnvironment, group: Group, text: string) {
  23  |   qa.gateway.emitMessage({
  24  |     groupId: group.gatewayGroupId,
  25  |     senderPlatformUserId: 'protocol-boundary-outside',
  26  |     text,
  27  |   });
  28  | }
  29  | async function runId(qa: QaEnvironment, group: Group) {
  30  |   const current = await qa.api.group(group.id);
  31  |   expect(current.activeAgentRunId, 'fault barrier must belong to an active run').toEqual(
  32  |     expect.any(String),
  33  |   );
  34  |   return current.activeAgentRunId!;
  35  | }
  36  | async function evidence(qa: QaEnvironment, name: string, extra: unknown = null) {
  37  |   await qa.evidence(name, { gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot(), extra });
  38  | }
  39  | 
  40  | async function createJob(qa: QaEnvironment) {
  41  |   const accounts = (await qa.api.connectAll())
  42  |     .filter((account) => account.status === 'online')
  43  |     .slice(0, 2);
  44  |   if (accounts.length < 2) throw new BlockedError('Two isolated online account seeds required');
  45  |   const { jobId } = await qa.api.require(
  46  |     qa.api.post<{ jobId: string }>('/api/groups', {
  47  |       creatorAccountId: accounts[0]!.id,
  48  |       memberAccountIds: [accounts[1]!.id],
  49  |     }),
  50  |     202,
  51  |   );
  52  |   return { accounts, jobId };
  53  | }
  54  | 
  55  | async function completedCreation(
  56  |   qa: QaEnvironment,
  57  |   jobId: string,
  58  |   gatewayGroupId: string,
  59  |   creatorId: string,
  60  |   adminId: string,
  61  | ) {
  62  |   const job = await qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`));
  63  |   expect(job.status, 'restart must not turn an effective successful operation into failure').toBe(
  64  |     'finished',
  65  |   );
  66  |   expect(job.errors).toEqual([]);
  67  |   const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  68  |   expect(groups).toHaveLength(1);
  69  |   expect(groups[0]!.gatewayGroupId).toBe(gatewayGroupId);
  70  |   expect(groups[0]!.members.find((member) => member.accountId === creatorId)?.role).toBe('creator');
  71  |   expect(groups[0]!.members.find((member) => member.accountId === adminId)?.role).toBe('admin');
  72  |   const remote = qa.gateway.snapshot().groups.find((group) => group.groupId === gatewayGroupId)!;
  73  |   const admin = qa.gateway.snapshot().accounts.find((account) => account.id === adminId)!;
  74  |   expect(
  75  |     remote.members.find((member) => member.platformUserId === admin.platformUserId)?.role,
  76  |   ).toBe('admin');
  77  | }
  78  | 
  79  | test('[BLK-EXT-002] a created group whose response was lost is reconciled without another create', async ({
  80  |   qa,
  81  | }) => {
  82  |   await qa.api.login();
  83  |   qa.gateway.enqueue('/groups', { barrier: { phase: 'after-effect', name: 'created-id-lost' } });
  84  |   try {
  85  |     const { jobId, accounts } = await createJob(qa);
  86  |     await qa.gateway.barriers.waitFor('created-id-lost');
  87  |     const snapshot = qa.gateway.snapshot();
  88  |     expect(snapshot.groups).toHaveLength(1);
  89  |     const remoteId = snapshot.groups[0]!.groupId;
  90  |     expect(
  91  |       snapshot.requests.find((entry) => entry.path === '/groups')?.responseStatus,
  92  |     ).toBeUndefined();
  93  |     await qa.kill();
  94  |     qa.gateway.barriers.release('created-id-lost');
  95  |     await evidence(qa, 'created-id-lost-at-crash', { jobId, remoteId });
  96  |     // The private remoteId is evidence only: it is never sent to the SUT.
  97  |     await qa.start();
  98  |     await qa.api.login();
  99  |     const result = await observe({
  100 |       durationMs: 20_000,
  101 |       read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
  102 |       complete: (job) => job.status !== 'running',
  103 |       invariant: () => {
  104 |         expect(
  105 |           qa.gateway.snapshot().effects.filter((entry) => entry.kind === 'create'),
  106 |         ).toHaveLength(1);
  107 |       },
  108 |     });
  109 |     await evidence(qa, 'created-id-lost-observation', result);
  110 |     if (!result.complete)
> 111 |       throw new BlockedError(
      |             ^ BlockedError: [BLOCKED] Created group job has no terminal evidence within 20s probe; CL-01 recovery still unresolved
  112 |         'Created group job has no terminal evidence within 20s probe; CL-01 recovery still unresolved',
  113 |       );
  114 |     await completedCreation(qa, jobId, remoteId, accounts[0]!.id, accounts[1]!.id);
  115 |   } finally {
  116 |     qa.gateway.barriers.release('created-id-lost');
  117 |     await evidence(qa, 'created-id-lost-final-ledger');
  118 |   }
  119 | });
  120 | 
  121 | test('[BLK-EXT-003] promotion response loss preserves administrator facts and the two-call limit', async ({
  122 |   qa,
  123 | }) => {
  124 |   test.setTimeout(180_000);
  125 |   await qa.api.login();
  126 |   qa.gateway.enqueue('/groups', {
  127 |     barrier: { phase: 'before-response', name: 'prepare-promotion' },
  128 |   });
  129 |   try {
  130 |     const { jobId, accounts } = await createJob(qa);
  131 |     await qa.gateway.barriers.waitFor('prepare-promotion');
  132 |     const remoteId = qa.gateway.snapshot().groups[0]!.groupId;
  133 |     const path = `/groups/${remoteId}/promote`;
  134 |     for (const suffix of ['first', 'second'])
  135 |       qa.gateway.enqueue(path, {
  136 |         barrier: { phase: 'after-effect', name: `promotion-${suffix}` },
  137 |       });
  138 |     qa.gateway.barriers.release('prepare-promotion');
  139 |     await qa.gateway.barriers.waitFor('promotion-first', 20_000);
  140 |     const first = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
  141 |     expect(first.responseStatus).toBeUndefined();
  142 |     await qa.kill();
  143 |     qa.gateway.barriers.release('promotion-first');
  144 |     await evidence(qa, 'promotion-first-crash', { jobId, remoteId });
  145 |     await qa.start();
  146 |     await qa.api.login();
  147 |     const invariant = () => {
  148 |       const snapshot = qa.gateway.snapshot();
  149 |       expect(snapshot.requests.filter((entry) => entry.path === path).length).toBeLessThanOrEqual(
  150 |         2,
  151 |       );
  152 |       expect(snapshot.effects.filter((entry) => entry.kind === 'create')).toHaveLength(1);
  153 |       expect(
  154 |         snapshot.groups
  155 |           .find((group) => group.groupId === remoteId)!
  156 |           .members.find((member) => member.platformUserId === accounts[1]!.platformUserId)?.role,
  157 |       ).toBe('admin');
  158 |     };
  159 |     const phase = await observe({
  160 |       durationMs: 20_000,
  161 |       read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
  162 |       invariant,
  163 |       complete: (job) =>
  164 |         job.status !== 'running' ||
  165 |         qa.gateway.barriers.snapshot().some((entry) => entry.name === 'promotion-second'),
  166 |     });
  167 |     await evidence(qa, 'promotion-first-recovery', phase);
  168 |     if (!phase.complete)
  169 |       throw new BlockedError(
  170 |         'No next promotion or terminal job within 20s probe; not proof of infinite stall',
  171 |       );
  172 |     if (qa.gateway.barriers.snapshot().some((entry) => entry.name === 'promotion-second')) {
  173 |       await qa.kill();
  174 |       qa.gateway.barriers.release('promotion-second');
  175 |       await evidence(qa, 'promotion-second-crash', { jobId });
  176 |       await qa.start();
  177 |       await qa.api.login();
  178 |       const second = await observe({
  179 |         durationMs: 20_000,
  180 |         read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
  181 |         invariant,
  182 |         complete: (job) => job.status !== 'running',
  183 |       });
  184 |       await evidence(qa, 'promotion-second-recovery', second);
  185 |       if (!second.complete)
  186 |         throw new BlockedError(
  187 |           'Two promotion confirmations lost; no terminal job within observation budget',
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
```