-- Outgoing FIFO follows the first message event's committed sequence.
CREATE INDEX events_message_order ON events ((payload->>'id'), seq) WHERE type='message';
