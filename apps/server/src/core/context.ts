import type { FastifyBaseLogger } from "fastify";
import type { Database } from "./db.js";
import type { RemoteClient } from "./remote.js";
import type { TestExecutionObserver } from "./test-execution-observer.js";
export interface AppContext {
  db: Database;
  gateway: RemoteClient;
  agent: RemoteClient;
  log: FastifyBaseLogger;
  testExecutionObserver?: TestExecutionObserver;
}
