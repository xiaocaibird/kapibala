import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { BarrierController, type BarrierSpec } from './barrier.js';
import {
  closeServer,
  listen,
  readBody,
  record,
  respond,
  Tasks,
  waitForValue,
  type JsonRecord,
} from './http-server.js';

export type GatewayEventType =
  | 'message'
  | 'message_sent'
  | 'message_failed'
  | 'member_joined'
  | 'member_left'
  | 'account_status';
export interface GatewayEvent {
  eventId: number;
  type: GatewayEventType;
  data: JsonRecord;
  /** QA ledger timestamp only; not included in the external SSE payload. */
  recordedAt?: string;
}
export interface GatewayRequest {
  id: number;
  at: string;
  method: string;
  path: string;
  body: unknown;
  /** QA worker's real monotonic clock only; never sent over the gateway protocol. */
  clockDomain?: string;
  receivedMonoMs?: number;
  responsePreparedMonoMs?: number;
  responseFinishedMonoMs?: number;
  responseClosedMonoMs?: number;
  responseStatus?: number;
  completedAt?: string;
  /** Route result captured before any response-delay/barrier; not SUT receipt. */
  responsePreparedAt?: string;
  preparedResponseStatus?: number;
  /** HTTP transport evidence only; finish does not mean the SUT processed it. */
  responseFinishedAt?: string;
  responseClosedAt?: string;
  responseClosedBeforeFinish?: boolean;
}
export interface GatewayMessage {
  groupId: string;
  accountId: string | null;
  clientMsgId: string | null;
  msgId: string;
  senderPlatformUserId: string;
  text: string;
  sentAt: string;
  mediaUrl?: string;
}
export interface GatewayAccount {
  id: string;
  platformUserId: string;
  connected: boolean;
  status: 'available' | 'suspended' | 'session_expired';
  rateLimitedUntil: string | null;
}
export interface GatewayMember {
  platformUserId: string;
  role: 'creator' | 'admin' | 'member';
}
export interface GatewayGroup {
  groupId: string;
  creatorAccountId: string;
  writable: boolean;
  members: GatewayMember[];
}
export interface GatewayEffect {
  at: string;
  kind: string;
  groupId?: string;
  accountId?: string;
  platformUserId?: string;
  clientMsgId?: string;
  msgId?: string;
}
export interface GatewayConfig {
  unavailable: boolean;
  sseUnavailable: boolean;
  inviteReadyAfterMs: number;
  inviteExpiresAfterMs: number | null;
  joinDelayMs: number;
  joinNeverCompletes: boolean;
  sendDelayMs: number;
  sendResponseDelayMs: number;
  sendEventOrder: 'sent-first' | 'message-first';
  eventDuplicates: number;
  kickResponseDelayMs: number;
  emitTerminalStatusEvents: boolean;
}
export interface GatewayResponsePlan {
  method?: string;
  status?: number;
  code?: string;
  body?: unknown;
  rawBody?: string;
  responseDelayMs?: number;
  effect?: 'normal' | 'none' | 'apply';
  effectDelayMs?: number;
  eventDelayMs?: number;
  omitEvent?: boolean;
  neverRespond?: boolean;
  failureCode?: 'GROUP_WRITE_FORBIDDEN' | 'ACCOUNT_SUSPENDED';
  barrier?: BarrierSpec;
}
export interface EmitOptions {
  repeat?: number;
  delayMs?: number;
  storeOnly?: boolean;
}
export interface MessageInput {
  groupId: string;
  msgId?: string;
  senderPlatformUserId: string;
  text: string;
  sentAt?: string;
  mediaUrl?: string;
}
export interface GatewaySnapshot {
  accounts: GatewayAccount[];
  groups: GatewayGroup[];
  messages: GatewayMessage[];
  requests: GatewayRequest[];
  events: GatewayEvent[];
  effects: GatewayEffect[];
  barriers: ReturnType<BarrierController['snapshot']>;
  backgroundErrors: string[];
  connectedStreams: number;
}

interface Invite {
  groupId: string;
  readyAt: number;
  expiresAt: number | null;
  link: string;
}
interface Action {
  status: number;
  body: unknown;
  effect?: () => void;
  events?: () => void;
  asynchronous?: boolean;
  delayMs?: number;
  responseDelayMs?: number;
  accountId?: string;
  groupId?: string;
  eventsAfterResponse?: boolean;
}
const defaults: GatewayConfig = {
  unavailable: false,
  sseUnavailable: false,
  inviteReadyAfterMs: 0,
  inviteExpiresAfterMs: null,
  joinDelayMs: 100,
  joinNeverCompletes: false,
  sendDelayMs: 50,
  sendResponseDelayMs: 0,
  sendEventOrder: 'sent-first',
  eventDuplicates: 1,
  kickResponseDelayMs: 1_000,
  emitTerminalStatusEvents: false,
};

/** Independent external facts; deliberately no clientMsgId deduplication. */
export class GatewaySimulator {
  readonly barriers = new BarrierController();
  private server: Server | undefined;
  private controlServer: Server | undefined;
  private readonly tasks = new Tasks();
  private readonly accounts = new Map<string, GatewayAccount>();
  private readonly groups = new Map<string, GatewayGroup>();
  private readonly announcedMembers = new Map<string, Set<string>>();
  private readonly invites = new Map<string, Invite>();
  private readonly media = new Map<string, { bytes: Buffer; expiresAt: number | null }>();
  private readonly plans = new Map<string, GatewayResponsePlan[]>();
  private readonly requests: GatewayRequest[] = [];
  private readonly messages: GatewayMessage[] = [];
  private readonly events: GatewayEvent[] = [];
  private readonly effects: GatewayEffect[] = [];
  private readonly streams = new Set<ServerResponse>();
  private readonly rateLimitSeconds = new Map<string, number>();
  private config: GatewayConfig;
  private groupCounter = 0;
  private messageCounter = 0;
  private inviteCounter = 0;
  private baseUrl = '';
  private managementUrl = '';

  constructor(options: { accountIds?: string[]; config?: Partial<GatewayConfig> } = {}) {
    this.config = { ...defaults, ...options.config };
    this.seedAccounts(options.accountIds ?? []);
  }

  get url(): string {
    if (!this.baseUrl) throw new Error('GatewaySimulator has not started');
    return this.baseUrl;
  }
  get controlUrl(): string {
    if (!this.managementUrl) throw new Error('GatewaySimulator has not started');
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
    this.disconnectStreams();
    await this.tasks.close();
    await Promise.all([closeServer(this.server), closeServer(this.controlServer)]);
    this.server = undefined;
    this.controlServer = undefined;
  }

  seedAccounts(ids: readonly string[]): void {
    for (const id of ids)
      if (!this.accounts.has(id))
        this.accounts.set(id, {
          id,
          platformUserId: `platform-${id}`,
          connected: false,
          status: 'available',
          rateLimitedUntil: null,
        });
  }

  configure(config: Partial<GatewayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  enqueue(path: string, ...plans: GatewayResponsePlan[]): void {
    const queue = this.plans.get(path) ?? [];
    queue.push(...structuredClone(plans));
    this.plans.set(path, queue);
  }

  snapshot(): GatewaySnapshot {
    return structuredClone({
      accounts: [...this.accounts.values()],
      groups: [...this.groups.values()],
      messages: this.messages,
      requests: this.requests,
      events: this.events,
      effects: this.effects,
      barriers: this.barriers.snapshot(),
      backgroundErrors: this.tasks.errors,
      connectedStreams: this.streams.size,
    });
  }

  async waitForRequest(
    predicate: (request: GatewayRequest) => boolean,
    timeoutMs = 5_000,
  ): Promise<GatewayRequest> {
    return structuredClone(
      await waitForValue(() => this.requests.find(predicate), timeoutMs, 'Gateway request'),
    );
  }

  emit(type: GatewayEventType, data: JsonRecord, options: EmitOptions = {}): GatewayEvent {
    const eventId = this.events.length + 1;
    const event = {
      eventId,
      type,
      recordedAt: new Date().toISOString(),
      data: { ...structuredClone(data), eventId, type },
    };
    this.events.push(event);
    if (!options.storeOnly) this.deliver(eventId, options);
    return structuredClone(event);
  }

  /** Replay the identical eventId without adding a new event to retained history. */
  deliver(eventId: number, options: Omit<EmitOptions, 'storeOnly'> = {}): void {
    const event = this.events.find((candidate) => candidate.eventId === eventId);
    if (!event) throw new Error(`Unknown eventId ${eventId}`);
    const send = (): void => {
      if (event.type === 'member_joined') {
        const groupId = String(event.data.groupId);
        const known = this.announcedMembers.get(groupId) ?? new Set<string>();
        known.add(String(event.data.platformUserId));
        this.announcedMembers.set(groupId, known);
      }
      for (let copy = 0; copy < (options.repeat ?? this.config.eventDuplicates); copy++) {
        for (const response of this.streams) this.writeEvent(response, event);
      }
    };
    if ((options.delayMs ?? 0) > 0)
      this.tasks.run(async () => {
        await this.tasks.delay(options.delayMs ?? 0);
        if (!this.tasks.closed) send();
      });
    else send();
  }

  emitMessage(input: MessageInput, options: EmitOptions = {}): GatewayEvent {
    const message: GatewayMessage = {
      ...input,
      accountId:
        [...this.accounts.values()].find(
          (account) => account.platformUserId === input.senderPlatformUserId,
        )?.id ?? null,
      clientMsgId: null,
      msgId: input.msgId ?? `gateway-message-${++this.messageCounter}`,
      sentAt: input.sentAt ?? new Date().toISOString(),
    };
    if (
      !this.messages.some(
        (existing) => existing.groupId === message.groupId && existing.msgId === message.msgId,
      )
    ) {
      this.messages.push(message);
    }
    return this.emit('message', this.messageData(message), options);
  }

  emitStatus(accountId: string, status: 'suspended' | 'session_expired'): void {
    this.makeTerminal(accountId, status, true);
  }

  /** Current membership changes before its event; useful for external users and delayed events. */
  setMembership(
    groupId: string,
    platformUserId: string,
    present: boolean,
    options: EmitOptions = {},
  ): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Unknown group ${groupId}`);
    if (present && !group.members.some((member) => member.platformUserId === platformUserId)) {
      group.members.push({ platformUserId, role: 'member' });
    } else if (!present) {
      group.members = group.members.filter((member) => member.platformUserId !== platformUserId);
      this.announcedMembers.get(groupId)?.delete(platformUserId);
    }
    this.emit(present ? 'member_joined' : 'member_left', { groupId, platformUserId }, options);
  }

  expireInvite(link: string): void {
    const invite = this.invites.get(link);
    if (!invite) throw new Error(`Unknown invitation ${link}`);
    invite.expiresAt = Date.now() - 1;
  }

  addMedia(
    id: string,
    bytes: Buffer | Uint8Array | string,
    options: { expiresAfterMs?: number } = {},
  ): string {
    this.media.set(id, {
      bytes: Buffer.from(bytes),
      expiresAt: options.expiresAfterMs === undefined ? null : Date.now() + options.expiresAfterMs,
    });
    return `${this.url}/media/${encodeURIComponent(id)}`;
  }

  disconnectStreams(): void {
    for (const response of this.streams) response.destroy();
    this.streams.clear();
  }

  private takePlan(path: string, method: string): GatewayResponsePlan {
    const queue = this.plans.get(path);
    const index =
      queue?.findIndex((plan) => !plan.method || plan.method.toUpperCase() === method) ?? -1;
    return index >= 0 ? (queue?.splice(index, 1)[0] ?? {}) : {};
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.url);
    const method = request.method ?? 'GET';
    const body = await readBody(request);
    const entry: GatewayRequest = {
      id: this.requests.length + 1,
      at: new Date().toISOString(),
      method,
      path: url.pathname,
      body,
      clockDomain: `qa-process-performance:${process.pid}`,
      receivedMonoMs: performance.now(),
    };
    this.requests.push(entry);
    response.once('finish', () => {
      entry.responseFinishedAt = new Date().toISOString();
      entry.responseFinishedMonoMs = performance.now();
    });
    response.once('close', () => {
      entry.responseClosedAt = new Date().toISOString();
      entry.responseClosedMonoMs = performance.now();
      entry.responseClosedBeforeFinish = !response.writableFinished;
    });
    if (this.config.unavailable || (url.pathname === '/events' && this.config.sseUnavailable)) {
      this.reply(response, entry, 503, { code: 'SERVICE_UNAVAILABLE' });
      return;
    }
    const plan = this.takePlan(url.pathname, method);
    if (plan.barrier?.phase === 'request') await this.barriers.hit(plan.barrier.name, entry);
    if (this.tasks.closed) return;
    if (url.pathname === '/events' && method === 'GET') {
      if ((plan.status ?? 200) !== 200) {
        this.reply(
          response,
          entry,
          plan.status ?? 503,
          plan.body ?? { code: plan.code ?? 'SERVICE_UNAVAILABLE' },
          plan.rawBody,
        );
        return;
      }
      await this.tasks.delay(plan.responseDelayMs ?? 0);
      if (plan.barrier?.phase === 'before-response')
        await this.barriers.hit(plan.barrier.name, entry);
      if (this.tasks.closed || response.destroyed) return;
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      entry.responseStatus = 200;
      this.streams.add(response);
      response.on('close', () => this.streams.delete(response));
      if (url.searchParams.has('since')) {
        const since = Number(url.searchParams.get('since'));
        for (const event of this.events)
          if (event.eventId > since) {
            for (let copy = 0; copy < this.config.eventDuplicates; copy++)
              this.writeEvent(response, event);
          }
      }
      return;
    }
    if (method === 'GET' && url.pathname.startsWith('/media/') && plan.status === undefined) {
      const media = this.media.get(decodeURIComponent(url.pathname.slice('/media/'.length)));
      if (!media || (media.expiresAt !== null && Date.now() >= media.expiresAt))
        this.reply(response, entry, 404, { code: 'MEDIA_EXPIRED' });
      else {
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(media.bytes);
        entry.responseStatus = 200;
        entry.completedAt = new Date().toISOString();
      }
      return;
    }
    const action = this.route(method, url.pathname, record(body), plan);
    const status = plan.status ?? action.status;
    entry.responsePreparedAt = new Date().toISOString();
    entry.responsePreparedMonoMs = performance.now();
    entry.preparedResponseStatus = status;
    if (status >= 400)
      this.applyErrorState(
        action,
        plan.code ?? String(record(plan.body).code ?? record(action.body).code ?? ''),
        plan.body,
      );
    const shouldApply =
      Boolean(action.effect) &&
      (plan.effect === 'apply' || (plan.effect !== 'none' && status < 400));
    let work: Promise<void> | undefined;
    if (shouldApply) {
      const execute = async (): Promise<void> => {
        await this.tasks.delay(plan.effectDelayMs ?? action.delayMs ?? 0);
        if (this.tasks.closed) return;
        action.effect?.();
        if (plan.barrier?.phase === 'after-effect')
          await this.barriers.hit(plan.barrier.name, entry);
        if (!action.eventsAfterResponse) {
          await this.tasks.delay(plan.eventDelayMs ?? 0);
          if (!this.tasks.closed && !plan.omitEvent) action.events?.();
        }
      };
      work = execute();
      if (action.asynchronous && plan.barrier?.phase !== 'after-effect')
        this.tasks.run(() => work ?? Promise.resolve());
      else await work;
    }
    await this.tasks.delay(plan.responseDelayMs ?? action.responseDelayMs ?? 0);
    if (plan.barrier?.phase === 'before-response')
      await this.barriers.hit(plan.barrier.name, entry);
    if (plan.neverRespond || this.tasks.closed) return;
    const responseBody =
      plan.body !== undefined
        ? plan.code
          ? { ...record(plan.body), code: plan.code }
          : plan.body
        : plan.code
          ? { code: plan.code }
          : action.body;
    this.reply(response, entry, status, responseBody, plan.rawBody);
    if (shouldApply && action.eventsAfterResponse && !plan.omitEvent)
      this.tasks.run(async () => {
        await this.tasks.delay(plan.eventDelayMs ?? 0);
        if (!this.tasks.closed) action.events?.();
      });
  }

  private route(method: string, path: string, body: JsonRecord, plan: GatewayResponsePlan): Action {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (method === 'POST' && segments[0] === 'accounts' && segments.length === 3) {
      const accountId = segments[1] ?? '';
      const account = this.accounts.get(accountId);
      const invalid = this.accountError(account, false);
      if (invalid) return { ...invalid, accountId };
      if (!account) return this.error(404, 'ACCOUNT_NOT_FOUND');
      if (segments[2] === 'connect')
        return {
          status: 200,
          body: { platformUserId: account.platformUserId },
          accountId,
          effect: () => {
            account.connected = true;
            this.effect('connect', { accountId });
          },
        };
      if (segments[2] === 'disconnect')
        return {
          status: 200,
          body: {},
          accountId,
          effect: () => {
            account.connected = false;
            this.effect('disconnect', { accountId });
          },
        };
    }
    if (method === 'POST' && path === '/groups') {
      const accountId = String(body.creatorAccountId ?? '');
      const account = this.accounts.get(accountId);
      const invalid = this.accountError(account);
      if (invalid) return { ...invalid, accountId };
      if (!account) return this.error(404, 'ACCOUNT_NOT_FOUND');
      const groupId = `gateway-group-${++this.groupCounter}`;
      return {
        status: 200,
        body: { groupId },
        accountId,
        groupId,
        effect: () => {
          this.groups.set(groupId, {
            groupId,
            creatorAccountId: accountId,
            writable: true,
            members: [{ platformUserId: account.platformUserId, role: 'creator' }],
          });
          this.effect('create', { groupId, accountId });
        },
      };
    }
    if (segments[0] !== 'groups' || !segments[1]) return this.error(404, 'NOT_FOUND');
    const groupId = segments[1];
    const group = this.groups.get(groupId);
    if (!group) return { ...this.error(404, 'GROUP_NOT_FOUND'), groupId };
    const operation = segments[2];
    if (method === 'GET' && operation === 'members')
      return {
        status: 200,
        body: group.members.map(({ platformUserId }) => ({ platformUserId })),
        groupId,
      };
    if (method === 'GET' && operation === 'messages' && segments[3] === 'by-client-id') {
      const found = this.messages.find(
        (message) => message.groupId === groupId && message.clientMsgId === segments[4],
      );
      return found
        ? { status: 200, body: { msgId: found.msgId, sentAt: found.sentAt }, groupId }
        : { ...this.error(404, 'MESSAGE_NOT_FOUND'), groupId };
    }
    if (method !== 'POST') return this.error(404, 'NOT_FOUND');
    if (operation === 'invite') {
      const link = `${this.url}/invitations/${++this.inviteCounter}`;
      return {
        status: 200,
        body: { inviteLink: link, readyAfterMs: this.config.inviteReadyAfterMs },
        groupId,
        effect: () => {
          this.invites.set(link, {
            link,
            groupId,
            readyAt: Date.now() + this.config.inviteReadyAfterMs,
            expiresAt:
              this.config.inviteExpiresAfterMs === null
                ? null
                : Date.now() + this.config.inviteExpiresAfterMs,
          });
          this.effect('invite', { groupId });
        },
      };
    }
    const accountId = String(body.accountId ?? body.byAccountId ?? '');
    const actorId = operation === 'promote' ? String(body.byAccountId ?? '') : accountId;
    const actor = this.accounts.get(actorId);
    const invalid = this.accountError(actor);
    if (invalid) return { ...invalid, accountId: actorId, groupId };
    if (!actor) return this.error(404, 'ACCOUNT_NOT_FOUND');
    const context = { accountId: actorId, groupId };
    if (operation === 'join') {
      if (group.members.some((member) => member.platformUserId === actor.platformUserId))
        return { ...this.error(409, 'ALREADY_MEMBER'), ...context };
      const invite = this.invites.get(String(body.inviteLink ?? ''));
      if (
        !invite ||
        invite.groupId !== groupId ||
        (invite.expiresAt !== null && Date.now() >= invite.expiresAt)
      )
        return { ...this.error(410, 'INVITE_EXPIRED'), ...context };
      if (Date.now() < invite.readyAt)
        return { ...this.error(409, 'INVITE_NOT_READY'), ...context };
      if (this.config.joinNeverCompletes || plan.omitEvent)
        return { status: 202, body: { accepted: true }, ...context };
      return {
        status: 202,
        body: { accepted: true },
        ...context,
        asynchronous: true,
        delayMs: this.config.joinDelayMs,
        effect: () => {
          if (!group.members.some((member) => member.platformUserId === actor.platformUserId))
            group.members.push({ platformUserId: actor.platformUserId, role: 'member' });
          this.effect('join', { ...context, platformUserId: actor.platformUserId });
        },
        events: () => {
          this.emit('member_joined', { groupId, platformUserId: actor.platformUserId });
        },
      };
    }
    if (operation === 'promote') {
      if (group.creatorAccountId !== actorId)
        return { ...this.error(403, 'NO_PERMISSION'), ...context };
      const target = this.accounts.get(accountId);
      const member = group.members.find(
        (candidate) => candidate.platformUserId === target?.platformUserId,
      );
      if (!member || !this.announcedMembers.get(groupId)?.has(member.platformUserId))
        return { ...this.error(409, 'NOT_MEMBER_YET'), ...context };
      return {
        status: 200,
        body: {},
        ...context,
        effect: () => {
          member.role = 'admin';
          this.effect('promote', { groupId, accountId });
        },
      };
    }
    if (operation === 'leave')
      return {
        status: 200,
        body: {},
        ...context,
        eventsAfterResponse: true,
        effect: () => {
          group.members = group.members.filter(
            (member) => member.platformUserId !== actor.platformUserId,
          );
          this.announcedMembers.get(groupId)?.delete(actor.platformUserId);
          this.effect('leave', { ...context, platformUserId: actor.platformUserId });
        },
        events: () => {
          this.emit('member_left', { groupId, platformUserId: actor.platformUserId });
        },
      };
    if (operation === 'kick') {
      const ownerId = this.accounts.get(group.creatorAccountId)?.platformUserId;
      if (!group.members.some((member) => member.platformUserId === ownerId))
        return { ...this.error(409, 'OWNER_LEFT'), ...context };
      const member = group.members.find(
        (candidate) => candidate.platformUserId === actor.platformUserId,
      );
      if (!member || !['creator', 'admin'].includes(member.role))
        return { ...this.error(403, 'NO_PERMISSION'), ...context };
      const target = String(body.targetPlatformUserId ?? '');
      return {
        status: 200,
        body: { kicked: true },
        ...context,
        asynchronous: plan.status === 504,
        eventsAfterResponse: plan.status !== 504,
        responseDelayMs: plan.status === 504 ? 0 : this.config.kickResponseDelayMs,
        effect: () => {
          group.members = group.members.filter((candidate) => candidate.platformUserId !== target);
          this.announcedMembers.get(groupId)?.delete(target);
          this.effect('kick', { ...context, platformUserId: target });
        },
        events: () => {
          this.emit('member_left', { groupId, platformUserId: target });
        },
      };
    }
    if (operation === 'send') {
      if (!group.writable) return { ...this.error(403, 'GROUP_WRITE_FORBIDDEN'), ...context };
      if (!group.members.some((member) => member.platformUserId === actor.platformUserId))
        return { ...this.error(403, 'SENDER_NOT_IN_GROUP'), ...context };
      if (actor.rateLimitedUntil && Date.now() < Date.parse(actor.rateLimitedUntil)) {
        const seconds = this.rateLimitSeconds.get(actorId) ?? 1;
        actor.rateLimitedUntil = new Date(Date.now() + seconds * 1_000).toISOString();
        return {
          status: 429,
          body: { code: 'RATE_LIMITED', retryAfterSeconds: seconds },
          ...context,
        };
      }
      const clientMsgId = String(body.clientMsgId ?? '');
      let landed: GatewayMessage | undefined;
      let failure = plan.failureCode;
      return {
        status: 202,
        body: { accepted: true },
        ...context,
        asynchronous: true,
        delayMs: this.config.sendDelayMs,
        responseDelayMs: this.config.sendResponseDelayMs,
        effect: () => {
          if (actor.status === 'suspended') failure = 'ACCOUNT_SUSPENDED';
          if (failure) {
            if (failure === 'ACCOUNT_SUSPENDED')
              this.makeTerminal(actorId, 'suspended', this.config.emitTerminalStatusEvents);
            else group.writable = false;
            return;
          }
          landed = {
            groupId,
            accountId: actorId,
            clientMsgId,
            msgId: `gateway-message-${++this.messageCounter}`,
            senderPlatformUserId: actor.platformUserId,
            text: String(body.text ?? ''),
            sentAt: new Date().toISOString(),
          };
          this.messages.push(landed);
          this.effect('send', { ...context, clientMsgId, msgId: landed.msgId });
        },
        events: () => {
          if (failure) {
            this.emit('message_failed', { clientMsgId, code: failure });
            return;
          }
          if (!landed) return;
          const sent = (): void => {
            if (landed)
              this.emit('message_sent', {
                clientMsgId,
                msgId: landed.msgId,
                sentAt: landed.sentAt,
              });
          };
          const message = (): void => {
            if (landed) this.emit('message', this.messageData(landed));
          };
          if (this.config.sendEventOrder === 'message-first') {
            message();
            sent();
          } else {
            sent();
            message();
          }
        },
      };
    }
    return this.error(404, 'NOT_FOUND');
  }

  private accountError(account: GatewayAccount | undefined, online = true): Action | undefined {
    if (!account) return this.error(404, 'ACCOUNT_NOT_FOUND');
    if (account.status === 'suspended') return this.error(403, 'ACCOUNT_SUSPENDED');
    if (account.status === 'session_expired') return this.error(401, 'SESSION_EXPIRED');
    if (online && !account.connected) return this.error(409, 'ACCOUNT_OFFLINE');
    return undefined;
  }

  private applyErrorState(action: Action, code: string, body: unknown): void {
    if (action.accountId && code === 'RATE_LIMITED') {
      const account = this.accounts.get(action.accountId);
      const seconds = Number(record(body ?? action.body).retryAfterSeconds ?? 1);
      if (account) {
        account.rateLimitedUntil = new Date(Date.now() + seconds * 1_000).toISOString();
        this.rateLimitSeconds.set(action.accountId, seconds);
      }
    }
    if (action.accountId && (code === 'ACCOUNT_SUSPENDED' || code === 'SESSION_EXPIRED')) {
      this.makeTerminal(
        action.accountId,
        code === 'ACCOUNT_SUSPENDED' ? 'suspended' : 'session_expired',
        this.config.emitTerminalStatusEvents,
      );
    }
    if (action.groupId && code === 'GROUP_WRITE_FORBIDDEN') {
      const group = this.groups.get(action.groupId);
      if (group) group.writable = false;
    }
  }

  private makeTerminal(
    accountId: string,
    status: 'suspended' | 'session_expired',
    publish: boolean,
  ): void {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Unknown account ${accountId}`);
    if (account.status !== 'available' && account.status !== status)
      throw new Error(
        `Terminal gateway account ${accountId} cannot change from ${account.status} to ${status}`,
      );
    account.status = status;
    account.connected = false;
    if (publish) this.emit('account_status', { accountId, status });
    for (const group of this.groups.values())
      if (group.members.some((member) => member.platformUserId === account.platformUserId)) {
        group.members = group.members.filter(
          (member) => member.platformUserId !== account.platformUserId,
        );
        this.announcedMembers.get(group.groupId)?.delete(account.platformUserId);
        this.effect('terminal_leave', {
          groupId: group.groupId,
          accountId,
          platformUserId: account.platformUserId,
        });
        this.emit('member_left', {
          groupId: group.groupId,
          platformUserId: account.platformUserId,
        });
      }
  }

  private effect(kind: string, detail: Omit<GatewayEffect, 'at' | 'kind'>): void {
    this.effects.push({ at: new Date().toISOString(), kind, ...detail });
  }
  private error(status: number, code: string): Action {
    return { status, body: { code } };
  }
  private messageData(message: GatewayMessage): JsonRecord {
    return {
      groupId: message.groupId,
      msgId: message.msgId,
      senderPlatformUserId: message.senderPlatformUserId,
      text: message.text,
      sentAt: message.sentAt,
      ...(message.mediaUrl ? { mediaUrl: message.mediaUrl } : {}),
    };
  }
  private writeEvent(response: ServerResponse, event: GatewayEvent): void {
    if (event.type === 'member_joined') {
      const groupId = String(event.data.groupId);
      const known = this.announcedMembers.get(groupId) ?? new Set<string>();
      known.add(String(event.data.platformUserId));
      this.announcedMembers.set(groupId, known);
    }
    if (!response.destroyed && !response.writableEnded)
      response.write(
        `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
      );
  }
  private reply(
    response: ServerResponse,
    request: GatewayRequest,
    status: number,
    body: unknown,
    rawBody?: string,
  ): void {
    request.responseStatus = status;
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
    if (request.method === 'POST' && path === '/configure')
      this.configure(body as Partial<GatewayConfig>);
    else if (request.method === 'POST' && path === '/seed-accounts')
      this.seedAccounts(Array.isArray(body.ids) ? body.ids.map(String) : []);
    else if (request.method === 'POST' && path === '/plans')
      this.enqueue(
        String(body.path),
        ...(Array.isArray(body.plans) ? (body.plans as GatewayResponsePlan[]) : []),
      );
    else if (request.method === 'POST' && path === '/events') {
      respond(
        response,
        200,
        this.emit(
          body.type as GatewayEventType,
          record(body.data),
          record(body.options) as EmitOptions,
        ),
      );
      return;
    } else if (request.method === 'POST' && path === '/status')
      this.emitStatus(String(body.accountId), body.status as 'suspended' | 'session_expired');
    else if (request.method === 'POST' && path === '/membership')
      this.setMembership(
        String(body.groupId),
        String(body.platformUserId),
        Boolean(body.present),
        record(body.options) as EmitOptions,
      );
    else if (request.method === 'POST' && path === '/disconnect-streams') this.disconnectStreams();
    else if (request.method === 'POST' && path === '/barriers/release')
      this.barriers.release(String(body.name));
    else {
      respond(response, 404, { code: 'NOT_FOUND' });
      return;
    }
    respond(response, 200, { ok: true });
  }
}
