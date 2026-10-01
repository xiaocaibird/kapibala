# CAP003：kick 截止派发的部分修复

基线 `fb1589df08f00c10e9e62801007b1698d4d0155a`，源码提交 `07717d1ee8774a0950b2fd64bfe9341172d57bc0`，独立分支 `agent/qa-budget-dispatch-followup`。

**本批修复已复现的过期派发与错误归因，不能把 CAP003 严格终态 60000ms 上限改判 PASS。** 没有改 QA 目录、原文、既有断言、业务阈值、活动计量或崩溃尾段约定；没有提前使用 `wall_clock`。原正式 QA 的 `[60010,60112]ms` 失败证据仍然有效，不能用下面开发测试的通过数覆盖它。

## 实际修复

kick 准备事务可能消耗最后的预算。原实现随后用 `Math.max(1, remaining)` 新建 1ms signal，继续进入准入；现在事务返回后按原 deadline 重查，耗尽就进入既有终态流程。

新增可选、同步且可重复调用的 `assertDispatchAllowed`，贯穿 Agent、MessagingService、网关包装器和 RemoteClient。真实 dispatch intent 的 SQL 前后、异步边界之后都检查原期限，最终在请求体序列化完成后、直接调用 `fetch` 前再检查。原 AbortSignal 仍负责取消；没有预算门禁的 RemoteClient 调用保持原行为。门禁只传给首次 POST `/kick`，不传给已经派发后的 `/members` 查询。

门禁由私有内部错误类表示“本次 fetch 尚未开始就耗尽”。调用方先检查运行所有权，再按该错误提交 `failed/wall_clock`，不会凭空写入外部结果未知。已经真正派发后的超时仍保留未知效果。真实已提交的 `dispatching` intent 不回退为可重放状态，也不将当前进程内的未派发证明写成跨崩溃保证。

## 先反例、后修复

新建测试先在未改产品的基线上运行：3 例失败，1 例正常路径通过。[原始反例](evidence/cap003-dispatch-followup-before.log)与[相同四例修后结果](evidence/cap003-dispatch-followup-after.log)均保留。

| 真实触发                                                                  | 修前                                                         | 修后                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| 仅余 200ms，PostgreSQL 准备 intent trigger 实际等待 350ms                 | 仍进入 kick 准入 1 次，误写未知效果                          | 准入 0 次、HTTP 0 次、无 recoveryNote  |
| 最终请求前同步阻塞 1500ms，跨过仅余 1000ms 的期限；定时器尚未获得执行机会 | `signal.aborted=false`，仍调用 kick fetch 1 次，误写未知效果 | fetch 0 次、HTTP 0 次、无 recoveryNote |
| 请求对象的实际 JSON 序列化阻塞 60ms，跨过 30ms 的真实单调时钟期限         | 本地 HTTP 服务实际收到 1 次请求                              | 序列化后门禁拒绝，服务收到 0 次        |

第二例的 fetch 调用计数是实际 fetch 的透传计数；不把调用 fetch 等同于远端必然收到。第三例单独证明真实 HTTP 接收差异。没有伪造时钟或改写运行预算；前两例只在独立测试创建 run 时设置已有活动量，以隔离短窗口，不冒充完整一分钟验证。

首次修后短窗口的原始持久量为 **60209ms / 60542ms**；后续组合回归为 **60207ms / 60543ms**。这些越界值完整保留，不以成功阻止派发抵消真实活动。修前第一例误写 recoveryNote 后的持久量为 59841ms；它并不能证明真实耗时小于 60000ms，SQL 等待和错误暂停边界仍需分别看待。

## 定向验证

- [专项组合](evidence/cap003-dispatch-followup-regression.log)：13/13，包括新增 7 例、原模型/审计晚派发 2 例、原容量等待 4 例。新增覆盖 timer 已触发但未派发、终态持久化真实失败后的模块替换不重放、真实已派发请求超时继续保留未知，以及正常一次 kick/一次审计。
- [所有权、重启和排队](evidence/cap003-dispatch-followup-related.log)：automation 10 例通过。另 2 个受控进程用例首次因源码尚未提交而被入口拒绝启动；未绕过版本校验，提交后单独补跑。
- [网关和 CAP009 关联](evidence/cap003-dispatch-followup-gateway.log)：8 例通过，覆盖真实 HTTP/504/成员查询、已确认效果及非 guardian 恢复。另 4 例首次同样被未提交源码保护拒绝；原失败记录保留。
- 固定 `07717d1` 后，[guardian 补跑 5 例](evidence/cap003-dispatch-followup-guardian.log)与[派发后 SIGKILL 补跑 1 例](evidence/cap003-dispatch-followup-dispatched-kill.log)均通过，覆盖全部 6 个此前未启动的用例。
- 合计 **37 个不同的定向测试通过**，不包含重复的首次四例，也不把一分钟 measurement-only 作为严格预算验收通过。TypeScript server/scripts/tests 检查、产品/测试源文件 Prettier 和 `git diff --check` 通过。原始失败日志保留 Node 输出的空白缩进行，因此原始 `.log` 不纳入源码空白检查，也未为消除空白告警改写证据。

终态写入失败的新测试使用真实 PostgreSQL trigger 拒绝终态 UPDATE，随后关闭旧模块并创建替换模块。它证明保存的 `dispatching` 不会被重放；替换模块按已经耗尽的预算结束，不证明 SIGKILL 或 `recovery-paused`。真正 SIGKILL 的证据来自上列既有 guardian 用例。

## 剩余限制

固定源码 `07717d1` 的[原 DC06 真实一分钟测量](evidence/cap003-dispatch-followup-minute.log)记录：持久活动 **60005ms**、完整无崩溃场景的活动区间 **[60005,60108]ms**、独立 `performance.now()` 区间 **[59991.333042,60008.0295]ms**。两区间相交，没有本轮计量矛盾；但活动下界超过 60000，**严格 CAP003 继续 FAIL**。公开结果 `failed/wall_clock`、0 次 kick、1 次审计；measurement-only 测试的通过仅代表观察流程完成。

当前无崩溃容量等待仍在期限到达后执行检查点、锁等待、终态事件与 COMMIT。这些真实活动不被本补丁删去。同步门禁也不是对操作系统调度、网络字节发出时间、远端取消或数据库提交最坏延迟的证明。锁等待和事件循环阻塞没有可证明的零尾差边界。

因此本批是部分修复；既不新增容差，也不改变“终态提交计入活动”和“不得提前假称耗尽”。若保持现有全部严格边界，CAP003 仍未满足。任何结束边界变更须另有负责人明确决策，本批没有采用。

## 隔离与清理

本任务创建独立容器 `kapibala-budget-followup-20261001`，只绑定 `127.0.0.1:53073`，使用任务标签和独立凭据；每个场景由 `temporaryDatabase` 新建 UUID 数据库。没有使用现有演示容器，也未修改 QA 数据库、QA 目录、root 工作树或冻结工作区。

[清理记录](evidence/cap003-dispatch-followup-cleanup.json)确认全部 UUID 数据库与连接均为 0，日志记录的 guardian PID 全部退出；核验创建时的 container ID/归属标签后仅删除该容器及其匿名卷，并验证不存在。临时 `node_modules` 链接已移除。既有 staging `.runtime/qa-fixtures/5d1885e76871460bb0c146fd4cc90032` 保留。未合 main、未 push、未联系 QA。
