CREATE TABLE accounts (
  id text PRIMARY KEY, status text NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','online','rate_limited','disconnected','suspended','session_expired')),
  platform_user_id text UNIQUE, rate_limited_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO accounts(id) SELECT 'account-' || i FROM generate_series(1,6) i;
CREATE TABLE groups (
  id text PRIMARY KEY, gateway_group_id text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','unreachable','left')),
  creator_account_id text NOT NULL REFERENCES accounts(id), agent_enabled boolean NOT NULL DEFAULT false, auto_kick_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE members (
  group_id text NOT NULL REFERENCES groups(id), account_id text REFERENCES accounts(id), platform_user_id text NOT NULL,
  role text NOT NULL CHECK(role IN ('creator','admin','member')), PRIMARY KEY(group_id,platform_user_id), UNIQUE(group_id,account_id)
);
CREATE TABLE messages (
  id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id), msg_id text, client_msg_id text UNIQUE, account_id text REFERENCES accounts(id), sender_platform_user_id text,
  is_own boolean NOT NULL, text text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), delivery_status text CHECK(delivery_status IN ('queued','accepted','sent','failed','unknown','cancelled')),
  fail_code text, dispatch_state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, timeout_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(group_id,msg_id),
  CHECK(delivery_status NOT IN ('failed','cancelled') OR fail_code IS NOT NULL)
);
CREATE INDEX messages_queue ON messages(account_id,created_at,id) WHERE delivery_status IN ('queued','unknown');
CREATE TABLE jobs (id text PRIMARY KEY, kind text NOT NULL, status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','finished','failed')), group_id text REFERENCES groups(id), state jsonb NOT NULL DEFAULT '{}', errors jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE gateway_events(event_id bigint PRIMARY KEY,type text NOT NULL,data jsonb NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE events(seq bigserial PRIMARY KEY,type text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE timeline_snapshots(id text PRIMARY KEY,group_id text NOT NULL REFERENCES groups(id),items jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_sessions(id text PRIMARY KEY,username text NOT NULL,role text NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_tokens(token_hash text PRIMARY KEY,session_id text NOT NULL REFERENCES auth_sessions(id),kind text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE INDEX auth_tokens_session ON auth_tokens(session_id);
