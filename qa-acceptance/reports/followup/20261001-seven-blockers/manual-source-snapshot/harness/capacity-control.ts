import { randomUUID } from 'node:crypto';
import { BlockedError, redact } from './security.js';

export const CAPACITY_PROTOCOL = 'qa-capacity-control/1';
export type CapacityCapability = 'admission-hold' | 'before-ready-window' | 'active-clock';
export interface CapacityControlConfig {
  url: string;
  contractReference: string;
}
export interface CapacityControlTarget {
  apiUrl: string;
  revision: string;
  pid: number;
  /** Never sent to the control service. Its response must independently observe this token. */
  ownerToken: string;
}
export interface CapacityCorrelation {
  groupId: string;
  runId: string;
  toolUseId: string;
}
export interface CapacityEvent extends CapacityCorrelation {
  seq: number;
  at: string;
  kind:
    | 'capacity-held'
    | 'admission-refused'
    | 'before-ready-held'
    | 'ready-persisted'
    | 'run-terminal';
  attemptId?: string;
  reason?: 'capacity' | 'entity';
  callbackEntered?: boolean;
  remoteRequestCount?: number;
  /** Bounds from the original run active clock, never the controller request start. */
  activeElapsedMs?: [number, number];
  status?: string;
  endReason?: string;
}
export interface CapacitySnapshot {
  protocol: typeof CAPACITY_PROTOCOL;
  leaseId: string;
  state: 'held' | 'released';
  expiresAt: string;
  binding: { apiUrl: string; revision: string; pid: number; observedOwnerToken: string };
  correlation: CapacityCorrelation;
  events: CapacityEvent[];
}
type Recorder = (name: string, value: unknown) => Promise<void>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function controlLoopbackUrl(value: unknown): string {
  if (typeof value !== 'string') throw new BlockedError('容量控制 URL 未配置');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BlockedError('容量控制 URL 无效');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new BlockedError('容量控制只接受显式 http://127.0.0.1:<port> origin');
  return url.origin;
}
export function readCapacityControlConfig(config: unknown): CapacityControlConfig {
  const adapters = isRecord(config) && isRecord(config.adapters) ? config.adapters : undefined;
  const value =
    adapters && isRecord(adapters.capacityControl) ? adapters.capacityControl : undefined;
  if (!value || !nonempty(value.contractReference))
    throw new BlockedError(
      '容量脚本已准备，但外部控制器尚未接入：配置 adapters.capacityControl.url/contractReference；见 contracts/capacity-observation.md',
    );
  return { url: controlLoopbackUrl(value.url), contractReference: value.contractReference };
}
export function validateCapacityTarget(target: CapacityControlTarget): void {
  controlLoopbackUrl(target.apiUrl);
  if (
    !/^[a-f0-9]{40}$/.test(target.revision) ||
    !Number.isSafeInteger(target.pid) ||
    target.pid <= 0 ||
    !/^[a-f0-9-]{36}$/.test(target.ownerToken)
  )
    throw new BlockedError('容量控制缺少当前用例进程的可信归属信息');
}
function validateBinding(value: unknown, target: CapacityControlTarget): void {
  if (
    !isRecord(value) ||
    value.apiUrl !== target.apiUrl ||
    value.revision !== target.revision ||
    value.pid !== target.pid ||
    value.observedOwnerToken !== target.ownerToken
  )
    throw new BlockedError('容量控制响应未证明绑定当前用例专属进程；禁止操作其他本机服务');
}
function sameCorrelation(value: unknown, expected: CapacityCorrelation): boolean {
  return (
    isRecord(value) &&
    value.groupId === expected.groupId &&
    value.runId === expected.runId &&
    value.toolUseId === expected.toolUseId
  );
}

export function validateCapacitySnapshot(
  value: unknown,
  target: CapacityControlTarget,
  leaseId: string,
  correlation: CapacityCorrelation,
): CapacitySnapshot {
  if (
    !isRecord(value) ||
    value.protocol !== CAPACITY_PROTOCOL ||
    value.leaseId !== leaseId ||
    !['held', 'released'].includes(String(value.state)) ||
    !sameCorrelation(value.correlation, correlation) ||
    !Array.isArray(value.events) ||
    !Number.isFinite(Date.parse(String(value.expiresAt)))
  )
    throw new BlockedError('容量控制器返回无效、跨租约或跨运行的快照');
  validateBinding(value.binding, target);
  let previous = 0;
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      !sameCorrelation(event, correlation) ||
      !Number.isSafeInteger(event.seq) ||
      Number(event.seq) <= previous ||
      !Number.isFinite(Date.parse(String(event.at))) ||
      ![
        'capacity-held',
        'admission-refused',
        'before-ready-held',
        'ready-persisted',
        'run-terminal',
      ].includes(String(event.kind))
    )
      throw new BlockedError('容量诊断事件格式、关联或单调顺序无效');
    previous = Number(event.seq);
    if (event.kind === 'admission-refused' || event.kind === 'before-ready-held') {
      if (
        !nonempty(event.attemptId) ||
        event.reason !== 'capacity' ||
        event.callbackEntered !== false ||
        event.remoteRequestCount !== 0
      )
        throw new BlockedError('没有确证零远端的容量拒绝；实体冲突或未知派发不能替代');
    }
    if (
      event.kind === 'before-ready-held' &&
      !value.events.some(
        (prior: unknown) =>
          isRecord(prior) &&
          prior.kind === 'admission-refused' &&
          prior.attemptId === event.attemptId &&
          Number(prior.seq) < Number(event.seq),
      )
    )
      throw new BlockedError('before-ready窗口没有关联到先前同一次实际容量拒绝');
    if (event.kind === 'ready-persisted' && !nonempty(event.attemptId))
      throw new BlockedError('ready提交事件缺少关联尝试身份');
    if (event.activeElapsedMs !== undefined) {
      const bounds = event.activeElapsedMs;
      if (
        !Array.isArray(bounds) ||
        bounds.length !== 2 ||
        !bounds.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) ||
        bounds[0] > bounds[1]
      )
        throw new BlockedError('原 run 活动计时区间无效');
    }
  }
  return value as unknown as CapacitySnapshot;
}

/** Talks only to an explicitly configured external controller; never imports SUT code or reads SQL. */
export class CapacityControl {
  private verified = false;
  private capabilities = new Set<string>();
  private readonly leases = new Set<CapacityLease>();
  constructor(
    readonly config: CapacityControlConfig,
    readonly target: CapacityControlTarget,
    private readonly record?: Recorder,
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
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new BlockedError(`容量控制器不可用，尚不能验证该故障分支：${String(error)}`);
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new BlockedError('容量控制器未返回有效 JSON');
    }
    await this.record?.(`capacity-http-${randomUUID()}`, {
      method,
      path,
      request: body,
      status: response.status,
      response: JSON.parse(redact(value)),
    });
    if (!response.ok) throw new BlockedError(`容量控制器拒绝操作 HTTP ${response.status}`);
    return value;
  }
  async verify(required: CapacityCapability[] = ['admission-hold']): Promise<void> {
    const query = new URLSearchParams({
      apiUrl: this.target.apiUrl,
      revision: this.target.revision,
      pid: String(this.target.pid),
    });
    const value = await this.request('GET', `/qa/capacity/v1/capabilities?${query}`);
    if (
      !isRecord(value) ||
      value.protocol !== CAPACITY_PROTOCOL ||
      !Array.isArray(value.capabilities) ||
      !required.every((capability) => (value.capabilities as unknown[]).includes(capability))
    )
      throw new BlockedError(`工程容量控制器尚未实现所需能力：${required.join(', ')}`);
    validateBinding(value.binding, this.target);
    this.capabilities = new Set(value.capabilities as string[]);
    this.verified = true;
    await this.record?.('capacity-binding-verified', {
      apiUrl: this.target.apiUrl,
      revision: this.target.revision,
      pid: this.target.pid,
      ownershipVerified: true,
      contractReference: this.config.contractReference,
      capabilities: [...this.capabilities],
    });
  }
  async hold(
    correlation: CapacityCorrelation,
    options: { beforeReady?: boolean; ttlMs?: number } = {},
  ): Promise<CapacityLease> {
    if (!this.verified) throw new BlockedError('必须先验证控制器归属再创建容量故障租约');
    if (options.beforeReady && !this.capabilities.has('before-ready-window'))
      throw new BlockedError('控制器未声明精确before-ready窗口能力，禁止创建该故障');
    if (!Object.values(correlation).every(nonempty)) throw new Error('容量故障关联字段不能为空');
    const ttlMs = options.ttlMs ?? 90_000;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 5_000 || ttlMs > 120_000)
      throw new Error('容量故障 TTL 超出 QA 控制范围');
    const leaseId = randomUUID();
    const path = `/qa/capacity/v1/leases/${leaseId}`;
    const lease = new CapacityLease(
      leaseId,
      this.target,
      correlation,
      async (method, suffix, body) => this.request(method, path + suffix, body),
    );
    // Register before mutation. Even a lost create response has a known, locally owned lease ID.
    this.leases.add(lease);
    const value = await this.request('PUT', path, {
      protocol: CAPACITY_PROTOCOL,
      target: { apiUrl: this.target.apiUrl, revision: this.target.revision, pid: this.target.pid },
      correlation,
      mode: options.beforeReady ? 'hold-after-refusal-before-ready' : 'hold-admission-capacity',
      ttlMs,
    });
    lease.accept(value);
    const expiry = Date.parse(lease.latest!.expiresAt);
    if (expiry <= Date.now() || expiry > Date.now() + ttlMs)
      throw new BlockedError('容量控制器未提供符合本轮上限的有效自动释放期限');
    if (
      lease.latest!.state !== 'held' ||
      !lease.latest!.events.some((event) => event.kind === 'capacity-held')
    )
      throw new BlockedError('控制器未证明实际容量占用已建立；仅armed或模拟错误不算触发');
    return lease;
  }
  async close(): Promise<void> {
    const results = await Promise.allSettled([...this.leases].map((lease) => lease.release()));
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length)
      throw new BlockedError(
        `容量故障租约清理未全部确认；TTL仍须自动释放：${errors.map(String).join('; ')}`,
      );
  }
}

export class CapacityLease {
  latest?: CapacitySnapshot;
  private released = false;
  constructor(
    readonly id: string,
    private readonly target: CapacityControlTarget,
    readonly correlation: CapacityCorrelation,
    private readonly send: (method: string, suffix: string, body?: unknown) => Promise<unknown>,
  ) {}
  accept(value: unknown): CapacitySnapshot {
    const snapshot = validateCapacitySnapshot(value, this.target, this.id, this.correlation);
    if (this.latest) {
      if (snapshot.expiresAt !== this.latest.expiresAt)
        throw new BlockedError('容量租约期限不可被轮询偷偷延长或改写');
      if (this.latest.state === 'released' && snapshot.state !== 'released')
        throw new BlockedError('已释放容量租约不得重新变为held');
      if (
        snapshot.events.length < this.latest.events.length ||
        this.latest.events.some(
          (event, index) => JSON.stringify(event) !== JSON.stringify(snapshot.events[index]),
        )
      )
        throw new BlockedError('容量证据历史被修改或倒退');
    }
    this.latest = snapshot;
    return snapshot;
  }
  async snapshot(): Promise<CapacitySnapshot> {
    return this.accept(await this.send('GET', ''));
  }
  async waitFor(
    predicate: (snapshot: CapacitySnapshot) => boolean,
    options: { timeoutMs?: number; inspect?: (snapshot: CapacitySnapshot) => Promise<void> } = {},
  ): Promise<CapacitySnapshot> {
    const deadline = performance.now() + (options.timeoutMs ?? 10_000);
    do {
      const snapshot = await this.snapshot();
      await options.inspect?.(snapshot);
      if (snapshot.state === 'released' || Date.parse(snapshot.expiresAt) <= Date.now())
        throw new BlockedError('容量控制已释放/租约到期，未建立指定故障窗口');
      if (predicate(snapshot)) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (performance.now() < deadline);
    throw new BlockedError('观察期未取得指定容量事件；不能把未触发分支判PASS');
  }
  async release(): Promise<void> {
    if (this.released) return;
    const snapshot = this.accept(await this.send('DELETE', ''));
    if (snapshot.state !== 'released') throw new Error('控制器未确认释放本轮容量租约');
    this.released = true;
  }
}

export function capacityControlFor(host: {
  config: unknown;
  capacityControlTarget?: () => CapacityControlTarget;
  evidence: Recorder;
}): CapacityControl {
  const config = readCapacityControlConfig(host.config);
  if (!host.capacityControlTarget)
    throw new BlockedError('容量脚本已准备，但夹具尚未提供当前进程归属证明接口');
  return new CapacityControl(config, host.capacityControlTarget(), (name, value) =>
    host.evidence(name, value),
  );
}
