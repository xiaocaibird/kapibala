# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/recovery.spec.ts >> [REC-003] database write outage loses no event and produces inconsistency notice
- Location: tests/system/recovery.spec.ts:78:1

# Error details

```
Error: Condition not reached: public API predicate; last=[{"type":"auth","success":true}]
```

# Test source

```ts
  3   | import { randomUUID } from 'node:crypto';
  4   | import { redact } from './security.js';
  5   | 
  6   | export type HttpRecorder = (entry: Record<string, unknown>) => Promise<void>;
  7   | 
  8   | /** Black-box client: only the API contract in original-interview-question.md §2.3. */
  9   | export type AccountStatus =
  10  |   'idle' | 'online' | 'rate_limited' | 'disconnected' | 'suspended' | 'session_expired';
  11  | export interface Account {
  12  |   id: string;
  13  |   status: AccountStatus;
  14  |   platformUserId: string | null;
  15  |   rateLimitedUntil: string | null;
  16  | }
  17  | export interface Group {
  18  |   id: string;
  19  |   gatewayGroupId: string;
  20  |   status: 'active' | 'unreachable' | 'left';
  21  |   creatorAccountId: string;
  22  |   agentEnabled: boolean;
  23  |   autoKickEnabled: boolean;
  24  |   members: {
  25  |     accountId?: string | null;
  26  |     platformUserId: string;
  27  |     role: 'creator' | 'admin' | 'member';
  28  |   }[];
  29  |   activeAgentRunId: string | null;
  30  |   activeSequenceRunId: string | null;
  31  | }
  32  | export interface Message {
  33  |   msgId: string | null;
  34  |   clientMsgId: string | null;
  35  |   senderPlatformUserId: string;
  36  |   isOwn: boolean;
  37  |   text: string;
  38  |   sentAt: string;
  39  |   deliveryStatus: 'queued' | 'accepted' | 'sent' | 'failed' | 'unknown' | 'cancelled';
  40  |   failCode: string | null;
  41  | }
  42  | export interface AgentStep {
  43  |   kind: 'tool_use' | 'protocol_error' | 'final';
  44  |   toolUseId: string | null;
  45  |   name: string | null;
  46  |   input: Record<string, unknown> | null;
  47  |   resultSummary: string;
  48  |   isError: boolean;
  49  |   errorCode: string | null;
  50  |   auditVerdict: string | null;
  51  |   rawResponse: string | null;
  52  | }
  53  | export interface AgentRun {
  54  |   id: string;
  55  |   groupId: string;
  56  |   status: 'running' | 'finished' | 'failed' | 'blocked' | 'cancelled';
  57  |   endReason: string | null;
  58  |   summary: string | null;
  59  |   steps: AgentStep[];
  60  | }
  61  | export interface SequenceRun {
  62  |   status: 'running' | 'finished' | 'failed' | 'stopped';
  63  |   currentStepIndex: number;
  64  |   steps: {
  65  |     index: number;
  66  |     status: 'pending' | 'accepted' | 'sent' | 'skipped' | 'failed';
  67  |     scheduledAt: string | null;
  68  |     sentAt: string | null;
  69  |     clientMsgId: string | null;
  70  |     resolvedVars: Record<string, string>;
  71  |     varSources: Record<string, string>;
  72  |   }[];
  73  | }
  74  | export interface Job {
  75  |   status: 'running' | 'finished' | 'failed';
  76  |   errors: { step: string; code: string }[];
  77  | }
  78  | export interface ApiError {
  79  |   error: { code: string; message: string; requestId: string; [key: string]: unknown };
  80  | }
  81  | export interface ApiResult<T> {
  82  |   status: number;
  83  |   body: T;
  84  |   headers: Headers;
  85  | }
  86  | export interface RequestOptions {
  87  |   token?: string | null;
  88  |   cookie?: string | null;
  89  |   timeoutMs?: number;
  90  | }
  91  | export async function eventually<T>(
  92  |   read: () => Promise<T>,
  93  |   predicate: (value: T) => boolean,
  94  |   options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
  95  | ): Promise<T> {
  96  |   const deadline = performance.now() + (options.timeoutMs ?? 15_000);
  97  |   let last: T | undefined;
  98  |   do {
  99  |     last = await read();
  100 |     if (predicate(last)) return last;
  101 |     await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 50));
  102 |   } while (performance.now() < deadline);
> 103 |   throw new Error(
      |         ^ Error: Condition not reached: public API predicate; last=[{"type":"auth","success":true}]
  104 |     `Condition not reached: ${options.description ?? 'public API predicate'}; last=${JSON.stringify(last)}`,
  105 |   );
  106 | }
  107 | export class PlatformClient {
  108 |   token: string | undefined;
  109 |   cookie: string | undefined;
  110 |   readonly timeoutMs: number;
  111 |   readonly recorder?: HttpRecorder;
  112 |   constructor(
  113 |     readonly baseUrl: string,
  114 |     options: { token?: string; cookie?: string; timeoutMs?: number; recorder?: HttpRecorder } = {},
  115 |   ) {
  116 |     const url = new URL(baseUrl);
  117 |     if (
  118 |       url.protocol !== 'http:' ||
  119 |       url.hostname !== '127.0.0.1' ||
  120 |       !url.port ||
  121 |       url.username ||
  122 |       url.password
  123 |     )
  124 |       throw new Error('PlatformClient only permits an explicit loopback QA endpoint');
  125 |     this.token = options.token;
  126 |     this.cookie = options.cookie;
  127 |     this.timeoutMs = options.timeoutMs ?? 20_000;
  128 |     this.recorder = options.recorder;
  129 |   }
  130 |   async request<T = unknown>(
  131 |     method: string,
  132 |     path: string,
  133 |     body?: unknown,
  134 |     options: RequestOptions = {},
  135 |   ): Promise<ApiResult<T>> {
  136 |     const headers: Record<string, string> = { accept: 'application/json' };
  137 |     const token = options.token === undefined ? this.token : options.token;
  138 |     const cookie = options.cookie === undefined ? this.cookie : options.cookie;
  139 |     if (token) headers.authorization = `Bearer ${token}`;
  140 |     if (cookie) headers.cookie = cookie;
  141 |     if (body !== undefined) headers['content-type'] = 'application/json';
  142 |     const url = new URL(path, this.baseUrl);
  143 |     if (
  144 |       url.origin !== new URL(this.baseUrl).origin ||
  145 |       !path.startsWith('/') ||
  146 |       path.startsWith('//') ||
  147 |       path.includes('\\')
  148 |     )
  149 |       throw new Error('拒绝跨origin或非相对API路径');
  150 |     const qaRequestId = randomUUID(),
  151 |       startedAt = new Date().toISOString(),
  152 |       started = performance.now();
  153 |     const record = async (fields: Record<string, unknown>) =>
  154 |       this.recorder?.(
  155 |         JSON.parse(
  156 |           redact({
  157 |             qaRequestId,
  158 |             startedAt,
  159 |             durationMs: performance.now() - started,
  160 |             method,
  161 |             url: url.href,
  162 |             requestHeaders: headers,
  163 |             requestBody: body,
  164 |             ...fields,
  165 |           }),
  166 |         ) as Record<string, unknown>,
  167 |       );
  168 |     await record({ phase: 'request' });
  169 |     let response: Response;
  170 |     try {
  171 |       response = await fetch(url, {
  172 |         method,
  173 |         headers,
  174 |         body: body === undefined ? undefined : JSON.stringify(body),
  175 |         signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
  176 |         redirect: 'manual',
  177 |       });
  178 |     } catch (error) {
  179 |       await record({ phase: 'error', error: String(error) });
  180 |       throw error;
  181 |     }
  182 |     let raw: string;
  183 |     try {
  184 |       raw = await response.text();
  185 |     } catch (error) {
  186 |       await record({ phase: 'error', status: response.status, error: String(error) });
  187 |       throw error;
  188 |     }
  189 |     await record({
  190 |       phase: 'response',
  191 |       status: response.status,
  192 |       responseHeaders: Object.fromEntries(response.headers),
  193 |       responseBody: raw,
  194 |     });
  195 |     let value: unknown;
  196 |     try {
  197 |       value = raw ? JSON.parse(raw) : null;
  198 |     } catch {
  199 |       throw new Error(
  200 |         `${method} ${path} returned non-JSON (${response.status}): ${redact(raw.slice(0, 1000))}`,
  201 |       );
  202 |     }
  203 |     return { status: response.status, body: value as T, headers: response.headers };
```