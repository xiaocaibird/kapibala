-- Preserve a confirmation's local observation before applying business state.
-- A NULL observation is an explicit legacy tombstone: the event was processed
-- before reliable receipt storage, but its original observation is not known.
CREATE TABLE message_sent_receipts (
  client_msg_id text NOT NULL,
  msg_id text NOT NULL,
  observed_at timestamptz,
  first_event_id bigint,
  PRIMARY KEY (client_msg_id, msg_id)
);

-- Existing version-7 observations are actual local receipt times. Preserve them
-- without consulting gateway sentAt, processing time, or migration time.
INSERT INTO message_sent_receipts(client_msg_id, msg_id, observed_at)
SELECT client_msg_id, msg_id, message_sent_observed_at
FROM messages
WHERE client_msg_id IS NOT NULL AND msg_id IS NOT NULL
  AND message_sent_observed_at IS NOT NULL;

-- Already-processed confirmations with no captured clock must not acquire a
-- fabricated historical observation merely because the gateway replays them.
INSERT INTO message_sent_receipts(client_msg_id, msg_id, first_event_id)
SELECT data->>'clientMsgId', data->>'msgId', min(event_id)
FROM gateway_events
WHERE type = 'message_sent'
  AND data->>'clientMsgId' IS NOT NULL AND data->>'msgId' IS NOT NULL
GROUP BY data->>'clientMsgId', data->>'msgId'
ON CONFLICT (client_msg_id, msg_id) DO NOTHING;
