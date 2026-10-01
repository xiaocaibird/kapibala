# UI-039：公开工作负载建立零步骤终态的补证草稿

新事实：主任务提供了可复用的公开路径。此前“必须新增工程 hook 才能造数”的判断不充分；可以先尝试让四个真实长任务占用执行容量，再让另外两个真实已创建 run 等待，从公开行为取得零步骤终态。**这不改原 UI-039 首次 BLOCKED，也不表示新场景已跑通。**

当前冻结 QA `02ea807faed44ebaed8a41741f4056de8e04e87a` 未修改。仅新增报告区 [夹具草稿](ui039-public-queue-fixture.draft.ts)、[纯工具测试](ui039-public-queue-fixture.test.ts) 与本说明。根任务在已有批次结束后另行冻结 QA/target、执行补证；本准备没有启动 SUT、PG 或浏览器。

## 实际协议映射与顺序

1. 新独立环境先通过公开 API 建好六个 active、agentEnabled=false 的群，避免建群占用首个 14 秒窗口。专用 target 必须显式设置 `AGENT_TURN_TIMEOUT_MS=15000` 并重新绑定 hash/授权；不可在现行 12000 配置运行中偷偷修改。
2. 四个 holder 各三轮：`get_recent_messages` → `send_message` → `finish`。独立 Agent 每个模型响应 `responseDelayMs:14000`；审计合法 pass 的 `responseDelayMs:4000`；四群各自 Gateway `/groups/:gatewayGroupId/send` 的实际 `effectDelayMs:10000`、`responseDelayMs:10000`。这是当前 QA 桩的真实字段，未套用工程模拟器私有字段。Gateway send 为异步副作用，两个 10 秒等待并行开始，并非额外串行 20 秒；原工具 5 秒状态等待可先结束。
3. 仅首轮排四个完全相同的全局计划。在独立账本证明四个**不同实际 runId** 各已收到第一个请求、请求的触发 context groupId 对应其公开群、四个响应尚未完成，同时公开状态 running/steps=[] 后，才开始目标造数。没有用源码中的容量常量当验收 oracle。
4. 随后的 send/finish 都用 AgentResponsePlan 现有 `runId` 绑定真实 holder，不用“4 个第二轮刚好先于所有第三轮”的偶然全局顺序。审计协议只有 groupId/text，没有 runId；四个相同延迟 pass 可全局排队，但原始账本须核对全部属于四个 holder 的实际文本与群。目标任何模型调用都不会误用 holder 的第二/三轮计划。
5. 在已建立四个 holder 首请求事实后分别公开触发两个目标；保存两者 running、steps=[]、完整 Agent 账本零对应模型请求，再公开关闭取消目标的 agentEnabled。连续采样两个目标及四个 holder 的真实状态，保留完整 Agent/Gateway 请求账本。
6. `14+14+4+5+14 ≈ 51s` 只是这个造数方案的估计，不是产品期限或成功断言。只有真实 failed/wall_clock/steps=[] 且从未派发模型的目标，和真实 cancelled/cancelled/steps=[] 且从未派发模型的目标，才分别具有页面前提。目标已派发、有步骤、holder 早结束、时间不足或有限诊断未得到目标状态时保留对应 BLOCKED；不改状态来凑前提。

“排队”证据表述限定为：四个真实未完成请求已建立、两个 run 已公开创建并处于 running/steps=[]、完整独立请求账本始终无目标派发。公开 API 没有 queue position/slot 字段，报告不伪造内部排队字段，也不主张每个采样间隙都有一个独立公开队列快照。请求账本完整保留，因此曾发生的目标派发不会因轮询间隔丢失。

## 与 UI-039 正式 body 的接合

将原模型响应屏障的单目标尝试替换为此函数；其返回两个角色的真实公开状态、各自 ready 与 blockers。每个 ready 状态都独立执行现有登录→群→真实 runId 链接→详情检查，使用 hash 路由的真实 href，验证终态、无步骤说明且没有等待第一步。一个状态未成立不妨碍另一状态留证；一个明确文案失败不能被另一状态 BLOCKED 覆盖；两个状态都完成才可整例 PASS。

本函数仅建立 UI 前提，不替代 AGENT-025/CAP-003 的严格活动/终态时限验收。零步骤状态自身、活动引用清空、无目标模型/审计/发送/踢人/落地消息分别断言；没有 SQL 修改、API 响应覆盖、DOM 造数、生产容量参数更改或新观察协议。

未来 wrapper 应给足六群准备＋真实约一分钟＋两次页面读取的**测试诊断预算**（建议 `test.setTimeout(180000)`，不是业务 SLA）。没有额外控制器或屏障需要 release；普通 QA fixture 的 finally 负责本次 Agent/Gateway pending task、SUT、数据库和浏览器清理，禁止结束其他任务持有者。若执行提前退出，先保留全部账本再依正常环境关闭。

## 工具验证边界

见 `ui039-public-queue-typecheck.log`、`ui039-public-queue-selftest.tap`、`ui039-public-queue-static.json`。自测只在内存构造计划和观测对象，验证真实身份绑定、乱序取计划、首次四请求证明、零步骤分类及已知违约优先；没有调用夹具函数或启动产品。原冻结源码字节检查单独记录。
