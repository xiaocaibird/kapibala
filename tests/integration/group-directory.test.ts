import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createApp } from "../../apps/server/src/app.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import type {
  Group,
  GroupDirectoryPage,
} from "../../packages/contracts/src/index.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  t.diagnostic(
    `isolated database: ${new URL(temporary.url).pathname.slice(1)}`,
  );
  await migrate(db);
  const app = await createApp({
    db,
    logger: false,
    background: false,
    modules: (ctx) => [createGatewayModule(ctx)],
  });
  temporary.onCleanup(() => app.close());
  async function login(username: "admin" | "viewer") {
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: username },
    });
    assert.equal(result.statusCode, 200);
    return result.json<{ accessToken: string }>().accessToken;
  }
  const token = await login("admin");
  async function get(query: Record<string, string> = {}, access = token) {
    return app.inject({
      method: "GET",
      url: `/api/group-directory?${new URLSearchParams(query)}`,
      headers: { authorization: `Bearer ${access}` },
    });
  }
  async function page(query: Record<string, string> = {}) {
    const result = await get(query);
    assert.equal(result.statusCode, 200, result.body);
    return result.json<GroupDirectoryPage>();
  }
  async function insert(
    id: string,
    createdAt = "2026-01-01T00:00:00.123456Z",
    name: string | null = null,
    description: string | null = null,
    gatewayId = `remote-${id}`,
  ) {
    await db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id,created_at,name,description) VALUES($1,$2,'account-1',$3,$4,$5)",
      [id, gatewayId, createdAt, name, description],
    );
  }
  async function collect(query: Record<string, string>) {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await page({ ...query, ...(cursor ? { cursor } : {}) });
      assert.ok(result.items.length <= Number(query.pageSize ?? 20));
      ids.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      assert.ok(ids.length < 200, "cursor must advance");
    } while (cursor);
    assert.equal(
      new Set(ids).size,
      ids.length,
      "no duplicate ids across pages",
    );
    return ids;
  }
  return { app, db, token, login, get, page, insert, collect };
}

test("group directory: bounded summaries, defaults, and unchanged legacy groups", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,created_at) SELECT 'g-'||lpad(i::text,2,'0'),'remote-'||i,'account-1','2026-01-01'::timestamptz+i*interval '1 second' FROM generate_series(1,55) i",
  );
  await f.db.query("UPDATE groups SET status='left' WHERE id='g-54'");
  await f.db.query("UPDATE groups SET status='unreachable' WHERE id='g-53'");
  await f.db.query("UPDATE groups SET agent_enabled=true WHERE id='g-55'");
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g-55','account-1','owner','creator'),('g-55',NULL,'external','member')",
  );
  await f.db.query(
    "INSERT INTO agent_runs(id,group_id,status,end_reason) VALUES('running-agent','g-55','running',NULL),('old-agent','g-55','finished','final')",
  );
  await f.db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('sequence','test','[]')",
  );
  await f.db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id) VALUES('running-sequence','g-55','sequence')",
  );
  const first = await f.page();
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0]!.id, "g-55");
  assert.deepEqual(first.items[0], {
    id: "g-55",
    name: null,
    description: null,
    createdAt: "2026-01-01T00:00:55.000Z",
    gatewayGroupId: "remote-55",
    status: "active",
    agentEnabled: true,
    memberCount: 2,
    activeAgentRunId: "running-agent",
    activeSequenceRunId: "running-sequence",
  });
  assert.equal(first.items[1]!.status, "left");
  assert.equal(first.items[2]!.status, "unreachable");
  assert.equal(first.items[1]!.memberCount, 0);
  assert.equal(first.items[1]!.activeAgentRunId, null);
  assert.equal(first.items[1]!.activeSequenceRunId, null);
  assert.ok(first.nextCursor);
  assert.equal((await f.page({ pageSize: "50" })).items.length, 50);
  assert.deepEqual(
    await f.collect({ pageSize: "20" }),
    Array.from(
      { length: 55 },
      (_, i) => `g-${String(55 - i).padStart(2, "0")}`,
    ),
  );
  const legacy = await f.app.inject({
    method: "GET",
    url: "/api/groups",
    headers: { authorization: `Bearer ${f.token}` },
  });
  assert.equal(legacy.statusCode, 200);
  const groups = legacy.json<Group[]>();
  assert.equal(groups.length, 55);
  assert.equal(groups[0]!.members.length, 2);
  assert.equal(groups[0]!.creatorAccountId, "account-1");
  assert.equal(groups[0]!.autoKickEnabled, false);
  assert.deepEqual(
    groups.map((g) => g.id),
    await f.collect({ pageSize: "50" }),
  );
  const detail = await f.app.inject({
    method: "GET",
    url: "/api/groups/g-55",
    headers: { authorization: `Bearer ${f.token}` },
  });
  assert.deepEqual(detail.json<Group>(), groups[0]);
});

test("group directory: microsecond boundaries and equal-time IDs have no gaps in either order", async (t) => {
  const f = await fixture(t);
  for (const [id, timestamp] of [
    ["old", "2026-01-01T00:00:00.123001Z"],
    ["z-tie", "2026-01-01T00:00:00.123450Z"],
    ["a-tie", "2026-01-01T00:00:00.123450Z"],
    ["b-tie", "2026-01-01T00:00:00.123450Z"],
    ["new", "2026-01-01T00:00:00.123999Z"],
  ])
    await f.insert(id!, timestamp!);
  for (const pageSize of ["1", "2", "3", "5"]) {
    assert.deepEqual(await f.collect({ pageSize, order: "asc" }), [
      "old",
      "a-tie",
      "b-tie",
      "z-tie",
      "new",
    ]);
    assert.deepEqual(await f.collect({ pageSize, order: "desc" }), [
      "new",
      "a-tie",
      "b-tie",
      "z-tie",
      "old",
    ]);
  }
  const first = await f.page({ pageSize: "1" });
  const cursor = JSON.parse(
    Buffer.from(first.nextCursor!, "base64url").toString("utf8"),
  );
  assert.equal(cursor.createdAt, "2026-01-01T00:00:00.123999Z");
  assert.equal(cursor.id, "new");
  assert.equal((await f.page({ cursor: "" })).items.length, 5);
});

test("group directory: search filters before pagination across all four nullable fields", async (t) => {
  const f = await fixture(t);
  await f.insert("unmatched-newer", "2026-02-01T00:00:00.000001Z");
  await f.insert("name", undefined, "Alpha Project");
  await f.insert("description", undefined, null, "aLpHa pRoJeCt资料");
  await f.insert("remote", undefined, null, null, "gateway-ALPHA PROJECT");
  await f.insert("id-Alpha Project");
  await f.insert("separated", undefined, "Alpha unrelated Project");
  assert.deepEqual(await f.collect({ q: "  alpha project  ", pageSize: "1" }), [
    "description",
    "id-Alpha Project",
    "name",
    "remote",
  ]);
  assert.deepEqual((await f.page({ q: "不存在" })).items, []);
  assert.equal((await f.page({ q: "不存在" })).nextCursor, null);
  const first = await f.page({ q: " alpha project ", pageSize: "1" });
  assert.equal(
    (
      await f.get({
        q: "alpha project",
        pageSize: "1",
        cursor: first.nextCursor!,
      })
    ).statusCode,
    200,
  );
  assert.equal((await f.page({ q: "   " })).items.length, 6);
});

test("group directory: percent underscore backslash SQL text and Chinese are literal search terms", async (t) => {
  const f = await fixture(t);
  await f.insert("literal-a", undefined, "中文 %_\\ 项目", "two  spaces");
  await f.insert("literal-b", undefined, "中文 %_\\ 第二组");
  await f.insert("wildcard-decoy", undefined, "中文 xAy 项目", "two spaces");
  await f.insert("sql", undefined, "x' OR 1=1 --");
  await f.insert("quoted-id-'", undefined, null, "尾部");
  for (const q of ["%", "_", "\\", "%_\\", "中文 %_\\"]) {
    assert.deepEqual(await f.collect({ q, pageSize: "1" }), [
      "literal-a",
      "literal-b",
    ]);
  }
  assert.deepEqual(await f.collect({ q: "two  spaces", pageSize: "1" }), [
    "literal-a",
  ]);
  assert.deepEqual(await f.collect({ q: "x' OR 1=1 --", pageSize: "1" }), [
    "sql",
  ]);
  assert.deepEqual(await f.collect({ q: "quoted-id-'", pageSize: "1" }), [
    "quoted-id-'",
  ]);
});

test("group directory: rejects malformed query and cursor boundaries or changed conditions", async (t) => {
  const f = await fixture(t);
  await f.insert("a", undefined, "query");
  await f.insert("b", undefined, "query");
  const base = { pageSize: "1", order: "desc", q: "query" };
  const valid = (await f.page(base)).nextCursor!;
  const decoded = JSON.parse(Buffer.from(valid, "base64url").toString("utf8"));
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const invalid = [
    "not!base64",
    `${valid}=`,
    "A",
    "a".repeat(16385),
    Buffer.from([255]).toString("base64url"),
    Buffer.from("{").toString("base64url"),
    encode([]),
    encode(null),
    encode({ ...decoded, v: 2 }),
    encode({ ...decoded, extra: true }),
    encode({ ...decoded, id: "" }),
    encode({ ...decoded, id: "a\0" }),
    encode({ ...decoded, createdAt: "2026-02-30T00:00:00.123456Z" }),
    encode({ ...decoded, createdAt: "0000-01-01T00:00:00.123456Z" }),
    encode({ ...decoded, createdAt: "2026-01-01T25:00:00.123456Z" }),
    encode({ ...decoded, createdAt: "2026-01-01T00:00:00.123Z" }),
    encode({ ...decoded, createdAt: "2026-01-01T00:00:00.123456+00:00" }),
    encode({ ...decoded, q: " query " }),
    encode({ ...decoded, q: "x".repeat(501) }),
    encode({ ...decoded, pageSize: "1" }),
    encode({ ...decoded, pageSize: 0 }),
  ];
  for (const cursor of invalid) {
    const result = await f.get({ ...base, cursor });
    assert.equal(result.statusCode, 400, cursor);
    const body = result.json<{ error: { code: string; requestId: string } }>();
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.requestId);
  }
  for (const changed of [
    { q: "different" },
    { q: "QUERY" },
    { order: "asc" },
    { pageSize: "2" },
  ]) {
    assert.equal(
      (await f.get({ ...base, ...changed, cursor: valid })).statusCode,
      400,
    );
  }
  const invalidQueries: Record<string, string>[] = [
    { pageSize: "0" },
    { pageSize: "51" },
    { pageSize: "1.5" },
    { pageSize: "1e1" },
    { pageSize: "-1" },
    { pageSize: "" },
    { order: "ASC" },
    { q: "x".repeat(501) },
    { q: "a\0" },
  ];
  for (const query of invalidQueries)
    assert.equal((await f.get(query)).statusCode, 400, JSON.stringify(query));
  assert.equal((await f.get({ q: ` ${"x".repeat(500)} ` })).statusCode, 200);
  const duplicate = await f.app.inject({
    method: "GET",
    url: "/api/group-directory?pageSize=1&pageSize=2",
    headers: { authorization: `Bearer ${f.token}` },
  });
  assert.equal(duplicate.statusCode, 400);
});

test("group directory: authenticated viewer reads, cursor grants no authority, and writes stay forbidden", async (t) => {
  const f = await fixture(t);
  await f.insert("not-a-uuid:a");
  await f.insert("not-a-uuid:b");
  const viewer = await f.login("viewer");
  const first = await f.page({ pageSize: "1" });
  const second = await f.get(
    { pageSize: "1", cursor: first.nextCursor! },
    viewer,
  );
  assert.equal(second.statusCode, 200);
  assert.equal(second.json<GroupDirectoryPage>().items[0]!.id, "not-a-uuid:b");
  const unauthorized = await f.app.inject({
    method: "GET",
    url: `/api/group-directory?pageSize=1&cursor=${first.nextCursor}`,
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(
    unauthorized.json<{ error: { code: string } }>().error.code,
    "UNAUTHORIZED",
  );
  for (const [method, url, payload] of [
    [
      "POST",
      "/api/groups",
      { creatorAccountId: "account-1", memberAccountIds: ["account-2"] },
    ],
    ["PATCH", "/api/groups/not-a-uuid:a", { name: "denied" }],
    ["POST", "/api/group-directory", {}],
  ] as const) {
    const result = await f.app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${viewer}` },
    });
    assert.equal(result.statusCode, 403);
    assert.equal(
      result.json<{ error: { code: string } }>().error.code,
      "FORBIDDEN",
    );
  }
});

test("group directory: live cursor survives boundary deletion and exposes later inserts", async (t) => {
  const f = await fixture(t);
  await f.insert("a");
  await f.insert("c");
  await f.insert("e");
  const first = await f.page({ pageSize: "1" });
  await f.db.query("DELETE FROM groups WHERE id='a'");
  await f.insert("b");
  await f.insert("before", "2026-01-02T00:00:00.123456Z");
  const second = await f.page({ pageSize: "1", cursor: first.nextCursor! });
  assert.equal(second.items[0]!.id, "b");
  assert.deepEqual(await f.collect({ pageSize: "2" }), [
    "before",
    "b",
    "c",
    "e",
  ]);
});

test("group directory: migration is repeatable and preserves legacy values and microseconds", async (t) => {
  const f = await fixture(t);
  await f.insert("legacy", "2019-01-02T03:04:05.678901Z", null, null);
  await migrate(f.db);
  await migrate(f.db);
  const [row] = (
    await f.db.query(
      "SELECT name,description,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at FROM groups WHERE id='legacy'",
    )
  ).rows;
  assert.deepEqual(row, {
    name: null,
    description: null,
    created_at: "2019-01-02T03:04:05.678901Z",
  });
  const indexes = (
    await f.db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('groups_directory_asc','groups_directory_desc') ORDER BY indexname",
    )
  ).rows;
  assert.deepEqual(
    indexes.map((i) => i.indexname),
    ["groups_directory_asc", "groups_directory_desc"],
  );
});
