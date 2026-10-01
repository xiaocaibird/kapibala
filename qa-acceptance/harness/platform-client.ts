import { BlockedError } from './security.js';

import { randomUUID } from 'node:crypto';
import { redact } from './security.js';
import { observe } from './observation.js';

export type HttpRecorder = (entry: Record<string, unknown>) => Promise<void>;

/** Black-box client: only the API contract in original-interview-question.md §2.3. */
export type AccountStatus =
  'idle' | 'online' | 'rate_limited' | 'disconnected' | 'suspended' | 'session_expired';
export interface Account {
  id: string;
  status: AccountStatus;
  platformUserId: string | null;
  rateLimitedUntil: string | null;
}
export interface Group {
  id: string;
  gatewayGroupId: string;
  status: 'active' | 'unreachable' | 'left';
  creatorAccountId: string;
  agentEnabled: boolean;
  autoKickEnabled: boolean;
  members: {
    accountId?: string | null;
    platformUserId: string;
    role: 'creator' | 'admin' | 'member';
  }[];
  activeAgentRunId: string | null;
  activeSequenceRunId: string | null;
}
export interface Message {
  /** C1 public projection; absent on legacy ordinary messages, null when unavailable. */
  localFilePath?: string | null;
  msgId: string | null;
  clientMsgId: string | null;
  senderPlatformUserId: string;
  isOwn: boolean;
  text: string;
  sentAt: string;
  deliveryStatus: 'queued' | 'accepted' | 'sent' | 'failed' | 'unknown' | 'cancelled';
  failCode: string | null;
}
export interface AgentStep {
  kind: 'tool_use' | 'protocol_error' | 'final';
  toolUseId: string | null;
  name: string | null;
  input: Record<string, unknown> | null;
  resultSummary: string;
  isError: boolean;
  errorCode: string | null;
  auditVerdict: string | null;
  rawResponse: string | null;
}
export interface AgentRun {
  id: string;
  groupId: string;
  status: 'running' | 'finished' | 'failed' | 'blocked' | 'cancelled';
  endReason: string | null;
  summary: string | null;
  steps: AgentStep[];
}
export interface SequenceRun {
  status: 'running' | 'finished' | 'failed' | 'stopped';
  currentStepIndex: number;
  steps: {
    index: number;
    status: 'pending' | 'accepted' | 'sent' | 'skipped' | 'failed';
    scheduledAt: string | null;
    sentAt: string | null;
    clientMsgId: string | null;
    resolvedVars: Record<string, string>;
    varSources: Record<string, string>;
  }[];
}
export interface Job {
  status: 'running' | 'finished' | 'failed';
  errors: { step: string; code: string }[];
  /** Optional public observation; errors make status failed even while work continues. */
  processing?: boolean;
}
export interface ApiError {
  error: { code: string; message: string; requestId: string; [key: string]: unknown };
}
export interface ApiResult<T> {
  status: number;
  body: T;
  headers: Headers;
}
export interface RequestOptions {
  token?: string | null;
  cookie?: string | null;
  timeoutMs?: number;
}
export async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<T> {
  const deadline = performance.now() + (options.timeoutMs ?? 15_000);
  let last: T | undefined;
  do {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 50));
  } while (performance.now() < deadline);
  throw new Error(
    `Condition not reached: ${options.description ?? 'public API predicate'}; last=${JSON.stringify(last)}`,
  );
}
export class PlatformClient {
  token: string | undefined;
  cookie: string | undefined;
  readonly timeoutMs: number;
  readonly recorder?: HttpRecorder;
  constructor(
    readonly baseUrl: string,
    options: { token?: string; cookie?: string; timeoutMs?: number; recorder?: HttpRecorder } = {},
  ) {
    const url = new URL(baseUrl);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password
    )
      throw new Error('PlatformClient only permits an explicit loopback QA endpoint');
    this.token = options.token;
    this.cookie = options.cookie;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.recorder = options.recorder;
  }
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = options.token === undefined ? this.token : options.token;
    const cookie = options.cookie === undefined ? this.cookie : options.cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const url = new URL(path, this.baseUrl);
    if (
      url.origin !== new URL(this.baseUrl).origin ||
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\')
    )
      throw new Error('拒绝跨origin或非相对API路径');
    const qaRequestId = randomUUID(),
      startedAt = new Date().toISOString(),
      started = performance.now();
    const record = async (fields: Record<string, unknown>) =>
      this.recorder?.(
        JSON.parse(
          redact({
            qaRequestId,
            startedAt,
            durationMs: performance.now() - started,
            method,
            url: url.href,
            requestHeaders: headers,
            requestBody: body,
            ...fields,
          }),
        ) as Record<string, unknown>,
      );
    await record({ phase: 'request' });
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
        redirect: 'manual',
      });
    } catch (error) {
      await record({ phase: 'error', error: String(error) });
      throw error;
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      await record({ phase: 'error', status: response.status, error: String(error) });
      throw error;
    }
    await record({
      phase: 'response',
      status: response.status,
      responseHeaders: Object.fromEntries(response.headers),
      responseBody: raw,
    });
    let value: unknown;
    try {
      value = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(
        `${method} ${path} returned non-JSON (${response.status}): ${redact(raw.slice(0, 1000))}`,
      );
    }
    return { status: response.status, body: value as T, headers: response.headers };
  }

  get<T = unknown>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, undefined, options);
  }
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, body, options);
  }
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, body, options);
  }
  delete<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('DELETE', path, body, options);
  }
  async login(role: 'admin' | 'viewer' = 'admin'): Promise<this> {
    const result = await this.post<{ accessToken: string }>(
      '/api/auth/login',
      { username: role, password: role },
      { token: null, cookie: null },
    );
    if (result.status !== 200 || typeof result.body.accessToken !== 'string')
      throw new Error(`Cannot authenticate ${role}: ${JSON.stringify(result.body)}`);
    this.token = result.body.accessToken;
    this.cookie = result.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    return this;
  }
  async as(role: 'admin' | 'viewer'): Promise<PlatformClient> {
    return new PlatformClient(this.baseUrl, {
      timeoutMs: this.timeoutMs,
      recorder: this.recorder,
    }).login(role);
  }
  async require<T>(result: Promise<ApiResult<T>>, status?: number): Promise<T> {
    const value = await result;
    if (status === undefined ? value.status < 200 || value.status >= 300 : value.status !== status)
      throw new Error(
        `Expected HTTP ${status ?? '2xx'}, got ${value.status}: ${JSON.stringify(value.body)}`,
      );
    return value.body;
  }
  async waitFor<T>(
    path: string,
    predicate: (value: T) => boolean,
    options: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<T> {
    return eventually(() => this.require(this.get<T>(path)), predicate, {
      ...options,
      description: path,
    });
  }
  accounts() {
    return this.require(this.get<Account[]>('/api/accounts'));
  }
  group(id: string) {
    return this.require(this.get<Group>(`/api/groups/${id}`));
  }
  messages(groupId: string, cursor?: string, limit = 50) {
    return this.require(
      this.get<{ items: Message[]; nextCursor: string | null; snapshotId?: string; snapshotCursor?: string }>(
        `/api/groups/${groupId}/messages?limit=${limit}${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`,
      ),
    );
  }
  async connectAll(): Promise<Account[]> {
    const accounts = await this.accounts();
    for (const account of accounts)
      if (account.status === 'idle' || account.status === 'disconnected')
        await this.require(this.post(`/api/accounts/${account.id}/connect`));
    return this.accounts();
  }
  async createGroup(
    memberCount = 2,
  ): Promise<{ group: Group; accounts: Account[]; jobId: string }> {
    const existingIds = new Set(
      (await this.require(this.get<Group[]>('/api/groups'))).map((group) => group.id),
    );
    const accounts = (await this.connectAll()).filter((account) => account.status === 'online');
    if (accounts.length < memberCount + 1)
      throw new BlockedError(
        `QA prerequisite: seed at least ${memberCount + 1} idle service accounts (found ${accounts.length})`,
      );
    const selected = accounts.slice(0, memberCount + 1);
    const { jobId } = await this.require(
      this.post<{ jobId: string }>('/api/groups', {
        creatorAccountId: selected[0]!.id,
        memberAccountIds: selected.slice(1).map((account) => account.id),
      }),
      202,
    );
    const job = await this.waitJob(jobId);
    if (job.status !== 'finished' || job.errors.length)
      throw new Error(`Fixture group creation failed: ${JSON.stringify(job)}`);
    const groups = await this.require(this.get<Group[]>('/api/groups'));
    const matches = groups.filter(
      (group) =>
        !existingIds.has(group.id) &&
        group.creatorAccountId === selected[0]!.id &&
        group.status === 'active' &&
        selected
          .slice(1)
          .every((account) => group.members.some((member) => member.accountId === account.id)),
    );
    if (matches.length !== 1)
      throw new Error(
        `Fixture requires exactly one newly created matching group, found ${matches.length}`,
      );
    return { group: matches[0]!, accounts: selected, jobId };
  }
  async waitJob(
    id: string,
    options: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<Job> {
    const result = await observe({
      read: () => this.require(this.get<Job>(`/api/jobs/${id}`)),
      invariant: (job) => {
        if (!['running', 'finished', 'failed'].includes(job.status) || !Array.isArray(job.errors))
          throw new Error('Invalid public job response');
        if (job.errors.length && job.status !== 'failed')
          throw new Error('Original §2.3 requires failed status whenever job errors are nonempty');
      },
      complete: (job) => job.status !== 'running' && job.processing !== true,
      durationMs: options.timeoutMs ?? 25_000,
      intervalMs: options.intervalMs,
    });
    if (!result.complete)
      throw new BlockedError(
        `No settled job observation within finite sampling budget: ${JSON.stringify(result.last)}`,
      );
    return result.last;
  }
  send(groupId: string, accountId: string, text: string) {
    return this.require(
      this.post<{ clientMsgId: string }>(`/api/groups/${groupId}/send`, { accountId, text }),
      202,
    );
  }
  agentRun(id: string) {
    return this.require(this.get<AgentRun>(`/api/agent-runs/${id}`));
  }
  sequenceRun(id: string) {
    return this.require(this.get<SequenceRun>(`/api/sequence-runs/${id}`));
  }
}
