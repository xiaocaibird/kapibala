# 工程补证与人工体验准备记录

本记录补充原[正式业务验收报告](../../acceptance/20261001-business/report.md)，不覆盖其中的结果。**本轮完成 QA 取证适配、执行入口及一次真实人工体验环境准备与收尾；尚未收到七项补证的新候选，七项均 NOT_RUN。原业务验收“不通过”结论不变。**

## 范围与交付

- 七项原 BLOCKED 的最小工程交付与判断依据已逐项整理：[接入清单](../../../requirements/evidence-followup/README.md)。保留5000/60000ms原值、真实副作用和恢复要求，不自造外部否定保证。
- AGENT-025 接入完整活动见证判据；INT-STREAM-001 使用真实读端暂停、逐帧字节与游标记录、有限负载与独立健康对照；ARC-UI-015、UI-032 增加 document/WS 生命周期与合法触发取证。其余三项保留现有场景，等待真实阶段/跨epoch/恢复决策证据。
- 七项共享执行子集登记为 `evidence-followup-20261001`。它提供定向技术证据，不签发新版本完整业务验收通过。
- 新人工入口 `manual-followup` 固定三用例，独立范围摘要和窄授权；核对实际进程/端口/构建后才 ready，逐项审计只追加，报告重核源码和证据。操作指南见[真人执行指引](../../../sharing/manual-execution-20261001.md)。

人工入口的离线检查不等于 live ready 全路径已试跑。本轮真人操作发生在新正式入口 ready 之前，因此没有实际 begin/ready/record，更没有倒填正式人工 PASS。

## QA 工具校验

QA 工具提交 `aecb084000f3e15217c94c28fbccccadb084a3a4`。最终自身测试 **239/239 PASS**，0失败、0跳过；TypeScript、128项需求/266条用例追踪、七项子集注册、8项变更评审登记、259个Playwright执行组合静态列举均通过。这些是全目录资产/注册数量，不能与254条必验业务用例的产品执行数混用。未启动新一轮七项产品测试。

证据：[自身测试](self-test.final.log)、[类型检查](typecheck.final.log)、[追踪](catalog.final.log)、[子集](suites.final.log)、[变更登记](impact.final.log)、[静态列举](test-list.final.log)。初轮230与后续238均为修正过程自检，最终239包含人工审计及三条同标签IME夹具的正反验证；不宣称人工 live ready 已实际跑通。

## 本次真实体验与边界

被测版本 `fb1589df08f00c10e9e62801007b1698d4d0155a`；[候选比较](../../../requirements/evidence-followup/manual-candidate-20261001.md)确认相对资料修复 a6b 的产品运行时代码无变化。独占体验环境通过公开 API 和外部协议桩形成审计阻塞、完成、协议错误失败、取消、三组目录搜索数据和消息 unknown；没有改数据库或页面 DOM 伪造状态。

研发主任务转达用户对所见四种运行状态文案的反馈：“我看完了这几个提示挺好的”“基本上都没问题”。此前已讲解各状态含义，故是有效体验反馈，不能充当 MAN-UX-001 未经提示的首次理解。账号操作/角色、完整输入法网络时序和真实系统焦点义务也不能由该反馈替代。详见[原话转达与结束决定](manual-experience-close-relay.json)。QA未收到原生截图字节、各次操作精确时刻，不将这些未取证信息写成已证实。

旧 E 的有限503查询计划随后耗尽，11:08:03 UTC公开读取已为 sent：[实际读取](manual-fixture-e-recheck-1108.json)。没有把它改回 unknown。用户明确结束提示体验后，第二个 unknown 环境尚未创建即取消；unknown 文案未单独体验。未来准备脚本增加真实响应延迟和资源归属记录，不能反填到旧场景。

另外收到已有5173演示页的输入法提示与favicon现象，保存于[探索观察](exploratory-observations.json)。该运行版本未绑定，后续浏览器控制可能干扰favicon，均未据此直接签发正式产品 FAIL。研发修复应交付明确候选并独立复验。

## 证据与清理

[最终归档索引](manual-final-archive-index.json)包含13份原始文件，共8,988,325字节，逐字节核对冻结执行器原件；[执行源快照](manual-source-snapshot/)的226文件均匹配原准备清单，源集合SHA `0300592fcf075d5033097b88ef78de42fb3da5e3b2df42313dfcdd0aee4aa99f`。实际生产前端3份文件已按原构建摘要保存于[构建索引](manual-frontend-build-index.json)，专属人工SUT工作区已由Codex归档为可恢复状态；旧target路径仅作历史引用，后续必须建立新环境。早期[准备快照](manual-preparation-snapshot/snapshot-index.json)保留当时事实，不被最终归档覆盖。

11:09:38.992 UTC收到SIGTERM，11:09:39完成两级清理；两份cleanup均无错误。Docker同一ID/owner销毁与当前容器不存在、2个已知PID退出、4端口无监听分别有[原始事件](manual-cleanup-docker-events.json)和[现场核查](manual-cleanup-audit.json)。没有触碰5173或其他任务资源。

原准备没有持久保存精确Mounts，虽有已核归属容器 `rm --force --volumes` 正常结束与销毁事实，仍不声称逐个匿名卷已经独立核实，也未删除未知卷。未来脚本会在创建后直接记录确切资源，旧证据缺口如实保留。

## 后续执行

研发交付七项新候选、启动配置和真实观测/公开操作契约后，QA按现有授权冻结新目标，做必要冒烟并运行补证子集；不足项记 BLOCKED，明确违约记 FAIL，继续其他独立项目。CAP-003无崩溃严格60秒问题另线跟进；C1/C2和上线评估不自动并入本次七项范围。旧正式报告、首次失败及修复复测分别保存。
