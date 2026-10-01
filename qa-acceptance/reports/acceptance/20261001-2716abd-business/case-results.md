# 当前候选逐项业务结果

固定2716、完整正式business入口；所有项目取最差，BLOCKED不算通过。

| 用例 | 结果 | 需求 | 来源 |
| --- | --- | --- | --- |
| CAP-REG-001 不同群同名目标的重叠 kick 保持各自审计、步骤和副作用唯一 | PASS | R-A5-01, R-A5-07, R-A5-08, R-A5-09 | tests/system/capacity.spec.ts |
| CAP-REG-002 审计等待期间关闭 autoKick 后不得继续派发 | PASS | R-A5-07, R-A5-09 | tests/system/capacity.spec.ts |
| CAP-REG-003 审计等待后重新检查执行账号在线状态 | PASS | R-A5-07, R-A5-08 | tests/system/capacity.spec.ts |
| CAP-REG-004 审计等待后成员身份和管理员角色均重新检查 | PASS | R-A5-07, R-A5-08 | tests/system/capacity.spec.ts |
| CAP-001 确证容量拒绝后零远端且释放后同一步只审计/踢人一次 | PASS | ENG-ADMISSION-01, R-A5-05, R-A5-07, R-A5-09 | tests/system/capacity-control.spec.ts |
| CAP-002 容量拒绝后关闭 Agent，原当前步完成后取消且无后续工作 | PASS | ENG-ADMISSION-01, R-A5-13 | tests/system/capacity-control.spec.ts |
| CAP-003 持续容量拒绝计入原 60 秒活动预算 | BLOCKED | ENG-ADMISSION-01, R-A5-05, R-A5-06 | tests/system/capacity-control.spec.ts |
| CAP-004 容量等待期间关闭踢人政策再次检查 | PASS | ENG-ADMISSION-01, R-A5-07, R-A5-09 | tests/system/capacity-control.spec.ts |
| CAP-005 容量等待期间群变不可写阻止迟发踢人 | PASS | ENG-ADMISSION-01, R-A2-11, R-A5-13 | tests/system/capacity-control.spec.ts |
| CAP-006 容量等待后在线、成员与管理员资格复核 | PASS | ENG-ADMISSION-01, R-A1-04, R-A5-08 | tests/system/capacity-control.spec.ts |
| CAP-007 容量等待中目标退出或重新加入后按同一用户身份完成移除且不重复 | PASS | ENG-ADMISSION-01, R-A5-09, R-A5-11 | tests/system/capacity-control.spec.ts |
| CAP-008 容量延期后真实网关群主或权限错误仍按原业务契约返回 | PASS | ENG-ADMISSION-01, R-A5-09 | tests/system/capacity-control.spec.ts |
| CAP-009 容量已拒绝但 ready 持久化之前崩溃的恢复 | PASS | ENG-ADMISSION-01, R-A5-11 | tests/system/capacity-control.spec.ts |
| CAP-010 已派发且2秒内收敛的504踢人遇容量压力不退回重放 | PASS | ENG-ADMISSION-01, R-A5-09, R-A5-11 | tests/system/capacity-control.spec.ts |
| ARC-API-001 序列定义的独立严格输入矩阵 | PASS | ENG-CONTRACT-01, R-B1-02, R-A0-03 | tests/api/sequence-contracts.spec.ts |
| ARC-API-002 序列启动的键类型边界与失败后可重试 | PASS | ENG-CONTRACT-01, R-B1-02, R-A0-03 | tests/api/sequence-contracts.spec.ts |
| ARC-API-003 序列启动缺省变量对象兼容 | PASS | ENG-CONTRACT-01, R-B1-02, R-A0-03 | tests/api/sequence-contracts.spec.ts |
| ARC-UI-BLK-001 通用资源读取失败不能提交成功快照或提前确认未呈现提醒 | PASS | ENG-READ-02, ADD-ATT-03 | tests/ui/observation-boundaries.spec.ts |
| ARC-UI-001 序列定义额外字段明确拒绝而非静默剥离 | PASS | ENG-CONTRACT-01 | tests/ui/architecture.spec.ts |
| ARC-UI-002 非连续或重复步号在浏览器阻止提交 | PASS | ENG-CONTRACT-01 | tests/ui/architecture.spec.ts |
| ARC-UI-003 已登记序列尺寸边界在浏览器明确拒绝 | PASS | ENG-CONTRACT-01 | tests/ui/architecture.spec.ts |
| ARC-UI-004 vars和stepVars非法键值不发预检或启动请求 | PASS | ENG-CONTRACT-01 | tests/ui/architecture.spec.ts |
| ARC-UI-005 合法序列一次保存并保留公开输入行为 | PASS | ENG-CONTRACT-01 | tests/ui/architecture.spec.ts |
| ARC-UI-006 序列写请求503失败不自动重放 | PASS | ENG-READ-02 | tests/ui/architecture.spec.ts |
| ARC-UI-007 无后续事件或轮询时两次503后自动呈现 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-008 权限403不形成资源请求风暴 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-009 429不无视限流进行通用重试 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-010 请求校验400不自动重试 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-011 成功HTTP的非法响应格式不按502临时错误重试 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-012 持续暂时失败耗尽后停止自动读取 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-013 切页取消旧读取及后续退避 | PASS | ENG-READ-02 | tests/ui/architecture.spec.ts |
| ARC-UI-014 换身份期间旧读取迟到不能覆盖新会话 | PASS | ENG-READ-02 | tests/ui/architecture.spec.ts |
| ARC-UI-015 耗尽后显式同页刷新可开始新一轮 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| ARC-UI-016 错误后离页取消退避期间的后续读取 | PASS | ENG-READ-02 | tests/ui/architecture.spec.ts |
| ARC-UI-017 在途读取期间多个实时失效合并且不能延长失败预算 | PASS | ENG-READ-02 | tests/ui/architecture.spec.ts |
| ARC-UI-018 网络失败及其他已登记暂时HTTP错误均可自动恢复 | PASS | ENG-READ-01 | tests/ui/architecture.spec.ts |
| STATE-11 state transition idle to idle | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-12 state transition idle to online | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-13 state transition idle to rate_limited | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-14 state transition idle to disconnected | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-15 state transition idle to suspended | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-16 state transition idle to session_expired | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-21 state transition online to idle | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-22 state transition online to online | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-23 state transition online to rate_limited | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-24 state transition online to disconnected | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-25 state transition online to suspended | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-26 state transition online to session_expired | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-31 state transition rate_limited to idle | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-32 state transition rate_limited to online | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-33 state transition rate_limited to rate_limited | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-34 state transition rate_limited to disconnected | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-35 state transition rate_limited to suspended | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-36 state transition rate_limited to session_expired | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-41 state transition disconnected to idle | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-42 state transition disconnected to online | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-43 state transition disconnected to rate_limited | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-44 state transition disconnected to disconnected | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-45 state transition disconnected to suspended | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-46 state transition disconnected to session_expired | PASS | R-A1-01 | tests/api/accounts.spec.ts |
| STATE-51 state transition suspended to idle | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-52 state transition suspended to online | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-53 state transition suspended to rate_limited | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-54 state transition suspended to disconnected | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-55 state transition suspended to suspended | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-56 state transition suspended to session_expired | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-61 state transition session_expired to idle | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-62 state transition session_expired to online | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-63 state transition session_expired to rate_limited | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-64 state transition session_expired to disconnected | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-65 state transition session_expired to suspended | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-66 state transition session_expired to session_expired | PASS | R-A1-01, R-A1-02 | tests/api/accounts.spec.ts |
| STATE-041 validation precedence and stale expectedFrom are explicit | PASS | R-A1-03, R-A0-03 | tests/api/accounts.spec.ts |
| STATE-042 concurrent compare-and-swap has one winner | PASS | R-A1-03 | tests/api/accounts.spec.ts |
| STATE-043 reconnect retains stable gateway identity | PASS | R-A1-07, R-A1-08 | tests/api/accounts.spec.ts |
| STATE-044 repeated suspended events preserve processing and cannot reconnect | PASS | R-A1-02, R-A1-04, R-A2-08 | tests/api/accounts.spec.ts |
| STATE-045 repeated session_expired events preserve processing and cannot reconnect | PASS | R-A1-02, R-A1-04, R-A2-08 | tests/api/accounts.spec.ts |
| AUTH-001 health, login and UTC account contract | PASS | R-A0-04, R-A0-06 | tests/api/auth.spec.ts |
| AUTH-002 protected reads reject missing and invalid credentials | PASS | R-A0-03, R-A0-04 | tests/api/auth.spec.ts |
| AUTH-003 viewer cannot execute any original business write endpoint | PASS | R-A0-05 | tests/api/auth.spec.ts |
| AUTH-004 refresh token is cookie-only, HttpOnly and rotates | PASS | R-B3-01, R-B3-02 | tests/api/auth.spec.ts |
| AUTH-005 refresh replay revokes both new credentials immediately | PASS | R-B3-02 | tests/api/auth.spec.ts |
| AUTH-006 logout invalidates the existing access token immediately | PASS | R-B3-03 | tests/api/auth.spec.ts |
| AUTH-007 access token expires at fifteen minutes (real clock) | PASS | R-A0-04 | tests/api/auth.spec.ts |
| GROUP-001 creation validates members and online status before external effects | PASS | R-A3-01 | tests/api/groups.spec.ts |
| GROUP-002 asynchronous creation materializes creator and event-confirmed roles | PASS | R-A3-01, R-A3-02, R-A3-03, R-A3-04 | tests/api/groups.spec.ts |
| GROUP-003 accepted join without member_joined fails after ten seconds | PASS | R-A3-03, R-A3-04, R-A3-05 | tests/api/groups.spec.ts |
| GROUP-004 invite readiness is respected without retry resetting the wait | PASS | R-B2-01 | tests/api/groups.spec.ts |
| GROUP-005 expired invitation is refreshed once and joining succeeds | PASS | R-B2-02 | tests/api/groups.spec.ts |
| GROUP-006 leave-all removes service accounts with creator strictly last | PASS | R-B2-04 | tests/api/groups.spec.ts |
| GROUP-007 failed noncreator leave preserves owner and continues remaining accounts | PASS | R-B2-04, R-A3-05 | tests/api/groups.spec.ts |
| GROUP-008 member rows wait for actual joined event before promotion | PASS | R-A3-03, R-A3-04 | tests/api/groups.spec.ts |
| GROUP-009 ALREADY_MEMBER confirms existing membership without waiting for another event | PASS | R-B2-03 | tests/api/groups.spec.ts |
| GROUP-010 leave-all preserves public external members and keeps left groups inactive | PASS | R-B2-04, ADD-LEFT-MEMBERS-01 | tests/api/groups.spec.ts |
| MSG-001 accepted is observable until message_sent and own echo stays one row | PASS | R-A2-01, R-A2-02, R-A2-06 | tests/api/messages.spec.ts |
| MSG-002 rate limiting blocks all account sends until deadline and preserves FIFO | PASS | R-A2-09, R-A1-06 | tests/api/messages.spec.ts |
| MSG-003 terminal marking cancels queued sends and removes member atomically | PASS | R-A1-04 | tests/api/messages.spec.ts |
| MSG-004 504 that lands within two seconds is reconciled without resending | PASS | R-A2-03 | tests/api/messages.spec.ts |
| MSG-005 absent 504 permits at most one retry after the two-second uncertainty window | PASS | R-A2-03 | tests/api/messages.spec.ts |
| MSG-006 unavailable confirmation preserves unknown until recovery | PASS | R-A2-04 | tests/api/messages.spec.ts |
| MSG-007 synchronous ACCOUNT_SUSPENDED applies terminal consequences without relying on events | PASS | R-A2-10, R-A1-04 | tests/api/messages.spec.ts |
| MSG-008 synchronous SESSION_EXPIRED applies terminal consequences without relying on events | PASS | R-A2-10, R-A1-04 | tests/api/messages.spec.ts |
| MSG-009 SENDER_NOT_IN_GROUP only fails that message | PASS | R-A2-12 | tests/api/messages.spec.ts |
| MSG-010 ACCOUNT_OFFLINE only fails that message | PASS | R-A2-12 | tests/api/messages.spec.ts |
| MSG-011 incoming duplicate and out-of-order historical messages are merged and sorted | PASS | R-A2-05, R-A4-02 | tests/api/messages.spec.ts |
| MSG-012 snapshot cursor traversal has no omission or duplicates under concurrent writes | PASS | R-A4-01 | tests/api/messages.spec.ts |
| MSG-013 manual send validates unavailable account and nonmember before enqueue | PASS | R-A2-12 | tests/api/messages.spec.ts |
| MSG-014 leaving rate_limited manually prevents stale timer resurrection | PASS | R-A1-06, R-A1-08 | tests/api/messages.spec.ts |
| MSG-015 asynchronous message_failed applies ACCOUNT_SUSPENDED consequences | PASS | R-A2-02, R-A2-10, R-A1-04 | tests/api/messages.spec.ts |
| MSG-016 asynchronous message_failed applies GROUP_WRITE_FORBIDDEN consequences | PASS | R-A2-02, R-A2-11 | tests/api/messages.spec.ts |
| MSG-017 message echo arriving before confirmation still merges one own row | PASS | R-A2-01, R-A2-05, R-A2-06 | tests/api/messages.spec.ts |
| WS-001 business events start after auth and have strictly increasing global seq | PASS | R-A4-03, R-A4-04, R-A1-05 | tests/api/realtime.spec.ts |
| WS-002 unauthenticated and invalid-token sockets receive no business events | PASS | R-A4-03 | tests/api/realtime.spec.ts |
| WS-003 account_terminal is published only after terminal state and cleanup | PASS | R-A4-04, R-A1-04, R-A1-05 | tests/api/realtime.spec.ts |
| AGENT-001 four schema-complete tools and correct trigger context keep one run identity | PASS | R-A5-02, R-A5-03, R-A5-14, R-A5-17 | tests/system/agent.spec.ts |
| AGENT-002 duplicate inbound and own echo never duplicate triggers | PASS | R-A5-01, R-A2-06 | tests/system/agent.spec.ts |
| AGENT-003 multi-instance active run excludes competitors and batches all pending messages | PASS | R-A5-01, R-A5-02 | tests/system/agent.spec.ts |
| AGENT-004 non-JSON produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-005 fenced JSON produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-006 multiple blocks produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-007 stop reason mismatch produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-008 non-2xx produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-009 UNKNOWN_TOOL appends assistant tool use and error result | PASS | R-A5-03, R-A5-04 | tests/system/agent.spec.ts |
| AGENT-010 INVALID_INPUT appends assistant tool use and error result | PASS | R-A5-03, R-A5-04 | tests/system/agent.spec.ts |
| AGENT-011 duplicate tool_use id is protocol error and has no repeated effect | PASS | R-A5-04 | tests/system/agent.spec.ts |
| AGENT-012 three consecutive protocol errors fail and a legal response resets the count | PASS | R-A5-04, R-A5-05 | tests/system/agent.spec.ts |
| AGENT-013 repeated read loop cannot exceed twelve turns | PASS | R-A5-05, R-A5-18 | tests/system/agent.spec.ts |
| AGENT-014 audit rejection blocks side effect and rejected key remains reusable | PASS | R-A5-07, R-A5-10 | tests/system/agent.spec.ts |
| AGENT-015 three inconclusive audit attempts block run without execution | PASS | R-A5-07 | tests/system/agent.spec.ts |
| AGENT-016 idempotency retry returns current sent state without another audit or send | PASS | R-A5-10, R-A5-16, R-A2-03 | tests/system/agent.spec.ts |
| AGENT-017 kick denied by policy never calls external kick | PASS | R-A5-09 | tests/system/agent.spec.ts |
| AGENT-018 permitted kick audits exact action and uses owner or promoted member | PASS | R-A5-07, R-A5-08, R-A5-09 | tests/system/agent.spec.ts |
| AGENT-019 OWNER_LEFT is returned as tool error without changing group or accounts | PASS | R-A5-09 | tests/system/agent.spec.ts |
| AGENT-020 NO_PERMISSION is returned as tool error without changing group or accounts | PASS | R-A5-09 | tests/system/agent.spec.ts |
| AGENT-021 recent messages include new arrivals and obey text, count, byte and summary limits | PASS | R-A5-12, R-A5-15 | tests/system/agent.spec.ts |
| AGENT-022 disabling agent lets current step complete then cancels | PASS | R-A5-13 | tests/system/agent.spec.ts |
| AGENT-023 finish tool stores summary and does not ask another turn | PASS | R-A5-17 | tests/system/agent.spec.ts |
| AGENT-024 turn timeout records error and late response never sends a message | PASS | R-A5-06, R-A5-04 | tests/system/agent.spec.ts |
| AGENT-025 run stays within sixty-second active wall-clock budget including slow turns | FAIL | R-A5-06 | tests/system/agent.spec.ts |
| AGENT-026 no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error | PASS | R-A5-08 | tests/system/agent.spec.ts |
| AGENT-027 raw protocol response truncates to two KiB and remains inspectable | PASS | R-A5-12, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-028 unknown send times out in five seconds and same key still cannot resend | FAIL | R-A5-10, R-A5-16 | tests/system/agent.spec.ts |
| AGENT-029 kick timeout reconciles membership and never executes twice | PASS | R-A5-09 | tests/system/agent.spec.ts |
| AGENT-030 account becoming terminal during send returns SEND_FAILED and run continues | PASS | R-A5-08, R-A5-16 | tests/system/agent.spec.ts |
| AGENT-031 group write error cancels current run after its step and stops future triggers | PASS | R-A2-11, R-A5-13, R-A5-16 | tests/system/agent.spec.ts |
| AGENT-032 twelve distinct turns exhaust budget without a thirteenth request | PASS | R-A5-05 | tests/system/agent.spec.ts |
| AGENT-033 audit retries resolve before informing agent and do not consume turn budget | PASS | R-A5-07 | tests/system/agent.spec.ts |
| REC-001 SSE reconnect recovers all retained events once including out-of-order delivery | PASS | R-A2-08, R-A2-05 | tests/system/recovery.spec.ts |
| REC-002 hard process restart recovers events produced while stopped | PASS | R-A2-08 | tests/system/recovery.spec.ts |
| REC-003 database write outage loses no event and produces inconsistency notice | PASS | R-A2-07 | tests/system/recovery.spec.ts |
| REC-004 crash after send effect before response never duplicates gateway delivery | PASS | R-A2-01 | tests/system/recovery.spec.ts |
| REC-005 sequence restart reschedules only earliest overdue step and spaces subsequent sends | PASS | R-B1-09 | tests/system/recovery.spec.ts |
| REC-006 agent restarts with same run id and reconciles already-sent tool effect | PASS | R-A5-11, R-A2-01 | tests/system/recovery.spec.ts |
| REC-007 agent restart after kick effect uses membership reconciliation without repeating kick | FAIL | R-A5-11, R-A5-09 | tests/system/recovery.spec.ts |
| REC-008 repeated migration preserves data and schema version | PASS | R-A0-01 | tests/system/recovery.spec.ts |
| SEQ-001 variables inherit latest nonempty override with original source | PASS | R-B1-03, R-B1-05 | tests/system/sequence.spec.ts |
| SEQ-002 all-step preflight rejects step three and leaves no running record or send | PASS | R-B1-04 | tests/system/sequence.spec.ts |
| SEQ-003 simultaneous starts admit exactly one sequence run | PASS | R-B1-06 | tests/system/sequence.spec.ts |
| SEQ-004 admin preferred and member selected lexicographically | PASS | R-B1-01 | tests/system/sequence.spec.ts |
| SEQ-005 next delay begins at actual sent event, not acceptance | PASS | R-B1-07 | tests/system/sequence.spec.ts |
| SEQ-006 unavailable member step is skipped with timestamp and progress continues | PASS | R-B1-01, R-B1-08 | tests/system/sequence.spec.ts |
| SEQ-007 rate-limited role waits rather than skips and preserves later delays | PASS | R-B1-01, R-B1-07, R-A2-09 | tests/system/sequence.spec.ts |
| SEQ-008 group write prohibition stops sequence while account remains online | PASS | R-A2-11 | tests/system/sequence.spec.ts |
| SEQ-009 placeholder grammar includes letters digits underscore and leaves other braces literal | PASS | R-B1-02 | tests/system/sequence.spec.ts |
| SEQ-010 terminal account skips its queued sequence step and advances progress | PASS | R-A1-04, R-B1-08 | tests/system/sequence.spec.ts |
| AGENT-034 missing stop reason produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-035 zero content blocks produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| AGENT-036 text surrounding JSON produces BAD_JSON history without assistant block | PASS | R-A5-03, R-A5-04, R-A5-14 | tests/system/agent.spec.ts |
| MSG-018 terminal event removes account and cancels its queue across every group | PASS | R-A1-04 | tests/api/messages.spec.ts |
| EXT-001 群资料可选、局部编辑及简介清空 | PASS | ADD-META-01, ADD-META-02, ADD-META-03, ADD-META-04 | tests/extensions/api.spec.ts |
| EXT-002 viewer资料越权拒绝 | PASS | R-A0-05, ADD-META-01, ADD-CONFLICT-01 | tests/extensions/api.spec.ts |
| EXT-003 目录四字段及字面搜索 | PASS | ADD-DIR-02 | tests/extensions/api.spec.ts |
| EXT-004 目录分页兼容与双向遍历 | PASS | ADD-DIR-01, ADD-DIR-04, ADD-DIR-06 | tests/extensions/api.spec.ts |
| EXT-005 目录输入边界与鉴权 | PASS | ADD-DIR-04 | tests/extensions/api.spec.ts |
| EXT-006 完整查询游标绑定 | PASS | ADD-DIR-05, ADD-DIR-12 | tests/extensions/api.spec.ts |
| EXT-007 组合筛选先于分页 | PASS | ADD-DIR-12 | tests/extensions/api.spec.ts |
| EXT-008 同字段并发原值竞争 | PASS | ADD-CONFLICT-01, ADD-CONFLICT-02 | tests/extensions/api.spec.ts |
| EXT-009 冲突请求无部分副作用 | PASS | ADD-CONFLICT-02 | tests/extensions/api.spec.ts |
| EXT-010 异字段并发及旧请求兼容 | PASS | ADD-CONFLICT-03, ADD-META-04 | tests/extensions/api.spec.ts |
| EXT-011 null原值与非法条件 | PASS | ADD-CONFLICT-01 | tests/extensions/api.spec.ts |
| EXT-012 资料跨重启持久性 | PASS | ADD-META-03, ADD-META-04, ADD-CONFLICT-01 | tests/extensions/api.spec.ts |
| BLK-MIG-001 已有历史schema低于候选时明确拒启且不改变结构数据 | PASS | R-A0-02 | tests/system/fixture-boundaries.spec.ts |
| BASE-001 全新未迁移schema拒启 | PASS | R-A0-02 | tests/foundation/startup.spec.ts |
| BASE-002 交付声明与栈约束入口 | PASS | R-A0-06 | tests/foundation/startup.spec.ts |
| API-001 独立公开API结构契约 | PASS | R-A0-03, R-A0-06, R-A3-05, R-A5-14, R-B1-05 | tests/foundation/contracts.spec.ts |
| DIAG-001 后台诊断仅管理员可读且不泄漏测试凭据或业务样本 | PASS | ENG-DIAG-01 | tests/api/diagnostics.spec.ts |
| INT-MSG-006 已识别504后延迟本地保存仍从原接收起按5秒确定状态 | PASS | R-A2-01, R-A2-03 | tests/system/integration-message-boundaries.spec.ts |
| INT-MSG-007 单实例首次确认已观察但INSERT未发出时崩溃的排期时间保留 | FAIL | R-A2-01, R-A2-08, R-B1-07, R-B1-09 | tests/system/integration-message-boundaries.spec.ts |
| INT-MSG-008 receipt自动提交已确认但业务未应用时崩溃后复用首次时间 | PASS | R-A2-01, R-A2-08, R-B1-07, R-B1-09 | tests/system/integration-message-boundaries.spec.ts |
| INT-MSG-001 旧404跨过2秒确认窗不能否定已真实落地消息 | PASS | R-A2-03, R-A2-04 | tests/system/integration-message-timing.spec.ts |
| INT-MSG-002 真实查询响应持续延迟跨5秒后仍unknown并按恢复2秒收敛 | PASS | R-A2-03, R-A2-04 | tests/system/integration-message-timing.spec.ts |
| INT-MSG-003 慢但可用的确认查询仍从最初504计五秒 | PASS | R-A2-03 | tests/system/integration-message-timing.spec.ts |
| INT-MSG-004 查询503恢复成慢200后仍保留原两秒判定 | PASS | R-A2-04 | tests/system/integration-message-timing.spec.ts |
| INT-MSG-005 同一确认以不同eventId迟到并在公开提交后重启不改排期 | PASS | R-B1-07, R-B1-09, R-A2-08 | tests/system/integration-message-timing.spec.ts |
| INT-ACT-001 安全阶段重启累计活动预算、恢复归因与完整尾段真值 | FAIL | R-A5-06, R-A5-11 | tests/system/integration-runtime.spec.ts |
| INT-ACCOUNT-001 远端成功后的局部保存暂错在原事务恢复，新断开不被旧连接覆盖 | PASS | R-A1-03, R-A1-05, R-A1-07, R-A1-08, ENG-ACCOUNT-RECOVERY-01 | tests/system/integration-runtime.spec.ts |
| INT-ACCOUNT-002 持续本地保存失败显式回滚，无虚假状态事件或远端自动重放 | PASS | R-A1-05, R-A1-07, ENG-ACCOUNT-RECOVERY-01 | tests/system/integration-runtime.spec.ts |
| INT-DIAG-002 真实tick失败、进行中保持与恢复诊断及错误样本脱敏 | PASS | ENG-DIAG-01 | tests/system/integration-runtime.spec.ts |
| INT-STREAM-001 真实暂停TCP读取与健康消费者并行、按实际已收游标重放 | PASS | ENG-STREAM-01, R-A4-03, R-A4-04 | tests/system/integration-streams.spec.ts |
| INT-STREAM-002 续页改变页大小并交错发送确认、历史补投与新消息，冻结集合内容保持 | PASS | ENG-STREAM-01, R-A4-01, R-A4-02 | tests/system/integration-streams.spec.ts |
| MAN-UX-001 操作员能识别阻断、失败与账号/群角色含义 | BLOCKED | R-A6-03, ADD-COPY-01 | manual audit |
| MAN-IME-001 真实操作系统中文输入法不触发中间查询 | BLOCKED | ADD-DIR-11 | manual audit |
| MAN-FOCUS-001 真实失焦与浏览器标签标题favicon呈现 | BLOCKED | ADD-ATT-02, ADD-ATT-03 | manual audit |
| MAN-DELIVERY-001 接收方核对仓库Git历史及版本对应 | PASS | R-DELIVERY-01 | manual audit |
| MAN-DELIVERY-002 接收方只依README在全新隔离环境复现启动 | PASS | R-DELIVERY-02 | manual audit |
| BLK-EXT-001 未收到响应的发送崩溃：相同前缀下落地/不落地两个分支 | BLOCKED | R-A2-01, R-A5-11 | tests/system/protocol-boundaries.spec.ts |
| BLK-EXT-002 建群成功响应丢失：原群身份与额外远端群核对 | BLOCKED | R-A3-02, R-A2-01 | tests/system/protocol-boundaries.spec.ts |
| BLK-EXT-003 promote响应丢失：角色真相与两次调用上限 | BLOCKED | R-A3-02, R-A3-04 | tests/system/protocol-boundaries.spec.ts |
| BLK-EXT-004 kick已生效后目标重新加入：恢复不重踢 | BLOCKED | R-A5-09, R-A5-11 | tests/system/protocol-boundaries.spec.ts |
| BLK-EXT-005 模型未执行响应丢失：允许不同合法响应且保留已持久历史 | BLOCKED | R-A5-02, R-A5-11 | tests/system/protocol-boundaries.spec.ts |
| DOC-MAN-001 追加需求台账来源与状态审核 | PASS | ADD-DOC-01 | manual audit |
| BLK-SPEC-002 普通序列发送失败终止整run且重启后不发送后续步骤 | PASS | ADD-SEQ-FAIL-01, R-B1-07, R-B1-08, R-A2-12, R-A2-03, R-A2-04 | tests/system/sequence-failure-policy.spec.ts |
| BLK-SPEC-001 序列在线候选过滤与已入队限流消息的账号及顺序保持 | PASS | R-B1-01, R-A2-09 | tests/system/spec-boundaries.spec.ts |
| BLK-SPEC-003 手动状态遵守CAS和已提交事件，离线目标产生明确disconnect效果 | PASS | R-A1-01, R-A1-08 | tests/system/spec-boundaries.spec.ts |
| BLK-SPEC-004 混合协议错误累计三次，合法工具业务错误清零连续计数 | PASS | R-A5-04, R-A5-05 | tests/system/spec-boundaries.spec.ts |
| BLK-SPEC-005 第三次未知审计与关闭Agent重叠时合法终态稳定且不产生副作用 | PASS | R-A5-07, R-A5-13 | tests/system/spec-boundaries.spec.ts |
| BLK-SPEC-006 资料版本化输入规则、工具公开schema一致性及明确字节上限 | PASS | ADD-META-04, R-A5-12, R-A5-15 | tests/system/spec-boundaries.spec.ts |
| UI-023 简介两行纯文本摘要与完整详情 | PASS | ADD-DIR-03 | tests/ui/console.spec.ts |
| UI-024 单页五秒轮询及并发失效合并 | PASS | ADD-DIR-07, ADD-DIR-11 | tests/ui/console.spec.ts |
| UI-025 返回恢复内存条件分页位置及刷新清空 | PASS | ADD-DIR-09, ADD-DIR-06 | tests/ui/console.spec.ts |
| UI-026 注销换身份清除目录会话状态 | PASS | ADD-DIR-09, R-A6-01 | tests/ui/console.spec.ts |
| UI-027 浏览器composition不发中间查询 | PASS | ADD-DIR-11 | tests/ui/console.spec.ts |
| UI-028 前台安静与失焦静态标题favicon | PASS | ADD-ATT-02, ADD-ATT-03 | tests/ui/console.spec.ts |
| UI-029 加载失败不冒称已确认 | PASS | ADD-ATT-03 | tests/ui/console.spec.ts |
| UI-030 列表范围消失的两阶段确认 | PASS | ADD-ATT-01, ADD-ATT-04 | tests/ui/console.spec.ts |
| UI-031 变化后回原值保留期间变化候选 | PASS | ADD-ATT-04 | tests/ui/console.spec.ts |
| UI-032 提醒确认不改变刷新后的分页资格或恢复旧分页链 | PASS | ADD-ATT-05, ADD-DIR-08 | tests/ui/console.spec.ts |
| UI-033 本地手动clientMsgId及早回流归属 | PASS | ADD-ATT-06 | tests/ui/console.spec.ts |
| UI-034 Agent自动消息失焦提醒 | PASS | ADD-ATT-06 | tests/ui/console.spec.ts |
| UI-035 序列自动消息失焦提醒 | PASS | ADD-ATT-06 | tests/ui/console.spec.ts |
| UI-036 编辑卸载迟到结果隔离 | PASS | ADD-FORM-02 | tests/ui/console.spec.ts |
| UI-037 目录微秒及同时间ID跨页边界的确定性数据夹具 | PASS | ADD-DIR-01, ADD-DIR-05 | tests/system/fixture-boundaries.spec.ts |
| UI-001 viewer登录后各页不提供业务写入口 | PASS | R-A6-01, R-A0-05 | tests/ui/console.spec.ts |
| UI-002 账号状态与合法操作实时更新 | PASS | R-A6-02, ADD-COPY-01 | tests/ui/console.spec.ts |
| UI-003 群角色及消息回流只显示一行 | PASS | R-A6-03, R-A4-02 | tests/ui/console.spec.ts |
| UI-004 页面显示accepted到sent | PASS | R-A6-03, R-A2-02, R-A4-02 | tests/ui/console.spec.ts |
| UI-005 历史分页和实时新增合并 | PASS | R-A4-01, R-A4-02, R-A6-03 | tests/ui/console.spec.ts |
| UI-006 前端断线3秒内补齐 | PASS | R-B4-01 | tests/ui/console.spec.ts |
| UI-007 审计阻断显示在群运行列表 | PASS | R-A6-03, R-A5-07 | tests/ui/console.spec.ts |
| UI-008 登录至Agent步骤详情完整旅程 | PASS | R-B4-02, R-A5-14 | tests/ui/console.spec.ts |
| UI-009 序列预检变量继承与来源 | PASS | R-B1-03, R-B1-05 | tests/ui/console.spec.ts |
| UI-010 序列预检错误定位 | PASS | R-B1-04 | tests/ui/console.spec.ts |
| UI-011 前端并发401单次续期 | PASS | R-B3-04 | tests/ui/console.spec.ts |
| UI-012 群资料纯文本呈现 | PASS | ADD-META-01, ADD-META-02, ADD-DIR-03 | tests/ui/console.spec.ts |
| UI-013 编辑表单dirty关闭保护 | PASS | ADD-FORM-01 | tests/ui/console.spec.ts |
| UI-014 提交中保护及失败保留草稿 | PASS | ADD-FORM-02 | tests/ui/console.spec.ts |
| UI-015 冲突必须明确再次确认 | PASS | ADD-CONFLICT-04 | tests/ui/console.spec.ts |
| UI-016 搜索迟到响应隔离 | PASS | ADD-DIR-11 | tests/ui/console.spec.ts |
| UI-017 多页过期和原子刷新 | PASS | ADD-DIR-08, ADD-ATT-05 | tests/ui/console.spec.ts |
| UI-018 组合筛选clear与reset | PASS | ADD-DIR-12 | tests/ui/console.spec.ts |
| UI-019 首次错误与成功空结果区分 | PASS | ADD-DIR-10 | tests/ui/console.spec.ts |
| UI-020 失焦提醒和呈现后确认 | PASS | ADD-ATT-01, ADD-ATT-02, ADD-ATT-03 | tests/ui/console.spec.ts |
| UI-021 路由范围销毁 | PASS | ADD-ATT-01 | tests/ui/console.spec.ts |
| UI-022 创建表单关闭保护 | PASS | ADD-FORM-01 | tests/ui/console.spec.ts |
