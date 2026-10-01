# 需求至结果追踪

116 项均有用例映射；只有关联的全部用例通过，该条需求才记为本次已验证。

| 需求 | 本轮结论 | 用例 | 依据 |
|---|---|---|---|
| ADD-ATT-01 提醒限定当前页面上下文 | BLOCKED | UI-020, UI-021, UI-030 | {'path': 'docs/page-update-notification-implementation.md', 'section': '已批准范围；当前页scope与六类视图', 'lines': [5, 9], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [28, 36]}]} |
| ADD-ATT-02 前台安静失焦静态提醒 | BLOCKED | MAN-FOCUS-001, UI-020, UI-028 | {'path': 'docs/page-update-notification-implementation.md', 'section': '已批准范围；已选择的前台/失焦策略', 'lines': [5, 9], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [13, 16]}]} |
| ADD-ATT-03 成功呈现及真实操作才确认 | BLOCKED | ARC-UI-BLK-001, MAN-FOCUS-001, UI-020, UI-028, UI-029 | {'path': 'docs/page-update-notification-implementation.md', 'section': '已批准范围；呈现后相关操作确认', 'lines': [5, 9], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [135, 148]}]} |
| ADD-ATT-04 范围变化确认与历史变化保留 | BLOCKED | UI-030, UI-031 | {'path': 'docs/change-requests.md', 'section': 'CR-006后续批准的范围确认及期间变化', 'lines': [240, 244], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [116, 133]}]} |
| ADD-ATT-05 目录过期与提醒独立 | FAIL | UI-017, UI-032 | {'path': 'docs/page-update-notification-implementation.md', 'section': '已批准范围；目录过期与呈现职责', 'lines': [5, 9], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [108, 125]}]} |
| ADD-ATT-06 本地手动身份与自动消息提醒 | BLOCKED | UI-033, UI-034, UI-035 | {'path': 'docs/change-requests.md', 'section': 'CR-006后续批准的本地手动身份与自动消息', 'lines': [240, 244], 'approval': 'docs/decisions.md D-ATT-01；后续批准不采用旧开发验证结果', 'references': [{'path': 'docs/page-update-notification-proposal.md', 'section': '用户已选原则及对应语义；以之后明确批准范围为限', 'lines': [147, 152]}]} |
| ADD-CONFLICT-01 资料原值条件请求 | PASS | EXT-002, EXT-008, EXT-011, EXT-012 | {'path': 'docs/change-requests.md', 'section': 'CR-013', 'lines': [128, 134]} |
| ADD-CONFLICT-02 同字段原子冲突零副作用 | PASS | EXT-008, EXT-009 | {'path': 'docs/change-requests.md', 'section': 'CR-013', 'lines': [128, 134]} |
| ADD-CONFLICT-03 异字段与旧请求兼容 | PASS | EXT-010 | {'path': 'docs/change-requests.md', 'section': 'CR-013', 'lines': [128, 134]} |
| ADD-CONFLICT-04 冲突草稿与明确再确认 | PASS | UI-015 | {'path': 'docs/change-requests.md', 'section': 'CR-013', 'lines': [128, 134]} |
| ADD-COPY-01 账号与角色文案明确 | BLOCKED | MAN-UX-001, UI-002 | {'path': 'docs/change-requests.md', 'section': 'CR-011', 'lines': [112, 118]} |
| ADD-DIR-01 创建时间排序切换 | PASS | EXT-004, UI-037 | {'path': 'docs/change-requests.md', 'section': 'CR-007', 'lines': [78, 84]} |
| ADD-DIR-02 四字段字面搜索 | PASS | EXT-003 | {'path': 'docs/change-requests.md', 'section': 'CR-008', 'lines': [86, 92]} |
| ADD-DIR-03 两行纯文本简介摘要 | PASS | UI-012, UI-023 | {'path': 'docs/change-requests.md', 'section': 'CR-008', 'lines': [86, 92]} |
| ADD-DIR-04 兼容独立目录接口 | PASS | EXT-004, EXT-005 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-05 微秒游标及完整查询绑定 | PASS | EXT-006, UI-037 | {'path': 'docs/change-requests.md', 'section': 'CR-009/CR-012', 'lines': [94, 126]} |
| ADD-DIR-06 目录静态遍历与加载计数 | PASS | EXT-004, UI-025 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-07 单页有界刷新 | FAIL | UI-024 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-08 多页过期与整体刷新 | FAIL | UI-017, UI-032 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-09 列表返回内存及身份隔离 | PASS | UI-025, UI-026 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-10 加载失败和空结果区分 | PASS | UI-019 | {'path': 'docs/change-requests.md', 'section': 'CR-009', 'lines': [94, 102]} |
| ADD-DIR-11 输入法与迟到响应 | FAIL | MAN-IME-001, UI-016, UI-024, UI-027 | {'path': 'docs/change-requests.md', 'section': 'CR-008/CR-009', 'lines': [86, 102]} |
| ADD-DIR-12 群状态与Agent设置筛选 | PASS | EXT-006, EXT-007, UI-018 | {'path': 'docs/change-requests.md', 'section': 'CR-012', 'lines': [120, 126]} |
| ADD-DOC-01 独立变更台账 | PASS | DOC-MAN-001 | {'path': 'docs/change-requests.md', 'section': 'CR-004', 'lines': [60, 66]} |
| ADD-FORM-01 两处表单未保存关闭确认 | PASS | UI-013, UI-022 | {'path': 'docs/change-requests.md', 'section': 'CR-010', 'lines': [104, 110]} |
| ADD-FORM-02 提交关闭保护及迟到结果 | PASS | UI-014, UI-036 | {'path': 'docs/change-requests.md', 'section': 'CR-010', 'lines': [104, 110]} |
| ADD-LEFT-MEMBERS-01 退群完成后公开保留外部成员 | PASS | GROUP-010 | {'path': 'qa-acceptance/requirements/left-members-decision.md', 'approval': 'docs/decisions.md D042最终确认@993f758：仅退出托管成员，公开members保留外部成员；明确记录与原2.3差异'} |
| ADD-META-01 可选群名称 | PASS | EXT-001, EXT-002, UI-012 | {'path': 'docs/change-requests.md', 'section': 'CR-001', 'lines': [30, 38]} |
| ADD-META-02 群简介编辑与清空 | PASS | EXT-001, UI-012 | {'path': 'docs/change-requests.md', 'section': 'CR-005', 'lines': [68, 76]} |
| ADD-META-03 真实创建时间 | PASS | EXT-001, EXT-012 | {'path': 'docs/change-requests.md', 'section': 'CR-002', 'lines': [40, 48]} |
| ADD-META-04 资料旧数据和局部更新兼容 | FAIL | BLK-SPEC-006, EXT-001, EXT-010, EXT-012 | {'path': 'docs/change-requests.md', 'section': 'CR-001/CR-005', 'lines': [30, 76]} |
| ADD-SEQ-FAIL-01 普通序列发送失败终止后续步骤 | PASS | BLK-SPEC-002 | {'path': 'qa-acceptance/requirements/sequence-failure-policy.md', 'section': 'QA-D6/已确认行为与原有分支边界', 'approval': '2026-10-01本会话：用户明确回复“按你的建议执行”，批准普通失败使整条序列failed且停止后续发送；补充原B1未规定之处。', 'references': [{'path': 'docs/original-interview-question.md', 'section': 'B1原有sent/skipped排期与重启约束；本条为后续用户补充', 'lines': [288, 296]}]} |
| ENG-ACCOUNT-RECOVERY-01 已知远端成功后的原事务本地保存恢复 | PASS | INT-ACCOUNT-001, INT-ACCOUNT-002 | {'path': 'docs/decisions.md', 'section': 'D043 已确认局部恢复边界；docs/core-account-contract-hardening.md', 'lines': [107, 109]} |
| ENG-ADMISSION-01 容量拒绝与实体冲突的正确语义 | FAIL | CAP-001, CAP-002, CAP-003, CAP-004, CAP-005, CAP-006, CAP-007, CAP-008, CAP-009, CAP-010 | {'path': 'docs/architecture-reviews/2026-10-01-baseline.md', 'section': 'AR-04；D036批准的既有工程质量具体化，授权和原要求关联见requirements/architecture-impact.md', 'lines': [29, 29]} |
| ENG-CONTRACT-01 序列请求契约在前后端一致且兼容 | PASS | ARC-API-001, ARC-API-002, ARC-API-003, ARC-UI-001, ARC-UI-002, ARC-UI-003, ARC-UI-004, ARC-UI-005 | {'path': 'docs/architecture-reviews/2026-10-01-baseline.md', 'section': 'AR-08；D036批准的既有契约质量具体化，公开输入边界见requirements/architecture-impact.md', 'lines': [33, 33]} |
| ENG-DIAG-01 已交付后台诊断的管理员权限与脱敏边界 | PASS | DIAG-001, INT-DIAG-002 | {'path': 'docs/core-resource-observability.md', 'section': '诊断权限与含义', 'lines': [31, 35], 'atCommit': '993f7588c1105894e0543554209a8c085423589f', 'approval': 'D045批准必要运行诊断；本条将工程公开说明作为该候选的版本化接口profile，不视为原始接口已有要求'} |
| ENG-READ-01 缺少后续触发时暂时读取失败可有界恢复 | BLOCKED | ARC-UI-007, ARC-UI-008, ARC-UI-009, ARC-UI-010, ARC-UI-011, ARC-UI-012, ARC-UI-015, ARC-UI-018 | {'path': 'docs/architecture-reviews/2026-10-01-baseline.md', 'section': 'AR-09；D036批准的既有恢复质量具体化', 'lines': [34, 34]} |
| ENG-READ-02 读取恢复保持取消、会话隔离和读写边界 | BLOCKED | ARC-UI-006, ARC-UI-013, ARC-UI-014, ARC-UI-016, ARC-UI-017, ARC-UI-BLK-001 | {'path': 'docs/architecture-reviews/2026-10-01-baseline.md', 'section': 'AR-09；D036批准的既有会话与恢复质量具体化', 'lines': [34, 34]} |
| ENG-STREAM-01 慢接收者隔离与已收游标恢复的版本化契约 | BLOCKED | INT-STREAM-001, INT-STREAM-002 | {'path': 'docs/core-resource-observability.md', 'section': 'D044 已批准资源边界与冻结快照语义', 'lines': [9, 27]} |
| R-A0-01 迁移可重复执行 | PASS | REC-008 | {'path': 'docs/original-interview-question.md', 'section': 'A0', 'lines': [198, 198]} |
| R-A0-02 旧 schema 拒绝启动 | PASS | BASE-001, BLK-MIG-001 | {'path': 'docs/original-interview-question.md', 'section': 'A0', 'lines': [198, 198]} |
| R-A0-03 统一错误与时间字段 | PASS | API-001, ARC-API-001, ARC-API-002, ARC-API-003, AUTH-002, STATE-041 | {'path': 'docs/original-interview-question.md', 'section': '2.3', 'lines': [148, 148]} |
| R-A0-04 预置登录身份与令牌寿命 | PASS | AUTH-001, AUTH-002, AUTH-007 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A0', 'lines': [152, 152]} |
| R-A0-05 只读身份服务端权限 | PASS | AUTH-003, EXT-002, UI-001 | {'path': 'docs/original-interview-question.md', 'section': 'A0/4', 'lines': [200, 200]} |
| R-A0-06 部署配置与健康契约 | PASS | API-001, AUTH-001, BASE-002 | {'path': 'docs/original-interview-question.md', 'section': '1/2.3/4', 'lines': [146, 153]} |
| R-A1-01 完整账号转移矩阵 | PASS | BLK-SPEC-003, STATE-11, STATE-12, STATE-13, STATE-14, STATE-15, STATE-16, STATE-21, STATE-22, STATE-23, STATE-24, STATE-25, STATE-26, STATE-31, STATE-32, STATE-33, STATE-34, STATE-35, STATE-36, STATE-41, STATE-42, STATE-43, STATE-44, STATE-45, STATE-46, STATE-51, STATE-52, STATE-53, STATE-54, STATE-55, STATE-56, STATE-61, STATE-62, STATE-63, STATE-64, STATE-65, STATE-66 | {'path': 'docs/original-interview-question.md', 'section': 'A1', 'lines': [204, 216]} |
| R-A1-02 终态不可逆与重复事件 | PASS | STATE-044, STATE-045, STATE-51, STATE-52, STATE-53, STATE-54, STATE-55, STATE-56, STATE-61, STATE-62, STATE-63, STATE-64, STATE-65, STATE-66 | {'path': 'docs/original-interview-question.md', 'section': 'A1', 'lines': [215, 216]} |
| R-A1-03 CAS及校验优先级 | PASS | INT-ACCOUNT-001, STATE-041, STATE-042 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A1', 'lines': [156, 156]} |
| R-A1-04 终态原子级联 | FAIL | CAP-005, CAP-006, MSG-003, MSG-007, MSG-008, MSG-015, MSG-018, SEQ-010, STATE-044, STATE-045, WS-003 | {'path': 'docs/original-interview-question.md', 'section': 'A1', 'lines': [218, 218]} |
| R-A1-05 状态通知在提交之后 | PASS | INT-ACCOUNT-001, INT-ACCOUNT-002, WS-001, WS-003 | {'path': 'docs/original-interview-question.md', 'section': 'A1', 'lines': [219, 219]} |
| R-A1-06 限流恢复及旧计时失效 | PASS | MSG-002, MSG-014 | {'path': 'docs/original-interview-question.md', 'section': 'A1', 'lines': [220, 220]} |
| R-A1-07 账号种子与连接身份 | PASS | INT-ACCOUNT-001, INT-ACCOUNT-002, STATE-043 | {'path': 'docs/original-interview-question.md', 'section': '2.1/2.3', 'lines': [40, 42]} |
| R-A1-08 手动离线与释放 | PASS | BLK-SPEC-003, INT-ACCOUNT-001, MSG-014, STATE-043 | {'path': 'docs/original-interview-question.md', 'section': '2.1/2.3', 'lines': [156, 156]} |
| R-A2-01 出站持久记录与唯一副作用 | FAIL | BLK-EXT-001, BLK-EXT-002, INT-MSG-006, INT-MSG-007, INT-MSG-008, MSG-001, MSG-017, REC-004, REC-006 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [224, 224]} |
| R-A2-02 受理与落地分离 | PASS | MSG-001, MSG-015, MSG-016, UI-004 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A2/S1', 'lines': [59, 59]} |
| R-A2-03 504确认与最多一次重发 | PASS | AGENT-016, BLK-SPEC-002, INT-MSG-001, INT-MSG-002, INT-MSG-003, INT-MSG-006, MSG-004, MSG-005 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A2', 'lines': [67, 68]} |
| R-A2-04 查询不可用期间未知与恢复 | PASS | BLK-SPEC-002, INT-MSG-001, INT-MSG-002, INT-MSG-004, MSG-006 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [225, 225]} |
| R-A2-05 入站身份去重与排序 | PASS | MSG-011, MSG-017, REC-001 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A2', 'lines': [226, 226]} |
| R-A2-06 自身回流合并 | PASS | AGENT-002, MSG-001, MSG-017 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A2', 'lines': [163, 163]} |
| R-A2-07 数据库写失败恢复与告警 | PASS | REC-003 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [228, 228]} |
| R-A2-08 SSE重复乱序断线停机补拉 | FAIL | INT-MSG-005, INT-MSG-007, INT-MSG-008, REC-001, REC-002, STATE-044, STATE-045 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A2', 'lines': [73, 77]} |
| R-A2-09 限流期间零发送及FIFO | PASS | BLK-SPEC-001, MSG-002, SEQ-007 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [234, 234]} |
| R-A2-10 发送错误导向账号终态 | PASS | MSG-007, MSG-008, MSG-015 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A2', 'lines': [235, 236]} |
| R-A2-11 群不可写跨模块级联 | PASS | AGENT-031, MSG-016, SEQ-008 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [237, 237]} |
| R-A2-12 离群离线错误局部失败 | PASS | BLK-SPEC-002, MSG-009, MSG-010, MSG-013 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A2', 'lines': [160, 160]} |
| R-A3-01 建群请求校验与默认开关 | PASS | GROUP-001, GROUP-002 | {'path': 'docs/original-interview-question.md', 'section': '2.3', 'lines': [157, 157]} |
| R-A3-02 异步建群步骤及角色 | BLOCKED | BLK-EXT-002, BLK-EXT-003, GROUP-002 | {'path': 'docs/original-interview-question.md', 'section': 'A3', 'lines': [247, 247]} |
| R-A3-03 成员事实落库时机 | PASS | GROUP-002, GROUP-003, GROUP-008 | {'path': 'docs/original-interview-question.md', 'section': 'A3', 'lines': [248, 248]} |
| R-A3-04 入群超时与提权调用上限 | BLOCKED | BLK-EXT-003, GROUP-002, GROUP-003, GROUP-008 | {'path': 'docs/original-interview-question.md', 'section': 'A2', 'lines': [240, 240]} |
| R-A3-05 任务状态及失败步骤 | PASS | API-001, GROUP-003, GROUP-007 | {'path': 'docs/original-interview-question.md', 'section': '2.3', 'lines': [158, 162]} |
| R-A4-01 消息固定集合游标遍历 | PASS | INT-STREAM-002, MSG-012, UI-005 | {'path': 'docs/original-interview-question.md', 'section': 'A4', 'lines': [252, 252]} |
| R-A4-02 实时消息合并与状态变化 | PASS | INT-STREAM-002, MSG-011, UI-003, UI-004, UI-005 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A4', 'lines': [163, 163]} |
| R-A4-03 WebSocket鉴权与全局序号 | BLOCKED | INT-STREAM-001, WS-001, WS-002 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A4', 'lines': [169, 169]} |
| R-A4-04 最小实时事件集合 | BLOCKED | INT-STREAM-001, WS-001, WS-003 | {'path': 'docs/original-interview-question.md', 'section': '2.3', 'lines': [171, 171]} |
| R-A5-01 触发单群互斥与积压批处理 | PASS | AGENT-002, AGENT-003, CAP-REG-001 | {'path': 'docs/original-interview-question.md', 'section': 'A5.1', 'lines': [257, 257]} |
| R-A5-02 Agent请求及触发上下文契约 | BLOCKED | AGENT-001, AGENT-003, BLK-EXT-005 | {'path': 'docs/original-interview-question.md', 'section': '2.2', 'lines': [83, 114]} |
| R-A5-03 严格响应形状与输入schema | PASS | AGENT-001, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, AGENT-034, AGENT-035, AGENT-036 | {'path': 'docs/original-interview-question.md', 'section': '2.2/A5.3', 'lines': [103, 103]} |
| R-A5-04 协议错误历史与重复工具ID | PASS | AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-009, AGENT-010, AGENT-011, AGENT-012, AGENT-024, AGENT-034, AGENT-035, AGENT-036, BLK-SPEC-004 | {'path': 'docs/original-interview-question.md', 'section': 'A5.3', 'lines': [259, 259]} |
| R-A5-05 步数和连续协议错误预算 | FAIL | AGENT-012, AGENT-013, AGENT-032, BLK-SPEC-004, CAP-001, CAP-003 | {'path': 'docs/original-interview-question.md', 'section': 'A5.2', 'lines': [258, 258]} |
| R-A5-06 60秒活动预算与每轮超时 | FAIL | AGENT-024, AGENT-025, CAP-003, INT-ACT-001 | {'path': 'docs/original-interview-question.md', 'section': 'A5.2', 'lines': [258, 258]} |
| R-A5-07 审计失效关闭与三次上限 | PASS | AGENT-014, AGENT-015, AGENT-018, AGENT-033, BLK-SPEC-005, CAP-001, CAP-004, CAP-REG-001, CAP-REG-002, CAP-REG-003, CAP-REG-004, UI-007 | {'path': 'docs/original-interview-question.md', 'section': 'A5.4', 'lines': [260, 260]} |
| R-A5-08 执行账号资格及终态竞态 | PASS | AGENT-018, AGENT-026, AGENT-030, CAP-006, CAP-REG-001, CAP-REG-003, CAP-REG-004 | {'path': 'docs/original-interview-question.md', 'section': 'A5.5', 'lines': [261, 261]} |
| R-A5-09 踢人开关权限与未知结果确认 | FAIL | AGENT-017, AGENT-018, AGENT-019, AGENT-020, AGENT-029, BLK-EXT-004, CAP-001, CAP-004, CAP-007, CAP-008, CAP-010, CAP-REG-001, CAP-REG-002, REC-007 | {'path': 'docs/original-interview-question.md', 'section': '2.1/A5.6', 'lines': [52, 55]} |
| R-A5-10 run内发送幂等键 | BLOCKED | AGENT-014, AGENT-016, AGENT-028 | {'path': 'docs/original-interview-question.md', 'section': 'A5.7', 'lines': [263, 263]} |
| R-A5-11 Agent中断续跑及外部效果恢复 | FAIL | BLK-EXT-001, BLK-EXT-004, BLK-EXT-005, CAP-007, CAP-009, CAP-010, INT-ACT-001, REC-006, REC-007 | {'path': 'docs/original-interview-question.md', 'section': 'A5.8', 'lines': [264, 264]} |
| R-A5-12 工具结果及原始响应大小限制 | FAIL | AGENT-021, AGENT-027, BLK-SPEC-006 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A5.9', 'lines': [164, 164]} |
| R-A5-13 外部取消在当前步后生效 | FAIL | AGENT-022, AGENT-031, BLK-SPEC-005, CAP-002, CAP-005 | {'path': 'docs/original-interview-question.md', 'section': 'A5.10', 'lines': [266, 266]} |
| R-A5-14 全部Agent步骤可查询 | PASS | AGENT-001, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, AGENT-027, AGENT-034, AGENT-035, AGENT-036, API-001, UI-008 | {'path': 'docs/original-interview-question.md', 'section': '2.3/A5.12', 'lines': [164, 165]} |
| R-A5-15 最近消息读取上限及新消息 | FAIL | AGENT-021, BLK-SPEC-006 | {'path': 'docs/original-interview-question.md', 'section': '2.2', 'lines': [120, 120]} |
| R-A5-16 发送工具结果和5秒边界 | BLOCKED | AGENT-016, AGENT-028, AGENT-030, AGENT-031 | {'path': 'docs/original-interview-question.md', 'section': '2.2', 'lines': [121, 121]} |
| R-A5-17 finish与end_turn结束 | PASS | AGENT-001, AGENT-023 | {'path': 'docs/original-interview-question.md', 'section': '2.2', 'lines': [131, 131]} |
| R-A5-18 重复最近消息调用有界 | PASS | AGENT-013 | {'path': 'docs/original-interview-question.md', 'section': 'A5.11', 'lines': [267, 267]} |
| R-A6-01 登录及viewer控件权限 | PASS | UI-001, UI-026 | {'path': 'docs/original-interview-question.md', 'section': '4.1', 'lines': [327, 327]} |
| R-A6-02 账号界面状态和合法操作 | PASS | UI-002 | {'path': 'docs/original-interview-question.md', 'section': '4.2', 'lines': [328, 328]} |
| R-A6-03 群详情完整信息与醒目阻断 | BLOCKED | MAN-UX-001, UI-003, UI-004, UI-005, UI-007 | {'path': 'docs/original-interview-question.md', 'section': '4.3', 'lines': [329, 329]} |
| R-B1-01 序列角色选择及限流顺延 | PASS | BLK-SPEC-001, SEQ-004, SEQ-006, SEQ-007 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [288, 288]} |
| R-B1-02 序列变量语法 | PASS | ARC-API-001, ARC-API-002, ARC-API-003, SEQ-009 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [276, 289]} |
| R-B1-03 变量继承与空串语义 | PASS | SEQ-001, UI-009 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [290, 290]} |
| R-B1-04 全步骤预检零副作用 | PASS | SEQ-002, UI-010 | {'path': 'docs/original-interview-question.md', 'section': 'B1/S8', 'lines': [291, 291]} |
| R-B1-05 最终变量及来源可查看 | PASS | API-001, SEQ-001, UI-009 | {'path': 'docs/original-interview-question.md', 'section': 'B1/4.5', 'lines': [292, 292]} |
| R-B1-06 同群序列并发互斥 | PASS | SEQ-003 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [293, 293]} |
| R-B1-07 按发出事件顺序排期 | FAIL | BLK-SPEC-002, INT-MSG-005, INT-MSG-007, INT-MSG-008, SEQ-005, SEQ-007 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [294, 294]} |
| R-B1-08 跳过步骤时间与进度 | PASS | BLK-SPEC-002, SEQ-006, SEQ-010 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [295, 295]} |
| R-B1-09 序列重启只重排一过期步骤 | FAIL | INT-MSG-005, INT-MSG-007, INT-MSG-008, REC-005 | {'path': 'docs/original-interview-question.md', 'section': 'B1', 'lines': [296, 296]} |
| R-B2-01 邀请链接未就绪等待 | PASS | GROUP-004 | {'path': 'docs/original-interview-question.md', 'section': 'B2', 'lines': [300, 300]} |
| R-B2-02 过期邀请重新申请一次 | PASS | GROUP-005 | {'path': 'docs/original-interview-question.md', 'section': 'B2', 'lines': [300, 300]} |
| R-B2-03 已入群响应视成功 | PASS | GROUP-009 | {'path': 'docs/original-interview-question.md', 'section': 'B2', 'lines': [300, 300]} |
| R-B2-04 有序退出及服务账号成员一致 | PASS | GROUP-006, GROUP-007, GROUP-010 | {'path': 'docs/original-interview-question.md', 'section': 'B2', 'lines': [301, 302]} |
| R-B3-01 refresh仅HttpOnly cookie | PASS | AUTH-004 | {'path': 'docs/original-interview-question.md', 'section': 'B3', 'lines': [306, 306]} |
| R-B3-02 轮换及重放撤销全会话 | PASS | AUTH-004, AUTH-005 | {'path': 'docs/original-interview-question.md', 'section': 'B3', 'lines': [306, 306]} |
| R-B3-03 注销立即撤销access | PASS | AUTH-006 | {'path': 'docs/original-interview-question.md', 'section': 'B3', 'lines': [307, 307]} |
| R-B3-04 前端过期自动续期与单飞 | BLOCKED | UI-011 | {'path': 'docs/original-interview-question.md', 'section': 'B3', 'lines': [308, 308]} |
| R-B4-01 断线3秒内补齐无重复 | PASS | UI-006 | {'path': 'docs/original-interview-question.md', 'section': 'B4', 'lines': [312, 312]} |
| R-B4-02 Agent详情界面与端到端 | PASS | UI-008 | {'path': 'docs/original-interview-question.md', 'section': 'B4/4.4/C3', 'lines': [330, 330]} |
| R-DELIVERY-01 保留Git历史的代码交付 | PASS | MAN-DELIVERY-001 | {'path': 'docs/original-interview-question.md', 'section': '5.交付物', 'lines': [337, 337]} |
| R-DELIVERY-02 README可复现启动说明 | PASS | MAN-DELIVERY-002 | {'path': 'docs/original-interview-question.md', 'section': '5.交付物', 'lines': [338, 338]} |
