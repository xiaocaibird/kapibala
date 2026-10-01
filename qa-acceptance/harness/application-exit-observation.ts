import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { BlockedError } from './security.js';
import { isolatedEnv } from './process.js';
import { validateCapacityTarget, type CapacityControlTarget } from './capacity-control.js';

const exec = promisify(execFile);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
type Recorder = (name: string, value: unknown) => Promise<void>;
export interface PsIdentity {
  pid: number;
  parentPid: number;
  processGroupId: number;
  uid: number;
  /** Public controller contract: the exact fourth ps capture group, not a parsed date. */
  started: string;
}
export interface ApplicationPsCheck {
  pid: number;
  args: string[];
  requestWindowMs: [number, number];
  stdout: string;
  stderr: string;
  exitCode: number | string | null;
  identity: PsIdentity | null;
}
export interface OwnedApplicationIdentity {
  parentClockDomain: string;
  applicationPid: number;
  applicationStarted: string;
  guardianPid: number;
  guardianStarted: string;
  uid: number;
  apiUrl: string;
  revision: string;
  checks: ApplicationPsCheck[];
}
export interface ApplicationExitObservation {
  parentClockDomain: string;
  applicationPid: number;
  applicationStarted: string;
  guardianPid: number;
  signal: 'SIGKILL';
  signalRequestedBeforeMs: number;
  processExitObservedAfterMs: number;
  exitObservation: 'owned-process-confirmed-absent' | 'owned-process-identity-replaced';
  checks: ApplicationPsCheck[];
}
// A serialized/self-reported identity cannot authorize the callback. Keep the original
// immutable identity in this process and recheck both processes immediately before it.
const captured = new WeakMap<OwnedApplicationIdentity, OwnedApplicationIdentity>();

export function parseApplicationPsIdentity(pid: number, stdout: string): PsIdentity {
  const lines = stdout.trim().split('\n');
  const match = lines.length === 1 && /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(lines[0]);
  if (!match) throw new BlockedError('ps 身份输出缺字段或有多行；不能证明实际应用身份');
  const values = match.slice(1, 4).map(Number);
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    values.some((v) => !Number.isSafeInteger(v) || v < 0)
  )
    throw new BlockedError('ps 身份输出的进程或用户编号无效');
  return {
    pid,
    parentPid: values[0],
    processGroupId: values[1],
    uid: values[2],
    started: match[4],
  };
}

async function readPs(
  pid: number,
  checks: ApplicationPsCheck[],
  recorder?: Recorder,
): Promise<ApplicationPsCheck> {
  const args = ['-p', String(pid), '-o', 'ppid=,pgid=,uid=,lstart='];
  const before = performance.now();
  let stdout = '',
    stderr = '',
    exitCode: number | string | null = 0;
  try {
    const result = await exec('ps', args, { timeout: 2000, env: isolatedEnv({}) });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    stdout = String(failure.stdout ?? '');
    stderr = String(failure.stderr ?? '');
    exitCode = failure.code ?? null;
  }
  const check: ApplicationPsCheck = {
    pid,
    args,
    requestWindowMs: [before, performance.now()],
    stdout,
    stderr,
    exitCode,
    identity: null,
  };
  checks.push(check);
  // Preserve raw output even when parsing fails. A failed ps invocation is not absence.
  await recorder?.('application-ps-check', check);
  if (exitCode === 1 && !stdout.trim() && !stderr.trim()) return check;
  if (exitCode !== 0 || stderr.trim())
    throw new BlockedError('ps 检查失败；不能用检查错误证明应用退出');
  check.identity = parseApplicationPsIdentity(pid, stdout);
  return check;
}

function liveApplicationBinding(
  snapshot: unknown,
  target: CapacityControlTarget,
): { pid: number; started: string } {
  if (
    !record(snapshot) ||
    snapshot.protocol !== 'qa-runtime-observation/1' ||
    !record(snapshot.binding) ||
    snapshot.binding.apiUrl !== target.apiUrl ||
    snapshot.binding.revision !== target.revision ||
    snapshot.binding.pid !== target.pid ||
    snapshot.binding.observedOwnerToken !== target.ownerToken
  )
    throw new BlockedError('应用退出观测缺少绑定本轮 target 的公开 controller 快照');
  const source = snapshot.snapshotProvenance,
    clock = snapshot.clockObservation;
  if (
    !record(source) ||
    source.source !== 'live-bridge' ||
    !Number.isSafeInteger(source.applicationPid) ||
    Number(source.applicationPid) <= 0 ||
    typeof source.applicationStarted !== 'string' ||
    !source.applicationStarted.trim() ||
    !record(clock) ||
    clock.applicationPid !== source.applicationPid ||
    typeof clock.clockDomain !== 'string' ||
    !clock.clockDomain.trim() ||
    clock.clockUnit !== 'ms' ||
    typeof clock.monotonicMs !== 'number' ||
    !Number.isFinite(clock.monotonicMs) ||
    clock.monotonicMs < 0
  )
    throw new BlockedError('缺少真实 live-bridge 应用 PID/启动身份/时钟；缓存不能建立强杀身份');
  return { pid: Number(source.applicationPid), started: source.applicationStarted };
}

function verifyOwnedPair(
  app: PsIdentity | null,
  guardian: PsIdentity | null,
  identity: Pick<
    OwnedApplicationIdentity,
    'applicationPid' | 'applicationStarted' | 'guardianPid' | 'guardianStarted' | 'uid'
  >,
): void {
  if (
    !app ||
    !guardian ||
    app.pid !== identity.applicationPid ||
    app.started !== identity.applicationStarted ||
    app.processGroupId !== identity.guardianPid ||
    app.uid !== identity.uid ||
    guardian.pid !== identity.guardianPid ||
    guardian.started !== identity.guardianStarted ||
    guardian.processGroupId !== identity.guardianPid ||
    guardian.uid !== identity.uid ||
    guardian.parentPid !== process.pid
  )
    throw new BlockedError(
      '实际应用或 guardian 的 PID/PGID/UID/启动身份不再属于本 QA；禁止调用强杀',
    );
}

export async function captureOwnedApplicationIdentity(options: {
  target: CapacityControlTarget;
  snapshot: unknown;
  parentClockDomain: string;
  record?: Recorder;
}): Promise<OwnedApplicationIdentity> {
  await options.record?.('application-controller-identity-input', {
    parentClockDomain: options.parentClockDomain,
    target: {
      apiUrl: options.target.apiUrl,
      revision: options.target.revision,
      pid: options.target.pid,
    },
    snapshotProvenance: record(options.snapshot) ? options.snapshot.snapshotProvenance : null,
    clockObservation: record(options.snapshot) ? options.snapshot.clockObservation : null,
  });
  validateCapacityTarget(options.target);
  if (!options.parentClockDomain.trim() || !process.getuid)
    throw new BlockedError('实际应用退出观测需要本 QA 父单调时钟标识及当前 UID');
  const binding = liveApplicationBinding(options.snapshot, options.target);
  if ([process.pid, options.target.pid].includes(binding.pid) || options.target.pid === process.pid)
    throw new BlockedError('应用 PID 必须区别于 QA 与其 guardian；禁止自杀或混用 guardian 退出');
  const checks: ApplicationPsCheck[] = [];
  const guardian = await readPs(options.target.pid, checks, options.record);
  const app = await readPs(binding.pid, checks, options.record);
  const identity: OwnedApplicationIdentity = {
    parentClockDomain: options.parentClockDomain,
    applicationPid: binding.pid,
    applicationStarted: binding.started,
    guardianPid: options.target.pid,
    guardianStarted: guardian.identity?.started ?? '',
    uid: process.getuid(),
    apiUrl: options.target.apiUrl,
    revision: options.target.revision,
    checks,
  };
  verifyOwnedPair(app.identity, guardian.identity, identity);
  captured.set(identity, structuredClone(identity));
  await options.record?.('application-owned-identity', identity);
  return identity;
}

/** Only pass the current QaEnvironment.kill callback. This helper never signals a PID itself. */
export async function observeOwnedApplicationKill(options: {
  identity: OwnedApplicationIdentity;
  kill: () => Promise<void>;
  timeoutMs?: number;
  record?: Recorder;
}): Promise<ApplicationExitObservation> {
  const identity = captured.get(options.identity);
  if (!identity) throw new BlockedError('强杀身份未由本 QA 进程实时捕获，不能重放序列化身份');
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000)
    throw new BlockedError('实际应用退出诊断窗口必须有界（最多 30 秒），不是业务 SLA');
  const checks = [...identity.checks];
  const guardian = await readPs(identity.guardianPid, checks, options.record);
  const app = await readPs(identity.applicationPid, checks, options.record);
  verifyOwnedPair(app.identity, guardian.identity, identity);
  // Single-use, even if the callback throws. The original guardian cannot authorize a later kill.
  captured.delete(options.identity);
  const signalRequestedBeforeMs = performance.now();
  await options.kill();
  const deadline = signalRequestedBeforeMs + timeoutMs;
  do {
    const check = await readPs(identity.applicationPid, checks, options.record);
    if (!check.identity || check.identity.started !== identity.applicationStarted) {
      const result: ApplicationExitObservation = {
        parentClockDomain: identity.parentClockDomain,
        applicationPid: identity.applicationPid,
        applicationStarted: identity.applicationStarted,
        guardianPid: identity.guardianPid,
        signal: 'SIGKILL',
        signalRequestedBeforeMs,
        processExitObservedAfterMs: check.requestWindowMs[1],
        exitObservation: check.identity
          ? 'owned-process-identity-replaced'
          : 'owned-process-confirmed-absent',
        checks,
      };
      await options.record?.('application-exit-observation', result);
      return result;
    }
    // Reparenting after guardian death is normal. Same PID+start is still a live identity,
    // including zombies: do not infer application disappearance from guardian completion.
    if (
      check.identity.uid !== identity.uid ||
      check.identity.processGroupId !== identity.guardianPid
    )
      throw new BlockedError('应用同一启动身份的 UID/PGID 变化；退出归因不充分');
    if (performance.now() >= deadline) break;
    await sleep(20);
  } while (performance.now() < deadline);
  throw new BlockedError('有界诊断内未证明实际应用身份消失；guardian 结束不能替代应用退出');
}
