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
    "clientMsgId": "8ae9db54-71c1-4287-80c6-150fd6084d94",
-   "sentAt": null,
+   "sentAt": "2026-10-01T06:37:50.910Z",
    "status": "failed",
  }
```

# Test source

```ts
  170 |     await qa.evidence(`${label}-held-unknown`, {
  171 |       firstUnknown,
  172 |       held,
  173 |       queriesDuringOutage,
  174 |       gateway: qa.gateway.snapshot(),
  175 |     });
  176 |     if (!queriesDuringOutage.length)
  177 |       throw new BlockedError(
  178 |         'No actual by-client-id 503 was observed; query-unavailability precondition is unproven',
  179 |       );
  180 | 
  181 |     const recoveryLower = Date.now();
  182 |     qa.gateway.configure({ unavailable: false });
  183 |     const recoveryUpper = Date.now();
  184 |     queryRecoveredAt = recoveryLower;
  185 |     let lastUnresolvedRead = recoveryLower;
  186 |     const resolved = await observe({
  187 |       read,
  188 |       durationMs: 2_100,
  189 |       invariant: (state) => {
  190 |         const { retry, snapshot } = ledger(true);
  191 |         expect(['unknown', 'queued', 'failed']).toContain(state.message.deliveryStatus);
  192 |         if (state.run.status !== 'running') expect(state.run.status).toBe('failed');
  193 |         if (state.message.deliveryStatus === 'failed' && !retry)
  194 |           expect(
  195 |             snapshot.requests.some(
  196 |               (request) =>
  197 |                 request.path === queryPath &&
  198 |                 request.responseStatus === 404 &&
  199 |                 Date.parse(request.at) >= recoveryLower &&
  200 |                 Date.parse(request.at) > initialCompletedAt + 2_000 &&
  201 |                 Date.parse(request.completedAt!) <= state.afterMessageRead,
  202 |             ),
  203 |             'Failure without retry needs definitive confirmation before the first failed observation',
  204 |           ).toBe(true);
  205 |         if (state.message.deliveryStatus === 'failed' && retry) {
  206 |           expect(retry.responseStatus).toBe(409);
  207 |           expect(retry.completedAt).toEqual(expect.any(String));
  208 |           expect(Date.parse(retry.completedAt!)).toBeLessThanOrEqual(state.afterMessageRead);
  209 |         }
  210 |         if (state.message.deliveryStatus !== 'failed') {
  211 |           lastUnresolvedRead = state.beforeMessageRead;
  212 |           expect(
  213 |             lastUnresolvedRead - recoveryUpper,
  214 |             'A2 requires known message state within two seconds after query recovery',
  215 |           ).toBeLessThanOrEqual(2_000);
  216 |         }
  217 |       },
  218 |       complete: (state) => state.message.deliveryStatus === 'failed',
  219 |     });
  220 |     const bounds = {
  221 |       lowerMs: lastUnresolvedRead - recoveryUpper,
  222 |       upperMs: resolved.last.afterMessageRead - recoveryLower,
  223 |       limitMs: 2_000,
  224 |       recovery: [recoveryLower, recoveryUpper],
  225 |       observation: [lastUnresolvedRead, resolved.last.afterMessageRead],
  226 |     };
  227 |     await qa.evidence(`${label}-query-recovery`, {
  228 |       resolved,
  229 |       bounds,
  230 |       gateway: qa.gateway.snapshot(),
  231 |     });
  232 |     if (!resolved.complete || bounds.upperMs > 2_000)
  233 |       throw new BlockedError(
  234 |         `Recovery observation interval ${bounds.lowerMs}..${bounds.upperMs}ms does not prove the two-second deadline`,
  235 |       );
  236 |     const completed = await observe({
  237 |       read,
  238 |       durationMs: 15_000,
  239 |       invariant: (state) => {
  240 |         const { retry } = ledger(true);
  241 |         expect(state.message).toMatchObject({
  242 |           deliveryStatus: 'failed',
  243 |           failCode: retry ? 'ACCOUNT_OFFLINE' : 'NETWORK_TIMEOUT',
  244 |           msgId: null,
  245 |         });
  246 |         if (state.run.status !== 'running') expect(state.run.status).toBe('failed');
  247 |       },
  248 |       complete: (state) => state.run.status === 'failed',
  249 |     });
  250 |     await qa.evidence(`${label}-sequence-terminal`, completed);
  251 |     if (!completed.complete)
  252 |       throw new BlockedError(
  253 |         'The message failed, but no sequence terminal evidence was observed; QA-D6 adds no terminal-latency SLA',
  254 |       );
  255 |     const finalLedger = ledger(true);
  256 |     if (finalLedger.retry) expect(finalLedger.retry.responseStatus).toBe(409);
  257 |     else
  258 |       expect(
  259 |         finalLedger.snapshot.requests.some(
  260 |           (request) =>
  261 |             request.path === queryPath &&
  262 |             request.responseStatus === 404 &&
  263 |             request.completedAt !== undefined &&
  264 |             Date.parse(request.at) >= recoveryLower &&
  265 |             Date.parse(request.at) - initialCompletedAt >= 2_000,
  266 |         ),
  267 |         'Failure without retry still needs confirmed absence',
  268 |       ).toBe(true);
  269 |     const failedCode = finalLedger.retry ? 'ACCOUNT_OFFLINE' : 'NETWORK_TIMEOUT';
> 270 |     expect(completed.last.run.steps[1]).toMatchObject({
      |                                         ^ Error: expect(received).toMatchObject(expected)
  271 |       status: 'failed',
  272 |       clientMsgId: payload.clientMsgId,
  273 |       sentAt: null,
  274 |     });
  275 |     expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
  276 |     expect((await qa.api.group(group.id)).status).toBe(group.status);
  277 |     expect((await qa.api.accounts()).find((account) => account.id === actorId)?.status).toBe(
  278 |       actorBefore!.status,
  279 |     );
  280 |     await restoreAccount();
  281 |     const stopped = await observe({
  282 |       read,
  283 |       durationMs: 1_500,
  284 |       complete: () => false,
  285 |       invariant: (state) => {
  286 |         const current = ledger(true);
  287 |         expect(current.sends).toHaveLength(finalLedger.sends.length);
  288 |         expect(state.message).toMatchObject({
  289 |           deliveryStatus: 'failed',
  290 |           failCode: failedCode,
  291 |           msgId: null,
  292 |         });
  293 |         expect(state.run.status).toBe('failed');
  294 |         expect(state.run.steps[1]).toMatchObject({
  295 |           status: 'failed',
  296 |           clientMsgId: payload.clientMsgId,
  297 |         });
  298 |         expect(state.run.steps[2]?.status).not.toBe('accepted');
  299 |         expect(state.run.steps[2]?.status).not.toBe('sent');
  300 |       },
  301 |     });
  302 |     await qa.evidence(`${label}-restored-external-state`, {
  303 |       stopped,
  304 |       gateway: qa.gateway.snapshot(),
  305 |       boundary:
  306 |         'Finite observation; one unknown request, optional retry with a real offline error; does not cover a second 504 window',
  307 |     });
  308 |   } catch (error) {
  309 |     hasPrimaryFailure = true;
  310 |     primaryFailure = error;
  311 |     throw error;
  312 |   } finally {
  313 |     const cleanupErrors: unknown[] = [];
  314 |     try {
  315 |       qa.gateway.configure({ unavailable: false });
  316 |     } catch (error) {
  317 |       cleanupErrors.push(error);
  318 |     }
  319 |     try {
  320 |       qa.gateway.barriers.release(barrier);
  321 |     } catch (error) {
  322 |       cleanupErrors.push(error);
  323 |     }
  324 |     try {
  325 |       await restoreAccount();
  326 |     } catch (error) {
  327 |       cleanupErrors.push(error);
  328 |     }
  329 |     try {
  330 |       await qa.evidence(`${label}-final-ledger`, {
  331 |         runId,
  332 |         firstRequest,
  333 |         gateway: qa.gateway.snapshot(),
  334 |         cleanupErrors: cleanupErrors.map(String),
  335 |       });
  336 |     } catch (error) {
  337 |       cleanupErrors.push(error);
  338 |     }
  339 |     if (cleanupErrors.length && !hasPrimaryFailure)
  340 |       throw new AggregateError(cleanupErrors, 'Sequence timeout-policy cleanup or evidence failed');
  341 |     if (cleanupErrors.length && primaryFailure instanceof Error)
  342 |       primaryFailure.message += `\nAdditional QA cleanup/evidence errors: ${cleanupErrors.map(String).join('; ')}`;
  343 |   }
  344 | }
  345 | 
```