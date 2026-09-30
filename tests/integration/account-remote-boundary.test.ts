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
import { emit, withSavepoint } from "../../apps/server/src/core/db.js";

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

async function transientStatusFailures(
  f: Awaited<ReturnType<typeof fixture>>,
  failures: number,
  pause = false,
) {
  await f.db.query(`CREATE SEQUENCE save_attempts;
    CREATE FUNCTION transient_account_save() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF nextval('save_attempts') <= ${failures} THEN
        ${pause ? "PERFORM pg_sleep(0.2);" : ""}
        RAISE EXCEPTION 'temporary local account write failure' USING ERRCODE='40001';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER transient_account_save BEFORE UPDATE OF status ON accounts
    FOR EACH ROW EXECUTE FUNCTION transient_account_save()`);
}

test("KA05 transient local save retries retain the known remote result without reconnecting", async (t) => {
  const f = await fixture(t);
  await transientStatusFailures(f, 1);
  assert.equal((await f.accounts.connect("account-1")).status, "online");
  assert.deepEqual(f.actions, ["connect"]);
  assert.equal((await f.read()).platform_user_id, "p-account-1");
  assert.equal(
    Number(
      (await f.db.query("SELECT last_value FROM save_attempts")).rows[0]!
        .last_value,
    ),
    2,
  );
  const events = (await f.db.query("SELECT type FROM events")).rows;
  assert.deepEqual(
    events.map((e) => e.type),
    ["account_status_changed"],
  );
});

test("KA06 local retry does not turn a disconnect into a reconnect", async (t) => {
  const f = await fixture(t);
  await f.accounts.connect("account-1");
  await transientStatusFailures(f, 2);
  assert.equal(
    (await f.accounts.transition("account-1", "disconnected", "online")).status,
    "disconnected",
  );
  assert.deepEqual(f.actions, ["connect", "disconnect"]);
  assert.equal(f.remoteOnline(), false);
  assert.equal((await f.read()).status, "disconnected");
});

test("KA07 exhausted local attempts preserve failure and do not replay the external operation", async (t) => {
  const f = await fixture(t);
  await transientStatusFailures(f, 10);
  await assert.rejects(
    f.accounts.connect("account-1"),
    /temporary local account write failure/,
  );
  assert.equal(
    Number(
      (await f.db.query("SELECT last_value FROM save_attempts")).rows[0]!
        .last_value,
    ),
    3,
  );
  assert.deepEqual(f.actions, ["connect"]);
  assert.equal((await f.read()).status, "idle");
  assert.equal((await f.read()).platform_user_id, null);
  assert.equal(
    (await f.db.query("SELECT type FROM events")).rows[0]!.type,
    "inconsistency",
  );
});

test("KA08 a newer disconnect waits for local recovery and wins after the connect", async (t) => {
  const f = await fixture(t);
  await transientStatusFailures(f, 1, true);
  const connecting = f.accounts.connect("account-1");
  const deadline = Date.now() + 3000;
  while (!f.actions.includes("connect")) {
    assert.ok(Date.now() < deadline, "connect request reached remote");
    await new Promise((r) => setTimeout(r, 5));
  }
  const disconnecting = f.accounts.transition(
    "account-1",
    "disconnected",
    "online",
  );
  await Promise.all([connecting, disconnecting]);
  assert.deepEqual(f.actions, ["connect", "disconnect"]);
  assert.equal(f.remoteOnline(), false);
  assert.equal((await f.read()).status, "disconnected");
  assert.deepEqual(
    (
      await f.db.query(
        "SELECT payload->>'to' AS state FROM events WHERE type='account_status_changed' ORDER BY seq",
      )
    ).rows.map((r) => r.state),
    ["online", "disconnected"],
  );
});

test("KA09 savepoint rollback discards staged events and SQL while retaining the parent transaction", async (t) => {
  const f = await fixture(t);
  await f.db.transaction(async (tx) => {
    await tx.query("SELECT id FROM accounts WHERE id='account-1' FOR UPDATE");
    await emit(tx, "account_changed", {
      accountId: "account-1",
      changedFields: ["before"],
    });
    await assert.rejects(
      withSavepoint(tx, async () => {
        await tx.query(
          "UPDATE accounts SET platform_user_id='rolled-back' WHERE id='account-1'",
        );
        await emit(tx, "account_changed", {
          accountId: "account-1",
          changedFields: ["rolled-back"],
        });
        throw new Error("rollback child");
      }),
      /rollback child/,
    );
    await withSavepoint(tx, async () => {
      await tx.query(
        "UPDATE accounts SET platform_user_id='kept' WHERE id='account-1'",
      );
      await emit(tx, "account_changed", {
        accountId: "account-1",
        changedFields: ["kept"],
      });
    });
  });
  assert.equal((await f.read()).platform_user_id, "kept");
  assert.deepEqual(
    (await f.db.query("SELECT payload FROM events ORDER BY seq")).rows.map(
      (r) => r.payload.changedFields,
    ),
    [["before"], ["kept"]],
  );
});
