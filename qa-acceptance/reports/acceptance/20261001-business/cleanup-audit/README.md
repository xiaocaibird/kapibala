# 业务验收资源清理：只读核查计划

此目录只提供资源盘点与归属核查，未执行终止、删除、SQL 或 HTTP 请求。`audit.py` 没有清理模式；`--phase` 只为证据标注阶段。最终资源清理由主任务在全部复测结束后，通过原始资源所有者执行。

## 当前快照与边界

最近快照：`audit-2026-10-01T07-55-13-070Z.json`，采集区间 `2026-10-01T07:55:13.070Z` 至 `07:55:15.007Z`。

- 发现 10 次运行，共 569 份环境证据、569 份对应环境清理证据和 6 份夹具清理证据；没有缺失的环境清理记录，记录中的清理失败数组均为空。运行失败状态仍原样保留，不能由清理成功推导业务通过。
- 三个控制器仍在监听，原始 registry 身份均吻合；每个 registry 有 22 条历史应用登记，当前没有仍存活且启动时间匹配的原始应用进程。这些控制器尚供后续复测使用，当前存活符合预期。
- 在指定本地 Docker engine 上，当前没有 `qa.owner` 标签的容器。16 项子集已于 `07:51Z` 结束；后续仍计划执行 3 项复测，因此本次为空不是最终清理完成结论。
- 独立交付复现的精确容器、命名卷、临时目录已再次确认不存在，Docker engine ID 与创建时一致。
- 13 条命令路径匹配的进程候选仅用于核对。路径匹配、端口占用或旧 PID 都不授予终止权限。

先前只读观察曾看到子集运行中的 `qa-acceptance-62f69546-b307-4291-af4c-3e1a0a5d3351`；在正式审计采集前它已经消失。本目录没有该容器的完整 ID 与挂载快照，不补造匿名卷归属。

## 使用

在 QA 开发目录执行：

```sh
python3 reports/acceptance/20261001-business/cleanup-audit/audit.py --self-test
python3 reports/acceptance/20261001-business/cleanup-audit/audit.py --phase in-progress
python3 reports/acceptance/20261001-business/cleanup-audit/audit.py --phase post-run
python3 reports/acceptance/20261001-business/cleanup-audit/audit.py --phase post-controller-stop
```

每次生成独立时间戳 JSON 并保存所用脚本的 SHA-256 版本副本，不覆盖旧快照。固定只读命令为 Docker `ps/inspect/volume inspect/info`、`ps`、`lsof`；无 shell 插值，无进程信号，无 Docker 删除或 prune。命令读取失败记为错误或不可判定，不能解释为资源不存在。

脚本读取的执行树为 `qa-business-execution`、`qa-business-final`、`qa-focused-retest`、`qa-premise-retest` 下的 `qa-acceptance/reports/{runs,preflight}`。同一运行在多个冻结树中出现时按 phase/runId 去重；每项记录仍保留实际证据路径和摘要。复用 `qa-premise-retest` 执行树不改变本目录旧快照；源版本应继续引用各轮已归档的 source tar / after 证据，不能以当前工作树代替旧轮版本。

## 需要核对的证据

| 资源 | 原始所有权依据 | 退出与清理证据 | 局限 |
| --- | --- | --- | --- |
| 每例应用、网关、Agent、代理与数据库 | `environment.json`、本例 OwnedProcess/环境持有者、数据库创建登记 | `cleanup.json` 的时间与 failures，runner 汇总，实际进程/监听复核 | 每例 cleanup 不证明 worker 的 PostgreSQL 容器已退出 |
| 恢复夹具 | 本例夹具恢复登记 | `fixture-cleanup.json`，本例及 runner 错误 | 不用其他用例的清理替代本例证据 |
| worker PostgreSQL | 完整容器 ID、创建者内存中的 owner UUID、`qa.owner`、精确名称及本地端口 | worker finally 的 close 与 runner 错误，Docker 同 engine 精确 ID 复查 | 标签本身没有 runId；随机 UUID 和名称前缀不足以归属具体运行 |
| 容器挂载卷 | 已归属容器的实际 Mounts 记录、完整父容器 ID 与 owner | 原所有者 `close()` 后按已捕获卷名查询 | 无历史挂载证据的匿名卷不能归属或批量删除 |
| 三个控制器 | ready、lifecycle、原 runner / guardian、registry dev/ino、所有者标记与登记 | `owned-controller-stopped`、`owned-registry-removed`，原 PID/监听/目录复查 | 旧 PID 可能复用；`registry-retained` 不算清理通过 |
| 独立 README 复现 | receiver-result 中完整容器、命名卷、runId、engine ID、目录 | cleanup-verification 与本次精确不存在查询 | 仅涵盖该次接收方复现，不涵盖其他 `kapibala.local.*` 资源 |

`QaEnvironment.close()` 尝试关闭页面代理、web、第二应用实例、主应用、Gateway、Agent、数据库代理，删除自身登记的测试数据库并保存失败数组。`OwnedProcess` 使用仍在所有者控制下的 guardian 进程组；不得仅凭历史 PID 重新构造所有权。worker 数据库容器在 `OwnedDatabaseCluster.close()` 中重新核对完整 ID/label 后删除自身容器及匿名卷。浏览器在其 fixture finally 关闭，浏览器安装缓存与报告不是残留运行资源，不在清理范围。

## 三个控制器的固定身份

共同证据根：`/Users/zcm/.codex/worktrees/qa-business-final/kapibala/qa-acceptance/reports/integration/20261001-final-candidate/controllers`。共同 SUT 为专属 `qa-sut-remediation/kapibala`，版本 `86ad4e7e63786f652c965308b032b98415bdd7ac`。

| 控制器 | 目录 | 原 runner / guardian PID | 监听 | registry 与创建身份 |
| --- | --- | --- | --- | --- |
| capacity | `controller-bd98cd63-13d9-4552-ab31-4778d28e860a` | 75480 / 75696 | `127.0.0.1:64184` | `/private/tmp/qa-cap-6Kn0Gg`，dev 16777231，ino 38500817 |
| message | `controller-b22d3ef0-06d0-4bc7-9d9f-5564ea049d0a` | 75753 / 75970 | `127.0.0.1:64210` | `/private/tmp/qa-mes-7zr1un`，dev 16777231，ino 38500826 |
| runtime | `controller-a257f7ad-4b2e-43b7-8d7a-be5e029985fe` | 76002 / 76222 | `127.0.0.1:64213` | `/private/tmp/qa-run-n9kMPL`，dev 16777231，ino 38500839 |

这些 PID 是证据标识，不是可直接复制执行的终止目标。原 lifecycle wrapper 保存目录身份与 `.qa-lifecycle-owner.json`，标记内有 nonce；本脚本只记录摘要及身份比较，不输出 nonce、observedOwnerToken 或完整进程命令。历史 `<UUID>.json` 登记的 appPid/appStarted 与当前进程启动时间同时吻合才算原应用仍在。

## 全部复测结束后的顺序

1. 主任务确认包括后续 3 项在内的所有 runner 已结束，归档原始输出、manifest、源冻结证据与每例 cleanup；若仍在运行，保留其全部资源。先执行 `--phase post-run`。
2. 对 cleanup failures、缺失记录和 runner 的清理错误逐项定位。不能把产品失败解释为清理失败，也不能把 worker 收尾异常隐藏在业务失败下。
3. 主任务通过自己仍持有的原控制器 wrapper 执行受控停止，使其 finally 关闭 OwnedProcess 并核对 registry 身份后清理。不要按上表旧 PID 盲发信号；不要对全部 Node、Chrome、Docker 资源执行通配清理。
4. 原 wrapper 若记录 `registry-retained`，保留目录并检查原因。目录 dev/ino、非符号链接、当前 UID、标记字节必须与创建时一致；登记应用仍存活时不能删。若 PID 已被其他进程复用，只能确认为复用并保留对应无关进程，不能因旧登记将其终止。
5. 对确认属于本次的残留应用，必须同时拿到创建证据、当前启动时间、guardian/PGID 关系及原所有者，再由原所有者关闭。路径匹配、端口相同或进程名相同都不充分；无法确认则登记未决，不删除。
6. 对 Docker 残留，必须是同一 engine，完整 ID、创建 owner、精确名称、端口和原创建登记一致，且没有在用 runner。优先调用原 cluster 所有者的 close。若只剩可人工核实的残留，按精确 ID 单个处理并留前后证据；不能按 `qa.owner` 或名称前缀批量删除。卷须有原挂载归属、当前无其他容器引用的证据才可单个处理；缺证据保留。
7. 原所有者完成收尾后执行 `--phase post-controller-stop`。核对三控制器已停止的生命周期记录、原进程与监听不存在、registry 已移除、归属明确的容器和已捕获挂载卷不存在、receiver 复现资源不存在。端口若已被无关进程占用，记录“原控制器已退出、端口被他方使用”，不终止他方。
8. 最终报告分别列“已证实本次资源清理完成”“仍在运行的授权任务资源”“归属不足而保留的候选/历史卷”。仅当所有本次可追溯资源均关闭且没有未处理清理错误时，才给本次清理结论；不声明整机所有资源都已清空。

## 自检

当前脚本 SHA-256：`30f014804cb52ad01404be178c642dc44b4888c8bf667eb36396875584f69cb0`。8 项纯数据自检覆盖合法归属、短容器 ID、名称/label 不匹配、registry 符号链接、inode 变化和 owner PID 不匹配；自检不接触资源。Python AST 检查通过。真实只读采集已完成两次，无采集错误；尚未执行最终 post-controller-stop 核验。
