import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

/** Read-only engineering hooks. No SQL parameters, text, error messages or
 * owner-supplied timestamps enter this channel. Normal main installs no scope. */
export interface TransactionBoundaryFact {
  transactionAttemptId: string;
  backendPid: number | null;
  phase: string;
  edge: "called" | "returned" | "rejected";
  windowMs: [number, number];
  sqlState?: string;
}
type Observer = (fact: TransactionBoundaryFact) => void;
const scope = new AsyncLocalStorage<Observer>();
const clients = new WeakMap<PoolClient, TransactionProbe>();

export function withTestTransactionObserver<T>(
  observer: Observer | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  return observer ? scope.run(observer, operation) : operation();
}

export interface TransactionProbe {
  query<T>(phase: string, operation: () => Promise<T>): Promise<T>;
  release(): void;
}

export function installTestTransactionObserver(
  client: PoolClient,
): TransactionProbe | undefined {
  const observer = scope.getStore();
  if (!observer) return;
  const transactionAttemptId = randomUUID();
  const pid = (client as PoolClient & { processID?: number }).processID;
  const backendPid =
    typeof pid === "number" && Number.isSafeInteger(pid) ? pid : null;
  const publish = (
    fact: Omit<TransactionBoundaryFact, "transactionAttemptId" | "backendPid">,
  ) => {
    try {
      observer({ transactionAttemptId, backendPid, ...fact });
    } catch {
      /* A recorder must never change a transaction's result. */
    }
  };
  const probe: TransactionProbe = {
    async query(phase, operation) {
      const before = performance.now();
      publish({ phase, edge: "called", windowMs: [before, before] });
      try {
        const result = await operation();
        publish({
          phase,
          edge: "returned",
          windowMs: [before, performance.now()],
        });
        return result;
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        publish({
          phase,
          edge: "rejected",
          windowMs: [before, performance.now()],
          ...(typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
            ? { sqlState: code }
            : {}),
        });
        throw error;
      }
    },
    release() {
      clients.delete(client);
    },
  };
  clients.set(client, probe);
  return probe;
}

export function observeTestTransactionQuery<T>(
  client: PoolClient,
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  const probe = clients.get(client);
  return probe ? probe.query(phase, operation) : operation();
}
