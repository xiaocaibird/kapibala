import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import { createApp } from "../../apps/server/src/app.js";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { Accounts } from "../../apps/server/src/modules/gateway/accounts.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  await migrate(temporary.db);
  const remote = Fastify({ logger: false });
  temporary.onCleanup(() => remote.close());
  const actions: string[] = [];
  let online = false;
  remote.post("/accounts/account-1/connect", async () => {
    actions.push("connect");
    online = true;
    return { platformUserId: "p-account-1" };
  });
  remote.post("/accounts/account-1/disconnect", async () => {
    actions.push("disconnect");
    online = false;
    return {};
  });
  const address = await remote.listen({ host: "127.0.0.1", port: 0 });
  const ctx: AppContext = {
    db: temporary.db,
    gateway: new RemoteClient(address),
    agent: new RemoteClient(address),
    log: remote.log,
  };
  const accounts = new Accounts(ctx);
  async function rejectStatusUpdate() {
    await temporary.db
      .query(`CREATE FUNCTION fail_account_save() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected account status persistence failure'; END $$;
      CREATE TRIGGER fail_account_save BEFORE UPDATE OF status ON accounts
      FOR EACH ROW EXECUTE FUNCTION fail_account_save()`);
  }
  const read = async () =>
    (await temporary.db.query("SELECT * FROM accounts WHERE id='account-1'"))
      .rows[0]!;
  return {
    ...temporary,
    ctx,
    accounts,
    rejectStatusUpdate,
    read,
    actions,
    remoteOnline: () => online,
  };
}

for (const source of ["connect", "transition"] as const) {
  test(`KA01 ${source} confirms remote connection but local rollback is visible without a second remote call`, async (t) => {
    const f = await fixture(t);
    await f.rejectStatusUpdate();
    await assert.rejects(
      source === "connect"
        ? f.accounts.connect("account-1")
        : f.accounts.transition("account-1", "online", "idle"),
      /injected account status persistence failure/,
    );
    assert.deepEqual(f.actions, ["connect"]);
    assert.equal(f.remoteOnline(), true, "remote HTTP side effect happened");
    const local = await f.read();
    assert.equal(local.status, "idle");
    assert.equal(
      local.platform_user_id,
      null,
      "the identity write rolls back with status",
    );
    const event = (
      await f.db.query("SELECT type,payload FROM events ORDER BY seq")
    ).rows;
    assert.equal(event.length, 1);
    assert.equal(event[0]!.type, "inconsistency");
    assert.equal(event[0]!.payload.kind, "account_result_unknown");
    assert.equal(event[0]!.payload.ref, "account-1");
  });
}

test("KA02 disconnect confirms remote offline but local rollback is visible without a compensation", async (t) => {
  const f = await fixture(t);
  await f.accounts.connect("account-1");
  await f.rejectStatusUpdate();
  await assert.rejects(
    f.accounts.transition("account-1", "disconnected", "online"),
    /injected account status persistence failure/,
  );
  assert.deepEqual(f.actions, ["connect", "disconnect"]);
  assert.equal(f.remoteOnline(), false);
  assert.equal((await f.read()).status, "online");
  const events = (
    await f.db.query("SELECT type,payload FROM events ORDER BY seq")
  ).rows;
  assert.equal(
    events.filter((event) => event.type === "account_status_changed").length,
    1,
    "only the prior successful connect publishes a state transition",
  );
  assert.equal(events.at(-1)!.type, "inconsistency");
  assert.equal(events.at(-1)!.payload.kind, "account_result_unknown");
});

test("KA03 warning persistence failure preserves the original error and logs both failures", async (t) => {
  const f = await fixture(t);
  await f.rejectStatusUpdate();
  const logs: { details: unknown; message: string }[] = [];
  t.mock.method(f.ctx.log, "error", (details: unknown, message: string) => {
    logs.push({ details, message });
  });
  const transaction = f.db.transaction.bind(f.db);
  let transactions = 0;
  t.mock.method(
    f.db,
    "transaction",
    async (...args: Parameters<typeof transaction>) => {
      if (++transactions > 1)
        throw new Error("injected warning database outage");
      return transaction(...args);
    },
  );
  await assert.rejects(
    f.accounts.connect("account-1"),
    /injected account status persistence failure/,
  );
  assert.equal(f.remoteOnline(), true);
  assert.deepEqual(f.actions, ["connect"]);
  assert.equal(logs.length, 2);
  assert.match(logs[0]!.message, /保存未确认/);
  assert.match(logs[1]!.message, /提示未能持久化/);
});

test("KA04 public account API returns a failure and retains existing authorization on persistence mismatch", async (t) => {
  const f = await fixture(t);
  const app = await createApp({
    db: f.db,
    logger: false,
    background: false,
    modules: (context) => [
      createGatewayModule({ ...context, gateway: f.ctx.gateway }),
    ],
  });
  f.onCleanup(() => app.close());
  await f.rejectStatusUpdate();
  const unauthenticated = await app.inject({
    method: "POST",
    url: "/api/accounts/account-1/connect",
    payload: {},
  });
  assert.equal(unauthenticated.statusCode, 401);
  const login = async (username: string) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username, password: username },
      })
    ).json<{ accessToken: string }>().accessToken;
  const viewer = await app.inject({
    method: "POST",
    url: "/api/accounts/account-1/connect",
    payload: {},
    headers: { authorization: `Bearer ${await login("viewer")}` },
  });
  assert.equal(viewer.statusCode, 403);
  assert.deepEqual(f.actions, []);
  const admin = await app.inject({
    method: "POST",
    url: "/api/accounts/account-1/connect",
    payload: {},
    headers: { authorization: `Bearer ${await login("admin")}` },
  });
  assert.equal(admin.statusCode, 500);
  assert.equal(
    admin.json<{ error: { code: string } }>().error.code,
    "INTERNAL_ERROR",
  );
  const event = (
    await f.db.query("SELECT payload FROM events WHERE type='inconsistency'")
  ).rows[0]!.payload;
  assert.deepEqual(Object.keys(event).sort(), ["kind", "message", "ref"]);
  assert.equal(event.ref, "account-1");
  assert.ok(
    !JSON.stringify(event).includes("injected"),
    "public warning must omit database diagnostics",
  );
});
