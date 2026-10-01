# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/recovery.spec.ts >> [REC-007] agent restart after kick effect uses membership reconciliation without repeating kick
- Location: tests/system/recovery.spec.ts:407:1

# Error details

```
Error: Condition not reached: /api/agent-runs/2e0c1137-516f-449d-901b-fbfa255a2b20; last={"id":"2e0c1137-516f-449d-901b-fbfa255a2b20","groupId":"08401deb-2846-42e2-a76c-91266a4ca998","status":"running","endReason":null,"summary":null,"recoveryNote":"A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.","steps":[{"ordinal":1,"kind":"tool_use","toolUseId":"recover-kick","name":"kick_user","input":{"reason":"recovery","platform_user_id":"recover-kick-target"},"resultSummary":"","isError":false,"errorCode":null,"auditVerdict":"pass","rawResponse":"{\"stop_reason\":\"tool_use\",\"content\":[{\"type\":\"tool_use\",\"id\":\"recover-kick\",\"name\":\"kick_user\",\"input\":{\"platform_user_id\":\"recover-kick-target\",\"reason\":\"recovery\"}}]}"}]}
```

# Test source

```ts
  6   | 
  7   | export type HttpRecorder = (entry: Record<string, unknown>) => Promise<void>;
  8   | 
  9   | /** Black-box client: only the API contract in original-interview-question.md §2.3. */
  10  | export type AccountStatus =
  11  |   'idle' | 'online' | 'rate_limited' | 'disconnected' | 'suspended' | 'session_expired';
  12  | export interface Account {
  13  |   id: string;
  14  |   status: AccountStatus;
  15  |   platformUserId: string | null;
  16  |   rateLimitedUntil: string | null;
  17  | }
  18  | export interface Group {
  19  |   id: string;
  20  |   gatewayGroupId: string;
  21  |   status: 'active' | 'unreachable' | 'left';
  22  |   creatorAccountId: string;
  23  |   agentEnabled: boolean;
  24  |   autoKickEnabled: boolean;
  25  |   members: {
  26  |     accountId?: string | null;
  27  |     platformUserId: string;
  28  |     role: 'creator' | 'admin' | 'member';
  29  |   }[];
  30  |   activeAgentRunId: string | null;
  31  |   activeSequenceRunId: string | null;
  32  | }
  33  | export interface Message {
  34  |   msgId: string | null;
  35  |   clientMsgId: string | null;
  36  |   senderPlatformUserId: string;
  37  |   isOwn: boolean;
  38  |   text: string;
  39  |   sentAt: string;
  40  |   deliveryStatus: 'queued' | 'accepted' | 'sent' | 'failed' | 'unknown' | 'cancelled';
  41  |   failCode: string | null;
  42  | }
  43  | export interface AgentStep {
  44  |   kind: 'tool_use' | 'protocol_error' | 'final';
  45  |   toolUseId: string | null;
  46  |   name: string | null;
  47  |   input: Record<string, unknown> | null;
  48  |   resultSummary: string;
  49  |   isError: boolean;
  50  |   errorCode: string | null;
  51  |   auditVerdict: string | null;
  52  |   rawResponse: string | null;
  53  | }
  54  | export interface AgentRun {
  55  |   id: string;
  56  |   groupId: string;
  57  |   status: 'running' | 'finished' | 'failed' | 'blocked' | 'cancelled';
  58  |   endReason: string | null;
  59  |   summary: string | null;
  60  |   steps: AgentStep[];
  61  | }
  62  | export interface SequenceRun {
  63  |   status: 'running' | 'finished' | 'failed' | 'stopped';
  64  |   currentStepIndex: number;
  65  |   steps: {
  66  |     index: number;
  67  |     status: 'pending' | 'accepted' | 'sent' | 'skipped' | 'failed';
  68  |     scheduledAt: string | null;
  69  |     sentAt: string | null;
  70  |     clientMsgId: string | null;
  71  |     resolvedVars: Record<string, string>;
  72  |     varSources: Record<string, string>;
  73  |   }[];
  74  | }
  75  | export interface Job {
  76  |   status: 'running' | 'finished' | 'failed';
  77  |   errors: { step: string; code: string }[];
  78  |   /** Optional public observation; errors make status failed even while work continues. */
  79  |   processing?: boolean;
  80  | }
  81  | export interface ApiError {
  82  |   error: { code: string; message: string; requestId: string; [key: string]: unknown };
  83  | }
  84  | export interface ApiResult<T> {
  85  |   status: number;
  86  |   body: T;
  87  |   headers: Headers;
  88  | }
  89  | export interface RequestOptions {
  90  |   token?: string | null;
  91  |   cookie?: string | null;
  92  |   timeoutMs?: number;
  93  | }
  94  | export async function eventually<T>(
  95  |   read: () => Promise<T>,
  96  |   predicate: (value: T) => boolean,
  97  |   options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
  98  | ): Promise<T> {
  99  |   const deadline = performance.now() + (options.timeoutMs ?? 15_000);
  100 |   let last: T | undefined;
  101 |   do {
  102 |     last = await read();
  103 |     if (predicate(last)) return last;
  104 |     await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 50));
  105 |   } while (performance.now() < deadline);
> 106 |   throw new Error(
      |         ^ Error: Condition not reached: /api/agent-runs/2e0c1137-516f-449d-901b-fbfa255a2b20; last={"id":"2e0c1137-516f-449d-901b-fbfa255a2b20","groupId":"08401deb-2846-42e2-a76c-91266a4ca998","status":"running","endReason":null,"summary":null,"recoveryNote":"A kick was dispatched before interruption; membership changes cannot prove whether replay is safe.","steps":[{"ordinal":1,"kind":"tool_use","toolUseId":"recover-kick","name":"kick_user","input":{"reason":"recovery","platform_user_id":"recover-kick-target"},"resultSummary":"","isError":false,"errorCode":null,"auditVerdict":"pass","rawResponse":"{\"stop_reason\":\"tool_use\",\"content\":[{\"type\":\"tool_use\",\"id\":\"recover-kick\",\"name\":\"kick_user\",\"input\":{\"platform_user_id\":\"recover-kick-target\",\"reason\":\"recovery\"}}]}"}]}
  107 |     `Condition not reached: ${options.description ?? 'public API predicate'}; last=${JSON.stringify(last)}`,
  108 |   );
  109 | }
  110 | export class PlatformClient {
  111 |   token: string | undefined;
  112 |   cookie: string | undefined;
  113 |   readonly timeoutMs: number;
  114 |   readonly recorder?: HttpRecorder;
  115 |   constructor(
  116 |     readonly baseUrl: string,
  117 |     options: { token?: string; cookie?: string; timeoutMs?: number; recorder?: HttpRecorder } = {},
  118 |   ) {
  119 |     const url = new URL(baseUrl);
  120 |     if (
  121 |       url.protocol !== 'http:' ||
  122 |       url.hostname !== '127.0.0.1' ||
  123 |       !url.port ||
  124 |       url.username ||
  125 |       url.password
  126 |     )
  127 |       throw new Error('PlatformClient only permits an explicit loopback QA endpoint');
  128 |     this.token = options.token;
  129 |     this.cookie = options.cookie;
  130 |     this.timeoutMs = options.timeoutMs ?? 20_000;
  131 |     this.recorder = options.recorder;
  132 |   }
  133 |   async request<T = unknown>(
  134 |     method: string,
  135 |     path: string,
  136 |     body?: unknown,
  137 |     options: RequestOptions = {},
  138 |   ): Promise<ApiResult<T>> {
  139 |     const headers: Record<string, string> = { accept: 'application/json' };
  140 |     const token = options.token === undefined ? this.token : options.token;
  141 |     const cookie = options.cookie === undefined ? this.cookie : options.cookie;
  142 |     if (token) headers.authorization = `Bearer ${token}`;
  143 |     if (cookie) headers.cookie = cookie;
  144 |     if (body !== undefined) headers['content-type'] = 'application/json';
  145 |     const url = new URL(path, this.baseUrl);
  146 |     if (
  147 |       url.origin !== new URL(this.baseUrl).origin ||
  148 |       !path.startsWith('/') ||
  149 |       path.startsWith('//') ||
  150 |       path.includes('\\')
  151 |     )
  152 |       throw new Error('拒绝跨origin或非相对API路径');
  153 |     const qaRequestId = randomUUID(),
  154 |       startedAt = new Date().toISOString(),
  155 |       started = performance.now();
  156 |     const record = async (fields: Record<string, unknown>) =>
  157 |       this.recorder?.(
  158 |         JSON.parse(
  159 |           redact({
  160 |             qaRequestId,
  161 |             startedAt,
  162 |             durationMs: performance.now() - started,
  163 |             method,
  164 |             url: url.href,
  165 |             requestHeaders: headers,
  166 |             requestBody: body,
  167 |             ...fields,
  168 |           }),
  169 |         ) as Record<string, unknown>,
  170 |       );
  171 |     await record({ phase: 'request' });
  172 |     let response: Response;
  173 |     try {
  174 |       response = await fetch(url, {
  175 |         method,
  176 |         headers,
  177 |         body: body === undefined ? undefined : JSON.stringify(body),
  178 |         signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
  179 |         redirect: 'manual',
  180 |       });
  181 |     } catch (error) {
  182 |       await record({ phase: 'error', error: String(error) });
  183 |       throw error;
  184 |     }
  185 |     let raw: string;
  186 |     try {
  187 |       raw = await response.text();
  188 |     } catch (error) {
  189 |       await record({ phase: 'error', status: response.status, error: String(error) });
  190 |       throw error;
  191 |     }
  192 |     await record({
  193 |       phase: 'response',
  194 |       status: response.status,
  195 |       responseHeaders: Object.fromEntries(response.headers),
  196 |       responseBody: raw,
  197 |     });
  198 |     let value: unknown;
  199 |     try {
  200 |       value = raw ? JSON.parse(raw) : null;
  201 |     } catch {
  202 |       throw new Error(
  203 |         `${method} ${path} returned non-JSON (${response.status}): ${redact(raw.slice(0, 1000))}`,
  204 |       );
  205 |     }
  206 |     return { status: response.status, body: value as T, headers: response.headers };
```