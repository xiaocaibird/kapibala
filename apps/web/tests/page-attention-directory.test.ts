import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import {
  createGroupDirectoryController,
  directoryQueryIdentity,
} from "../src/directory/controller";
import type { GroupDirectoryPage } from "../../../packages/contracts/src/index";

test("directory attention evidence advances only on applied refresh, never failed or stale reads", async (t) => {
  let seq = 10;
  const requests: Array<{
    resolve: (page: GroupDirectoryPage) => void;
    reject: (error: Error) => void;
  }> = [];
  const controller = createGroupDirectoryController(
    () =>
      new Promise<GroupDirectoryPage>((resolve, reject) =>
        requests.push({ resolve, reject }),
      ),
    undefined,
    () => seq,
  );
  t.after(() => controller.stop());
  controller.setVisible(true);
  controller.start();
  await setImmediate();
  requests[0]!.resolve({ items: [], nextCursor: null });
  await setImmediate();
  const initial = controller.getSnapshot().snapshot;
  assert.equal(initial?.seq, 10);
  seq = 11;
  controller.invalidate();
  await setImmediate();
  requests[1]!.reject(new Error("unavailable"));
  await setImmediate();
  assert.equal(controller.getSnapshot().snapshot, initial);
  assert.equal(controller.getSnapshot().stale, true);
  const retry = controller.refresh();
  await setImmediate();
  seq = 12;
  controller.invalidate();
  requests[2]!.resolve({ items: [], nextCursor: null });
  await retry;
  await setImmediate();
  assert.equal(
    controller.getSnapshot().snapshot,
    initial,
    "late snapshot cannot confirm newer event",
  );
  requests[3]!.resolve({ items: [], nextCursor: null });
  await setImmediate();
  assert.equal(controller.getSnapshot().snapshot?.seq, 12);
  assert.equal(controller.getSnapshot().snapshot?.revision, 2);
  assert.equal(controller.getSnapshot().stale, false);
});

test("directory query change clears old presentation evidence and never reuses a cursor as a scope", async (t) => {
  let seq = 20;
  const controller = createGroupDirectoryController(
    async () => ({ items: [], nextCursor: null }),
    undefined,
    () => seq,
  );
  t.after(() => controller.stop());
  controller.setVisible(true);
  controller.start();
  await setImmediate();
  const before = controller.getSnapshot().snapshot;
  seq = 21;
  controller.setOrder("asc");
  assert.equal(controller.getSnapshot().snapshot, null);
  await setImmediate();
  const after = controller.getSnapshot().snapshot;
  assert.notEqual(after?.path, before?.path);
  assert.equal(after?.seq, 21);
});

test("directory attention resets successful evidence for actual status and Agent filters", async (t) => {
  let seq = 30;
  const controller = createGroupDirectoryController(
    async () => ({ items: [], nextCursor: null }),
    undefined,
    () => seq,
  );
  t.after(() => controller.stop());
  controller.setVisible(true);
  controller.start();
  await setImmediate();
  const initialKey = directoryQueryIdentity(controller.getSnapshot());
  seq = 31;
  controller.setStatus("active");
  assert.equal(controller.getSnapshot().snapshot, null);
  await setImmediate();
  const statusKey = directoryQueryIdentity(controller.getSnapshot());
  assert.notEqual(statusKey, initialKey);
  assert.ok(controller.getSnapshot().snapshot?.path.includes("status=active"));
  seq = 32;
  controller.setAgentEnabled(false);
  assert.equal(controller.getSnapshot().snapshot, null);
  await setImmediate();
  assert.notEqual(directoryQueryIdentity(controller.getSnapshot()), statusKey);
  assert.ok(
    controller.getSnapshot().snapshot?.path.includes("agentEnabled=false"),
  );
  assert.equal(controller.getSnapshot().snapshot?.seq, 32);
  assert.equal(
    directoryQueryIdentity({ ...controller.getSnapshot(), cursor: "page-2" }),
    directoryQueryIdentity(controller.getSnapshot()),
  );
});
