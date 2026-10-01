# UI-039 公开排队补证首轮只读审定

**raw FAIL 保留；整例审定 BLOCKED，归因 QA 重复登录导航错误。**

- 原始 run：`2026-10-01T15-56-07.250Z-42ecefbf`；phase：`developer-preflight`。
- SUT：`8e047aea842bfcec64802e4918b52b460b93c48b`；QA：`b076790de087406de12336bdfd385a569b014f83`。
- target SHA-256：`1dd9aed24f3d4692aefc6b342fa1fd78794bea833ef0be85f26b3e7db3788a02`；实际模型 timeout 配置 15000ms。

| 子场景 | 实际 runId | 公开状态/步骤 | UI 审定 |
|---|---|---|---|
| failed | `bc5d4c64-5b8e-46da-98ee-f479712e22d4` | failed / wall_clock / 0 | PASS：实际可见失败、wall_clock、0 / 12、暂无步骤记录，无等待第一步 |
| cancelled | `456d0f04-b9df-464f-bc65-6c2ea2313ae3` | cancelled / cancelled / 0 | BLOCKED：后端前提 PASS，页面未进入，不能判断文案 |

四个不同 holder 首请求已真实进入且尚无响应完成；两个目标此前均 running/steps=[]/零模型调用。472 次观察，约 50717.054333ms 后两个目标均为真实所需终态。最终完整独立账本核算两目标 model/audit/send/kick/own-message 均零，活动引用均已清空。这个持续时间只描述本轮造数，不替代活动预算断言。

第一次浏览器登录于 `2026-10-01T15:57:08.173Z` 返回 200，failed run 详情实际 GET 200，逐状态原始结果已记 failed PASS。随后脚本在 trace `61140.602ms` 再次 goto `/`；真实 refresh 200、me 200，页面恢复到已认证 admin 群组工作台。`61176.367ms` 开始等待不存在的 username，最终全例 120000ms 超时；raw duration `120335ms`。错误栈指向测试 login 的 username.fill，而非产品取消状态展示。`ui039-cancelled-copy.json` 不存在，未到取消详情。

依据是原始 trace、公开网络响应、页面快照与逐状态事实，不按源码猜测产品行为。源码只核对冻结 QA 的循环内重复 login 位置。允许已登录入口恢复工作台，不能反过来要求产品为了测试显示登录框。

最小后续修正：在两个状态循环前只登录一次，再分别从公开群入口进入真实 run。必须新 QA 版本另跑补证；不覆写本轮 FAIL、不把 failed 的通过扩充为整例通过、不伪补取消页面结果。归档 QA dirty 列表仅为未追踪报告资产的事实单独保留，原 phase 不变。

完整身份、逐状态字段、trace 时间线和原始文件哈希见 [JSON 审定](ui039-queue-first-review.json)。本记录仅写新 review 文件，没有编辑原始证据或启动产品。
