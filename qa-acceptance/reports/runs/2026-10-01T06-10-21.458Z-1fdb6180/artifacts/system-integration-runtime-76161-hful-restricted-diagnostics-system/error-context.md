# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/integration-runtime.spec.ts >> [INT-DIAG-002] actual tick failure running hold and recovery have truthful restricted diagnostics
- Location: tests/system/integration-runtime.spec.ts:490:1

# Error details

```
BlockedError: [BLOCKED] 工程runtimeObservation控制器未接入；见contracts/runtime-observation.md
```

# Test source

```ts
  15  |   | 'hold-safe-activity-boundary'
  16  |   | 'account-save-once'
  17  |   | 'account-save-persistent'
  18  |   | 'module-fail-then-hold';
  19  | export type RuntimeCorrelation =
  20  |   | { kind: 'activity'; groupId: string; runId: string; toolUseId: string }
  21  |   | { kind: 'account'; accountId: string; operation: 'connect'; intentId: string }
  22  |   | { kind: 'module'; module: string; attemptLabel: string };
  23  | export type DiagnosticProfile = RuntimeDiagnosticsProfile;
  24  | export interface RuntimeConfig {
  25  |   url: string;
  26  |   contractReference: string;
  27  |   diagnostics?: DiagnosticProfile;
  28  | }
  29  | export interface RuntimeEvent {
  30  |   seq: number;
  31  |   at: string;
  32  |   kind:
  33  |     | 'activity-checkpoint'
  34  |     | 'activity-terminal'
  35  |     | 'activity-safe-held'
  36  |     | 'remote-success'
  37  |     | 'local-save-failed'
  38  |     | 'local-retry-held'
  39  |     | 'newer-account-intent-waiting'
  40  |     | 'local-save-committed'
  41  |     | 'transaction-rolled-back'
  42  |     | 'module-failed'
  43  |     | 'module-before-next-held'
  44  |     | 'module-running-held'
  45  |     | 'module-succeeded';
  46  |   correlation: RuntimeCorrelation;
  47  |   attemptId: string;
  48  |   /** QA guardian/PGID identity, not necessarily the application child PID. */
  49  |   instancePid: number;
  50  |   transactionId?: string;
  51  |   requestId?: string;
  52  |   faultMarker?: string;
  53  |   activeElapsedMs?: [number, number];
  54  |   persistedActiveMs?: number;
  55  |   epochIds?: string[];
  56  |   /** Required for activity evidence; false means lost tail has no proved bound. */
  57  |   includesUnsavedTail?: boolean;
  58  |   /** Process liveness alone cannot establish that this run is accumulating activity. */
  59  |   activityState?: 'active' | 'recovery-paused' | 'terminal' | 'unknown';
  60  |   /** Durable continuation with no external request in flight, before the next dispatch. */
  61  |   stepId?: string;
  62  |   continuationDurable?: boolean;
  63  |   remoteInFlightCount?: number;
  64  |   recoverableInOriginalTransaction?: boolean;
  65  |   commitBoundary?: 'outer-commit-confirmed';
  66  |   tickBoundary?: 'before-activity-and-diagnostics-start';
  67  |   waitingIntent?: {
  68  |     requestId: string;
  69  |     accountId: string;
  70  |     expectedFrom: 'online';
  71  |     to: 'disconnected';
  72  |     waitingForTransactionId: string;
  73  |   };
  74  | }
  75  | export interface RuntimeSnapshot {
  76  |   protocol: typeof RUNTIME_PROTOCOL;
  77  |   leaseId: string;
  78  |   state: 'armed' | 'held' | 'released';
  79  |   expiresAt: string;
  80  |   binding: { apiUrl: string; revision: string; pid: number; observedOwnerToken: string };
  81  |   correlation: RuntimeCorrelation;
  82  |   events: RuntimeEvent[];
  83  | }
  84  | const record = (v: unknown): v is Record<string, unknown> =>
  85  |   !!v && typeof v === 'object' && !Array.isArray(v);
  86  | const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
  87  | const equal = isDeepStrictEqual;
  88  | const kinds = new Set([
  89  |   'activity-checkpoint',
  90  |   'activity-terminal',
  91  |   'activity-safe-held',
  92  |   'remote-success',
  93  |   'local-save-failed',
  94  |   'local-retry-held',
  95  |   'newer-account-intent-waiting',
  96  |   'local-save-committed',
  97  |   'transaction-rolled-back',
  98  |   'module-failed',
  99  |   'module-before-next-held',
  100 |   'module-running-held',
  101 |   'module-succeeded',
  102 | ]);
  103 | const capability = (mode: RuntimeMode) =>
  104 |   mode === 'observe-activity'
  105 |     ? 'activity-witness'
  106 |     : mode === 'hold-safe-activity-boundary'
  107 |       ? 'activity-safe-boundary'
  108 |       : mode.startsWith('account-')
  109 |         ? 'account-local-save'
  110 |         : 'module-tick';
  111 | export function readRuntimeConfig(value: unknown): RuntimeConfig {
  112 |   const adapters = record(value) && record(value.adapters) ? value.adapters : {};
  113 |   const config = adapters.runtimeObservation;
  114 |   if (!record(config) || !text(config.contractReference))
> 115 |     throw new BlockedError(
      |           ^ BlockedError: [BLOCKED] 工程runtimeObservation控制器未接入；见contracts/runtime-observation.md
  116 |       '工程runtimeObservation控制器未接入；见contracts/runtime-observation.md',
  117 |     );
  118 |   return {
  119 |     url: controlLoopbackUrl(config.url),
  120 |     contractReference: config.contractReference,
  121 |     ...(config.diagnostics === undefined
  122 |       ? {}
  123 |       : { diagnostics: validateDiagnosticProfile(config.diagnostics) }),
  124 |   };
  125 | }
  126 | export function validateDiagnosticProfile(value: unknown): DiagnosticProfile {
  127 |   const pointers = [
  128 |     'modulesPointer',
  129 |     'namePointer',
  130 |     'statePointer',
  131 |     'consecutiveFailuresPointer',
  132 |     'lastFailureAtPointer',
  133 |     'lastSuccessAtPointer',
  134 |     'currentDurationMsPointer',
  135 |     'tickCountPointer',
  136 |   ];
  137 |   if (
  138 |     !record(value) ||
  139 |     !text(value.module) ||
  140 |     !pointers.every(
  141 |       (key) =>
  142 |         typeof value[key] === 'string' &&
  143 |         (key === 'modulesPointer' || value[key] !== '') &&
  144 |         /^(?:\/(?:[^~]|~[01])*)*$/.test(value[key] as string),
  145 |     ) ||
  146 |     !record(value.states) ||
  147 |     !['failed', 'running', 'healthy'].every((key) =>
  148 |       text((value.states as Record<string, unknown>)[key]),
  149 |     ) ||
  150 |     new Set(Object.values(value.states)).size !== 3
  151 |   )
  152 |     throw new BlockedError('诊断字段profile未明确或格式非法；不得猜测公开JSON字段');
  153 |   return value as unknown as DiagnosticProfile;
  154 | }
  155 | export function atPointer(value: unknown, pointer: string): unknown {
  156 |   let current = value;
  157 |   for (const segment of pointer.split('/').slice(1)) {
  158 |     const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
  159 |     if ((!record(current) && !Array.isArray(current)) || !Object.hasOwn(current, key))
  160 |       return undefined;
  161 |     current = (current as Record<string, unknown>)[key];
  162 |   }
  163 |   return current;
  164 | }
  165 | export function diagnosticModule(
  166 |   value: unknown,
  167 |   profile: DiagnosticProfile,
  168 | ): Record<string, unknown> {
  169 |   const modules = atPointer(value, profile.modulesPointer);
  170 |   assert.ok(Array.isArray(modules), '诊断模块列表须为数组');
  171 |   const matches = modules.filter(
  172 |     (entry) => atPointer(entry, profile.namePointer) === profile.module,
  173 |   );
  174 |   assert.equal(matches.length, 1, '诊断必须能唯一识别被故障控制的真实模块');
  175 |   assert.ok(record(matches[0]));
  176 |   return matches[0];
  177 | }
  178 | function binding(value: unknown, target: CapacityControlTarget): void {
  179 |   if (
  180 |     !record(value) ||
  181 |     value.apiUrl !== target.apiUrl ||
  182 |     value.revision !== target.revision ||
  183 |     value.pid !== target.pid ||
  184 |     value.observedOwnerToken !== target.ownerToken
  185 |   )
  186 |     throw new BlockedError('运行观测没有绑定当前专属实际SUT进程，禁止故障操作');
  187 | }
  188 | export function validateRuntimeSnapshot(
  189 |   value: unknown,
  190 |   target: CapacityControlTarget,
  191 |   id: string,
  192 |   correlation: RuntimeCorrelation,
  193 | ): RuntimeSnapshot {
  194 |   if (
  195 |     !record(value) ||
  196 |     value.protocol !== RUNTIME_PROTOCOL ||
  197 |     value.leaseId !== id ||
  198 |     !['armed', 'held', 'released'].includes(String(value.state)) ||
  199 |     !equal(value.correlation, correlation) ||
  200 |     !Array.isArray(value.events) ||
  201 |     !Number.isFinite(Date.parse(String(value.expiresAt)))
  202 |   )
  203 |     throw new BlockedError('运行观测跨租约、关联错误或格式无效');
  204 |   binding(value.binding, target);
  205 |   let seq = 0;
  206 |   for (const event of value.events) {
  207 |     if (
  208 |       !record(event) ||
  209 |       !Number.isSafeInteger(event.seq) ||
  210 |       Number(event.seq) <= seq ||
  211 |       !Number.isFinite(Date.parse(String(event.at))) ||
  212 |       Date.parse(String(event.at)) > Date.now() ||
  213 |       !kinds.has(String(event.kind)) ||
  214 |       !text(event.attemptId) ||
  215 |       event.instancePid !== target.pid ||
```