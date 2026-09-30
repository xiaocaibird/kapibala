import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import type {
  GroupDirectoryItem,
  GroupDirectoryPage,
} from "../../../packages/contracts/src/index";
import {
  affectsGroupDirectory,
  createGroupDirectoryController,
  groupDirectoryPath,
  type DirectoryQuery,
  type DirectoryScheduler,
} from "../src/directory/controller";
import { directoryMatch } from "../src/directory/presentation";
import { groupDirectoryPageSchema } from "../src/api/schemas";

function item(
  id: string,
  changes: Partial<GroupDirectoryItem> = {},
): GroupDirectoryItem {
  return {
    id,
    name: `群 ${id}`,
    description: null,
    gatewayGroupId: `gateway-${id}`,
    createdAt: "2026-09-30T10:00:00.000Z",
    status: "active",
    memberCount: 4,
    agentEnabled: false,
    activeAgentRunId: null,
    activeSequenceRunId: null,
    ...changes,
  };
}
function page(
  ids: string[],
  nextCursor: string | null = null,
): GroupDirectoryPage {
  return { items: ids.map((id) => item(id)), nextCursor };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function harness(t: TestContext) {
  let time = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const scheduler: DirectoryScheduler = {
    set(callback, delay) {
      const id = ++timerId;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clear(id) {
      timers.delete(id as number);
    },
  };
  const requests: Array<
    ReturnType<typeof deferred<GroupDirectoryPage>> & {
      query: DirectoryQuery;
      signal: AbortSignal;
    }
  > = [];
  const controller = createGroupDirectoryController((query, signal) => {
    const request = { ...deferred<GroupDirectoryPage>(), query, signal };
    requests.push(request);
    return request.promise;
  }, scheduler);
  controller.start();
  controller.setVisible(true);
  t.after(() => controller.stop());
  return {
    controller,
    requests,
    async tick(ms: number) {
      time += ms;
      for (const [id, timer] of timers)
        if (timer.at <= time) {
          timers.delete(id);
          timer.callback();
        }
      await setImmediate();
    },
    async reply(value: GroupDirectoryPage, index = requests.length - 1) {
      requests[index]!.resolve(value);
      await setImmediate();
    },
    async reject(error: Error, index = requests.length - 1) {
      requests[index]!.reject(error);
      await setImmediate();
    },
    state: controller.getSnapshot,
  };
}
async function twoPages(t: TestContext) {
  const h = harness(t);
  await setImmediate();
  await h.reply(page(["a", "b"], "page-2"));
  void h.controller.loadMore();
  await setImmediate();
  await h.reply(page(["c", "d"], "page-3"));
  return h;
}

test("directory requests use fixed page size and preserve literal search and opaque cursors", () => {
  const path = groupDirectoryPath({
    q: "  A  %_群  ",
    order: "asc",
    cursor: "opaque+/=&",
  });
  const url = new URL(path, "http://local");
  assert.equal(url.pathname, "/api/group-directory");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    pageSize: "20",
    order: "asc",
    q: "A  %_群",
    cursor: "opaque+/=&",
  });
});

test("search debounce and order changes abort old requests and ignore late results", async (t) => {
  const h = harness(t);
  await setImmediate();
  h.controller.setInput("  A  B  ");
  assert.equal(h.requests[0]!.signal.aborted, true);
  await h.tick(249);
  assert.equal(h.requests.length, 1);
  h.controller.setInput("  A  C  ");
  await h.tick(250);
  assert.deepEqual(h.requests[1]!.query, { q: "A  C", order: "desc" });
  h.controller.setOrder("asc");
  await setImmediate();
  assert.equal(h.requests[1]!.signal.aborted, true);
  assert.deepEqual(h.requests[2]!.query, { q: "A  C", order: "asc" });
  await h.reply(page(["correct"]), 2);
  await h.reply(page(["old search"]), 1);
  await h.reply(page(["old default"]), 0);
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["correct"],
  );
  assert.equal(h.state().q, "A  C");
  assert.equal(h.state().order, "asc");
});

test("IME composition suppresses debounce, sort requests and polling until committed", async (t) => {
  const h = harness(t);
  await setImmediate();
  await h.reply(page(["existing"]));
  h.controller.setInput("zh", true);
  h.controller.setOrder("asc");
  h.controller.setInput("中文", true);
  await h.tick(1000);
  await h.controller.poll();
  assert.equal(h.requests.length, 1);
  h.controller.setInput("中文");
  await h.tick(249);
  assert.equal(h.requests.length, 1);
  await h.tick(1);
  assert.deepEqual(h.requests[1]!.query, { q: "中文", order: "asc" });
  await h.reply(page([]));
  assert.equal(h.state().initialized, true);
  assert.equal(h.state().q, "中文");
  assert.equal(h.state().items.length, 0);
});

test("initial errors remain distinct from a successful empty directory and can retry", async (t) => {
  const h = harness(t);
  await setImmediate();
  await h.reject(new Error("unavailable"));
  assert.equal(h.state().initialized, false);
  assert.equal(h.state().error?.kind, "initial");
  await h.controller.poll();
  assert.equal(h.requests.length, 1);
  void h.controller.refresh();
  await setImmediate();
  await h.reply(page([]));
  assert.equal(h.state().initialized, true);
  assert.equal(h.state().pages, 1);
  assert.equal(h.state().error, null);
});

test("next-page failure keeps items and cursor; exact-cursor retry merges stable IDs once", async (t) => {
  const h = harness(t);
  await setImmediate();
  await h.reply(page(["a", "b"], "second"));
  void h.controller.loadMore();
  await setImmediate();
  await h.reject(new Error("page unavailable"));
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b"],
  );
  assert.equal(h.state().nextCursor, "second");
  assert.equal(h.state().error?.kind, "more");
  void h.controller.loadMore();
  await setImmediate();
  assert.deepEqual(h.requests[2]!.query, h.requests[1]!.query);
  await h.reply({
    items: [item("b", { memberCount: 5 }), item("c")],
    nextCursor: null,
  });
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.equal(h.state().items[1]!.memberCount, 5);
  assert.equal(h.state().pages, 2);
  assert.equal(h.state().nextCursor, null);
  assert.equal(h.state().error, null);
});

test("unchanged first-page probes preserve a failed next-page retry and never rotate its cursor", async (t) => {
  const h = await twoPages(t);
  void h.controller.loadMore();
  await setImmediate();
  const failure = new Error("third page failed");
  await h.reject(failure);
  void h.controller.poll();
  await setImmediate();
  assert.equal(h.requests.at(-1)!.query.cursor, undefined);
  await h.reply(page(["a", "b"], "new opaque encoding"));
  assert.equal(h.state().error?.kind, "more");
  assert.equal(h.state().error?.value, failure);
  assert.equal(h.state().nextCursor, "page-3");
  assert.equal(h.state().pages, 2);
  void h.controller.poll();
  await setImmediate();
  await h.reject(new Error("probe unavailable"));
  assert.equal(h.state().error?.value, failure);
  void h.controller.loadMore();
  await setImmediate();
  assert.equal(h.requests.at(-1)!.query.cursor, "page-3");
  await h.reply(page(["e"]));
  assert.equal(h.state().error, null);
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d", "e"],
  );
});

test("changed first-page probes invalidate all cached pages without splicing new rows", async (t) => {
  const h = await twoPages(t);
  void h.controller.poll();
  await setImmediate();
  await h.reply(page(["new", "a"], "changed"));
  assert.equal(h.state().stale, true);
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(h.state().nextCursor, "page-3");
  const before = h.requests.length;
  await h.controller.loadMore();
  await h.controller.poll();
  assert.equal(h.requests.length, before);
  void h.controller.refresh();
  await setImmediate();
  await h.reject(new Error("refresh unavailable"));
  assert.equal(h.state().pages, 2);
  assert.equal(h.state().stale, true);
  assert.equal(h.state().error?.kind, "refresh");
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  void h.controller.refresh();
  await setImmediate();
  await h.reply(page(["new", "a"], "fresh-second"));
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["new", "a"],
  );
  assert.equal(h.state().pages, 1);
  assert.equal(h.state().nextCursor, "fresh-second");
  assert.equal(h.state().stale, false);
});

test("a relevant change aborts an in-flight next page and ignores its late response", async (t) => {
  const h = await twoPages(t);
  void h.controller.loadMore();
  await setImmediate();
  const old = h.requests.at(-1)!;
  h.controller.invalidate();
  assert.equal(old.signal.aborted, true);
  await h.reply(page(["outdated third"]));
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(h.state().stale, true);
  assert.equal(h.state().pages, 2);
  assert.equal(h.state().loading, null);
});

test("a relevant change during first-page refresh discards that response and coalesces one fresh read", async (t) => {
  const h = await twoPages(t);
  void h.controller.refresh();
  await setImmediate();
  h.controller.invalidate();
  h.controller.invalidate();
  await h.reply(page(["outdated refresh"], "outdated cursor"));
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(h.state().pages, 2);
  assert.equal(h.state().stale, true);
  assert.equal(h.requests.length, 4);
  await h.reply(page(["fresh"], "fresh cursor"));
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["fresh"],
  );
  assert.equal(h.state().pages, 1);
  assert.equal(h.state().stale, false);
});

test("leaving and returning retains multi-page query, anchor and stale contents without automatic reset", async (t) => {
  const h = await twoPages(t);
  const position = { groupId: "d", offset: 125, scrollY: 700 };
  h.controller.rememberPosition(position);
  h.controller.setJobId("created-job");
  h.controller.setVisible(false);
  h.controller.invalidate();
  const before = h.requests.length;
  h.controller.setVisible(true);
  await h.controller.poll();
  assert.equal(h.requests.length, before);
  assert.deepEqual(h.state().position, position);
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(h.state().pages, 2);
  assert.equal(h.state().jobId, "created-job");
  void h.controller.refresh();
  await setImmediate();
  await h.reply(page(["new first page"], "next"));
  assert.equal(
    h.state().notice,
    "原群未出现在当前已加载结果中，可继续加载或调整搜索。",
  );
  assert.equal(h.state().q, "");
});

test("off-page request completion is ignored and a one-page cache refreshes on return", async (t) => {
  const h = harness(t);
  await setImmediate();
  await h.reply(page(["cached"]));
  void h.controller.poll();
  await setImmediate();
  h.controller.setVisible(false);
  assert.equal(h.requests[1]!.signal.aborted, true);
  await h.reply(page(["late"]), 1);
  assert.equal(h.state().items[0]!.id, "cached");
  h.controller.setVisible(true);
  await setImmediate();
  await h.reply(page(["returned"]));
  assert.equal(h.state().items[0]!.id, "returned");
});

test("condition changes reset pagination and position without clearing the search silently", async (t) => {
  const h = await twoPages(t);
  h.controller.rememberPosition({ groupId: "d", offset: 100, scrollY: 900 });
  h.controller.setInput(" specific group ");
  await h.tick(250);
  assert.equal(h.state().position, null);
  assert.equal(h.state().pages, 0);
  assert.equal(h.state().initialized, false);
  assert.equal(h.state().nextCursor, null);
  await h.reply(page([]));
  h.controller.invalidate();
  await setImmediate();
  await h.reply(page([]));
  assert.equal(h.state().q, "specific group");
  assert.equal(h.state().input, " specific group ");
  h.controller.clearSearch();
  await setImmediate();
  assert.deepEqual(h.requests.at(-1)!.query, { q: "", order: "desc" });
});

test("a stopped session cancels pending debounce and late responses; a new session starts clean", async (t) => {
  const h = harness(t);
  await setImmediate();
  h.controller.setInput("private query");
  h.controller.setJobId("private-job");
  h.controller.rememberPosition({
    groupId: "private-group",
    offset: 8,
    scrollY: 99,
  });
  h.controller.stop();
  await h.tick(1000);
  await h.reply(page(["private-late"]));
  assert.equal(h.requests.length, 1);
  assert.equal(h.state().initialized, false);
  const next = harness(t);
  await setImmediate();
  assert.deepEqual(next.requests[0]!.query, { q: "", order: "desc" });
  assert.equal(next.state().position, null);
  assert.equal(next.state().jobId, null);
  assert.equal(next.state().input, "");
  assert.deepEqual(next.state().items, []);
});

test("an unchanged non-null next cursor fails visibly instead of repeating a page forever", async (t) => {
  const h = harness(t);
  await setImmediate();
  await h.reply(page(["a"], "same"));
  void h.controller.loadMore();
  await setImmediate();
  await h.reply(page(["b"], "same"));
  assert.equal(h.state().error?.kind, "more");
  assert.match(String(h.state().error?.value), /游标没有推进/);
  assert.deepEqual(
    h.state().items.map((row) => row.id),
    ["a"],
  );
  assert.equal(h.state().nextCursor, "same");
});

test("synchronous loader failure cannot strand the flight or prevent manual retry", async (t) => {
  let attempts = 0;
  const controller = createGroupDirectoryController(() => {
    if (++attempts === 1) throw new Error("synchronous failure");
    return Promise.resolve(page(["recovered"]));
  });
  t.after(() => controller.stop());
  controller.setVisible(true);
  controller.start();
  await setImmediate();
  assert.equal(controller.getSnapshot().loading, null);
  assert.equal(controller.getSnapshot().error?.kind, "initial");
  await controller.refresh();
  assert.equal(attempts, 2);
  assert.equal(controller.getSnapshot().items[0]!.id, "recovered");
});

test("directory revision filters unrelated message traffic without changing directory-relevant events", () => {
  for (const type of [
    "group_changed",
    "account_terminal",
    "agent_run",
    "sequence_run",
  ])
    assert.equal(affectsGroupDirectory(type), true, type);
  for (const type of [
    "message",
    "auth",
    "account_status_changed",
    "inconsistency",
    "unknown",
  ])
    assert.equal(affectsGroupDirectory(type), false, type);
});

test("directory runtime schema validates compact rows, dates, counts and cursor without a fake total", () => {
  assert.deepEqual(groupDirectoryPageSchema.parse(page(["a"])), page(["a"]));
  const { memberCount: _, ...withoutCount } = item("a");
  assert.equal(
    groupDirectoryPageSchema.safeParse({
      items: [{ ...withoutCount, members: [] }],
      nextCursor: null,
    }).success,
    false,
  );
  for (const changes of [
    { memberCount: -1 },
    { memberCount: 1.5 },
    { createdAt: "yesterday" },
    { name: " padded " },
  ])
    assert.equal(
      groupDirectoryPageSchema.safeParse({
        items: [item("a", changes)],
        nextCursor: null,
      }).success,
      false,
    );
  assert.equal(
    groupDirectoryPageSchema.safeParse({ items: [], nextCursor: "" }).success,
    false,
  );
});

test("description and platform ID matches remain identifiable without HTML highlighting", () => {
  const group = item("platform-id", {
    name: "Team",
    gatewayGroupId: "gateway-42",
    description: `${"前".repeat(60)}Search Here${"后".repeat(120)}`,
  });
  const description = directoryMatch(group, " search here ");
  assert.equal(description.hint, "匹配群简介");
  assert.match(description.description!, /^…前{24}Search Here后{64}…$/);
  assert.equal(
    directoryMatch(group, "PLATFORM-ID").hint,
    "匹配平台群 ID · platform-id",
  );
  assert.equal(directoryMatch(group, "TEAM").hint, null);
  assert.equal(
    directoryMatch(
      item("x", { description: "<script>literal</script>" }),
      "literal",
    ).description,
    "<script>literal</script>",
  );
});
