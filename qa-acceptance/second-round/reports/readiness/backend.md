# 第二轮后台独立驱动就绪核对

本文件只记录独立QA资产准备，产品结果全部 `NOT_RUN`。48条后台用例分配为17条实际操作驱动、14条根任务交付/数据库/检错核查、13条C2用量驱动、4条真实故障窗口待接；17条中5条仍有明确未覆盖变体，执行时不能整例PASS。

入口：`tests/backend-flows.ts#runBackendCase`，root负责授权、固定main/QA/配置和独立QaEnvironment资源生命周期。返回统一 `RoundResult`，实际assertion才记FAIL，缺窗口/接口或基础设施故障记BLOCKED。

新增 `SR-BE-POL-008` 为两条从公开HTTP新run起步的工程故障交叉场景：无取消及已有取消。持真实PG意图门锁，证明真实blocker，按明确交接改变本例账号身份，收到真实work signal后才释放；核验POLICY_DENIED完整保存、取消优先级、原活动预算和零关联kick。没有预填active_ms，也不以开发的预置42.6秒实验替代。该工程身份变更不替代POL003公开connect响应变化场景。

已补模块真实tick失败/恢复、权限/轮换/注销、当前托管creator/admin/member/离线目标保护、审计等待及真实容量拒绝中的身份变化、普通外部目标与缺有权账号、清群服务成员一致性、审计拒绝/不确定三次、同key sent/跨run及拒绝后key复用、当前步骤关闭与资料CAS失败、真实event INSERT事务回滚。

QA自身6条pure-oracle测试通过；没有启动SUT。完整目录最新类型检查正在等待并行driver-factories的setMemberRole接入，不能把它记录成全项目当前PASS。

| 用例 | 责任/入口 | 当前准备 | 未覆盖变体 |
|---|---|---|---|
| SR-BE-DEL-001 | root | assigned | final root runner and evidence binding |
| SR-BE-DEL-002 | root | assigned | final root runner and evidence binding |
| SR-BE-DEL-003 | root | assigned | final root runner and evidence binding |
| SR-BE-DEL-004 | root | assigned | final root runner and evidence binding |
| SR-BE-DEL-005 | root | assigned | final root runner and evidence binding |
| SR-BE-DEL-006 | root | assigned | final root runner and evidence binding |
| SR-BE-GRD-001 | backend | operation-driver-implemented |  |
| SR-BE-GRD-002 | backend | operation-driver-implemented |  |
| SR-BE-GRD-003 | backend | partial-driver | queued/accepted/failed/unknown actual delivery-state retry variants |
| SR-BE-GRD-004 | backend | operation-driver-implemented |  |
| SR-BE-GRD-005 | backend | actual-window-driver-pending | GRD005: real send effect-after/crash plus second-instance recovery |
| SR-BE-GRD-006 | backend | partial-driver | concurrent profile update interleaving, covered separately by GRD007/008 only when actually executed |
| SR-BE-GRD-007 | backend | operation-driver-implemented |  |
| SR-BE-GRD-008 | backend | partial-driver | simultaneous lock-witness CAS pair；old worker actual permission-loss boundary |
| SR-BE-MUT-001 | root | assigned | final root runner and evidence binding |
| SR-BE-MUT-002 | root | assigned | final root runner and evidence binding |
| SR-BE-MUT-003 | root | assigned | final root runner and evidence binding |
| SR-BE-DB-001 | root | assigned | final root runner and evidence binding |
| SR-BE-DB-002 | root | assigned | final root runner and evidence binding |
| SR-BE-DB-003 | root | assigned | final root runner and evidence binding |
| SR-BE-DB-004 | root | assigned | final root runner and evidence binding |
| SR-BE-DB-005 | root | assigned | final root runner and evidence binding |
| SR-BE-DIA-001 | backend | operation-driver-implemented |  |
| SR-BE-DIA-002 | backend | operation-driver-implemented |  |
| SR-BE-DIA-003 | backend | operation-driver-implemented |  |
| SR-BE-DIA-004 | backend | actual-window-driver-pending | DIA004: unknown remote effect with paired applied/not-applied and safe advice evidence |
| SR-BE-DIA-005 | backend | partial-driver | two simultaneously held modules and selective recovery |
| SR-BE-POL-001 | backend | operation-driver-implemented |  |
| SR-BE-POL-002 | backend | operation-driver-implemented |  |
| SR-BE-POL-003 | backend | operation-driver-implemented |  |
| SR-BE-POL-004 | backend | partial-driver | pre-dispatch insufficient budget actual lifecycle/capacity boundary |
| SR-BE-POL-005 | backend | actual-window-driver-pending | POL005: dispatched unknown effect/budget/restart regression with first-round known differences |
| SR-BE-POL-006 | backend | operation-driver-implemented |  |
| SR-BE-POL-007 | backend | actual-window-driver-pending | POL007: C2 proposal and actual restart boundary |
| SR-BE-USG-001 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-002 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-003 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-004 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-005 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-006 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-007 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-008 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-009 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-010 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-011 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-012 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-USG-013 | media-provider | assigned | final actual provider process/wire and file observation binding; per-variant availability remains separate |
| SR-BE-POL-008 | backend | operation-driver-implemented |  |


资源清理：POL008及事务回滚窗口异常时先停止本例执行者，再释放门锁和桩屏障；仅移除当前随机schema/trigger/lease。实际执行后仍必须审查root统一cleanup结果。

C2 usage oracle 对有效/非法/缺失token逐字段判断，保留0且不补算；成功HTTP后输出失败仍failure并保留真实用量，非成功HTTP不从body推用量。写入队列、年龄、硬崩溃等专项仍由provider driver分别证明，不靠sleep或复制日志判过。
