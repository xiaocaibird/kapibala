import type { FastifyBaseLogger } from "fastify";
import type { Database } from "./db.js";
import type { RemoteClient } from "./remote.js";
import type { TestExecutionObserver } from "./test-execution-observer.js";
import type { TestMessageObserver } from "./test-message-observer.js";
import type { TestRuntimeObserver } from "./test-runtime-observer.js";
import type { TestActivityObserver } from "./test-activity-observer.js";
import type { TestLifecycleObserver } from "./test-lifecycle-observer.js";
import type { TestMediaObserver } from "./test-media-observer.js";
export interface AppContext {
  db: Database;
  gateway: RemoteClient;
  agent: RemoteClient;
  log: FastifyBaseLogger;
  testExecutionObserver?: TestExecutionObserver;
  testMessageObserver?: TestMessageObserver;
  testRuntimeObserver?: TestRuntimeObserver;
  testActivityObserver?: TestActivityObserver;
  testLifecycleObserver?: TestLifecycleObserver;
  testMediaObserver?: TestMediaObserver;
}
