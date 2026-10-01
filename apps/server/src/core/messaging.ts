import type { FastifyInstance } from "fastify";
import type { Queryable } from "./db.js";
import type { Message } from "../../../../packages/contracts/src/index.js";
export interface SendInput {
  groupId: string;
  accountId: string;
  text: string;
  clientMsgId?: string;
  source?: string;
  sourceRef?: string;
}
// Only the first side-effecting POST. Confirmation and projection reads have
// their own timeouts; this is not a completion bound for the whole kick tool.
export const KICK_POST_TIMEOUT_MS = 15000;
// Internal allocation inside the unchanged 60s run limit: stop external work
// early enough to attempt the original checkpoint and durable finalization.
// This is not a physical completion guarantee under arbitrary infrastructure stalls.
export const KICK_SETTLEMENT_BUDGET_MS = 2000;
/** A definite remote rejection was received, but its local state repair failed.
 * Preserve both facts without presenting the tool result as durably saved. */
export class KickRejectionPersistenceError extends Error {
  constructor(
    readonly rejectionCode: string,
    cause: unknown,
  ) {
    super(`Kick rejection ${rejectionCode} could not be saved locally`, {
      cause,
    });
    this.name = "KickRejectionPersistenceError";
  }
}
export interface KickOptions {
  signal?: AbortSignal;
  hardBudgetSignal?: AbortSignal;
  /** The optional projection shares the external work allocation, while
   * authoritative result saving and finalization retain the total deadline. */
  workDatabaseDeadline?: number;
  /** Engineering-only correlation and source identity for the actual signal.
   * These fields do not add a signal or change cancellation semantics. */
  observation?: {
    runId: string;
    toolUseId: string;
    stepId: string;
    attemptId: string;
    signalSource: "activity-budget" | "kick-work-budget";
  };
  /** Called only after a valid remote success or a conclusive membership query.
   * Lets orchestration save that proof before the optional projection refresh. */
  afterConfirmation?: () => Promise<void>;
  /** Runs after local admission and validation, before any remote kick. A
   * rejection prevents dispatch; durable intent writes must commit here. */
  beforeDispatch?: () => Promise<void>;
  /** Synchronous, repeatable deadline/ownership check. The remote client also
   * checks after serialization, immediately before the first kick fetch. */
  assertDispatchAllowed?: () => void;
}
export interface MessagingService {
  enqueueSend(input: SendInput, tx?: Queryable): Promise<Message>;
  getMessage(clientMsgId: string, reader?: Queryable): Promise<Message | null>;
  kick(
    input: {
      groupId: string;
      accountId: string;
      targetPlatformUserId: string;
    },
    options?: KickOptions,
  ): Promise<{ kicked: true }>;
}
export interface PlatformModule {
  readonly name?: string;
  register(app: FastifyInstance): Promise<void>;
  tick(): Promise<void>;
  recover?(): Promise<void>;
  close?(): Promise<void>;
}
