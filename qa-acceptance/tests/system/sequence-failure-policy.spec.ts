import { test, expect } from '../fixtures.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';
import type { GatewayRequest } from '../../harness/gateway.js';
import { verifySequenceTimeoutPolicy } from '../support/sequence-timeout-policy.js';

// QA-D6 is the user's confirmed supplement to B1, not an expectation inferred
// from the candidate implementation. Existing skip/rate-limit/stopped rules
// remain covered separately by SEQ-006/007/008/010.
test('[BLK-SPEC-002] ordinary send failure fails the sequence and never advances later steps', async ({
  qa,
}) => {
  test.setTimeout(180_000);
  await qa.api.login();
  for (const code of ['ACCOUNT_OFFLINE', 'SENDER_NOT_IN_GROUP'] as const) {
    for (const failedIndex of [1, 2, 3]) {
      await test.step(`${code}, failed step ${failedIndex}`, async () => {
        const { group } = await qa.api.createGroup(2);
        const accountStates = async () =>
          (await qa.api.accounts())
            .map(({ id, status }) => ({ id, status }))
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const beforeAccounts = await accountStates();
        const label = `${code}-${failedIndex}`;
        const path = `/groups/${group.gatewayGroupId}/send`;
        const barrier = `sequence-failure-${label}`;
        const texts = [1, 2, 3].map((index) => `${label}-step-${index}`);
        // Normal preceding steps must really land. The target request is held
        // before the gateway evaluates its account and membership facts.
        qa.gateway.enqueue(path, ...Array.from({ length: failedIndex - 1 }, () => ({})), {
          barrier: { phase: 'request', name: barrier },
        });
        const { id } = await qa.api.require(
          qa.api.post<{ id: string }>('/api/sequences', {
            name: label,
            steps: texts.map((text, index) => ({
              index: index + 1,
              text,
              delaySeconds: 0,
              accountRole: index + 1 > failedIndex ? 'member' : 'admin',
            })),
          }),
        );
        let actorId: string | undefined;
        let actorPlatformId: string | undefined;
        let runId: string | undefined;
        let faultActive = false;
        let primaryFailure: unknown;
        let hadPrimaryFailure = false;
        const restore = async () => {
          if (!faultActive) return;
          if (code === 'ACCOUNT_OFFLINE') {
            const response = await fetch(
              `${qa.gateway.url}/accounts/${encodeURIComponent(actorId!)}/connect`,
              {
                method: 'POST',
                signal: AbortSignal.timeout(5_000),
              },
            );
            expect(response.status).toBe(200);
          } else {
            qa.gateway.setMembership(group.gatewayGroupId, actorPlatformId!, true);
          }
          faultActive = false;
        };
        try {
          ({ runId } = await qa.api.require(
            qa.api.post<{ runId: string }>(`/api/groups/${group.id}/sequence-runs`, {
              sequenceId: id,
              vars: {},
              stepVars: {},
            }),
            201,
          ));
          const hit = await qa.gateway.barriers.waitFor(barrier, 15_000);
          const request = hit.context as GatewayRequest;
          const payload = request.body as { accountId: string; clientMsgId: string; text: string };
          expect(request.path).toBe(path);
          expect(payload.text).toBe(texts[failedIndex - 1]);
          expect(payload.clientMsgId).toEqual(expect.any(String));
          actorId = payload.accountId;
          const actor = qa.gateway.snapshot().accounts.find((account) => account.id === actorId);
          expect(actor).toBeDefined();
          actorPlatformId = actor!.platformUserId;
          expect(
            qa.gateway
              .snapshot()
              .messages.filter((message) => message.groupId === group.gatewayGroupId)
              .map((message) => message.text),
          ).toEqual(texts.slice(0, failedIndex - 1));
          expect(
            (await qa.api.sequenceRun(runId)).steps
              .slice(0, failedIndex - 1)
              .map((step) => step.status),
          ).toEqual(Array(failedIndex - 1).fill('sent'));
          faultActive = true;
          if (code === 'ACCOUNT_OFFLINE') {
            const response = await fetch(
              `${qa.gateway.url}/accounts/${encodeURIComponent(actorId)}/disconnect`,
              {
                method: 'POST',
                signal: AbortSignal.timeout(5_000),
              },
            );
            expect(response.status).toBe(200);
            expect(
              qa.gateway.snapshot().accounts.find((account) => account.id === actorId)!.connected,
            ).toBe(false);
          } else {
            // Keep the leave event in durable external history, without pushing
            // it first: this is an in-flight send race, not "no candidate" skip.
            qa.gateway.setMembership(group.gatewayGroupId, actorPlatformId, false, {
              storeOnly: true,
            });
          }
          await qa.evidence(`${label}-fault-before-response`, {
            runId,
            hit,
            gateway: qa.gateway.snapshot(),
          });
          qa.gateway.barriers.release(barrier);
          const failedResponse = await qa.gateway.waitForRequest(
            (entry) => entry.id === request.id && entry.completedAt !== undefined,
          );
          expect(failedResponse.responseStatus).toBe(code === 'ACCOUNT_OFFLINE' ? 409 : 403);

          const assertNoLaterSend = () => {
            const snapshot = qa.gateway.snapshot();
            const sends = snapshot.requests.filter((entry) => entry.path === path);
            expect(sends.map((entry) => (entry.body as { text: string }).text)).toEqual(
              texts.slice(0, failedIndex),
            );
            expect(
              snapshot.messages
                .filter((message) => message.groupId === group.gatewayGroupId)
                .map((message) => message.text),
            ).toEqual(texts.slice(0, failedIndex - 1));
          };
          const result = await observe({
            read: () => qa.api.sequenceRun(runId!),
            durationMs: 15_000,
            invariant: (run) => {
              assertNoLaterSend();
              if (run.status !== 'running') expect(run.status).toBe('failed');
              for (const step of run.steps.slice(failedIndex)) {
                expect(['sent', 'accepted']).not.toContain(step.status);
              }
            },
            complete: (run) => run.status !== 'running',
          });
          await qa.evidence(`${label}-failure-result`, result);
          if (!result.complete)
            throw new BlockedError(
              'No sequence terminal evidence within the 15s observation budget; QA-D6 did not introduce a terminal-latency SLA',
            );
          expect(result.last.steps[failedIndex - 1]).toMatchObject({
            status: 'failed',
            clientMsgId: payload.clientMsgId,
            sentAt: null,
          });
          const failedMessage = (await qa.api.messages(group.id)).items.filter(
            (message) => message.clientMsgId === payload.clientMsgId,
          );
          expect(failedMessage).toHaveLength(1);
          expect(failedMessage[0]).toMatchObject({
            deliveryStatus: 'failed',
            failCode: code,
            msgId: null,
          });
          expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
          expect((await qa.api.group(group.id)).status).toBe(group.status);
          expect(await accountStates()).toEqual(beforeAccounts);

          // Remove the external failure so it cannot hide an erroneous retry or
          // a newly dispatched later step. Observe both live and restarted runs.
          await restore();
          const verifyStopped = async (phase: string) => {
            const observation = await observe({
              read: () => qa.api.sequenceRun(runId!),
              durationMs: 1_500,
              complete: () => false,
              invariant: async (run) => {
                assertNoLaterSend();
                expect(run.status).toBe('failed');
                expect(run.steps).toHaveLength(3);
                expect(run.steps.slice(0, failedIndex - 1).map((step) => step.status)).toEqual(
                  Array(failedIndex - 1).fill('sent'),
                );
                expect(run.steps[failedIndex - 1]).toMatchObject({
                  status: 'failed',
                  clientMsgId: payload.clientMsgId,
                  sentAt: null,
                });
                for (const step of run.steps.slice(failedIndex))
                  expect(['sent', 'accepted']).not.toContain(step.status);
                expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
                const message = (await qa.api.messages(group.id)).items.find(
                  (item) => item.clientMsgId === payload.clientMsgId,
                );
                expect(message).toMatchObject({ deliveryStatus: 'failed', failCode: code });
              },
            });
            await qa.evidence(`${label}-${phase}`, {
              observation,
              boundary:
                'Finite observation with all subsequent delays zero; no claim about infinite time',
            });
          };
          await verifyStopped('restored-external-state');
          if (failedIndex === 2) {
            await qa.restart();
            await qa.api.login();
            await verifyStopped('after-restart');
          }
        } catch (error) {
          primaryFailure = error;
          hadPrimaryFailure = true;
          throw error;
        } finally {
          qa.gateway.barriers.release(barrier);
          const cleanupErrors: unknown[] = [];
          try {
            await qa.evidence(`${label}-final-ledger`, { runId, gateway: qa.gateway.snapshot() });
          } catch (error) {
            cleanupErrors.push(error);
          }
          try {
            await restore();
          } catch (cleanup) {
            cleanupErrors.push(cleanup);
          }
          if (cleanupErrors.length) {
            try {
              await qa.evidence(`${label}-cleanup-failure`, {
                errors: cleanupErrors.map(String),
                primaryFailure: String(primaryFailure),
              });
            } catch (error) {
              cleanupErrors.push(error);
            }
            if (!hadPrimaryFailure)
              throw new AggregateError(
                cleanupErrors,
                `${label}: evidence or external cleanup failed`,
              );
          }
        }
      });
    }
  }
  await test.step('unknown remains pending until confirmation, then failure stops the run', () =>
    verifySequenceTimeoutPolicy(qa));
});
