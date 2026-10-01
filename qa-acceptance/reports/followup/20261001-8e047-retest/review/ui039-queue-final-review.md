# UI-039 公开排队最终补证只读审定

**raw PASS，独立审定 PASS；范围为该版本 Chromium 的 UI-039。首轮 raw FAIL／审定 BLOCKED 保留。**

- run：`2026-10-01T15-59-57.698Z-99a9ac63`；原始 phase：`developer-preflight`。
- SUT：`8e047aea842bfcec64802e4918b52b460b93c48b`；QA：`1edbcaf7daead815058137568f6aad91d5000db9`。
- target SHA-256：`1dd9aed24f3d4692aefc6b342fa1fd78794bea833ef0be85f26b3e7db3788a02`；模型请求 timeout 配置 15000ms。
- 原始耗时 62213ms；runner passed，runnerErrors 为空。

| 子场景 | 实际 runId | 公开状态 | 页面与复核 |
|---|---|---|---|
| failed | `f47244d1-01d5-4895-a934-243e9cae7a5f` | failed / wall_clock / 0 步 | PASS：失败、wall_clock、0 / 12、暂无步骤记录，无等待第一步 |
| cancelled | `9708a4bf-ce44-4faa-aa7a-496ed4f5656e` | cancelled / cancelled / 0 步 | PASS：已取消、cancelled、0 / 12、暂无步骤记录，无等待第一步 |

四个不同 holder 首次模型请求均已真实进入、当时尚未完成，并与各自真实 groupId 绑定。最终外部账本各有三次 holder 模型请求。两个目标在禁用前均已公开呈现 running / steps=[] 且无模型派发，随后 472 次观察（50776.690459ms）取得两种真实终态。该时长描述造数观察，不替代活动预算证据。

独立重数最终 Agent/Gateway 账本：每个目标 model、audit、send、kick、own landed message 均为 0；外部触发消息未被误计为自有发信。API 在查看前后分别确认目标终态和 activeAgentRunId=null。两个详情均留有逐状态实际可见文本；最终取消页截图已人工核阅，页面状态、0 / 12 和“暂无步骤记录”可见，pageErrors 为空。

与首轮冻结 QA 的精确差异仅为把 login 从逐状态循环内移至循环前一次；产品版本、target 和业务断言没有改变。原首轮重复登录导致的 raw FAIL 与取消页未执行事实见 [首轮审定](ui039-queue-first-review.md)，本次不覆盖其结果。

清理日志于 `2026-10-01T16:01:01.532Z` 记录 failures=[]，仅支持本轮自有清理记录无失败；本复核没有重新连接 Docker 或宣称全机资源全部清除。PASS 运行配置为 retain-on-failure，因此没有 trace.zip；不将不存在的浏览器 trace 当证据。此 PASS 不外推为8e全量业务验收通过、不提供严格60秒/5秒或真人IME/焦点结论。

身份、完整页面文本、四个 holder 绑定、独立计数、精确 QA 修正 diff 和原始文件哈希见 [JSON 审定](ui039-queue-final-review.json)。仅写新 review 文件，没有编辑源码、旧报告、原始证据或执行产品。
