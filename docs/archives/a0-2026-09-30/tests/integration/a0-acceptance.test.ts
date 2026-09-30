import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import Fastify, { type FastifyInstance, type InjectOptions } from "fastify";
import { createApp } from "../../apps/server/src/app.js";
import { type Database } from "../../apps/server/src/core/db.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import { createAutomationModule } from "../../apps/server/src/modules/automation/index.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { migrate, schemaFiles } from "../../scripts/migrate.js";
import { temporaryDatabase } from "../support/temporary-database.js";

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const originalHash =
  "c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75";
const baselineCommit = "ef3619577228ee8a776023a99c296a0fdbeb8948";
const originalPath = new URL(
  "../../docs/original-interview-question.md",
  import.meta.url,
);
type Observation = {
  id: string;
  expected: string;
  observed: unknown;
  status: "pass";
  at: string;
};
const observations: Observation[] = [];
function record(id: string, expected: string, observed: unknown): void {
  observations.push({
    id,
    expected,
    observed,
    status: "pass",
    at: new Date().toISOString(),
  });
}
async function dataSnapshot(db: Database) {
  const tables = (
    await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('auth_sessions','auth_tokens') ORDER BY tablename",
    )
  ).rows;
  const result: Record<string, { rows: number; sha256: string }> = {};
  for (const { tablename } of tables) {
    // Names come only from the catalog of this dedicated temporary database.
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = (
      await db.query<{ value: string }>(
        `SELECT row_to_json(t)::text AS value FROM public.${quoted} t ORDER BY row_to_json(t)::text`,
      )
    ).rows.map((row) => row.value);
    result[tablename] = {
      rows: rows.length,
      sha256: hash(JSON.stringify(rows)),
    };
  }
  return result;
}
async function structureSnapshot(db: Database) {
  const queries = {
    columns:
      "SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
    constraints:
      "SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname",
    indexes:
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
    sequences:
      "SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename",
  };
  const result: Record<string, unknown> = {};
  for (const [key, sql] of Object.entries(queries))
    result[key] = (await db.query(sql)).rows;
  return result;
}
async function seed(db: Database): Promise<void> {
  await db.query(
    "UPDATE accounts SET status='online',platform_user_id=id WHERE id IN ('account-1','account-2')",
  );
  await db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description) VALUES('a0-group','a0-gateway-group','account-1','验收群','迁移后保留的资料')",
  );
  await db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('a0-group','account-1','account-1','creator'),('a0-group','account-2','account-2','admin')",
  );
  await db.query(
    "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) VALUES('a0-message','a0-group','a0-msg','external-user',false,'迁移后保留的消息','2026-09-26T08:00:00.000Z')",
  );
  await db.query(
    "INSERT INTO jobs(id,kind,status,group_id) VALUES('a0-job','create','finished','a0-group')",
  );
  await db.query(
    "INSERT INTO sequences(id,name,steps) VALUES('a0-sequence','验收序列',$1)",
    [
      JSON.stringify([
        { index: 1, accountRole: "admin", text: "{topic}", delaySeconds: 60 },
      ]),
    ],
  );
  await db.query(
    "INSERT INTO sequence_runs(id,group_id,sequence_id,status) VALUES('a0-sequence-run','a0-group','a0-sequence','finished')",
  );
  await db.query(
    "INSERT INTO agent_runs(id,group_id,status,end_reason,summary) VALUES('a0-agent-run','a0-group','finished','final','验收完成')",
  );
}
function spawnMain(databaseUrl: string, upstream: string) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/main.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        GATEWAY_URL: upstream,
        AGENT_URL: upstream,
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = once(child, "exit");
  return {
    child,
    exited,
    output: () => output,
    close: async () => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
      await exited;
    },
  };
}
async function waitFor<T>(
  read: () => T | undefined,
  timeoutMs = 8000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  do {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 30));
  } while (Date.now() < end);
  throw new Error("Acceptance fixture timed out");
}

test("A0 acceptance: migration, real startup gate, error envelope, authentication and every registered write route", async (t) => {
  const startedAt = new Date().toISOString();
  const executionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(
    execFileSync(
      "git",
      [
        "diff",
        baselineCommit,
        "--",
        "apps/server",
        "db/migrations",
        "scripts/migrate.ts",
        "packages/contracts",
      ],
      { encoding: "utf8" },
    ),
    "",
    "Product code must still match the fixed acceptance baseline",
  );
  assert.equal(hash(await readFile(originalPath, "utf8")), originalHash);
  const temporary = await temporaryDatabase(t);
  const { db } = temporary;
  const postgres = (
    await db.query("SELECT version() AS version,current_database() AS database")
  ).rows[0]!;
  const upstream = Fastify({ logger: false });
  let upstreamCalls = 0;
  let upstreamMode: "unavailable" | "bad-json" = "unavailable";
  upstream.setNotFoundHandler((_request, reply) => {
    upstreamCalls++;
    return upstreamMode === "bad-json"
      ? reply.code(200).type("application/json").send("not-json")
      : reply.code(503).send({ code: "UPSTREAM_UNAVAILABLE" });
  });
  temporary.onCleanup(() => upstream.close());
  const upstreamUrl = await upstream.listen({ host: "127.0.0.1", port: 0 });

  await t.test(
    "real older schema refuses process startup; migration restores health",
    async () => {
      const files = await schemaFiles();
      await db.query(
        "CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const [i, file] of files.slice(0, -1).entries()) {
        await db.query(
          await readFile(
            new URL(`../../db/migrations/${file}`, import.meta.url),
            "utf8",
          ),
        );
        await db.query(
          "INSERT INTO schema_migrations(version,name) VALUES($1,$2)",
          [i + 1, file],
        );
      }
      assert.equal(
        (
          await db.query(
            "SELECT 1 FROM pg_indexes WHERE indexname='groups_directory_asc'",
          )
        ).rowCount,
        0,
      );
      const outdated = spawnMain(temporary.url, upstreamUrl);
      temporary.onCleanup(outdated.close);
      await waitFor(() =>
        outdated.child.exitCode === null ? undefined : outdated.child.exitCode,
      );
      assert.equal(outdated.child.exitCode, 1);
      assert.match(
        outdated.output(),
        /Schema mismatch: installed=5, required=6/,
      );
      assert.doesNotMatch(outdated.output(), /Server listening at/);
      await migrate(db);
      assert.equal(
        (
          await db.query(
            "SELECT 1 FROM pg_indexes WHERE indexname='groups_directory_asc'",
          )
        ).rowCount,
        1,
      );
      const restored = spawnMain(temporary.url, upstreamUrl);
      temporary.onCleanup(restored.close);
      const address = await waitFor(
        () =>
          restored
            .output()
            .match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1],
      );
      const health = await fetch(`${address}/api/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        ok: true,
        schemaVersion: files.length,
      });
      await restored.close();
      record(
        "migration-startup",
        "Schema 5 process exits before listen; applying migration 6 restores process HTTP health",
        {
          oldSchemaVersion: files.length - 1,
          requiredSchemaVersion: files.length,
          missingIndexBefore: true,
          indexAfter: true,
          refusedExitCode: 1,
          refusedBeforeListening: true,
          restoredStatus: 200,
          health: { ok: true, schemaVersion: files.length },
          dynamicPort: Number(new URL(address).port),
        },
      );
    },
  );

  await t.test(
    "repeat migration preserves structure, migration records and existing business rows",
    async () => {
      await seed(db);
      const structureBefore = await structureSnapshot(db);
      const before = await dataSnapshot(db);
      const records = (
        await db.query(
          "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
        )
      ).rows;
      await migrate(db);
      const structureAfter = await structureSnapshot(db);
      const after = await dataSnapshot(db);
      assert.deepEqual(structureAfter, structureBefore);
      assert.deepEqual(after, before);
      assert.deepEqual(
        (
          await db.query(
            "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
          )
        ).rows,
        records,
      );
      record(
        "migration-repeat",
        "All schema catalogs, migration records including timestamps, and existing business row snapshots remain equal",
        {
          structureSha256Before: hash(JSON.stringify(structureBefore)),
          structureSha256After: hash(JSON.stringify(structureAfter)),
          migrationRecords: records,
          before,
          after,
        },
      );
    },
  );

  const routes: string[] = [];
  const app: FastifyInstance = await createApp({
    db,
    logger: false,
    background: false,
    modules: (ctx) => {
      const context = {
        ...ctx,
        gateway: new RemoteClient(upstreamUrl),
        agent: new RemoteClient(upstreamUrl),
      };
      const gateway = createGatewayModule(context);
      const automation = createAutomationModule(context, gateway);
      return [
        {
          register: async (instance) => {
            instance.addHook("onRoute", (route) => {
              for (const method of Array.isArray(route.method)
                ? route.method
                : [route.method]) {
                if (!["GET", "HEAD", "OPTIONS"].includes(method))
                  routes.push(`${method} ${route.url}`);
              }
            });
            await gateway.register(instance);
            await automation.register(instance);
          },
          tick: async () => {},
          close: async () => {
            await gateway.close?.();
            await automation.close?.();
          },
        },
      ];
    },
  });
  temporary.onCleanup(() => app.close());
  const requestIds = new Set<string>();
  function checkError(
    response: Awaited<ReturnType<typeof app.inject>>,
    status: number,
    code: string,
  ) {
    assert.equal(response.statusCode, status);
    const body = response.json<{
      error: {
        code: string;
        message: string;
        requestId: string;
        [key: string]: unknown;
      };
    }>();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
    assert.ok(body.error.message.length > 0);
    assert.match(body.error.requestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
    assert.equal(requestIds.has(body.error.requestId), false);
    requestIds.add(body.error.requestId);
    return body;
  }
  async function login(username: "admin" | "viewer") {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: username },
    });
    assert.equal(response.statusCode, 200);
    const token: unknown = response.json<{ accessToken: unknown }>()
      .accessToken;
    assert.equal(typeof token, "string");
    assert.ok((token as string).length > 0);
    return { token: token as string, cookie: response.cookies[0]!.value };
  }
  const admin = await login("admin");
  const viewer = await login("viewer");
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const reads = [
    "/api/accounts",
    "/api/groups",
    "/api/group-directory",
    "/api/groups/a0-group",
    "/api/groups/a0-group/messages",
    "/api/jobs/a0-job",
    "/api/sequences",
    "/api/sequence-runs/a0-sequence-run",
    "/api/agent-runs/a0-agent-run",
    "/api/groups/a0-group/agent-runs",
  ];

  await t.test(
    "both roles receive 900-second access tokens; viewer can read",
    async () => {
      const results = [];
      for (const [username, session] of [
        ["admin", admin],
        ["viewer", viewer],
      ] as const) {
        const ttl = (
          await db.query<{ ttl: string; active: boolean }>(
            "SELECT extract(epoch FROM t.expires_at-s.created_at)::text AS ttl,t.expires_at>now() AS active FROM auth_tokens t JOIN auth_sessions s ON s.id=t.session_id WHERE t.token_hash=$1 AND t.kind='access'",
            [hash(session.token)],
          )
        ).rows[0]!;
        assert.equal(Number(ttl.ttl), 900);
        assert.equal(ttl.active, true);
        const me = await app.inject({
          url: "/api/auth/me",
          headers: auth(session.token),
        });
        assert.deepEqual(me.json(), { username, role: username });
        assert.equal(me.statusCode, 200);
        results.push({
          username,
          token: { type: typeof session.token, nonempty: true },
          expiresAfterSeconds: Number(ttl.ttl),
          initiallyValid: true,
        });
      }
      for (const url of reads)
        assert.equal(
          (await app.inject({ url, headers: auth(viewer.token) })).statusCode,
          200,
          url,
        );
      record(
        "login-and-viewer-reads",
        "Both roles receive nonempty strings valid for 900 seconds; viewer reads real business endpoints",
        {
          logins: results,
          reads: reads.map((url) => ({ method: "GET", url, status: 200 })),
          timelineNote:
            "GET messages creates an internal pagination snapshot; baseline for denied writes is taken after these reads.",
        },
      );
    },
  );

  const writes: {
    method: "POST" | "PATCH";
    route: string;
    url: string;
    payload: unknown;
  }[] = [
    {
      method: "POST",
      route: "/api/accounts/:id/connect",
      url: "/api/accounts/account-3/connect",
      payload: {},
    },
    {
      method: "POST",
      route: "/api/accounts/:id/transition",
      url: "/api/accounts/account-1/transition",
      payload: { to: "disconnected", expectedFrom: "online" },
    },
    {
      method: "POST",
      route: "/api/groups",
      url: "/api/groups",
      payload: {
        creatorAccountId: "account-1",
        memberAccountIds: ["account-2"],
      },
    },
    {
      method: "PATCH",
      route: "/api/groups/:id",
      url: "/api/groups/a0-group",
      payload: { name: "不应保存", agentEnabled: true },
    },
    {
      method: "POST",
      route: "/api/groups/:id/send",
      url: "/api/groups/a0-group/send",
      payload: { accountId: "account-2", text: "不应发送" },
    },
    {
      method: "POST",
      route: "/api/groups/:id/leave-all",
      url: "/api/groups/a0-group/leave-all",
      payload: {},
    },
    {
      method: "POST",
      route: "/api/sequences",
      url: "/api/sequences",
      payload: {
        name: "不应保存",
        steps: [
          {
            index: 1,
            accountRole: "admin",
            text: "hello",
            delaySeconds: 0,
          },
        ],
      },
    },
    {
      method: "POST",
      route: "/api/sequences/preview",
      url: "/api/sequences/preview",
      payload: {
        sequenceId: "a0-sequence",
        vars: { topic: "hello" },
        stepVars: {},
      },
    },
    {
      method: "POST",
      route: "/api/groups/:id/sequence-runs",
      url: "/api/groups/a0-group/sequence-runs",
      payload: {
        sequenceId: "a0-sequence",
        vars: { topic: "hello" },
        stepVars: {},
      },
    },
  ];
  await t.test(
    "every registered business POST/PATCH rejects viewer without business or remote effects",
    async () => {
      assert.deepEqual(
        routes.sort(),
        writes.map((write) => `${write.method} ${write.route}`).sort(),
      );
      const before = await dataSnapshot(db);
      const callsBefore = upstreamCalls;
      const results = [];
      for (const write of writes) {
        const response = await app.inject({
          method: write.method,
          url: write.url,
          payload: write.payload as InjectOptions["payload"],
          headers: auth(viewer.token),
        });
        const body = checkError(response, 403, "FORBIDDEN");
        assert.deepEqual(await dataSnapshot(db), before, write.route);
        assert.equal(upstreamCalls, callsBefore, write.route);
        results.push({
          method: write.method,
          route: write.route,
          testedUrl: write.url,
          status: response.statusCode,
          body,
          businessRowsUnchanged: true,
          externalRequestsAdded: 0,
        });
      }
      record(
        "viewer-all-write-routes",
        "Discovered route registry equals matrix; all 9 routes return 403/FORBIDDEN with unchanged rows and zero outbound effects",
        {
          discoveredRoutes: routes,
          results,
          businessSnapshot: before,
          excludesAuthLifecycle: [
            "POST /api/auth/login",
            "POST /api/auth/refresh",
            "POST /api/auth/logout",
          ],
        },
      );
    },
  );

  await t.test(
    "representative actual API error sources preserve the common envelope and business fields",
    async () => {
      const scenarios: {
        id: string;
        request: InjectOptions;
        status: number;
        code: string;
      }[] = [
        {
          id: "invalid-login-body-zod",
          request: { method: "POST", url: "/api/auth/login", payload: {} },
          status: 400,
          code: "VALIDATION_ERROR",
        },
        {
          id: "invalid-business-body",
          request: {
            method: "POST",
            url: "/api/groups",
            payload: {},
            headers: auth(admin.token),
          },
          status: 400,
          code: "VALIDATION_ERROR",
        },
        {
          id: "invalid-json",
          request: {
            method: "POST",
            url: "/api/auth/login",
            payload: "{",
            headers: { "content-type": "application/json" },
          },
          status: 400,
          code: "VALIDATION_ERROR",
        },
        {
          id: "missing-auth",
          request: { url: "/api/accounts" },
          status: 401,
          code: "UNAUTHORIZED",
        },
        {
          id: "invalid-auth",
          request: {
            url: "/api/accounts",
            headers: auth("invalid-acceptance-token"),
          },
          status: 401,
          code: "UNAUTHORIZED",
        },
        {
          id: "wrong-password",
          request: {
            method: "POST",
            url: "/api/auth/login",
            payload: { username: "viewer", password: "wrong" },
          },
          status: 401,
          code: "UNAUTHORIZED",
        },
        {
          id: "missing-business-resource",
          request: { url: "/api/groups/missing", headers: auth(admin.token) },
          status: 404,
          code: "GROUP_NOT_FOUND",
        },
        {
          id: "unregistered-route",
          request: { url: "/api/does-not-exist", headers: auth(admin.token) },
          status: 404,
          code: "NOT_FOUND",
        },
        {
          id: "illegal-transition",
          request: {
            method: "POST",
            url: "/api/accounts/account-1/transition",
            headers: auth(admin.token),
            payload: { expectedFrom: "online", to: "online" },
          },
          status: 409,
          code: "ILLEGAL_TRANSITION",
        },
        {
          id: "cas-conflict",
          request: {
            method: "POST",
            url: "/api/accounts/account-1/transition",
            headers: auth(admin.token),
            payload: { expectedFrom: "idle", to: "online" },
          },
          status: 409,
          code: "CAS_CONFLICT",
        },
        {
          id: "offline-group-creator",
          request: {
            method: "POST",
            url: "/api/groups",
            headers: auth(admin.token),
            payload: {
              creatorAccountId: "account-3",
              memberAccountIds: ["account-2"],
            },
          },
          status: 422,
          code: "ACCOUNT_NOT_ONLINE",
        },
        {
          id: "unresolved-placeholder",
          request: {
            method: "POST",
            url: "/api/groups/a0-group/sequence-runs",
            headers: auth(admin.token),
            payload: { sequenceId: "a0-sequence", vars: {}, stepVars: {} },
          },
          status: 422,
          code: "UNRESOLVED_PLACEHOLDER",
        },
      ];
      const results = [];
      for (const scenario of scenarios) {
        const response = await app.inject(scenario.request);
        const body = checkError(response, scenario.status, scenario.code);
        if (scenario.id === "unresolved-placeholder") {
          assert.equal(body.error.stepIndex, 1);
          assert.equal(body.error.key, "topic");
        }
        results.push({ id: scenario.id, status: response.statusCode, body });
      }
      for (const [mode, code] of [
        ["unavailable", "UPSTREAM_UNAVAILABLE"],
        ["bad-json", "BAD_JSON"],
      ] as const) {
        upstreamMode = mode;
        const response = await app.inject({
          method: "POST",
          url: "/api/accounts/account-3/connect",
          payload: {},
          headers: auth(admin.token),
        });
        results.push({
          id: `external-${mode}`,
          status: response.statusCode,
          body: checkError(response, 502, code),
        });
      }
      await db.query("ALTER TABLE accounts RENAME TO a0_accounts_fault");
      try {
        const response = await app.inject({
          url: "/api/accounts",
          headers: auth(admin.token),
        });
        const body = checkError(response, 500, "INTERNAL_ERROR");
        assert.doesNotMatch(
          JSON.stringify(body),
          /relation|SELECT|stack|a0_accounts_fault/,
        );
        results.push({
          id: "internal-database-error",
          status: response.statusCode,
          body,
        });
      } finally {
        await db.query("ALTER TABLE a0_accounts_fault RENAME TO accounts");
      }
      record(
        "error-envelope",
        "Representative validation/parser/auth/resource/conflict/422/external/internal errors share error.code/message/requestId; 422 retains stepIndex/key",
        {
          results,
          forbiddenCases: "See viewer-all-write-routes: all 9 actual routes",
          requestIdsUnique: true,
          internalFault:
            "Temporarily rename accounts in the isolated database, then restore in finally",
          coverage:
            "Representative error sources, not every endpoint/failure combination",
        },
      );
    },
  );

  await t.test(
    "expiry and viewer refresh/logout are enforced independently of business writes",
    async () => {
      const boundary = await login("viewer");
      await db.query(
        "UPDATE auth_tokens SET expires_at=clock_timestamp()+interval '60 seconds' WHERE token_hash=$1",
        [hash(boundary.token)],
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/auth/me",
            headers: auth(boundary.token),
          })
        ).statusCode,
        200,
      );
      await db.query(
        "UPDATE auth_tokens SET expires_at=clock_timestamp() WHERE token_hash=$1",
        [hash(boundary.token)],
      );
      const expired = checkError(
        await app.inject({
          url: "/api/auth/me",
          headers: auth(boundary.token),
        }),
        401,
        "UNAUTHORIZED",
      );
      const refresh = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { refreshToken: boundary.cookie },
      });
      assert.equal(refresh.statusCode, 200);
      const refreshed: unknown = refresh.json<{ accessToken: unknown }>()
        .accessToken;
      assert.equal(typeof refreshed, "string");
      assert.ok((refreshed as string).length > 0);
      assert.equal(
        (
          await app.inject({
            url: "/api/auth/me",
            headers: auth(refreshed as string),
          })
        ).statusCode,
        200,
      );
      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: auth(refreshed as string),
      });
      assert.equal(logout.statusCode, 200);
      const revoked = checkError(
        await app.inject({
          url: "/api/auth/me",
          headers: auth(refreshed as string),
        }),
        401,
        "UNAUTHORIZED",
      );
      const refreshAfterLogout = checkError(
        await app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          cookies: { refreshToken: refresh.cookies[0]!.value },
        }),
        401,
        "UNAUTHORIZED",
      );
      record(
        "expiry-and-session-lifecycle",
        "Future access expiry permits read, reached expiry rejects, viewer may refresh/logout, logout invalidates access and refresh",
        {
          futureExpiryStatus: 200,
          reachedExpiry: expired,
          refreshStatus: 200,
          refreshedToken: { type: typeof refreshed, nonempty: true },
          logoutStatus: 200,
          revokedAccess: revoked,
          revokedRefresh: refreshAfterLogout,
          method:
            "Only the isolated database expiration timestamp was changed; this is an expiry-boundary test, not a 15-minute wall-clock soak.",
        },
      );
    },
  );

  await t.test(
    "persisted access sessions and viewer business restrictions survive a real process restart",
    async () => {
      await app.close();
      upstreamMode = "unavailable";
      const restarted = spawnMain(temporary.url, upstreamUrl);
      temporary.onCleanup(restarted.close);
      const address = await waitFor(
        () =>
          restarted
            .output()
            .match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1],
      );
      for (const [username, session] of [
        ["admin", admin],
        ["viewer", viewer],
      ] as const) {
        const response = await fetch(`${address}/api/auth/me`, {
          headers: auth(session.token),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { username, role: username });
      }
      for (const url of reads)
        assert.equal(
          (await fetch(`${address}${url}`, { headers: auth(viewer.token) }))
            .status,
          200,
          url,
        );
      // The real server scans pre-existing incoming messages on its first tick.
      // Wait for that independent recovery work before measuring write effects.
      const scanDeadline = Date.now() + 3000;
      while (
        !(
          await db.query(
            "SELECT 1 FROM agent_pending WHERE message_id='a0-message'",
          )
        ).rowCount &&
        Date.now() < scanDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.deepEqual(
        (
          await db.query(
            "SELECT eligible FROM agent_pending WHERE message_id='a0-message'",
          )
        ).rows,
        [{ eligible: false }],
      );
      const before = await dataSnapshot(db);
      const results = [];
      for (const write of writes) {
        const response = await fetch(`${address}${write.url}`, {
          method: write.method,
          headers: {
            ...auth(viewer.token),
            "content-type": "application/json",
          },
          body: JSON.stringify(write.payload),
        });
        assert.equal(response.status, 403, write.route);
        const body = (await response.json()) as {
          error: { code: string; message: string; requestId: string };
        };
        assert.deepEqual(Object.keys(body), ["error"]);
        assert.equal(body.error.code, "FORBIDDEN");
        assert.ok(body.error.message.length > 0);
        assert.match(body.error.requestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
        assert.deepEqual(await dataSnapshot(db), before, write.route);
        results.push({
          method: write.method,
          route: write.route,
          status: response.status,
          body,
          businessRowsUnchanged: true,
        });
      }
      await restarted.close();
      record(
        "real-process-session-restart",
        "Existing admin/viewer access sessions, business reads and all nine viewer restrictions remain valid after process restart",
        {
          persistedSessions: ["admin", "viewer"],
          identityStatuses: [200, 200],
          viewerReadStatuses: reads.map((url) => ({ url, status: 200 })),
          viewerWriteResults: results,
          dynamicPort: Number(new URL(address).port),
          processExitCode: restarted.child.exitCode,
          note: "Production background recovery/ticks enabled; waited for the initial scan of the existing incoming message before taking the write-effect baseline. Its agent_pending row is ineligible.",
        },
      );
    },
  );

  assert.equal(hash(await readFile(originalPath, "utf8")), originalHash);
  assert.equal(
    observations.length,
    7,
    "Do not emit complete evidence unless every acceptance scenario passed",
  );
  if (process.env.A0_EVIDENCE_PATH)
    await writeFile(
      process.env.A0_EVIDENCE_PATH,
      JSON.stringify(
        {
          scope:
            "A0 on fixed main baseline; automated verification is not user acceptance",
          baselineCommit,
          executionCommit,
          baselineProductDiffEmpty: true,
          startedAt,
          completedAt: new Date().toISOString(),
          runtime: process.version,
          postgres,
          originalSha256Before: originalHash,
          originalSha256After: originalHash,
          isolation: {
            database: new URL(temporary.url).pathname.slice(1),
            managementDatabase: "postgres",
            upstreamDynamicPort: Number(new URL(upstreamUrl).port),
            backgroundForRouteTests: false,
            databaseCleanup:
              "temporaryDatabase t.after: close fixtures/pool, DROP DATABASE UUID WITH (FORCE)",
          },
          observations,
          notVerified: [
            "Manual browser acceptance",
            "Every API/error cross-product",
            "15-minute real-time soak",
            "PI-03 or other commits after fixed baseline",
            "Production infrastructure or external real gateway/agent",
          ],
        },
        null,
        2,
      ) + "\n",
    );
});
