# 后台条款与准备期用例映射

47条完整设计用例，全部NOT_RUN：37条manual、10条existing-regression。当前后台未登记新自动化入口；已有引用只提供复用定位，扩展变体仍待driver，不能称自动化ready。

| 原子条款 | 独立用例 |
|---|---|
| SR-C1-07 媒体目录接入 | SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-C1-08 媒体迁移兼容 | SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-C2-02 显式切换和默认隔离 | SR-BE-DEL-004, SR-BE-USG-010 |
| SR-C2-04 完成响应复用 | SR-BE-USG-003 |
| SR-C2-05 错误与未决恢复 | SR-BE-USG-008 |
| SR-C2-06 后端安全边界 | SR-BE-GRD-001, SR-BE-GRD-002, SR-BE-GRD-003, SR-BE-GRD-005, SR-BE-POL-001, SR-BE-POL-005 |
| SR-C2-07 会话目录与秘密 | SR-BE-DEL-004, SR-BE-DEL-005, SR-BE-USG-006, SR-BE-USG-010 |
| SR-C2-08 真实提供方证据分层 | SR-BE-DEL-003 |
| SR-P0-01-01 首轮事实链 | SR-BE-DEL-001 |
| SR-P0-01-02 原结果和已决定限制 | SR-BE-DEL-001, SR-BE-DEL-002 |
| SR-P0-01-03 回归与真人边界 | SR-BE-DEL-002 |
| SR-P0-02-01 C1C2固定源独立验收 | SR-BE-DEL-003, SR-BE-DEL-006 |
| SR-P0-02-02 C3复用完整流程 | SR-BE-DEL-006 |
| SR-P0-02-03 隔离交付可复现 | SR-BE-DEL-004, SR-BE-DEL-005 |
| SR-P0-02-04 凭据与评估分层 | SR-BE-DEL-003 |
| SR-P0-05-01 审计守卫回归 | SR-BE-GRD-001, SR-BE-GRD-002, SR-BE-MUT-001 |
| SR-P0-05-02 同key幂等回归 | SR-BE-GRD-003, SR-BE-GRD-004, SR-BE-GRD-005, SR-BE-MUT-002 |
| SR-P0-05-03 两个有效检错实验 | SR-BE-MUT-001, SR-BE-MUT-002 |
| SR-P0-05-04 取消协作单入口 | SR-BE-GRD-006, SR-BE-GRD-007, SR-BE-GRD-008, SR-BE-MUT-003 |
| SR-P0-05-05 取消原子性与当前步 | SR-BE-GRD-006, SR-BE-GRD-007, SR-BE-GRD-008 |
| SR-P0-05-06 有限静态门禁 | SR-BE-MUT-003 |
| SR-P1-01-01 真实两档数据 | SR-BE-DB-001 |
| SR-P1-01-02 计划与API实测 | SR-BE-DB-001 |
| SR-P1-01-03 证据驱动局部优化 | SR-BE-DB-002, SR-BE-DB-005 |
| SR-P1-01-04 时间线语义保留 | SR-BE-DB-003, SR-BE-DB-004, SR-BE-DB-005 |
| SR-P1-03-01 稳定原因与下一步 | SR-BE-DIA-001, SR-BE-DIA-002, SR-BE-DIA-005 |
| SR-P1-03-02 真实关联 | SR-BE-DIA-001, SR-BE-DIA-004 |
| SR-P1-03-03 恢复和有限历史 | SR-BE-DIA-002, SR-BE-DIA-005 |
| SR-P1-03-04 权限与脱敏 | SR-BE-DIA-003, SR-BE-DIA-005 |
| SR-P1-03-05 未知效果安全 | SR-BE-DIA-004 |
| SR-P1-04-01 保护当前托管目标 | SR-BE-POL-001, SR-BE-POL-002, SR-BE-POL-003, SR-BE-POL-007 |
| SR-P1-04-02 使用最新目标事实 | SR-BE-POL-002, SR-BE-POL-003, SR-BE-POL-007 |
| SR-P1-04-03 保留外部目标原规则 | SR-BE-POL-004, SR-BE-POL-005 |
| SR-P1-04-04 独立退群清理不变 | SR-BE-POL-006 |
| SR-P1-04-05 既有错误协议 | SR-BE-POL-001, SR-BE-POL-004, SR-BE-POL-007 |
| SR-P1-05-01 真实调用记录 | SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-004, SR-BE-USG-007, SR-BE-USG-012 |
| SR-P1-05-02 真实用量与未知 | SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-012, SR-BE-USG-013 |
| SR-P1-05-03 缓存不重复推理 | SR-BE-USG-003, SR-BE-USG-008 |
| SR-P1-05-04 有界存储与配置 | SR-BE-USG-004, SR-BE-USG-005, SR-BE-USG-006, SR-BE-USG-008, SR-BE-USG-010, SR-BE-USG-011 |
| SR-P1-05-05 记录失败隔离 | SR-BE-USG-005, SR-BE-USG-009 |
| SR-P1-05-06 允许字段与秘密 | SR-BE-USG-006, SR-BE-USG-007, SR-BE-USG-009, SR-BE-USG-011 |
| SR-P1-05-07 调用结果分层 | SR-BE-USG-001, SR-BE-USG-002, SR-BE-USG-012, SR-BE-USG-013 |
| SR-AUTH-01 仅准备授权 | SR-BE-DEL-003 |
| SR-AUTH-02 冻结与历史分离 | SR-BE-DEL-003 |
| SR-AUTH-03 QA独立维护 | SR-BE-DEL-001 |
| SR-AUTH-04 人工与上线分离 | SR-BE-DEL-002 |

前端与C1/C2主分区独立维护；本表只证明已编写后台条款追踪，不证明产品行为。P0-01承接既有首轮交付；P0-02引用现有C3 UI-008，不能按重复引用累计产品通过率。

每一变体需单独证据和子结果，部分通过不得签整例PASS；未形成故障窗口按相应未执行/阻塞记录。contract-mappings提供实际公开字段，contract-conflicts保留历史差异与5a53cc8窄澄清，不用开发实现倒推答案。
