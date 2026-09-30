import test from "node:test";
import assert from "node:assert/strict";
import type { PlatformEvent } from "../src/api/schemas.ts";
import { AttentionCandidates } from "../src/attention/model.ts";
import {
  directoryAttentionImpact,
  directoryAttentionKey,
} from "../src/directory/attention.ts";

const event = (
  type: string,
  payload: Record<string, unknown>,
  seq = 12,
): PlatformEvent => ({ seq, type, payload: { groupId: "g1", ...payload } });
const evidence = { seq: 12, revision: 3, path: "/api/group-directory" };
function deliver(
  model: AttentionCandidates,
  value: PlatformEvent,
  versions: Record<string, string>,
): void {
  const key = directoryAttentionKey(value);
  if (key !== null)
    model.receive(
      key,
      value.seq,
      10,
      true,
      versions[key],
      directoryAttentionImpact(value) === "changed",
    );
}

test("member count commit survives replay after REST and unrelated WS events already advanced the snapshot", () => {
  const model = new AttentionCandidates();
  // The prior visible count was 2. REST already returned 3 while only unrelated
  // event 11 was consumed; the delayed member commit arrives as event 12.
  const restAhead = { g1: JSON.stringify({ memberCount: 3 }) };
  deliver(
    model,
    event("group_changed", {
      changedFields: ["members"],
      directoryChangedFields: ["memberCount"],
    }),
    restAhead,
  );
  model.reconcile(restAhead, evidence);
  assert.equal(model.pending.size, 1);
  assert.equal(model.tabPending, true);
  assert.equal(model.confirm("g1", { ...evidence, seq: 11 }, 12), false);
  assert.equal(model.confirm("g1", evidence, 12), true);
});

test("active Agent and sequence identity commits survive REST-leading replay without treating steps as card changes", () => {
  for (const [type, field] of [
    ["agent_run", "activeAgentRunId"],
    ["sequence_run", "activeSequenceRunId"],
  ] as const) {
    const model = new AttentionCandidates();
    const restAhead = { g1: JSON.stringify({ [field]: "run-new" }) };
    deliver(
      model,
      event(type, { runId: "run-new", directoryChangedFields: [field] }),
      restAhead,
    );
    model.reconcile(restAhead, evidence);
    assert.equal(model.pending.size, 1);
    assert.equal(
      directoryAttentionKey(
        event(type, { runId: "run-new", directoryChangedFields: [] }),
      ),
      null,
    );
  }
});

test("role-only membership, run recovery and step progression remain silent; polling alone creates no candidate", () => {
  const model = new AttentionCandidates();
  for (const value of [
    event("group_changed", {
      changedFields: ["members"],
      directoryChangedFields: [],
    }),
    event("agent_run", {
      status: "running",
      recoveryNote: "paused",
      directoryChangedFields: [],
    }),
    event("sequence_run", {
      status: "running",
      currentStepIndex: 2,
      directoryChangedFields: [],
    }),
    event("group_changed", { changedFields: ["autoKickEnabled"] }),
  ])
    deliver(model, value, { g1: "same projection" });
  model.reconcile({ g1: "same projection" }, evidence);
  assert.equal(model.pending.size, 0);
});

test("legacy coarse events retain uncertainty as a range target instead of claiming an unchanged or read card", () => {
  for (const type of ["group_changed", "agent_run", "sequence_run"]) {
    const value = event(
      type,
      type === "group_changed"
        ? { changedFields: ["members"] }
        : { runId: "run" },
    );
    assert.equal(directoryAttentionImpact(value), "possible");
    assert.equal(directoryAttentionKey(value), "range:g1");
    const model = new AttentionCandidates();
    deliver(model, value, { g1: "already updated snapshot" });
    model.reconcile({ g1: "already updated snapshot" }, evidence);
    assert.equal(model.pending.size, 1);
    assert.equal(model.confirm("g1", evidence, 12), false);
    assert.equal(model.confirm("range:g1", evidence, 12), true);
  }
});

test("direct visible group changes remain definitive even with a simultaneous role-only projection marker", () => {
  const value = event("group_changed", {
    changedFields: ["name", "members"],
    directoryChangedFields: [],
  });
  assert.equal(directoryAttentionImpact(value), "changed");
  assert.equal(directoryAttentionKey(value), "g1");
  assert.equal(
    directoryAttentionKey(event("message", { changeKind: "created" })),
    null,
  );
});
