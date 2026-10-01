import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { exec } from '../../harness/process.js';
import {
  captureOwnedApplicationIdentity,
  observeOwnedApplicationKill,
  parseApplicationPsIdentity,
} from '../../harness/application-exit-observation.js';
import type { CapacityControlTarget } from '../../harness/capacity-control.js';

// Own pure Node guardian/application only: no SUT, HTTP, DB, browser, or external controller.
async function ownedFixture(t: TestContext) {
  const guardian = spawn(
    process.execPath,
    [
      '-e',
      `
    const {spawn}=require('node:child_process');
    const app=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    app.once('spawn',()=>process.send({applicationPid:app.pid}));
    setInterval(()=>{},1000);
  `,
    ],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  assert.ok(guardian.pid);
  const guardianPid = guardian.pid;
  const exited = once(guardian, 'exit');
  let groupKilled = false;
  const killGroup = async () => {
    if (groupKilled) return;
    groupKilled = true;
    try {
      process.kill(-guardianPid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    await exited;
  };
  t.after(killGroup);
  const [message] = await once(guardian, 'message', { signal: AbortSignal.timeout(3000) });
  const appPid = (message as { applicationPid: number }).applicationPid;
  const raw = (await exec('ps', ['-p', String(appPid), '-o', 'ppid=,pgid=,uid=,lstart='])).stdout;
  const app = parseApplicationPsIdentity(appPid, raw);
  const target: CapacityControlTarget = {
    apiUrl: 'http://127.0.0.1:54321',
    revision: 'a'.repeat(40),
    pid: guardianPid,
    ownerToken: randomUUID(),
  };
  const snapshot = {
    protocol: 'qa-runtime-observation/1',
    binding: {
      apiUrl: target.apiUrl,
      revision: target.revision,
      pid: target.pid,
      observedOwnerToken: target.ownerToken,
    },
    snapshotProvenance: {
      source: 'live-bridge',
      applicationPid: appPid,
      applicationStarted: app.started,
    },
    clockObservation: {
      clockDomain: `synthetic-self-app:${appPid}`,
      clockUnit: 'ms',
      applicationPid: appPid,
      monotonicMs: 1,
    },
  };
  const evidence: { name: string; value: unknown }[] = [];
  const record = async (name: string, value: unknown) => {
    evidence.push({ name, value: structuredClone(value) });
  };
  const capture = () =>
    captureOwnedApplicationIdentity({ target, snapshot, parentClockDomain: 'self-parent', record });
  return { guardian, appPid, target, snapshot, killGroup, exited, evidence, record, capture };
}

test('ps extraction preserves the opaque fourth field, including doubled day spacing', () => {
  assert.deepEqual(parseApplicationPsIdentity(11, ' 10 10 501 Thu Oct  1 21:29:12 2026\n'), {
    pid: 11,
    parentPid: 10,
    processGroupId: 10,
    uid: 501,
    started: 'Thu Oct  1 21:29:12 2026',
  });
  assert.equal(
    parseApplicationPsIdentity(11, '10 10 501 opaque-not-an-ISO-date\n').started,
    'opaque-not-an-ISO-date',
  );
  for (const raw of ['', '10 10 501', '10 10 501 started\n10 10 501 again', '10 bad 501 started'])
    assert.throws(() => parseApplicationPsIdentity(11, raw), /BLOCKED/);
});

test('real owned child disappearance has independent raw ps checks and a parent-clock envelope', async (t) => {
  const f = await ownedFixture(t);
  const identity = await f.capture();
  const before = performance.now();
  const result = await observeOwnedApplicationKill({
    identity,
    kill: f.killGroup,
    record: f.record,
  });
  assert.equal(result.applicationPid, f.appPid);
  assert.equal(result.guardianPid, f.target.pid);
  assert.equal(result.parentClockDomain, 'self-parent');
  assert.equal(result.exitObservation, 'owned-process-confirmed-absent');
  assert.ok(result.signalRequestedBeforeMs >= before);
  assert.ok(result.processExitObservedAfterMs >= result.signalRequestedBeforeMs);
  assert.ok(result.processExitObservedAfterMs <= performance.now());
  assert.ok(result.checks.some((item) => item.identity?.pid === f.appPid));
  assert.equal(result.checks.at(-1)?.identity, null);
  assert.equal(result.checks.at(-1)?.exitCode, 1);
  assert.ok(f.evidence.some((item) => item.name === 'application-exit-observation'));
  let called = false;
  await assert.rejects(
    observeOwnedApplicationKill({
      identity,
      kill: async () => {
        called = true;
      },
    }),
    /不能重放/,
  );
  assert.equal(called, false);
});

test('guardian-only death cannot prove application exit and preserves the still-live ps evidence', async (t) => {
  const f = await ownedFixture(t),
    identity = await f.capture();
  await assert.rejects(
    observeOwnedApplicationKill({
      identity,
      timeoutMs: 100,
      record: f.record,
      kill: async () => {
        f.guardian.kill('SIGKILL');
        await f.exited;
      },
    }),
    /guardian 结束不能替代应用退出/,
  );
  const checks = f.evidence.filter((item) => item.name === 'application-ps-check');
  assert.ok(checks.length >= 5);
  const raw = (await exec('ps', ['-p', String(f.appPid), '-o', 'ppid=,pgid=,uid=,lstart='])).stdout;
  assert.equal(parseApplicationPsIdentity(f.appPid, raw).started, identity.applicationStarted);
});

test('cache, mismatched binding/start and missing startup identity cannot authorize a kill', async (t) => {
  const f = await ownedFixture(t);
  for (const mutate of [
    (s: typeof f.snapshot) => {
      s.snapshotProvenance.source = 'retained-after-process-exit';
    },
    (s: typeof f.snapshot) => {
      s.binding.revision = 'b'.repeat(40);
    },
    (s: typeof f.snapshot) => {
      s.snapshotProvenance.applicationStarted += ' altered';
    },
    (s: typeof f.snapshot) => {
      s.snapshotProvenance.applicationStarted = '';
    },
    (s: typeof f.snapshot) => {
      s.clockObservation.applicationPid = f.target.pid;
    },
  ]) {
    const snapshot = structuredClone(f.snapshot);
    mutate(snapshot);
    await assert.rejects(
      captureOwnedApplicationIdentity({
        target: f.target,
        snapshot,
        parentClockDomain: 'self',
        record: f.record,
      }),
      /BLOCKED/,
    );
  }
  assert.equal(
    f.evidence.filter((item) => item.name === 'application-controller-identity-input').length,
    5,
  );
});

test('a valid live child belonging to a different QA-owned group is still refused', async (t) => {
  const a = await ownedFixture(t),
    b = await ownedFixture(t);
  const snapshot = {
    ...a.snapshot,
    snapshotProvenance: b.snapshot.snapshotProvenance,
    clockObservation: b.snapshot.clockObservation,
  };
  await assert.rejects(
    captureOwnedApplicationIdentity({
      target: a.target,
      snapshot,
      parentClockDomain: 'self',
      record: a.record,
    }),
    /禁止调用强杀/,
  );
});

test('serialized identities are not authority, and identity lost before dispatch prevents callback', async (t) => {
  const f = await ownedFixture(t),
    identity = await f.capture();
  let called = false;
  const kill = async () => {
    called = true;
  };
  await assert.rejects(
    observeOwnedApplicationKill({ identity: structuredClone(identity), kill }),
    /不能重放/,
  );
  assert.equal(called, false);
  await f.killGroup();
  // Give the operating system a finite opportunity to reap the owned child; a zombie
  // would also fail the now-missing guardian check, so this is not a pass precondition.
  await sleep(10);
  await assert.rejects(
    observeOwnedApplicationKill({ identity, kill, record: f.record }),
    /禁止调用强杀/,
  );
  assert.equal(called, false);
});
