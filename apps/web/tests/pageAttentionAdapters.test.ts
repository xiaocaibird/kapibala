import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptsAgentListEvent,
  acceptsSequencePageEvent,
  accountVersion,
  definitiveAgentListEvent,
  definitiveSequenceSelectionEvent,
  definitiveSenderAvailabilityEvent,
  agentStepKey,
  eventEntity,
  groupFields,
  messageKey,
  runVersion,
  sequenceStatusVersion,
  sequenceStepKey,
} from "../src/attention/pageAdapters.ts";
import type { PlatformEvent } from "../src/api/schemas.ts";
const event = (
  type: string,
  payload: Record<string, unknown>,
): PlatformEvent => ({ seq: 7, type, payload });

test("group message attention distinguishes created content, delivery echoes and another group", () => {
  assert.equal(
    messageKey(
      event("message", {
        groupId: "g1",
        id: "m1",
        changeKind: "created",
        source: "agent",
        isOwn: true,
      }),
      "g1",
    ),
    "m1",
  );
  assert.equal(
    messageKey(
      event("message", {
        groupId: "g1",
        id: "m1",
        changeKind: "created",
        source: "sequence",
        isOwn: true,
      }),
      "g1",
    ),
    "m1",
  );
  assert.equal(
    messageKey(
      event("message", { groupId: "g1", id: "m1", changeKind: "delivery" }),
      "g1",
    ),
    null,
  );
  assert.equal(
    messageKey(
      event("message", {
        groupId: "g1",
        id: "m1",
        changeKind: "created",
        attentionIdentity: "pending",
      }),
      "g1",
    ),
    null,
  );
  assert.equal(
    messageKey(
      event("message", { groupId: "g2", id: "m1", changeKind: "created" }),
      "g1",
    ),
    null,
  );
  assert.equal(
    messageKey(event("message", { groupId: "g1", id: "m1" }), "g1"),
    null,
  );
});

test("only the mounted run and exact step identity receive step changes", () => {
  assert.equal(
    agentStepKey(event("agent_step_changed", { runId: "a", ordinal: 2 }), "a"),
    "2",
  );
  assert.equal(
    agentStepKey(event("agent_step_changed", { runId: "b", ordinal: 2 }), "a"),
    null,
  );
  assert.equal(
    agentStepKey(event("agent_run", { runId: "a", ordinal: 2 }), "a"),
    null,
  );
  assert.equal(
    sequenceStepKey(
      event("sequence_step_changed", { runId: "s", stepIndex: 3 }),
      "s",
    ),
    "3",
  );
  assert.equal(
    sequenceStepKey(
      event("sequence_step_changed", { runId: "old", stepIndex: 3 }),
      "s",
    ),
    null,
  );
});

test("account and group adapters reject unrelated page changes", () => {
  assert.equal(
    eventEntity(
      event("account_changed", { accountId: "a" }),
      ["account_changed"],
      "accountId",
    ),
    "a",
  );
  assert.equal(
    eventEntity(
      event("message", { accountId: "a" }),
      ["account_changed"],
      "accountId",
    ),
    null,
  );
  assert.equal(
    groupFields(
      event("group_changed", { groupId: "g", changedFields: ["name"] }),
      "g",
      ["members"],
    ),
    false,
  );
  assert.equal(
    groupFields(
      event("group_changed", { groupId: "g", changedFields: ["name"] }),
      "g",
      ["name"],
    ),
    true,
  );
  assert.equal(
    groupFields(
      event("group_changed", { groupId: "other", changedFields: ["name"] }),
      "g",
      ["name"],
    ),
    false,
  );
});

test("business projections ignore identity-neutral polling and include visible changes", () => {
  const account = {
    id: "a",
    platformUserId: null,
    status: "online" as const,
    rateLimitedUntil: null,
  };
  assert.equal(accountVersion(account), accountVersion({ ...account }));
  assert.notEqual(
    accountVersion(account),
    accountVersion({
      ...account,
      status: "rate_limited",
      rateLimitedUntil: "2026-10-01T00:00:00Z",
    }),
  );
  const run = {
    id: "r",
    groupId: "g",
    status: "running" as const,
    endReason: null,
    summary: null,
  };
  assert.equal(runVersion(run), runVersion({ ...run }));
  assert.notEqual(
    runVersion(run),
    runVersion({ ...run, status: "finished", summary: "completed" }),
  );
  assert.equal(
    sequenceStatusVersion({
      status: "running",
      currentStepIndex: 1,
      steps: [],
    }),
    sequenceStatusVersion({
      status: "running",
      currentStepIndex: 1,
      steps: [],
    }),
  );
});

test("current page journals exclude messages and events from other selected groups", () => {
  assert.equal(
    acceptsAgentListEvent(event("agent_run", { groupId: "g" }), "g"),
    true,
  );
  assert.equal(
    acceptsAgentListEvent(event("agent_run", { groupId: "other" }), "g"),
    false,
  );
  assert.equal(
    acceptsAgentListEvent(event("message", { groupId: "g" }), "g"),
    false,
  );
  assert.equal(
    acceptsSequencePageEvent(
      event("sequence_step_changed", { groupId: "g", runId: "run" }),
      "g",
    ),
    true,
  );
  assert.equal(
    acceptsSequencePageEvent(event("sequence_run", { groupId: "other" }), "g"),
    false,
  );
  assert.equal(
    acceptsSequencePageEvent(
      event("sequence_definition_changed", { sequenceId: "new" }),
      "g",
    ),
    true,
  );
  assert.equal(
    acceptsSequencePageEvent(event("message", { groupId: "g" }), "g"),
    false,
  );
});

test("definitive changes follow the fields shown by each current-page summary", () => {
  assert.equal(
    definitiveAgentListEvent(
      event("agent_run", { status: "running", recoveryNote: "paused" }),
    ),
    false,
  );
  assert.equal(
    definitiveAgentListEvent(
      event("agent_run", { status: "running", recoveryNote: null }),
    ),
    true,
  );
  assert.equal(
    definitiveAgentListEvent(
      event("agent_run", { status: "finished", endReason: "complete" }),
    ),
    true,
  );
  assert.equal(
    definitiveSequenceSelectionEvent(
      event("sequence_run", { status: "running", currentStepIndex: 2 }),
    ),
    false,
  );
  assert.equal(
    definitiveSequenceSelectionEvent(
      event("sequence_run", { status: "running", currentStepIndex: 1 }),
    ),
    true,
  );
  assert.equal(
    definitiveSequenceSelectionEvent(
      event("group_changed", { changedFields: ["members"] }),
    ),
    false,
  );
  assert.equal(
    definitiveSequenceSelectionEvent(
      event("group_changed", { changedFields: ["name"] }),
    ),
    true,
  );
  assert.equal(
    definitiveSenderAvailabilityEvent(
      event("account_status_changed", { from: "online", to: "disconnected" }),
    ),
    true,
  );
  assert.equal(
    definitiveSenderAvailabilityEvent(
      event("account_status_changed", { from: "idle", to: "disconnected" }),
    ),
    false,
  );
  assert.equal(
    definitiveSenderAvailabilityEvent(
      event("account_changed", { changedFields: ["rateLimitedUntil"] }),
    ),
    false,
  );
});
