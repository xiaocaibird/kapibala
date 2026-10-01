import assert from "node:assert/strict";
import { test } from "node:test";
import {
  joinKilledActivityEpochs,
  type ActivityCapture,
  type KilledProcessObservation,
} from "../../scripts/qa-runtime-observation/epoch-evidence.js";

function evidence() {
  const first: ActivityCapture = {
    transport: "controller-http",
    parentClockDomain: "parent",
    requestWindowMs: [3000, 3002],
    snapshot: {
      protocol: "qa-runtime-observation/1",
      leaseId: "old",
      state: "held",
      expiresAt: "2099-01-01T00:00:00Z",
      binding: {
        apiUrl: "http://127.0.0.1:1",
        revision: "test",
        pid: 10,
        observedOwnerToken: "test",
      },
      correlation: {},
      snapshotProvenance: {
        source: "live-bridge",
        applicationPid: 11,
        applicationStarted: "old-start",
      },
      clockObservation: {
        clockDomain: "old-process",
        clockUnit: "ms",
        applicationPid: 11,
        monotonicMs: 1000,
      },
      events: [
        {
          seq: 1,
          kind: "activity-safe-held",
          at: "",
          runId: "r",
          groupId: "g",
          epochIds: ["old-epoch"],
          clockDomain: "old-process",
          clockUnit: "ms",
          applicationPid: 11,
          activityState: "active",
          includesUnsavedTail: true,
          epochObservation: { continuous: true, startSource: "run-creation" },
          creationOrEpochStartWindowMs: [0, 2],
          continuationDurable: true,
          remoteInFlightCount: 0,
          lastSuccessfulSample: {
            epochId: "old-epoch",
            windowMs: [900, 902],
            persistedActiveMs: 898,
          },
        },
      ],
    },
  };
  const next: ActivityCapture = structuredClone(first);
  next.requestWindowMs = [9100, 9102];
  next.snapshot.state = "armed";
  next.snapshot.clockObservation = {
    clockDomain: "new-process",
    clockUnit: "ms",
    applicationPid: 21,
    monotonicMs: 8000,
  };
  next.snapshot.snapshotProvenance = {
    source: "live-bridge",
    applicationPid: 21,
    applicationStarted: "new-start",
  };
  next.snapshot.events = [
    {
      seq: 1,
      kind: "activity-terminal",
      at: "",
      runId: "r",
      groupId: "g",
      epochIds: ["new-epoch"],
      clockDomain: "new-process",
      clockUnit: "ms",
      applicationPid: 21,
      activityState: "terminal",
      includesUnsavedTail: false,
      epochObservation: { continuous: true, startSource: "clock-acquisition" },
      creationOrEpochStartWindowMs: [6900, 6902],
      activityEndWindowMs: [7990, 7992],
    },
  ];
  const killed: KilledProcessObservation = {
    parentClockDomain: "parent",
    applicationPid: 11,
    signal: "SIGKILL",
    signalRequestedBeforeMs: 3010,
    processExitObservedAfterMs: 3014,
    exitObservation: "direct-child-exit",
  };
  return {
    beforeKill: first,
    afterRecovery: next,
    killed,
    persistedAfterExitMs: 899,
  };
}

test("epoch join maps different process clock origins and includes an uncertain killed tail", () => {
  const input = evidence();
  const result = joinKilledActivityEpochs(input);
  assert.deepEqual(result.clockOffsetsMs, [
    [2000, 2002],
    [1100, 1102],
  ]);
  assert.deepEqual(result.oldEpochActiveMs, [1006, 1014]);
  assert.deepEqual(result.newEpochActiveMs, [1088, 1092]);
  assert.deepEqual(result.activeElapsedMs, [2094, 2106]);
  assert.deepEqual(result.excludedBetweenEpochsMs, [4986, 4994]);
  assert.deepEqual(result.lastAcknowledgedSampleToExitMs, [106, 114]);
  assert.deepEqual(result.unsavedTailMs, [0, 114]);
  assert.equal(
    input.afterRecovery.snapshot.events[0]!.includesUnsavedTail,
    false,
  );
});

test("epoch join rejects cached clocks, absent raw samples, ownership gaps and wrong process identities", () => {
  const mutations: ((input: ReturnType<typeof evidence>) => void)[] = [
    (v) => {
      delete v.afterRecovery.snapshot.events[0]!.epochObservation;
    },
    (v) => {
      v.afterRecovery.snapshot.events[0]!.epochObservation = {
        continuous: false,
        startSource: "unwitnessed",
      };
    },
    (v) => {
      v.afterRecovery.snapshot.events[0]!.epochObservation = {
        continuous: true,
        startSource: "run-creation",
      };
    },
    (v) => {
      v.beforeKill.snapshot.snapshotProvenance!.source =
        "retained-after-process-exit";
    },
    (v) => {
      delete v.beforeKill.snapshot.snapshotProvenance;
    },
    (v) => {
      v.killed.applicationPid = 10;
    },
    (v) => {
      v.afterRecovery.parentClockDomain = "different-parent";
    },
    (v) => {
      v.afterRecovery.snapshot.events[0]!.runId = "another-run";
    },
    (v) => {
      v.afterRecovery.snapshot.events[0]!.epochIds = ["old-epoch"];
    },
    (v) => {
      delete v.beforeKill.snapshot.events[0]!.lastSuccessfulSample;
    },
    (v) => {
      v.beforeKill.snapshot.events[0]!.includesUnsavedTail = false;
    },
    (v) => {
      v.afterRecovery.snapshot.events.unshift({
        ...v.afterRecovery.snapshot.events[0]!,
        activityState: "unknown",
      });
    },
    (v) => {
      v.beforeKill.requestWindowMs = [3012, 3015];
    },
  ];
  for (const mutate of mutations) {
    const input = evidence();
    mutate(input);
    assert.throws(() => joinKilledActivityEpochs(input));
  }
});
