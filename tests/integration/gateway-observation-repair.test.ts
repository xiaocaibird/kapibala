import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayEvents } from "../../apps/server/src/modules/gateway/events.js";
import {
  Messages,
  recordSent,
} from "../../apps/server/src/modules/gateway/messages.js";
import {
  automationFixture,
  delay,
} from "../support/core-automation-fixture.js";

function cachedObservations(events: GatewayEvents): number {
  return (events as unknown as { messageSentObservedAt: Map<string, Date> })
    .messageSentObservedAt.size;
}

test("R09 combination: failed receipt and a later eventId for the same message retain the first observation", async (t) => {
  const f = await automationFixture(t);
  await f.automation.recover!();
  const definition = await f.api("POST", "/api/sequences", {
    name: "first receipt",
    steps: [
      { index: 1, accountRole: "admin", text: "first", delaySeconds: 0 },
      { index: 2, accountRole: "admin", text: "next", delaySeconds: 0.5 },
    ],
  });
  const started = await f.api("POST", "/api/groups/g/sequence-runs", {
    sequenceId: definition.json<{ id: string }>().id,
  });
  const runId = started.json<{ runId: string }>().runId;
  await f.automation.tick();
  const clientMsgId = (
    await f.db.query(
      "SELECT client_msg_id FROM sequence_steps WHERE run_id=$1 AND index=1",
      [runId],
    )
  ).rows[0]!.client_msg_id as string;
  const events = new GatewayEvents(f.ctx, new Messages(f.ctx));
  await f.db
    .query(`CREATE FUNCTION reject_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message_sent_observed_at IS NOT NULL THEN RAISE EXCEPTION 'injected observation failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_observation BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION reject_observation()`);
  const event = {
    eventId: 100,
    type: "message_sent" as const,
    clientMsgId,
    msgId: "landed",
    sentAt: "2020-01-01T00:00:00.000Z",
  };
  const firstBefore = Date.now();
  const processing = events.process(event);
  const firstAfter = Date.now();
  await processing;
  assert.equal(cachedObservations(events), 1);
  assert.equal(
    (await f.db.query("SELECT 1 FROM gateway_events WHERE event_id=100"))
      .rowCount,
    0,
  );
  await f.db.query("DROP TRIGGER reject_observation ON messages");
  await delay(100);
  await events.process({ ...event, eventId: 101 });
  const observed = (
    await f.db.query<{ message_sent_observed_at: Date }>(
      "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
      [clientMsgId],
    )
  ).rows[0]!.message_sent_observed_at.getTime();
  assert.ok(
    observed >= firstBefore && observed <= firstAfter,
    "new eventId must reuse the first failed receipt's clock",
  );
  assert.equal(
    cachedObservations(events),
    0,
    "durable observation no longer needs a cached copy",
  );
  await f.automation.tick();
  const steps = (
    await f.db.query(
      "SELECT sent_at,scheduled_at FROM sequence_steps WHERE run_id=$1 ORDER BY index",
      [runId],
    )
  ).rows;
  assert.equal(steps[0]!.sent_at.getTime(), observed);
  assert.equal(steps[1]!.scheduled_at.getTime(), observed + 500);
  await events.retryFailed();
  await events.process(event);
  await events.process({ ...event, eventId: 102 });
  assert.equal(cachedObservations(events), 0);
  assert.equal(
    (
      await f.db.query<{ message_sent_observed_at: Date }>(
        "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
        [clientMsgId],
      )
    ).rows[0]!.message_sent_observed_at.getTime(),
    observed,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM gateway_events WHERE event_id IN (100,101,102)",
      )
    ).rowCount,
    3,
  );
});

test("R09 combination: a failed acknowledgement for a different msgId cannot occupy the valid message's observation", async (t) => {
  const f = await automationFixture(t);
  const messages = new Messages(f.ctx);
  const outgoing = await messages.enqueueSend({
    groupId: "g",
    accountId: "account-2",
    text: "sent by query",
    source: "manual",
  });
  await f.db.transaction((tx) =>
    recordSent(
      tx,
      outgoing.clientMsgId!,
      "correct",
      "2020-01-01T00:00:00.000Z",
    ),
  );
  const events = new GatewayEvents(f.ctx, messages);
  await f.db
    .query(`CREATE FUNCTION reject_wrong_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id=200 THEN RAISE EXCEPTION 'injected wrong-event failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_wrong_event BEFORE INSERT ON gateway_events FOR EACH ROW EXECUTE FUNCTION reject_wrong_event()`);
  const event = {
    eventId: 200,
    type: "message_sent" as const,
    clientMsgId: outgoing.clientMsgId!,
    msgId: "wrong",
    sentAt: "2020-01-01T00:00:00.000Z",
  };
  await events.process(event);
  assert.equal(cachedObservations(events), 1);
  await delay(100);
  const correctBefore = Date.now();
  await events.process({ ...event, eventId: 201, msgId: "correct" });
  const correctAfter = Date.now();
  const observed = (
    await f.db.query<{ message_sent_observed_at: Date }>(
      "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
      [outgoing.clientMsgId],
    )
  ).rows[0]!.message_sent_observed_at.getTime();
  assert.ok(observed >= correctBefore && observed <= correctAfter);
  assert.equal(
    cachedObservations(events),
    1,
    "only the unresolved wrong identity remains cached",
  );
  await f.db.query("DROP TRIGGER reject_wrong_event ON gateway_events");
  await events.retryFailed();
  await events.process({ ...event, eventId: 201, msgId: "correct" });
  assert.equal(cachedObservations(events), 0);
  assert.equal(
    (
      await f.db.query<{ message_sent_observed_at: Date }>(
        "SELECT message_sent_observed_at FROM messages WHERE client_msg_id=$1",
        [outgoing.clientMsgId],
      )
    ).rows[0]!.message_sent_observed_at.getTime(),
    observed,
  );
  assert.equal(
    (
      await f.db.query(
        "SELECT 1 FROM events WHERE type='inconsistency' AND payload->>'kind'='duplicate_remote_delivery'",
      )
    ).rowCount,
    1,
  );
});
