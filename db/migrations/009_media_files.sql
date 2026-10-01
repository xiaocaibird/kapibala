ALTER TABLE messages ADD COLUMN local_file_path text;

CREATE TABLE media_files (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES groups(id),
  msg_id text NOT NULL,
  source_url text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','downloading','ready','unavailable','deleting','deleted')),
  storage_root text,
  partial_name text,
  local_file_path text,
  downloaded_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  UNIQUE(group_id,msg_id),
  CHECK ((state='ready') = (local_file_path IS NOT NULL))
);
CREATE INDEX media_download_due ON media_files(next_attempt_at,id) WHERE state IN ('pending','downloading');
CREATE INDEX media_cleanup_due ON media_files(downloaded_at,id) WHERE state='ready';

CREATE TABLE agent_media_references (
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES media_files(id),
  PRIMARY KEY(run_id,media_id)
);
CREATE INDEX agent_media_reference_file ON agent_media_references(media_id,run_id);

-- Earlier versions retained the source in metadata without downloading it.
INSERT INTO media_files(id,group_id,msg_id,source_url)
SELECT gen_random_uuid()::text,group_id,msg_id,metadata->>'mediaUrl'
FROM messages WHERE msg_id IS NOT NULL AND jsonb_typeof(metadata->'mediaUrl')='string'
ON CONFLICT(group_id,msg_id) DO NOTHING;

-- Existing sessions have no durable per-read media ledger. Protect their group's
-- known media conservatively until those running sessions terminate.
INSERT INTO agent_media_references(run_id,media_id)
SELECT r.id,f.id FROM agent_runs r JOIN media_files f ON f.group_id=r.group_id
WHERE r.status='running';
