# 同一实例多模块独立故障观察接入

本次响应第二轮 QA 的 `SR-BE-DIA-005` 接入缺口。QA 原固定产品源为 `5906d8d`，QA 源为 `87f5aea2519554616301f403643020b46e1d8a09`；本次研发改动基于 `2c1826bdee0665b3c57f5714603a59931c7d05ca`，仅增强显式工程观察脚本和开发测试。后续实际被测源以负责人重新冻结的完整提交为准，不能把旧 SUT 的 capability 当作新能力。本文件不是 QA 用例或验收结果。

## 缺口与最小变更

原公开 controller 对同一实例仅允许既有同 group/run 活动/生命周期观察组合；第二个 `module-fail-then-hold` 请求返回 409。真实基线开发复现见 `evidence/qa-multimodule-observation-20261002/before.tap`：同一 guardian、同一 API/应用进程创建 gateway 租约后，automation 租约被拒绝。两次单模块或两个 SUT 实例都不能替代同一进程的双模块同时失败。

新 controller 仅增加一种兼容关系：两条请求都为 `module-fail-then-hold`、实际 `target.apiUrl/pid/revision` 完全相同、`correlation.module` 不同。原 `locate` 仍核对 live instance/socket、完整提交、真实监听 PID、guardian/进程组、启动时间与资源 token。RuntimeObservation 原本就按模块名独占，且 gate、计时器、事件、advance、release 都归属各自 lease UUID；本次不改其阶段逻辑。

没有新增“正好两个”的数量限制：同一实例每个已注册模块最多一个未释放模块租约；现有真实 gateway 与 automation 可以分别注入。不存在的模块返回 404，同模块第二个租约仍 409，账号与模块混合仍 409，错误 target 或 UUID 改绑仍拒绝。不能通过两个独立 controller 绕开原已声明实例互斥，再把这种绕行当作本能力的验证。

## 稳定公开接口

原协议 `qa-runtime-observation/1`、控制器前缀 `/qa/runtime/v1`、请求 schema 与原状态/事件字段不变。capabilities 新增 **`module-tick-independent`**；原 `module-tick` 保留。QA 应先通过带实际 `apiUrl/revision/pid` 的 capabilities 查询确认绑定与能力。

使用一个控制器、同一个已核实的 SUT，给不同模块各自使用新的租约 UUID 和 attemptLabel。两个请求的 `target` 必须一致；以下为 gateway 请求，automation 请求仅更换租约 UUID、module、attemptLabel、faultMarker（TTL 可独立指定）。

```json
{
  "protocol": "qa-runtime-observation/1",
  "target": {
    "apiUrl": "http://127.0.0.1:ACTUAL_PORT",
    "revision": "ACTUAL_FULL_COMMIT",
    "pid": 12345
  },
  "ttlMs": 20000,
  "mode": "module-fail-then-hold",
  "correlation": {
    "kind": "module",
    "module": "gateway",
    "attemptLabel": "ACTUAL_UUID"
  },
  "faultMarker": "qa-runtime-gateway-independent"
}
```

| 操作 | 路径与含义 |
| --- | --- |
| 建立 | `PUT /qa/runtime/v1/leases/:uuid`，正文为上面的原请求结构；重放同一正文不延长 TTL |
| 读取 | `GET /qa/runtime/v1/leases/:uuid`，只读该租约快照及不可改写的历史 |
| 推进 | `POST /qa/runtime/v1/leases/:uuid/advance`，**无正文**，只释放该 UUID 当前已经命中的门 |
| 解除 | `DELETE /qa/runtime/v1/leases/:uuid`，**无正文**，幂等解除该 UUID 未来注入及当前门 |

不存在 UUID 的 GET/advance/DELETE 返回 404，不触碰其他租约。旧 UUID 的重复 DELETE 不解除同一模块后来的新 UUID，也不解除另一个模块。绑定只在首次建立时核实并固定；后续操作不会按模块名、API 端口或其他实例重新搜索替代租约。

## 同一进程事实与独立恢复

两条租约先分别出现 `module-failed` 和 `module-before-next-held`，再从**同一 SUT 的一次管理员 `GET /api/diagnostics/background`** 响应检查 gateway 与 automation 均为 failed。保存两条 binding、snapshotProvenance 的 applicationPid/applicationStarted、各自 module/attemptId 和公开诊断的 tickId；两个模块的失败关联应各自指回自己的 module/tickId，不能交叉覆盖。

只 advance A 一次后，A 进入 `module-running-held`；B 仍保持失败且其 tick/失败历史不变。再 advance A，实际 `module.tick()` 执行，原 scheduler/ModuleProgress 完成成功后才出现 `module-succeeded`，诊断保留 A 原 lastFailure 并标记 recoveredAt；B 此时仍 failed，不能被 A 恢复带动。随后独立推进 B，核对它自己的失败关联与恢复事实。

成功后的当前租约仍 held，须 DELETE 或 TTL 才允许后续普通 tick 持续进行。A 的 advance、DELETE、TTL 仅作用 A：B 的 gate、事件前缀、失败诊断和过期时间均不改变。TTL 继续为各自 5000–120000ms，由 SUT 和控制器双端按同一 UUID 清理；不替代真实模块完成，也不宣称数据库/网络工作已经取消。释放后的下一 tick 若再次实际失败，仍沿用真实失败判定，不能伪造恢复。

## 验证范围与资源

新增开发测试 `tests/integration/qa-multimodule-observation.test.ts` 通过公开控制器 HTTP 和真实 SUT 管理员 API 验证：同进程双失败、逐模块推进/恢复、A 的 DELETE/TTL 与旧 UUID 不影响 B 或新租约、重复模块/错误 binding/改绑/混合模式拒绝；原单租约及正常 main 不开放控制的测试继续保留。具体被测候选、结果、命令、原始记录与自有资源清理将在开发验证完成后归档，本文件此时不预填通过。

生产入口不导入这些观察脚本；仅设置环境变量不会开启控制。此补充不修改业务模块、公开后台诊断字段或故障判定、外部 gateway 协议、QA 工程目录，也不把研发证据记为 QA 用例通过。完整所有权与启动要求沿用[原接入契约](qa-runtime-observation-adapter.md)。
