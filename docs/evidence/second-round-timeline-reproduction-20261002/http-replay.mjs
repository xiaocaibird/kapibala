// Copy to the isolated application's root; authenticate/read via actual HTTP.
// seed creates two real snapshots; replay reuses their unchanged public cursors.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const mode = process.env.DB002_MODE;
assert.ok(mode === "seed" || mode === "replay");
assert.ok(process.env.DB002_SNAPSHOTS && process.env.DB002_RESULT);
const group = process.env.DB002_GROUP ?? "db002-measured";
const expectedCount = Number(process.env.DB002_COUNT ?? 120);
assert.ok(Number.isSafeInteger(expectedCount) && expectedCount > 50);
const origins = [process.env.DB002_A_URL, process.env.DB002_B_URL].map((value) => {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin + "/", url.href);
  return url.origin;
});
assert.notEqual(origins[0], origins[1]);
const evidence = { kind: "development-http-rollback-recipe", mode, group, origins,
  stages: [], qaResult: "NOT_ASSESSED" };
async function request(origin, path, token, login = false) {
  const started = performance.now();
  const response = await fetch(origin + path, {
    method: login ? "POST" : "GET", redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: login ? { "content-type": "application/json" } : { authorization: `Bearer ${token}` },
    ...(login ? { body: JSON.stringify({ username: "admin", password: "admin" }) } : {}),
  });
  const raw = await response.text();
  if (!login) evidence.stages.push({ origin, path, status: response.status,
    elapsedMs: performance.now() - started, responseBytes: Buffer.byteLength(raw), rawBody: raw });
  assert.equal(response.status, 200, `unexpected HTTP status ${response.status}`);
  const body = JSON.parse(raw);
  return body;
}
const tokens = await Promise.all(origins.map(async (origin) =>
  (await request(origin, "/api/auth/login", undefined, true)).accessToken));
const get = (index, cursor, limit = 50) => request(origins[index],
  `/api/groups/${encodeURIComponent(group)}/messages?limit=${limit}` +
    (cursor ? `&before=${encodeURIComponent(cursor)}` : ""), tokens[index]);
try {
  const seeds = mode === "seed"
    ? await Promise.all([get(0), get(1)])
    : JSON.parse(await readFile(process.env.DB002_SNAPSHOTS, "utf8"));
  assert.equal(seeds.length, 2);
  assert.notEqual(seeds[0].snapshotId, seeds[1].snapshotId);
  for (const seed of seeds) {
    assert.ok(seed.nextCursor, "fixture needs more than 50 messages");
    const decoded = JSON.parse(Buffer.from(seed.nextCursor, "base64url").toString());
    assert.equal(decoded.snapshotId, seed.snapshotId);
    // Offset zero is the existing public cursor format, not a new snapshot read.
    const start = Buffer.from(JSON.stringify({ snapshotId: seed.snapshotId, offset: 0 })).toString("base64url");
    const pages = [];
    let cursor = start;
    while (cursor) {
      const a = await get(0, cursor);
      const b = await get(1, cursor);
      assert.deepEqual(b, a, "same snapshot and cursor must return identical pages");
      assert.equal(a.snapshotId, seed.snapshotId);
      pages.push(a);
      cursor = a.nextCursor;
    }
    assert.deepEqual(pages[0], { items: seed.items, nextCursor: seed.nextCursor, snapshotId: seed.snapshotId });
    const items = pages.flatMap((page) => page.items);
    assert.equal(items.length, expectedCount);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
    if (mode === "seed") seed.expectedPages = pages;
    else assert.deepEqual(pages, seed.expectedPages, "rollback/restart must preserve the original full snapshot");
    for (const limit of [1, 37, 100]) {
      const a = await get(0, seed.nextCursor, limit);
      const b = await get(1, seed.nextCursor, limit);
      assert.deepEqual(b, a);
    }
  }
  if (mode === "seed") await writeFile(process.env.DB002_SNAPSHOTS, JSON.stringify(seeds, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  evidence.result = "HTTP_ASSERTIONS_PASS";
} catch (error) {
  evidence.result = "HTTP_ASSERTIONS_FAIL";
  evidence.error = { name: error.name, message: error.message };
  throw error;
} finally {
  // Login response/tokens are never added to evidence.
  await writeFile(process.env.DB002_RESULT, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
