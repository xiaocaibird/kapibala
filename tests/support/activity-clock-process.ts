import Fastify from "fastify";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { ActivityClock } from "../../apps/server/src/modules/automation/activity-clock.js";

// Test-only worker: exercise the production clock in a process the test can kill.
const url = process.env.CLOCK_TEST_DATABASE_URL;
if (!url || !/^\/kapibala_test_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Activity clock subprocess requires a UUID test database");
const db = new Database(url);
const clock = new ActivityClock({
  db,
  agent: new RemoteClient("http://unused.invalid"),
  gateway: new RemoteClient("http://unused.invalid"),
  log: Fastify({ logger: false }).log,
});
process.on("message", async (message: string) => {
  if (message === "block") {
    process.send?.({ type: "blocked", at: Date.now() });
    // Hold this worker's event loop so 500ms timer frequency cannot be mistaken
    // for a hard upper bound on the last unpersisted interval.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
  } else if (message === "close") {
    await clock.close();
    await db.close();
    process.exit(0);
  }
});
await clock.start();
process.send?.({ type: "ready", at: Date.now() });
