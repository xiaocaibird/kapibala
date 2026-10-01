# 第二轮接入缺口与授权边界

材料已接收与驱动可执行分开。所有产品用例仍 NOT_RUN；PENDING 不等于执行所得 BLOCKED，CONTRACT_AVAILABLE 也不等于产品已验证。最终产品候选与独立执行许可均未冻结。

| ID | 状态 | 责任 | 剩余材料或动作 | 影响 |
|---|---|---|---|---|
| SR-DEP-CANDIDATE | PENDING | engineering-owner | 最终SUT SHA/diff、QA SHA、负责人审阅及独立执行许可、原文hash、配置和资源manifest；当前5e82是需求冻结而非SUT。 | 全部产品场景；当前仅静态准备，不据其他条件齐备自动运行。 |
| SR-DEP-FIRST-ROUND | AVAILABLE_INPUT | qa-owner | 第一轮签发报告及原始结果/源/限制/责任/真人反馈索引；引用不可修改，不从当前分支反算历史。 | 首轮材料已可得；仅版本化引用，不在本轮改旧结果。最终第二轮diff仍由SR-DEP-CANDIDATE待交，不把该依赖重复记为材料未交。 |
| SR-DEP-DELIVERY | PENDING | engineering-owner | 最终README命令、支持runtime/lockfile、配置/迁移schema、health、媒体/session/usage资源归属、启动/关闭/清理与最小权限；QA需独立owned driver。 | 安装复跑/故障/清理；无现成驱动不算自动化已接入。 |
| SR-DEP-MEDIA | CONTRACT_INPUT_AVAILABLE_FINAL_BINDING_PENDING | engineering-owner | 历史公开配置/时钟/协议已接收；补最终候选差异、实际独立driver和可信故障窗口，不再把已明确参数说成未知。 | 缺时钟或引用窗口不能用随机sleep/直接改库伪造；已明确的默认30天不等待重新决定。 |
| SR-DEP-MODEL | CONTRACT_INPUT_AVAILABLE_FINAL_BINDING_PENDING | engineering-owner | 历史公开配置/时钟/协议已接收；补最终候选差异、实际独立driver和可信故障窗口，不再把已明确参数说成未知。 | 离线协议/历史/恢复；不能补不存在的幂等/远端查询保证。 |
| SR-DEP-REAL-PROVIDER | PENDING | owner-authorization | 若真实证据不可替代：最小调用目的/次数和费用边界、凭据隔离方式、最终候选及明确执行许可；不提供真实key给报告。 | real-provider场景当前不执行；历史调用和替身通过不能替代当前真实结果。 |
| SR-DEP-UI | PENDING | engineering-owner | 最终公开控件/路由来源和站内兜底/支持关闭入口/预检摘要和载荷、身份切换与实际响应控制；不得要求内置测试按钮或隐藏状态。 | P0-03/04/P1-02；不存在的动作或真实前提不足记依赖，不编造按钮。 |
| SR-DEP-GUARDS | PENDING | engineering-owner | 两个最小mutation源/patch/命令/业务FAIL原件/清理；静态归属名单/允许协作与受控违规；关闭与资料/CAS事务真实故障屏障及外部行为取证。 | 缺事务失败注入时只能观察实际可见路径，不假称原子性故障窗口已覆盖。 |
| SR-DEP-DB-MEASUREMENT | PENDING | engineering-owner | 1000/10000数据生成及同毫秒/迟到分布、SQL映射、PG/index/statistics、EXPLAIN ANALYZE BUFFERS与API命令/结果、前后版本和回滚；QA独立受控库。 | 测量无新SLA；无法独立复现时相应证据项待补，不将旧开发样本伪成QA实测。 |
| SR-DEP-DIAGNOSTICS | CONTRACT_AVAILABLE_DRIVER_PENDING | engineering-owner | 按已冻结公开契约实现独立driver和真实故障/身份/资源取证；最终候选绑定及缺失细节仍待补。 | 尚缺字段/枚举不写成强制错误码；不要求新增页面。 |
| SR-DEP-MANAGED-POLICY | CONTRACT_AVAILABLE_DRIVER_PENDING | engineering-owner | 按已冻结公开契约实现独立driver和真实故障/身份/资源取证；最终候选绑定及缺失细节仍待补。 | 保护本身已批准；缺身份窗口/拒绝映射是接入待办，不需要重问是否保护，也不从当前实现反推。 |
| SR-DEP-USAGE | CONTRACT_AVAILABLE_DRIVER_PENDING | engineering-owner | 按已冻结公开契约实现独立driver和真实故障/身份/资源取证；最终候选绑定及缺失细节仍待补。 | 不得猜配置名、token默认0、保留数或成功响应deadline。 |
| SR-DEP-OWNED-FAULTS | PENDING | qa-owner-with-engineering-interface | owned DB/Gateway/Agent/provider实际请求和副作用账本、真实屏障/断连/进程退出/容量或事务边界、单调时钟和精确owner。 | 未接driver时用例保留完整手工步骤，readiness=driver-pending；不得以空脚本或skip声称覆盖。 |

## 公开契约增量

初始5e82四份需求来源保持原字节；追加同SHA C1/C2公开说明和aa41fc8三份公开交接/测量说明，并追加5a53cc8两份窄澄清，全部十一份hash见[baseline.json](baseline.json)。新DTO、身份与usage参数在[contract-mappings.json](contract-mappings.json)逐条记录，历史默认和新增字段均不能靠实现猜。诊断/托管保护/usage CONTRACT部分已接收，独立driver仍待接，故不继续笼统声称所有契约缺失。

aa41声明d46669a231d33612b86d0c4c83ca04f4a5226f57为开发最终源，仅记candidateInput；be3a53c组合开发结果与d466最终前端复验分列。finalSutRevision仍null，不把研发报告当第二轮正式提测或QA结果。

## 已关闭的窄语义差异

[CONFLICT-USAGE-001](contract-conflicts.json)已按5a53cc8文档窄澄清独立复核，状态为RESOLVED_BY_DOCUMENTED_CLARIFICATION。原同节目的已要求记录真实供应方usage；失败结果与用量已知性分开。成功HTTP取得的合法字段即使随后输出校验失败也保留；缺失/非法字段为null、明确合法0保留；非成功HTTP当前不解析body用量。旧OPEN历史、原快照和调整理由保留。这关闭文档判定差异，不证明工程行为通过，也不授权产品或真实模型执行。

## 首轮输入已可得

SR-DEP-FIRST-ROUND = AVAILABLE_INPUT。已只读git show核对固定3f08a2faf39142752065302e107fb25630748e26：

- qa-acceptance/reports/acceptance/20261002-current-delivery/report.md：SHA256 aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2，业务FAIL。
- qa-acceptance/reports/followup/20261002-dispatched-kick-budget/report.md：SHA256 acfecfffa8e05140f6198aa4bb23f50a0090874fb09909908e359af53e444e9f，raw FAIL、审定BLOCKED，整体FAIL不变。

准备基线ac5没有新目录不等于材料未交；从固定Git对象读取。第二轮diff仍等最终候选。二实例、真人、上线未执行义务均未因输入可得而关闭。

## UI依赖别名

| UI ID | 主依赖 | 来源 |
|---|---|---|
| FINAL-CANDIDATE | SR-DEP-CANDIDATE | cases/enhancements-ui.json |
| UI-PUBLIC-ADAPTER | SR-DEP-UI | cases/enhancements-ui.json |
| UI-RESPONSE-CORRELATION | SR-DEP-OWNED-FAULTS | cases/enhancements-ui.json |

共13项主依赖与3项UI别名；别名不增加业务或工程条款数。新真实provider费用/凭据使用必须另获许可，不因其他离线驱动就绪自动运行。
