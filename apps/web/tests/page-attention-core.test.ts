import test from "node:test";
import assert from "node:assert/strict";
import {
  AttentionCandidates,
  type SnapshotEvidence,
} from "../src/attention/model";
import { canFullyFitViewport } from "../src/attention/browser";
import { isDefinitiveBusinessEvent } from "../src/attention/events";

const snapshot = (seq: number): SnapshotEvidence => ({
  seq,
  revision: seq,
  path: "/api/groups/a/messages",
});

test("group message marker excludes history; duplicate created event stays one candidate", () => {
  const state = new AttentionCandidates();
  assert.equal(state.receive("message-a", 9, 10, true), false);
  assert.equal(state.receive("message-a", 11, 10, true), true);
  assert.equal(state.receive("message-a", 11, 10, true), false);
  assert.equal(state.pending.size, 1);
  assert.equal(state.tabPending, true);
});

test("foreground is quiet; leaving pending content promotes a static reminder and focus cannot clear it", () => {
  const state = new AttentionCandidates();
  state.receive("account-a", 11, 10, false, "online");
  assert.equal(state.tabPending, false);
  assert.equal(state.pending.size, 1);
  assert.equal(state.promoteBackground(), true);
  assert.equal(state.promoteBackground(), false);
  assert.equal(state.tabPending, true);
  state.receive("account-a", 12, 10, true, "online");
  assert.equal(state.tabPending, true);
  // Later foreground updates preserve an existing background reminder.
  state.receive("account-a", 13, 10, false, "disconnected");
  assert.equal(state.tabPending, true);
});

test("failed reload and snapshots started before the event cannot acknowledge it", () => {
  const state = new AttentionCandidates();
  state.receive("message-a", 20, 10, true);
  assert.equal(state.confirm("message-a", null, 20), false);
  assert.equal(state.confirm("message-a", snapshot(19), 20), false);
  assert.equal(state.pending.size, 1);
  assert.equal(state.confirm("message-a", snapshot(20), 20), true);
});

test("an account row interaction cannot consume another row or a later update", () => {
  const state = new AttentionCandidates();
  state.receive("account-a", 21, 10, true);
  state.receive("account-b", 22, 10, true);
  assert.equal(state.confirm("account-a", snapshot(22), 22), true);
  assert.equal(state.pending.has("account-b"), true);
  state.receive("account-b", 23, 10, true);
  assert.equal(state.confirm("account-b", snapshot(23), 22), false);
});

test("same displayed status after a fresh snapshot does not create visible-change attention", () => {
  const state = new AttentionCandidates();
  state.receive("run-a", 21, 10, true, "running");
  assert.equal(state.reconcile({ "run-a": "running" }, snapshot(20)), false);
  assert.equal(state.reconcile({ "run-a": "running" }, snapshot(21)), true);
  assert.equal(state.pending.size, 0);
  // Consumed events must not reappear on the next same-value polling render.
  assert.equal(state.receive("run-a", 21, 10, true, "running"), false);
});

test("real account transitions remain pending when online goes away and returns before snapshot", () => {
  const state = new AttentionCandidates();
  state.receive("account-a", 21, 10, true, "online", true);
  state.receive("account-a", 22, 10, true, "online", true);
  assert.equal(state.reconcile({ "account-a": "online" }, snapshot(22)), false);
  assert.equal(state.pending.get("account-a")?.seq, 22);
  assert.equal(state.tabPending, true);
  assert.equal(state.confirm("account-a", snapshot(22), 22), true);
});

test("a definitive replay after REST already rendered its version still requires confirmation", () => {
  const state = new AttentionCandidates();
  state.receive("run-a", 25, 10, true, "finished", true);
  assert.equal(state.reconcile({ "run-a": "finished" }, snapshot(25)), false);
  // A later ambiguous invalidation cannot erase that real transition evidence.
  state.receive("run-a", 26, 10, false, "finished");
  assert.equal(state.reconcile({ "run-a": "finished" }, snapshot(26)), false);
  assert.equal(state.confirm("run-a", snapshot(26), 26), true);
});

test("current event classifier separates precise business changes from legacy invalidation", () => {
  const event = (type: string, payload: Record<string, unknown>) => ({
    seq: 10,
    type,
    payload,
  });
  assert.equal(
    isDefinitiveBusinessEvent(event("group_changed", { groupId: "a" })),
    false,
  );
  assert.equal(
    isDefinitiveBusinessEvent(
      event("group_changed", { groupId: "a", changedFields: ["members"] }),
    ),
    true,
  );
  assert.equal(
    isDefinitiveBusinessEvent(
      event("account_status_changed", { from: "online", to: "online" }),
    ),
    false,
  );
  assert.equal(
    isDefinitiveBusinessEvent(
      event("account_status_changed", { from: "online", to: "disconnected" }),
    ),
    true,
  );
  assert.equal(
    isDefinitiveBusinessEvent(event("message", { changeKind: "delivery" })),
    false,
  );
  assert.equal(
    isDefinitiveBusinessEvent(
      event("message", { changeKind: "created", attentionIdentity: "pending" }),
    ),
    false,
  );
  assert.equal(
    isDefinitiveBusinessEvent(event("message", { changeKind: "created" })),
    true,
  );
});

test("a precise update during first load survives absence of a comparison baseline", () => {
  const state = new AttentionCandidates();
  state.receive("step-1", 21, 10, true);
  assert.equal(state.reconcile({ "step-1": "finished" }, snapshot(21)), false);
  assert.equal(state.pending.size, 1);
});

test("coalesced run status keeps latest sequence and ignores out-of-order arrivals", () => {
  const state = new AttentionCandidates();
  state.receive("run-a", 23, 10, true, "running");
  assert.equal(state.receive("run-a", 22, 10, false, "running"), false);
  assert.equal(state.pending.get("run-a")?.seq, 23);
  assert.equal(state.confirm("run-a", snapshot(22), 23), false);
  assert.equal(state.reconcile({ "run-a": "finished" }, snapshot(23)), false);
});

test("a removed list row remains range-confirmable; one snapshot cannot clear a newer list change", () => {
  const state = new AttentionCandidates();
  state.receive("group-a", 22, 10, true, "active");
  assert.equal(state.reconcile({}, snapshot(22)), false);
  assert.equal(state.confirm("group-a", snapshot(22), 22), true);
  state.receive("group-b", 23, 10, true, "active");
  assert.equal(state.confirm("group-b", snapshot(22), 22), false);
});

test("new scope model discards old group candidates without mutating old async callbacks", () => {
  const oldGroup = new AttentionCandidates();
  const newGroup = new AttentionCandidates();
  oldGroup.receive("message-a", 30, 10, true);
  oldGroup.confirm("message-a", snapshot(30), 30);
  assert.equal(newGroup.pending.size, 0);
  newGroup.receive("message-b", 31, 30, true);
  assert.equal(newGroup.pending.size, 1);
  assert.equal(oldGroup.pending.size, 0);
});

test("a message taller than its 510px timeline needs a summary even inside a 1200px window", () => {
  const names = ["innerHeight", "innerWidth", "getComputedStyle"] as const;
  const originals = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  try {
    Object.defineProperty(globalThis, "innerHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(globalThis, "innerWidth", {
      configurable: true,
      value: 1500,
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
      configurable: true,
      value: () => ({ overflowY: "auto", overflowX: "visible" }),
    });
    const timeline = {
      parentElement: null,
      getBoundingClientRect: () => ({ height: 510, width: 900 }),
    };
    const row = (height: number) =>
      ({
        parentElement: timeline,
        getBoundingClientRect: () => ({ height, width: 800 }),
      }) as unknown as HTMLElement;
    assert.equal(canFullyFitViewport(row(700)), false);
    assert.equal(canFullyFitViewport(row(400)), true);
  } finally {
    names.forEach((name, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
