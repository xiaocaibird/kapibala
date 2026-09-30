import { expect } from '@playwright/test';
import type { QaEnvironment } from '../../harness/environment.js';
import type { GatewayRequest } from '../../harness/gateway.js';
import { observe } from '../../harness/observation.js';
import { BlockedError } from '../../harness/security.js';

/** QA-D6 composed with A2. A retry is permitted, never required. The optional
 * retry meets a real offline account, avoiding a second 504 uncertainty window. */
export async function verifySequenceTimeoutPolicy(qa: QaEnvironment): Promise<void> {
  const { group } = await qa.api.createGroup(2);
  const label = `sequence-timeout-policy-${group.gatewayGroupId}`;
  const path = `/groups/${group.gatewayGroupId}/send`;
  const barrier = `${label}-504-before-response`;
  const texts = [`${label}-prefix`, `${label}-uncertain`, `${label}-must-not-send`];
  qa.gateway.enqueue(
    path,
    {},
    {
      status: 504,
      code: 'NETWORK_TIMEOUT',
      effect: 'none',
      barrier: { phase: 'before-response', name: barrier },
    },
  );
  const { id } = await qa.api.require(
    qa.api.post<{ id: string }>('/api/sequences', {
      name: label,
      steps: texts.map((text, index) => ({
        index: index + 1,
        text,
        delaySeconds: 0,
        accountRole: index === 2 ? 'member' : 'admin',
      })),
    }),
  );
  let actorId: string | undefined;
  let actorOffline = false;
  let firstRequest: GatewayRequest | undefined;
  let runId: string | undefined;
  let primaryFailure: unknown;
  let hasPrimaryFailure = false;
  const restoreAccount = async () => {
    if (!actorOffline) return;
    const response = await fetch(
      `${qa.gateway.url}/accounts/${encodeURIComponent(actorId!)}/connect`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      },
    );
    expect(response.status).toBe(200);
    actorOffline = false;
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
    firstRequest = hit.context as GatewayRequest;
    const payload = firstRequest.body as { accountId: string; clientMsgId: string; text: string };
    expect(payload.text).toBe(texts[1]);
    expect(payload.clientMsgId).toEqual(expect.any(String));
    actorId = payload.accountId;
    const queryPath = `/groups/${group.gatewayGroupId}/messages/by-client-id/${encodeURIComponent(payload.clientMsgId)}`;
    const accountBefore = await qa.api.accounts();
    const actorBefore = accountBefore.find((account) => account.id === actorId);
    expect(actorBefore?.status).toBe('online');
    // The route has already evaluated the connected actor. The first response is
    // a valid unknown result; only a later, optional retry sees ACCOUNT_OFFLINE.
    actorOffline = true;
    const disconnected = await fetch(
      `${qa.gateway.url}/accounts/${encodeURIComponent(actorId)}/disconnect`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      },
    );
    expect(disconnected.status).toBe(200);
    qa.gateway.configure({ unavailable: true });
    qa.gateway.barriers.release(barrier);
    const initialResponse = await qa.gateway.waitForRequest(
      (request) => request.id === firstRequest!.id && request.completedAt !== undefined,
    );
    expect(initialResponse.responseStatus).toBe(504);
    const initialCompletedAt = Date.parse(initialResponse.completedAt!);
    let queryRecoveredAt: number | undefined;
    const ledger = (allowRetry: boolean) => {
      const snapshot = qa.gateway.snapshot();
      const sends = snapshot.requests.filter((request) => request.path === path);
      expect(sends.slice(0, 2).map((request) => (request.body as { text: string }).text)).toEqual(
        texts.slice(0, 2),
      );
      expect(sends.length).toBeGreaterThanOrEqual(2);
      expect(sends.length).toBeLessThanOrEqual(allowRetry ? 3 : 2);
      expect(
        snapshot.messages
          .filter((message) => message.groupId === group.gatewayGroupId)
          .map((message) => message.text),
      ).toEqual([texts[0]]);
      const retry = sends[2];
      if (retry) {
        expect(retry.body).toMatchObject({
          accountId: payload.accountId,
          clientMsgId: payload.clientMsgId,
          text: payload.text,
        });
        expect(Date.parse(retry.at) - initialCompletedAt).toBeGreaterThanOrEqual(2_000);
        expect(
          snapshot.requests.some(
            (request) =>
              request.path === queryPath &&
              request.responseStatus === 404 &&
              request.completedAt !== undefined &&
              Date.parse(request.at) >= queryRecoveredAt! &&
              Date.parse(request.at) - initialCompletedAt >= 2_000 &&
              Date.parse(request.completedAt) <= Date.parse(retry.at),
          ),
          'Retry needs a real recovered 404 beyond the original two-second uncertainty window',
        ).toBe(true);
        if (retry.completedAt) expect(retry.responseStatus).toBe(409);
      }
      return { snapshot, sends, retry };
    };
    const read = async () => {
      const beforeMessageRead = Date.now();
      const messages = await qa.api.messages(group.id);
      const afterMessageRead = Date.now();
      const matching = messages.items.filter(
        (message) => message.clientMsgId === payload.clientMsgId,
      );
      expect(matching).toHaveLength(1);
      const run = await qa.api.sequenceRun(runId!);
      expect(run.steps).toHaveLength(3);
      expect(run.steps[0]?.status).toBe('sent');
      expect(['accepted', 'sent']).not.toContain(run.steps[2]?.status);
      return { message: matching[0]!, run, beforeMessageRead, afterMessageRead };
    };
    const firstUnknown = await observe({
      read,
      durationMs: 15_000,
      invariant: (state) => {
        ledger(false);
        expect(state.run.status).toBe('running');
        expect(['queued', 'unknown']).toContain(state.message.deliveryStatus);
      },
      complete: (state) => state.message.deliveryStatus === 'unknown',
    });
    if (!firstUnknown.complete)
      throw new BlockedError(
        'The held-504 scenario never exposed unknown within the observation budget',
      );
    const held = await observe({
      read,
      durationMs: 5_200,
      complete: () => false,
      invariant: (state) => {
        ledger(false);
        expect(state.message.deliveryStatus).toBe('unknown');
        expect(state.run.status).toBe('running');
      },
    });
    const queriesDuringOutage = qa.gateway
      .snapshot()
      .requests.filter((request) => request.path === queryPath && request.responseStatus === 503);
    await qa.evidence(`${label}-held-unknown`, {
      firstUnknown,
      held,
      queriesDuringOutage,
      gateway: qa.gateway.snapshot(),
    });
    if (!queriesDuringOutage.length)
      throw new BlockedError(
        'No actual by-client-id 503 was observed; query-unavailability precondition is unproven',
      );

    const recoveryLower = Date.now();
    qa.gateway.configure({ unavailable: false });
    const recoveryUpper = Date.now();
    queryRecoveredAt = recoveryLower;
    let lastUnresolvedRead = recoveryLower;
    const resolved = await observe({
      read,
      durationMs: 2_100,
      invariant: (state) => {
        const { retry, snapshot } = ledger(true);
        expect(['unknown', 'queued', 'failed']).toContain(state.message.deliveryStatus);
        if (state.run.status !== 'running') expect(state.run.status).toBe('failed');
        if (state.message.deliveryStatus === 'failed' && !retry)
          expect(
            snapshot.requests.some(
              (request) =>
                request.path === queryPath &&
                request.responseStatus === 404 &&
                Date.parse(request.at) >= recoveryLower &&
                Date.parse(request.at) > initialCompletedAt + 2_000 &&
                Date.parse(request.completedAt!) <= state.afterMessageRead,
            ),
            'Failure without retry needs definitive confirmation before the first failed observation',
          ).toBe(true);
        if (state.message.deliveryStatus === 'failed' && retry) {
          expect(retry.responseStatus).toBe(409);
          expect(retry.completedAt).toEqual(expect.any(String));
          expect(Date.parse(retry.completedAt!)).toBeLessThanOrEqual(state.afterMessageRead);
        }
        if (state.message.deliveryStatus !== 'failed') {
          lastUnresolvedRead = state.beforeMessageRead;
          expect(
            lastUnresolvedRead - recoveryUpper,
            'A2 requires known message state within two seconds after query recovery',
          ).toBeLessThanOrEqual(2_000);
        }
      },
      complete: (state) => state.message.deliveryStatus === 'failed',
    });
    const bounds = {
      lowerMs: lastUnresolvedRead - recoveryUpper,
      upperMs: resolved.last.afterMessageRead - recoveryLower,
      limitMs: 2_000,
      recovery: [recoveryLower, recoveryUpper],
      observation: [lastUnresolvedRead, resolved.last.afterMessageRead],
    };
    await qa.evidence(`${label}-query-recovery`, {
      resolved,
      bounds,
      gateway: qa.gateway.snapshot(),
    });
    if (!resolved.complete || bounds.upperMs > 2_000)
      throw new BlockedError(
        `Recovery observation interval ${bounds.lowerMs}..${bounds.upperMs}ms does not prove the two-second deadline`,
      );
    const completed = await observe({
      read,
      durationMs: 15_000,
      invariant: (state) => {
        const { retry } = ledger(true);
        expect(state.message).toMatchObject({
          deliveryStatus: 'failed',
          failCode: retry ? 'ACCOUNT_OFFLINE' : 'NETWORK_TIMEOUT',
          msgId: null,
        });
        if (state.run.status !== 'running') expect(state.run.status).toBe('failed');
      },
      complete: (state) => state.run.status === 'failed',
    });
    await qa.evidence(`${label}-sequence-terminal`, completed);
    if (!completed.complete)
      throw new BlockedError(
        'The message failed, but no sequence terminal evidence was observed; QA-D6 adds no terminal-latency SLA',
      );
    const finalLedger = ledger(true);
    if (finalLedger.retry) expect(finalLedger.retry.responseStatus).toBe(409);
    else
      expect(
        finalLedger.snapshot.requests.some(
          (request) =>
            request.path === queryPath &&
            request.responseStatus === 404 &&
            request.completedAt !== undefined &&
            Date.parse(request.at) >= recoveryLower &&
            Date.parse(request.at) - initialCompletedAt >= 2_000,
        ),
        'Failure without retry still needs confirmed absence',
      ).toBe(true);
    const failedCode = finalLedger.retry ? 'ACCOUNT_OFFLINE' : 'NETWORK_TIMEOUT';
    expect(completed.last.run.steps[1]).toMatchObject({
      status: 'failed',
      clientMsgId: payload.clientMsgId,
      sentAt: null,
    });
    expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
    expect((await qa.api.group(group.id)).status).toBe(group.status);
    expect((await qa.api.accounts()).find((account) => account.id === actorId)?.status).toBe(
      actorBefore!.status,
    );
    await restoreAccount();
    const stopped = await observe({
      read,
      durationMs: 1_500,
      complete: () => false,
      invariant: (state) => {
        const current = ledger(true);
        expect(current.sends).toHaveLength(finalLedger.sends.length);
        expect(state.message).toMatchObject({
          deliveryStatus: 'failed',
          failCode: failedCode,
          msgId: null,
        });
        expect(state.run.status).toBe('failed');
        expect(state.run.steps[1]).toMatchObject({
          status: 'failed',
          clientMsgId: payload.clientMsgId,
        });
        expect(state.run.steps[2]?.status).not.toBe('accepted');
        expect(state.run.steps[2]?.status).not.toBe('sent');
      },
    });
    await qa.evidence(`${label}-restored-external-state`, {
      stopped,
      gateway: qa.gateway.snapshot(),
      boundary:
        'Finite observation; one unknown request, optional retry with a real offline error; does not cover a second 504 window',
    });
  } catch (error) {
    hasPrimaryFailure = true;
    primaryFailure = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      qa.gateway.configure({ unavailable: false });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      qa.gateway.barriers.release(barrier);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await restoreAccount();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await qa.evidence(`${label}-final-ledger`, {
        runId,
        firstRequest,
        gateway: qa.gateway.snapshot(),
        cleanupErrors: cleanupErrors.map(String),
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length && !hasPrimaryFailure)
      throw new AggregateError(cleanupErrors, 'Sequence timeout-policy cleanup or evidence failed');
    if (cleanupErrors.length && primaryFailure instanceof Error)
      primaryFailure.message += `\nAdditional QA cleanup/evidence errors: ${cleanupErrors.map(String).join('; ')}`;
  }
}
