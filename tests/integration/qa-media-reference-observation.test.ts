import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import type { MediaRequest } from "../../scripts/qa-runtime-observation/media-witness.js";
import { runtimeFixture } from "../support/runtime-observation-fixture.js";
import {
  deferred,
  until,
  tool,
  end,
  delay,
} from "../support/core-automation-fixture.js";

async function fixture(t: TestContext, unknown = false) {
  const mediaDirectory = await mkdtemp("/tmp/kap-media-observe-");
  const streams = new Set<ServerResponse>();
  const first = deferred(),
    final = deferred();
  const kickLedger: {
    method: string;
    url: string;
    status: number;
    at: string;
  }[] = [];
  let turns = 0,
    kicks = 0;
  const f = await runtimeFixture(t, false, {
    extraEnv: { MEDIA_DIR: mediaDirectory, MEDIA_CLEANUP_INTERVAL_MS: "100" },
    configureRemote(remote) {
      remote.addHook("onResponse", async (request, reply) => {
        if (request.url === "/groups/remote-g/kick")
          kickLedger.push({
            method: request.method,
            url: request.url,
            status: reply.statusCode,
            at: new Date().toISOString(),
          });
      });
      remote.addHook("onRequest", (req, reply, done) => {
        if (req.url.split("?")[0] === "/events") {
          streams.add(reply.raw);
          reply.raw.once("close", () => streams.delete(reply.raw));
        }
        done();
      });
      remote.get("/media/:id", () => Buffer.from("real reference media bytes"));
      remote.post("/agent/turn", async () => {
        turns++;
        if (unknown)
          return tool("unknown-kick", "kick_user", {
            platform_user_id: "external-target",
            reason: "media reference recovery check",
          });
        if (turns === 1) {
          await first.promise;
          return tool("history-read", "get_recent_messages", { limit: 10 });
        }
        await final.promise;
        return end();
      });
      remote.post("/agent/audit", () => ({
        verdict: "pass",
        reason: "approved",
      }));
      remote.post("/groups/remote-g/kick", (_request, reply) => {
        kicks++;
        return reply.code(503).send({
          error: { code: "SERVICE_UNAVAILABLE", message: "result unknown" },
        });
      });
      remote.get("/groups/remote-g/members", () =>
        ["account-1", "account-2", "external-target"].map((platformUserId) => ({
          platformUserId,
        })),
      );
    },
  });
  f.onCleanup(async () => {
    first.resolve();
    final.resolve();
    await f.kill();
    await rm(mediaDirectory, { recursive: true });
  });
  await f.db.query("UPDATE accounts SET status='online',platform_user_id=id");
  await f.db.query(
    "INSERT INTO groups(id,gateway_group_id,creator_account_id,agent_enabled,auto_kick_enabled) VALUES('g','remote-g','account-1',true,true)",
  );
  await f.db.query(
    "INSERT INTO members(group_id,account_id,platform_user_id,role) VALUES('g','account-1','account-1','creator'),('g','account-2','account-2','admin'),('g',null,'external-target','member')",
  );
  let eventId = 100;
  async function emit(msgId: string, own: boolean, media = true) {
    await until(async () => streams.size > 0);
    const event = {
      eventId: ++eventId,
      type: "message",
      groupId: "remote-g",
      msgId,
      senderPlatformUserId: own ? "account-1" : "external-target",
      text: msgId,
      sentAt: new Date().toISOString(),
      ...(media ? { mediaUrl: `/media/${msgId}` } : {}),
    };
    for (const stream of streams)
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  const file = async () =>
    (
      await f.db.query(
        "SELECT f.*,m.id AS message_id FROM media_files f JOIN messages m ON m.group_id=f.group_id AND m.msg_id=f.msg_id WHERE f.group_id='g' AND f.msg_id='attachment'",
      )
    ).rows[0]!;
  const refs = async () =>
    (
      await f.db.query(
        "SELECT p.*,r.status,r.recovery_note FROM agent_media_references p JOIN agent_runs r ON r.id=p.run_id ORDER BY p.run_id,p.media_id",
      )
    ).rows;
  async function ready() {
    await until(async () => (await file())?.state === "ready");
    return file();
  }
  async function arm(
    mode: MediaRequest["mode"],
    holdAt: string[],
    operation?: object,
    ttlMs = 20000,
  ) {
    const row = await file();
    const id = randomUUID();
    const body = {
      protocol: "qa-runtime-observation/1",
      target: f.target(),
      ttlMs,
      mode,
      holdAt,
      correlation: {
        kind:
          mode === "hold-media-reference" ? "media-reference" : "media-cleanup",
        groupId: "g",
        msgId: "attachment",
        mediaId: row.id,
        ...(operation ? { operation } : {}),
      },
    };
    const result = await f.request("PUT", `/leases/${id}`, body);
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return { id, body };
  }
  async function history() {
    await emit("attachment", true);
    await ready();
    await emit("plain-trigger", false, false);
    await until(async () => turns === 1);
    const runs = await f.api("/api/groups/g/agent-runs");
    assert.equal(runs.status, 200);
    return (runs.value as { id: string }[])[0]!.id;
  }
  async function expire() {
    await f.db.query(
      "UPDATE media_files SET downloaded_at=now()-interval '31 days' WHERE group_id='g' AND msg_id='attachment' AND state='ready'",
    );
  }
  async function finish() {
    final.resolve();
    await until(async () =>
      (await f.db.query("SELECT status FROM agent_runs")).rows.every(
        (r) => r.status !== "running",
      ),
    );
  }
  return {
    ...f,
    mediaDirectory,
    emit,
    file,
    refs,
    ready,
    arm,
    history,
    expire,
    finish,
    first,
    final,
    kicks: () => kicks,
    turns: () => turns,
    kickLedger,
  };
}

test(
  "MR01 real history reference wins the row lock; cleanup TTL cannot release the reference and actual recheck preserves bytes",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const runId = await f.history();
    const reference = await f.arm(
      "hold-media-reference",
      ["reference-locked", "reference-registered"],
      { kind: "history", runId, toolUseId: "history-read" },
    );
    const cleanup = await f.arm(
      "hold-media-cleanup",
      ["cleanup-before-lock", "cleanup-claimed"],
      undefined,
      5000,
    );
    assert.equal(
      (await f.request("PUT", `/leases/${randomUUID()}`, reference.body))
        .status,
      409,
    );
    assert.equal(
      (
        await f.request("PUT", `/leases/${reference.id}`, {
          ...reference.body,
          correlation: { ...reference.body.correlation, mediaId: randomUUID() },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.request("PUT", `/leases/${randomUUID()}`, {
          ...reference.body,
          target: { ...f.target(), pid: process.pid },
        })
      ).status,
      409,
    );
    await f.expire();
    await f.event(cleanup.id, "cleanup-before-lock");
    f.first.resolve();
    const locked = await f.event(reference.id, "reference-locked");
    assert.equal(locked.state, "held");
    const operation = locked.events.find((e) => e.kind === "reference-locked")!;
    assert.deepEqual(operation.selectedMediaIds, [(await f.file()).id]);
    assert.equal((await f.refs()).length, 0);
    await f.event(cleanup.id, "cleanup-before-lock");
    await until(
      async () => (await f.snapshot(cleanup.id)).state === "released",
      8000,
    );
    assert.deepEqual(await f.snapshot(reference.id), locked);
    await until(async () =>
      Boolean(
        (
          await f.db.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT * FROM media_files WHERE id=%'",
            [operation.backendPid],
          )
        ).rowCount,
      ),
    );
    await f.advance(reference.id);
    const registered = await f.event(reference.id, "reference-registered");
    assert.equal(registered.state, "held");
    assert.equal(
      (await f.refs()).length,
      0,
      "uncommitted INSERT is not advertised as committed",
    );
    await f.advance(reference.id);
    const committed = await f.event(reference.id, "reference-committed");
    await until(async () => (await f.refs()).length === 1);
    const row = await f.file();
    assert.equal(row.state, "ready");
    assert.equal(
      await readFile(row.local_file_path, "utf8"),
      "real reference media bytes",
    );
    await f.snapshot(reference.id, "DELETE");
    assert.equal((await f.snapshot(cleanup.id)).state, "released");
    f.evidence({
      locked,
      registered,
      committed,
      refs: await f.refs(),
      file: row,
      cleanup: await f.snapshot(cleanup.id),
    });
    await f.finish();
    await until(async () => (await f.file()).state === "deleted");
  },
);

test(
  "MR02 cleanup commits its claim first; later actual history read cannot pin it and exact DELETE releases only cleanup",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    const runId = await f.history();
    const path = (await f.file()).local_file_path;
    const reference = await f.arm(
      "hold-media-reference",
      ["reference-before-lock", "reference-registered"],
      { kind: "history", runId, toolUseId: "history-read" },
    );
    const cleanup = await f.arm("hold-media-cleanup", ["cleanup-claimed"]);
    f.first.resolve();
    await f.event(reference.id, "reference-before-lock");
    await f.expire();
    const claimed = await f.event(cleanup.id, "cleanup-claimed");
    const row = await f.file();
    assert.equal(row.state, "deleting");
    assert.equal(row.local_file_path, null);
    assert.equal(await readFile(path, "utf8"), "real reference media bytes");
    await f.advance(reference.id);
    const registered = await f.event(reference.id, "reference-registered");
    assert.deepEqual(
      registered.events.find((e) => e.kind === "reference-registered")!
        .selectedMediaIds,
      [],
    );
    await f.advance(reference.id);
    await f.event(reference.id, "reference-committed");
    assert.equal((await f.refs()).length, 0);
    await f.snapshot(reference.id, "DELETE");
    await f.snapshot(reference.id, "DELETE");
    assert.deepEqual(await f.snapshot(cleanup.id), claimed);
    await f.snapshot(cleanup.id, "DELETE");
    await until(async () => (await f.file()).state === "deleted");
    await assert.rejects(stat(path), { code: "ENOENT" });
    f.evidence({
      claimed,
      registered,
      refs: await f.refs(),
      file: await f.file(),
    });
    await f.finish();
  },
);

test(
  "MR03 actual trigger reference protects a paused unknown kick across real process restart without replay",
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t, true);
    const blocker = await f.db.pool.connect();
    let released = false;
    f.onCleanup(async () => {
      if (!released) {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    });
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE agent_pending IN SHARE MODE");
    await f.emit("attachment", false);
    const row = await f.ready();
    const reference = await f.arm(
      "hold-media-reference",
      ["reference-registered", "reference-committed"],
      { kind: "trigger", messageId: row.message_id },
    );
    await blocker.query("COMMIT");
    blocker.release();
    released = true;
    const registered = await f.event(reference.id, "reference-registered");
    assert.equal((await f.refs()).length, 0);
    const runId = registered.events.find(
      (e) => e.kind === "reference-registered",
    )!.runId as string;
    assert.equal((await f.api(`/api/agent-runs/${runId}`)).status, 404);
    await f.advance(reference.id);
    const committed = await f.event(reference.id, "reference-committed");
    assert.equal(committed.state, "held");
    assert.equal((await f.refs()).length, 1);
    assert.equal((await f.api(`/api/agent-runs/${runId}`)).status, 200);
    assert.equal(
      f.kicks(),
      0,
      "post-commit hold cannot execute the next business action",
    );
    await f.advance(reference.id);
    await until(async () =>
      Boolean(
        (
          await f.db.query("SELECT recovery_note FROM agent_runs WHERE id=$1", [
            runId,
          ])
        ).rows[0]?.recovery_note,
      ),
    );
    const beforeRun = await f.api(`/api/agent-runs/${runId}`);
    assert.equal(beforeRun.status, 200);
    assert.equal((beforeRun.value as { status: string }).status, "running");
    assert.equal(f.kicks(), 1);
    assert.deepEqual(
      f.kickLedger.map(({ method, url, status }) => ({ method, url, status })),
      [{ method: "POST", url: "/groups/remote-g/kick", status: 503 }],
    );
    const intents = async () =>
      (
        await f.db.query(
          "SELECT run_id,ordinal,state,intent FROM agent_steps WHERE run_id=$1 ORDER BY ordinal",
          [runId],
        )
      ).rows;
    const beforeIntents = await intents();
    assert.equal(beforeIntents[0]?.state, "executing");
    assert.equal(beforeIntents[0]?.intent.dispatchState, "dispatching");
    const refs = await f.refs();
    assert.equal(refs.length, 1);
    await f.expire();
    await delay(300);
    assert.equal((await f.file()).state, "ready");
    const oldTarget = f.target();
    await f.kill();
    await f.start();
    assert.notEqual(f.target().pid, oldTarget.pid);
    await delay(400);
    const afterRun = await f.api(`/api/agent-runs/${runId}`);
    assert.equal((afterRun.value as { status: string }).status, "running");
    assert.equal(
      (afterRun.value as { recoveryNote: string }).recoveryNote,
      (beforeRun.value as { recoveryNote: string }).recoveryNote,
    );
    assert.deepEqual(await f.refs(), refs);
    assert.deepEqual(await intents(), beforeIntents);
    assert.equal(f.kicks(), 1);
    assert.equal(f.turns(), 1);
    assert.equal((await f.file()).state, "ready");
    assert.equal(
      await readFile(row.local_file_path, "utf8"),
      "real reference media bytes",
    );
    const oldLease = await f.snapshot(reference.id, "DELETE");
    assert.equal(
      oldLease.snapshotProvenance?.source,
      "retained-after-process-exit",
    );
    f.evidence({
      registered,
      committed,
      oldTarget,
      newTarget: f.target(),
      beforeRun,
      afterRun,
      refs,
      file: await f.file(),
      kicks: f.kicks(),
      turns: f.turns(),
      kickLedger: f.kickLedger,
      beforeIntents,
      afterIntents: await intents(),
      oldLease,
    });
    const cancel = await f.api("/api/groups/g", "PATCH", {
      agentEnabled: false,
    });
    assert.equal(cancel.status, 200);
    await until(
      async () =>
        (await f.db.query("SELECT status FROM agent_runs WHERE id=$1", [runId]))
          .rows[0]?.status === "cancelled",
    );
    await until(async () => (await f.file()).state === "deleted");
    await assert.rejects(stat(row.local_file_path), { code: "ENOENT" });
  },
);
