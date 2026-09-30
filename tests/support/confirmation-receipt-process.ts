import Fastify from "fastify";
import type { QueryResult, QueryResultRow } from "pg";
import { Database } from "../../apps/server/src/core/db.js";
import { RemoteClient } from "../../apps/server/src/core/remote.js";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import { Messages } from "../../apps/server/src/modules/gateway/messages.js";

const url = process.env.CONFIRMATION_TEST_DATABASE_URL;
if (!url || !/^\/kapibala_test_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Confirmation subprocess requires a UUID test database");
const event = JSON.parse(process.argv[2]!) as {
  eventId: number;
  type: "message_sent";
  clientMsgId: string;
  msgId: string;
  sentAt: string;
};
class ReceiptTestDatabase extends Database {
  override async query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    if (
      process.env.CONFIRMATION_TEST_PAUSE_BEFORE_INSERT === "1" &&
      sql.startsWith("INSERT INTO message_sent_receipts")
    ) {
      // Test-only crash boundary: the production process() has captured its clock,
      // but no receipt SQL has been submitted. A killed client alone would not
      // prove that an already-submitted PostgreSQL autocommit statement rolled back.
      await report("before_receipt_insert");
      await new Promise<void>(() => {});
    }
    return super.query<R>(sql, values);
  }
}
const db = new ReceiptTestDatabase(url);
const logger = Fastify({ logger: false });
const remote = new RemoteClient("http://unused.invalid");
const ctx = { db, gateway: remote, agent: remote, log: logger.log };
const events = new GatewayEvents(ctx, new Messages(ctx));
async function report(type: string): Promise<void> {
  if (!process.send) throw new Error("Confirmation subprocess requires IPC");
  await new Promise<void>((resolve, reject) => {
    process.send!({ type, at: Date.now() }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}
try {
  await report("starting");
  await events.process(event);
  await report("completed");
} finally {
  await events.close();
  await db.close();
  await logger.close();
  process.disconnect?.();
}
