import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, type TestContext } from "node:test";
import { createApp } from "../../apps/server/src/app.js";
import type { AppContext } from "../../apps/server/src/core/context.js";
import { RemoteError } from "../../apps/server/src/core/errors.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { Jobs } from "../../apps/server/src/modules/gateway/jobs.js";
import { migrate } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";
import type { Group } from "../../packages/contracts/src/index.js";

class GroupGateway extends RemoteClient {
  calls: { path: string; body: unknown }[] = [];
  members = new Set<string>();
  constructor() {
    super("http://unused.invalid");
  }
  override async request<T>(path: string, body?: unknown): Promise<T> {
    this.calls.push({ path, body });
    const input = body as { creatorAccountId?: string; accountId?: string };
    if (path === "/groups") {
      this.members.add(input.creatorAccountId!);
      return { groupId: randomUUID() } as T;
    }
    if (path.endsWith("/invite"))
      return { inviteLink: "invite", readyAfterMs: 0 } as T;
    if (path.endsWith("/join")) {
      this.members.add(input.accountId!);
      throw new RemoteError(409, "ALREADY_MEMBER");
    }
    if (path.endsWith("/members"))
      return [...this.members].map((platformUserId) => ({
        platformUserId,
      })) as T;
    if (path.endsWith("/promote")) return {} as T;
    throw new Error(`Unexpected gateway call: ${path}`);
  }
}
async function fixture(t: TestContext) {
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  await migrate(db);
  await db.query("UPDATE accounts SET status='online',platform_user_id=id");
  const gateway = new GroupGateway();
  let context!: AppContext;
  async function build() {
    const app = await createApp({
      db,
      logger: false,
      background: false,
      modules: (ctx) => {
        context = { ...ctx, gateway };
        return [createGatewayModule(context)];
      },
    });
    temporary.onCleanup(() => app.close());
    return app;
  }
  let app = await build();
  async function login(username = "admin") {
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: username },
    });
    assert.equal(result.statusCode, 200);
    return result.json<{ accessToken: string }>().accessToken;
  }
  const token = await login();
  async function api(
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
    access = token,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${access}` },
      ...(payload === undefined ? {} : { payload: payload as never }),
    });
  }
  async function resume(jobId: string) {
    await app.close();
    app = await build();
    const restartedJobs = new Jobs(context);
    for (
      let i = 0;
      i < 10 && (await restartedJobs.get(jobId)).status === "running";
      i++
    )
      await restartedJobs.advance(jobId);
    assert.equal((await restartedJobs.get(jobId)).status, "finished");
    return (await api("GET", "/api/groups")).json<Group[]>()[0]!;
  }
  return { db, gateway, api, login, resume };
}
const createInput = {
  creatorAccountId: "account-1",
  memberAccountIds: ["account-2"],
};

test("group metadata: omitted fields remain compatible and named jobs survive reconstruction", async (t) => {
  for (const profile of [
    {},
    { name: "  项目群  ", description: "  用于交流项目进度。  " },
    { description: " \n " },
  ]) {
    await t.test(JSON.stringify(profile), async (t) => {
      const f = await fixture(t);
      const response = await f.api("POST", "/api/groups", {
        ...createInput,
        ...profile,
      });
      assert.equal(response.statusCode, 202, response.body);
      const { jobId } = response.json<{ jobId: string }>();
      const job = (
        await f.db.query("SELECT state FROM jobs WHERE id=$1", [jobId])
      ).rows[0]!;
      assert.equal(job.state.name ?? null, "name" in profile ? "项目群" : null);
      assert.equal(
        job.state.description ?? null,
        "name" in profile ? "用于交流项目进度。" : null,
      );
      assert.equal((await f.db.query("SELECT id FROM groups")).rowCount, 0);
      assert.equal(f.gateway.calls.length, 0);
      const group = await f.resume(jobId);
      assert.equal(group.name, "name" in profile ? "项目群" : null);
      assert.equal(
        group.description,
        "name" in profile ? "用于交流项目进度。" : null,
      );
      const row = (
        await f.db.query("SELECT created_at FROM groups WHERE id=$1", [
          group.id,
        ])
      ).rows[0]!;
      assert.equal(group.createdAt, row.created_at.toISOString());
      assert.equal(
        (await f.api("GET", `/api/groups/${group.id}`)).json<Group>().createdAt,
        group.createdAt,
      );
      assert.deepEqual(
        f.gateway.calls.find((call) => call.path === "/groups")!.body,
        { creatorAccountId: "account-1" },
      );
    });
  }
});

test("group metadata: shared validation rejects bad input and accepts trimmed limits", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description) VALUES('g','remote-g','account-1','unchanged','unchanged')",
  );
  const invalid = [
    ...[null, 1, {}, [], "", " \n ", "x".repeat(81)].map((name) => ({ name })),
    ...[null, 1, {}, [], "x".repeat(501)].map((description) => ({
      description,
    })),
  ];
  for (const profile of invalid) {
    for (const [method, url, body] of [
      ["POST", "/api/groups", { ...createInput, ...profile }],
      ["PATCH", "/api/groups/g", profile],
    ] as const) {
      const response = await f.api(method, url, body);
      assert.equal(
        response.statusCode,
        400,
        `${method} ${JSON.stringify(profile)}: ${response.body}`,
      );
      assert.equal(response.json().error.code, "VALIDATION_ERROR");
    }
  }
  assert.equal((await f.db.query("SELECT id FROM jobs")).rowCount, 0);
  const unchanged = (await f.api("GET", "/api/groups/g")).json<Group>();
  assert.equal(unchanged.name, "unchanged");
  assert.equal(unchanged.description, "unchanged");
  const limits = {
    name: ` ${"群".repeat(80)} `,
    description: ` ${"介".repeat(500)} `,
  };
  assert.equal(
    (await f.api("POST", "/api/groups", { ...createInput, ...limits }))
      .statusCode,
    202,
  );
  const patched = await f.api("PATCH", "/api/groups/g", limits);
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json<Group>().name, limits.name.trim());
  assert.equal(patched.json<Group>().description, limits.description.trim());
});

test("group metadata: partial and concurrent edits preserve omitted values, creation time, and permissions", async (t) => {
  const f = await fixture(t);
  const createdAt = "2020-02-03T04:05:06.789Z";
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description,created_at) VALUES('g','remote-g','account-1','original','original description',$1)",
    [createdAt],
  );
  assert.equal(
    (
      await f.api("PATCH", "/api/groups/g", { name: "  renamed  " })
    ).json<Group>().description,
    "original description",
  );
  assert.equal(
    (
      await f.api("PATCH", "/api/groups/g", { description: " updated " })
    ).json<Group>().name,
    "renamed",
  );
  const settings = (
    await f.api("PATCH", "/api/groups/g", {
      agentEnabled: true,
      autoKickEnabled: true,
    })
  ).json<Group>();
  assert.equal(settings.name, "renamed");
  assert.equal(settings.description, "updated");
  const cleared = (
    await f.api("PATCH", "/api/groups/g", { description: " \n " })
  ).json<Group>();
  assert.equal(cleared.description, null);
  assert.equal(cleared.name, "renamed");
  assert.equal(cleared.createdAt, createdAt);

  const blocker = await f.db.pool.connect();
  let edits: Promise<unknown>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM groups WHERE id='g' FOR UPDATE");
    edits = [
      f.api("PATCH", "/api/groups/g", { name: "concurrent name" }),
      f.api("PATCH", "/api/groups/g", {
        description: "concurrent description",
      }),
    ];
    const deadline = Date.now() + 3000;
    let waiting = 0;
    while (Date.now() < deadline) {
      waiting = (
        await f.db.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
        )
      ).rowCount!;
      if (waiting >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(
      waiting >= 2,
      "both partial updates must overlap behind the group row lock",
    );
    await blocker.query("COMMIT");
    const replies = (await Promise.all(edits)) as Awaited<
      ReturnType<typeof f.api>
    >[];
    replies.forEach((reply) => assert.equal(reply.statusCode, 200, reply.body));
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(edits);
  }
  const final = (await f.api("GET", "/api/groups/g")).json<Group>();
  assert.equal(final.name, "concurrent name");
  assert.equal(final.description, "concurrent description");
  assert.equal(final.createdAt, createdAt);
  assert.equal(final.agentEnabled, true);
  assert.equal(final.autoKickEnabled, true);
  assert.equal(
    f.gateway.calls.length,
    0,
    "local edits must not call the gateway",
  );
  const viewer = await f.login("viewer");
  assert.equal(
    (
      await f.api(
        "PATCH",
        "/api/groups/g",
        { name: "denied", description: "denied" },
        viewer,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.api(
        "POST",
        "/api/groups",
        { ...createInput, name: "denied" },
        viewer,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await f.api("GET", "/api/groups/g", undefined, viewer)).json<Group>().name,
    "concurrent name",
  );
  assert.equal(
    (await f.api("PATCH", "/api/groups/missing", { name: "missing" }))
      .statusCode,
    404,
  );
});

test("group list remains ordered by creation time descending with stable IDs for ties", async (t) => {
  const f = await fixture(t);
  for (const [id, createdAt] of [
    ["a-old", "2020-01-01T00:00:00.000Z"],
    ["z-tie", "2021-01-01T00:00:00.000Z"],
    ["a-tie", "2021-01-01T00:00:00.000Z"],
    ["newest", "2022-01-01T00:00:00.000Z"],
  ]) {
    await f.db.query(
      "INSERT INTO groups(id,gateway_group_id,creator_account_id,created_at) VALUES($1,$1,'account-1',$2)",
      [id, createdAt],
    );
  }
  assert.equal(
    (
      await f.api("PATCH", "/api/groups/a-old", {
        name: "new name on oldest group",
      })
    ).statusCode,
    200,
  );
  const groups = (await f.api("GET", "/api/groups")).json<Group[]>();
  assert.deepEqual(
    groups.map((group) => group.id),
    ["newest", "a-tie", "z-tie", "a-old"],
  );
  assert.equal(groups[3]!.createdAt, "2020-01-01T00:00:00.000Z");
});

test("group metadata migration leaves legacy group creation timestamps unchanged", async (t) => {
  const { db } = await temporaryDatabase(t);
  await db.query(
    "CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const files = [
    "001_core.sql",
    "002_automation.sql",
    "003_agent_activity.sql",
    "004_message_event_order.sql",
  ];
  for (const [index, file] of files.entries()) {
    await db.query(
      await readFile(
        new URL(`../../db/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
    await db.query(
      "INSERT INTO schema_migrations(version,name) VALUES($1,$2)",
      [index + 1, file],
    );
  }
  const createdAt = "2019-01-02T03:04:05.678Z";
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,created_at) VALUES('legacy','remote-legacy','account-1',$1)",
    [createdAt],
  );
  await migrate(db);
  await migrate(db);
  const legacy = (
    await db.query(
      "SELECT name,description,created_at FROM groups WHERE id='legacy'",
    )
  ).rows[0]!;
  assert.equal(legacy.name, null);
  assert.equal(legacy.description, null);
  assert.equal(legacy.created_at.toISOString(), createdAt);
  assert.equal(
    (await db.query("SELECT max(version) AS version FROM schema_migrations"))
      .rows[0]!.version,
    6,
  );
});
