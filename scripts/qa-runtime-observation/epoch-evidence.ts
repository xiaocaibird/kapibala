import type { ObservationEvent } from "../qa-observation/types.js";
import type { ActivityObservationSnapshot } from "./activity-witness.js";

export type TimeBracket = [number, number];
export interface ActivityCapture {
  parentClockDomain: string;
  requestWindowMs: TimeBracket;
  snapshot: ActivityObservationSnapshot;
  transport: "controller-http" | "direct-app-ipc";
}
export interface KilledProcessObservation {
  parentClockDomain: string;
  applicationPid: number;
  signal: "SIGKILL";
  signalRequestedBeforeMs: number;
  processExitObservedAfterMs: number;
  exitObservation: "direct-child-exit" | "owned-process-confirmed-absent";
}

function bracket(value: unknown, label: string): TimeBracket {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n)) ||
    value[0] > value[1]
  )
    throw new Error(`Invalid ${label} bracket`);
  return [value[0] as number, value[1] as number];
}
function elapsed(start: TimeBracket, end: TimeBracket): TimeBracket {
  if (end[1] < start[0]) throw new Error("Activity boundaries are reversed");
  return [Math.max(0, end[0] - start[1]), Math.max(0, end[1] - start[0])];
}
function calibration(capture: ActivityCapture) {
  const { clockObservation: clock } = capture.snapshot;
  const window = bracket(capture.requestWindowMs, "request");
  if (
    capture.transport === "controller-http" &&
    (capture.snapshot.snapshotProvenance?.source !== "live-bridge" ||
      capture.snapshot.snapshotProvenance.applicationPid !==
        clock?.applicationPid)
  )
    throw new Error(
      "Cached or unproven controller snapshot cannot calibrate a clock",
    );
  if (!["controller-http", "direct-app-ipc"].includes(capture.transport))
    throw new Error("Verified observation transport required");
  if (
    !capture.parentClockDomain ||
    !clock ||
    clock.clockUnit !== "ms" ||
    !clock.clockDomain ||
    !Number.isFinite(clock.monotonicMs) ||
    !Number.isSafeInteger(clock.applicationPid) ||
    clock.applicationPid <= 0
  )
    throw new Error("Actual process clock observation required");
  // No equality of performance.now() origins and no symmetric RTT assumption.
  const offset: TimeBracket = [
    window[0] - clock.monotonicMs,
    window[1] - clock.monotonicMs,
  ];
  return {
    offset,
    map(value: unknown): TimeBracket {
      const local = bracket(value, "process boundary");
      return [local[0] + offset[0], local[1] + offset[1]];
    },
  };
}
function event(
  capture: ActivityCapture,
  kind?: string,
): ObservationEvent & { epochIds: [string] } {
  const result = kind
    ? capture.snapshot.events.findLast((entry) => entry.kind === kind)
    : capture.snapshot.events.at(-1);
  const clock = capture.snapshot.clockObservation;
  if (
    !result ||
    result.clockDomain !== clock.clockDomain ||
    result.applicationPid !== clock.applicationPid ||
    result.clockUnit !== "ms"
  )
    throw new Error("Event/process clock identity is missing or mismatched");
  if (
    !Array.isArray(result.epochIds) ||
    result.epochIds.length !== 1 ||
    typeof result.epochIds[0] !== "string"
  )
    throw new Error(
      "Exactly one continuously observed ownership epoch required per process",
    );
  return result as ObservationEvent & { epochIds: [string] };
}

/** Evidence analysis only. Never changes a lease, run, persisted activity or
 * single-process includesUnsavedTail flag. Requires a real controlled kill,
 * one clock owner per epoch and same-host monotonic clocks with a stable rate.
 * Caller retains raw frames and proves process ownership and safe-boundary TTL. */
export function joinKilledActivityEpochs(input: {
  beforeKill: ActivityCapture;
  killed: KilledProcessObservation;
  afterRecovery: ActivityCapture;
  persistedAfterExitMs: number;
}) {
  const { beforeKill: first, killed, afterRecovery: next } = input;
  if (
    first.parentClockDomain !== killed.parentClockDomain ||
    next.parentClockDomain !== killed.parentClockDomain
  )
    throw new Error("External observations must share one parent clock domain");
  const a = calibration(first),
    b = calibration(next);
  const old = event(first),
    resumed = event(next, "activity-terminal");
  const originalCoverage = old.epochObservation as
    { continuous?: unknown; startSource?: unknown } | undefined;
  const recoveredCoverage = resumed.epochObservation as
    { continuous?: unknown; startSource?: unknown } | undefined;
  if (
    originalCoverage?.continuous !== true ||
    originalCoverage.startSource !== "run-creation" ||
    recoveredCoverage?.continuous !== true ||
    recoveredCoverage.startSource !== "clock-acquisition"
  )
    throw new Error(
      "Continuous creation and recovery acquisition witnesses are required; late reconstruction is insufficient",
    );
  const hasGap = (capture: ActivityCapture, epochId: string) =>
    capture.snapshot.events.some(
      (entry) =>
        Array.isArray(entry.epochIds) &&
        entry.epochIds.includes(epochId) &&
        (entry.activityState === "unknown" ||
          entry.activityState === "recovery-paused"),
    );
  // A pre-acquisition unknown event has no epoch and proves no billed interval.
  // A gap after this epoch begins invalidates continuous-ownership analysis.
  if (hasGap(first, old.epochIds[0]) || hasGap(next, resumed.epochIds[0]))
    throw new Error(
      "An ownership gap or recovery pause cannot be joined as a continuous epoch",
    );
  if (
    first.snapshot.state !== "held" ||
    old.activityState !== "active" ||
    old.includesUnsavedTail !== true ||
    !first.snapshot.events.some(
      (entry) =>
        entry.kind === "activity-safe-held" &&
        entry.continuationDurable === true &&
        entry.remoteInFlightCount === 0,
    )
  )
    throw new Error(
      "Original epoch must have a live durable safe boundary and complete creation witness",
    );
  if (
    old.runId !== resumed.runId ||
    old.groupId !== resumed.groupId ||
    old.runId === undefined ||
    old.groupId === undefined
  )
    throw new Error("Cannot join different or missing run/group identities");
  if (
    old.epochIds![0] === resumed.epochIds![0] ||
    first.snapshot.clockObservation.applicationPid ===
      next.snapshot.clockObservation.applicationPid ||
    first.snapshot.clockObservation.clockDomain ===
      next.snapshot.clockObservation.clockDomain
  )
    throw new Error(
      "Recovery must be a distinct actual process and ownership epoch",
    );
  if (
    killed.applicationPid !== first.snapshot.clockObservation.applicationPid ||
    killed.signal !== "SIGKILL" ||
    !["direct-child-exit", "owned-process-confirmed-absent"].includes(
      killed.exitObservation,
    )
  )
    throw new Error(
      "Kill evidence must identify the observed application, not only its guardian",
    );
  const exit = bracket(
    [killed.signalRequestedBeforeMs, killed.processExitObservedAfterMs],
    "process exit",
  );
  if (first.requestWindowMs[1] > exit[0] || next.requestWindowMs[0] < exit[1])
    throw new Error("Capture/kill/recovery observation order is invalid");
  const oldStart = a.map(old.creationOrEpochStartWindowMs);
  const newStart = b.map(resumed.creationOrEpochStartWindowMs);
  const newEndLocal = bracket(resumed.activityEndWindowMs, "terminal");
  const newStartLocal = bracket(
    resumed.creationOrEpochStartWindowMs,
    "recovery",
  );
  if (newStart[0] < exit[1])
    throw new Error("Observed epochs overlap or recovery start is not bounded");
  const oldActive = elapsed(oldStart, exit);
  const newActive = elapsed(newStartLocal, newEndLocal);
  const last = old.lastSuccessfulSample as
    | {
        epochId?: unknown;
        windowMs?: unknown;
        persistedActiveMs?: unknown;
      }
    | undefined;
  if (
    !last ||
    last.epochId !== old.epochIds![0] ||
    typeof last.persistedActiveMs !== "number" ||
    !Number.isFinite(last.persistedActiveMs) ||
    !Number.isFinite(input.persistedAfterExitMs) ||
    input.persistedAfterExitMs < last.persistedActiveMs
  )
    throw new Error(
      "Last acknowledged sample and independent post-exit ledger required",
    );
  const sampleToExit = elapsed(a.map(last.windowMs), exit);
  const activeElapsedMs: TimeBracket = [
    oldActive[0] + newActive[0],
    oldActive[1] + newActive[1],
  ];
  return {
    runId: old.runId,
    groupId: old.groupId,
    epochIds: [
      ...(old.epochIds as string[]),
      ...(resumed.epochIds as string[]),
    ],
    parentClockDomain: killed.parentClockDomain,
    clockOffsetsMs: [a.offset, b.offset],
    oldEpochActiveMs: oldActive,
    newEpochActiveMs: newActive,
    activeElapsedMs,
    excludedBetweenEpochsMs: elapsed(exit, newStart),
    lastAcknowledgedSampleToExitMs: sampleToExit,
    // A write can commit after its last observer notice but before SIGKILL.
    // A missing notice is not proof that those milliseconds were not saved.
    unsavedTailMs: [0, sampleToExit[1]] as TimeBracket,
    lastAcknowledgedPersistedMs: last.persistedActiveMs,
    persistedAfterExitMs: input.persistedAfterExitMs,
    persistenceInterpretation:
      "ledger is diagnostic; zero tail lower bound is uncertainty, not an assertion of zero lost time",
    coverage:
      "two continuously observed ownership epochs including the killed online tail",
    budget60000:
      activeElapsedMs[0] > 60000
        ? "exceeds"
        : activeElapsedMs[1] <= 60000
          ? "within-observed-interval"
          : "straddles",
  };
}
