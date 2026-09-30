# ActivityClock 关键阶段记账加强

2026-10-01。关联 **CG-08 / Q2 / D040**；基线 `6d690c9`，实现与专用测试提交 `6d83410`。负责人选择加强现有记账，不引入持久预扣预算；本批不改外部协议、迁移、gateway 或独立 QA。

[原始 A5.2](original-interview-question.md)要求从 run 创建起累计 60 秒，包含审计等待，重启后继续累计且停机不计。以下把普通运行、计量基础设施故障、硬崩溃尾差分别记录，不把局部加强写成任意崩溃零误差。

## 修前机制与反例

原实现由一个持有 PostgreSQL session advisory lock 的 ActivityClock 写入所有可运行 run 的 `active_ms`；保留 500ms 后台采样及调度 tick 的既有入口。follower 经过初始化屏障，不能重设仍在线 owner 的时间基线。新 owner 先重新建立基线以排除停机，本地 deadline 控制正在执行的 run。

原模型/审计阶段没有持久检查点，正常结束也没有专门补记最后一次采样后的尾段。基线专用测试中，真实模型 HTTP 等待 **141.07ms** 后正常结束，最终 `active_ms=0`：测试只启动一次 tick，结束发生在下一次 500ms 后台采样前。该反例不是数据库宕机；生产调度 tick 会提供额外采样机会，但不能保证每次完成前恰好已采样。原始失败保留在[修前日志](evidence/core-activity-accounting-before.log)。

硬终止反例也继续保留：事件循环卡住时，500ms 的配置不构成硬误差上限。不能把采样频率称作“最多丢 500ms”。

## 实施内容与不变量

- 模型请求前、收到响应或请求失败后，审计尝试前、收到审计结果后，以及 run 终态提交前加入持久检查点。前置检查点等待后重新计算剩余预算；没有预先扣除未来时间或重新赠送本地 deadline。
- owner 在原持锁连接上串行补记当前 run。检查点要求在新阶段边界之后的新采样，不能把先前已在途的查询当作确认。
- follower 不直接更新 `active_ms`。它通过 PostgreSQL `LISTEN/NOTIFY` 唤醒 owner，随后读取**已提交**的目标 run 时间戳；通知只是易失提示，不能授权继续。schema 与锁的作用域一致，丢通知仍有既有周期采样兜底。
- 周期全量采样保留一个去重的排队机会；连续定向通知按批交还队列，防止只服务活跃 run 而饿死正在等待执行槽的 run。没有提高后台采样频率。
- 检查点使用约 1500ms 的等待预算，覆盖连接获取、排队及查询；clock 持锁连接另设 1200ms 的 PostgreSQL `statement_timeout`，并保留客户端超时保护。失败连接销毁，健康连接释放前取消 LISTEN、释放锁、重置专属 timeout。池队列无法使用公开 API 取消时，迟到 checkout 只归还连接，不执行该阶段 SQL。
- 超过 750ms 记录检查点延迟，失败记录 run、phase、耗时和是否为 owner；没有新增业务诊断接口或数据库状态。事件循环本身若被阻塞，日志和客户端定时器仍只能在恢复后执行，所以这些配置不是任意系统故障下的硬返回时限承诺。
- 记账错误位于远端响应的 catch 之外，不能被吞成 BAD_JSON 或无明确审计结论。模型前失败不会设置 inflight 或发请求；模型后失败保留 inflight 和现有“未记录响应不可安全重放”保护。审计前失败不消耗尝试次数；审计后失败不保存 pass、不执行工具，也不在本次执行中自行继续下一次审计。

## 分项证据

专用测试为 [core-activity-accounting.test.ts](../tests/integration/core-activity-accounting.test.ts)，所有数据库使用专用 PostgreSQL 64550 上的新 UUID 库。

| 类别 | 场景与结果 | 原始证据 |
| --- | --- | --- |
| 普通模型阶段 | 模型等待 **140.23ms**，正常结束时持久 `active_ms=178`，包含其他在线编排时间；不预扣未来预算 | [专项日志](evidence/core-activity-accounting-tests.log) |
| 审计等待与 follower | 审计等待 **140.24ms**；总测量 **360.17ms**、持久活动 **326ms**；记录表只出现原 owner 一个写入 PID，审计 fail 没有发送 | 同上 |
| 真实 60 秒预算 | 既有真实计时场景不预置剩余预算，60 秒到达后以 `wall_clock` 结束，未耗尽 12 步；测试总时长 **60053.93ms**。原断言验证 run 耗时落在 59.5–65 秒窗口，测试总耗时不冒充精确 run 耗时 | [最终回归日志](evidence/core-activity-accounting-regression-final.log) |
| 真实审计/模型超时 | 三次 5 秒无结论审计阻塞且不发送；默认 12 秒及配置 10/15 秒模型超时丢弃迟到响应；10/15 秒实测分别 **10009.82 / 15014.12ms** | [回归日志](evidence/core-activity-accounting-regression-final.log)、[计时日志](evidence/core-activity-accounting-timing-final.log) |
| 阶段写账失败 | `model:before/after`、`audit:before/after` 四个 PG 强制失败均阻止下一阶段；没有发送键、没有自有出站消息，没有误计协议错误 | [专项日志](evidence/core-activity-accounting-tests.log) |
| 有限等待 | 池耗尽约 **1500.19ms** 拒绝，迟到 checkout 归还；PG 行锁阻塞约 **1205.84ms** 取消，原 owner 锁归零后可接管 | 同上 |
| 排队 run 不饿死 | 约 1.2 秒中持续 **194** 次定向唤醒，另一个排队 run 已持久活动 **1007ms** | 同上 |
| owner 无响应 | owner 事件循环被阻塞，follower 约 **1513.38ms** 未取得确认而停止；强杀 owner 后接管，活动值从 1ms 到 5ms，没有把整段未观测期间算入 | 同上 |
| 关闭、重启、接管、取消 | 既有排队 run 记账、双实例不双计、初始化屏障、阻塞 owner 被终止后的 follower 接管、正常关闭后停机不计、毫秒保留、取消/锁丢失测试均通过 | [最终回归日志](evidence/core-activity-accounting-regression-final.log) |
| 硬崩溃剩余边界 | 已持久 **489ms**；事件循环被卡住后强杀，仍有 **1170ms 在线尾段未记账**。实际停机 **708ms**，重启即时补计 **0ms**，随后在线采样恢复 | [计时日志](evidence/core-activity-accounting-timing-final.log) |

最终：**专项 10/10 + 自动化/接管回归 67/67 + 真实计时/硬杀 3/3 = 80 通过，0 失败，0 跳过**。TypeScript [类型检查](evidence/core-activity-accounting-typecheck.log)、限定文件格式检查及 `git diff --check` 通过。未运行独立 QA 验收、未切换演示环境。

首次故障运行的 [8/10 日志](evidence/core-activity-accounting-first-fault-run.log)完整保留：一项暴露“仅关闭 TCP 客户端不能保证 PG 行锁等待立即退出”，因此增加服务端 statement timeout；另一项是专用测试误把两个 running run 放在同一群，违反已有唯一约束，已改为两个群。没有调高业务预算或删除失败证据。较早的[64 通过/3 长计时跳过回归](evidence/core-activity-accounting-regression.log)也保留；最终结论以上面的全部开启版本为准。

测试日志可能包含强制断连或 UUID 库清理期间的 PostgreSQL idle-connection 错误输出；保留原文，不能据通过数宣称测试中没有故障日志。清理后另查本批日志涉及的 **60 个 UUID 数据库**，剩余为 0，见[清理记录](evidence/core-activity-accounting-cleanup.json)。共享专用 PG 容器未停止。

## 实际剩余边界

本次缩小正常阶段和正常结束时的未持久化尾段，并在无法确认记账时阻止下一次外部行为。没有独立于进程/数据库的在线时间事实：在某次检查点之后、下一次成功落库之前的强杀，或者事件循环长时间卡住、数据库不可用后接管，仍可能丢失已在线但未持久化的时间。新 owner 继续沿用重建基线以排除停机的规则，不能区分整段未知区间中多少属于在线。该边界不伪装为固定上限，也不把它改成预扣时间片。

查询时限保护的是本次观察和继续执行的门槛，不保证 PostgreSQL/操作系统/事件循环任意故障下都在精确 1500ms 返回。共享 clock 的查询若遇到大范围阻塞，会安全退出并沿用接管，而非保证所有群完全不受影响。更大并发、调度隔离或新的计量事实来源仍是另行评估内容。

## 重跑

在项目依赖可用且显式设置专用 `DATABASE_URL` 后：

```sh
./node_modules/.bin/tsx --test tests/integration/core-activity-accounting.test.ts
AUTOMATION_TIMING_TESTS=1 ./node_modules/.bin/tsx --test \
  tests/integration/automation.test.ts \
  tests/integration/core-automation-repair.test.ts \
  tests/integration/core-automation-closeout.test.ts \
  tests/integration/agent-capacity.test.ts
CORE_AUTOMATION_TIMING_TESTS=1 ./node_modules/.bin/tsx --test \
  tests/integration/core-automation-timing.test.ts
npm run typecheck
```

第二条包含真实一分钟预算；第三条包含真实 10/15 秒超时及子进程强杀。数据库夹具复用提前注册清理的 `temporaryDatabase`。日志记录的是本批提交在专用环境上的开发自测，不自动改变人工验收结论。
