import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Ajv } from 'ajv';
import { BarrierController, type BarrierSpec } from './barrier.js';
import {
  closeServer,
  listen,
  readBody,
  record,
  respond,
  Tasks,
  waitForValue,
} from './http-server.js';

export interface AgentResponsePlan {
  status?: number;
  body?: unknown;
  rawBody?: string;
  responseDelayMs?: number;
  neverRespond?: boolean;
  barrier?: BarrierSpec;
  runId?: string;
}
export interface AgentRequest {
  id: number;
  at: string;
  path: '/agent/turn' | '/agent/audit';
  body: unknown;
  responseStatus?: number;
  rawResponse?: string;
  completedAt?: string;
}
export interface AgentSnapshot {
  turns: AgentRequest[];
  audits: AgentRequest[];
  sessions: { runId: string; requestIds: number[] }[];
  barriers: ReturnType<BarrierController['snapshot']>;
  backgroundErrors: string[];
}

const inputNames: Record<string, readonly string[]> = {
  get_recent_messages: ['limit'],
  send_message: ['text', 'idempotency_key'],
  kick_user: ['platform_user_id', 'reason'],
  finish: ['summary'],
};

/** Scripted external Agent. Repeated requests are never deduplicated. */
export class AgentSimulator {
  readonly barriers = new BarrierController();
  private server: Server | undefined;
  private controlServer: Server | undefined;
  private readonly tasks = new Tasks();
  private readonly turns: AgentRequest[] = [];
  private readonly audits: AgentRequest[] = [];
  private readonly turnPlans: AgentResponsePlan[] = [];
  private readonly auditPlans: AgentResponsePlan[] = [];
  private readonly sessions = new Map<string, number[]>();
  private readonly ajv = new Ajv({ strict: false, allErrors: true });
  private baseUrl = '';
  private managementUrl = '';
  private nextRequestId = 1;
  private unavailable = false;

  get url(): string {
    if (!this.baseUrl) throw new Error('AgentSimulator has not started');
    return this.baseUrl;
  }
  get controlUrl(): string {
    if (!this.managementUrl) throw new Error('AgentSimulator has not started');
    return this.managementUrl;
  }

  async start(options: { host?: string; port?: number } = {}): Promise<this> {
    if (this.server) return this;
    const service = await listen(
      (request, response) => this.handle(request, response),
      options.host,
      options.port,
    );
    this.server = service.server;
    this.baseUrl = service.url;
    const control = await listen(
      (request, response) => this.control(request, response),
      options.host,
    );
    this.controlServer = control.server;
    this.managementUrl = control.url;
    return this;
  }

  async close(): Promise<void> {
    this.barriers.releaseAll();
    await this.tasks.close();
    await Promise.all([closeServer(this.server), closeServer(this.controlServer)]);
    this.server = undefined;
    this.controlServer = undefined;
  }

  configure(config: { unavailable?: boolean }): void {
    this.unavailable = config.unavailable ?? this.unavailable;
  }
  enqueueTurns(...plans: AgentResponsePlan[]): void {
    this.turnPlans.push(...structuredClone(plans));
  }
  enqueueAudits(...plans: AgentResponsePlan[]): void {
    this.auditPlans.push(...structuredClone(plans));
  }

  snapshot(): AgentSnapshot {
    return structuredClone({
      turns: this.turns,
      audits: this.audits,
      sessions: [...this.sessions].map(([runId, requestIds]) => ({ runId, requestIds })),
      barriers: this.barriers.snapshot(),
      backgroundErrors: this.tasks.errors,
    });
  }

  async waitForRequest(
    predicate: (request: AgentRequest) => boolean,
    timeoutMs = 5_000,
  ): Promise<AgentRequest> {
    return structuredClone(
      await waitForValue(
        () => [...this.turns, ...this.audits].sort((a, b) => a.id - b.id).find(predicate),
        timeoutMs,
        'Agent request',
      ),
    );
  }

  private validTools(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== 4) return false;
    const seen = new Set<string>();
    for (const candidate of value) {
      const tool = record(candidate);
      const name = String(tool.name ?? '');
      const expected = inputNames[name];
      const schema = record(tool.input_schema);
      if (!expected || seen.has(name) || typeof tool.description !== 'string') return false;
      seen.add(name);
      try {
        if (!this.ajv.validateSchema(schema)) return false;
      } catch {
        return false;
      }
      const required = Array.isArray(schema.required) ? schema.required : [];
      const properties = record(schema.properties);
      if (Object.keys(properties).length !== expected.length) return false;
      if (
        schema.type !== 'object' ||
        !expected.every((key) => Object.hasOwn(properties, key) && required.includes(key))
      )
        return false;
      if (!Object.keys(properties).every((key) => required.includes(key))) return false;
    }
    return true;
  }

  private takePlan(plans: AgentResponsePlan[], runId: string): AgentResponsePlan {
    const index = plans.findIndex((plan) => plan.runId === undefined || plan.runId === runId);
    return index >= 0 ? (plans.splice(index, 1)[0] ?? {}) : {};
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', this.url).pathname;
    if (request.method !== 'POST' || (path !== '/agent/turn' && path !== '/agent/audit')) {
      respond(response, 404, { code: 'NOT_FOUND' });
      return;
    }
    const body = await readBody(request);
    const entry: AgentRequest = {
      id: this.nextRequestId++,
      at: new Date().toISOString(),
      path,
      body,
    };
    (path === '/agent/turn' ? this.turns : this.audits).push(entry);
    if (this.unavailable) {
      this.reply(response, entry, 503, { code: 'SERVICE_UNAVAILABLE' });
      return;
    }
    const payload = record(body);
    const runId = String(payload.runId ?? '');
    if (path === '/agent/turn') {
      if (!this.validTools(payload.tools)) {
        this.reply(response, entry, 400, { code: 'TOOLS_INVALID' });
        return;
      }
      if (!runId) {
        this.reply(response, entry, 400, { code: 'RUN_ID_REQUIRED' });
        return;
      }
      const session = this.sessions.get(runId) ?? [];
      session.push(entry.id);
      this.sessions.set(runId, session);
    }
    const plan = this.takePlan(path === '/agent/turn' ? this.turnPlans : this.auditPlans, runId);
    if (plan.barrier?.phase === 'request' || plan.barrier?.phase === 'after-effect')
      await this.barriers.hit(plan.barrier.name, entry);
    await this.tasks.delay(plan.responseDelayMs ?? 0);
    if (plan.barrier?.phase === 'before-response')
      await this.barriers.hit(plan.barrier.name, entry);
    if (plan.neverRespond || this.tasks.closed) return;
    const defaultBody =
      path === '/agent/turn'
        ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'QA script complete' }] }
        : { verdict: 'pass', reason: 'QA script pass' };
    this.reply(
      response,
      entry,
      plan.status ?? 200,
      plan.body === undefined ? defaultBody : plan.body,
      plan.rawBody,
    );
  }

  private reply(
    response: ServerResponse,
    request: AgentRequest,
    status: number,
    body: unknown,
    rawBody?: string,
  ): void {
    request.responseStatus = status;
    request.rawResponse = rawBody ?? JSON.stringify(body);
    request.completedAt = new Date().toISOString();
    respond(response, status, body, rawBody);
  }

  private async control(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', this.controlUrl).pathname;
    if (request.method === 'GET' && path === '/snapshot') {
      respond(response, 200, this.snapshot());
      return;
    }
    const body = record(await readBody(request));
    if (request.method === 'POST' && path === '/turns')
      this.enqueueTurns(...(Array.isArray(body.plans) ? (body.plans as AgentResponsePlan[]) : []));
    else if (request.method === 'POST' && path === '/audits')
      this.enqueueAudits(...(Array.isArray(body.plans) ? (body.plans as AgentResponsePlan[]) : []));
    else if (request.method === 'POST' && path === '/configure') this.configure(body);
    else if (request.method === 'POST' && path === '/barriers/release')
      this.barriers.release(String(body.name));
    else {
      respond(response, 404, { code: 'NOT_FOUND' });
      return;
    }
    respond(response, 200, { ok: true });
  }
}
