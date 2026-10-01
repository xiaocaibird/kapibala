import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import type { QueryResult, QueryResultRow } from "pg";
import { temporaryDatabase } from "../support/temporary-database.js";
import { migrate } from "../../apps/server/src/core/migrations.js";
import { createApp } from "../../apps/server/src/app.js";
import { createGatewayModule } from "../../apps/server/src/modules/gateway/index.js";
import type { Message } from "../../packages/contracts/src/index.js";

type Page = { items: Message[]; nextCursor: string | null; snapshotId: string };
const enabled = process.env.TIMELINE_MEASUREMENT === "1";
for (const count of [1000, 10000]) {
  test(
    `timeline measurement: ${count} messages, real query plans and HTTP pages`,
    { skip: !enabled },
    async (t) => {
      const f = await temporaryDatabase(t);
      await migrate(f.db);
      await f.db.query(
        "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('measured','measured','account-1'),('control','control','account-2')",
      );
      await f.db.query(
        `INSERT INTO messages(id,group_id,msg_id,client_msg_id,account_id,sender_platform_user_id,is_own,text,sent_at,delivery_status,created_at)
      SELECT g||'-'||lpad(n::text,6,'0'),g,g||'-remote-'||n,
      CASE WHEN n%10=0 THEN g||'-client-'||n END,
      CASE WHEN n%10=0 THEN 'account-1' END,
      CASE WHEN n%10=0 THEN 'own-1' ELSE 'external-'||(n%20) END,n%10=0,
      'synthetic message '||n||' '||repeat('sample ',32),
      '2026-01-01'::timestamptz+(n/10)*interval '1 second'-(CASE WHEN n%50=0 THEN interval '1 day' ELSE interval '0' END),
      CASE WHEN n%10=0 THEN 'accepted' END,'2026-02-01'::timestamptz+n*interval '1 millisecond'
      FROM unnest(ARRAY['measured','control']) g CROSS JOIN generate_series(1,$1::int) n`,
        [count],
      );
      await f.db.query("ANALYZE messages");
      const metadata = {
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        sourceFiles: Object.fromEntries(
          await Promise.all(
            [
              "apps/server/src/modules/gateway/index.ts",
              "tests/integration/timeline-measurement.test.ts",
            ].map(async (path) => [
              path,
              createHash("sha256")
                .update(await readFile(path))
                .digest("hex"),
            ]),
          ),
        ),
        database: new URL(f.url).pathname.slice(1),
        postgres: (
          await f.db.query(
            "SELECT version() AS version, current_setting('work_mem') AS work_mem",
          )
        ).rows[0],
        node: process.version,
        indexes: (
          await f.db.query(
            "SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('messages','timeline_snapshots') ORDER BY indexname",
          )
        ).rows,
        statistics: (
          await f.db.query(
            "SELECT attname,n_distinct,null_frac,correlation FROM pg_stats WHERE tablename='messages' AND attname IN ('group_id','sent_at','id') ORDER BY attname",
          )
        ).rows,
        distribution: {
          measuredGroup: count,
          controlGroup: count,
          total: count * 2,
          ownFraction: 0.1,
          lateTimestampFraction: 0.02,
          timestamps:
            "floor(n/10) seconds; every 50th timestamp is one day earlier; insertion order is n",
          text: "synthetic identifier and 224 ASCII sample bytes",
          limit: 50,
        },
      };
      const app = await createApp({
        db: f.db,
        logger: false,
        background: false,
        modules: (ctx) => [createGatewayModule(ctx)],
      });
      f.onCleanup(() => app.close());
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const login = await fetch(`${address}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
      });
      assert.equal(login.status, 200);
      const { accessToken } = (await login.json()) as { accessToken: string };
      const query = f.db.query.bind(f.db);
      const captured: {
        sql: string;
        values: unknown[];
        elapsedMs: number;
        rows: number;
        resultBytes: number;
      }[] = [];
      f.db.query = async <R extends QueryResultRow = QueryResultRow>(
        sql: string,
        values?: unknown[],
      ): Promise<QueryResult<R>> => {
        const start = performance.now();
        const result = await query<R>(sql, values);
        if (
          sql.startsWith("SELECT * FROM messages WHERE group_id=") ||
          sql.includes("FROM timeline_snapshots WHERE") ||
          sql.startsWith("INSERT INTO timeline_snapshots")
        )
          captured.push({
            sql,
            values: values ?? [],
            elapsedMs: performance.now() - start,
            rows: result.rows.length,
            resultBytes: Buffer.byteLength(JSON.stringify(result.rows)),
          });
        return result;
      };
      const get = async (path: string) => {
        const memoryBefore = process.memoryUsage();
        const start = performance.now();
        const response = await fetch(`${address}${path}`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const raw = await response.text();
        const elapsedMs = performance.now() - start;
        const memoryAfter = process.memoryUsage();
        assert.equal(response.status, 200, raw);
        return {
          page: JSON.parse(raw) as Page,
          sample: {
            elapsedMs,
            responseBytes: Buffer.byteLength(raw),
            heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
            rssDelta: memoryAfter.rss - memoryBefore.rss,
          },
        };
      };
      const first = await get("/api/groups/measured/messages?limit=50");
      const continuation = await get(
        `/api/groups/measured/messages?limit=50&before=${first.page.nextCursor}`,
      );
      assert.equal(first.page.items.length, 50);
      assert.equal(continuation.page.items.length, 50);
      f.db.query = query;
      const select = captured.find((entry) =>
        entry.sql.startsWith("SELECT * FROM messages"),
      )!;
      const continued = captured.find((entry) =>
        entry.sql.includes("FROM timeline_snapshots WHERE"),
      )!;
      const plans = [];
      for (const entry of [select, continued]) {
        const plan = await query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${entry.sql}`,
          entry.values,
        );
        plans.push({
          sql: entry.sql,
          parameters: entry.values,
          plan: plan.rows[0]!["QUERY PLAN"],
        });
      }
      const candidateSql =
        "SELECT jsonb_array_length(items) AS total, jsonb_path_query_array(items, '$[$start to $last]'::jsonpath, jsonb_build_object('start', LEAST($3::numeric, jsonb_array_length(items)), 'last', LEAST(jsonb_array_length(items), $3::numeric+$4::int)-1)) AS items FROM timeline_snapshots WHERE id=$1 AND group_id=$2";
      let candidate;
      if (process.env.TIMELINE_COMPARE_SLICE === "1") {
        const started = performance.now();
        const result = await query(candidateSql, continued.values);
        const elapsedMs = performance.now() - started;
        const original = await query(continued.sql, continued.values);
        assert.deepEqual(result.rows, original.rows);
        for (const offset of [
          0,
          49,
          count - 1,
          count,
          Number.MAX_SAFE_INTEGER,
        ]) {
          const args = [first.page.snapshotId, "measured", offset, 50];
          assert.deepEqual(
            (await query(candidateSql, args)).rows,
            (await query(continued.sql, args)).rows,
          );
        }
        const plan = await query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${candidateSql}`,
          continued.values,
        );
        candidate = {
          sql: candidateSql,
          elapsedMs,
          plan: plan.rows[0]!["QUERY PLAN"],
          equalOffsets: [0, 49, count - 1, count, Number.MAX_SAFE_INTEGER],
          changedProduct: false,
        };
      }
      const snapshot = (
        await query<{ items: Message[]; bytes: number }>(
          "SELECT items,pg_column_size(items) AS bytes FROM timeline_snapshots WHERE id=$1",
          [first.page.snapshotId],
        )
      ).rows[0]!;
      assert.equal(snapshot.items.length, count);
      assert.deepEqual(first.page.items, snapshot.items.slice(0, 50));
      assert.deepEqual(continuation.page.items, snapshot.items.slice(50, 100));
      // Mutations occur only in this owned fixture. Old cursor contents/order stay frozen.
      await query(
        "INSERT INTO messages(id,group_id,msg_id,sender_platform_user_id,is_own,text,sent_at) VALUES('late-arrival','measured','late-arrival','external',false,'late historical arrival','2025-01-01')",
      );
      await query(
        "UPDATE messages SET delivery_status='sent',msg_id='confirmed-after-snapshot',sent_at='2027-01-01' WHERE id='measured-000010'",
      );
      const repeated = await get(
        `/api/groups/measured/messages?limit=50&before=${first.page.nextCursor}`,
      );
      assert.deepEqual(repeated.page, continuation.page);
      const all: Message[] = [...first.page.items];
      let cursor = first.page.nextCursor;
      while (cursor) {
        const page = (
          await get(`/api/groups/measured/messages?limit=100&before=${cursor}`)
        ).page;
        all.push(...page.items);
        cursor = page.nextCursor;
      }
      assert.deepEqual(
        all,
        snapshot.items,
        "old cursor retains every same-time, late and outbound identity/value",
      );
      for (const offset of [0, count - 1, count, Number.MAX_SAFE_INTEGER]) {
        const cursor = Buffer.from(
          JSON.stringify({ snapshotId: first.page.snapshotId, offset }),
        ).toString("base64url");
        const page = (
          await get(`/api/groups/measured/messages?limit=50&before=${cursor}`)
        ).page;
        assert.deepEqual(page.items, snapshot.items.slice(offset, offset + 50));
      }
      await query(
        "INSERT INTO groups(id,gateway_group_id,creator_account_id) VALUES('empty','empty','account-1')",
      );
      const empty = (await get("/api/groups/empty/messages")).page;
      const emptyCursor = Buffer.from(
        JSON.stringify({ snapshotId: empty.snapshotId, offset: 0 }),
      ).toString("base64url");
      assert.deepEqual(
        (await get(`/api/groups/empty/messages?before=${emptyCursor}`)).page
          .items,
        [],
      );
      const fresh = await get("/api/groups/measured/messages?limit=50");
      assert.equal(fresh.page.items[0]!.id, "measured-000010");
      const freshCount = (
        await query(
          "SELECT jsonb_array_length(items) AS count FROM timeline_snapshots WHERE id=$1",
          [fresh.page.snapshotId],
        )
      ).rows[0]!.count;
      assert.equal(freshCount, count + 1);
      const report = {
        ...metadata,
        address,
        first: first.sample,
        continuation: continuation.sample,
        queryObservations: captured.map(({ values, ...rest }) => ({
          ...rest,
          parameters: rest.sql.startsWith("INSERT")
            ? "snapshot omitted; metadata only"
            : values,
        })),
        snapshot: {
          count,
          storedBytes: snapshot.bytes,
          jsonBytes: Buffer.byteLength(JSON.stringify(snapshot.items)),
        },
        plans,
        candidate,
        semantics: {
          sameTimestampOrdering: true,
          lateArrivalKeptOutOfOldSnapshot: true,
          outboundConfirmationKeptOutOfOldSnapshot: true,
          allOldCursorValuesUnchanged: true,
          emptySnapshotAndBeyondEndOffsets: true,
          freshSnapshotCount: freshCount,
        },
        measurementLimits:
          "One first-page and one continuation HTTP sample per scale; EXPLAIN follows those samples on warmed data. Memory is process before/after delta, not peak. No p95, capacity or production-load guarantee. No index/query/product changes.",
      };
      const output = resolve(
        process.env.TIMELINE_MEASUREMENT_OUTPUT ??
          "docs/evidence/final-enhancement-measurement",
      );
      await mkdir(output, { recursive: true });
      await writeFile(
        join(output, `timeline-${count}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      await f.close();
      t.diagnostic(
        JSON.stringify({
          count,
          database: metadata.database,
          first: first.sample,
          continuation: continuation.sample,
          selectedRows: select.rows,
          storedSnapshotBytes: snapshot.bytes,
          cleanup: "app, pools and exact temporary database closed",
        }),
      );
    },
  );
}
