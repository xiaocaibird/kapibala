import assert from "node:assert/strict";
import { test } from "node:test";
import {
  observeChild,
  assertCleanupEvidence,
} from "../prepare-qa-database-fixtures.mjs";

test("fixture producer: natural child result preserves stdout/stderr without timeout", async () => {
  const result = await observeChild(
    process.execPath,
    [
      "-e",
      "process.stdout.write('ready'); process.stderr.write('diagnostic'); process.exitCode=1",
    ],
    {},
    2000,
    100,
  );
  assert.deepEqual(result, {
    code: 1,
    signal: null,
    stdout: "ready",
    stderr: "diagnostic",
    timedOut: false,
    forcedKill: false,
  });
});

test("fixture producer: child ignoring SIGTERM is force-killed and is never a natural rejection", async () => {
  const result = await observeChild(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>{}); process.stdout.write('ready'); setInterval(()=>{},1000)",
    ],
    {},
    500,
    100,
  );
  assert.equal(result.stdout, "ready");
  assert.equal(result.timedOut, true);
  assert.equal(result.forcedKill, true);
  assert.equal(result.signal, "SIGKILL");
  assert.equal(result.code, null);
});

test("fixture producer: cleanup success requires all recorded owned resources absent", () => {
  const clean = {
    remainingDatabases: [],
    remainingSessions: [],
    containerRemoved: true,
    remainingOwnedVolumes: [],
  };
  assert.doesNotThrow(() => assertCleanupEvidence(clean));
  for (const key of [
    "remainingDatabases",
    "remainingSessions",
    "remainingOwnedVolumes",
  ]) {
    assert.throws(() =>
      assertCleanupEvidence({ ...clean, [key]: ["remaining-owned-resource"] }),
    );
    assert.throws(() => assertCleanupEvidence({ ...clean, [key]: undefined }));
  }
  assert.throws(() =>
    assertCleanupEvidence({ ...clean, containerRemoved: false }),
  );
  assert.throws(() =>
    assertCleanupEvidence({ ...clean, containerRemoved: undefined }),
  );
});
