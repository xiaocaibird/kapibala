# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/sequence-failure-policy.spec.ts >> [BLK-SPEC-002] ordinary send failure fails the sequence and never advances later steps
- Location: tests/system/sequence-failure-policy.spec.ts:10:1

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
    "clientMsgId": "bc1bf74c-1f8f-46ad-a2bf-f38909da49d1",
-   "sentAt": null,
+   "sentAt": "2026-10-01T06:01:10.989Z",
    "status": "failed",
  }
```

# Test source

```ts
  56  |                 method: 'POST',
  57  |                 signal: AbortSignal.timeout(5_000),
  58  |               },
  59  |             );
  60  |             expect(response.status).toBe(200);
  61  |           } else {
  62  |             qa.gateway.setMembership(group.gatewayGroupId, actorPlatformId!, true);
  63  |           }
  64  |           faultActive = false;
  65  |         };
  66  |         try {
  67  |           ({ runId } = await qa.api.require(
  68  |             qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
  69  |               sequenceId: id,
  70  |               vars: {},
  71  |               stepVars: {},
  72  |             }),
  73  |             201,
  74  |           ));
  75  |           const hit = await qa.gateway.barriers.waitFor(barrier, 15_000);
  76  |           const request = hit.context as GatewayRequest;
  77  |           const payload = request.body as { accountId: string; clientMsgId: string; text: string };
  78  |           expect(request.path).toBe(path);
  79  |           expect(payload.text).toBe(texts[failedIndex - 1]);
  80  |           expect(payload.clientMsgId).toEqual(expect.any(String));
  81  |           actorId = payload.accountId;
  82  |           const actor = qa.gateway.snapshot().accounts.find((account) => account.id === actorId);
  83  |           expect(actor).toBeDefined();
  84  |           actorPlatformId = actor!.platformUserId;
  85  |           expect(
  86  |             qa.gateway
  87  |               .snapshot()
  88  |               .messages.filter((message) => message.groupId === group.gatewayGroupId)
  89  |               .map((message) => message.text),
  90  |           ).toEqual(texts.slice(0, failedIndex - 1));
  91  |           expect(
  92  |             (await qa.api.sequenceRun(runId)).steps
  93  |               .slice(0, failedIndex - 1)
  94  |               .map((step) => step.status),
  95  |           ).toEqual(Array(failedIndex - 1).fill('sent'));
  96  |           faultActive = true;
  97  |           if (code === 'ACCOUNT_OFFLINE') {
  98  |             const response = await fetch(
  99  |               `${qa.gateway.url}/accounts/${encodeURIComponent(actorId)}/disconnect`,
  100 |               {
  101 |                 method: 'POST',
  102 |                 signal: AbortSignal.timeout(5_000),
  103 |               },
  104 |             );
  105 |             expect(response.status).toBe(200);
  106 |             expect(
  107 |               qa.gateway.snapshot().accounts.find((account) => account.id === actorId)!.connected,
  108 |             ).toBe(false);
  109 |           } else {
  110 |             // Keep the leave event in durable external history, without pushing
  111 |             // it first: this is an in-flight send race, not "no candidate" skip.
  112 |             qa.gateway.setMembership(group.gatewayGroupId, actorPlatformId, false, {
  113 |               storeOnly: true,
  114 |             });
  115 |           }
  116 |           await qa.evidence(`${label}-fault-before-response`, {
  117 |             runId,
  118 |             hit,
  119 |             gateway: qa.gateway.snapshot(),
  120 |           });
  121 |           qa.gateway.barriers.release(barrier);
  122 |           const failedResponse = await qa.gateway.waitForRequest(
  123 |             (entry) => entry.id === request.id && entry.completedAt !== undefined,
  124 |           );
  125 |           expect(failedResponse.responseStatus).toBe(code === 'ACCOUNT_OFFLINE' ? 409 : 403);
  126 | 
  127 |           const assertNoLaterSend = () => {
  128 |             const snapshot = qa.gateway.snapshot();
  129 |             const sends = snapshot.requests.filter((entry) => entry.path === path);
  130 |             expect(sends.map((entry) => (entry.body as { text: string }).text)).toEqual(
  131 |               texts.slice(0, failedIndex),
  132 |             );
  133 |             expect(
  134 |               snapshot.messages
  135 |                 .filter((message) => message.groupId === group.gatewayGroupId)
  136 |                 .map((message) => message.text),
  137 |             ).toEqual(texts.slice(0, failedIndex - 1));
  138 |           };
  139 |           const result = await observe({
  140 |             read: () => qa.api.sequenceRun(runId!),
  141 |             durationMs: 15_000,
  142 |             invariant: (run) => {
  143 |               assertNoLaterSend();
  144 |               if (run.status !== 'running') expect(run.status).toBe('failed');
  145 |               for (const step of run.steps.slice(failedIndex)) {
  146 |                 expect(['sent', 'accepted']).not.toContain(step.status);
  147 |               }
  148 |             },
  149 |             complete: (run) => run.status !== 'running',
  150 |           });
  151 |           await qa.evidence(`${label}-failure-result`, result);
  152 |           if (!result.complete)
  153 |             throw new BlockedError(
  154 |               'No sequence terminal evidence within the 15s observation budget; QA-D6 did not introduce a terminal-latency SLA',
  155 |             );
> 156 |           expect(result.last.steps[failedIndex - 1]).toMatchObject({
      |                                                      ^ Error: expect(received).toMatchObject(expected)
  157 |             status: 'failed',
  158 |             clientMsgId: payload.clientMsgId,
  159 |             sentAt: null,
  160 |           });
  161 |           const failedMessage = (await qa.api.messages(group.id)).items.filter(
  162 |             (message) => message.clientMsgId === payload.clientMsgId,
  163 |           );
  164 |           expect(failedMessage).toHaveLength(1);
  165 |           expect(failedMessage[0]).toMatchObject({
  166 |             deliveryStatus: 'failed',
  167 |             failCode: code,
  168 |             msgId: null,
  169 |           });
  170 |           expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
  171 |           expect((await qa.api.group(group.id)).status).toBe(group.status);
  172 |           expect(await accountStates()).toEqual(beforeAccounts);
  173 | 
  174 |           // Remove the external failure so it cannot hide an erroneous retry or
  175 |           // a newly dispatched later step. Observe both live and restarted runs.
  176 |           await restore();
  177 |           const verifyStopped = async (phase: string) => {
  178 |             const observation = await observe({
  179 |               read: () => qa.api.sequenceRun(runId!),
  180 |               durationMs: 1_500,
  181 |               complete: () => false,
  182 |               invariant: async (run) => {
  183 |                 assertNoLaterSend();
  184 |                 expect(run.status).toBe('failed');
  185 |                 expect(run.steps).toHaveLength(3);
  186 |                 expect(run.steps.slice(0, failedIndex - 1).map((step) => step.status)).toEqual(
  187 |                   Array(failedIndex - 1).fill('sent'),
  188 |                 );
  189 |                 expect(run.steps[failedIndex - 1]).toMatchObject({
  190 |                   status: 'failed',
  191 |                   clientMsgId: payload.clientMsgId,
  192 |                   sentAt: null,
  193 |                 });
  194 |                 for (const step of run.steps.slice(failedIndex))
  195 |                   expect(['sent', 'accepted']).not.toContain(step.status);
  196 |                 expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
  197 |                 const message = (await qa.api.messages(group.id)).items.find(
  198 |                   (item) => item.clientMsgId === payload.clientMsgId,
  199 |                 );
  200 |                 expect(message).toMatchObject({ deliveryStatus: 'failed', failCode: code });
  201 |               },
  202 |             });
  203 |             await qa.evidence(`${label}-${phase}`, {
  204 |               observation,
  205 |               boundary:
  206 |                 'Finite observation with all subsequent delays zero; no claim about infinite time',
  207 |             });
  208 |           };
  209 |           await verifyStopped('restored-external-state');
  210 |           if (failedIndex === 2) {
  211 |             await qa.restart();
  212 |             await qa.api.login();
  213 |             await verifyStopped('after-restart');
  214 |           }
  215 |         } catch (error) {
  216 |           primaryFailure = error;
  217 |           hadPrimaryFailure = true;
  218 |           throw error;
  219 |         } finally {
  220 |           qa.gateway.barriers.release(barrier);
  221 |           const cleanupErrors: unknown[] = [];
  222 |           try {
  223 |             await qa.evidence(`${label}-final-ledger`, { runId, gateway: qa.gateway.snapshot() });
  224 |           } catch (error) {
  225 |             cleanupErrors.push(error);
  226 |           }
  227 |           try {
  228 |             await restore();
  229 |           } catch (cleanup) {
  230 |             cleanupErrors.push(cleanup);
  231 |           }
  232 |           if (cleanupErrors.length) {
  233 |             try {
  234 |               await qa.evidence(`${label}-cleanup-failure`, {
  235 |                 errors: cleanupErrors.map(String),
  236 |                 primaryFailure: String(primaryFailure),
  237 |               });
  238 |             } catch (error) {
  239 |               cleanupErrors.push(error);
  240 |             }
  241 |             if (!hadPrimaryFailure)
  242 |               throw new AggregateError(
  243 |                 cleanupErrors,
  244 |                 `${label}: evidence or external cleanup failed`,
  245 |               );
  246 |           }
  247 |         }
  248 |       });
  249 |     }
  250 |   }
  251 |   await test.step('unknown remains pending until confirmation, then failure stops the run', () =>
  252 |     verifySequenceTimeoutPolicy(qa));
  253 | });
  254 | 
```