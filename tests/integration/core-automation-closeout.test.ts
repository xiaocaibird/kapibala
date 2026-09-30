import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "../../packages/contracts/src/index.js";
import {
  automationFixture,
  deferred,
  delay,
  end,
  tool,
  until,
} from "../support/core-automation-fixture.js";

test("CG13: legal turns reset consecutive errors and preserve exact history shapes and end_turn semantics", async (t) => {
  const f = await automationFixture(t);
  const later = await f.inbound("later trigger", "2026-01-02T00:00:00.000Z");
  const earlier = await f.inbound(
    "earlier trigger",
    "2026-01-01T00:00:00.000Z",
  );
  await f.inbound("own history", "2025-12-31T00:00:00.000Z", true);
  const replies = [
    "not JSON",
    tool("read-1", "get_recent_messages", { limit: 10 }),
    tool("unknown", "not_a_tool", {}),
    tool("invalid", "get_recent_messages", { limit: 0 }),
    tool("read-2", "get_recent_messages", { limit: 10 }),
    "```json\n{}\n```",
    end("结束文字不能发到群里"),
  ];
  const counts: number[] = [];
  f.handlers.turn = async (body) => {
    counts.push((await f.readRun(body.runId)).protocol_errors);
    assert.ok(f.turns.length <= replies.length);
    return replies[f.turns.length - 1];
  };
  const id = await f.start();
  const run = await f.complete(id);
  assert.deepEqual(counts, [0, 1, 0, 1, 2, 0, 1]);
  assert.equal(run.protocol_errors, 0);
  assert.equal(run.step_count, 7);
  assert.equal(run.status, "finished");
  assert.equal(run.end_reason, "final");
  assert.equal(run.summary, "结束文字不能发到群里");
  const first = f.turns[0]!;
  assert.equal(first.messages[0]!.role, "user");
  const contextBlock = first.messages[0]!.content[0]!;
  assert.equal(contextBlock.type, "text");
  if (contextBlock.type !== "text") throw new Error("Expected trigger text");
  assert.deepEqual(JSON.parse(contextBlock.text), {
    groupId: "g",
    triggerMessages: [earlier, later],
    policy: { autoKickEnabled: true },
    ownPlatformUserIds: [1, 2, 3, 4, 5, 6].map((n) => `account-${n}`),
  });
  assert.deepEqual(first.tools.map((entry) => entry.name).sort(), [
    "finish",
    "get_recent_messages",
    "kick_user",
    "send_message",
  ]);
  assert.ok(f.turns.every((body) => body.runId === id));
  const history = run.history;
  for (const [index, length] of [1, 2, 4, 6, 8, 10, 11].entries())
    assert.deepEqual(
      f.turns[index]!.messages,
      history.slice(0, length),
      `turn ${index + 1} must receive the complete committed history`,
    );
  assert.deepEqual(
    history.map((message) => [message.role, message.content[0]!.type]),
    [
      ["user", "text"],
      ["user", "text"],
      ["assistant", "tool_use"],
      ["user", "tool_result"],
      ["assistant", "tool_use"],
      ["user", "tool_result"],
      ["assistant", "tool_use"],
      ["user", "tool_result"],
      ["assistant", "tool_use"],
      ["user", "tool_result"],
      ["user", "text"],
      ["assistant", "text"],
    ],
  );
  for (const [index, code] of [
    [5, "UNKNOWN_TOOL"],
    [7, "INVALID_INPUT"],
  ] as const) {
    const result = history[index]!.content[0]!;
    assert.equal(result.type, "tool_result");
    if (result.type !== "tool_result") throw new Error("Expected tool result");
    assert.equal(result.is_error, true);
    assert.equal(JSON.parse(result.content).code, code);
    assert.equal(result.tool_use_id, index === 5 ? "unknown" : "invalid");
  }
  for (const index of [1, 10]) {
    const error = history[index]!.content[0]!;
    assert.equal(error.type, "text");
    if (error.type === "text")
      assert.match(error.text, /^PROTOCOL_ERROR BAD_JSON: /);
  }
  const steps = await f.steps(id);
  assert.deepEqual(
    steps.map((step) => step.kind),
    [
      "protocol_error",
      "tool_use",
      "tool_use",
      "tool_use",
      "tool_use",
      "protocol_error",
      "final",
    ],
  );
  for (const index of [0, 5]) {
    assert.equal(steps[index]!.tool_use_id, null);
    assert.equal(steps[index]!.name, null);
    assert.equal(steps[index]!.input, null);
    assert.equal(steps[index]!.raw_response, replies[index]);
  }
  assert.equal(f.audits.length, 0);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(
    (
      await f.db.query(
        "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
      )
    ).rowCount,
    0,
  );
});

test("CG14: three audit responses without verdict block one step and publish the terminal fields without effects", async (t) => {
  const f = await automationFixture(t);
  f.handlers.turn = () =>
    tool("send", "send_message", {
      text: "requires approval",
      idempotency_key: "one",
    });
  f.handlers.audit = () => ({ reason: "no verdict provided" });
  await f.inbound();
  const id = await f.start();
  const run = await f.complete(id);
  assert.equal(run.status, "blocked");
  assert.equal(run.end_reason, "audit_blocked");
  assert.equal(run.step_count, 1);
  assert.equal(f.turns.length, 1);
  assert.equal(f.audits.length, 3);
  assert.ok(
    f.audits.every(
      (audit) => audit.text === "requires approval" && audit.groupId === "g",
    ),
  );
  const step = (await f.steps(id))[0]!;
  assert.equal(step.audit_attempts, 3);
  assert.equal(step.audit_verdict, null);
  assert.equal(step.state, "complete");
  assert.equal(step.error_code, "AUDIT_REJECTED");
  assert.equal(
    run.history.length,
    3,
    "audit retries must not append three tool results",
  );
  const event = (
    await f.db.query(
      "SELECT payload FROM events WHERE type='agent_run' AND payload->>'status'='blocked'",
    )
  ).rows;
  assert.equal(event.length, 1);
  assert.deepEqual(event[0]!.payload, {
    runId: id,
    groupId: "g",
    status: "blocked",
    endReason: "audit_blocked",
    summary: null,
    recoveryNote: null,
    directoryChangedFields: ["activeAgentRunId"],
  });
  assert.equal(
    (
      await f.db.query(
        "SELECT id FROM messages WHERE client_msg_id IS NOT NULL",
      )
    ).rowCount,
    0,
  );
  assert.equal((await f.db.query("SELECT * FROM agent_send_keys")).rowCount, 0);
  assert.equal(f.gatewayRequests.length, 0);
});

test("CG14: no online member for send and no online elevated member for kick are business errors", async (t) => {
  const f = await automationFixture(t);
  await f.db.query(
    "UPDATE accounts SET status='disconnected' WHERE id IN ('account-1','account-2','account-3')",
  );
  f.handlers.turn = async () => {
    if (f.turns.length === 1)
      return tool("send", "send_message", {
        text: "cannot send",
        idempotency_key: "one",
      });
    if (f.turns.length === 2) {
      await f.db.query(
        "UPDATE accounts SET status='online' WHERE id='account-3'",
      );
      return tool("kick", "kick_user", {
        platform_user_id: "external",
        reason: "cannot kick",
      });
    }
    return end();
  };
  await f.inbound();
  const id = await f.start();
  const run = await f.complete(id);
  assert.equal(run.status, "finished");
  assert.equal(run.step_count, 3);
  assert.equal(run.protocol_errors, 0);
  const steps = await f.steps(id);
  assert.deepEqual(
    steps
      .slice(0, 2)
      .map((step) => [step.error_code, step.is_error, step.audit_verdict]),
    [
      ["NO_AVAILABLE_ACCOUNT", true, "pass"],
      ["NO_AVAILABLE_ACCOUNT", true, "pass"],
    ],
  );
  assert.equal(f.audits.length, 2);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal((await f.db.query("SELECT * FROM agent_send_keys")).rowCount, 0);
});

test("CG14: disabling autoKick while the audit is pending prevents the authorized tool from executing", async (t) => {
  const f = await automationFixture(t);
  const gate = deferred();
  f.onCleanup(async () => gate.resolve());
  f.handlers.turn = () =>
    f.turns.length === 1
      ? tool("kick", "kick_user", {
          platform_user_id: "external",
          reason: "policy race",
        })
      : end();
  f.handlers.audit = async () => {
    await gate.promise;
    return { verdict: "pass", reason: "approved" };
  };
  await f.inbound();
  const id = await f.start();
  await until(async () => f.audits.length === 1);
  assert.deepEqual(f.audits[0], {
    groupId: "g",
    text: JSON.stringify({
      action: "kick",
      platform_user_id: "external",
      reason: "policy race",
    }),
  });
  const changed = await f.api("PATCH", "/api/groups/g", {
    autoKickEnabled: false,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  gate.resolve();
  const run = await f.complete(id);
  assert.equal(run.status, "finished");
  const step = (await f.steps(id))[0]!;
  assert.equal(step.audit_verdict, "pass");
  assert.equal(step.error_code, "POLICY_DENIED");
  assert.equal(step.intent, null);
  assert.equal(f.gatewayRequests.length, 0);
  assert.equal(
    (
      await f.db.query(
        "SELECT count(*)::int AS n FROM members WHERE group_id='g'",
      )
    ).rows[0]!.n,
    3,
  );
});

test("CG15: a current run reads newly arrived messages in order and exposes Unicode and raw response bounds", async (t) => {
  const f = await automationFixture(t);
  const trigger = await f.inbound("触".repeat(500), "2026-01-01T00:00:00.000Z");
  const entered = deferred();
  const release = deferred();
  f.onCleanup(async () => release.resolve());
  const raw = "💡".repeat(513);
  f.handlers.turn = async () => {
    if (f.turns.length === 1) {
      entered.resolve();
      await release.promise;
      return tool("recent", "get_recent_messages", { limit: 50 });
    }
    if (f.turns.length === 2) return raw;
    return end("结".repeat(201));
  };
  const id = await f.start();
  await entered.promise;
  const fresh = await f.inbound("💡".repeat(501), "2026-01-03T00:00:00.000Z");
  const own = await f.inbound("own", "2026-01-02T00:00:00.000Z", true);
  release.resolve();
  const run = await f.complete(id);
  const recent = (await f.steps(id))[0]!;
  const value = recent.result as {
    messages: {
      msgId: string;
      senderPlatformUserId: string;
      isOwn: boolean;
      text: string;
      sentAt: string;
    }[];
    truncated: boolean;
  };
  assert.deepEqual(value.messages, [
    { ...trigger, isOwn: false },
    { ...own, isOwn: true },
    { ...fresh, isOwn: false, text: "💡".repeat(500) },
  ]);
  assert.equal(value.truncated, true);
  assert.equal([...value.messages[2]!.text].length, 500);
  const response = await f.api("GET", `/api/agent-runs/${id}`);
  assert.equal(response.statusCode, 200, response.body);
  const dto = response.json<AgentRun>();
  assert.equal(
    dto.summary,
    "结".repeat(201),
    "the full final summary is independent of the step preview",
  );
  assert.ok(dto.steps!.every((step) => [...step.resultSummary].length <= 200));
  assert.equal([...dto.steps![0]!.resultSummary].length, 200);
  assert.equal([...dto.steps![2]!.resultSummary].length, 200);
  assert.equal(dto.steps![1]!.rawResponse, "💡".repeat(512));
  assert.equal(Buffer.byteLength(dto.steps![1]!.rawResponse), 2048);
  assert.equal(dto.steps![1]!.kind, "protocol_error");
  const content = run.history[2]!.content[0]!;
  assert.equal(content.type, "tool_result");
  if (content.type === "tool_result")
    assert.ok(Buffer.byteLength(content.content) <= 8192);
  assert.equal(f.gatewayRequests.length, 0);
});

test("CG16: invalid indexes have no persistent effects and the next step starts from actual skip time", async (t) => {
  const f = await automationFixture(t);
  await f.db.query("UPDATE groups SET agent_enabled=false WHERE id='g'");
  const definition = (indexes: unknown[]) => ({
    name: "indexes",
    steps: indexes.map((index) => ({
      index,
      accountRole: "member",
      text: "test",
      delaySeconds: 0,
    })),
  });
  for (const indexes of [
    [0],
    [-1],
    [1.5],
    ["1"],
    [2],
    [1, 1],
    [1, 3],
    [2, 1],
  ]) {
    const response = await f.api("POST", "/api/sequences", definition(indexes));
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, "VALIDATION_ERROR");
  }
  for (const table of [
    "sequences",
    "sequence_runs",
    "sequence_steps",
    "messages",
    "events",
  ])
    assert.equal((await f.db.query(`SELECT 1 FROM ${table}`)).rowCount, 0);
  await f.automation.recover!();
  await f.db.query("DELETE FROM members WHERE role='member'");
  const created = await f.api("POST", "/api/sequences", {
    name: "skip anchor",
    steps: [
      { index: 1, accountRole: "member", text: "skip", delaySeconds: 0 },
      {
        index: 2,
        accountRole: "admin",
        text: "after skip",
        delaySeconds: 0.25,
      },
    ],
  });
  assert.equal(created.statusCode, 200, created.body);
  const started = await f.api("POST", "/api/groups/g/sequence-runs", {
    sequenceId: created.json().id,
  });
  assert.equal(started.statusCode, 201, started.body);
  const runId = started.json().runId;
  await delay(100);
  await f.automation.tick();
  const rows = (
    await f.db.query(
      "SELECT * FROM sequence_steps WHERE run_id=$1 ORDER BY index",
      [runId],
    )
  ).rows;
  assert.equal(rows[0]!.status, "skipped");
  assert.equal(rows[0]!.client_msg_id, null);
  assert.ok(rows[0]!.sent_at instanceof Date);
  assert.equal(
    rows[1]!.scheduled_at.getTime() - rows[0]!.sent_at.getTime(),
    250,
  );
  assert.ok(
    rows[0]!.sent_at.getTime() - rows[0]!.scheduled_at.getTime() >= 90,
    "next schedule must use the actual later skip, not original due time",
  );
  await f.automation.tick();
  assert.equal((await f.db.query("SELECT id FROM messages")).rowCount, 0);
  await delay(Math.max(0, rows[1]!.scheduled_at.getTime() - Date.now()) + 10);
  await f.automation.tick();
  const message = (await f.db.query("SELECT * FROM messages")).rows;
  assert.equal(message.length, 1);
  assert.equal(message[0]!.account_id, "account-2");
  assert.equal(message[0]!.text, "after skip");
  assert.ok(
    message[0]!.created_at.getTime() >= rows[1]!.scheduled_at.getTime(),
  );
  assert.equal(
    f.gatewayRequests.length,
    0,
    "the test stops at the durable queue boundary",
  );
});
