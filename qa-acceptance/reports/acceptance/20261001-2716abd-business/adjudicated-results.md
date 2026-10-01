# 2716 正式业务逐项审定

固定SUT 2716abdd2d43a779b6a0972a6323f895cf2b5b9c；QA ec46f9b30fb2f5a312c92fc78463ddbfe200042f；run 2026-10-01T14-26-25.068Z-1e0cb38a。原始事件不改写。

254用例：原始240P/5F/9B，审定240P/9F/5B；262义务审定248P/9F/5B。仅四条明确恢复暂停B→F。

[机器结果](adjudicated-results.json) · [原始表](case-results.md)

| 用例 | 标题 | 原始→审定 | 项目 | 需求 | 缺陷/证据 |
|---|---|---|---|---|---|
| AGENT-001 | four schema-complete tools and correct trigger context keep one run identity | PASS→PASS | system | R-A5-02, R-A5-03, R-A5-14, R-A5-17 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-001-fo-3c38c-ntext-keep-one-run-identity-system/evidence) |
| AGENT-002 | duplicate inbound and own echo never duplicate triggers | PASS→PASS | system | R-A5-01, R-A2-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-002-du-61c58-ho-never-duplicate-triggers-system/evidence) |
| AGENT-003 | multi-instance active run excludes competitors and batches all pending messages | PASS→PASS | system | R-A5-01, R-A5-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-003-mu-26f13-atches-all-pending-messages-system/evidence) |
| AGENT-004 | non-JSON produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-004-no-035ee-ory-without-assistant-block-system/evidence) |
| AGENT-005 | fenced JSON produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-005-fe-41252-ory-without-assistant-block-system/evidence) |
| AGENT-006 | multiple blocks produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-006-mu-184f2-ory-without-assistant-block-system/evidence) |
| AGENT-007 | stop reason mismatch produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-007-st-2b00a-ory-without-assistant-block-system/evidence) |
| AGENT-008 | non-2xx produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-008-no-cf260-ory-without-assistant-block-system/evidence) |
| AGENT-009 | UNKNOWN_TOOL appends assistant tool use and error result | PASS→PASS | system | R-A5-03, R-A5-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-009-UN-15074-t-tool-use-and-error-result-system/evidence) |
| AGENT-010 | INVALID_INPUT appends assistant tool use and error result | PASS→PASS | system | R-A5-03, R-A5-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-010-IN-ab91d-t-tool-use-and-error-result-system/evidence) |
| AGENT-011 | duplicate tool_use id is protocol error and has no repeated effect | PASS→PASS | system | R-A5-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-011-du-e3464--and-has-no-repeated-effect-system/evidence) |
| AGENT-012 | three consecutive protocol errors fail and a legal response resets the count | PASS→PASS | system | R-A5-04, R-A5-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-012-th-ae58f-l-response-resets-the-count-system/evidence) |
| AGENT-013 | repeated read loop cannot exceed twelve turns | PASS→PASS | system | R-A5-05, R-A5-18 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-013-re-a02db--cannot-exceed-twelve-turns-system/evidence) |
| AGENT-014 | audit rejection blocks side effect and rejected key remains reusable | PASS→PASS | system | R-A5-07, R-A5-10 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-014-au-b96d2-jected-key-remains-reusable-system/evidence) |
| AGENT-015 | three inconclusive audit attempts block run without execution | PASS→PASS | system | R-A5-07 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-015-th-aff5d-block-run-without-execution-system/evidence) |
| AGENT-016 | idempotency retry returns current sent state without another audit or send | PASS→PASS | system | R-A5-10, R-A5-16, R-A2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-016-id-ec0da-thout-another-audit-or-send-system/evidence) |
| AGENT-017 | kick denied by policy never calls external kick | PASS→PASS | system | R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-017-ki-1fc49-y-never-calls-external-kick-system/evidence) |
| AGENT-018 | permitted kick audits exact action and uses owner or promoted member | PASS→PASS | system | R-A5-07, R-A5-08, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-018-pe-7c6cb-es-owner-or-promoted-member-system/evidence) |
| AGENT-019 | OWNER_LEFT is returned as tool error without changing group or accounts | PASS→PASS | system | R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-019-OW-6c3fd--changing-group-or-accounts-system/evidence) |
| AGENT-020 | NO_PERMISSION is returned as tool error without changing group or accounts | PASS→PASS | system | R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-020-NO-b72af--changing-group-or-accounts-system/evidence) |
| AGENT-021 | recent messages include new arrivals and obey text, count, byte and summary limits | PASS→PASS | system | R-A5-12, R-A5-15 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-021-re-3d8de-unt-byte-and-summary-limits-system/evidence) |
| AGENT-022 | disabling agent lets current step complete then cancels | PASS→PASS | system | R-A5-13 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-022-di-dd8bf--step-complete-then-cancels-system/evidence) |
| AGENT-023 | finish tool stores summary and does not ask another turn | PASS→PASS | system | R-A5-17 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-023-fi-273f9-d-does-not-ask-another-turn-system/evidence) |
| AGENT-024 | turn timeout records error and late response never sends a message | PASS→PASS | system | R-A5-06, R-A5-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-024-tu-8a76f-ponse-never-sends-a-message-system/evidence) |
| AGENT-025 | run stays within sixty-second active wall-clock budget including slow turns | FAIL→FAIL | system | R-A5-06 | QA2716-D01；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-025-ru-085da-budget-including-slow-turns-system/evidence) |
| AGENT-026 | no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error | PASS→PASS | system | R-A5-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-026-no-659e7-OUNT-as-ordinary-tool-error-system/evidence) |
| AGENT-027 | raw protocol response truncates to two KiB and remains inspectable | PASS→PASS | system | R-A5-12, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-027-ra-3ac9e-KiB-and-remains-inspectable-system/evidence) |
| AGENT-028 | unknown send times out in five seconds and same key still cannot resend | FAIL→FAIL | system | R-A5-10, R-A5-16 | QA2716-D02；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system/evidence) |
| AGENT-029 | kick timeout reconciles membership and never executes twice | PASS→PASS | system | R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-029-ki-acac5-ip-and-never-executes-twice-system/evidence) |
| AGENT-030 | account becoming terminal during send returns SEND_FAILED and run continues | PASS→PASS | system | R-A5-08, R-A5-16 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-030-ac-c0a98-ND-FAILED-and-run-continues-system/evidence) |
| AGENT-031 | group write error cancels current run after its step and stops future triggers | PASS→PASS | system | R-A2-11, R-A5-13, R-A5-16 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-031-gr-9663c-p-and-stops-future-triggers-system/evidence) |
| AGENT-032 | twelve distinct turns exhaust budget without a thirteenth request | PASS→PASS | system | R-A5-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-032-tw-507e6-ithout-a-thirteenth-request-system/evidence) |
| AGENT-033 | audit retries resolve before informing agent and do not consume turn budget | PASS→PASS | system | R-A5-07 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-033-au-6fd44--do-not-consume-turn-budget-system/evidence) |
| AGENT-034 | missing stop reason produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-034-mi-49d78-ory-without-assistant-block-system/evidence) |
| AGENT-035 | zero content blocks produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-035-ze-77fd4-ory-without-assistant-block-system/evidence) |
| AGENT-036 | text surrounding JSON produces BAD_JSON history without assistant block | PASS→PASS | system | R-A5-03, R-A5-04, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-agent--AGENT-036-te-2265e-ory-without-assistant-block-system/evidence) |
| API-001 | 独立公开API结构契约 | PASS→PASS | system | R-A0-03, R-A0-06, R-A3-05, R-A5-14, R-B1-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/foundation-contracts--API-001-原始主要读取接口必需字段和类型符合独立契约-system/evidence) |
| ARC-API-001 | 序列定义的独立严格输入矩阵 | PASS→PASS | system | ENG-CONTRACT-01, R-B1-02, R-A0-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-sequence-contracts--ARC-API-001-序列定义拒绝额外字段、非法类型和不连续步号-system/evidence) |
| ARC-API-002 | 序列启动的键类型边界与失败后可重试 | PASS→PASS | system | ENG-CONTRACT-01, R-B1-02, R-A0-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-sequence-contracts--ARC-API-002-启动参数拒绝类型与键错误且失败后合法请求可执行-system/evidence) |
| ARC-API-003 | 序列启动缺省变量对象兼容 | PASS→PASS | system | ENG-CONTRACT-01, R-B1-02, R-A0-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-sequence-contracts--ARC-API-003-缺省变量对象与显式空对象兼容-system/evidence) |
| ARC-UI-001 | 序列定义额外字段明确拒绝而非静默剥离 | PASS→PASS | chromium | ENG-CONTRACT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-001-序列定义额外字段明确拒绝而非静默剥离-chromium/attachments/architecture-final-40a7b0e5dff26c851368d8ac8a9f3c4c75aecf2f.png) |
| ARC-UI-002 | 非连续或重复步号在浏览器阻止提交 | PASS→PASS | chromium | ENG-CONTRACT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-002-非连续或重复步号在浏览器阻止提交-chromium/attachments/architecture-final-43877690c560e81c8cf035d400ce83edd622fae3.png) |
| ARC-UI-003 | 已登记序列尺寸边界在浏览器明确拒绝 | PASS→PASS | chromium | ENG-CONTRACT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-003-已登记序列尺寸边界在浏览器明确拒绝-chromium/attachments/architecture-final-dff9d82bfc858ab2f91c26ce5efe5f3ee0033cd7.png) |
| ARC-UI-004 | vars和stepVars非法键值不发预检或启动请求 | PASS→PASS | chromium | ENG-CONTRACT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-004-vars和stepVars非法键值不发预检或启动请求-chromium/attachments/architecture-final-a5cac9912abf1b87a601f6904457b466e77e95a2.png) |
| ARC-UI-005 | 合法序列一次保存并保留公开输入行为 | PASS→PASS | chromium | ENG-CONTRACT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-005-合法序列一次保存并保留公开输入行为-chromium/attachments/architecture-final-04c36dbe9e836b22d22fb77612a6b7dbed3a5390.png) |
| ARC-UI-006 | 序列写请求503失败不自动重放 | PASS→PASS | chromium | ENG-READ-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-006-序列写请求503失败不自动重放-chromium/attachments/architecture-final-ede147e412a1a4e2053f74e9010b945aa5d2a1f7.png) |
| ARC-UI-007 | 无后续事件或轮询时两次503后自动呈现 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-007-无后续事件或轮询时两次503后自动呈现-chromium/attachments/architecture-final-743357027e2a8f56f1219573371c055ed0d11294.png) |
| ARC-UI-008 | 权限403不形成资源请求风暴 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-008-权限403不形成资源请求风暴-chromium/attachments/architecture-final-4bb13387d66c4b4ef371a1bf81fb30dcbeebe452.png) |
| ARC-UI-009 | 429不无视限流进行通用重试 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-009-429不无视限流进行通用重试-chromium/attachments/architecture-final-743d4036d1c39a078729d31d6e2f97e51d87b905.png) |
| ARC-UI-010 | 请求校验400不自动重试 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-010-请求校验400不自动重试-chromium/attachments/architecture-final-c3f8a7e73eb493e4032c7e4034d5f1af51b98769.png) |
| ARC-UI-011 | 成功HTTP的非法响应格式不按502临时错误重试 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-011-成功HTTP的非法响应格式不按502临时错误重试-chromium/attachments/architecture-final-c900b9916df99ac42e18ff86b0bd4cb62329666d.png) |
| ARC-UI-012 | 持续暂时失败耗尽后停止自动读取 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-012-持续暂时失败耗尽后停止自动读取-chromium/attachments/architecture-final-5d1728938802f39bb29d355e661eb9046018865c.png) |
| ARC-UI-013 | 切页取消旧读取及后续退避 | PASS→PASS | chromium | ENG-READ-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-013-切页取消旧读取及后续退避-chromium/attachments/architecture-final-31e9d9c96e99f434ad77c899531a6fda56dbdc7b.png) |
| ARC-UI-014 | 换身份期间旧读取迟到不能覆盖新会话 | PASS→PASS | chromium | ENG-READ-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-014-换身份期间旧读取迟到不能覆盖新会话-chromium/attachments/architecture-final-774bb8184332ceb790c633538f1e1e643c0b2743.png) |
| ARC-UI-015 | 耗尽后显式同页刷新可开始新一轮 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-015-耗尽后显式同页刷新可开始新一轮-chromium/attachments/architecture-final-d38d03dadf84c95eba71657def9f55f2cc604ba3.png) |
| ARC-UI-016 | 错误后离页取消退避期间的后续读取 | PASS→PASS | chromium | ENG-READ-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-016-错误后离页取消退避期间的后续读取-chromium/attachments/architecture-final-f82516f16d63903fb4c265aee0bfe5716e60f5a9.png) |
| ARC-UI-017 | 在途读取期间多个实时失效合并且不能延长失败预算 | PASS→PASS | chromium | ENG-READ-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-017-在途读取期间多个实时失效合并且不能延长失败预算-chromium/attachments/architecture-final-c5b43a1b4542f1e3a8d08c9704b91ba266ac3771.png) |
| ARC-UI-018 | 网络失败及其他已登记暂时HTTP错误均可自动恢复 | PASS→PASS | chromium | ENG-READ-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-architecture--ARC-UI-018-网络失败及其他已登记暂时HTTP错误均可自动恢复-chromium/attachments/architecture-final-6ad2d5cdaed1a5741a7cdf92246738d4d9b77e32.png) |
| ARC-UI-BLK-001 | 通用资源读取失败不能提交成功快照或提前确认未呈现提醒 | PASS→PASS | chromium | ENG-READ-02, ADD-ATT-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-observation-boundaries--d3e18-001-通用账号资源读取失败不能提前确认未呈现的新状态-chromium/attachments/resource-observation-final-dd8b3a70ac4ab07904c9f285cfc17146b9228cab.png) |
| AUTH-001 | health, login and UTC account contract | PASS→PASS | system | R-A0-04, R-A0-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-001-health-login-and-UTC-account-contract-system/evidence) |
| AUTH-002 | protected reads reject missing and invalid credentials | PASS→PASS | system | R-A0-03, R-A0-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-002-protect-b1d36-ing-and-invalid-credentials-system/evidence) |
| AUTH-003 | viewer cannot execute any original business write endpoint | PASS→PASS | system | R-A0-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-003-viewer--c1eaf-nal-business-write-endpoint-system/evidence) |
| AUTH-004 | refresh token is cookie-only, HttpOnly and rotates | PASS→PASS | system | R-B3-01, R-B3-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-004-refresh-f0335-e-only-HttpOnly-and-rotates-system/evidence) |
| AUTH-005 | refresh replay revokes both new credentials immediately | PASS→PASS | system | R-B3-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-005-refresh-8e76f-new-credentials-immediately-system/evidence) |
| AUTH-006 | logout invalidates the existing access token immediately | PASS→PASS | system | R-B3-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-006-logout--1964f-ng-access-token-immediately-system/evidence) |
| AUTH-007 | access token expires at fifteen minutes (real clock) | PASS→PASS | system | R-A0-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-auth--AUTH-007-access--b0d3c-fifteen-minutes-real-clock--system/evidence) |
| BASE-001 | 全新未迁移schema拒启 | PASS→PASS | system | R-A0-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/foundation-startup--BASE-001-全新未迁移数据库拒绝正常启动-system/evidence) |
| BASE-002 | 交付声明与栈约束入口 | PASS→PASS | system | R-A0-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/foundation-startup--BASE-002-交付说明和技术依赖声明可定位-system/evidence) |
| BLK-EXT-001 | 未收到响应的发送崩溃：相同前缀下落地/不落地两个分支 | BLOCKED→BLOCKED | system | R-A2-01, R-A5-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-390f1-fabricated-two-second-bound-system/evidence) |
| BLK-EXT-002 | 建群成功响应丢失：原群身份与额外远端群核对 | BLOCKED→FAIL | system | R-A3-02, R-A2-01 | QA2716-D04；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-83d92-iled-without-another-create-system/evidence) |
| BLK-EXT-003 | promote响应丢失：角色真相与两次调用上限 | BLOCKED→FAIL | system | R-A3-02, R-A3-04 | QA2716-D05；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8943-acts-and-the-two-call-limit-system/evidence) |
| BLK-EXT-004 | kick已生效后目标重新加入：恢复不重踢 | BLOCKED→FAIL | system | R-A5-09, R-A5-11 | QA2716-D06；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-1e31b-joined-target-after-restart-system/evidence) |
| BLK-EXT-005 | 模型未执行响应丢失：允许不同合法响应且保留已持久历史 | BLOCKED→FAIL | system | R-A5-02, R-A5-11 | QA2716-D07；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-protocol-boundaries-e8352-history-and-effects-survive-system/evidence) |
| BLK-MIG-001 | 已有历史schema低于候选时明确拒启且不改变结构数据 | PASS→PASS | system | R-A0-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-fixture-boundaries--06a0b--001-历史schema明确拒启且结构与数据保持不变-system/evidence) |
| BLK-SPEC-001 | 序列在线候选过滤与已入队限流消息的账号及顺序保持 | PASS→PASS | system | R-B1-01, R-A2-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-spec-boundaries--BL-9ce46-9-keeps-its-actor-and-order-system/evidence) |
| BLK-SPEC-002 | 普通序列发送失败终止整run且重启后不发送后续步骤 | PASS→PASS | system | ADD-SEQ-FAIL-01, R-B1-07, R-B1-08, R-A2-12, R-A2-03, R-A2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence-failure-po-2defb--never-advances-later-steps-system/evidence) |
| BLK-SPEC-003 | 手动状态遵守CAS和已提交事件，离线目标产生明确disconnect效果 | PASS→PASS | system | R-A1-01, R-A1-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-spec-boundaries--BL-d6381-explicit-disconnect-effects-system/evidence) |
| BLK-SPEC-004 | 混合协议错误累计三次，合法工具业务错误清零连续计数 | PASS→PASS | system | R-A5-04, R-A5-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-spec-boundaries--BL-bc827-ess-error-resets-the-streak-system/evidence) |
| BLK-SPEC-005 | 第三次未知审计与关闭Agent重叠时合法终态稳定且不产生副作用 | PASS→PASS | system | R-A5-07, R-A5-13 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-spec-boundaries--BL-3dc74--side-effects-or-a-new-turn-system/evidence) |
| BLK-SPEC-006 | 资料版本化输入规则、工具公开schema一致性及明确字节上限 | PASS→PASS | system | ADD-META-04, R-A5-12, R-A5-15 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-spec-boundaries--BL-be9ba-ndependent-boundary-oracles-system/evidence) |
| CAP-001 | 确证容量拒绝后零远端且释放后同一步只审计/踢人一次 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-05, R-A5-07, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-c40a9--original-audited-step-once-system/evidence) |
| CAP-002 | 容量拒绝后关闭 Agent，原当前步完成后取消且无后续工作 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-13 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-3baf2-ish-and-prevents-later-work-system/evidence) |
| CAP-003 | 持续容量拒绝计入原 60 秒活动预算 | BLOCKED→BLOCKED | system | ENG-ADMISSION-01, R-A5-05, R-A5-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-4b677-without-resetting-the-clock-system/evidence) |
| CAP-004 | 容量等待期间关闭踢人政策再次检查 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-07, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-c5457-o-effect-admission-deferral-system/evidence) |
| CAP-005 | 容量等待期间群变不可写阻止迟发踢人 | PASS→PASS | system | ENG-ADMISSION-01, R-A2-11, R-A5-13 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-5c31e-cancels-without-a-late-kick-system/evidence) |
| CAP-006 | 容量等待后在线、成员与管理员资格复核 | PASS→PASS | system | ENG-ADMISSION-01, R-A1-04, R-A5-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-1b5ac-administrator-qualification-system/evidence) |
| CAP-007 | 容量等待中目标退出或重新加入后按同一用户身份完成移除且不重复 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-09, R-A5-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-ce353-ified-removed-member-result-system/evidence) |
| CAP-008 | 容量延期后真实网关群主或权限错误仍按原业务契约返回 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-45f2f-nership-or-permission-error-system/evidence) |
| CAP-009 | 容量已拒绝但 ready 持久化之前崩溃的恢复 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-479cb-run-without-replaying-audit-system/evidence) |
| CAP-010 | 已派发且2秒内收敛的504踢人遇容量压力不退回重放 | PASS→PASS | system | ENG-ADMISSION-01, R-A5-09, R-A5-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity-control--C-2769f-and-replay-the-unknown-kick-system/evidence) |
| CAP-REG-001 | 不同群同名目标的重叠 kick 保持各自审计、步骤和副作用唯一 | PASS→PASS | system | R-A5-01, R-A5-07, R-A5-08, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity--CAP-REG-0-97ac8-during-overlapping-requests-system/evidence) |
| CAP-REG-002 | 审计等待期间关闭 autoKick 后不得继续派发 | PASS→PASS | system | R-A5-07, R-A5-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity--CAP-REG-0-24249-dispatch-after-audit-passes-system/evidence) |
| CAP-REG-003 | 审计等待后重新检查执行账号在线状态 | PASS→PASS | system | R-A5-07, R-A5-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity--CAP-REG-0-d18b6--dispatching-a-stale-choice-system/evidence) |
| CAP-REG-004 | 审计等待后成员身份和管理员角色均重新检查 | PASS→PASS | system | R-A5-07, R-A5-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-capacity--CAP-REG-0-0969c-itute-for-an-eligible-actor-system/evidence) |
| DIAG-001 | 后台诊断仅管理员可读且不泄漏测试凭据或业务样本 | PASS→PASS | system | ENG-DIAG-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-diagnostics--DIAG-001--97cbd-ed-secret-and-business-data-system/evidence) |
| DOC-MAN-001 | 追加需求台账来源与状态审核 | PASS→PASS | manual | ADD-DOC-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-review/README.md) |
| EXT-001 | 群资料可选、局部编辑及简介清空 | PASS→PASS | system | ADD-META-01, ADD-META-02, ADD-META-03, ADD-META-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-001-群资料可选、名称回退基础数据、局部编辑与简介清空-system/evidence) |
| EXT-002 | viewer资料越权拒绝 | PASS→PASS | system | R-A0-05, ADD-META-01, ADD-CONFLICT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-002-viewer不能修改群资料与原值条件-system/evidence) |
| EXT-003 | 目录四字段及字面搜索 | PASS→PASS | system | ADD-DIR-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-003-名称简介及两个ID可搜索，特殊字符按字面匹配-system/evidence) |
| EXT-004 | 目录分页兼容与双向遍历 | PASS→PASS | system | ADD-DIR-01, ADD-DIR-04, ADD-DIR-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-004-原群列表数组兼容，目录默认分页与全部页面遍历-system/evidence) |
| EXT-005 | 目录输入边界与鉴权 | PASS→PASS | system | ADD-DIR-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-005-目录边界、非法查询和未经授权访问-system/evidence) |
| EXT-006 | 完整查询游标绑定 | PASS→PASS | system | ADD-DIR-05, ADD-DIR-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-006-游标绑定查询且不能跨身份绕过权限-system/evidence) |
| EXT-007 | 组合筛选先于分页 | PASS→PASS | system | ADD-DIR-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-007-群状态和Agent开关组合先过滤再分页-system/evidence) |
| EXT-008 | 同字段并发原值竞争 | PASS→PASS | system | ADD-CONFLICT-01, ADD-CONFLICT-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-008-同字段竞争只一成功，冲突返回当前快照-system/evidence) |
| EXT-009 | 冲突请求无部分副作用 | PASS→PASS | system | ADD-CONFLICT-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-009-冲突整请求无资料和开关副作用-system/evidence) |
| EXT-010 | 异字段并发及旧请求兼容 | PASS→PASS | system | ADD-CONFLICT-03, ADD-META-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-010-不同字段编辑共存，旧调用继续兼容-system/evidence) |
| EXT-011 | null原值与非法条件 | PASS→PASS | system | ADD-CONFLICT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-011-null原值可比较，原值不trim，错误条件组合拒绝-system/evidence) |
| EXT-012 | 资料跨重启持久性 | PASS→PASS | system | ADD-META-03, ADD-META-04, ADD-CONFLICT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/extensions-api--EXT-012-资料创建时间与条件更新跨重启保留-system/evidence) |
| GROUP-001 | creation validates members and online status before external effects | PASS→PASS | system | R-A3-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-001-crea-bab5d-tus-before-external-effects-system/evidence) |
| GROUP-002 | asynchronous creation materializes creator and event-confirmed roles | PASS→PASS | system | R-A3-01, R-A3-02, R-A3-03, R-A3-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-002-asyn-4153c-r-and-event-confirmed-roles-system/evidence) |
| GROUP-003 | accepted join without member_joined fails after ten seconds | PASS→PASS | system | R-A3-03, R-A3-04, R-A3-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-003-acce-e35fe-ned-fails-after-ten-seconds-system/evidence) |
| GROUP-004 | invite readiness is respected without retry resetting the wait | PASS→PASS | system | R-B2-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-004-invi-3b2e6-ut-retry-resetting-the-wait-system/evidence) |
| GROUP-005 | expired invitation is refreshed once and joining succeeds | PASS→PASS | system | R-B2-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-005-expi-2c9bb-d-once-and-joining-succeeds-system/evidence) |
| GROUP-006 | leave-all removes service accounts with creator strictly last | PASS→PASS | system | R-B2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-006-leav-94891--with-creator-strictly-last-system/evidence) |
| GROUP-007 | failed noncreator leave preserves owner and continues remaining accounts | PASS→PASS | system | R-B2-04, R-A3-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-007-fail-60c20-ontinues-remaining-accounts-system/evidence) |
| GROUP-008 | member rows wait for actual joined event before promotion | PASS→PASS | system | R-A3-03, R-A3-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-008-memb-324f6-ined-event-before-promotion-system/evidence) |
| GROUP-009 | ALREADY_MEMBER confirms existing membership without waiting for another event | PASS→PASS | system | R-B2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-009-ALRE-3ccd5-t-waiting-for-another-event-system/evidence) |
| GROUP-010 | leave-all preserves public external members and keeps left groups inactive | PASS→PASS | system | R-B2-04, ADD-LEFT-MEMBERS-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-groups--GROUP-010-leav-d0f9c--keeps-left-groups-inactive-system/evidence) |
| INT-ACCOUNT-001 | 远端成功后的局部保存暂错在原事务恢复，新断开不被旧连接覆盖 | PASS→PASS | system | R-A1-03, R-A1-05, R-A1-07, R-A1-08, ENG-ACCOUNT-RECOVERY-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-runtime-87a64-n-before-a-newer-disconnect-system/evidence) |
| INT-ACCOUNT-002 | 持续本地保存失败显式回滚，无虚假状态事件或远端自动重放 | PASS→PASS | system | R-A1-05, R-A1-07, ENG-ACCOUNT-RECOVERY-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-runtime-9f043--or-automatic-remote-replay-system/evidence) |
| INT-ACT-001 | 安全阶段重启累计活动预算、恢复归因与完整尾段真值 | FAIL→FAIL | system | R-A5-06, R-A5-11 | QA2716-D01；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-runtime-5f6a1-time-without-tail-tolerance-system/evidence) |
| INT-DIAG-002 | 真实tick失败、进行中保持与恢复诊断及错误样本脱敏 | PASS→PASS | system | ENG-DIAG-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-runtime-76161-hful-restricted-diagnostics-system/evidence) |
| INT-MSG-001 | 旧404跨过2秒确认窗不能否定已真实落地消息 | PASS→PASS | system | R-A2-03, R-A2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-2c24f-cannot-negate-a-landed-send-system/evidence) |
| INT-MSG-002 | 真实查询响应持续延迟跨5秒后仍unknown并按恢复2秒收敛 | PASS→PASS | system | R-A2-03, R-A2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-effdf-d-recover-on-real-responses-system/evidence) |
| INT-MSG-003 | 慢但可用的确认查询仍从最初504计五秒 | PASS→PASS | system | R-A2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-1235f-timed-from-the-original-504-system/evidence) |
| INT-MSG-004 | 查询503恢复成慢200后仍保留原两秒判定 | PASS→PASS | system | R-A2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-ecaa1-e-original-two-second-bound-system/evidence) |
| INT-MSG-005 | 同一确认以不同eventId迟到并在公开提交后重启不改排期 | PASS→PASS | system | R-B1-07, R-B1-09, R-A2-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-028ef-uence-timing-across-restart-system/evidence) |
| INT-MSG-006 | 已识别504后延迟本地保存仍从原接收起按5秒确定状态 | PASS→PASS | system | R-A2-01, R-A2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-2a93a-t-origin-across-local-delay-system/evidence) |
| INT-MSG-007 | 单实例首次确认已观察但INSERT未发出时崩溃的排期时间保留 | FAIL→FAIL | system | R-A2-01, R-A2-08, R-B1-07, R-B1-09 | QA2716-D03；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-64129--original-scheduling-origin-system/evidence) |
| INT-MSG-008 | receipt自动提交已确认但业务未应用时崩溃后复用首次时间 | PASS→PASS | system | R-A2-01, R-A2-08, R-B1-07, R-B1-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-message-26779-tities-without-rescheduling-system/evidence) |
| INT-STREAM-001 | 真实暂停TCP读取与健康消费者并行、按实际已收游标重放 | PASS→PASS | system | ENG-STREAM-01, R-A4-03, R-A4-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-streams-344ee-ived-cursor-replay-complete-system/evidence) |
| INT-STREAM-002 | 续页改变页大小并交错发送确认、历史补投与新消息，冻结集合内容保持 | PASS→PASS | system | ENG-STREAM-01, R-A4-01, R-A4-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-integration-streams-a7924--confirmations-and-backfill-system/evidence) |
| MAN-DELIVERY-001 | 接收方核对仓库Git历史及版本对应 | PASS→PASS | manual | R-DELIVERY-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-review/README.md) |
| MAN-DELIVERY-002 | 接收方只依README在全新隔离环境复现启动 | PASS→PASS | manual | R-DELIVERY-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-review/README.md) |
| MAN-FOCUS-001 | 真实失焦与浏览器标签标题favicon呈现 | BLOCKED→BLOCKED | manual | ADD-ATT-02, ADD-ATT-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-limitations/assessment.json) |
| MAN-IME-001 | 真实操作系统中文输入法不触发中间查询 | BLOCKED→BLOCKED | manual | ADD-DIR-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-limitations/assessment.json) |
| MAN-UX-001 | 操作员能识别阻断、失败与账号/群角色含义 | BLOCKED→BLOCKED | manual | R-A6-03, ADD-COPY-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/manual-limitations/assessment.json) |
| MSG-001 | accepted is observable until message_sent and own echo stays one row | PASS→PASS | system | R-A2-01, R-A2-02, R-A2-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-001-acce-3d9ff--and-own-echo-stays-one-row-system/evidence) |
| MSG-002 | rate limiting blocks all account sends until deadline and preserves FIFO | PASS→PASS | system | R-A2-09, R-A1-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-002-rate-d82ec-deadline-and-preserves-FIFO-system/evidence) |
| MSG-003 | terminal marking cancels queued sends and removes member atomically | PASS→PASS | system | R-A1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-003-term-c5199-d-removes-member-atomically-system/evidence) |
| MSG-004 | 504 that lands within two seconds is reconciled without resending | PASS→PASS | system | R-A2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-004-504--7bdc4-econciled-without-resending-system/evidence) |
| MSG-005 | absent 504 permits at most one retry after the two-second uncertainty window | PASS→PASS | system | R-A2-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-005-abse-dd569-o-second-uncertainty-window-system/evidence) |
| MSG-006 | unavailable confirmation preserves unknown until recovery | PASS→PASS | system | R-A2-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-006-unav-ec155-rves-unknown-until-recovery-system/evidence) |
| MSG-007 | synchronous ACCOUNT_SUSPENDED applies terminal consequences without relying on events | PASS→PASS | system | R-A2-10, R-A1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-007-sync-2f6d2-s-without-relying-on-events-system/evidence) |
| MSG-008 | synchronous SESSION_EXPIRED applies terminal consequences without relying on events | PASS→PASS | system | R-A2-10, R-A1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-008-sync-6403e-s-without-relying-on-events-system/evidence) |
| MSG-009 | SENDER_NOT_IN_GROUP only fails that message | PASS→PASS | system | R-A2-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-009-SEND-ff1ce-OUP-only-fails-that-message-system/evidence) |
| MSG-010 | ACCOUNT_OFFLINE only fails that message | PASS→PASS | system | R-A2-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-010-ACCO-72e5d-INE-only-fails-that-message-system/evidence) |
| MSG-011 | incoming duplicate and out-of-order historical messages are merged and sorted | PASS→PASS | system | R-A2-05, R-A4-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-011-inco-9fa19-sages-are-merged-and-sorted-system/evidence) |
| MSG-012 | snapshot cursor traversal has no omission or duplicates under concurrent writes | PASS→PASS | system | R-A4-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-012-snap-75006-tes-under-concurrent-writes-system/evidence) |
| MSG-013 | manual send validates unavailable account and nonmember before enqueue | PASS→PASS | system | R-A2-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-013-manu-cfd11-nd-nonmember-before-enqueue-system/evidence) |
| MSG-014 | leaving rate_limited manually prevents stale timer resurrection | PASS→PASS | system | R-A1-06, R-A1-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-014-leav-31a75-ts-stale-timer-resurrection-system/evidence) |
| MSG-015 | asynchronous message_failed applies ACCOUNT_SUSPENDED consequences | PASS→PASS | system | R-A2-02, R-A2-10, R-A1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-015-asyn-48e10-OUNT-SUSPENDED-consequences-system/evidence) |
| MSG-016 | asynchronous message_failed applies GROUP_WRITE_FORBIDDEN consequences | PASS→PASS | system | R-A2-02, R-A2-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-016-asyn-9e75e-RITE-FORBIDDEN-consequences-system/evidence) |
| MSG-017 | message echo arriving before confirmation still merges one own row | PASS→PASS | system | R-A2-01, R-A2-05, R-A2-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-017-mess-7fd8e-on-still-merges-one-own-row-system/evidence) |
| MSG-018 | terminal event removes account and cancels its queue across every group | PASS→PASS | system | R-A1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-messages--MSG-018-term-40dfa-ts-queue-across-every-group-system/evidence) |
| REC-001 | SSE reconnect recovers all retained events once including out-of-order delivery | PASS→PASS | system | R-A2-08, R-A2-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-001-S-594e6-uding-out-of-order-delivery-system/evidence) |
| REC-002 | hard process restart recovers events produced while stopped | PASS→PASS | system | R-A2-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-002-h-716ae-ents-produced-while-stopped-system/evidence) |
| REC-003 | database write outage loses no event and produces inconsistency notice | PASS→PASS | system | R-A2-07 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-003-d-13086-oduces-inconsistency-notice-system/evidence) |
| REC-004 | crash after send effect before response never duplicates gateway delivery | PASS→PASS | system | R-A2-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-004-c-0b2d7-duplicates-gateway-delivery-system/evidence) |
| REC-005 | sequence restart reschedules only earliest overdue step and spaces subsequent sends | PASS→PASS | system | R-B1-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-005-s-678f5-and-spaces-subsequent-sends-system/evidence) |
| REC-006 | agent restarts with same run id and reconciles already-sent tool effect | PASS→PASS | system | R-A5-11, R-A2-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-006-a-00f5a-es-already-sent-tool-effect-system/evidence) |
| REC-007 | agent restart after kick effect uses membership reconciliation without repeating kick | FAIL→FAIL | system | R-A5-11, R-A5-09 | QA2716-D06；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-007-a-acffc-tion-without-repeating-kick-system/evidence) |
| REC-008 | repeated migration preserves data and schema version | PASS→PASS | system | R-A0-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-recovery--REC-008-r-b7604-ves-data-and-schema-version-system/evidence) |
| SEQ-001 | variables inherit latest nonempty override with original source | PASS→PASS | system | R-B1-03, R-B1-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-001-v-61909-erride-with-original-source-system/evidence) |
| SEQ-002 | all-step preflight rejects step three and leaves no running record or send | PASS→PASS | system | R-B1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-002-a-343a1-s-no-running-record-or-send-system/evidence) |
| SEQ-003 | simultaneous starts admit exactly one sequence run | PASS→PASS | system | R-B1-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-003-s-afb42-it-exactly-one-sequence-run-system/evidence) |
| SEQ-004 | admin preferred and member selected lexicographically | PASS→PASS | system | R-B1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-004-a-9f019--selected-lexicographically-system/evidence) |
| SEQ-005 | next delay begins at actual sent event, not acceptance | PASS→PASS | system | R-B1-07 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-005-n-3079e-l-sent-event-not-acceptance-system/evidence) |
| SEQ-006 | unavailable member step is skipped with timestamp and progress continues | PASS→PASS | system | R-B1-01, R-B1-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-006-u-9f320-tamp-and-progress-continues-system/evidence) |
| SEQ-007 | rate-limited role waits rather than skips and preserves later delays | PASS→PASS | system | R-B1-01, R-B1-07, R-A2-09 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-007-r-84c76--and-preserves-later-delays-system/evidence) |
| SEQ-008 | group write prohibition stops sequence while account remains online | PASS→PASS | system | R-A2-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-008-g-33cbd-hile-account-remains-online-system/evidence) |
| SEQ-009 | placeholder grammar includes letters digits underscore and leaves other braces literal | PASS→PASS | system | R-B1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-009-p-fcf60-leaves-other-braces-literal-system/evidence) |
| SEQ-010 | terminal account skips its queued sequence step and advances progress | PASS→PASS | system | R-A1-04, R-B1-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-sequence--SEQ-010-t-7a25a--step-and-advances-progress-system/evidence) |
| STATE-041 | validation precedence and stale expectedFrom are explicit | PASS→PASS | system | R-A1-03, R-A0-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-041-va-c02a4-e-expectedFrom-are-explicit-system/evidence) |
| STATE-042 | concurrent compare-and-swap has one winner | PASS→PASS | system | R-A1-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-042-co-e1609-are-and-swap-has-one-winner-system/evidence) |
| STATE-043 | reconnect retains stable gateway identity | PASS→PASS | system | R-A1-07, R-A1-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-043-re-f9202-ins-stable-gateway-identity-system/evidence) |
| STATE-044 | repeated suspended events preserve processing and cannot reconnect | PASS→PASS | system | R-A1-02, R-A1-04, R-A2-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-044-re-8fc85-essing-and-cannot-reconnect-system/evidence) |
| STATE-045 | repeated session_expired events preserve processing and cannot reconnect | PASS→PASS | system | R-A1-02, R-A1-04, R-A2-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-045-re-36150-essing-and-cannot-reconnect-system/evidence) |
| STATE-11 | state transition idle to idle | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-11-state-transition-idle-to-idle-system/evidence) |
| STATE-12 | state transition idle to online | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-12-state-transition-idle-to-online-system/evidence) |
| STATE-13 | state transition idle to rate_limited | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-13-state-transition-idle-to-rate-limited-system/evidence) |
| STATE-14 | state transition idle to disconnected | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-14-state-transition-idle-to-disconnected-system/evidence) |
| STATE-15 | state transition idle to suspended | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-15-state-transition-idle-to-suspended-system/evidence) |
| STATE-16 | state transition idle to session_expired | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-16-sta-72bd2-ion-idle-to-session-expired-system/evidence) |
| STATE-21 | state transition online to idle | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-21-state-transition-online-to-idle-system/evidence) |
| STATE-22 | state transition online to online | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-22-state-transition-online-to-online-system/evidence) |
| STATE-23 | state transition online to rate_limited | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-23-sta-c5616-tion-online-to-rate-limited-system/evidence) |
| STATE-24 | state transition online to disconnected | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-24-sta-a103c-tion-online-to-disconnected-system/evidence) |
| STATE-25 | state transition online to suspended | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-25-state-transition-online-to-suspended-system/evidence) |
| STATE-26 | state transition online to session_expired | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-26-sta-8537e-n-online-to-session-expired-system/evidence) |
| STATE-31 | state transition rate_limited to idle | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-31-state-transition-rate-limited-to-idle-system/evidence) |
| STATE-32 | state transition rate_limited to online | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-32-sta-927f7-tion-rate-limited-to-online-system/evidence) |
| STATE-33 | state transition rate_limited to rate_limited | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-33-sta-d2ff2-ate-limited-to-rate-limited-system/evidence) |
| STATE-34 | state transition rate_limited to disconnected | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-34-sta-5b9d0-ate-limited-to-disconnected-system/evidence) |
| STATE-35 | state transition rate_limited to suspended | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-35-sta-d21bb-n-rate-limited-to-suspended-system/evidence) |
| STATE-36 | state transition rate_limited to session_expired | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-36-sta-952be--limited-to-session-expired-system/evidence) |
| STATE-41 | state transition disconnected to idle | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-41-state-transition-disconnected-to-idle-system/evidence) |
| STATE-42 | state transition disconnected to online | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-42-sta-48d8c-tion-disconnected-to-online-system/evidence) |
| STATE-43 | state transition disconnected to rate_limited | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-43-sta-19ac8-isconnected-to-rate-limited-system/evidence) |
| STATE-44 | state transition disconnected to disconnected | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-44-sta-80d78-isconnected-to-disconnected-system/evidence) |
| STATE-45 | state transition disconnected to suspended | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-45-sta-96411-n-disconnected-to-suspended-system/evidence) |
| STATE-46 | state transition disconnected to session_expired | PASS→PASS | system | R-A1-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-46-sta-584ba-onnected-to-session-expired-system/evidence) |
| STATE-51 | state transition suspended to idle | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-51-state-transition-suspended-to-idle-system/evidence) |
| STATE-52 | state transition suspended to online | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-52-state-transition-suspended-to-online-system/evidence) |
| STATE-53 | state transition suspended to rate_limited | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-53-sta-bd079-n-suspended-to-rate-limited-system/evidence) |
| STATE-54 | state transition suspended to disconnected | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-54-sta-88d72-n-suspended-to-disconnected-system/evidence) |
| STATE-55 | state transition suspended to suspended | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-55-sta-41920-tion-suspended-to-suspended-system/evidence) |
| STATE-56 | state transition suspended to session_expired | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-56-sta-9f177-uspended-to-session-expired-system/evidence) |
| STATE-61 | state transition session_expired to idle | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-61-sta-38783-ion-session-expired-to-idle-system/evidence) |
| STATE-62 | state transition session_expired to online | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-62-sta-0fcc1-n-session-expired-to-online-system/evidence) |
| STATE-63 | state transition session_expired to rate_limited | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-63-sta-597fe-ion-expired-to-rate-limited-system/evidence) |
| STATE-64 | state transition session_expired to disconnected | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-64-sta-1be7e-ion-expired-to-disconnected-system/evidence) |
| STATE-65 | state transition session_expired to suspended | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-65-sta-e5db9-ession-expired-to-suspended-system/evidence) |
| STATE-66 | state transition session_expired to session_expired | PASS→PASS | system | R-A1-01, R-A1-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-accounts--STATE-66-sta-d9cf0--expired-to-session-expired-system/evidence) |
| UI-001 | viewer登录后各页不提供业务写入口 | PASS→PASS | chromium, firefox-smoke, webkit-smoke | R-A6-01, R-A0-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-001-viewer通过浏览器登录且各页无写入口-compat-chromium/attachments/ui-final-screenshot-ca48d8dd9885e41f9cc789e423853ff658bf2c35.png) |
| UI-002 | 账号状态与合法操作实时更新 | PASS→PASS | chromium | R-A6-02, ADD-COPY-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-002-账号状态实时显示且操作符合当前状态-chromium/attachments/ui-final-screenshot-ded72074be09c27b77694e12f32c0f0395ea1174.png) |
| UI-003 | 群角色及消息回流只显示一行 | PASS→PASS | chromium, firefox-smoke, webkit-smoke | R-A6-03, R-A4-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-003-群详情显示角色和实时消息，回流不重复-compat-chromium/attachments/ui-final-screenshot-1dff5ceeb4f769bda39c31d77e7ed65ed0d09e6a.png) |
| UI-004 | 页面显示accepted到sent | PASS→PASS | chromium | R-A6-03, R-A2-02, R-A4-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-004-自发消息展示accepted到sent且保持一行-chromium/attachments/ui-final-screenshot-b0d7bbff4bc4cd80cc816620a1062f0db54e9c52.png) |
| UI-005 | 历史分页和实时新增合并 | PASS→PASS | chromium | R-A4-01, R-A4-02, R-A6-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-005-加载更早与实时新增按消息身份合并-chromium/attachments/ui-final-screenshot-77fe379933d274694d36407723ed4f2867f761c9.png) |
| UI-006 | 前端断线3秒内补齐 | PASS→PASS | chromium, firefox-smoke, webkit-smoke | R-B4-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-006-浏览器断线恢复后3秒内补齐-compat-chromium/attachments/ui-final-screenshot-0f6b65b5e642ab8b9cee3c80813622485545b2b0.png) |
| UI-007 | 审计阻断显示在群运行列表 | PASS→PASS | chromium | R-A6-03, R-A5-07 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-007-审计阻断在群运行列表醒目可见-chromium/attachments/ui-final-screenshot-584a28cf3c8526b7fb4677e6b15767d591aa5fab.png) |
| UI-008 | 登录至Agent步骤详情完整旅程 | PASS→PASS | chromium, firefox-smoke, webkit-smoke | R-B4-02, R-A5-14 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-008-登录到群再到Agent步骤，错误原文和审计结果可读-compat-chromium/attachments/ui-final-screenshot-11a4bf816009270ccbbb8e007504451494ef9603.png) |
| UI-009 | 序列预检变量继承与来源 | PASS→PASS | chromium | R-B1-03, R-B1-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-009-序列预检展示继承与来源，确认后才启动-chromium/attachments/ui-final-screenshot-e2a046b2605f17023d3402898282e1b329be70d1.png) |
| UI-010 | 序列预检错误定位 | PASS→PASS | chromium | R-B1-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-010-序列预检缺值显示步骤与key且零发送-chromium/attachments/ui-final-screenshot-ab45c954463b297d63574d79419fcbd37ba0c6ce.png) |
| UI-011 | 前端并发401单次续期 | PASS→PASS | chromium | R-B3-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-011-多个页面请求同时401只续期一次并恢复加载-chromium/attachments/ui-final-screenshot-ec93fd2ae347441deba43014f6630847b4b85262.png) |
| UI-012 | 群资料纯文本呈现 | PASS→PASS | chromium | ADD-META-01, ADD-META-02, ADD-DIR-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-012-群名称简介按纯文本显示且日期不随编辑变化-chromium/attachments/ui-final-screenshot-41d138fcd717e6ceeea8c2516c217ab420c3e068.png) |
| UI-013 | 编辑表单dirty关闭保护 | PASS→PASS | chromium | ADD-FORM-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-013-编辑表单未改直接关闭，dirty可继续或放弃-chromium/attachments/ui-final-screenshot-7ec2a720e30a4817bdfcebafe2c47b06879fb290.png) |
| UI-014 | 提交中保护及失败保留草稿 | PASS→PASS | chromium | ADD-FORM-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-014-提交中关闭受限，失败保留输入且不重放写入-chromium/attachments/ui-final-screenshot-90cdc31e973a7c45685f24f0606289dfb2374c18.png) |
| UI-015 | 冲突必须明确再次确认 | PASS→PASS | chromium | ADD-CONFLICT-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-015-同字段冲突保留草稿，明确再确认才提交-chromium/attachments/ui-final-screenshot-f7d3b5a9a57792de9d9e54f92e5cdb8098f15cd1.png) |
| UI-016 | 搜索迟到响应隔离 | PASS→PASS | chromium | ADD-DIR-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-016-搜索旧响应不能覆盖新条件且不抢焦点-chromium/attachments/ui-final-screenshot-498dc53b65b0c33384cf09eff296da5840c5b662.png) |
| UI-017 | 多页过期和原子刷新 | PASS→PASS | chromium | ADD-DIR-08, ADD-ATT-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-017-多页过期禁止旧游标，失败保留列表，成功整体换首页-chromium/attachments/ui-final-screenshot-c29f643e78e3ae68197ac45d690facb439533ce8.png) |
| UI-018 | 组合筛选clear与reset | PASS→PASS | chromium | ADD-DIR-12 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-018-目录组合筛选、清关键词与重置含义不同-chromium/attachments/ui-final-screenshot-9f1facbe13b3874ea26532edb65de4aefb1c90ce.png) |
| UI-019 | 首次错误与成功空结果区分 | PASS→PASS | chromium | ADD-DIR-10 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-019-初次失败可重试，成功空搜索不冒充加载错误-chromium/attachments/ui-final-screenshot-c8600ac4cfdbc1520fabce4a3597b60eb6838756.png) |
| UI-020 | 失焦提醒和呈现后确认 | PASS→PASS | chromium | ADD-ATT-01, ADD-ATT-02, ADD-ATT-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-020-当前群失焦只提示相关更新，聚焦本身不确认-chromium/attachments/ui-final-screenshot-bda32483d08217a280207b4db0b75dd2d7d1e421.png) |
| UI-021 | 路由范围销毁 | PASS→PASS | chromium | ADD-ATT-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-021-离开群详情销毁提醒范围，旧群变化不污染新页-chromium/attachments/ui-final-screenshot-af902e2cd5e83f8f36ca049dd527a7896a3c72fa.png) |
| UI-022 | 创建表单关闭保护 | PASS→PASS | chromium | ADD-FORM-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-022-创建群表单同样执行未保存关闭保护-chromium/attachments/ui-final-screenshot-5a3803074f798c09c59cefd5d29df425e711d9b8.png) |
| UI-023 | 简介两行纯文本摘要与完整详情 | PASS→PASS | chromium | ADD-DIR-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-023-简介摘要最多两行纯文本、详情完整且空简介无占位-chromium/attachments/ui-final-screenshot-d1b420761ef234267734ec9e4d842e0deafbd840.png) |
| UI-024 | 单页五秒轮询及并发失效合并 | PASS→PASS | chromium | ADD-DIR-07, ADD-DIR-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-024-单页五秒刷新、并发失效合并且无关消息不遍历目录-chromium/attachments/ui-final-screenshot-a109378e23f620dc3dd49f171d33b498f81f0b12.png) |
| UI-025 | 返回恢复内存条件分页位置及刷新清空 | PASS→PASS | chromium | ADD-DIR-09, ADD-DIR-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-025-同标签返回保留条件与已加载页，整页刷新清空目录内存-chromium/attachments/ui-final-screenshot-a2f13409b1ef0fca3d8b0ee5804db017c5363749.png) |
| UI-026 | 注销换身份清除目录会话状态 | PASS→PASS | chromium | ADD-DIR-09, R-A6-01 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-026-注销后更换身份不复用上一会话目录条件-chromium/attachments/ui-final-screenshot-703a894e5b1c478b36d916dd2e5684e74fb6e328.png) |
| UI-027 | 浏览器composition不发中间查询 | PASS→PASS | chromium | ADD-DIR-11 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-027-composition期间不查询中间文本，确认后只查完成词且不抢焦点-chromium/attachments/ui-final-screenshot-0ec09a3a3a3762547b6a288085c58dc93e52a9ee.png) |
| UI-028 | 前台安静与失焦静态标题favicon | PASS→PASS | chromium | ADD-ATT-02, ADD-ATT-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/attachments/ui-final-screenshot-55d3bb3bc16f1c6e86ff51176df51444c357bdd4.png) |
| UI-029 | 加载失败不冒称已确认 | PASS→PASS | chromium | ADD-ATT-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-029-内容加载失败不能确认，成功呈现后相关操作才清提醒-chromium/attachments/ui-final-screenshot-e896de73dd240139f98131b7a721937613ffd738.png) |
| UI-030 | 列表范围消失的两阶段确认 | PASS→PASS | chromium | ADD-ATT-01, ADD-ATT-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/attachments/ui-final-screenshot-55637920d61570bb7fac116e4f4cea49872a52d1.png) |
| UI-031 | 变化后回原值保留期间变化候选 | PASS→PASS | chromium | ADD-ATT-04 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-031-状态先改变后还原仍保留期间变化候选-chromium/attachments/ui-final-screenshot-c24ec3f4734a190b64cbdf136ee4d6223c8d92df.png) |
| UI-032 | 提醒确认不改变刷新后的分页资格或恢复旧分页链 | PASS→PASS | chromium | ADD-ATT-05, ADD-DIR-08 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-032-提醒确认不改变刷新后的分页资格或恢复旧分页链-chromium/attachments/ui-final-screenshot-96214a9b7dc37c3d9bc345b68d73e3e652fb040f.png) |
| UI-033 | 本地手动clientMsgId及早回流归属 | PASS→PASS | chromium | ADD-ATT-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-033-本地手动发送先带clientMsgId，回流早于响应不误标远端未读-chromium/attachments/ui-final-screenshot-68031ab6154ba095d268fc7795c3caf7c8adba2a.png) |
| UI-034 | Agent自动消息失焦提醒 | PASS→PASS | chromium | ADD-ATT-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-034-Agent自己的自动消息仍参与失焦提醒-chromium/attachments/ui-final-screenshot-e2a90fa56ea834974b438d4122b650b5d2023e37.png) |
| UI-035 | 序列自动消息失焦提醒 | PASS→PASS | chromium | ADD-ATT-06 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-035-序列自动发送不因isOwn被排除提醒-chromium/attachments/ui-final-screenshot-de94d4dc2c93faae53b8326d27287bac7d4562ca.png) |
| UI-036 | 编辑卸载迟到结果隔离 | PASS→PASS | chromium | ADD-FORM-02 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/ui-console--UI-036-编辑卸载后迟到成功不能污染新页面或重放提交-chromium/attachments/ui-final-screenshot-62796b5f9a166c3ab66d5ccd5fac868cef770c8f.png) |
| UI-037 | 目录微秒及同时间ID跨页边界的确定性数据夹具 | PASS→PASS | system | ADD-DIR-01, ADD-DIR-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/system-fixture-boundaries--UI-037-确定性微秒与同时间ID夹具双向跨页无遗漏重复-system/evidence) |
| WS-001 | business events start after auth and have strictly increasing global seq | PASS→PASS | system | R-A4-03, R-A4-04, R-A1-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-realtime--WS-001-busin-a8408-ictly-increasing-global-seq-system/evidence) |
| WS-002 | unauthenticated and invalid-token sockets receive no business events | PASS→PASS | system | R-A4-03 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-realtime--WS-002-unaut-9e40b--receive-no-business-events-system/evidence) |
| WS-003 | account_terminal is published only after terminal state and cleanup | PASS→PASS | system | R-A4-04, R-A1-04, R-A1-05 | —；[本次证据](../../runs/2026-10-01T14-26-25.068Z-1e0cb38a/artifacts/api-realtime--WS-003-accou-443bf--terminal-state-and-cleanup-system/evidence) |

## 需求追踪

{'PASS': 97, 'BLOCKED': 7, 'FAIL': 12}。任一必验FAIL则该需求FAIL，否则有BLOCKED则BLOCKED；不按多数票。

| 需求 | 标题 | 原始→审定 | 用例 |
|---|---|---|---|
| ADD-ATT-01 | 提醒限定当前页面上下文 | PASS→PASS | UI-020, UI-021, UI-030 |
| ADD-ATT-02 | 前台安静失焦静态提醒 | BLOCKED→BLOCKED | MAN-FOCUS-001, UI-020, UI-028 |
| ADD-ATT-03 | 成功呈现及真实操作才确认 | BLOCKED→BLOCKED | ARC-UI-BLK-001, MAN-FOCUS-001, UI-020, UI-028, UI-029 |
| ADD-ATT-04 | 范围变化确认与历史变化保留 | PASS→PASS | UI-030, UI-031 |
| ADD-ATT-05 | 目录过期与提醒独立 | PASS→PASS | UI-017, UI-032 |
| ADD-ATT-06 | 本地手动身份与自动消息提醒 | PASS→PASS | UI-033, UI-034, UI-035 |
| ADD-CONFLICT-01 | 资料原值条件请求 | PASS→PASS | EXT-002, EXT-008, EXT-011, EXT-012 |
| ADD-CONFLICT-02 | 同字段原子冲突零副作用 | PASS→PASS | EXT-008, EXT-009 |
| ADD-CONFLICT-03 | 异字段与旧请求兼容 | PASS→PASS | EXT-010 |
| ADD-CONFLICT-04 | 冲突草稿与明确再确认 | PASS→PASS | UI-015 |
| ADD-COPY-01 | 账号与角色文案明确 | BLOCKED→BLOCKED | MAN-UX-001, UI-002 |
| ADD-DIR-01 | 创建时间排序切换 | PASS→PASS | EXT-004, UI-037 |
| ADD-DIR-02 | 四字段字面搜索 | PASS→PASS | EXT-003 |
| ADD-DIR-03 | 两行纯文本简介摘要 | PASS→PASS | UI-012, UI-023 |
| ADD-DIR-04 | 兼容独立目录接口 | PASS→PASS | EXT-004, EXT-005 |
| ADD-DIR-05 | 微秒游标及完整查询绑定 | PASS→PASS | EXT-006, UI-037 |
| ADD-DIR-06 | 目录静态遍历与加载计数 | PASS→PASS | EXT-004, UI-025 |
| ADD-DIR-07 | 单页有界刷新 | PASS→PASS | UI-024 |
| ADD-DIR-08 | 多页过期与整体刷新 | PASS→PASS | UI-017, UI-032 |
| ADD-DIR-09 | 列表返回内存及身份隔离 | PASS→PASS | UI-025, UI-026 |
| ADD-DIR-10 | 加载失败和空结果区分 | PASS→PASS | UI-019 |
| ADD-DIR-11 | 输入法与迟到响应 | BLOCKED→BLOCKED | MAN-IME-001, UI-016, UI-024, UI-027 |
| ADD-DIR-12 | 群状态与Agent设置筛选 | PASS→PASS | EXT-006, EXT-007, UI-018 |
| ADD-DOC-01 | 独立变更台账 | PASS→PASS | DOC-MAN-001 |
| ADD-FORM-01 | 两处表单未保存关闭确认 | PASS→PASS | UI-013, UI-022 |
| ADD-FORM-02 | 提交关闭保护及迟到结果 | PASS→PASS | UI-014, UI-036 |
| ADD-LEFT-MEMBERS-01 | 退群完成后公开保留外部成员 | PASS→PASS | GROUP-010 |
| ADD-META-01 | 可选群名称 | PASS→PASS | EXT-001, EXT-002, UI-012 |
| ADD-META-02 | 群简介编辑与清空 | PASS→PASS | EXT-001, UI-012 |
| ADD-META-03 | 真实创建时间 | PASS→PASS | EXT-001, EXT-012 |
| ADD-META-04 | 资料旧数据和局部更新兼容 | PASS→PASS | BLK-SPEC-006, EXT-001, EXT-010, EXT-012 |
| ADD-SEQ-FAIL-01 | 普通序列发送失败终止后续步骤 | PASS→PASS | BLK-SPEC-002 |
| ENG-ACCOUNT-RECOVERY-01 | 已知远端成功后的原事务本地保存恢复 | PASS→PASS | INT-ACCOUNT-001, INT-ACCOUNT-002 |
| ENG-ADMISSION-01 | 容量拒绝与实体冲突的正确语义 | BLOCKED→BLOCKED | CAP-001, CAP-002, CAP-003, CAP-004, CAP-005, CAP-006, CAP-007, CAP-008, CAP-009, CAP-010 |
| ENG-CONTRACT-01 | 序列请求契约在前后端一致且兼容 | PASS→PASS | ARC-API-001, ARC-API-002, ARC-API-003, ARC-UI-001, ARC-UI-002, ARC-UI-003, ARC-UI-004, ARC-UI-005 |
| ENG-DIAG-01 | 已交付后台诊断的管理员权限与脱敏边界 | PASS→PASS | DIAG-001, INT-DIAG-002 |
| ENG-READ-01 | 缺少后续触发时暂时读取失败可有界恢复 | PASS→PASS | ARC-UI-007, ARC-UI-008, ARC-UI-009, ARC-UI-010, ARC-UI-011, ARC-UI-012, ARC-UI-015, ARC-UI-018 |
| ENG-READ-02 | 读取恢复保持取消、会话隔离和读写边界 | PASS→PASS | ARC-UI-006, ARC-UI-013, ARC-UI-014, ARC-UI-016, ARC-UI-017, ARC-UI-BLK-001 |
| ENG-STREAM-01 | 慢接收者隔离与已收游标恢复的版本化契约 | PASS→PASS | INT-STREAM-001, INT-STREAM-002 |
| R-A0-01 | 迁移可重复执行 | PASS→PASS | REC-008 |
| R-A0-02 | 旧 schema 拒绝启动 | PASS→PASS | BASE-001, BLK-MIG-001 |
| R-A0-03 | 统一错误与时间字段 | PASS→PASS | API-001, ARC-API-001, ARC-API-002, ARC-API-003, AUTH-002, STATE-041 |
| R-A0-04 | 预置登录身份与令牌寿命 | PASS→PASS | AUTH-001, AUTH-002, AUTH-007 |
| R-A0-05 | 只读身份服务端权限 | PASS→PASS | AUTH-003, EXT-002, UI-001 |
| R-A0-06 | 部署配置与健康契约 | PASS→PASS | API-001, AUTH-001, BASE-002 |
| R-A1-01 | 完整账号转移矩阵 | PASS→PASS | BLK-SPEC-003, STATE-11, STATE-12, STATE-13, STATE-14, STATE-15, STATE-16, STATE-21, STATE-22, STATE-23, STATE-24, STATE-25, STATE-26, STATE-31, STATE-32, STATE-33, STATE-34, STATE-35, STATE-36, STATE-41, STATE-42, STATE-43, STATE-44, STATE-45, STATE-46, STATE-51, STATE-52, STATE-53, STATE-54, STATE-55, STATE-56, STATE-61, STATE-62, STATE-63, STATE-64, STATE-65, STATE-66 |
| R-A1-02 | 终态不可逆与重复事件 | PASS→PASS | STATE-044, STATE-045, STATE-51, STATE-52, STATE-53, STATE-54, STATE-55, STATE-56, STATE-61, STATE-62, STATE-63, STATE-64, STATE-65, STATE-66 |
| R-A1-03 | CAS及校验优先级 | PASS→PASS | INT-ACCOUNT-001, STATE-041, STATE-042 |
| R-A1-04 | 终态原子级联 | PASS→PASS | CAP-006, MSG-003, MSG-007, MSG-008, MSG-015, MSG-018, SEQ-010, STATE-044, STATE-045, WS-003 |
| R-A1-05 | 状态通知在提交之后 | PASS→PASS | INT-ACCOUNT-001, INT-ACCOUNT-002, WS-001, WS-003 |
| R-A1-06 | 限流恢复及旧计时失效 | PASS→PASS | MSG-002, MSG-014 |
| R-A1-07 | 账号种子与连接身份 | PASS→PASS | INT-ACCOUNT-001, INT-ACCOUNT-002, STATE-043 |
| R-A1-08 | 手动离线与释放 | PASS→PASS | BLK-SPEC-003, INT-ACCOUNT-001, MSG-014, STATE-043 |
| R-A2-01 | 出站持久记录与唯一副作用 | FAIL→FAIL | BLK-EXT-001, BLK-EXT-002, INT-MSG-006, INT-MSG-007, INT-MSG-008, MSG-001, MSG-017, REC-004, REC-006 |
| R-A2-02 | 受理与落地分离 | PASS→PASS | MSG-001, MSG-015, MSG-016, UI-004 |
| R-A2-03 | 504确认与最多一次重发 | PASS→PASS | AGENT-016, BLK-SPEC-002, INT-MSG-001, INT-MSG-002, INT-MSG-003, INT-MSG-006, MSG-004, MSG-005 |
| R-A2-04 | 查询不可用期间未知与恢复 | PASS→PASS | BLK-SPEC-002, INT-MSG-001, INT-MSG-002, INT-MSG-004, MSG-006 |
| R-A2-05 | 入站身份去重与排序 | PASS→PASS | MSG-011, MSG-017, REC-001 |
| R-A2-06 | 自身回流合并 | PASS→PASS | AGENT-002, MSG-001, MSG-017 |
| R-A2-07 | 数据库写失败恢复与告警 | PASS→PASS | REC-003 |
| R-A2-08 | SSE重复乱序断线停机补拉 | FAIL→FAIL | INT-MSG-005, INT-MSG-007, INT-MSG-008, REC-001, REC-002, STATE-044, STATE-045 |
| R-A2-09 | 限流期间零发送及FIFO | PASS→PASS | BLK-SPEC-001, MSG-002, SEQ-007 |
| R-A2-10 | 发送错误导向账号终态 | PASS→PASS | MSG-007, MSG-008, MSG-015 |
| R-A2-11 | 群不可写跨模块级联 | PASS→PASS | AGENT-031, CAP-005, MSG-016, SEQ-008 |
| R-A2-12 | 离群离线错误局部失败 | PASS→PASS | BLK-SPEC-002, MSG-009, MSG-010, MSG-013 |
| R-A3-01 | 建群请求校验与默认开关 | PASS→PASS | GROUP-001, GROUP-002 |
| R-A3-02 | 异步建群步骤及角色 | BLOCKED→FAIL | BLK-EXT-002, BLK-EXT-003, GROUP-002 |
| R-A3-03 | 成员事实落库时机 | PASS→PASS | GROUP-002, GROUP-003, GROUP-008 |
| R-A3-04 | 入群超时与提权调用上限 | BLOCKED→FAIL | BLK-EXT-003, GROUP-002, GROUP-003, GROUP-008 |
| R-A3-05 | 任务状态及失败步骤 | PASS→PASS | API-001, GROUP-003, GROUP-007 |
| R-A4-01 | 消息固定集合游标遍历 | PASS→PASS | INT-STREAM-002, MSG-012, UI-005 |
| R-A4-02 | 实时消息合并与状态变化 | PASS→PASS | INT-STREAM-002, MSG-011, UI-003, UI-004, UI-005 |
| R-A4-03 | WebSocket鉴权与全局序号 | PASS→PASS | INT-STREAM-001, WS-001, WS-002 |
| R-A4-04 | 最小实时事件集合 | PASS→PASS | INT-STREAM-001, WS-001, WS-003 |
| R-A5-01 | 触发单群互斥与积压批处理 | PASS→PASS | AGENT-002, AGENT-003, CAP-REG-001 |
| R-A5-02 | Agent请求及触发上下文契约 | BLOCKED→FAIL | AGENT-001, AGENT-003, BLK-EXT-005 |
| R-A5-03 | 严格响应形状与输入schema | PASS→PASS | AGENT-001, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, AGENT-034, AGENT-035, AGENT-036 |
| R-A5-04 | 协议错误历史与重复工具ID | PASS→PASS | AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, AGENT-011, AGENT-012, AGENT-024, AGENT-034, AGENT-035, AGENT-036, BLK-SPEC-004 |
| R-A5-05 | 步数和连续协议错误预算 | BLOCKED→BLOCKED | AGENT-012, AGENT-013, AGENT-032, BLK-SPEC-004, CAP-001, CAP-003 |
| R-A5-06 | 60秒活动预算与每轮超时 | FAIL→FAIL | AGENT-024, AGENT-025, CAP-003, INT-ACT-001 |
| R-A5-07 | 审计失效关闭与三次上限 | PASS→PASS | AGENT-014, AGENT-015, AGENT-018, AGENT-033, BLK-SPEC-005, CAP-001, CAP-004, CAP-REG-001, CAP-REG-002, CAP-REG-003, CAP-REG-004, UI-007 |
| R-A5-08 | 执行账号资格及终态竞态 | PASS→PASS | AGENT-018, AGENT-026, AGENT-030, CAP-006, CAP-REG-001, CAP-REG-003, CAP-REG-004 |
| R-A5-09 | 踢人开关权限与未知结果确认 | FAIL→FAIL | AGENT-017, AGENT-018, AGENT-019, AGENT-020, AGENT-029, BLK-EXT-004, CAP-001, CAP-004, CAP-007, CAP-008, CAP-010, CAP-REG-001, CAP-REG-002, REC-007 |
| R-A5-10 | run内发送幂等键 | FAIL→FAIL | AGENT-014, AGENT-016, AGENT-028 |
| R-A5-11 | Agent中断续跑及外部效果恢复 | FAIL→FAIL | BLK-EXT-001, BLK-EXT-004, BLK-EXT-005, CAP-007, CAP-009, CAP-010, INT-ACT-001, REC-006, REC-007 |
| R-A5-12 | 工具结果及原始响应大小限制 | PASS→PASS | AGENT-021, AGENT-027, BLK-SPEC-006 |
| R-A5-13 | 外部取消在当前步后生效 | PASS→PASS | AGENT-022, AGENT-031, BLK-SPEC-005, CAP-002, CAP-005 |
| R-A5-14 | 全部Agent步骤可查询 | PASS→PASS | AGENT-001, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-027, AGENT-034, AGENT-035, AGENT-036, API-001, UI-008 |
| R-A5-15 | 最近消息读取上限及新消息 | PASS→PASS | AGENT-021, BLK-SPEC-006 |
| R-A5-16 | 发送工具结果和5秒边界 | FAIL→FAIL | AGENT-016, AGENT-028, AGENT-030, AGENT-031 |
| R-A5-17 | finish与end_turn结束 | PASS→PASS | AGENT-001, AGENT-023 |
| R-A5-18 | 重复最近消息调用有界 | PASS→PASS | AGENT-013 |
| R-A6-01 | 登录及viewer控件权限 | PASS→PASS | UI-001, UI-026 |
| R-A6-02 | 账号界面状态和合法操作 | PASS→PASS | UI-002 |
| R-A6-03 | 群详情完整信息与醒目阻断 | BLOCKED→BLOCKED | MAN-UX-001, UI-003, UI-004, UI-005, UI-007 |
| R-B1-01 | 序列角色选择及限流顺延 | PASS→PASS | BLK-SPEC-001, SEQ-004, SEQ-006, SEQ-007 |
| R-B1-02 | 序列变量语法 | PASS→PASS | ARC-API-001, ARC-API-002, ARC-API-003, SEQ-009 |
| R-B1-03 | 变量继承与空串语义 | PASS→PASS | SEQ-001, UI-009 |
| R-B1-04 | 全步骤预检零副作用 | PASS→PASS | SEQ-002, UI-010 |
| R-B1-05 | 最终变量及来源可查看 | PASS→PASS | API-001, SEQ-001, UI-009 |
| R-B1-06 | 同群序列并发互斥 | PASS→PASS | SEQ-003 |
| R-B1-07 | 按发出事件顺序排期 | FAIL→FAIL | BLK-SPEC-002, INT-MSG-005, INT-MSG-007, INT-MSG-008, SEQ-005, SEQ-007 |
| R-B1-08 | 跳过步骤时间与进度 | PASS→PASS | BLK-SPEC-002, SEQ-006, SEQ-010 |
| R-B1-09 | 序列重启只重排一过期步骤 | FAIL→FAIL | INT-MSG-005, INT-MSG-007, INT-MSG-008, REC-005 |
| R-B2-01 | 邀请链接未就绪等待 | PASS→PASS | GROUP-004 |
| R-B2-02 | 过期邀请重新申请一次 | PASS→PASS | GROUP-005 |
| R-B2-03 | 已入群响应视成功 | PASS→PASS | GROUP-009 |
| R-B2-04 | 有序退出及服务账号成员一致 | PASS→PASS | GROUP-006, GROUP-007, GROUP-010 |
| R-B3-01 | refresh仅HttpOnly cookie | PASS→PASS | AUTH-004 |
| R-B3-02 | 轮换及重放撤销全会话 | PASS→PASS | AUTH-004, AUTH-005 |
| R-B3-03 | 注销立即撤销access | PASS→PASS | AUTH-006 |
| R-B3-04 | 前端过期自动续期与单飞 | PASS→PASS | UI-011 |
| R-B4-01 | 断线3秒内补齐无重复 | PASS→PASS | UI-006 |
| R-B4-02 | Agent详情界面与端到端 | PASS→PASS | UI-008 |
| R-DELIVERY-01 | 保留Git历史的代码交付 | PASS→PASS | MAN-DELIVERY-001 |
| R-DELIVERY-02 | README可复现启动说明 | PASS→PASS | MAN-DELIVERY-002 |

所有PASS只来自本run。旧版PASS、开发自测与新候选差量未导入。时间、原因和逐项目义务见JSON；BLOCKED保留缺证，不冒充通过。
