# QA 联调修复与接入最终交付

2026-10-01。本批产品、显式观测入口及隔离启动的最终源码为 **`8c92b3491ade262b2f81e3257d3809be02223529`**；后续交付提交仅整理文档和原始执行证据。QA 应绑定交接消息中的完整固定提交，不跟随 main 变化。QA 初始候选 `0af6443`、第一批 `ffdc8b0`、第二批 `0039521` 各自的运行结果保持独立，不能拼成最终版本全业务通过。

## 已交付范围

| 内容 | 结果与材料 |
| --- | --- |
| CAP009 容量拒绝后崩溃 | 修复持久准入身份及恢复判定；真实强杀恢复仍执行一次 kick，未知派发仍暂停。见[修复记录](cap009-repair-handoff-20261001.md)及[第一批](qa-remediation-batch1-20261001.md)。 |
| CAP003 模型/审计晚派发 | 持久 intent 等待后重新计算剩余预算，已耗尽时不发新请求；严格 60 秒完成保证仍未闭合，见[预算边界](cap003-budget-feasibility-20261001.md)。 |
| 消息接收/超时观测 | 真实 504 后保存前、receipt 提交前、receipt 已提交而业务尚未更新三类窗口；不伪造提交、不补写业务结果。见[消息接入](qa-message-observation-handoff-20261001.md)。 |
| 账号与模块观测 | 原事务 savepoint 的真实 SQL 错误、实际后续请求锁等待、外层提交确认及真实 tick 生命周期。见[runtime 接入](qa-runtime-observation-adapter.md)。 |
| 活动观测与安全屏障 | 同一真实 run 的 observe/safe 租约并存；只读工具结果和 history 持久后、下一轮调用前保持；真实强杀后续跑。见[活动见证](qa-activity-witness-20261001.md)。跨重启完整计量不冒称已实现。 |
| 单一 SUT 组合入口 | `scripts/qa-observation-server.ts` 同时组合 capacity/message/runtime；目录须规范化后互不相同；显式远端地址缺失时在数据库前拒绝启动。默认 main 不安装 observer。 |
| 控制器顺序保护 | 同一租约 GET/advance/DELETE 顺序处理，避免迟到读取把 released 恢复成 held；历史与新实例隔离。 |
| 可移植独占启动 | `npm run dev:isolated`：随机端口、新容器/卷/数据库、独立模拟状态，真实 API/WS 代理，所有权校验后精确清理。见[README](../README.md#全新隔离启动)及[复现记录](isolated-local-reproduction.md)。 |

## QA 接入与资源边界

由 QA 自己的 guardian 启动固定提交下的 `node --import tsx scripts/qa-observation-server.ts`。显式提供隔离 `DATABASE_URL`、`PORT`、`GATEWAY_URL`、`AGENT_URL`、真实 `QA_ACCEPTANCE_RESOURCE_TOKEN`。按需提供至少一种独立的 `QA_CAPACITY_REGISTRY_DIR`、`QA_MESSAGE_REGISTRY_DIR`、`QA_RUNTIME_REGISTRY_DIR`，使用当前用户拥有的 0700 规范绝对目录；三个目录不得共用或通过符号链接别名重合。

对应控制器分别为 `scripts/qa-capacity-controller.ts`、`scripts/qa-message-observation-controller.ts`、`scripts/qa-runtime-observation-controller.ts`；各自只配置自己的 registry 和 `QA_CAPACITY_PORT` / `QA_MESSAGE_PORT` / `QA_RUNTIME_PORT`，回环端口互不冲突。各协议 URL、JSON 及身份校验沿用已交付契约；runtime capabilities 现在含账号/模块三项及活动两项。

普通 main 不导入测试控制器。观察值来自真实 SUT、数据库提交及进程生命周期，控制器不替 QA 填充期望业务状态。`dev:isolated` 是独立的人工/交付复现入口，不代替 QA guardian，也不加载 QA 控制器。其正常退出会删除本次数据，不能拿来升级旧演示环境。

## 实际开发验证

| 实测源码 | 已执行检查 | 证据 |
| --- | --- | --- |
| `64afe925886d994b360d9327b5951e7371bfa4d3` | 全套 **458/458**，零失败、跳过、取消；三个真实计时开关开启；构建、原文校验及夹具守卫 3/3 | [索引](evidence/qa-observation-batch3-verification.json)、[回归原始输出](evidence/qa-observation-batch3-regression.log) |
| `e783c6f9ce994216f6a8f1eac765ca75ad2f9829` | 后续控制器顺序保护、强杀时点取证与隔离配置差异：**56/56** 定向、零跳过；类型及原文校验 | [索引](evidence/qa-observation-batch3-final-final-verification.json)、[原始输出](evidence/qa-observation-batch3-final-final-focused.log) |
| `2118e5766425fbcf5002f97ac70ed752449a5f29`（隔离启动工作线） | 路径含空格的新源码归档、npm ci/build、REST/WS/双角色 smoke；活进程拒绝清理、标签不匹配保护、SIGKILL 后清理、SIGINT 清理、中途依赖失败清理 | [版本与机制](isolated-local-reproduction.md)、[结构化证据](evidence/isolated-local-reproduction.json) |
| `8c92b3491ade262b2f81e3257d3809be02223529`（最终整合） | 构建、原文校验、再次执行真实独占启动 smoke；原始信号/清理实现与上述启动工作线一致 | [最终索引](evidence/qa-final-delivery-verification.json)、[启动输出](evidence/qa-final-delivery-isolated-smoke.log) |

本批没有在最终 SHA 再宣称一次全套 458 测试。458 之后只改显式观测控制及隔离启动/文档，分别执行上述差异验证；56 项包含与全套重叠的检查，数量不相加。每条索引保存实际版本、命令、退出码和日志 SHA-256。

实际 HTTP 组合检查 CO01 验证同一 guardian/API/PG 上容量、账号事务、receipt 三类挂点同时工作；AC01 在真实控制器中持有安全屏障，强杀前再次确认 held、持久 history/结果及 `inflight_turn=false`，并证明 kill 完成早于 TTL。重启后同一 run 正常续接，同时明确返回不完整活动见证。不是只调用 helper 或声明 capabilities。

开发资源使用自建 PostgreSQL 随机回环端口、UUID 数据库及独立状态；验证索引记录数据库无遗留、拥有的容器/卷删除。没有操作 QA 初始运行、QA staging 制品或旧演示；原始需求 SHA-256 保持 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。

## 尚未通过与待 QA 复核

1. **CAP003 严格 60000ms 上限仍未闭合。** 本次 458 回归中的 DC06 是 measurement-only：持久值 60002ms，原容量见证区间 `[60002,60076]ms`，独立在线观察 `[59990.650625,60006.411209]ms`。开发检查成功只说明观察流程完成，不能把它写成严格预算业务通过；没有截断数值或增加容差。
2. **跨强杀完整活动见证不足。** 新进程不能重建旧进程未保存尾段；明确 `includesUnsavedTail=false`，不返回伪造的全 run 有限区间。先前 QA 格式校验对此还需双方对齐，QA 负责自己的校验与最终分类，不由工程改断言。
3. receipt 成功持久化前的物理首次接收时间、外部操作未知结果和其他已登记协议限制仍按原决策保留，本批没有增加网关或 Agent 外部能力。
4. QA 的 INT-STREAM-002 新反馈已完成只读复核：证据跨了两份快照，真实查询确认早于第二份首屏；QA 已接受这是前提错误，保留原始失败记录并修正自己的真实查询屏障及同快照取证，尚待固定候选复测。没有修改产品或降低契约。见[逐条依据](qa-stream-snapshot-triage-20261001.md)。慢读用例的有限等待不能自行扩成原文没有的吞吐 SLA。
5. 新隔离入口已在 macOS 实测；Linux 未实测。SIGKILL 需显式 manifest 清理，断电/磁盘损坏、未决 Docker 创建竞态及未知归属不承诺自动清理。独立只读复核另指出：启动时 PostgreSQL 查询/迁移尚无超时取消，数据库无限停顿时 SIGINT 可能无法及时进入清理；本次成功清理证据不覆盖该故障。详细边界见复现记录。

开发已完成这批明确修复、接入和证据交付；独立 QA 的联调、完整业务验收及上线评估继续分阶段判断。后续按收到的具体问题处理，不设置定时轮询，不代填 QA PASS。main 合入不升级旧演示、不推送远端。
