# UI 技术补证：读取重试与目录确认前提

2026-10-01。基线 main `fb1589df08f00c10e9e62801007b1698d4d0155a`；产品及开发回归提交 `7dca6f2089efdcfb23915bcf1339ee8fef56de94`。独立工作树 `architecture-runtime-boundaries/kapibala`，分支 `agent/qa-ui-evidence-followup`。本记录为开发侧核查；QA 独立执行及结果归 QA，本次仅读取其用例、契约，没有修改 QA 资产或原文。

## ARC-UI-015：序列读取失败后的同页恢复

基线的 `Sequences.tsx` 已有 `sequences.reload`，但页面读取错误只渲染没有 retry 的 ErrorNotice；序列列表不轮询，没有新事件时，重试预算耗尽后没有公开同页刷新入口。开发浏览器反例先确认四次 GET 后持续静默，再确认错误区域没有可点击的重试按钮。

局部修复将群选项与序列选项两种读取错误分别接到各自既有 reload。入口为**定时序列页面 → 读取错误提示 → “重试”按钮**，只有存在对应读取错误才显示。定位可使用错误提示区域内的 `getByRole("button", { name: "重试", exact: true })`；若同时出现两个读取错误，应按对应错误提示区域定位。点击只重读该资源，沿用原控制器的单飞、会话代次、退避与取消机制，不提交序列或重新导航。

公开入口经真实 React 生产构建、HTTP API、WebSocket 和独立 PostgreSQL 验证：持续503耗尽后共4次GET；恢复服务并点击错误区域的重试后，增加1次成功GET，序列选择值为 `architecture-sequence`，后续稳定。浏览器 `performance.timeOrigin` 前后相同，数据库业务事件为0；未以整页刷新、路由切换或内部helper调用作为这一次恢复触发。

开发检查：

- 修前反例：新增浏览器检查停在“重试”按钮不存在，之前3项读取检查通过，清理错误0。见 [修前报告](evidence/qa-ui-resource-before-20261001.json) 及 [截图](evidence/qa-ui-resource-before-20261001-failure.png)。
- 修后首次检查：已经完成点击和成功读取，但新增断言使用 `getByLabel` 找不到包装选项内容的 label；原始 [选择器失败报告](evidence/qa-ui-resource-after-selector-failure-20261001.json) 与 [截图](evidence/qa-ui-resource-after-selector-failure-20261001.png) 保留。修正的是开发脚本的公开 combobox 定位。
- 修后浏览器：8/8通过、页面异常0、清理错误0，覆盖同文档显式重试、原自动读取恢复/停止/离页取消及序列提交行为。见 [最终报告](evidence/qa-ui-resource-after-20261001.json) 与 [最终页面](evidence/qa-ui-resource-after-20261001.png)。
- 前端回归：127项登记，126通过、0失败、1既有20秒认证计时检查跳过。见 [原始日志](evidence/qa-ui-frontend-20261001.tap)。`npm run build -w apps/web` 成功，格式及 `git diff --check` 通过。没有运行服务端整套或宣称QA通过。

浏览器报告的 sourceHead 是执行时的基线，sourceFiles 记录实际工作树产品/脚本 SHA-256；最终报告对应文件与上述产品提交字节一致。没有重写原来的 `architecture-resource-browser.*` 历史证据。复跑可用 `ARCHITECTURE_BROWSER_EVIDENCE_PREFIX` 指定新的证据前缀。

## UI-032：多页 stale 下独立确认的适用前提

读取了固定基线的 `qa-acceptance/tests/ui/console.spec.ts` UI-032、`cases/ui-extra.json` 及 `requirements/traceability.md` 的 ADD-ATT-05 / ADD-DIR-08。用例要求：多页已加载，后台元数据变化后仍保留 stale，通过不刷新目录的公开操作确认已呈现的相关变化，再验证旧cursor仍不可用。

**在当前实现中，该用例的“相关新版本已呈现且可确认，同时目录仍 stale”前提不可达。** 这是具体用例的适用性说明，不能登记成 UI-032 PASS；是否继续保留 BLOCKED 或另行组织适用场景由 QA 审定。

源码与已公开契约：

- `apps/web/src/pages/Groups.tsx:286–292`：提醒版本及证据复用目录控制器的展示列表/成功快照；ready明确要求 `!state.stale`。
- `apps/web/src/directory/controller.ts:156–183`：多页probe仅标记stale，不应用新行或新证据；整体刷新成功才替换为新第一页并清除stale。`126`行在底层拒绝stale的loadMore，`330–333`行使多页相关失效保留旧列表。
- `apps/web/src/attention/index.tsx:305–307`：真实点击/键盘/滚轮确认先检查ready，因此点击旧卡片不等于确认新版本；`384–386`行的“刷新并查看更新”先await整体刷新；`582–593`行的范围摘要确认也必须ready及成功证据成立。
- `docs/page-update-notification-implementation.md:7–9,30–33`：要求对应版本成功呈现后发生相关操作；目录复用成功快照，probe不伪造范围证据，不能仅点通用提示消除。
- `docs/group-directory-profile-proposal.md:53–55`：多页相关变化后保留旧结果、禁用旧cursor；整体刷新成功才切回新第一页。

因此，当前合法入口“刷新并查看更新”会完成整体刷新，不能适配成“独立于刷新且仍stale”的确认入口；离开路由结束提醒scope也不等于当前页面确认相关新版本。现有功能保证确认不会重新启用旧cursor，但并未承诺 stale 时提供独立清提示操作。本次不增加新入口、第二份目录快照或新的确认语义；UI-032无产品改动。

## 隔离与清理

仅在独占 `postgres:17-alpine` 临时容器 `kapibala-ui-followup-7ee69f14bdc7` 的随机本地端口54358运行；每次浏览器执行另外创建 UUID 数据库，API/Vite使用临时端口，background=false。复用依赖为只读；未连接演示数据库，未改动其他工作区、预算执行文件或用户群列表体验环境。

三次浏览器执行都关闭了浏览器/API/Vite/数据库连接并删除各自临时库。最终查询确认无遗留测试库，随后删除自有容器并确认端口关闭。未挂载命名卷或宿主目录；镜像声明的数据匿名卷由 `docker run --rm` 策略回收，本轮未单独保存匿名卷ID。见 [资源清理](evidence/qa-ui-resource-cleanup-20261001.json)；证据文件摘要见 [SHA-256索引](evidence/qa-ui-evidence-hashes-20261001.json)。
