import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sequenceDefinitionRequestSchema,
  sequenceStartRequestSchema,
  sequenceVariablesSchema,
  sequenceStepVariablesSchema,
} from "../../../packages/contracts/src/sequence-requests";

const step = {
  index: 1,
  accountRole: "member",
  text: "{event}",
  delaySeconds: 0.5,
};

test("shared sequence definition preserves valid values and boundary sizes", () => {
  assert.deepEqual(
    sequenceDefinitionRequestSchema.parse({
      name: " reminder ",
      steps: [step],
    }),
    { name: "reminder", steps: [step] },
  );
  const boundary = {
    name: "n".repeat(200),
    steps: Array.from({ length: 200 }, (_, i) => ({
      ...step,
      index: i + 1,
      text: "t".repeat(20000),
      delaySeconds: 604800,
    })),
  };
  assert.deepEqual(sequenceDefinitionRequestSchema.parse(boundary), boundary);
});

test("shared sequence definition rejects extra fields, invalid order and server bounds", () => {
  const valid = { name: "reminder", steps: [step] };
  const invalid = [
    { ...valid, extra: true },
    { ...valid, name: " " },
    { ...valid, name: "n".repeat(201) },
    { ...valid, steps: [] },
    {
      ...valid,
      steps: Array.from({ length: 201 }, (_, i) => ({ ...step, index: i + 1 })),
    },
    ...[
      { extra: true },
      { index: 0 },
      { index: 2 },
      { index: 1.5 },
      { text: "" },
      { text: "t".repeat(20001) },
      { delaySeconds: -1 },
      { delaySeconds: 604801 },
      { accountRole: "creator" },
    ].map((change) => ({ ...valid, steps: [{ ...step, ...change }] })),
    { ...valid, steps: [step, step] },
    { ...valid, steps: [step, { ...step, index: 3 }] },
  ];
  for (const value of invalid)
    assert.equal(
      sequenceDefinitionRequestSchema.safeParse(value).success,
      false,
    );
});

test("shared start request retains defaults, empty values and accepted variable keys", () => {
  assert.deepEqual(sequenceStartRequestSchema.parse({ sequenceId: "s" }), {
    sequenceId: "s",
    vars: {},
    stepVars: {},
  });
  const valid = {
    sequenceId: "s",
    vars: { event_1: "", _0: "t".repeat(20000) },
    stepVars: { "2": { event_1: "" } },
  };
  assert.deepEqual(sequenceStartRequestSchema.parse(valid), valid);
  assert.deepEqual(sequenceVariablesSchema.parse(valid.vars), valid.vars);
  assert.deepEqual(
    sequenceStepVariablesSchema.parse(valid.stepVars),
    valid.stepVars,
  );
});

test("both JSON editors use strict variable and positive canonical step keys", () => {
  for (const vars of [
    { "bad-key": "x" },
    { "": "x" },
    { x: "t".repeat(20001) },
    { x: 1 },
  ]) {
    assert.equal(sequenceVariablesSchema.safeParse(vars).success, false);
    assert.equal(
      sequenceStartRequestSchema.safeParse({ sequenceId: "s", vars }).success,
      false,
    );
  }
  for (const key of ["0", "01", "-1", "1.5", "x"]) {
    const stepVars = { [key]: { x: "value" } };
    assert.equal(
      sequenceStepVariablesSchema.safeParse(stepVars).success,
      false,
    );
    assert.equal(
      sequenceStartRequestSchema.safeParse({ sequenceId: "s", stepVars })
        .success,
      false,
    );
  }
  assert.equal(
    sequenceStartRequestSchema.safeParse({ sequenceId: "s", extra: true })
      .success,
    false,
  );
});
