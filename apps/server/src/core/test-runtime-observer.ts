import type { PoolClient } from "pg";
import type { Queryable } from "./db.js";

/** Optional engineering-only hooks. Normal main never installs an observer. */
export interface TestAccountRequest {
  requestId: string;
  accountId: string;
  operation: "connect" | "transition";
  expectedFrom?: string;
  to?: string;
}
export interface TestAccountObservation {
  transaction(tx: PoolClient): Promise<void>;
  lock<T>(acquire: () => Promise<T>): Promise<T>;
  remoteSucceeded(): void;
  save(tx: Queryable): Promise<void>;
  saveFailed(error: unknown, willRetry: boolean): Promise<void>;
}
export interface TestRuntimeObserver {
  account(request: TestAccountRequest): TestAccountObservation | undefined;
  modules(names: string[]): void;
  beforeTick(name: string): Promise<void>;
  tick(name: string, operation: () => Promise<void>): Promise<void>;
  tickFinished(name: string, succeeded: boolean): void;
}
