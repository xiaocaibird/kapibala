# 交付复核与恢复接线补齐

这是 QA 资产准备及工具自身检查记录，不是产品试跑结果。冻结运行中的 `qa-second-round-retest` 和原始报告均未修改。后续由根执行器在新冻结版本执行本入口，保留每个首次结果。

## 当前运行归因

原始批次 `2026-10-01T22-25-01.466Z-7951d02e`：

- DEL004：`readme-isolated.log` 记录 tsx IPC `listen EINVAL`，路径为 QA 注入的深层 TMPDIR + `tsx-501/68153.pipe`。脚本还没发出 `isolated-preparing`，无产品 manifest；属于 QA macOS Unix socket 路径限制，不能作为产品失败。新驱动使用短 UUID 符号链接指向同一个 QA canonicalRoot；产品 realpath 后仍在 QA 私有目录。清理仅删除经 inode/dev/uid/target 校验的该链接。
- UI018：`error.json` / `api.ndjson` 显示错误调用 `/api/accounts/:id/disconnect`，404。原文第156行定义的是带 `expectedFrom` 的 `/transition`。已改成真实 `online → disconnected` 转移，预期未变。
- UI021：`trace.zip` 中点击所属群后，hash 已改变而 `call@10485–10487` 仍立即读取 Agent 详情 title/nav；随后约16ms 内出现群请求及 scope_marker。原断言缺目的渲染屏障，不能证明页面持续错误。现在先观察真实 `nav a.active` 呈现目的高亮再读快照，仍要求正确群和来源。原 FAIL 留存，需下一批重跑。

上述原始证据均在旧树 `qa-acceptance/second-round/reports/runs/<批次>/cases/<用例>/`，没有改写。UI008 在本次运行已独立 PASS；UI025 真人/原生系统焦点仍由根保留其真实证据边界。

## DEL001

运行生成 `delivery-traceability.json/md`。128 原始要求逐条关联原要求/用例/原 adjudicated 结果/版本；73 二轮条款逐条关联批准来源、契约、研发材料、当前112用例、实际结果路径及责任。四份签发报告及 pending 原文保留，开发自测不替代独立 QA。审阅时尚未执行的后续用例是 `NOT_RUN_AT_REVIEW`；最终报告须以实际执行结果更新，不从历史导入当前 PASS。已有工程方向不变成用户新的待决事项。

## DEL005

新增 `delivery-migration.ts` 和 `delivery-recovery.ts`，直接使用公开子进程入口、独立 PostgreSQL、独立 Gateway/Provider 账本及实际文件字节，不导入产品模块/研发测试。

1. 按 `docs/qa-media-scenarios-20261002.md` 导出固定旧源 `fb1589df08f00c10e9e62801007b1698d4d0155a` 的标准迁移入口及原锁文件；校验001–008原字节，与最终候选前八条相同。QA专属目录独立 `npm ci --ignore-scripts`，原CLI真正建立有执行校验账本的schema8；无伪造ledger或checksum。
2. QA自己装入可得媒体、实际404来源、普通旧消息、synthetic running/terminal行。running行只表示升级保护输入，绝不称为真实Agent执行。
3. 用当前标准应用真实启动旧库，必须有明确 `Schema mismatch: installed=8, required=9` 自行退出且未健康；随机崩溃/超时仍阻塞。执行当前标准迁移两次，逐项比较原消息/运行行、账本、媒体待办及只属于running的保守引用。
4. 启动当前应用，下载真实媒体并观察公开消息路径/内容；在迁移完成且真实文件发布后 SIGKILL，保留同库/目录再启动，核对真实PID变化、原消息及字节仍在。本例只声明这个真实恢复边界，不声称任意fsync/主机掉电/未实现精确中途窗口都已验证。
5. 同一组合用例另执行真实离线provider完成响应缓存，进程重启保留session；实际响应一致且upstream账本没有新推理。
6. 用自己的模拟foreign目录（另一owner标记、哨兵及指向它的链接）记录前后hash/inode/mtime。先核实本例进程/数据库已清理，再按精确目录identity和owner标记删除本例目录，复查foreign未变；仅此后回收自己造的foreign fixture。不能删真实别人的目录；清理未完成即保留目录和 BLOCKED，不变成PASS。

每个子变体单列实际结果，真实FAIL优先，局部成功不掩盖后续失败。代码已接 DEL005，尚未产品试跑。导出旧源与依赖安装可能产生新的实际阻塞，须记录具体命令与错误继续其他案例。

工具自检：18项（含真实Unix socket短路径、所有权替换拒删、traceability全表、迁移账本校验、foreign不变、UI门控原有自检）通过；二轮TypeScript检查通过。产品执行由根另行冻结发起。

## C1-012 后续同批接线

`runMediaMigrationCase(context)` 已新增到 `harness/media-migration-case.ts`，根负责选择该入口。共享迁移 helper 可选合成旧中断输入 `groups.agent_enabled=true` 和 `agent_runs.inflight_turn=true`；没有写终态、媒体引用或新迁移结果。当前产品在真实启动后自行处理恢复状态，QA核对旧running的两条保守媒体引用。

对可得/实际404/普通历史消息分别校验公开投影；把旧附件及另一个实际下载、未被引用的对照附件改成31天年龄。必须观察对照文件实际删除、产品真实清理轮次进展，同时旧running文件路径与字节仍在。最后仅调用公开 `PATCH agentEnabled=false`，观察原run实际cancelled并完成物理删除、公开路径清空、文本保留。未形成这些前提/窗口时保留具体BLOCKED或FAIL，不直接写DB结果帮助通过。合成旧run不签成真实新Agent触发；未调用被测工程。

所有旧命令/探针均另存子进程清理结果；不能确认命令已停止时，不递归删除其工作目录。相关7条交付自检通过（另12条UI既有自检通过），产品验证由新冻结批次决定。
