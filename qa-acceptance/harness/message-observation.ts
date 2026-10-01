import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Client } from 'pg';
import { BlockedError, redact } from './security.js';
import { controlLoopbackUrl, validateCapacityTarget, type CapacityControlTarget } from './capacity-control.js';

export const MESSAGE_PROTOCOL = 'qa-message-observation/1';
export const messageModes = [
  'timeout-observed-before-local-save', 'receipt-before-commit', 'receipt-committed-before-business',
] as const;
export type MessageMode = typeof messageModes[number];
export type MessageCorrelation = { clientMsgId: string; msgId?: string; eventId?: string };
export type Interval = readonly [number, number];
export interface MessageWindowEvent extends MessageCorrelation {
  seq: number;
  at: string;
  kind: 'window-held' | 'window-unavailable';
  phase: MessageMode;
  attemptId: string;
  observedAt: string;
  receiptObservedAt: string | null;
  instancePid: number;
  databaseIdentity: string;
  localBoundary: string;
  receiptPresentAtProbe: boolean;
  coverage: { scope: 'bound-instance'; allDatabaseWritersProven: false };
}
export interface MessageSnapshot {
  protocol: typeof MESSAGE_PROTOCOL;
  leaseId: string;
  state: 'armed' | 'held' | 'released';
  expiresAt: string;
  binding: { apiUrl: string; revision: string; pid: number; observedOwnerToken: string };
  correlation: MessageCorrelation;
  events: MessageWindowEvent[];
}
export interface MessageConfig { url: string; contractReference: string }
interface OwnedMessageStorage {
  database: string;
  cluster: { ownsDatabase(name: string): boolean; url(name: string): string };
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
const instant = (x: unknown): x is string => text(x) && Number.isFinite(Date.parse(x));
const boundaries: Record<MessageMode, string> = {
  'timeout-observed-before-local-save': '504-recognized-local-result-save-not-started',
  'receipt-before-commit': 'receipt-insert-not-issued',
  'receipt-committed-before-business': 'receipt-autocommit-confirmed-business-not-started',
};
function binding(value: unknown, target: CapacityControlTarget): void {
  if (!record(value) || value.apiUrl !== target.apiUrl || value.revision !== target.revision ||
      value.pid !== target.pid || value.observedOwnerToken !== target.ownerToken)
    throw new BlockedError('消息观测响应未绑定当前QA实例；禁止操作其他进程');
}
export function readMessageConfig(value: unknown): MessageConfig {
  const adapter = record(value) && record(value.adapters) ? value.adapters.messageObservation : undefined;
  if (!record(adapter) || !text(adapter.contractReference) || /REQUIRED|REPLACE/.test(adapter.contractReference))
    throw new BlockedError('消息三窗口尚未接入：缺adapters.messageObservation及已确认工程契约');
  return { url: controlLoopbackUrl(adapter.url), contractReference: adapter.contractReference };
}
function validateCorrelation(mode: MessageMode, correlation: MessageCorrelation): void {
  const keys = mode === 'timeout-observed-before-local-save' ? ['clientMsgId'] : ['clientMsgId', 'msgId', 'eventId'];
  if (!messageModes.includes(mode) || Object.keys(correlation).length !== keys.length ||
      keys.some((key) => !text(correlation[key as keyof MessageCorrelation]) || correlation[key as keyof MessageCorrelation]!.length > 200))
    throw new BlockedError('消息窗口请求须绑定真实clientMsgId和该phase要求的完整事件身份');
}
export function validateMessageSnapshot(
  value: unknown, target: CapacityControlTarget, leaseId: string, mode: MessageMode,
  correlation: MessageCorrelation, databaseIdentity: string,
): MessageSnapshot {
  validateCorrelation(mode, correlation);
  if (!record(value) || value.protocol !== MESSAGE_PROTOCOL || value.leaseId !== leaseId ||
      !['armed', 'held', 'released'].includes(String(value.state)) || !instant(value.expiresAt) ||
      !isDeepStrictEqual(value.correlation, correlation) || !Array.isArray(value.events))
    throw new BlockedError('消息窗口快照身份、状态或历史格式无效');
  binding(value.binding, target);
  let seq = 0;
  for (const event of value.events) {
    if (!record(event) || !Number.isSafeInteger(event.seq) || Number(event.seq) <= seq ||
        !instant(event.at) || !instant(event.observedAt) || Date.parse(event.at) < Date.parse(event.observedAt) ||
        !['window-held', 'window-unavailable'].includes(String(event.kind)) || event.phase !== mode ||
        !text(event.attemptId) || event.attemptId === leaseId || event.instancePid !== target.pid ||
        event.databaseIdentity !== databaseIdentity || !/^[a-f0-9]{64}$/.test(databaseIdentity) ||
        event.localBoundary !== boundaries[mode] || typeof event.receiptPresentAtProbe !== 'boolean' ||
        (event.receiptObservedAt !== null && !instant(event.receiptObservedAt)) ||
        !record(event.coverage) || event.coverage.scope !== 'bound-instance' || event.coverage.allDatabaseWritersProven !== false ||
        Object.entries(correlation).some(([key, expected]) => event[key] !== expected))
      throw new BlockedError('消息窗口缺少真实尝试、独立数据库身份、准确保存阶段或单实例证据');
    seq = Number(event.seq);
    if (mode === 'timeout-observed-before-local-save' &&
        (event.msgId !== undefined || event.eventId !== undefined || event.receiptObservedAt !== null))
      throw new BlockedError('504窗口混入不属于该请求的receipt身份');
    if (event.kind === 'window-held' && mode === 'receipt-before-commit' &&
        (event.receiptPresentAtProbe !== false || event.receiptObservedAt !== null))
      throw new BlockedError('INSERT前窗口已有接收记录，不能声称未保存');
    if (event.kind === 'window-held' && mode === 'receipt-committed-before-business' &&
        (event.receiptPresentAtProbe !== true || !instant(event.receiptObservedAt)))
      throw new BlockedError('未证明receipt自动提交已确认；SQL发出或历史未知不能替代');
  }
  if (value.state === 'held' && !value.events.some((event: MessageWindowEvent) => event.kind === 'window-held'))
    throw new BlockedError('held状态没有真实命中事件');
  return value as unknown as MessageSnapshot;
}

/** Read infrastructure identity only, through the already QA-owned database. No product tables. */
export async function ownedMessageDatabaseIdentity(host: {
  ownedStorage(): OwnedMessageStorage;
}): Promise<string> {
  const { database, cluster } = host.ownedStorage();
  if (!cluster.ownsDatabase(database)) throw new BlockedError('消息窗口数据库不是本用例资源');
  const client = new Client({ connectionString: cluster.url(database), connectionTimeoutMillis: 2000, query_timeout: 2000 });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,pg_postmaster_start_time()::text AS started',
    );
    if (result.rows.length !== 1 || result.rows[0].database !== database)
      throw new Error('Owned database identity did not match');
    return createHash('sha256').update(JSON.stringify(result.rows[0])).digest('hex');
  } catch (error) {
    throw new BlockedError(`无法独立核验消息窗口数据库身份：${redact(String(error))}`);
  } finally { await client.end().catch(() => {}); }
}

function interval(value: Interval): void {
  if (!value.every(Number.isFinite) || value[0] > value[1]) throw new BlockedError('独立计时间区间无效');
}
export function verifyReceiptClock(event: MessageWindowEvent, delivery: Interval): void {
  interval(delivery);
  const observed = Date.parse(event.observedAt);
  if (observed + 1 < delivery[0] || observed > delivery[1])
    throw new BlockedError('工程接收时刻与QA独立递送/读回区间不相交，不能作为时间oracle');
}
export function assertDeadline(start: Interval, pending: Interval | undefined, resolved: Interval | undefined, limit: number): void {
  interval(start);
  if (pending) { interval(pending); assert.ok(pending[0] - start[1] <= limit, '确定状态的可信下界已超过原文时限'); }
  if (resolved) { interval(resolved); if (resolved[1] - start[0] <= limit) return; }
  throw new BlockedError('状态确定区间跨原文时限或缺完成上界；不添加时间容差');
}
export function assertReceiptSchedule(receipt: Interval, scheduledAt: string | null, delayMs: number): void {
  interval(receipt);
  if (!instant(scheduledAt)) throw new BlockedError('未取得后步公开排期，无法判断首收时间恢复');
  const lower = Date.parse(scheduledAt), upper = lower + 1;
  assert.ok(upper >= receipt[0] + delayMs && lower <= receipt[1] + delayMs,
    '后步排期确定偏离原首次接收时间区间，不能用重放时刻代替');
  if (lower < receipt[0] + delayMs || upper > receipt[1] + delayMs)
    throw new BlockedError('排期毫秒分辨区间与首次接收边界重叠，无法严格判定');
}

export class MessageLease {
  latest?: MessageSnapshot;
  constructor(readonly id: string, readonly target: CapacityControlTarget, readonly mode: MessageMode,
    readonly correlation: MessageCorrelation, readonly databaseIdentity: string,
    private readonly send: (method: string, suffix?: string) => Promise<unknown>) {}
  accept(value: unknown): MessageSnapshot {
    const next = validateMessageSnapshot(value, this.target, this.id, this.mode, this.correlation, this.databaseIdentity);
    if (this.latest && (next.expiresAt !== this.latest.expiresAt ||
        (this.latest.state === 'released' && next.state !== 'released') ||
        (this.latest.state === 'held' && next.state === 'armed') ||
        next.events.length < this.latest.events.length ||
        this.latest.events.some((event, index) => !isDeepStrictEqual(event, next.events[index]))))
      throw new BlockedError('消息窗口租约历史被改写、期限被延长或状态倒退');
    this.latest = next;
    return next;
  }
  async snapshot(): Promise<MessageSnapshot> { return this.accept(await this.send('GET')); }
  async waitHeld(timeoutMs = 10_000): Promise<MessageWindowEvent> {
    const deadline = performance.now() + timeoutMs;
    do {
      const snapshot = await this.snapshot();
      if (snapshot.events.some((event) => event.kind === 'window-unavailable'))
        throw new BlockedError('窗口不可用：既有receipt或工程前提不成立，不能声称命中');
      if (Date.parse(snapshot.expiresAt) <= Date.now() || snapshot.state === 'released')
        throw new BlockedError('消息窗口租约已释放/到期，未取得当前保持证据');
      const event = snapshot.events.find((entry) => entry.kind === 'window-held');
      if (snapshot.state === 'held' && event) return event;
      await new Promise((ok) => setTimeout(ok, 25));
    } while (performance.now() < deadline);
    throw new BlockedError('有限观察未命中真实消息处理窗口；不是产品完成deadline');
  }
  async advance(): Promise<void> {
    if (!this.latest || this.latest.state !== 'held' || Date.parse(this.latest.expiresAt) <= Date.now())
      throw new BlockedError('只能放行本租约仍有效的真实held窗口');
    if (this.accept(await this.send('POST', '/advance')).state !== 'released')
      throw new BlockedError('工程未确认释放消息窗口');
  }
  async release(): Promise<void> {
    if (this.accept(await this.send('DELETE')).state !== 'released') throw new BlockedError('消息窗口定向清理未确认');
  }
}
export class MessageObservation {
  private capabilities = new Set<string>();
  private leases = new Set<MessageLease>();
  constructor(readonly config: MessageConfig, readonly target: CapacityControlTarget,
    readonly databaseIdentity: string, private readonly evidence?: (name: string, value: unknown) => Promise<void>) {
    controlLoopbackUrl(config.url); validateCapacityTarget(target);
    if (!/^[a-f0-9]{64}$/.test(databaseIdentity)) throw new BlockedError('缺少独立数据库身份');
  }
  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${controlLoopbackUrl(this.config.url)}${path}`, {
        method, redirect: 'manual', signal: AbortSignal.timeout(5000),
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch (error) { throw new BlockedError(`消息控制器不可用：${String(error)}`); }
    let value: unknown;
    try { value = await response.json(); } catch { throw new BlockedError('消息控制器未返回JSON'); }
    await this.evidence?.(`message-control-${randomUUID()}`, JSON.parse(redact({ method, path, body, status: response.status, response: value })));
    if (!response.ok) throw new BlockedError(`消息控制器拒绝操作HTTP ${response.status}`);
    return value;
  }
  async verify(mode: MessageMode): Promise<void> {
    const query = new URLSearchParams({ apiUrl: this.target.apiUrl, revision: this.target.revision, pid: String(this.target.pid) });
    const value = await this.request('GET', `/qa/message/v1/capabilities?${query}`);
    if (!record(value) || value.protocol !== MESSAGE_PROTOCOL || !Array.isArray(value.capabilities) || !value.capabilities.includes(mode))
      throw new BlockedError(`工程未交付消息窗口能力 ${mode}`);
    binding(value.binding, this.target);
    this.capabilities.add(mode);
  }
  async arm(mode: MessageMode, correlation: MessageCorrelation, ttlMs = 90_000): Promise<MessageLease> {
    validateCorrelation(mode, correlation);
    if (!this.capabilities.has(mode)) throw new BlockedError('先验证本实例消息能力再注册窗口');
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 5000 || ttlMs > 120000) throw new BlockedError('消息窗口TTL无效');
    const id = randomUUID(), path = `/qa/message/v1/leases/${id}`;
    const lease = new MessageLease(id, this.target, mode, correlation, this.databaseIdentity,
      (method, suffix = '') => this.request(method, path + suffix));
    this.leases.add(lease);
    lease.accept(await this.request('PUT', path, {
      protocol: MESSAGE_PROTOCOL, target: { apiUrl: this.target.apiUrl, revision: this.target.revision, pid: this.target.pid },
      mode, correlation, ttlMs,
    }));
    if (Date.parse(lease.latest!.expiresAt) <= Date.now() || Date.parse(lease.latest!.expiresAt) > Date.now() + ttlMs)
      throw new BlockedError('工程消息租约到期时间超出本次上限');
    return lease;
  }
  async close(): Promise<void> {
    const results = await Promise.allSettled([...this.leases].map((lease) => lease.release()));
    const errors = results.filter((result) => result.status === 'rejected');
    if (errors.length) throw new BlockedError('消息窗口清理未全部确认；保留原失败与租约证据');
  }
}
export async function messageObservationFor(host: {
  config: unknown; capacityControlTarget(): CapacityControlTarget;
  ownedStorage(): OwnedMessageStorage;
  evidence(name: string, value: unknown): Promise<void>;
}): Promise<MessageObservation> {
  const config = readMessageConfig(host.config);
  return new MessageObservation(config, host.capacityControlTarget(), await ownedMessageDatabaseIdentity(host),
    (name, value) => host.evidence(name, value));
}
