import { test, expect } from '../fixtures.js';
import { observe } from '../../harness/observation.js';
import { eventually, type Group, type Job } from '../../harness/platform-client.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError } from '../../harness/security.js';
import {
  runtimeObservationFor,
  type RuntimeLease,
  type RuntimeObservation,
  type RuntimeSnapshot,
} from '../../harness/runtime-observation.js';
import { assertMessageRecoveryAssociation } from '../../harness/lifecycle-observation.js';
import { optionalActivityObservation } from '../support/agent-activity-budget.js';

const tool = (id: string, name: string, input: Record<string, unknown>) => ({
  body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
});
const final = (text: string) => ({
  body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] },
});

async function enable(qa: QaEnvironment, group: Group) {
  await qa.api.require(
    qa.api.patch(`/api/groups/${group.id}`, {
      agentEnabled: true,
      autoKickEnabled: true,
    }),
  );
}
function trigger(qa: QaEnvironment, group: Group, text: string) {
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'protocol-boundary-outside',
    text,
  });
}
async function runId(qa: QaEnvironment, group: Group) {
  const current = await qa.api.group(group.id);
  expect(current.activeAgentRunId, 'fault barrier must belong to an active run').toEqual(
    expect.any(String),
  );
  return current.activeAgentRunId!;
}
async function evidence(qa: QaEnvironment, name: string, extra: unknown = null) {
  await qa.evidence(name, { gateway: qa.gateway.snapshot(), agent: qa.agent.snapshot(), extra });
}

async function createJob(qa: QaEnvironment) {
  const accounts = (await qa.api.connectAll())
    .filter((account) => account.status === 'online')
    .slice(0, 2);
  if (accounts.length < 2) throw new BlockedError('Two isolated online account seeds required');
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>('/api/groups', {
      creatorAccountId: accounts[0]!.id,
      memberAccountIds: [accounts[1]!.id],
    }),
    202,
  );
  return { accounts, jobId };
}

async function completedCreation(
  qa: QaEnvironment,
  jobId: string,
  gatewayGroupId: string,
  creatorId: string,
  adminId: string,
) {
  const job = await qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`));
  expect(job.status, 'restart must not turn an effective successful operation into failure').toBe(
    'finished',
  );
  expect(job.errors).toEqual([]);
  const groups = await qa.api.require(qa.api.get<Group[]>('/api/groups'));
  expect(groups).toHaveLength(1);
  expect(groups[0]!.gatewayGroupId).toBe(gatewayGroupId);
  expect(groups[0]!.members.find((member) => member.accountId === creatorId)?.role).toBe('creator');
  expect(groups[0]!.members.find((member) => member.accountId === adminId)?.role).toBe('admin');
  const remote = qa.gateway.snapshot().groups.find((group) => group.groupId === gatewayGroupId)!;
  const admin = qa.gateway.snapshot().accounts.find((account) => account.id === adminId)!;
  expect(
    remote.members.find((member) => member.platformUserId === admin.platformUserId)?.role,
  ).toBe('admin');
}

test('[BLK-EXT-002] a created group whose response was lost is reconciled without another create', async ({
  qa,
}) => {
  await qa.api.login();
  qa.gateway.enqueue('/groups', { barrier: { phase: 'after-effect', name: 'created-id-lost' } });
  try {
    const { jobId, accounts } = await createJob(qa);
    await qa.gateway.barriers.waitFor('created-id-lost');
    const snapshot = qa.gateway.snapshot();
    expect(snapshot.groups).toHaveLength(1);
    const remoteId = snapshot.groups[0]!.groupId;
    expect(
      snapshot.requests.find((entry) => entry.path === '/groups')?.responseStatus,
    ).toBeUndefined();
    await qa.kill();
    qa.gateway.barriers.release('created-id-lost');
    await evidence(qa, 'created-id-lost-at-crash', { jobId, remoteId });
    // The private remoteId is evidence only: it is never sent to the SUT.
    await qa.start();
    await qa.api.login();
    const result = await observe({
      durationMs: 20_000,
      read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
      complete: (job) => job.status !== 'running',
      invariant: () => {
        expect(
          qa.gateway.snapshot().effects.filter((entry) => entry.kind === 'create'),
        ).toHaveLength(1);
      },
    });
    await evidence(qa, 'created-id-lost-observation', result);
    if (!result.complete)
      throw new BlockedError(
        'Created group job has no terminal evidence within 20s probe; CL-01 recovery still unresolved',
      );
    await completedCreation(qa, jobId, remoteId, accounts[0]!.id, accounts[1]!.id);
  } finally {
    qa.gateway.barriers.release('created-id-lost');
    await evidence(qa, 'created-id-lost-final-ledger');
  }
});

test('[BLK-EXT-003] promotion response loss preserves administrator facts and the two-call limit', async ({
  qa,
}) => {
  test.setTimeout(180_000);
  await qa.api.login();
  qa.gateway.enqueue('/groups', {
    barrier: { phase: 'before-response', name: 'prepare-promotion' },
  });
  try {
    const { jobId, accounts } = await createJob(qa);
    await qa.gateway.barriers.waitFor('prepare-promotion');
    const remoteId = qa.gateway.snapshot().groups[0]!.groupId;
    const path = `/groups/${remoteId}/promote`;
    for (const suffix of ['first', 'second'])
      qa.gateway.enqueue(path, {
        barrier: { phase: 'after-effect', name: `promotion-${suffix}` },
      });
    qa.gateway.barriers.release('prepare-promotion');
    await qa.gateway.barriers.waitFor('promotion-first', 20_000);
    const first = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
    expect(first.responseStatus).toBeUndefined();
    await qa.kill();
    qa.gateway.barriers.release('promotion-first');
    await evidence(qa, 'promotion-first-crash', { jobId, remoteId });
    await qa.start();
    await qa.api.login();
    const invariant = () => {
      const snapshot = qa.gateway.snapshot();
      expect(snapshot.requests.filter((entry) => entry.path === path).length).toBeLessThanOrEqual(
        2,
      );
      expect(snapshot.effects.filter((entry) => entry.kind === 'create')).toHaveLength(1);
      expect(
        snapshot.groups
          .find((group) => group.groupId === remoteId)!
          .members.find((member) => member.platformUserId === accounts[1]!.platformUserId)?.role,
      ).toBe('admin');
    };
    const phase = await observe({
      durationMs: 20_000,
      read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
      invariant,
      complete: (job) =>
        job.status !== 'running' ||
        qa.gateway.barriers.snapshot().some((entry) => entry.name === 'promotion-second'),
    });
    await evidence(qa, 'promotion-first-recovery', phase);
    if (!phase.complete)
      throw new BlockedError(
        'No next promotion or terminal job within 20s probe; not proof of infinite stall',
      );
    if (qa.gateway.barriers.snapshot().some((entry) => entry.name === 'promotion-second')) {
      await qa.kill();
      qa.gateway.barriers.release('promotion-second');
      await evidence(qa, 'promotion-second-crash', { jobId });
      await qa.start();
      await qa.api.login();
      const second = await observe({
        durationMs: 20_000,
        read: () => qa.api.require(qa.api.get<Job>(`/api/jobs/${jobId}`)),
        invariant,
        complete: (job) => job.status !== 'running',
      });
      await evidence(qa, 'promotion-second-recovery', second);
      if (!second.complete)
        throw new BlockedError(
          'Two promotion confirmations lost; no terminal job within observation budget',
        );
    }
    invariant();
    await completedCreation(qa, jobId, remoteId, accounts[0]!.id, accounts[1]!.id);
  } finally {
    for (const name of ['prepare-promotion', 'promotion-first', 'promotion-second'])
      qa.gateway.barriers.release(name);
    await evidence(qa, 'promotion-final-ledger');
  }
});

test('[BLK-EXT-001] unacknowledged send has paired pending prefixes without a fabricated two-second bound', async ({
  qa,
}) => {
  test.setTimeout(180_000);
  await qa.api.login();
  const incomplete: string[] = [];
  for (const outcome of ['lands', 'does-not-land'] as const) {
    const { group, accounts } = await qa.api.createGroup();
    const barrier = `unacknowledged-${outcome}`;
    const path = `/groups/${group.gatewayGroupId}/send`;
    const text = `unacknowledged original ${outcome}`;
    qa.gateway.enqueue(path, {
      barrier: { phase: 'request', name: barrier },
      effect: outcome === 'lands' ? 'apply' : 'none',
      effectDelayMs: 0,
      neverRespond: true,
    });
    const missing: string[] = [];
    const controls: RuntimeObservation[] = [];
    let beforeLease: RuntimeLease | undefined;
    let afterLease: RuntimeLease | undefined;
    let beforeSnapshot: RuntimeSnapshot | undefined;
    let primaryFailure = false;
    try {
      const before = await optionalActivityObservation(
        `${outcome} verify original process`,
        async () => {
          const control = runtimeObservationFor(qa);
          controls.push(control);
          await control.verify(['message-recovery-witness']);
          return control;
        },
        missing,
      );
      const { clientMsgId } = await qa.api.send(group.id, accounts[0]!.id, text);
      await qa.gateway.barriers.waitFor(barrier);
      const request = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
      expect(request.responseStatus).toBeUndefined();
      expect(
        qa.gateway.snapshot().messages.filter((entry) => entry.clientMsgId === clientMsgId),
      ).toHaveLength(0);
      const correlation = { kind: 'message-recovery' as const, groupId: group.id, clientMsgId };
      if (before)
        beforeLease = await optionalActivityObservation(
          `${outcome} attach original dispatch`,
          () => before.arm('observe-message-recovery', correlation),
          missing,
        );
      if (beforeLease)
        beforeSnapshot = await optionalActivityObservation(
          `${outcome} before kill history`,
          () => beforeLease!.snapshot(),
          missing,
        );
      await qa.evidence(`${outcome}-original-recovery-stream`, beforeSnapshot ?? { missing });
      await qa.kill();
      await evidence(qa, `${outcome}-pending-at-crash`, { clientMsgId });
      await qa.start();
      await qa.api.login();
      afterLease = await optionalActivityObservation(
        `${outcome} attach recovered process`,
        async () => {
          const next = runtimeObservationFor(qa);
          controls.push(next);
          await next.verify(['message-recovery-witness']);
          if (before) expect(next.target.pid).not.toBe(before.target.pid);
          return next.arm('observe-message-recovery', correlation);
        },
        missing,
      );
      // The original is still in flight. A negative lookup (including after two
      // seconds) cannot prove it will not land: no 504 was received.
      const prefix = await observe({
        read: () => qa.api.messages(group.id),
        durationMs: 2_500,
        complete: () => false,
        invariant: ({ items }) => {
          expect(items.filter((item) => item.clientMsgId === clientMsgId)).toHaveLength(1);
          expect(['sent', 'failed', 'cancelled']).not.toContain(
            items.find((item) => item.clientMsgId === clientMsgId)!.deliveryStatus,
          );
          expect(
            qa.gateway.snapshot().requests.filter((entry) => entry.path === path),
          ).toHaveLength(1);
          expect(
            qa.gateway.snapshot().messages.filter((entry) => entry.clientMsgId === clientMsgId),
          ).toHaveLength(0);
        },
      });
      await evidence(qa, `${outcome}-indistinguishable-prefix`, prefix);
      qa.gateway.barriers.release(barrier);
      const observation = await observe({
        durationMs: 10_000,
        read: () => qa.api.messages(group.id),
        invariant: ({ items }) => {
          const local = items.filter((item) => item.clientMsgId === clientMsgId);
          const remote = qa.gateway
            .snapshot()
            .messages.filter((item) => item.clientMsgId === clientMsgId);
          // Releasing a QA barrier, or privately choosing effect:none, supplies
          // no new public non-delivery guarantee to the SUT. A late blind retry
          // must not pass merely because it became the only landed message.
          expect(
            qa.gateway.snapshot().requests.filter((entry) => entry.path === path),
          ).toHaveLength(1);
          expect(local).toHaveLength(1);
          expect(remote.length).toBeLessThanOrEqual(1);
          if (local[0]!.deliveryStatus === 'sent') {
            expect(remote).toHaveLength(1);
            expect(local[0]!.msgId).toBe(remote[0]!.msgId);
          }
          // There is no explicit failure/cancellation event in either branch.
          // A 404 plus a missing response cannot justify inventing a terminal
          // failure, even when the QA-only ledger has privately chosen no effect.
          expect(['failed', 'cancelled']).not.toContain(local[0]!.deliveryStatus);
        },
        complete: ({ items }) =>
          items.some(
            (item) =>
              item.clientMsgId === clientMsgId && ['sent', 'failed'].includes(item.deliveryStatus),
          ),
      });
      await evidence(qa, `${outcome}-outcome`, observation);
      if (!observation.complete) incomplete.push(outcome);
      const afterSnapshot =
        afterLease &&
        (await optionalActivityObservation(
          `${outcome} final recovered history`,
          () => afterLease!.snapshot(),
          missing,
        ));
      await qa.evidence(`${outcome}-recovery-lifecycle`, {
        before: beforeSnapshot ?? null,
        after: afterSnapshot ?? afterLease?.latest ?? null,
        missing,
      });
      await optionalActivityObservation(
        `${outcome} original/recovery association`,
        async () => {
          const association = assertMessageRecoveryAssociation(
            beforeSnapshot?.events ?? [],
            (afterSnapshot ?? afterLease?.latest)?.events ?? [],
          );
          await qa.evidence(`${outcome}-recovery-diagnosis`, association);
        },
        missing,
      );
      incomplete.push(...missing.map((message) => `${outcome}: ${message}`));
    } catch (error) {
      primaryFailure = true;
      throw error;
    } finally {
      qa.gateway.barriers.release(barrier);
      try {
        await evidence(qa, `${outcome}-final-ledger`);
      } catch (error) {
        if (!primaryFailure) {
          primaryFailure = true;
          throw error;
        }
      } finally {
        const cleanup = await Promise.allSettled(controls.map((control) => control.close()));
        const errors = cleanup.filter((result) => result.status === 'rejected');
        if (errors.length) {
          try {
            await qa.evidence(
              `${outcome}-recovery-cleanup-failure`,
              errors.map((entry) => String(entry.reason)),
            );
          } catch {
            /* Keep first failure. */
          }
          if (!primaryFailure)
            throw new BlockedError('本消息观测租约未全部确认释放，旧PID不可跟随新实例');
        }
      }
    }
  }
  if (incomplete.length)
    throw new BlockedError(
      `No terminal evidence within observation budget for ${incomplete.join(', ')}. ` +
        'The 10s probe is not a product deadline or proof of permanent non-recovery; retain CL-01 protocol risk.',
    );
});

test('[BLK-EXT-004] an already effective kick is not repeated against a rejoined target after restart', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const target = 'kick-rejoin-target';
  const path = `/groups/${group.gatewayGroupId}/kick`;
  qa.gateway.setMembership(group.gatewayGroupId, target, true);
  await enable(qa, group);
  qa.agent.enqueueTurns(
    tool('kick-before-rejoin', 'kick_user', {
      platform_user_id: target,
      reason: 'single authorized removal',
    }),
    final('resumed existing run'),
  );
  qa.gateway.enqueue(path, {
    effect: 'apply',
    barrier: { phase: 'after-effect', name: 'kick-before-rejoin' },
  });
  try {
    trigger(qa, group, 'remove once');
    await qa.gateway.barriers.waitFor('kick-before-rejoin');
    const id = await runId(qa, group);
    const original = qa.gateway.snapshot().requests.find((entry) => entry.path === path)!;
    expect(original.responseStatus).toBeUndefined();
    expect(
      qa.gateway
        .snapshot()
        .effects.filter((entry) => entry.kind === 'kick' && entry.groupId === group.gatewayGroupId),
    ).toHaveLength(1);
    await qa.kill();
    qa.gateway.barriers.release('kick-before-rejoin');
    // Finish the external operation and record its member_left event while the
    // SUT is down, then join again. Neither event is erased or reordered.
    await eventually(
      async () => qa.gateway.snapshot(),
      (snapshot) =>
        snapshot.requests.some((entry) => entry.id === original.id && entry.completedAt) &&
        snapshot.events.some(
          (entry) => entry.type === 'member_left' && entry.data.platformUserId === target,
        ),
    );
    qa.gateway.setMembership(group.gatewayGroupId, target, true);
    await evidence(qa, 'kick-applied-then-rejoined', { id });
    await qa.start();
    await qa.api.login();
    const result = await observe({
      durationMs: 20_000,
      read: () => qa.api.agentRun(id),
      complete: (run) => run.status !== 'running',
      invariant: (run) => {
        expect(run.id).toBe(id);
        expect(qa.gateway.snapshot().requests.filter((entry) => entry.path === path)).toHaveLength(
          1,
        );
        expect(
          qa.gateway
            .snapshot()
            .groups.find((item) => item.groupId === group.gatewayGroupId)!
            .members.some((item) => item.platformUserId === target),
        ).toBe(true);
        for (const step of run.steps.filter((step) => step.toolUseId === 'kick-before-rejoin'))
          expect(step.isError, 'already effective tool must not be recorded as failed').toBe(false);
      },
    });
    await evidence(qa, 'kick-rejoin-resumed', result);
    if (!result.complete)
      throw new BlockedError(
        'Restarted kick run remains open within 20s observation budget; no arbitrary recovery deadline asserted',
      );
    expect(result.last.status).toBe('finished');
    expect(result.last.endReason).toBe('final');
    expect(
      result.last.steps.filter((step) => step.toolUseId === 'kick-before-rejoin'),
    ).toHaveLength(1);
  } finally {
    qa.gateway.barriers.release('kick-before-rejoin');
    await evidence(qa, 'kick-rejoin-final-ledger');
  }
});

type TurnBody = {
  runId: string;
  messages: {
    role: string;
    content: { type: string; tool_use_id?: string; [key: string]: unknown }[];
  }[];
};

test('[BLK-EXT-005] a lost unexecuted model response may change while persisted history and effects survive', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  await enable(qa, group);
  const text = 'effect before lost model turn';
  qa.agent.enqueueTurns(
    tool('persisted-send', 'send_message', { text, idempotency_key: 'persisted-send-key' }),
    {
      ...tool('lost-read', 'get_recent_messages', { limit: 2 }),
      barrier: { phase: 'before-response', name: 'lost-model-response' },
    },
    final('different but legal response after restart'),
  );
  try {
    trigger(qa, group, 'start response-loss test');
    await qa.agent.barriers.waitFor('lost-model-response');
    const id = await runId(qa, group);
    const before = qa.agent.snapshot().turns.at(-1)!;
    const persisted = (before.body as TurnBody).messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.tool_use_id === 'persisted-send');
    expect(persisted).toBeDefined();
    expect(before.completedAt).toBeUndefined();
    await eventually(
      async () => qa.gateway.snapshot().messages.filter((entry) => entry.text === text),
      (messages) => messages.length > 0,
    );
    expect(qa.gateway.snapshot().messages.filter((entry) => entry.text === text)).toHaveLength(1);
    await qa.kill();
    qa.agent.barriers.release('lost-model-response');
    await evidence(qa, 'lost-model-response-at-crash', { id, persisted });
    await qa.start();
    await qa.api.login();
    const result = await observe({
      durationMs: 20_000,
      read: () => qa.api.agentRun(id),
      complete: (run) => run.status !== 'running',
      invariant: (run) => {
        expect(run.id).toBe(id);
        expect(run.steps.length).toBeLessThanOrEqual(12);
        expect(qa.gateway.snapshot().messages.filter((entry) => entry.text === text)).toHaveLength(
          1,
        );
        const all = qa.agent.snapshot().turns;
        expect(all.every((turn) => (turn.body as TurnBody).runId === id)).toBe(true);
        for (const turn of all.filter((turn) => turn.id > before.id))
          expect(
            (turn.body as TurnBody).messages.flatMap((message) => message.content),
          ).toContainEqual(persisted);
      },
    });
    await evidence(qa, 'lost-model-response-resumed', result);
    if (!result.complete)
      throw new BlockedError(
        'Run not terminal within 20s probe; original recovery obligation retained without inventing a deadline',
      );
    expect(qa.agent.snapshot().turns.some((turn) => turn.id > before.id)).toBe(true);
    expect(result.last.status).toBe('finished');
    expect(result.last.endReason).toBe('final');
    expect(result.last.steps.filter((step) => step.toolUseId === 'persisted-send')).toHaveLength(1);
    expect(result.last.steps.find((step) => step.toolUseId === 'persisted-send')?.isError).toBe(
      false,
    );
    expect(
      qa.gateway.snapshot().requests.filter((request) => request.path.endsWith('/send')),
    ).toHaveLength(1);
  } finally {
    qa.agent.barriers.release('lost-model-response');
    await evidence(qa, 'lost-model-response-final-ledger');
  }
});
