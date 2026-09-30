import assert from "node:assert/strict";
import { test } from "node:test";
import { automationFixture } from "../support/core-automation-fixture.js";

test("shared sequence requests reject invalid bodies before database side effects", async (t) => {
  const f = await automationFixture(t);
  const step = {
    index: 1,
    accountRole: "member",
    text: "{event}",
    delaySeconds: 0,
  };
  for (const body of [
    { name: "s", steps: [step], extra: true },
    { name: "s", steps: [{ ...step, extra: true }] },
    { name: "s", steps: [{ ...step, index: 2 }] },
    { name: "n".repeat(201), steps: [step] },
    { name: "s", steps: [{ ...step, text: "x".repeat(20001) }] },
    { name: "s", steps: [{ ...step, delaySeconds: 604801 }] },
  ]) {
    const response = await f.api("POST", "/api/sequences", body);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, "VALIDATION_ERROR");
  }
  assert.equal((await f.db.query("SELECT 1 FROM sequences")).rowCount, 0);
  const created = await f.api("POST", "/api/sequences", {
    name: " s ",
    steps: [step],
  });
  assert.equal(created.statusCode, 200, created.body);
  const sequenceId = created.json<{ id: string }>().id;
  for (const path of [
    "/api/sequences/preview",
    "/api/groups/g/sequence-runs",
  ]) {
    for (const fields of [
      { extra: true },
      { vars: { "bad-key": "x" } },
      { vars: { event: "x".repeat(20001) } },
      { stepVars: { "0": { event: "x" } } },
      { stepVars: { "01": { event: "x" } } },
    ]) {
      const response = await f.api("POST", path, { sequenceId, ...fields });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().error.code, "VALIDATION_ERROR");
    }
  }
  for (const table of ["sequence_runs", "sequence_steps", "messages"])
    assert.equal((await f.db.query(`SELECT 1 FROM ${table}`)).rowCount, 0);
  const preview = await f.api("POST", "/api/sequences/preview", {
    sequenceId,
    vars: { event: "kept" },
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().steps[0].text, "kept");
  const start = await f.api("POST", "/api/groups/g/sequence-runs", {
    sequenceId,
    vars: { event: "kept" },
  });
  assert.equal(start.statusCode, 201, start.body);
});
