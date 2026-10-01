--
-- PostgreSQL database dump
--

\restrict Epzo0zvJc1qyjyDilm94mBUNua5RUTvksUFCedlakqCQRMMSu9L08b5bT4zdQR0

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

--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts (id, status, platform_user_id, rate_limited_until, updated_at) FROM stdin;
account-1	idle	\N	\N	2026-10-01 05:08:55.326773+00
account-2	idle	\N	\N	2026-10-01 05:08:55.326773+00
account-3	idle	\N	\N	2026-10-01 05:08:55.326773+00
account-4	idle	\N	\N	2026-10-01 05:08:55.326773+00
account-5	idle	\N	\N	2026-10-01 05:08:55.326773+00
account-6	idle	\N	\N	2026-10-01 05:08:55.326773+00
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.groups (id, gateway_group_id, status, creator_account_id, agent_enabled, auto_kick_enabled, created_at, name, description) FROM stdin;
\.


--
-- Data for Name: agent_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.agent_runs (id, group_id, status, end_reason, summary, history, step_count, protocol_errors, active_ms, cancel_requested, inflight_turn, recovery_note, created_at, updated_at, activity_updated_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, group_id, msg_id, client_msg_id, account_id, sender_platform_user_id, is_own, text, sent_at, delivery_status, fail_code, dispatch_state, attempts, timeout_at, metadata, created_at, updated_at, message_sent_observed_at) FROM stdin;
\.


--
-- Data for Name: agent_pending; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.agent_pending (message_id, group_id, run_id, eligible, observed_at) FROM stdin;
\.


--
-- Data for Name: agent_send_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.agent_send_keys (run_id, idempotency_key, client_msg_id) FROM stdin;
\.


--
-- Data for Name: agent_steps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.agent_steps (run_id, ordinal, kind, tool_use_id, name, input, result_summary, is_error, error_code, audit_verdict, raw_response, state, result, audit_attempts, intent) FROM stdin;
\.


--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_sessions (id, username, role, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: auth_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_tokens (token_hash, session_id, kind, expires_at, used_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (seq, type, payload, created_at) FROM stdin;
\.


--
-- Data for Name: gateway_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gateway_events (event_id, type, data, processed_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jobs (id, kind, status, group_id, state, errors, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.members (group_id, account_id, platform_user_id, role) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (version, name, checksum, checksum_origin, baseline_source, baseline_verified_at, baseline_schema_checksum, applied_at) FROM stdin;
1	001_core.sql	eabfdd3e50fa312558f14aeb2e3277bdb2ee186d0892a320c0643bed329bb06c	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
2	002_automation.sql	302e6d20b8aebfbed8431e852e1ef9e7c20c310bdaf11e89671f155cb49b09cb	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
3	003_agent_activity.sql	2d8fcc6b498b053614464e1bc49322899041ca74b404b44fbfb13b9440c45e6c	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
4	004_message_event_order.sql	5b7d6c9bcf202ad97276fececabe9e39c1422ebd9fbe25330158e7cac8339298	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
5	005_group_metadata.sql	bbb67a43a41aaaf172f6ba9469a5ad4cc47563447dabf9d3d2bbf0444f1ae003	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
6	006_group_directory.sql	760acc9148f851c1f6d75163655b65a0c15b7b7f929b4a57588c59ceecb9f533	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
7	007_message_sent_observation.sql	51117419e21aa060d15e7a38d8b5b49668d7ba5c9d2568d1bb5256090793706d	executed	\N	\N	\N	2026-10-01 05:08:55.326773+00
\.


--
-- Data for Name: sequences; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sequences (id, name, steps, created_at) FROM stdin;
\.


--
-- Data for Name: sequence_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sequence_runs (id, group_id, sequence_id, status, current_step_index, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sequence_steps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sequence_steps (run_id, index, status, scheduled_at, sent_at, client_msg_id, account_role, text, delay_seconds, resolved_vars, var_sources) FROM stdin;
\.


--
-- Data for Name: timeline_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timeline_snapshots (id, group_id, items, created_at) FROM stdin;
\.


--
-- Name: events_seq_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.events_seq_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict Epzo0zvJc1qyjyDilm94mBUNua5RUTvksUFCedlakqCQRMMSu9L08b5bT4zdQR0

