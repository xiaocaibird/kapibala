import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type { RuntimeDiagnosticsProfile } from './types.js';
import { BlockedError, redact } from './security.js';
import {
  controlLoopbackUrl,
  validateCapacityTarget,
  type CapacityControlTarget,
} from './capacity-control.js';

export const RUNTIME_PROTOCOL = 'qa-runtime-observation/1';
export type RuntimeMode =
  | 'observe-activity'
  | 'hold-safe-activity-boundary'
  | 'account-save-once'
  | 'account-save-persistent'
  | 'module-fail-then-hold';
export type RuntimeCorrelation =
  | { kind: 'activity'; groupId: string; runId: string; toolUseId: string }
  | { kind: 'account'; accountId: string; operation: 'connect'; intentId: string }
  | { kind: 'module'; module: string; attemptLabel: string };
export type DiagnosticProfile = RuntimeDiagnosticsProfile;
export interface RuntimeConfig {
  url: string;
  contractReference: string;
  diagnostics?: DiagnosticProfile;
}
export interface RuntimeEvent {
  seq: number;
  at: string;
  kind:
    | 'activity-checkpoint'
    | 'activity-terminal'
    | 'activity-safe-held'
    | 'remote-success'
    | 'local-save-failed'
    | 'local-retry-held'
    | 'newer-account-intent-waiting'
    | 'local-save-committed'
    | 'transaction-rolled-back'
    | 'module-failed'
    | 'module-before-next-held'
    | 'module-running-held'
    | 'module-succeeded';
  correlation: RuntimeCorrelation;
  attemptId: string;
  /** QA guardian/PGID identity, not necessarily the application child PID. */
  instancePid: number;
  transactionId?: string;
  requestId?: string;
  faultMarker?: string;
  /** Null/absent is honest incomplete evidence only when includesUnsavedTail=false. */
  activeElapsedMs?: [number, number] | null;
  persistedActiveMs?: number;
  epochIds?: string[];
  /** Required for activity evidence; false means lost tail has no proved bound. */
  includesUnsavedTail?: boolean;
  /** Process liveness alone cannot establish that this run is accumulating activity. */
  activityState?: 'active' | 'recovery-paused' | 'terminal' | 'unknown';
  /** Durable continuation with no external request in flight, before the next dispatch. */
  stepId?: string;
  continuationDurable?: boolean;
  remoteInFlightCount?: number;
  recoverableInOriginalTransaction?: boolean;
  commitBoundary?: 'outer-commit-confirmed';
  tickBoundary?: 'before-activity-and-diagnostics-start';
  waitingIntent?: {
    requestId: string;
    accountId: string;
    expectedFrom: 'online';
    to: 'disconnected';
    waitingForTransactionId: string;
  };
}
export interface RuntimeSnapshot {
  protocol: typeof RUNTIME_PROTOCOL;
  leaseId: string;
  state: 'armed' | 'held' | 'released';
  expiresAt: string;
  binding: { apiUrl: string; revision: string; pid: number; observedOwnerToken: string };
  correlation: RuntimeCorrelation;
  events: RuntimeEvent[];
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const equal = isDeepStrictEqual;
const kinds = new Set([
  'activity-checkpoint',
  'activity-terminal',
  'activity-safe-held',
  'remote-success',
  'local-save-failed',
  'local-retry-held',
  'newer-account-intent-waiting',
  'local-save-committed',
  'transaction-rolled-back',
  'module-failed',
  'module-before-next-held',
  'module-running-held',
  'module-succeeded',
]);
const capability = (mode: RuntimeMode) =>
  mode === 'observe-activity'
    ? 'activity-witness'
    : mode === 'hold-safe-activity-boundary'
      ? 'activity-safe-boundary'
      : mode.startsWith('account-')
        ? 'account-local-save'
        : 'module-tick';
export function readRuntimeConfig(value: unknown): RuntimeConfig {
  const adapters = record(value) && record(value.adapters) ? value.adapters : {};
  const config = adapters.runtimeObservation;
  if (!record(config) || !text(config.contractReference))
    throw new BlockedError(
      '工程runtimeObservation控制器未接入；见contracts/runtime-observation.md',
    );
  return {
    url: controlLoopbackUrl(config.url),
    contractReference: config.contractReference,
    ...(config.diagnostics === undefined
      ? {}
      : { diagnostics: validateDiagnosticProfile(config.diagnostics) }),
  };
}
export function validateDiagnosticProfile(value: unknown): DiagnosticProfile {
  const pointers = [
    'modulesPointer',
    'namePointer',
    'statePointer',
    'consecutiveFailuresPointer',
    'lastFailureAtPointer',
    'lastSuccessAtPointer',
    'currentDurationMsPointer',
    'tickCountPointer',
  ];
  if (
    !record(value) ||
    !text(value.module) ||
    !pointers.every(
      (key) =>
        typeof value[key] === 'string' &&
        (key === 'modulesPointer' || value[key] !== '') &&
        /^(?:\/(?:[^~]|~[01])*)*$/.test(value[key] as string),
    ) ||
    !record(value.states) ||
    !['failed', 'running', 'healthy'].every((key) =>
      text((value.states as Record<string, unknown>)[key]),
    ) ||
    new Set(Object.values(value.states)).size !== 3
  )
    throw new BlockedError('诊断字段profile未明确或格式非法；不得猜测公开JSON字段');
  return value as unknown as DiagnosticProfile;
}
export function atPointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const segment of pointer.split('/').slice(1)) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if ((!record(current) && !Array.isArray(current)) || !Object.hasOwn(current, key))
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
export function diagnosticModule(
  value: unknown,
  profile: DiagnosticProfile,
): Record<string, unknown> {
  const modules = atPointer(value, profile.modulesPointer);
  assert.ok(Array.isArray(modules), '诊断模块列表须为数组');
  const matches = modules.filter(
    (entry) => atPointer(entry, profile.namePointer) === profile.module,
  );
  assert.equal(matches.length, 1, '诊断必须能唯一识别被故障控制的真实模块');
  assert.ok(record(matches[0]));
  return matches[0];
}
function binding(value: unknown, target: CapacityControlTarget): void {
  if (
    !record(value) ||
    value.apiUrl !== target.apiUrl ||
    value.revision !== target.revision ||
    value.pid !== target.pid ||
    value.observedOwnerToken !== target.ownerToken
  )
    throw new BlockedError('运行观测没有绑定当前专属实际SUT进程，禁止故障操作');
}
export function validateRuntimeSnapshot(
  value: unknown,
  target: CapacityControlTarget,
  id: string,
  correlation: RuntimeCorrelation,
): RuntimeSnapshot {
  if (
    !record(value) ||
    value.protocol !== RUNTIME_PROTOCOL ||
    value.leaseId !== id ||
    !['armed', 'held', 'released'].includes(String(value.state)) ||
    !equal(value.correlation, correlation) ||
    !Array.isArray(value.events) ||
    !Number.isFinite(Date.parse(String(value.expiresAt)))
  )
    throw new BlockedError('运行观测跨租约、关联错误或格式无效');
  binding(value.binding, target);
  let seq = 0;
  for (const event of value.events) {
    if (
      !record(event) ||
      !Number.isSafeInteger(event.seq) ||
      Number(event.seq) <= seq ||
      !Number.isFinite(Date.parse(String(event.at))) ||
      Date.parse(String(event.at)) > Date.now() ||
      !kinds.has(String(event.kind)) ||
      !text(event.attemptId) ||
      event.instancePid !== target.pid ||
      !equal(event.correlation, correlation)
    )
      throw new BlockedError('运行观测事件缺少实际尝试/进程关联或顺序无效');
    seq = Number(event.seq);
    const category = String(event.kind).startsWith('activity-')
      ? 'activity'
      : String(event.kind).startsWith('module-')
        ? 'module'
        : 'account';
    if (category !== correlation.kind) throw new BlockedError('观测事件类型与被绑定业务类别不一致');
    if (correlation.kind === 'account' && (!text(event.transactionId) || !text(event.requestId)))
      throw new BlockedError('账号保存观测缺少原事务及请求身份');
    if (
      event.kind === 'module-before-next-held' &&
      event.tickBoundary !== 'before-activity-and-diagnostics-start'
    )
      throw new BlockedError('失败后屏障必须位于任何下一轮活动/诊断tick-start之前');
    if (event.kind === 'local-save-failed' && event.recoverableInOriginalTransaction !== true)
      throw new BlockedError('保存错误缺少原事务局部可恢复的真实故障见证');
    if (event.kind === 'local-save-committed' && event.commitBoundary !== 'outer-commit-confirmed')
      throw new BlockedError('保存提交必须确认原外层事务COMMIT，不能以RELEASE SAVEPOINT代替');
    if (event.kind === 'newer-account-intent-waiting') {
      const waiting = event.waitingIntent;
      if (
        correlation.kind !== 'account' ||
        !record(waiting) ||
        !text(waiting.requestId) ||
        waiting.requestId === event.requestId ||
        waiting.accountId !== correlation.accountId ||
        waiting.expectedFrom !== 'online' ||
        waiting.to !== 'disconnected' ||
        waiting.waitingForTransactionId !== event.transactionId
      )
        throw new BlockedError('后续真实请求尚未被证明收到并等待原事务，不能声称并发竞争');
    }
    if (String(event.kind).startsWith('activity-')) {
      const bounds = event.activeElapsedMs;
      const validBounds =
        Array.isArray(bounds) &&
        bounds.length === 2 &&
        bounds.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) &&
        bounds[0] <= bounds[1];
      // Missing whole-run truth is valid incomplete evidence, not a malformed
      // snapshot. A supplied interval still has to be well formed; completeness
      // must never be inferred from persisted/current-epoch samples.
      if (
        (bounds != null && !validBounds) ||
        (event.includesUnsavedTail === true && !validBounds) ||
        typeof event.includesUnsavedTail !== 'boolean' ||
        !['active', 'recovery-paused', 'terminal', 'unknown'].includes(
          String(event.activityState),
        ) ||
        !Array.isArray(event.epochIds) ||
        (event.includesUnsavedTail === true && !event.epochIds.length) ||
        !event.epochIds.every(text)
      )
        throw new BlockedError(
          '活动区间格式无效、完整性声明与区间矛盾，或缺少实际状态/epoch/尾段说明',
        );
      if (
        event.kind === 'activity-safe-held' &&
        (!text(event.stepId) ||
          event.continuationDurable !== true ||
          event.remoteInFlightCount !== 0 ||
          event.activityState !== 'active')
      )
        throw new BlockedError('安全崩溃窗口未证明原步骤续跑已持久化且没有在途外部请求');
      if (event.kind === 'activity-terminal' && event.activityState !== 'terminal')
        throw new BlockedError('活动终止事件没有实际终态见证');
    }
  }
  return value as unknown as RuntimeSnapshot;
}
/** recovery-paused means the real run cannot continue without operator/external
 * resolution; ordinary automatic scheduling delay must not be labelled this way. */
export function assertNoRecoveryPause(events: readonly RuntimeEvent[]): void {
  // Check the whole snapshot before reporting missing budget/state evidence:
  // an earlier incomplete checkpoint cannot hide a later proved recovery pause.
  assert.ok(
    !events.some((event) => event.activityState === 'recovery-paused'),
    '原A5.8强恢复未满足：原run等待人工或外部结果确认而不能自动续跑；这不是活动预算超时结论',
  );
}
export function assertRecoveredActivity(event: RuntimeEvent): void {
  assertNoRecoveryPause([event]);
  if (!['active', 'terminal'].includes(String(event.activityState)))
    throw new BlockedError('实际活动/恢复状态没有可信见证，不能把进程在线或公开running当活动时间');
}
export function assertActivityBudget(
  event: RuntimeEvent,
  processOnline: [number, number],
  budget = 60_000,
  endReason = 'wall_clock',
): void {
  const bounds = event.activeElapsedMs;
  if (
    !processOnline.every((value) => Number.isFinite(value) && value >= 0) ||
    processOnline[0] > processOnline[1]
  )
    throw new BlockedError('独立进程在线区间无效');
  if (!bounds || !event.includesUnsavedTail)
    throw new BlockedError('活动真值未包含未保存崩溃尾段，禁止将最后持久采样当准确总量');
  // Online time is only an upper bound: a live process may have a paused run.
  assert.ok(bounds[0] <= processOnline[1], '控制器活动下界超过QA独立进程在线上界，证据矛盾');
  assert.ok(bounds[0] <= budget, '活动预算已证明超过原始60秒上限');
  if (endReason === 'wall_clock')
    assert.ok(
      processOnline[1] >= budget && bounds[1] >= budget,
      '未耗尽预算却已提前宣告wall_clock',
    );
  if (bounds[1] > budget)
    throw new BlockedError('活动真值区间跨越60秒上限；不能证明上限符合，不引入尾差容忍');
}
export class RuntimeLease {
  latest?: RuntimeSnapshot;
  constructor(
    readonly id: string,
    readonly target: CapacityControlTarget,
    readonly correlation: RuntimeCorrelation,
    private readonly send: (method: string, suffix?: string) => Promise<unknown>,
  ) {}
  accept(value: unknown): RuntimeSnapshot {
    const next = validateRuntimeSnapshot(value, this.target, this.id, this.correlation);
    if (
      this.latest &&
      (next.expiresAt !== this.latest.expiresAt ||
        (this.latest.state === 'released' && next.state !== 'released') ||
        next.events.length < this.latest.events.length ||
        this.latest.events.some((entry, index) => !equal(entry, next.events[index])))
    )
      throw new BlockedError('观测历史被删除、改写、期限被延长或租约复活');
    this.latest = next;
    return next;
  }
  async snapshot(): Promise<RuntimeSnapshot> {
    return this.accept(await this.send('GET'));
  }
  async advance(): Promise<void> {
    if (
      !this.latest ||
      this.latest.state !== 'held' ||
      Date.parse(this.latest.expiresAt) <= Date.now()
    )
      throw new BlockedError('只有本租约未到期的真实保持阶段可以放行');
    this.accept(await this.send('POST', '/advance'));
  }
  async release(): Promise<void> {
    const value = this.accept(await this.send('DELETE'));
    if (value.state !== 'released') throw new BlockedError('工程控制器未确认释放本租约');
  }
  async waitFor(kind: RuntimeEvent['kind'], timeoutMs = 15_000): Promise<RuntimeSnapshot> {
    const started = performance.now();
    do {
      const value = await this.snapshot();
      if (value.events.some((event) => event.kind === kind)) {
        if (
          (kind.endsWith('-held') || kind === 'newer-account-intent-waiting') &&
          (value.state !== 'held' || Date.parse(value.expiresAt) <= Date.now())
        )
          throw new BlockedError('所需屏障事件存在但当前租约没有真实保持');
        return value;
      }
      if (Date.parse(value.expiresAt) <= Date.now())
        throw new BlockedError('故障租约已到期，所需真实窗口未出现');
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (performance.now() - started < timeoutMs);
    throw new BlockedError(`观察预算内缺少真实 ${kind} 事件；不能把未触发分支算通过`);
  }
}
export class RuntimeObservation {
  private verified = new Set<string>();
  private leases = new Set<RuntimeLease>();
  constructor(
    readonly config: RuntimeConfig,
    readonly target: CapacityControlTarget,
    private readonly evidence?: (name: string, value: unknown) => Promise<void>,
  ) {
    controlLoopbackUrl(config.url);
    validateCapacityTarget(target);
  }
  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${controlLoopbackUrl(this.config.url)}${path}`, {
        method,
        redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BlockedError('工程运行观测控制器不可用');
    }
    if (!response.ok) throw new BlockedError(`运行控制器拒绝操作HTTP ${response.status}`);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new BlockedError('运行控制器响应不是JSON');
    }
    await this.evidence?.(
      `runtime-control-${randomUUID()}`,
      JSON.parse(redact({ method, path, status: response.status, response: value })),
    );
    return value;
  }
  async verify(capabilities: string[]): Promise<void> {
    const query = new URLSearchParams({
      apiUrl: this.target.apiUrl,
      revision: this.target.revision,
      pid: String(this.target.pid),
    });
    const value = await this.request('GET', `/qa/runtime/v1/capabilities?${query}`);
    if (
      !record(value) ||
      value.protocol !== RUNTIME_PROTOCOL ||
      !Array.isArray(value.capabilities) ||
      !capabilities.every((item) => (value.capabilities as unknown[]).includes(item))
    )
      throw new BlockedError('工程控制器缺少所需真实运行观测能力');
    binding(value.binding, this.target);
    this.verified = new Set(value.capabilities as string[]);
  }
  async arm(
    mode: RuntimeMode,
    correlation: RuntimeCorrelation,
    options: { ttlMs?: number; faultMarker?: string } = {},
  ): Promise<RuntimeLease> {
    if (!this.verified.has(capability(mode)))
      throw new BlockedError('必须先验证真实进程及能力，再创建故障');
    if (
      (['observe-activity', 'hold-safe-activity-boundary'].includes(mode) &&
        correlation.kind !== 'activity') ||
      (mode.startsWith('account-') && correlation.kind !== 'account') ||
      (mode === 'module-fail-then-hold' && correlation.kind !== 'module') ||
      !Object.values(correlation).every(text)
    )
      throw new Error('故障模式与业务关联不一致');
    const ttlMs = options.ttlMs ?? 110_000;
    if (!Number.isInteger(ttlMs) || ttlMs < 5000 || ttlMs > 120_000)
      throw new Error('TTL必须在5至120秒的QA安全范围内');
    if (
      options.faultMarker !== undefined &&
      (!/^qa-runtime-[a-zA-Z0-9-]{1,96}$/.test(options.faultMarker) ||
        mode !== 'module-fail-then-hold')
    )
      throw new Error('错误样本只能是模块故障下的有限合成marker');
    const id = randomUUID(),
      path = `/qa/runtime/v1/leases/${id}`;
    const lease = new RuntimeLease(id, this.target, correlation, (method, suffix = '') =>
      this.request(method, path + suffix),
    );
    this.leases.add(lease);
    const value = await this.request('PUT', path, {
      protocol: RUNTIME_PROTOCOL,
      target: { apiUrl: this.target.apiUrl, revision: this.target.revision, pid: this.target.pid },
      mode,
      correlation,
      ttlMs,
      ...(options.faultMarker ? { faultMarker: options.faultMarker } : {}),
    });
    const next = lease.accept(value),
      expires = Date.parse(next.expiresAt);
    if (expires <= Date.now() || expires > Date.now() + ttlMs)
      throw new BlockedError('工程租约没有有效自动释放期限');
    return lease;
  }
  async close(): Promise<void> {
    const results = await Promise.allSettled([...this.leases].map((lease) => lease.release()));
    if (results.some((result) => result.status === 'rejected'))
      throw new BlockedError('运行故障清理未全部确认，控制器TTL必须兜底；不得清理其他租约');
  }
}
export function runtimeObservationFor(host: {
  config: unknown;
  capacityControlTarget: () => CapacityControlTarget;
  evidence: (name: string, value: unknown) => Promise<void>;
}): RuntimeObservation {
  return new RuntimeObservation(
    readRuntimeConfig(host.config),
    host.capacityControlTarget(),
    (name, value) => host.evidence(name, value),
  );
}
