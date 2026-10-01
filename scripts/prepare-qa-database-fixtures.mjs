// Developer-owned producer; never imports, writes, or executes QA assets.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";

const legacyRevision = "3d7e4f461238e752b2259e0a99dffa8521a00caa";
const sourceRevision = "4c035b8c24e95f33182b4248ee676fcd184f74a5";
const repo = resolve(new URL("..", import.meta.url).pathname);
const id = randomUUID().replaceAll("-", "");
const owner = `developer-qa-fixtures-${id}`;
const output = join(repo, ".runtime/qa-fixtures", id);
const sourceRoot = join(output, "sources");
const dockerHost = "unix:///var/run/docker.sock";
const image = "postgres:17-alpine";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
const git = (...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const docker = (...args) =>
  execFileSync("docker", ["--host", dockerHost, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ledgerBytes = await readFile(
  join(repo, "scripts/fixtures/qa-directory-ledger.json"),
);
const ledger = JSON.parse(ledgerBytes);
const report = {
  version: 1,
  owner,
  generatorRevision: git("rev-parse", "HEAD"),
  generatorSha256: hash(await readFile(new URL(import.meta.url))),
  sourceRevision,
  legacyRevision,
  candidateRevision: null,
  candidateBinding:
    "Root will fix final authorized candidate; preparation files are not approved QA manifests",
  startedAt: new Date().toISOString(),
  staging: output,
  ledgerSha256: hash(ledgerBytes),
  independentExpected: ledger,
  checks: [],
  artifacts: [],
  cleanup: {},
};
let containerId, admin, app;
const pools = [];
const databases = [];
let mounts = [];
await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
await writeFile(join(output, "independent-ledger.json"), ledgerBytes, {
  mode: 0o600,
});
async function extract(revision, name) {
  const dir = join(sourceRoot, name);
  await mkdir(dir);
  const archive = execFileSync(
    "git",
    [
      "archive",
      revision,
      "apps/server",
      "packages",
      "db",
      "scripts/migrate.ts",
      "package.json",
      "tsconfig.json",
    ],
    { cwd: repo, maxBuffer: 32 * 1024 * 1024 },
  );
  const result = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
  assert.equal(result.status, 0, String(result.stderr));
  await symlink(
    await realpath(join(repo, "node_modules")),
    join(dir, "node_modules"),
  );
  return dir;
}
function execPg(database, command, args = []) {
  return docker(
    "exec",
    containerId,
    command,
    "--username=qa",
    `--dbname=${database}`,
    ...args,
  );
}
function fingerprint(database) {
  const normalized = (bytes) =>
    bytes.toString("utf8").replace(/^\\(?:un)?restrict .*$/gm, "");
  return Object.fromEntries(
    ["schema", "data"].map((kind) => [
      kind,
      hash(
        normalized(
          execPg(database, "pg_dump", [
            `--${kind}-only`,
            "--no-owner",
            "--no-privileges",
          ]),
        ),
      ),
    ]),
  );
}
async function port() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
try {
  assert.equal(git("rev-parse", sourceRevision), sourceRevision);
  assert.equal(git("rev-parse", legacyRevision), legacyRevision);
  const [legacyDir, candidateDir] = await Promise.all([
    extract(legacyRevision, "legacy"),
    extract(sourceRevision, "candidate"),
  ]);
  const { Database } = await import(
    pathToFileURL(join(candidateDir, "apps/server/src/core/db.ts"))
  );
  containerId = docker(
    "run",
    "-d",
    "--name",
    owner,
    "--label",
    `kapibala.fixture-owner=${owner}`,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=qa",
    "--env",
    "POSTGRES_PASSWORD=qa-fixture-only",
    image,
  )
    .toString()
    .trim();
  const info = JSON.parse(docker("inspect", containerId).toString())[0];
  assert.equal(info.Config.Labels["kapibala.fixture-owner"], owner);
  const binding = info.NetworkSettings.Ports["5432/tcp"];
  assert.equal(binding.length, 1);
  assert.equal(binding[0].HostIp, "127.0.0.1");
  assert(!["55432", "64550"].includes(binding[0].HostPort));
  mounts = info.Mounts;
  assert(mounts.every((mount) => mount.Type === "volume"));
  report.container = {
    id: containerId,
    owner,
    image,
    imageId: info.Image,
    host: binding[0].HostIp,
    port: binding[0].HostPort,
    mounts: mounts.map(({ Type, Name, Destination }) => ({
      Type,
      Name,
      Destination,
    })),
  };
  const baseUrl = `postgres://qa:qa-fixture-only@127.0.0.1:${binding[0].HostPort}`;
  for (let attempt = 0; ; attempt++) {
    const ready = spawnSync("docker", [
      "--host",
      dockerHost,
      "exec",
      containerId,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "qa",
    ]);
    if (ready.status === 0) break;
    assert(attempt < 100, "Dedicated PostgreSQL did not become ready");
    await pause(100);
  }
  admin = new Database(`${baseUrl}/postgres`);
  const version = (await admin.query("SHOW server_version")).rows[0]
    .server_version;
  assert(version.startsWith("17."));
  report.postgresqlVersion = version;
  const makeDb = async (label) => {
    const name = `fixture_${label}_${id}`;
    await admin.query(`CREATE DATABASE ${name}`);
    databases.push(name);
    const db = new Database(`${baseUrl}/${name}`);
    pools.push(db);
    return { name, db, url: `${baseUrl}/${name}` };
  };
  async function noPending(db, expectedGroups) {
    const tables = (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((row) => row.tablename);
    const counts = {};
    for (const table of tables) {
      assert(/^[a-z_]+$/.test(table));
      counts[table] = Number(
        (await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
      );
      if (!["schema_migrations", "accounts", "groups"].includes(table))
        assert.equal(counts[table], 0, `${table} must be empty`);
    }
    assert.equal(counts.groups, expectedGroups);
    assert.equal(counts.accounts, 6);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM accounts WHERE status<>'idle' OR platform_user_id IS NOT NULL OR rate_limited_until IS NOT NULL",
          )
        ).rows[0].count,
      ),
      0,
    );
    return counts;
  }
  for (const [kind, schema, source, directory] of [
    ["legacy-schema", 7, legacyRevision, legacyDir],
    ["directory-precision", 8, sourceRevision, candidateDir],
  ]) {
    const original = await makeDb(
      kind === "legacy-schema" ? "legacy" : "precision",
    );
    const env = {
      ...process.env,
      DATABASE_URL: original.url,
      GATEWAY_URL: "http://127.0.0.1:1",
      AGENT_URL: "http://127.0.0.1:1",
    };
    const migration = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      { cwd: directory, env, encoding: "utf8", timeout: 30000 },
    );
    await writeFile(
      join(output, `${kind}-migration.log`),
      `${migration.stdout}\n${migration.stderr}`,
      { mode: 0o600 },
    );
    assert.equal(migration.status, 0, migration.stderr);
    const installed = (
      await original.db.query(
        "SELECT version,name,checksum FROM schema_migrations ORDER BY version",
      )
    ).rows;
    assert.equal(installed.length, schema);
    assert.equal(installed.at(-1).version, schema);
    if (schema === 8) {
      for (const [index, row] of ledger.rows.entries())
        await original.db.query(
          "INSERT INTO groups(id,gateway_group_id,creator_account_id,name,description,created_at,status,agent_enabled,auto_kick_enabled) VALUES($1,$2,'account-1',$3,NULL,$4,'active',false,false)",
          [
            row.id,
            `qa-precision-gateway-${index}`,
            row.public.name,
            row.createdAtMicros,
          ],
        );
      const rawTimes = (
        await original.db.query(
          "SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS micros FROM groups ORDER BY id",
        )
      ).rows;
      assert.deepEqual(
        rawTimes,
        ledger.rows.map((row) => ({ id: row.id, micros: row.createdAtMicros })),
      );
    }
    const counts = await noPending(original.db, schema === 8 ? 6 : 0);
    const before = fingerprint(original.name);
    const dump = execPg(original.name, "pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
    ]);
    assert.equal(dump.subarray(0, 5).toString(), "PGDMP");
    const filename = schema === 7 ? "legacy.dump" : "precision.dump";
    await writeFile(join(output, filename), dump, { mode: 0o600 });
    assert.deepEqual(
      fingerprint(original.name),
      before,
      "Export must preserve the source database",
    );
    const restored = await makeDb(`${schema}_restore`);
    const restore = spawnSync(
      "docker",
      [
        "--host",
        dockerHost,
        "exec",
        "-i",
        containerId,
        "pg_restore",
        "--username=qa",
        `--dbname=${restored.name}`,
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
      ],
      { input: dump, maxBuffer: 8 * 1024 * 1024 },
    );
    await writeFile(
      join(output, `${kind}-restore.log`),
      Buffer.concat([restore.stdout, restore.stderr]),
      { mode: 0o600 },
    );
    assert.equal(restore.status, 0, String(restore.stderr));
    assert.deepEqual(
      fingerprint(restored.name),
      before,
      "Restored schema and data must match complete source dumps",
    );
    assert.deepEqual(
      await noPending(restored.db, schema === 8 ? 6 : 0),
      counts,
    );
    const record = {
      kind,
      schema,
      sourceRevision: source,
      sourceDatabase: original.name,
      restoredDatabase: restored.name,
      installed,
      rowCounts: counts,
      fingerprint: before,
      sourceUnchangedAfterExport: true,
      restoreMatchesSource: true,
      archive: {
        path: join(output, filename),
        sha256: hash(dump),
        bytes: dump.length,
        format: "pg-custom",
      },
    };
    report.artifacts.push(record);
    if (schema === 7) {
      const testPort = await port();
      const rejected = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "apps/server/src/main.ts"],
          {
            cwd: candidateDir,
            env: { ...env, DATABASE_URL: restored.url, PORT: String(testPort) },
          },
        );
        let stdout = "",
          stderr = "",
          timedOut = false;
        child.stdout.on("data", (value) => (stdout += value));
        child.stderr.on("data", (value) => (stderr += value));
        child.on("error", reject);
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, 10000);
        child.on("exit", (code, signal) => {
          clearTimeout(timeout);
          resolve({ code, signal, stdout, stderr, timedOut });
        });
      });
      await writeFile(
        join(output, "legacy-candidate-rejection.log"),
        rejected.stdout + rejected.stderr,
        { mode: 0o600 },
      );
      assert.equal(rejected.timedOut, false);
      assert.notEqual(rejected.code, 0);
      assert.match(
        rejected.stderr + rejected.stdout,
        /Schema mismatch: installed=7, required=8/,
      );
      assert.doesNotMatch(rejected.stdout, /Server listening/);
      assert.deepEqual(
        fingerprint(restored.name),
        before,
        "Rejected startup must preserve restored schema and data",
      );
      record.rejection = {
        code: rejected.code,
        signal: rejected.signal,
        diagnostic: "Schema mismatch: installed=7, required=8",
        persistentContentUnchanged: true,
        boundary:
          "production entry exited itself; log and final persistence checked, no claim about transient rolled-back writes",
      };
      report.checks.push(
        "real schema7 restore; candidate main rejected before listening; complete dumps unchanged",
      );
    } else {
      process.env.GATEWAY_URL = "http://127.0.0.1:1";
      process.env.AGENT_URL = "http://127.0.0.1:1";
      const { createApp } = await import(
        pathToFileURL(join(candidateDir, "apps/server/src/app.ts"))
      );
      const { createGatewayModule } = await import(
        pathToFileURL(
          join(candidateDir, "apps/server/src/modules/gateway/index.ts"),
        )
      );
      app = await createApp({
        db: restored.db,
        logger: false,
        background: false,
        modules: (ctx) => [createGatewayModule(ctx)],
      });
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const login = await fetch(`${address}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
      });
      assert.equal(login.status, 200);
      const token = (await login.json()).accessToken;
      assert.equal(typeof token, "string");
      const pages = {};
      for (const order of ["asc", "desc"]) {
        const items = [],
          seenCursors = new Set();
        let cursor;
        pages[order] = [];
        do {
          const query = new URLSearchParams({
            q: ledger.query.q,
            pageSize: String(ledger.query.pageSize),
            order,
            ...(cursor ? { cursor } : {}),
          });
          const response = await fetch(
            `${address}/api/group-directory?${query}`,
            { headers: { authorization: `Bearer ${token}` } },
          );
          assert.equal(response.status, 200);
          const value = await response.json();
          pages[order].push(value);
          assert.equal(value.items.length, 2);
          items.push(...value.items);
          cursor = value.nextCursor;
          if (cursor) {
            assert(!seenCursors.has(cursor));
            seenCursors.add(cursor);
          }
          assert(pages[order].length <= 3);
        } while (cursor);
        assert.deepEqual(
          items.map((item) => item.id),
          ledger.orderIds[order],
        );
        for (const item of items) {
          const expected = ledger.rows.find((row) => row.id === item.id).public;
          assert.deepEqual(
            Object.fromEntries(
              Object.keys(expected).map((key) => [key, item[key]]),
            ),
            expected,
          );
        }
      }
      await json(join(output, "precision-public-responses.json"), pages);
      await app.close();
      app = undefined;
      record.publicVerification = {
        adminLogin: true,
        pagesPerOrder: 3,
        ids: ledger.orderIds,
        expectedSource:
          "predefined independent ledger; never generated from the API",
        background: false,
      };
      report.checks.push(
        "real schema8 restore; HTTP admin login; six rows in three pages in each direction; independent public projections match",
      );
    }
    const preparation = {
      status: "awaiting-final-candidate-binding-and-QA-artifact-review",
      version: 1,
      artifactId: `${kind}-${id}`,
      kind,
      candidateRevision: null,
      source: {
        producer: "scripts/prepare-qa-database-fixtures.mjs",
        revision: source,
        exportedAt: new Date().toISOString(),
        syntheticOnly: true,
        noPendingWork: true,
      },
      review: null,
      dump: {
        path: `fixtures/${filename}`,
        sha256: record.archive.sha256,
        bytes: dump.length,
        format: "pg-custom",
      },
      expected:
        schema === 7
          ? {
              schemaRelation: "older-than-candidate",
              rejectionLogIncludes: [
                "Schema mismatch: installed=7, required=8",
              ],
            }
          : { query: ledger.query, rows: ledger.rows },
      producerMetadata: {
        ledgerSha256: report.ledgerSha256,
        defaults: ledger.producerDefaults,
        schemaVersion: schema,
        note: "Preparation only: QA must review source, independent expected, contents and fill actual review. Final candidate must be authorized, schema8 and compatible with this source.",
      },
    };
    const preparationPath = join(output, `${kind}.preparation.json`);
    await json(preparationPath, preparation);
    record.preparation = {
      path: preparationPath,
      sha256: hash(await readFile(preparationPath)),
      notFinalManifest: true,
    };
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
} finally {
  const errors = [];
  try {
    await app?.close();
  } catch (error) {
    errors.push(String(error));
  }
  for (const pool of pools)
    try {
      await pool.close();
    } catch (error) {
      errors.push(String(error));
    }
  if (admin) {
    for (const name of databases)
      try {
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } catch (error) {
        errors.push(String(error));
      }
    try {
      report.cleanup.remainingDatabases = (
        await admin.query(
          "SELECT datname FROM pg_database WHERE datname=ANY($1::text[])",
          [databases],
        )
      ).rows;
      report.cleanup.remainingSessions = (
        await admin.query(
          "SELECT datname FROM pg_stat_activity WHERE datname=ANY($1::text[])",
          [databases],
        )
      ).rows;
      await admin.close();
    } catch (error) {
      errors.push(String(error));
    }
  }
  if (containerId)
    try {
      const owned = JSON.parse(docker("inspect", containerId).toString())[0];
      assert.equal(owned.Id, containerId);
      assert.equal(owned.Config.Labels["kapibala.fixture-owner"], owner);
      docker("rm", "--force", "--volumes", containerId);
      report.cleanup.containerRemoved = !docker(
        "ps",
        "-aq",
        "--filter",
        `id=${containerId}`,
      )
        .toString()
        .trim();
      const existingVolumes = new Set(
        docker("volume", "ls", "--format", "{{.Name}}")
          .toString()
          .trim()
          .split("\n"),
      );
      report.cleanup.remainingOwnedVolumes = mounts
        .filter((mount) => existingVolumes.has(mount.Name))
        .map((mount) => mount.Name);
      assert.equal(report.cleanup.remainingOwnedVolumes.length, 0);
    } catch (error) {
      errors.push(String(error));
    }
  try {
    await rm(sourceRoot, { recursive: true, force: true });
  } catch (error) {
    errors.push(String(error));
  }
  report.cleanup.errors = errors;
  if (errors.length) report.passed = false;
  report.finishedAt = new Date().toISOString();
  await json(join(output, "producer-verification.json"), report);
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        staging: output,
        checks: report.checks,
        cleanup: report.cleanup,
      },
      null,
      2,
    ),
  );
}
if (!report.passed) process.exitCode = 1;
