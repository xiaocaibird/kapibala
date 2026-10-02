# SR-C2-017 bounded real-provider acceptance

Result: **PASS**. SUT `0be8575f326f709fe674e20033843d950385043d`; QA `9454428af7f56c1ab42e11543a9ec8de1249be4b`.

One authorized attempt; two planned public requests, no automatic retry or model fallback. Actual native TLS send boundaries and full failed-attempt reservations are retained. Maximum reserved cost is $0.720896, not an invoice. Only synthetic inputs; no generated tools executed.

- real-synthetic-turn: PASS
- real-synthetic-audit: PASS
- actual-usage-attempt-accounting: PASS
- actual-native-outbound-and-cost-guard: PASS

See result.json, manifest.json, live-transport.ndjson and actual-usage.jsonl. Production readiness is not assessed.
