import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createApp } from "../../apps/server/src/app.js";
import type { Database } from "../../apps/server/src/core/db.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import type { Group } from "../../packages/contracts/src/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `Independent database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(db);
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description,agent_enabled,auto_kick_enabled) VALUES('g','remote-g','account-1','原名称','原简介',true,true)",
  );
  await db.query("INSERT INTO agent_runs(id,group_id) VALUES('run','g')");
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  for (let i = 0; i < 2; i++) {
    const app = await createApp({
      db,
      logger: false,
      background: false,
      modules: (ctx) => [createGatewayModule(ctx)],
    });
    temporary.onCleanup(() => app.close());
    apps.push(app);
  }
  async function login(username: "admin" | "viewer") {
    const response = await apps[0]!.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: username },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<{ accessToken: string }>().accessToken;
  }
  const token = await login("admin");
  async function patch(payload: unknown, instance = 0, access = token) {
    return apps[instance]!.inject({
      method: "PATCH",
      url: "/api/groups/g",
      headers: { authorization: `Bearer ${access}` },
      payload: payload as never,
    });
  }
  async function state() {
    return {
      group: (await db.query("SELECT * FROM groups WHERE id='g'")).rows[0]!,
      run: (await db.query("SELECT * FROM agent_runs WHERE id='run'")).rows[0]!,
      events: (await db.query("SELECT * FROM events ORDER BY seq")).rows,
    };
  }
  return { db, apps, token, patch, login, state };
}

async function overlap<T>(db: Database, operations: (() => Promise<T>)[]) {
  const blocker = await db.pool.connect();
  let pending: Promise<T>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
    pending = operations.map((operation) => operation());
    const deadline = Date.now() + 3000;
    let waiting = 0;
    while (Date.now() < deadline) {
      waiting = (
        await db.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT * FROM groups WHERE id=$1 FOR UPDATE'",
        )
      ).rowCount!;
      if (waiting >= operations.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      waiting,
      operations.length,
      "both API instances must wait on the group row",
    );
    await blocker.query("COMMIT");
    return await Promise.all(pending);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(pending);
  }
}

test("group profile conflict: same-field concurrent edits across instances have one winner", async (t) => {
  const f = await fixture(t);
  const replies = await overlap(f.db, [
    () => f.patch({ name: "名称 A", expected: { name: "原名称" } }, 0),
    () => f.patch({ name: "名称 B", expected: { name: "原名称" } }, 1),
  ]);
  assert.deepEqual(replies.map((reply) => reply.statusCode).sort(), [200, 409]);
  const winner = replies
    .find((reply) => reply.statusCode === 200)!
    .json<Group>();
  const error = replies.find((reply) => reply.statusCode === 409)!.json().error;
  assert.equal(error.code, "GROUP_PROFILE_CONFLICT");
  assert.equal(
    error.message,
    "群资料已被其他人修改，请比较最新内容后重新确认。",
  );
  assert.equal(typeof error.requestId, "string");
  assert.deepEqual(error.current, { name: winner.name, description: "原简介" });
  assert.deepEqual(error.conflictingFields, ["name"]);
  const final = await f.state();
  assert.equal(final.group.name, winner.name);
  assert.equal(final.group.description, "原简介");
  assert.equal(final.run.cancel_requested, false);
  assert.deepEqual(
    final.events.map((event) => [event.type, event.payload]),
    [["group_changed", { groupId: "g", changedFields: ["name"] }]],
  );
});

test("group profile conflict: independent fields can commit concurrently", async (t) => {
  const f = await fixture(t);
  const replies = await overlap(f.db, [
    () => f.patch({ name: " 新名称 ", expected: { name: "原名称" } }, 0),
    () =>
      f.patch(
        { description: " 新简介 ", expected: { description: "原简介" } },
        1,
      ),
  ]);
  replies.forEach((reply) => assert.equal(reply.statusCode, 200, reply.body));
  const final = await f.state();
  assert.equal(final.group.name, "新名称");
  assert.equal(final.group.description, "新简介");
  assert.deepEqual(
    final.events.map((event) => event.payload.changedFields).sort(),
    [["description"], ["name"]],
  );
});

test("group profile conflict: a stale field rolls back the whole patch without events or Agent cancellation", async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  for (const expected of [
    { name: "旧名称", description: "原简介" },
    { name: "原名称", description: "旧简介" },
    { name: "旧名称", description: "旧简介" },
  ]) {
    const response = await f.patch({
      name: "目标名称",
      description: "目标简介",
      agentEnabled: false,
      autoKickEnabled: false,
      expected,
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.deepEqual(response.json().error.current, {
      name: "原名称",
      description: "原简介",
    });
    assert.deepEqual(
      response.json().error.conflictingFields,
      (["name", "description"] as const).filter(
        (field) => expected[field] !== before.group[field],
      ),
    );
    assert.deepEqual(await f.state(), before);
  }
});

test("group profile conflict: null and raw original values are compared without normalization", async (t) => {
  const f = await fixture(t);
  await f.db.query("UPDATE groups SET name=NULL,description=NULL WHERE id='g'");
  let response = await f.patch({
    name: " 名称 ",
    description: " 简介 ",
    expected: { name: null, description: null },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json<Group>().name, "名称");
  assert.equal(response.json<Group>().description, "简介");
  response = await f.patch({
    description: " \n ",
    expected: { description: "简介" },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json<Group>().description, null);
  response = await f.patch({
    description: "new",
    expected: { description: "" },
  });
  assert.equal(response.statusCode, 409, response.body);
  assert.deepEqual(response.json().error.current, {
    name: "名称",
    description: null,
  });
  for (const raw of ["", " \n ", "  legacy \n", "x".repeat(501)]) {
    await f.db.query("UPDATE groups SET name=$1,description=$1 WHERE id='g'", [
      raw,
    ]);
    if (raw !== raw.trim()) {
      const stale = await f.patch({
        name: "new",
        expected: { name: raw.trim() },
      });
      assert.equal(stale.statusCode, 409, stale.body);
      assert.equal(stale.json().error.current.name, raw);
    }
    const exact = await f.patch({
      name: "  目标名称 ",
      description: " \n ",
      expected: { name: raw, description: raw },
    });
    assert.equal(exact.statusCode, 200, exact.body);
    assert.equal(exact.json<Group>().name, "目标名称");
    assert.equal(exact.json<Group>().description, null);
  }
});

test("group profile conflict: expected is strict nonempty and matches precisely the supplied profile fields", async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  const invalid = [
    ...[
      null,
      [],
      "原名称",
      1,
      {},
      { name: 1 },
      { name: {} },
      { name: [] },
      { name: "原名称", extra: "value" },
      { name: "原名称", agentEnabled: true },
      { description: "原简介" },
      { name: "原名称", description: "原简介" },
    ].map((expected) => ({ name: "new", expected })),
    { name: "new", description: "new", expected: { name: "原名称" } },
    { name: "new", description: "new", expected: { description: "原简介" } },
    { description: "new", expected: { description: false } },
    { agentEnabled: false, expected: {} },
    { agentEnabled: false, expected: { name: "原名称" } },
    { expected: { name: "原名称" } },
    ...[null, "", "  ", "x".repeat(81)].map((name) => ({
      name,
      expected: { name: "原名称" },
    })),
    ...[null, "x".repeat(501)].map((description) => ({
      description,
      expected: { description: "原简介" },
    })),
  ];
  for (const payload of invalid) {
    const response = await f.patch(payload);
    assert.equal(
      response.statusCode,
      400,
      `${JSON.stringify(payload)}: ${response.body}`,
    );
    assert.equal(response.json().error.code, "VALIDATION_ERROR");
  }
  assert.deepEqual(await f.state(), before);
});

test("group profile conflict: legacy requests and successful mixed settings retain existing behavior", async (t) => {
  const f = await fixture(t);
  for (const name of ["legacy A", "legacy B"]) {
    const response = await f.patch({ name });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json<Group>().name, name);
    assert.equal(response.json<Group>().description, "原简介");
  }
  const beforeNoop = await f.state();
  assert.equal(
    (await f.patch({ name: " legacy B ", expected: { name: "legacy B" } }))
      .statusCode,
    200,
  );
  assert.deepEqual(await f.state(), beforeNoop);
  const response = await f.patch({
    description: "",
    expected: { description: "原简介" },
    agentEnabled: false,
    autoKickEnabled: false,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json<Group>().name, "legacy B");
  assert.equal(response.json<Group>().description, null);
  const after = await f.state();
  assert.equal(after.group.agent_enabled, false);
  assert.equal(after.group.auto_kick_enabled, false);
  assert.equal(after.run.cancel_requested, true);
  assert.deepEqual(after.events.at(-1)!.payload.changedFields, [
    "description",
    "agentEnabled",
    "autoKickEnabled",
  ]);
  assert.equal((await f.patch({ agentEnabled: true })).statusCode, 200);
});

test("group profile conflict: viewer and unauthenticated requests cannot mutate or inspect conflict details", async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  const viewer = await f.login("viewer");
  const payload = { name: "denied", expected: { name: "stale" } };
  const denied = await f.patch(payload, 0, viewer);
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(denied.json().error.current, undefined);
  const anonymous = await f.apps[0]!.inject({
    method: "PATCH",
    url: "/api/groups/g",
    payload,
  });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const read = await f.apps[0]!.inject({
    method: "GET",
    url: "/api/groups/g",
    headers: { authorization: `Bearer ${viewer}` },
  });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.json<Group>().name, "原名称");
  const missing = await f.apps[0]!.inject({
    method: "PATCH",
    url: "/api/groups/missing",
    payload,
    headers: { authorization: `Bearer ${f.token}` },
  });
  assert.equal(missing.statusCode, 404, missing.body);
  assert.deepEqual(await f.state(), before);
});

test("Agent disable transaction rolls back profile and delegated cancellation when event persistence fails", async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  await f.db.query(
    `CREATE FUNCTION reject_group_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='group_changed' THEN RAISE EXCEPTION 'controlled event persistence failure'; END IF; RETURN NEW; END $$`,
  );
  await f.db.query(
    "CREATE TRIGGER reject_group_change BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION reject_group_change()",
  );
  const response = await f.patch({
    agentEnabled: false,
    name: "must rollback",
    expected: { name: "原名称" },
  });
  assert.equal(response.statusCode, 500, response.body);
  assert.deepEqual(
    await f.state(),
    before,
    "profile, cancellation and event must share one transaction",
  );
});
