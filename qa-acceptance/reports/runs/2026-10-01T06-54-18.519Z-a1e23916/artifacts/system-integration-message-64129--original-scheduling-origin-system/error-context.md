# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/integration-message-boundaries.spec.ts >> [INT-MSG-007] a single-instance crash before receipt INSERT exposes loss of the original scheduling origin
- Location: tests/system/integration-message-boundaries.spec.ts:269:1

# Error details

```
AssertionError: 后步排期确定偏离原首次接收时间区间，不能用重放时刻代替
```

# Test source

```ts
  45  | const instant = (x: unknown): x is string => text(x) && Number.isFinite(Date.parse(x));
  46  | const boundaries: Record<MessageMode, string> = {
  47  |   'timeout-observed-before-local-save': '504-recognized-local-result-save-not-started',
  48  |   'receipt-before-commit': 'receipt-insert-not-issued',
  49  |   'receipt-committed-before-business': 'receipt-autocommit-confirmed-business-not-started',
  50  | };
  51  | function binding(value: unknown, target: CapacityControlTarget): void {
  52  |   if (!record(value) || value.apiUrl !== target.apiUrl || value.revision !== target.revision ||
  53  |       value.pid !== target.pid || value.observedOwnerToken !== target.ownerToken)
  54  |     throw new BlockedError('消息观测响应未绑定当前QA实例；禁止操作其他进程');
  55  | }
  56  | export function readMessageConfig(value: unknown): MessageConfig {
  57  |   const adapter = record(value) && record(value.adapters) ? value.adapters.messageObservation : undefined;
  58  |   if (!record(adapter) || !text(adapter.contractReference) || /REQUIRED|REPLACE/.test(adapter.contractReference))
  59  |     throw new BlockedError('消息三窗口尚未接入：缺adapters.messageObservation及已确认工程契约');
  60  |   return { url: controlLoopbackUrl(adapter.url), contractReference: adapter.contractReference };
  61  | }
  62  | function validateCorrelation(mode: MessageMode, correlation: MessageCorrelation): void {
  63  |   const keys = mode === 'timeout-observed-before-local-save' ? ['clientMsgId'] : ['clientMsgId', 'msgId', 'eventId'];
  64  |   if (!messageModes.includes(mode) || Object.keys(correlation).length !== keys.length ||
  65  |       keys.some((key) => !text(correlation[key as keyof MessageCorrelation]) || correlation[key as keyof MessageCorrelation]!.length > 200))
  66  |     throw new BlockedError('消息窗口请求须绑定真实clientMsgId和该phase要求的完整事件身份');
  67  | }
  68  | export function validateMessageSnapshot(
  69  |   value: unknown, target: CapacityControlTarget, leaseId: string, mode: MessageMode,
  70  |   correlation: MessageCorrelation, databaseIdentity: string,
  71  | ): MessageSnapshot {
  72  |   validateCorrelation(mode, correlation);
  73  |   if (!record(value) || value.protocol !== MESSAGE_PROTOCOL || value.leaseId !== leaseId ||
  74  |       !['armed', 'held', 'released'].includes(String(value.state)) || !instant(value.expiresAt) ||
  75  |       !isDeepStrictEqual(value.correlation, correlation) || !Array.isArray(value.events))
  76  |     throw new BlockedError('消息窗口快照身份、状态或历史格式无效');
  77  |   binding(value.binding, target);
  78  |   let seq = 0;
  79  |   for (const event of value.events) {
  80  |     if (!record(event) || !Number.isSafeInteger(event.seq) || Number(event.seq) <= seq ||
  81  |         !instant(event.at) || !instant(event.observedAt) || Date.parse(event.at) < Date.parse(event.observedAt) ||
  82  |         !['window-held', 'window-unavailable'].includes(String(event.kind)) || event.phase !== mode ||
  83  |         !text(event.attemptId) || event.attemptId === leaseId || event.instancePid !== target.pid ||
  84  |         event.databaseIdentity !== databaseIdentity || !/^[a-f0-9]{64}$/.test(databaseIdentity) ||
  85  |         event.localBoundary !== boundaries[mode] || typeof event.receiptPresentAtProbe !== 'boolean' ||
  86  |         (event.receiptObservedAt !== null && !instant(event.receiptObservedAt)) ||
  87  |         !record(event.coverage) || event.coverage.scope !== 'bound-instance' || event.coverage.allDatabaseWritersProven !== false ||
  88  |         Object.entries(correlation).some(([key, expected]) => event[key] !== expected))
  89  |       throw new BlockedError('消息窗口缺少真实尝试、独立数据库身份、准确保存阶段或单实例证据');
  90  |     seq = Number(event.seq);
  91  |     if (mode === 'timeout-observed-before-local-save' &&
  92  |         (event.msgId !== undefined || event.eventId !== undefined || event.receiptObservedAt !== null))
  93  |       throw new BlockedError('504窗口混入不属于该请求的receipt身份');
  94  |     if (event.kind === 'window-held' && mode === 'receipt-before-commit' &&
  95  |         (event.receiptPresentAtProbe !== false || event.receiptObservedAt !== null))
  96  |       throw new BlockedError('INSERT前窗口已有接收记录，不能声称未保存');
  97  |     if (event.kind === 'window-held' && mode === 'receipt-committed-before-business' &&
  98  |         (event.receiptPresentAtProbe !== true || !instant(event.receiptObservedAt)))
  99  |       throw new BlockedError('未证明receipt自动提交已确认；SQL发出或历史未知不能替代');
  100 |   }
  101 |   if (value.state === 'held' && !value.events.some((event: MessageWindowEvent) => event.kind === 'window-held'))
  102 |     throw new BlockedError('held状态没有真实命中事件');
  103 |   return value as unknown as MessageSnapshot;
  104 | }
  105 | 
  106 | /** Read infrastructure identity only, through the already QA-owned database. No product tables. */
  107 | export async function ownedMessageDatabaseIdentity(host: {
  108 |   ownedStorage(): OwnedMessageStorage;
  109 | }): Promise<string> {
  110 |   const { database, cluster } = host.ownedStorage();
  111 |   if (!cluster.ownsDatabase(database)) throw new BlockedError('消息窗口数据库不是本用例资源');
  112 |   const client = new Client({ connectionString: cluster.url(database), connectionTimeoutMillis: 2000, query_timeout: 2000 });
  113 |   try {
  114 |     await client.connect();
  115 |     const result = await client.query(
  116 |       'SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,pg_postmaster_start_time()::text AS started',
  117 |     );
  118 |     if (result.rows.length !== 1 || result.rows[0].database !== database)
  119 |       throw new Error('Owned database identity did not match');
  120 |     return createHash('sha256').update(JSON.stringify(result.rows[0])).digest('hex');
  121 |   } catch (error) {
  122 |     throw new BlockedError(`无法独立核验消息窗口数据库身份：${redact(String(error))}`);
  123 |   } finally { await client.end().catch(() => {}); }
  124 | }
  125 | 
  126 | function interval(value: Interval): void {
  127 |   if (!value.every(Number.isFinite) || value[0] > value[1]) throw new BlockedError('独立计时间区间无效');
  128 | }
  129 | export function verifyReceiptClock(event: MessageWindowEvent, delivery: Interval): void {
  130 |   interval(delivery);
  131 |   const observed = Date.parse(event.observedAt);
  132 |   if (observed + 1 < delivery[0] || observed > delivery[1])
  133 |     throw new BlockedError('工程接收时刻与QA独立递送/读回区间不相交，不能作为时间oracle');
  134 | }
  135 | export function assertDeadline(start: Interval, pending: Interval | undefined, resolved: Interval | undefined, limit: number): void {
  136 |   interval(start);
  137 |   if (pending) { interval(pending); assert.ok(pending[0] - start[1] <= limit, '确定状态的可信下界已超过原文时限'); }
  138 |   if (resolved) { interval(resolved); if (resolved[1] - start[0] <= limit) return; }
  139 |   throw new BlockedError('状态确定区间跨原文时限或缺完成上界；不添加时间容差');
  140 | }
  141 | export function assertReceiptSchedule(receipt: Interval, scheduledAt: string | null, delayMs: number): void {
  142 |   interval(receipt);
  143 |   if (!instant(scheduledAt)) throw new BlockedError('未取得后步公开排期，无法判断首收时间恢复');
  144 |   const lower = Date.parse(scheduledAt), upper = lower + 1;
> 145 |   assert.ok(upper >= receipt[0] + delayMs && lower <= receipt[1] + delayMs,
      |          ^ AssertionError: 后步排期确定偏离原首次接收时间区间，不能用重放时刻代替
  146 |     '后步排期确定偏离原首次接收时间区间，不能用重放时刻代替');
  147 |   if (lower < receipt[0] + delayMs || upper > receipt[1] + delayMs)
  148 |     throw new BlockedError('排期毫秒分辨区间与首次接收边界重叠，无法严格判定');
  149 | }
  150 | 
  151 | export class MessageLease {
  152 |   latest?: MessageSnapshot;
  153 |   constructor(readonly id: string, readonly target: CapacityControlTarget, readonly mode: MessageMode,
  154 |     readonly correlation: MessageCorrelation, readonly databaseIdentity: string,
  155 |     private readonly send: (method: string, suffix?: string) => Promise<unknown>) {}
  156 |   accept(value: unknown): MessageSnapshot {
  157 |     const next = validateMessageSnapshot(value, this.target, this.id, this.mode, this.correlation, this.databaseIdentity);
  158 |     if (this.latest && (next.expiresAt !== this.latest.expiresAt ||
  159 |         (this.latest.state === 'released' && next.state !== 'released') ||
  160 |         (this.latest.state === 'held' && next.state === 'armed') ||
  161 |         next.events.length < this.latest.events.length ||
  162 |         this.latest.events.some((event, index) => !isDeepStrictEqual(event, next.events[index]))))
  163 |       throw new BlockedError('消息窗口租约历史被改写、期限被延长或状态倒退');
  164 |     this.latest = next;
  165 |     return next;
  166 |   }
  167 |   async snapshot(): Promise<MessageSnapshot> { return this.accept(await this.send('GET')); }
  168 |   async waitHeld(timeoutMs = 10_000): Promise<MessageWindowEvent> {
  169 |     const deadline = performance.now() + timeoutMs;
  170 |     do {
  171 |       const snapshot = await this.snapshot();
  172 |       if (snapshot.events.some((event) => event.kind === 'window-unavailable'))
  173 |         throw new BlockedError('窗口不可用：既有receipt或工程前提不成立，不能声称命中');
  174 |       if (Date.parse(snapshot.expiresAt) <= Date.now() || snapshot.state === 'released')
  175 |         throw new BlockedError('消息窗口租约已释放/到期，未取得当前保持证据');
  176 |       const event = snapshot.events.find((entry) => entry.kind === 'window-held');
  177 |       if (snapshot.state === 'held' && event) return event;
  178 |       await new Promise((ok) => setTimeout(ok, 25));
  179 |     } while (performance.now() < deadline);
  180 |     throw new BlockedError('有限观察未命中真实消息处理窗口；不是产品完成deadline');
  181 |   }
  182 |   async advance(): Promise<void> {
  183 |     if (!this.latest || this.latest.state !== 'held' || Date.parse(this.latest.expiresAt) <= Date.now())
  184 |       throw new BlockedError('只能放行本租约仍有效的真实held窗口');
  185 |     if (this.accept(await this.send('POST', '/advance')).state !== 'released')
  186 |       throw new BlockedError('工程未确认释放消息窗口');
  187 |   }
  188 |   async release(): Promise<void> {
  189 |     if (this.accept(await this.send('DELETE')).state !== 'released') throw new BlockedError('消息窗口定向清理未确认');
  190 |   }
  191 | }
  192 | export class MessageObservation {
  193 |   private capabilities = new Set<string>();
  194 |   private leases = new Set<MessageLease>();
  195 |   constructor(readonly config: MessageConfig, readonly target: CapacityControlTarget,
  196 |     readonly databaseIdentity: string, private readonly evidence?: (name: string, value: unknown) => Promise<void>) {
  197 |     controlLoopbackUrl(config.url); validateCapacityTarget(target);
  198 |     if (!/^[a-f0-9]{64}$/.test(databaseIdentity)) throw new BlockedError('缺少独立数据库身份');
  199 |   }
  200 |   private async request(method: string, path: string, body?: unknown): Promise<unknown> {
  201 |     let response: Response;
  202 |     try {
  203 |       response = await fetch(`${controlLoopbackUrl(this.config.url)}${path}`, {
  204 |         method, redirect: 'manual', signal: AbortSignal.timeout(5000),
  205 |         ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  206 |       });
  207 |     } catch (error) { throw new BlockedError(`消息控制器不可用：${String(error)}`); }
  208 |     let value: unknown;
  209 |     try { value = await response.json(); } catch { throw new BlockedError('消息控制器未返回JSON'); }
  210 |     await this.evidence?.(`message-control-${randomUUID()}`, JSON.parse(redact({ method, path, body, status: response.status, response: value })));
  211 |     if (!response.ok) throw new BlockedError(`消息控制器拒绝操作HTTP ${response.status}`);
  212 |     return value;
  213 |   }
  214 |   async verify(mode: MessageMode): Promise<void> {
  215 |     const query = new URLSearchParams({ apiUrl: this.target.apiUrl, revision: this.target.revision, pid: String(this.target.pid) });
  216 |     const value = await this.request('GET', `/qa/message/v1/capabilities?${query}`);
  217 |     if (!record(value) || value.protocol !== MESSAGE_PROTOCOL || !Array.isArray(value.capabilities) || !value.capabilities.includes(mode))
  218 |       throw new BlockedError(`工程未交付消息窗口能力 ${mode}`);
  219 |     binding(value.binding, this.target);
  220 |     this.capabilities.add(mode);
  221 |   }
  222 |   async arm(mode: MessageMode, correlation: MessageCorrelation, ttlMs = 90_000): Promise<MessageLease> {
  223 |     validateCorrelation(mode, correlation);
  224 |     if (!this.capabilities.has(mode)) throw new BlockedError('先验证本实例消息能力再注册窗口');
  225 |     if (!Number.isSafeInteger(ttlMs) || ttlMs < 5000 || ttlMs > 120000) throw new BlockedError('消息窗口TTL无效');
  226 |     const id = randomUUID(), path = `/qa/message/v1/leases/${id}`;
  227 |     const lease = new MessageLease(id, this.target, mode, correlation, this.databaseIdentity,
  228 |       (method, suffix = '') => this.request(method, path + suffix));
  229 |     this.leases.add(lease);
  230 |     lease.accept(await this.request('PUT', path, {
  231 |       protocol: MESSAGE_PROTOCOL, target: { apiUrl: this.target.apiUrl, revision: this.target.revision, pid: this.target.pid },
  232 |       mode, correlation, ttlMs,
  233 |     }));
  234 |     if (Date.parse(lease.latest!.expiresAt) <= Date.now() || Date.parse(lease.latest!.expiresAt) > Date.now() + ttlMs)
  235 |       throw new BlockedError('工程消息租约到期时间超出本次上限');
  236 |     return lease;
  237 |   }
  238 |   async close(): Promise<void> {
  239 |     const results = await Promise.allSettled([...this.leases].map((lease) => lease.release()));
  240 |     const errors = results.filter((result) => result.status === 'rejected');
  241 |     if (errors.length) throw new BlockedError('消息窗口清理未全部确认；保留原失败与租约证据');
  242 |   }
  243 | }
  244 | export async function messageObservationFor(host: {
  245 |   config: unknown; capacityControlTarget(): CapacityControlTarget;
```