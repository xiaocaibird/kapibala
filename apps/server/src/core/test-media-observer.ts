import type { Queryable } from "./db.js";

/** Explicit engineering entry only. Hooks observe or wait; never write outcomes. */
export type MediaReferenceOperation =
  | { kind: "trigger"; messageIds: string[] }
  | { kind: "history"; toolUseId: string };
export type MediaPhase =
  | "reference-before-lock"
  | "reference-locked"
  | "reference-registered"
  | "reference-committed"
  | "cleanup-before-lock"
  | "cleanup-claimed"
  | "cleanup-skipped"
  | "cleanup-completed";
export interface TestMediaOperation {
  stage(phase: MediaPhase, mediaIds?: string[]): Promise<void>;
}
export interface TestMediaObserver {
  reference(
    tx: Queryable,
    input: {
      groupId: string;
      runId: string;
      msgIds: (string | null)[];
      operation: MediaReferenceOperation;
    },
  ): Promise<TestMediaOperation | undefined>;
  cleanup(
    tx: Queryable,
    input: { groupId: string; msgId: string; mediaId: string },
  ): Promise<TestMediaOperation | undefined>;
}
