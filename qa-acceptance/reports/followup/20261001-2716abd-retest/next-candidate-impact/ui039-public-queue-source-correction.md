# UI-039 公开路径落地纠正（追加记录）

根任务确认已有 8e delta 批次结束并解除 `02ea807` 源码冻结后，获准将本目录公开工作负载草稿落实到 QA。只改 `tests/ui/console.spec.ts` 的 UI-039 body 和一个 Agent 协议类型 import、`cases/ui.json` 的 UI-039 及对应生成阅读段；UI-038 和其他用例不变，原冻结执行树/日志/报告不改。

此前认为 failed 零步骤必须等待新工程 hook，是对可用公开路径考虑不足。现在先尝试预建六群、四个真实长任务占用执行资源、两个真实 run 等待的路径。它只在实际公开状态和完整外部账本证明前提后成立，既不把内部槽数四变成业务需求，也不依据预估 51 秒宣称成功。此前 `dependency-pending` 准备记录和 UI-039 首次 BLOCKED 是当时实际状态，全部保留；本次 `script-ready` 表示现有协议下可执行的补证脚本，不表示已通过。

四个 holder 首模型请求必须由实际 runId、公开群和触发 context 相互对应，且响应尚未完成。后两轮按真实 runId 绑定，审计按实际 groupId/text 核对。两个目标各自都要先观察到 running/steps=[]/零模型请求，取消目标再通过公开 PATCH 关闭 Agent；其后必须取得真实 failed/wall_clock 或 cancelled/cancelled 且仍零步骤和零模型请求，才能各自检查页面。

两个目标独立记录，未形成一个状态不覆盖另一个真实页面结论；已发生的明确 FAIL 优先于任何前提 BLOCKED。两个都具备真实状态与可见文案证据才可整例 PASS。缺前提继续 BLOCKED，没有 SQL 造数、强制状态、假接口或改写已记录步骤。

根任务提供独立 target 设置 `AGENT_TURN_TIMEOUT_MS=15000` 并重新冻结 hash/授权。用例自身验证该显式配置，`120000ms` 测试超时和 `70000ms` 观察上限只是诊断预算，不增加业务 SLA。真实 60 秒/5 秒边界及历史 FAIL 保持原判据。该 UI 场景不代替完整活动计时专项。

源完成后的限定自检见 `ui039-public-queue-source-static.json`；原草稿 4/4 纯工具自检仍单独保留。本阶段只做类型/静态/工具校验，没有运行 SUT、PG 或浏览器；正式补证由根任务另冻结新 QA 后执行。
