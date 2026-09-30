CREATE TABLE agent_runs (
  id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','finished','failed','blocked','cancelled')),
  end_reason text, summary text, history jsonb NOT NULL DEFAULT '[]',
  step_count integer NOT NULL DEFAULT 0, protocol_errors integer NOT NULL DEFAULT 0,
  active_ms bigint NOT NULL DEFAULT 0, cancel_requested boolean NOT NULL DEFAULT false,
  inflight_turn boolean NOT NULL DEFAULT false, recovery_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status = 'running' AND end_reason IS NULL) OR (status <> 'running' AND end_reason IS NOT NULL))
);
CREATE UNIQUE INDEX agent_one_running_per_group ON agent_runs(group_id) WHERE status='running';
CREATE TABLE agent_pending (
  message_id text PRIMARY KEY REFERENCES messages(id), group_id text NOT NULL REFERENCES groups(id),
  run_id text REFERENCES agent_runs(id), eligible boolean NOT NULL DEFAULT true, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_pending_unclaimed ON agent_pending(group_id) WHERE run_id IS NULL;
CREATE TABLE agent_steps (
  run_id text NOT NULL REFERENCES agent_runs(id), ordinal integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('tool_use','final','protocol_error')),
  tool_use_id text, name text, input jsonb, result_summary text NOT NULL DEFAULT '',
  is_error boolean NOT NULL DEFAULT false, error_code text, audit_verdict text, raw_response text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','auditing','ready','executing','complete')),
  result jsonb, audit_attempts integer NOT NULL DEFAULT 0, intent jsonb,
  PRIMARY KEY(run_id,ordinal), CHECK(NOT is_error OR error_code IS NOT NULL)
);
CREATE UNIQUE INDEX agent_tool_ids ON agent_steps(run_id,tool_use_id) WHERE tool_use_id IS NOT NULL;
CREATE TABLE agent_send_keys (
  run_id text NOT NULL REFERENCES agent_runs(id), idempotency_key text NOT NULL,
  client_msg_id text NOT NULL UNIQUE REFERENCES messages(client_msg_id), PRIMARY KEY(run_id,idempotency_key)
);
CREATE TABLE sequences (
  id text PRIMARY KEY, name text NOT NULL, steps jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sequence_runs (
  id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), sequence_id text NOT NULL REFERENCES sequences(id),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','finished','failed','stopped')),
  current_step_index integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sequence_one_running_per_group ON sequence_runs(group_id) WHERE status='running';
CREATE TABLE sequence_steps (
  run_id text NOT NULL REFERENCES sequence_runs(id), index integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','sent','skipped','failed')),
  scheduled_at timestamptz, sent_at timestamptz, client_msg_id text UNIQUE REFERENCES messages(client_msg_id),
  account_role text NOT NULL CHECK(account_role IN ('admin','member')), text text NOT NULL,
  delay_seconds double precision NOT NULL CHECK(delay_seconds >= 0),
  resolved_vars jsonb NOT NULL, var_sources jsonb NOT NULL,
  PRIMARY KEY(run_id,index)
);
