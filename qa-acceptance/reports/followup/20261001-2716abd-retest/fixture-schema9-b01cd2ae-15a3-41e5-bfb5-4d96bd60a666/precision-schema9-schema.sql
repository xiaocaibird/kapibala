--
-- PostgreSQL database dump
--

\restrict 6kae3ICyjrgZxVZiQI4yIPIY7RC5xtOg6fBMjhNKxjPzSTBVMJfjXx50PWaFBCU

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    status text DEFAULT 'idle'::text NOT NULL,
    platform_user_id text,
    rate_limited_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'online'::text, 'rate_limited'::text, 'disconnected'::text, 'suspended'::text, 'session_expired'::text])))
);


--
-- Name: agent_media_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_media_references (
    run_id text NOT NULL,
    media_id text NOT NULL
);


--
-- Name: agent_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_pending (
    message_id text NOT NULL,
    group_id text NOT NULL,
    run_id text,
    eligible boolean DEFAULT true NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text NOT NULL,
    group_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    end_reason text,
    summary text,
    history jsonb DEFAULT '[]'::jsonb NOT NULL,
    step_count integer DEFAULT 0 NOT NULL,
    protocol_errors integer DEFAULT 0 NOT NULL,
    active_ms bigint DEFAULT 0 NOT NULL,
    cancel_requested boolean DEFAULT false NOT NULL,
    inflight_turn boolean DEFAULT false NOT NULL,
    recovery_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_updated_at timestamp with time zone DEFAULT date_trunc('milliseconds'::text, now()) NOT NULL,
    CONSTRAINT agent_runs_check CHECK ((((status = 'running'::text) AND (end_reason IS NULL)) OR ((status <> 'running'::text) AND (end_reason IS NOT NULL)))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'finished'::text, 'failed'::text, 'blocked'::text, 'cancelled'::text])))
);


--
-- Name: agent_send_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_send_keys (
    run_id text NOT NULL,
    idempotency_key text NOT NULL,
    client_msg_id text NOT NULL
);


--
-- Name: agent_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_steps (
    run_id text NOT NULL,
    ordinal integer NOT NULL,
    kind text NOT NULL,
    tool_use_id text,
    name text,
    input jsonb,
    result_summary text DEFAULT ''::text NOT NULL,
    is_error boolean DEFAULT false NOT NULL,
    error_code text,
    audit_verdict text,
    raw_response text DEFAULT ''::text NOT NULL,
    state text DEFAULT 'prepared'::text NOT NULL,
    result jsonb,
    audit_attempts integer DEFAULT 0 NOT NULL,
    intent jsonb,
    CONSTRAINT agent_steps_check CHECK (((NOT is_error) OR (error_code IS NOT NULL))),
    CONSTRAINT agent_steps_kind_check CHECK ((kind = ANY (ARRAY['tool_use'::text, 'final'::text, 'protocol_error'::text]))),
    CONSTRAINT agent_steps_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'auditing'::text, 'ready'::text, 'executing'::text, 'complete'::text])))
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id text NOT NULL,
    username text NOT NULL,
    role text NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    token_hash text NOT NULL,
    session_id text NOT NULL,
    kind text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    seq bigint NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_seq_seq OWNED BY public.events.seq;


--
-- Name: gateway_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_events (
    event_id bigint NOT NULL,
    type text NOT NULL,
    data jsonb NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id text NOT NULL,
    gateway_group_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    creator_account_id text NOT NULL,
    agent_enabled boolean DEFAULT false NOT NULL,
    auto_kick_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    description text,
    CONSTRAINT groups_status_check CHECK ((status = ANY (ARRAY['active'::text, 'unreachable'::text, 'left'::text])))
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id text NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    group_id text,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'finished'::text, 'failed'::text])))
);


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id text NOT NULL,
    group_id text NOT NULL,
    msg_id text NOT NULL,
    source_url text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    storage_root text,
    partial_name text,
    local_file_path text,
    downloaded_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    CONSTRAINT media_files_check CHECK (((state = 'ready'::text) = (local_file_path IS NOT NULL))),
    CONSTRAINT media_files_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'downloading'::text, 'ready'::text, 'unavailable'::text, 'deleting'::text, 'deleted'::text])))
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    group_id text NOT NULL,
    account_id text,
    platform_user_id text NOT NULL,
    role text NOT NULL,
    CONSTRAINT members_role_check CHECK ((role = ANY (ARRAY['creator'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: message_sent_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_sent_receipts (
    client_msg_id text NOT NULL,
    msg_id text NOT NULL,
    observed_at timestamp with time zone,
    first_event_id bigint
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id text NOT NULL,
    group_id text NOT NULL,
    msg_id text,
    client_msg_id text,
    account_id text,
    sender_platform_user_id text,
    is_own boolean NOT NULL,
    text text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_status text,
    fail_code text,
    dispatch_state text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    timeout_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    message_sent_observed_at timestamp with time zone,
    local_file_path text,
    CONSTRAINT messages_check CHECK (((delivery_status <> ALL (ARRAY['failed'::text, 'cancelled'::text])) OR (fail_code IS NOT NULL))),
    CONSTRAINT messages_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['queued'::text, 'accepted'::text, 'sent'::text, 'failed'::text, 'unknown'::text, 'cancelled'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version integer NOT NULL,
    name text NOT NULL,
    checksum text NOT NULL,
    checksum_origin text DEFAULT 'executed'::text NOT NULL,
    baseline_source text,
    baseline_verified_at timestamp with time zone,
    baseline_schema_checksum text,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schema_migrations_checksum_check CHECK ((checksum ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT schema_migrations_checksum_origin_check CHECK ((checksum_origin = ANY (ARRAY['executed'::text, 'legacy_schema_baseline'::text])))
);


--
-- Name: sequence_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_runs (
    id text NOT NULL,
    group_id text NOT NULL,
    sequence_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    current_step_index integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sequence_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'finished'::text, 'failed'::text, 'stopped'::text])))
);


--
-- Name: sequence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_steps (
    run_id text NOT NULL,
    index integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    client_msg_id text,
    account_role text NOT NULL,
    text text NOT NULL,
    delay_seconds double precision NOT NULL,
    resolved_vars jsonb NOT NULL,
    var_sources jsonb NOT NULL,
    CONSTRAINT sequence_steps_account_role_check CHECK ((account_role = ANY (ARRAY['admin'::text, 'member'::text]))),
    CONSTRAINT sequence_steps_delay_seconds_check CHECK ((delay_seconds >= (0)::double precision)),
    CONSTRAINT sequence_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'sent'::text, 'skipped'::text, 'failed'::text])))
);


--
-- Name: sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequences (
    id text NOT NULL,
    name text NOT NULL,
    steps jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timeline_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_snapshots (
    id text NOT NULL,
    group_id text NOT NULL,
    items jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events seq; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN seq SET DEFAULT nextval('public.events_seq_seq'::regclass);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_platform_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_platform_user_id_key UNIQUE (platform_user_id);


--
-- Name: agent_media_references agent_media_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_media_references
    ADD CONSTRAINT agent_media_references_pkey PRIMARY KEY (run_id, media_id);


--
-- Name: agent_pending agent_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_pending
    ADD CONSTRAINT agent_pending_pkey PRIMARY KEY (message_id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_send_keys agent_send_keys_client_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_send_keys
    ADD CONSTRAINT agent_send_keys_client_msg_id_key UNIQUE (client_msg_id);


--
-- Name: agent_send_keys agent_send_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_send_keys
    ADD CONSTRAINT agent_send_keys_pkey PRIMARY KEY (run_id, idempotency_key);


--
-- Name: agent_steps agent_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_pkey PRIMARY KEY (run_id, ordinal);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (seq);


--
-- Name: gateway_events gateway_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_events
    ADD CONSTRAINT gateway_events_pkey PRIMARY KEY (event_id);


--
-- Name: groups groups_gateway_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_gateway_group_id_key UNIQUE (gateway_group_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: media_files media_files_group_id_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_group_id_msg_id_key UNIQUE (group_id, msg_id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: members members_group_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_group_id_account_id_key UNIQUE (group_id, account_id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (group_id, platform_user_id);


--
-- Name: message_sent_receipts message_sent_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sent_receipts
    ADD CONSTRAINT message_sent_receipts_pkey PRIMARY KEY (client_msg_id, msg_id);


--
-- Name: messages messages_client_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_client_msg_id_key UNIQUE (client_msg_id);


--
-- Name: messages messages_group_id_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_group_id_msg_id_key UNIQUE (group_id, msg_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sequence_runs sequence_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_runs
    ADD CONSTRAINT sequence_runs_pkey PRIMARY KEY (id);


--
-- Name: sequence_steps sequence_steps_client_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_client_msg_id_key UNIQUE (client_msg_id);


--
-- Name: sequence_steps sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_pkey PRIMARY KEY (run_id, index);


--
-- Name: sequences sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_pkey PRIMARY KEY (id);


--
-- Name: timeline_snapshots timeline_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_snapshots
    ADD CONSTRAINT timeline_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_media_reference_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_media_reference_file ON public.agent_media_references USING btree (media_id, run_id);


--
-- Name: agent_one_running_per_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_one_running_per_group ON public.agent_runs USING btree (group_id) WHERE (status = 'running'::text);


--
-- Name: agent_pending_unclaimed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_pending_unclaimed ON public.agent_pending USING btree (group_id) WHERE (run_id IS NULL);


--
-- Name: agent_tool_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_tool_ids ON public.agent_steps USING btree (run_id, tool_use_id) WHERE (tool_use_id IS NOT NULL);


--
-- Name: auth_tokens_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_tokens_session ON public.auth_tokens USING btree (session_id);


--
-- Name: events_message_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_message_order ON public.events USING btree (((payload ->> 'id'::text)), seq) WHERE (type = 'message'::text);


--
-- Name: groups_directory_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_directory_asc ON public.groups USING btree (created_at, id);


--
-- Name: groups_directory_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_directory_desc ON public.groups USING btree (created_at DESC, id);


--
-- Name: media_cleanup_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_cleanup_due ON public.media_files USING btree (downloaded_at, id) WHERE (state = 'ready'::text);


--
-- Name: media_download_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_download_due ON public.media_files USING btree (next_attempt_at, id) WHERE (state = ANY (ARRAY['pending'::text, 'downloading'::text]));


--
-- Name: messages_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_queue ON public.messages USING btree (account_id, created_at, id) WHERE (delivery_status = ANY (ARRAY['queued'::text, 'unknown'::text]));


--
-- Name: sequence_one_running_per_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sequence_one_running_per_group ON public.sequence_runs USING btree (group_id) WHERE (status = 'running'::text);


--
-- Name: agent_media_references agent_media_references_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_media_references
    ADD CONSTRAINT agent_media_references_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id);


--
-- Name: agent_media_references agent_media_references_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_media_references
    ADD CONSTRAINT agent_media_references_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: agent_pending agent_pending_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_pending
    ADD CONSTRAINT agent_pending_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: agent_pending agent_pending_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_pending
    ADD CONSTRAINT agent_pending_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: agent_pending agent_pending_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_pending
    ADD CONSTRAINT agent_pending_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id);


--
-- Name: agent_runs agent_runs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: agent_send_keys agent_send_keys_client_msg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_send_keys
    ADD CONSTRAINT agent_send_keys_client_msg_id_fkey FOREIGN KEY (client_msg_id) REFERENCES public.messages(client_msg_id);


--
-- Name: agent_send_keys agent_send_keys_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_send_keys
    ADD CONSTRAINT agent_send_keys_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id);


--
-- Name: agent_steps agent_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id);


--
-- Name: auth_tokens auth_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.auth_sessions(id);


--
-- Name: groups groups_creator_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_creator_account_id_fkey FOREIGN KEY (creator_account_id) REFERENCES public.accounts(id);


--
-- Name: jobs jobs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: media_files media_files_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: members members_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: members members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: messages messages_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: messages messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: sequence_runs sequence_runs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_runs
    ADD CONSTRAINT sequence_runs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: sequence_runs sequence_runs_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_runs
    ADD CONSTRAINT sequence_runs_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.sequences(id);


--
-- Name: sequence_steps sequence_steps_client_msg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_client_msg_id_fkey FOREIGN KEY (client_msg_id) REFERENCES public.messages(client_msg_id);


--
-- Name: sequence_steps sequence_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.sequence_runs(id);


--
-- Name: timeline_snapshots timeline_snapshots_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_snapshots
    ADD CONSTRAINT timeline_snapshots_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 6kae3ICyjrgZxVZiQI4yIPIY7RC5xtOg6fBMjhNKxjPzSTBVMJfjXx50PWaFBCU

