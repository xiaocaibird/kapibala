# 第二轮需求—用例追踪

这是第二轮 overlay；不重写原全局目录、候选范围或已签首轮统计。所有产品结果 NOT_RUN。

| 条款 | 来源性质 | 用例 / 准备边界 |
|---|---|---|
| SR-C1-01 媒体真实下载与路径 | selected-original | SR-C1-001, SR-C1-002, SR-C1-003, SR-C1-007, SR-C1-013 |
| SR-C1-02 可配保留期 | selected-original | SR-C1-005 |
| SR-C1-03 删除与记录一致 | selected-original | SR-C1-005, SR-C1-006, SR-C1-009, SR-C1-010, SR-C1-013 |
| SR-C1-04 运行中引用保护 | selected-original | SR-C1-007, SR-C1-008, SR-C1-012, SR-C1-014, SR-C1-015 |
| SR-C1-05 失败与恢复 | selected-original | SR-C1-003, SR-C1-004, SR-C1-009, SR-C1-010, SR-C1-012, SR-C1-014, SR-C1-015 |
| SR-C1-06 重复并发一致性 | selected-original | SR-C1-002, SR-C1-006, SR-C1-008 |
| SR-C1-07 媒体目录接入 | selected-original | SR-C1-001, SR-C1-002, SR-C1-003, SR-C1-011, SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-C1-08 媒体迁移兼容 | selected-original | SR-C1-012, SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-C2-01 独立模型协议 | selected-original | SR-C2-001, SR-C2-006 |
| SR-C2-02 显式切换和默认隔离 | selected-original | SR-C2-002, SR-BE-DEL-004, SR-BE-USG-010 |
| SR-C2-03 会话历史与工具续接 | selected-original | SR-C2-003, SR-C2-005 |
| SR-C2-04 完成响应复用 | selected-original | SR-C2-004, SR-BE-USG-003 |
| SR-C2-05 错误与未决恢复 | selected-original | SR-C2-004, SR-C2-005, SR-C2-006, SR-C2-007, SR-C2-012, SR-C2-019, SR-BE-USG-008 |
| SR-C2-06 后端安全边界 | selected-original | SR-C2-009, SR-C2-010, SR-C2-011, SR-C2-012, SR-C2-019, SR-BE-GRD-001, SR-BE-GRD-002, SR-BE-GRD-003, SR-BE-GRD-005, SR-BE-POL-001, SR-BE-POL-005 |
| SR-C2-07 会话目录与秘密 | selected-original | SR-C2-007, SR-C2-008, SR-C2-015, SR-C2-020, SR-BE-DEL-004, SR-BE-DEL-005, SR-BE-USG-006, SR-BE-USG-010 |
| SR-C2-08 真实提供方证据分层 | selected-original | SR-C2-002, SR-C2-013, SR-C2-017, SR-C2-020, SR-BE-DEL-003 |
| SR-P0-01-01 首轮事实链 | existing-regression | SR-BE-DEL-001 |
| SR-P0-01-02 原结果和已决定限制 | existing-regression | SR-BE-DEL-001, SR-BE-DEL-002 |
| SR-P0-01-03 回归与真人边界 | existing-regression | SR-BE-DEL-002 |
| SR-P0-02-01 C1C2固定源独立验收 | delivery-integration | SR-BE-DEL-003, SR-BE-DEL-006 |
| SR-P0-02-02 C3复用完整流程 | delivery-integration | SR-BE-DEL-006 |
| SR-P0-02-03 隔离交付可复现 | delivery-integration | SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-P0-02-04 凭据与评估分层 | delivery-integration | SR-BE-DEL-003 |
| SR-P0-03-01 提交身份绑定 | approved-enhancement | SR-UI-001, SR-UI-002, SR-UI-003 |
| SR-P0-03-02 编辑ABA保护 | approved-enhancement | SR-UI-002, SR-UI-003 |
| SR-P0-03-03 失败未知保留 | approved-enhancement | SR-UI-006, SR-UI-007 |
| SR-P0-03-04 跨群跨身份隔离 | approved-enhancement | SR-UI-004, SR-UI-005 |
| SR-P0-03-05 实际关闭入口一致 | approved-enhancement | SR-UI-008 |
| SR-P0-03-06 保存快照保护 | approved-enhancement | SR-UI-008, SR-UI-009 |
| SR-P0-03-07 已有表单回归 | approved-enhancement | SR-UI-010 |
| SR-P0-04-01 预检修订失效 | approved-enhancement | SR-UI-011, SR-UI-012, SR-UI-013, SR-UI-014 |
| SR-P0-04-02 晚预检不能确认 | approved-enhancement | SR-UI-011, SR-UI-012, SR-UI-013, SR-UI-014 |
| SR-P0-04-03 冻结目标摘要 | approved-enhancement | SR-UI-015 |
| SR-P0-04-04 显式目标失效 | approved-enhancement | SR-UI-016 |
| SR-P0-04-05 初次默认独立 | approved-enhancement | SR-UI-017 |
| SR-P0-04-06 运行时原规则 | approved-enhancement | SR-UI-018 |
| SR-P0-05-01 审计守卫回归 | engineering-deliverable-and-regression | SR-BE-GRD-001, SR-BE-GRD-002, SR-BE-MUT-001 |
| SR-P0-05-02 同key幂等回归 | engineering-deliverable-and-regression | SR-BE-GRD-003, SR-BE-GRD-004, SR-BE-GRD-005, SR-BE-MUT-002 |
| SR-P0-05-03 两个有效检错实验 | engineering-deliverable-and-regression | SR-BE-MUT-001, SR-BE-MUT-002 |
| SR-P0-05-04 取消协作单入口 | engineering-deliverable-and-regression | SR-BE-GRD-006, SR-BE-GRD-007, SR-BE-GRD-008, SR-BE-MUT-003 |
| SR-P0-05-05 取消原子性与当前步 | engineering-deliverable-and-regression | SR-BE-GRD-006, SR-BE-GRD-007, SR-BE-GRD-008 |
| SR-P0-05-06 有限静态门禁 | engineering-deliverable-and-regression | SR-BE-MUT-003 |
| SR-P1-01-01 真实两档数据 | engineering-measurement-and-regression | SR-BE-DB-001 |
| SR-P1-01-02 计划与API实测 | engineering-measurement-and-regression | SR-BE-DB-001 |
| SR-P1-01-03 证据驱动局部优化 | engineering-measurement-and-regression | SR-BE-DB-002, SR-BE-DB-005 |
| SR-P1-01-04 时间线语义保留 | engineering-measurement-and-regression | SR-BE-DB-003, SR-BE-DB-004, SR-BE-DB-005 |
| SR-P1-02-01 群来源返回 | approved-enhancement | SR-UI-019 |
| SR-P1-02-02 列表来源返回 | approved-enhancement | SR-UI-020 |
| SR-P1-02-03 所属群与上下文 | approved-enhancement | SR-UI-021 |
| SR-P1-02-04 站内兜底和历史 | approved-enhancement | SR-UI-022, SR-UI-023, SR-UI-026, SR-UI-029 |
| SR-P1-02-05 失败与身份变化 | approved-enhancement | SR-UI-022, SR-UI-024, SR-UI-026, SR-UI-027, SR-UI-028, SR-UI-029 |
| SR-P1-02-06 提醒实体范围 | approved-enhancement | SR-UI-025 |
| SR-P1-03-01 稳定原因与下一步 | approved-enhancement | SR-BE-DIA-001, SR-BE-DIA-002, SR-BE-DIA-005 |
| SR-P1-03-02 真实关联 | approved-enhancement | SR-BE-DIA-001, SR-BE-DIA-004 |
| SR-P1-03-03 恢复和有限历史 | approved-enhancement | SR-BE-DIA-002, SR-BE-DIA-005 |
| SR-P1-03-04 权限与脱敏 | approved-enhancement | SR-BE-DIA-003, SR-BE-DIA-005 |
| SR-P1-03-05 未知效果安全 | approved-enhancement | SR-BE-DIA-004 |
| SR-P1-04-01 保护当前托管目标 | approved-new-business-policy | SR-BE-POL-001, SR-BE-POL-002, SR-BE-POL-003, SR-BE-POL-007 |
| SR-P1-04-02 使用最新目标事实 | approved-new-business-policy | SR-BE-POL-002, SR-BE-POL-003, SR-BE-POL-007 |
| SR-P1-04-03 保留外部目标原规则 | approved-new-business-policy | SR-BE-POL-004, SR-BE-POL-005 |
| SR-P1-04-04 独立退群清理不变 | approved-new-business-policy | SR-BE-POL-006 |
| SR-P1-04-05 既有错误协议 | approved-new-business-policy | SR-BE-POL-001, SR-BE-POL-004, SR-BE-POL-007 |
| SR-P1-05-01 真实调用记录 | approved-enhancement | SR-C2-013, SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-004, SR-BE-USG-007, SR-BE-USG-012 |
| SR-P1-05-02 真实用量与未知 | approved-enhancement | SR-C2-013, SR-C2-015, SR-C2-018, SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-012, SR-BE-USG-013 |
| SR-P1-05-03 缓存不重复推理 | approved-enhancement | SR-C2-004, SR-C2-013, SR-BE-USG-003, SR-BE-USG-008 |
| SR-P1-05-04 有界存储与配置 | approved-enhancement | SR-C2-014, SR-C2-015, SR-C2-016, SR-C2-018, SR-BE-USG-004, SR-BE-USG-005, SR-BE-USG-006, SR-BE-USG-008, SR-BE-USG-010, SR-BE-USG-011 |
| SR-P1-05-05 记录失败隔离 | approved-enhancement | SR-C2-014, SR-C2-016, SR-BE-USG-005, SR-BE-USG-009 |
| SR-P1-05-06 允许字段与秘密 | approved-enhancement | SR-C2-013, SR-C2-018, SR-BE-USG-006, SR-BE-USG-007, SR-BE-USG-009, SR-BE-USG-011 |
| SR-P1-05-07 调用结果分层 | approved-enhancement | SR-C2-009, SR-C2-011, SR-C2-013, SR-C2-016, SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-012, SR-BE-USG-013 |
| SR-AUTH-01 仅准备授权 | preparation-boundary | SR-BE-DEL-003 |
| SR-AUTH-02 冻结与历史分离 | preparation-boundary | SR-BE-DEL-003 |
| SR-AUTH-03 QA独立维护 | preparation-boundary | SR-BE-DEL-001 |
| SR-AUTH-04 人工与上线分离 | preparation-boundary | SR-BE-DEL-002 |
