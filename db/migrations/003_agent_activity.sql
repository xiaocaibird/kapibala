-- Dedicated sampling time: history/status writes must not alter activity billing.
ALTER TABLE agent_runs ADD COLUMN activity_updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',now());
