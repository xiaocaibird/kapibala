import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import pg from "pg";
import { Database } from "../../apps/server/src/core/db.js";
import { AppError, RemoteError } from "../../apps/server/src/core/errors.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { Accounts } from "../../apps/server/src/modules/gateway/accounts.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";
import {
  changeAccount,
  markGroupUnreachable,
} from "../../apps/server/src/modules/gateway/state.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import type {
  AccountStatus,
  Message,
} from "../../packages/contracts/src/index.js";

class FakeGateway extends RemoteClient {
  readonly calls: { path: string; body: unknown }[] = [];
  readonly remoteMembers = new Map<string, Set<string>>();
  readonly landed = new Map<string, { msgId: string; sentAt: string }>();
  sendModes: string[] = [];
  joinMode = "ok";
  leaveFailure: string | null = null;
  inviteReadyMs = 0;
  queryUnavailable = false;
  kickMode = "ok";
  sendBarrier?: Promise<void>;
  joinCount = 0;
  promoteCount = 0;
  promoteFailures = 0;
  onJoined?: (groupId: string, platformUserId: string) => Promise<void>;
  constructor() {
    super("http://unused.invalid");
  }
  override async request<T>(path: string, body?: unknown): Promise<T> {
    this.calls.push({ path, body });
    const input = body as Record<string, string> | undefined;
    if (path.startsWith("/accounts/") && path.endsWith("/connect"))
      return { platformUserId: `p-${path.split("/")[2]}` } as T;
    if (path.endsWith("/disconnect")) return {} as T;
    if (path === "/groups") {
      const groupId = `remote-${randomUUID()}`;
      this.remoteMembers.set(
        groupId,
        new Set([`p-${input!.creatorAccountId}`]),
      );
      return { groupId } as T;
    }
    const groupId = path.split("/")[2]!;
    if (path.endsWith("/invite"))
      return {
        inviteLink: "invite-link",
        readyAfterMs: this.inviteReadyMs,
      } as T;
    if (path.endsWith("/join")) {
      this.joinCount++;
      if (this.joinMode === "expire-once" && this.joinCount === 1)
        throw new RemoteError(410, "INVITE_EXPIRED");
      if (this.joinMode === "already") {
        this.remoteMembers.get(groupId)!.add(`p-${input!.accountId}`);
        throw new RemoteError(409, "ALREADY_MEMBER");
      }
      if (this.joinMode !== "never") {
        this.remoteMembers.get(groupId)!.add(`p-${input!.accountId}`);
        await this.onJoined?.(groupId, `p-${input!.accountId}`);
      }
      return { accepted: true } as T;
    }
    if (path.endsWith("/promote")) {
      this.promoteCount++;
      if (this.promoteFailures-- > 0)
        throw new RemoteError(409, "NOT_MEMBER_YET");
      return {} as T;
    }
    if (path.endsWith("/members"))
      return [...(this.remoteMembers.get(groupId) ?? [])].map(
        (platformUserId) => ({ platformUserId }),
      ) as T;
    if (path.endsWith("/leave")) {
      if (input!.accountId === this.leaveFailure)
        throw new RemoteError(500, "LEAVE_FAILED");
      this.remoteMembers.get(groupId)?.delete(`p-${input!.accountId}`);
      return {} as T;
    }
    if (path.endsWith("/kick")) {
      if (this.kickMode === "suspended")
        throw new RemoteError(403, "ACCOUNT_SUSPENDED");
      if (this.kickMode === "forbidden")
        throw new RemoteError(403, "GROUP_WRITE_FORBIDDEN");
      this.remoteMembers.get(groupId)?.delete(input!.targetPlatformUserId!);
      return { kicked: true } as T;
    }
    if (path.endsWith("/send")) {
      await this.sendBarrier;
      const mode = this.sendModes.shift() ?? "ok";
      if (mode === "rate")
        throw new RemoteError(429, "RATE_LIMITED", { retryAfterSeconds: 5 });
      if (mode === "timeout-sent") {
        this.landed.set(input!.clientMsgId!, {
          msgId: randomUUID(),
          sentAt: new Date().toISOString(),
        });
        throw new RemoteError(504, "NETWORK_TIMEOUT");
      }
      if (mode === "timeout-empty")
        throw new RemoteError(504, "NETWORK_TIMEOUT");
      if (mode === "unavailable")
        throw new RemoteError(503, "SERVICE_UNAVAILABLE");
      if (mode === "forbidden")
        throw new RemoteError(403, "GROUP_WRITE_FORBIDDEN");
      if (mode === "suspended") throw new RemoteError(403, "ACCOUNT_SUSPENDED");
      if (mode === "expired") throw new RemoteError(401, "SESSION_EXPIRED");
      if (mode === "offline") throw new RemoteError(409, "ACCOUNT_OFFLINE");
      if (mode === "not-member")
        throw new RemoteError(403, "SENDER_NOT_IN_GROUP");
      return { accepted: true } as T;
    }
    if (path.includes("/messages/by-client-id/")) {
      if (this.queryUnavailable)
        throw new RemoteError(503, "SERVICE_UNAVAILABLE");
      const found = this.landed.get(path.split("/").at(-1)!);
      if (!found) throw new RemoteError(404, "NOT_FOUND");
      return found as T;
    }
    throw new Error(`未模拟端点 ${path}`);
  }
  get sends() {
    return this.calls.filter((call) => call.path.endsWith("/send"));
  }
}

async function fixture(t: TestContext) {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://kapibala:kapibala@localhost:55432/kapibala";
  const admin = new pg.Pool({ connectionString });
  const schema = `gateway_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const db = new Database(url.toString());
  const migrationRoot = process.env.TEST_MIGRATIONS_ROOT ?? process.cwd();
  for (const file of [
    "001_core.sql",
    "002_automation.sql",
    "003_agent_activity.sql",
    "004_message_event_order.sql",
    "005_group_metadata.sql",
  ])
    await db.query(
      await readFile(resolve(migrationRoot, "db/migrations", file), "utf8"),
    );
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError)
      reply.code(error.status).send({
        error: { code: error.code, message: error.message, ...error.details },
      });
    else reply.code(500).send({ error: String(error) });
  });
  const gateway = new FakeGateway();
  const ctx: AppContext = {
    db,
    gateway,
    agent: new RemoteClient("http://unused.invalid"),
    log: app.log,
  };
  const accounts = new Accounts(ctx);
  const messages = new Messages(ctx);
  const events = new GatewayEvents(ctx, messages);
  const jobs = new Jobs(ctx);
  let eventId = 0;
  gateway.onJoined = (groupId, platformUserId) =>
    events.process({
      eventId: ++eventId,
      type: "member_joined",
      groupId,
      platformUserId,
    });
  t.after(async () => {
    await app.close();
    await db.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  async function seedGroup() {
    for (const id of ["account-1", "account-2", "account-3"])
      await accounts.connect(id);
    await db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('g','remote-g','account-1')",
    );
    await db.query(
      "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','p-account-1','creator'),('g','account-2','p-account-2','admin'),('g','account-3','p-account-3','member')",
    );
    gateway.remoteMembers.set(
      "remote-g",
      new Set(["p-account-1", "p-account-2", "p-account-3"]),
    );
  }
  async function seedSequence(clientMsgId: string) {
    await db.query(
      "INSERT INTO sequences(id,name,steps) VALUES('s','测试','[]')",
    );
    await db.query(
      "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('sr','g','s')",
    );
    await db.query(
      "INSERT INTO sequence_steps(run_id,index,client_msg_id,account_role,text,delay_seconds,resolved_vars,var_sources) VALUES('sr',1,$1,'admin','test',0,'{}','{}')",
      [clientMsgId],
    );
  }
  return {
    app,
    ctx,
    db,
    gateway,
    accounts,
    messages,
    events,
    jobs,
    seedGroup,
    seedSequence,
  };
}

test("真实PG：并发账号CAS只有一个成功，非法边优先于状态冲突", async (t) => {
  const f = await fixture(t);
  await f.accounts.connect("account-1");
  const result = await Promise.allSettled([
    f.accounts.transition("account-1", "disconnected", "online"),
    f.accounts.transition("account-1", "idle", "online"),
  ]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    (result.find((item) => item.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "CAS_CONFLICT",
  );
  await assert.rejects(f.accounts.transition("account-1", "online", "online"), {
    code: "ILLEGAL_TRANSITION",
  });
});

test("账号完整36种状态组合严格遵循允许转移表，终态无出边", async (t) => {
  const f = await fixture(t);
  const expected: Record<AccountStatus, readonly AccountStatus[]> = {
    idle: ["online", "suspended", "session_expired"],
    online: [
      "idle",
      "rate_limited",
      "disconnected",
      "suspended",
      "session_expired",
    ],
    rate_limited: ["online", "disconnected", "suspended", "session_expired"],
    disconnected: ["idle", "online", "suspended", "session_expired"],
    suspended: [],
    session_expired: [],
  };
  const states = Object.keys(expected) as AccountStatus[];
  for (const from of states)
    for (const to of states) {
      await f.db.query(
        "UPDATE accounts SET status=$2,rate_limited_until=null WHERE id=$1",
        ["account-1", from],
      );
      if (expected[from].includes(to))
        assert.equal(
          (await f.accounts.transition("account-1", to, from)).status,
          to,
          `${from} -> ${to}`,
        );
      else
        await assert.rejects(
          f.accounts.transition("account-1", to, from),
          { code: "ILLEGAL_TRANSITION" },
          `${from} -> ${to}`,
        );
    }
  await assert.rejects(f.accounts.connect("account-1"), {
    code: "ILLEGAL_TRANSITION",
  });
});

test("限流到期前已手动离线，不得被过期调度恢复为online", async (t) => {
  const f = await fixture(t);
  await f.accounts.connect("account-1");
  await f.db.transaction((tx) =>
    changeAccount(
      tx,
      "account-1",
      "rate_limited",
      undefined,
      new Date(Date.now() - 1000),
    ),
  );
  await f.accounts.transition("account-1", "disconnected", "rate_limited");
  await f.accounts.releaseRateLimits();
  assert.equal(
    (await f.accounts.list()).find((account) => account.id === "account-1")!
      .status,
    "disconnected",
  );
});

test("ACCOUNT_OFFLINE及SENDER_NOT_IN_GROUP只失败当前消息，账号和群不变", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  for (const [mode, code] of [
    ["offline", "ACCOUNT_OFFLINE"],
    ["not-member", "SENDER_NOT_IN_GROUP"],
  ] as const) {
    f.gateway.sendModes = [mode];
    const message = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: code,
    });
    await f.messages.accountWork("account-2");
    assert.equal(
      (await f.messages.getMessage(message.clientMsgId!))?.failCode,
      code,
    );
    assert.equal(
      (await f.accounts.list()).find((account) => account.id === "account-2")!
        .status,
      "online",
    );
    assert.equal(
      (await f.db.query("SELECT status FROM groups WHERE id='g'")).rows[0]!
        .status,
      "active",
    );
    assert.equal(
      (await f.db.query("SELECT * FROM members WHERE account_id='account-2'"))
        .rowCount,
      1,
    );
  }
});

test("同步SESSION_EXPIRED与异步account_status都执行相同终态后果", async (t) => {
  for (const source of ["send", "event"] as const) {
    const f = await fixture(t);
    await f.seedGroup();
    const first = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: "current",
    });
    const queued = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: "next",
    });
    await f.seedSequence(queued.clientMsgId!);
    if (source === "send") {
      f.gateway.sendModes = ["expired"];
      await f.messages.accountWork("account-2");
      assert.equal(
        (await f.messages.getMessage(first.clientMsgId!))?.failCode,
        "SESSION_EXPIRED",
      );
    } else
      await f.events.process({
        eventId: 300,
        type: "account_status",
        accountId: "account-2",
        status: "session_expired",
      });
    await f.events.process({
      eventId: 301,
      type: "account_status",
      accountId: "account-2",
      status: "session_expired",
    });
    assert.equal(
      (await f.accounts.list()).find((account) => account.id === "account-2")!
        .status,
      "session_expired",
    );
    assert.equal(
      (await f.messages.getMessage(queued.clientMsgId!))?.failCode,
      "ACCOUNT_TERMINAL",
    );
    assert.equal(
      (await f.db.query("SELECT status FROM sequence_steps")).rows[0]!.status,
      "skipped",
    );
    assert.equal(
      (await f.db.query("SELECT * FROM members WHERE account_id='account-2'"))
        .rowCount,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT * FROM events WHERE type='account_terminal'"))
        .rowCount,
      1,
    );
  }
});

test("异步message_failed按错误传播账号终态或群不可写，不能混淆范围", async (t) => {
  for (const code of ["ACCOUNT_SUSPENDED", "GROUP_WRITE_FORBIDDEN"] as const) {
    const f = await fixture(t);
    await f.seedGroup();
    const message = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: "accepted then failed",
    });
    await f.messages.accountWork("account-2");
    const queued = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: "next",
    });
    await f.seedSequence(queued.clientMsgId!);
    await f.db.query("INSERT INTO agent_runs(id,group_id) VALUES('ar','g')");
    await f.events.process({
      eventId: 302,
      type: "message_failed",
      clientMsgId: message.clientMsgId!,
      code,
    });
    assert.equal(
      (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
      "failed",
    );
    assert.equal(
      (await f.messages.getMessage(message.clientMsgId!))?.failCode,
      code,
    );
    assert.equal(
      (await f.accounts.list()).find((account) => account.id === "account-2")!
        .status,
      code === "ACCOUNT_SUSPENDED" ? "suspended" : "online",
    );
    assert.equal(
      (await f.db.query("SELECT status FROM groups WHERE id='g'")).rows[0]!
        .status,
      code === "ACCOUNT_SUSPENDED" ? "active" : "unreachable",
    );
    if (code === "GROUP_WRITE_FORBIDDEN") {
      assert.equal(
        (await f.db.query("SELECT status FROM sequence_runs")).rows[0]!.status,
        "stopped",
      );
      assert.equal(
        (await f.db.query("SELECT cancel_requested FROM agent_runs")).rows[0]!
          .cancel_requested,
        true,
      );
    } else
      assert.equal(
        (await f.db.query("SELECT status FROM sequence_steps")).rows[0]!.status,
        "skipped",
      );
  }
});

test("真实PG：终态后果原子提交；步骤写失败整笔回滚", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "queued",
    source: "sequence",
  });
  await f.seedSequence(message.clientMsgId!);
  await f.db.query(
    "CREATE FUNCTION fail_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write failure'; END $$; CREATE TRIGGER fail_step BEFORE UPDATE ON sequence_steps FOR EACH ROW EXECUTE FUNCTION fail_step()",
  );
  await assert.rejects(
    f.db.transaction((tx) => changeAccount(tx, "account-2", "suspended")),
  );
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "queued",
  );
  assert.equal(
    (await f.db.query("SELECT status FROM accounts WHERE id='account-2'"))
      .rows[0]!.status,
    "online",
  );
  await f.db.query("DROP TRIGGER fail_step ON sequence_steps");
  await f.db.transaction((tx) => changeAccount(tx, "account-2", "suspended"));
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.failCode,
    "ACCOUNT_TERMINAL",
  );
  assert.equal(
    (await f.db.query("SELECT status,sent_at FROM sequence_steps")).rows[0]!
      .status,
    "skipped",
  );
  assert.equal(
    (await f.db.query("SELECT * FROM members WHERE account_id='account-2'"))
      .rowCount,
    0,
  );
  await f.db.transaction((tx) => changeAccount(tx, "account-2", "suspended"));
  assert.equal(
    (await f.db.query("SELECT * FROM events WHERE type='account_terminal'"))
      .rowCount,
    1,
  );
});

test("限流期间所有来源共用账号队列且恢复保持顺序", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["rate"];
  await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "first",
    source: "manual",
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "second",
    source: "agent",
  });
  await f.messages.accountWork("account-2");
  await f.messages.accountWork("account-2");
  assert.equal(f.gateway.sends.length, 1);
  await f.db.query(
    "UPDATE accounts SET rate_limited_until=now()-interval '1 second' WHERE id='account-2'",
  );
  await f.accounts.releaseRateLimits();
  await f.messages.accountWork("account-2");
  assert.deepEqual(
    f.gateway.sends.map((call) => (call.body as { text: string }).text),
    ["first", "first", "second"],
  );
});

test("503退避不能让同账号后续消息越过队首", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["unavailable"];
  await f.db.transaction(async (tx) => {
    await f.messages.enqueueSend(
      { groupId: "g", accountId: "account-2", text: "first" },
      tx,
    );
    await f.messages.enqueueSend(
      { groupId: "g", accountId: "account-2", text: "second" },
      tx,
    );
  });
  await f.messages.accountWork("account-2");
  await f.messages.accountWork("account-2");
  assert.equal(f.gateway.sends.length, 1);
  await f.db.query("UPDATE messages SET metadata=metadata-'nextAttemptAt'");
  await f.messages.accountWork("account-2");
  assert.deepEqual(
    f.gateway.sends.map((call) => (call.body as { text: string }).text),
    ["first", "first", "second"],
  );
});

test("504已落地查询收敛为sent，不重发；自身回流去重且不触发Agent", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["timeout-sent"];
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "hello",
  });
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "unknown",
  );
  const landed = f.gateway.landed.get(message.clientMsgId!)!;
  const event = {
    eventId: 20,
    type: "message" as const,
    groupId: "remote-g",
    msgId: landed.msgId,
    senderPlatformUserId: "p-account-2",
    text: "hello",
    sentAt: landed.sentAt,
  };
  await f.events.process(event);
  await f.events.process(event);
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "sent",
  );
  assert.equal((await f.db.query("SELECT * FROM messages")).rowCount, 1);
  assert.equal(f.gateway.sends.length, 1);
});

test("504明确未落地只重试一次，第二次仍未落地最终failed", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["timeout-empty", "timeout-empty"];
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "retry",
  });
  await f.messages.accountWork("account-2");
  await f.messages.accountWork("account-2");
  assert.equal(f.gateway.sends.length, 1);
  await f.db.query(
    "UPDATE messages SET timeout_at=now()-interval '3 seconds' WHERE client_msg_id=$1",
    [message.clientMsgId],
  );
  await f.messages.accountWork("account-2");
  await f.messages.accountWork("account-2");
  assert.equal(f.gateway.sends.length, 2);
  await f.db.query(
    "UPDATE messages SET timeout_at=now()-interval '3 seconds' WHERE client_msg_id=$1",
    [message.clientMsgId],
  );
  await f.messages.accountWork("account-2");
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "failed",
  );
  assert.equal(f.gateway.sends.length, 2);
});

test("真实时钟：两次504且均未落地，在5秒内确定失败并且只重发一次", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["timeout-empty", "timeout-empty"];
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "real timer",
  });
  const started = performance.now();
  await f.messages.accountWork("account-2");
  while (
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus !==
      "failed" &&
    performance.now() - started < 4900
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await f.messages.accountWork("account-2");
  }
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "failed",
  );
  assert.equal(f.gateway.sends.length, 2);
  assert.ok(performance.now() - started < 5000);
});

test("真实HTTP：窗口内取得的404延迟返回后不得触发重发，后续查询确认原消息", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  const landed: { msgId: string; sentAt: string }[] = [];
  const queries: { startedAt: number; respondedAt: number; found: boolean }[] =
    [];
  let sends = 0;
  let landingTimer: ReturnType<typeof setTimeout> | undefined;
  const server = createServer(async (request, response) => {
    if (request.url!.endsWith("/send")) {
      sends++;
      if (sends === 1) {
        landingTimer = setTimeout(() => {
          landed.push({
            msgId: "original-delivery",
            sentAt: new Date().toISOString(),
          });
        }, 1600);
        response.writeHead(504, { "content-type": "application/json" });
        response.end('{"code":"NETWORK_TIMEOUT"}');
      } else {
        // The gateway deliberately does not deduplicate clientMsgId.
        landed.push({
          msgId: `duplicate-${sends}`,
          sentAt: new Date().toISOString(),
        });
        response.writeHead(202, { "content-type": "application/json" });
        response.end('{"accepted":true}');
      }
      return;
    }
    const snapshot = landed[0];
    const query = {
      startedAt: Date.now(),
      respondedAt: 0,
      found: Boolean(snapshot),
    };
    queries.push(query);
    // Capture absence before convergence, but return that old observation after it.
    if (queries.length === 1)
      await new Promise((resolve) => setTimeout(resolve, 1550));
    query.respondedAt = Date.now();
    response.writeHead(snapshot ? 200 : 404, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(snapshot ?? { code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  f.ctx.gateway = new RemoteClient(`http://127.0.0.1:${address.port}`);
  try {
    const message = await f.messages.enqueueSend({
      groupId: "g",
      accountId: "account-2",
      text: "confirm a delayed negative response",
    });
    await f.messages.accountWork("account-2");
    const timeoutAt = (
      await f.db.query<{ timeout_at: Date }>(
        "SELECT timeout_at FROM messages WHERE id=$1",
        [message.id],
      )
    ).rows[0]!.timeout_at.getTime();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await f.messages.accountWork("account-2");
    assert.equal(queries[0]!.found, false);
    assert.ok(queries[0]!.startedAt - timeoutAt < 2000);
    assert.ok(queries[0]!.respondedAt - timeoutAt >= 2100);
    assert.equal(
      landed.length,
      1,
      "the original delivery lands while the old negative response is in flight",
    );
    const pending = (
      await f.db.query<{
        dispatch_state: string;
        metadata: Record<string, unknown>;
      }>("SELECT dispatch_state,metadata FROM messages WHERE id=$1", [
        message.id,
      ])
    ).rows[0]!;
    assert.equal(pending.dispatch_state, "uncertain");
    assert.equal(pending.metadata.timeoutRetries, undefined);
    // No SSE event is delivered; confirmation must come from a fresh query.
    await f.messages.accountWork("account-2");
    await f.messages.accountWork("account-2");
    assert.equal(
      (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
      "sent",
    );
    assert.equal(
      sends,
      1,
      "an old negative observation must never authorize another POST",
    );
    assert.equal(landed.length, 1);
    assert.ok(queries[1]!.startedAt - timeoutAt >= 2100);
    assert.equal(
      (await f.messages.getMessage(message.clientMsgId!))?.msgId,
      "original-delivery",
    );
    assert.equal(
      (await f.db.query("SELECT * FROM gateway_events")).rowCount,
      0,
    );
  } finally {
    clearTimeout(landingTimer);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("崩溃发送意图恢复为unknown，没有已知504不得重发", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "uncertain",
  });
  await f.db.query(
    "UPDATE messages SET dispatch_state='sending' WHERE client_msg_id=$1",
    [message.clientMsgId],
  );
  await f.messages.recover();
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "unknown",
  );
  assert.equal(f.gateway.sends.length, 0);
});

test("发送持锁连接丢失后新worker就地接管，旧worker不能写accepted或重发", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  let release!: () => void;
  f.gateway.sendBarrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ownerPid = 0;
  const withLock = f.db.withLock.bind(f.db);
  f.db.withLock = async <T>(
    key: string,
    work: (client: pg.PoolClient, signal: AbortSignal) => Promise<T>,
  ) =>
    withLock(key, async (client, signal) => {
      ownerPid = (
        await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      return work(client, signal);
    });
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "lost connection",
  });
  const oldWorker = f.messages.accountWork("account-2");
  const oldRejected = assert.rejects(
    oldWorker,
    /terminating connection|connection.*terminated/i,
  );
  while (f.gateway.sends.length === 0)
    await new Promise((resolve) => setTimeout(resolve, 1));
  await f.db.query("SELECT pg_terminate_backend($1)", [ownerPid]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Messages(f.ctx).accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "unknown",
  );
  release();
  await oldRejected;
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "unknown",
  );
  assert.equal(f.gateway.sends.length, 1);
  await f.events.process({
    eventId: 400,
    type: "message_sent",
    clientMsgId: message.clientMsgId!,
    msgId: "confirmed-later",
    sentAt: new Date().toISOString(),
  });
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "sent",
  );
});

test("第二实例启动不能把活跃worker的发送标记为恢复未知", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  let release!: () => void;
  f.gateway.sendBarrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "live",
  });
  const active = f.messages.accountWork("account-2");
  while (f.gateway.sends.length === 0)
    await new Promise((resolve) => setTimeout(resolve, 1));
  await new Messages(f.ctx).recover();
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "queued",
  );
  release();
  await active;
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "accepted",
  );
});

test("504查询不可用期间保持unknown，恢复后确认不会重复发出", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.sendModes = ["timeout-sent"];
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "query unavailable",
  });
  await f.messages.accountWork("account-2");
  f.gateway.queryUnavailable = true;
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "unknown",
  );
  f.gateway.queryUnavailable = false;
  await f.messages.accountWork("account-2");
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.deliveryStatus,
    "sent",
  );
  assert.equal(f.gateway.sends.length, 1);
});

test("已sent补投和重复确认不会重写首次确认时间", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "stable time",
  });
  const sent = {
    eventId: 21,
    type: "message_sent" as const,
    clientMsgId: message.clientMsgId!,
    msgId: "m",
    sentAt: new Date().toISOString(),
  };
  await f.events.process(sent);
  const before = (
    await f.db.query<{ updated_at: Date }>(
      "SELECT updated_at FROM messages WHERE id=$1",
      [message.id],
    )
  ).rows[0]!.updated_at;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await f.events.process({ ...sent, eventId: 22 });
  assert.equal(
    (
      await f.db.query<{ updated_at: Date }>(
        "SELECT updated_at FROM messages WHERE id=$1",
        [message.id],
      )
    ).rows[0]!.updated_at.getTime(),
    before.getTime(),
  );
});

test("kick同步终态错误也执行成员清理与取消，群错误只改变群", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.kickMode = "suspended";
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "queued",
  });
  await assert.rejects(
    f.messages.kick({
      groupId: "g",
      accountId: "account-2",
      targetPlatformUserId: "external",
    }),
    { code: "ACCOUNT_SUSPENDED" },
  );
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.failCode,
    "ACCOUNT_TERMINAL",
  );
  assert.equal(
    (await f.db.query("SELECT status FROM accounts WHERE id='account-2'"))
      .rows[0]!.status,
    "suspended",
  );
  f.gateway.kickMode = "forbidden";
  await assert.rejects(
    f.messages.kick({
      groupId: "g",
      accountId: "account-1",
      targetPlatformUserId: "external",
    }),
    { code: "GROUP_WRITE_FORBIDDEN" },
  );
  assert.equal(
    (await f.db.query("SELECT status FROM groups WHERE id='g'")).rows[0]!
      .status,
    "unreachable",
  );
});

test("kick调用方预算贯穿HTTP请求、504收敛等待和成员查询，未知时不删除成员", async (t) => {
  for (const phase of ["post", "settle", "query"] as const) {
    const f = await fixture(t);
    await f.seedGroup();
    await f.db.query(
      "INSERT INTO members(group_id,platform_user_id,role) VALUES('g','external','member')",
    );
    const controller = new AbortController();
    const calls: string[] = [];
    const budget = new Error("budget exhausted");
    const server = createServer((request, response) => {
      calls.push(request.url!);
      if (request.url!.endsWith("/kick")) {
        if (phase === "post") {
          response.writeHead(200);
          response.write(" ");
        } else {
          response.writeHead(504, { "content-type": "application/json" });
          response.end('{"code":"NETWORK_TIMEOUT"}');
        }
        if (phase !== "query") setTimeout(() => controller.abort(budget), 20);
      } else {
        response.writeHead(200);
        response.write(" ");
        setTimeout(() => controller.abort(budget), 20);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    f.ctx.gateway = new RemoteClient(`http://127.0.0.1:${address.port}`);
    const safetyTimer = setTimeout(() => controller.abort(budget), 5000);
    try {
      const started = performance.now();
      await assert.rejects(
        f.messages.kick(
          {
            groupId: "g",
            accountId: "account-2",
            targetPlatformUserId: "external",
          },
          { signal: controller.signal },
        ),
        /budget exhausted|aborted/i,
      );
      assert.ok(
        performance.now() - started < (phase === "query" ? 3000 : 1000),
      );
      assert.equal(calls.filter((path) => path.endsWith("/kick")).length, 1);
      assert.equal(
        calls.filter((path) => path.endsWith("/members")).length,
        phase === "query" ? 1 : 0,
      );
      assert.equal(
        (
          await f.db.query(
            "SELECT * FROM members WHERE platform_user_id='external'",
          )
        ).rowCount,
        1,
      );
    } finally {
      clearTimeout(safetyTimer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

test("kick已确认删除等待群投影事务，旧成员快照不能覆盖删除结果", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  await f.db.query(
    "INSERT INTO members(group_id,platform_user_id,role) VALUES('g','external','member')",
  );
  f.gateway.remoteMembers.get("remote-g")!.add("external");
  const observer = await f.db.pool.connect();
  let committed = false;
  let kicking: Promise<unknown> | undefined;
  try {
    const pid = (
      await observer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    await observer.query("BEGIN");
    await observer.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
    kicking = f.messages.kick({
      groupId: "g",
      accountId: "account-2",
      targetPlatformUserId: "external",
    });
    const deadline = Date.now() + 2000;
    let blocked = false;
    while (Date.now() < deadline) {
      blocked = (
        await f.db.query<{ blocked: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked",
          [pid],
        )
      ).rows[0]!.blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(
      blocked,
      "local removal must wait for the preceding group projection",
    );
    assert.equal(
      f.gateway.remoteMembers.get("remote-g")!.has("external"),
      false,
    );
    // A membership reader that began before kick may still have this older view.
    await observer.query(
      "INSERT INTO members(group_id,platform_user_id,role) VALUES('g','external','member') ON CONFLICT(group_id,platform_user_id) DO UPDATE SET role='member'",
    );
    await observer.query("COMMIT");
    committed = true;
    assert.deepEqual(await kicking, { kicked: true });
    assert.equal(
      (
        await f.db.query(
          "SELECT * FROM members WHERE group_id='g' AND platform_user_id='external'",
        )
      ).rowCount,
      0,
    );
  } finally {
    if (!committed) await observer.query("ROLLBACK");
    observer.release();
    if (kicking) await kicking.catch(() => undefined);
  }
});

test("真实PG双实例发送互斥，单个outbox只调用一次远端", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "one",
  });
  const second = new Messages(f.ctx);
  await Promise.all([
    f.messages.accountWork("account-2"),
    second.accountWork("account-2"),
  ]);
  assert.equal(f.gateway.sends.length, 1);
});

test("群不可写原子停止序列并取消Agent，不改变账号", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  const message = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "queued",
  });
  await f.seedSequence(message.clientMsgId!);
  await f.db.query("INSERT INTO agent_runs(id,group_id) VALUES('ar','g')");
  await f.db.transaction((tx) => markGroupUnreachable(tx, "g"));
  assert.equal(
    (await f.db.query("SELECT status FROM sequence_runs WHERE id='sr'"))
      .rows[0]!.status,
    "stopped",
  );
  assert.equal(
    (await f.db.query("SELECT cancel_requested FROM agent_runs WHERE id='ar'"))
      .rows[0]!.cancel_requested,
    true,
  );
  assert.equal(
    (await f.db.query("SELECT status FROM accounts WHERE id='account-2'"))
      .rows[0]!.status,
    "online",
  );
  assert.equal(
    (await f.messages.getMessage(message.clientMsgId!))?.failCode,
    "GROUP_UNREACHABLE",
  );
});

test("真实PG事件写失败后重放，乱序eventId与任意历史补投均保留", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  await f.db.query(
    "CREATE FUNCTION reject_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'write unavailable'; END $$; CREATE TRIGGER reject_message BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION reject_message()",
  );
  const older = {
    eventId: 2,
    type: "message" as const,
    groupId: "remote-g",
    msgId: "older",
    senderPlatformUserId: "external",
    text: "old",
    sentAt: "2020-01-01T00:00:00.000Z",
  };
  await f.events.process(older);
  assert.equal(
    (await f.db.query("SELECT * FROM gateway_events WHERE event_id=2"))
      .rowCount,
    0,
  );
  await f.db.query("DROP TRIGGER reject_message ON messages");
  await f.events.process({
    ...older,
    eventId: 3,
    msgId: "newer",
    sentAt: new Date().toISOString(),
  });
  await f.events.retryFailed();
  await f.events.process(older);
  assert.equal((await f.db.query("SELECT * FROM messages")).rowCount, 2);
  assert.equal(
    (await f.db.query("SELECT * FROM events WHERE type='inconsistency'"))
      .rowCount,
    1,
  );
});

test("建群包括creator/admin，过期链接重申，promote仅一次", async (t) => {
  const f = await fixture(t);
  for (const id of ["account-1", "account-2", "account-3"])
    await f.accounts.connect(id);
  f.gateway.joinMode = "expire-once";
  const { jobId } = await f.jobs.createGroup("account-1", [
    "account-2",
    "account-3",
  ]);
  for (let i = 0; i < 15; i++) await f.jobs.advance(jobId);
  assert.equal((await f.jobs.get(jobId)).status, "finished");
  const rows = (
    await f.db.query("SELECT account_id,role FROM members ORDER BY account_id")
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.role),
    ["creator", "admin", "member"],
  );
  assert.equal(f.gateway.promoteCount, 1);
});

test("邀请ready时间前不join，ALREADY_MEMBER无需等待事件，可重试一次promote", async (t) => {
  const f = await fixture(t);
  for (const id of ["account-1", "account-2"]) await f.accounts.connect(id);
  f.gateway.inviteReadyMs = 100;
  f.gateway.joinMode = "already";
  f.gateway.promoteFailures = 1;
  const { jobId } = await f.jobs.createGroup("account-1", ["account-2"]);
  await f.jobs.advance(jobId);
  await f.jobs.advance(jobId);
  await f.jobs.advance(jobId);
  assert.equal(f.gateway.joinCount, 0);
  await new Promise((resolve) => setTimeout(resolve, 120));
  for (let i = 0; i < 8; i++) {
    await f.jobs.advance(jobId);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await f.jobs.get(jobId)).status, "finished");
  assert.equal(f.gateway.promoteCount, 2);
});

test("建群远端成功但本地写失败时记录待确认，禁止重复创建", async (t) => {
  const f = await fixture(t);
  for (const id of ["account-1", "account-2"]) await f.accounts.connect(id);
  await f.db.query(
    "CREATE FUNCTION reject_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'database write failed'; END $$; CREATE TRIGGER reject_group BEFORE INSERT ON groups FOR EACH ROW EXECUTE FUNCTION reject_group()",
  );
  const { jobId } = await f.jobs.createGroup("account-1", ["account-2"]);
  await f.jobs.advance(jobId);
  await f.db.query("DROP TRIGGER reject_group ON groups");
  await f.jobs.advance(jobId);
  assert.equal(
    f.gateway.calls.filter((call) => call.path === "/groups").length,
    1,
  );
  assert.equal((await f.jobs.get(jobId)).status, "running");
  assert.ok((await f.jobs.get(jobId)).recoveryNote);
  assert.equal((await f.db.query("SELECT * FROM groups")).rowCount, 0);
});

test("join事件超过10秒未到，任务失败且不提前promote", async (t) => {
  const f = await fixture(t);
  await f.accounts.connect("account-1");
  await f.accounts.connect("account-2");
  f.gateway.joinMode = "never";
  const { jobId } = await f.jobs.createGroup("account-1", ["account-2"]);
  await f.jobs.advance(jobId);
  await f.jobs.advance(jobId);
  await f.jobs.advance(jobId);
  await f.db.query("UPDATE jobs SET state=state || $2::jsonb WHERE id=$1", [
    jobId,
    JSON.stringify({ joinStartedAt: Date.now() - 11000 }),
  ]);
  await f.jobs.advance(jobId);
  assert.deepEqual((await f.jobs.get(jobId)).errors, [
    { step: "join:account-2", code: "JOIN_TIMEOUT" },
  ]);
  assert.equal(f.gateway.promoteCount, 0);
});

test("非群主退出失败继续其他成员，群主不退出", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  f.gateway.leaveFailure = "account-2";
  const { jobId } = await f.jobs.leaveAll("g");
  await f.jobs.advance(jobId);
  assert.equal((await f.jobs.get(jobId)).status, "failed");
  assert.equal((await f.jobs.get(jobId)).processing, true);
  for (let i = 0; i < 5; i++) await f.jobs.advance(jobId);
  assert.equal((await f.jobs.get(jobId)).status, "failed");
  assert.deepEqual(
    (
      await f.db.query("SELECT account_id FROM members ORDER BY account_id")
    ).rows.map((row) => row.account_id),
    ["account-1", "account-2"],
  );
  assert.deepEqual([...f.gateway.remoteMembers.get("remote-g")!].sort(), [
    "p-account-1",
    "p-account-2",
  ]);
  assert.equal(
    f.gateway.calls.filter((call) => call.path.endsWith("/leave")).length,
    2,
  );
});

test("leave-all服务账号全部退出但保留外部用户，left公开视图为空并保存远端证据", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  await createGatewayModule(f.ctx).register(f.app);
  f.gateway.remoteMembers.get("remote-g")!.add("external");
  await f.db.query(
    "INSERT INTO members(group_id,platform_user_id,role) VALUES('g','external','member')",
  );
  const { jobId } = await f.jobs.leaveAll("g");
  for (let i = 0; i < 5; i++) await f.jobs.advance(jobId);
  assert.equal((await f.jobs.get(jobId)).status, "finished");
  assert.deepEqual(
    (await f.app.inject("/api/groups/g")).json<{ members: unknown[] }>()
      .members,
    [],
  );
  assert.deepEqual([...f.gateway.remoteMembers.get("remote-g")!], ["external"]);
  assert.deepEqual(
    (await f.db.query("SELECT state FROM jobs WHERE id=$1", [jobId])).rows[0]!
      .state.gatewayMembersAtCompletion,
    [{ platformUserId: "external" }],
  );
});

test("时间线快照在历史补投和queued.sentAt改写时保持原始分页无重漏", async (t) => {
  const f = await fixture(t);
  await f.seedGroup();
  await createGatewayModule(f.ctx).register(f.app);
  const first = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "first",
  });
  const second = await f.messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "second",
  });
  const one = (await f.app.inject("/api/groups/g/messages?limit=1")).json<{
    items: Message[];
    nextCursor: string;
  }>();
  await f.db.query("UPDATE messages SET sent_at='2000-01-01' WHERE id=$1", [
    second.id,
  ]);
  await f.events.process({
    eventId: 100,
    type: "message",
    groupId: "remote-g",
    msgId: "late",
    senderPlatformUserId: "external",
    text: "backfill",
    sentAt: "1990-01-01T00:00:00.000Z",
  });
  const two = (
    await f.app.inject(
      `/api/groups/g/messages?limit=1&before=${one.nextCursor}`,
    )
  ).json<{ items: Message[]; nextCursor: string | null }>();
  assert.deepEqual(
    new Set([...one.items, ...two.items].map((item) => item.id)),
    new Set([first.id, second.id]),
  );
  assert.equal(two.nextCursor, null);
  assert.equal(
    (await f.app.inject("/api/groups/g/messages")).json<{ items: Message[] }>()
      .items.length,
    3,
  );
});
