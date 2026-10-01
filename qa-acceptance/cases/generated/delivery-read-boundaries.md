# delivery-read-boundaries.json 用例阅读版

由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。

<a id="INT-READ-001"></a>

## INT-READ-001 · 真实PostgreSQL表锁下发送状态读取不遗弃与同key恢复

- 需求：R-A5-10、R-A5-16
- 优先级：P0；方法：automated
- 自动化入口：tests/system/delivery-read-boundaries.spec.ts

**准备状态：dependency-pending；责任方：QA及工程观测交付**

1. 自动化实际加锁/真实采样/业务断言已编写，仅工具自测；待新候选固定后授权执行
2. 精确waitForDelivery→PG query归属及真实SUT取消/串行ROLLBACK关联尚缺公开见证，不能静默PASS；独立时限及副作用断言仍可判FAIL

**前置条件**

1. 固定产品/QA/目标授权指纹，真实自有PostgreSQL和tool-wait-witness；只向QaEnvironment注册的本例数据库加锁
2. 再次核容器ID、随机owner、唯一回环端口、数据库名/角色和表OID；schema仅定位故障，不决定消息业务结果
3. 真实原工具send-wait-started已出现且未交还；目标504发送已实际派发，后续查询503且无消息事件；锁前错过窗口只BLOCKED

**执行步骤**

1. 通过公开接口登录/建群/开启Agent；独立网关504真实落地但隐去事件，持有真实响应屏障并观察原run/tool/key/clientMsgId
2. 实际send-wait-started后在本例自有数据库单独连接BEGIN并持有messages ACCESS EXCLUSIVE；释放网关504响应，持续返回503，禁止用客户端包装延迟伪造数据库超时
3. 独立连接读取pg_stat_activity、pg_locks、pg_blocking_pids，保留原SQL、backend_start、query_start、xact_start、真实等待关系和本例locker持锁；读取候选不是自动认定waitForDelivery
4. 锁仍持有时采集真实工具交还及原5秒上下界；记录相同backend/query身份在交还后仍阻塞、idle transaction、退出或复用等诊断，不伪造SUT ROLLBACK事件
5. QA自有locker执行实际ROLLBACK后恢复网关；从公开历史观察同clientMsgId真实sent，再放行同key工具；验证原run持久步骤/实际history同attempt、审计与send各一次，独立落地一次
6. 所有已观察产品违约优先FAIL；缺特定工具与PG query的唯一关联、取消/串行ROLLBACK窗口仅BLOCKED，并保留已完成恢复断言

**预期结果**

1. 真实工具等待下界>5000ms为FAIL；上界<=5000且其余条件满足才能证明上限，跨界BLOCKED；持续未决不得提前SEND_TIMEOUT
2. 读不到新事实不能写成消息发送失败；释放后原clientMsgId历史唯一且最终sent；同key重用不新增审计/发送/真实副作用，真实工具历史与原执行attempt对应
3. 服务端取消及ROLLBACK清理必须关联实际查询；单个idle连接、客户端先返回或迟到query消失都不足以证明，不将QA locker的ROLLBACK冒充产品ROLLBACK
4. 当前公开tool-wait缺backend PID/backend_start/queryAttempt关联，保留该工程接入阻塞；不能用模拟回调填空或将源码说明/开发自测当PASS

**时序要求**

1. 严格产品工具等待上限5000ms，由已有原进程tool-wait见证判定；不从加锁或下一turn重设计时
2. 1500ms夹具锁获取、12000ms夹具持锁安全TTL、8000ms锁内观察、10000ms恢复采样均为QA资源预算，不新增产品SLA；超预算缺前提BLOCKED但已证明产品FAIL不被覆盖
3. 开发声明50/100ms PG切片仅作实现背景，不作为新的业务验收阈值；不伪造ROLLBACK回调尾差

**故障注入**

1. 仅在已确认归属数据库的独立连接持有真实ACCESS EXCLUSIVE表锁；不改业务行
2. 真实504效果+503确认不可用，保持原协议最多2秒副作用落地能力；无发送事件，避免提前确定结果

**取证**

1. 容器归属/端口和数据库身份、故障表OID、本例locker身份、每次实际pg_stat_activity及pg_locks/pg_blocking_pids原记录
2. 原tool-wait完整raw流、tool结果和history同attempt关联、HTTP公开消息与run步骤、独立网关/Agent请求及实际效果
3. 严格计时区间、原故障屏障、归属缺口、已得违约、QA locker实际释放与自有连接退出记录

**清理**

1. finally实际ROLLBACK本例locker，关闭两个自有PG连接；PG连接自设安全TTL兜底；不取消/终止任意产品或他人PG backend
2. 恢复本例网关、释放本例Agent/网关屏障及本例观察租约；额外清理失败留证，不覆盖已发生产品FAIL

**数据**

```json
{
  "projects": [
    "system"
  ],
  "tableFaultLocator": "public.messages",
  "lockMode": "ACCESS EXCLUSIVE",
  "toolId": "read-lock-send",
  "reuseToolId": "read-lock-reuse",
  "idempotencyKey": "read-lock-same-key",
  "requiredMaximumMs": 5000,
  "pgSampleIntervalMs": 20,
  "lockedObservationBudgetMs": 8000,
  "recoveryObservationBudgetMs": 10000,
  "fixtureLockAcquisitionMs": 1500,
  "fixtureIdleTransactionTtlMs": 12000
}
```
