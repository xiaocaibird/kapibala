-- Receipt of message_sent is a distinct fact from echo/query delivery confirmation.
-- Old updated_at/processed_at values cannot reconstruct receipt time. Let old
-- running sequences finish on the old version before migrating; do not rewrite
-- their schedule or synthesize historical observations during event replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sequence_runs WHERE status='running') THEN
    RAISE EXCEPTION 'Finish running sequences on the previous version before migration 007';
  END IF;
END $$;
ALTER TABLE messages ADD COLUMN message_sent_observed_at timestamptz;
