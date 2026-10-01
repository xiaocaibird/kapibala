# CAP009 产品恢复修复交接

本线基于 `b86b0ad1bb52dbb26c345f5667cf37ff8198b192`，工作树分支 `agent/qa-cap009-recovery`。修复产品源码提交 `57ecd83fd82703221cdc88042d8f5e096afef36e`；下列修后日志都运行该源码。后续提交仅添加开发回归和证据。本报告不登记 QA PASS；`qa-acceptance/` 与工程容量控制器实现未改动，也未执行 QA 脚本。

## 产品边界

旧实现先保存 `executing`，随后真实 `tryWithLock` 才决定容量准入。已拒绝且没有派发的步骤仍要等 ready SQL 才能安全恢复，因此精确窗口硬杀会留下无法区分的 executing 并暂停。

修复在既有 JSON intent 内增加内部 `dispatchState`，不增加远端协议或数据库迁移：

- 准入前持久化 `executing` 和 `awaiting_admission`。这个状态明确保证尚未允许 HTTP kick，重启可重新检查策略、账号并继续原步骤。已保存审计结论和原模型工具响应被复用。
- Gateway 在真实容量与目标锁准入成功、群和账号校验通过后，调用内部 `beforeDispatch`。Agent 在该回调内用独立 autocommit 将 intent 推进 `dispatching`，并检查更新行数为 1。只有写入返回成功后才可能执行 HTTP；失败则不派发。
- 容量拒绝仍执行原有 ready 清理与原观察挂点，但该 SQL 已不承担唯一恢复证明。控制器没有代写业务状态。
- `executing + dispatching` 和旧版没有该字段的 executing 仍保守暂停，绝不从成员列表变化推断重放安全。即便在 `dispatching` 已提交、HTTP 尚未发生的窄窗口硬杀，也保留暂停。
- 原有 Agent run advisory lock 与 kick target advisory lock 仍约束并发；没有用进程内标记代替持久证据。

修改范围：`core/messaging.ts` 的内部可选回调；`gateway/messages.ts` 的 kick 准入内接入；`automation/tool-execution.ts` 的状态推进及恢复白名单；`automation/types.ts` 的 JSON intent 类型。原 send、外部 API、审计规则、预算阈值未改。

## 开发验证

| 证据 | 结果和含义 |
| --- | --- |
| `docs/evidence/cap009-repair/baseline-dc04.tap` | 原源码 b86b0ad 的 DC04 旧缺陷观测通过：同 attempt 真实拒绝、零派发、executing 后 ready 前 SIGKILL；恢复 running + recoveryNote，0 kick、1 audit、1 turn。保留原始反例，没有覆盖旧证据。 |
| `recovery-first.tap` | 新增 7 项首轮 6 通过、1 失败；最后一项开发夹具写了不合法的 accounts.status=`offline`，被现有数据库 CHECK 拒绝，尚未进入被测产品路径。 |
| `recovery-final.tap` | 仅修正夹具为既有合法状态 `disconnected` 后 7/7。精确拒绝崩溃续跑、已派发未知效果崩溃、dispatching 提交后 HTTP 前崩溃、旧 intent、双实例并发恢复、真实 PG trigger 拒绝提交、本地校验顺序全部通过。 |
| `control-targeted.tap` | DC01–05、07–08 共 7/7。开发 DC04 已更新为修后应自动续跑的回归，旧观察由基线日志保留。DC06 的真实 60 秒活动计量不属于本线，没有重跑或改变阈值。 |
| `product-targeted.tap` | Agent capacity、lock admission、automation、member rejoin 共 56 通过，0 失败，3 跳过。跳过为原有 AUTOMATION_TIMING_TESTS 开关控制的用例，本线未开启。 |
| `typecheck.txt` | `tsc --noEmit` 成功，原始标准输出为空。`git diff --check` 成功。 |

修后精确 CAP009：同 run、toolUseId 和 admission attempt，硬杀前网关 0 kick，`executing + awaiting_admission` 已持久化且没有 ready-persisted；重启同 API 端口后 run 正常 finished、recoveryNote=null，最终只有 1 次 kick、1 次 audit、2 次 turn（原工具响应及工具完成后的正常下一轮终结响应）。原工具步骤仅一行且 audit_attempts=1。旧租约事件前缀保持、释放仍幂等。

已派发未知效果崩溃用例实际 1 次远端 kick 后阻塞响应，硬杀、重启后仍为 1 次；审计/模型均未重复。提交后未派发崩溃用例通过独立开发入口在真实 `Database.query` 返回后阻塞，仅观察真实提交、不伪造业务数据；硬杀前后网关均 0 次但恢复仍暂停。这是有意保留的不确定窗口。

运行命令（DATABASE_URL 指向本线独立容器的 postgres 管理库；各夹具只 CREATE/DROP 自己的 UUID 数据库）：

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:50075/postgres node --import tsx --test --test-reporter=tap --test-name-pattern='DC04' tests/integration/qa-capacity-control.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:50075/postgres node --import tsx --test --test-reporter=tap tests/integration/agent-kick-recovery.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:50075/postgres node --import tsx --test --test-reporter=tap --test-name-pattern='DC0[1-578]' tests/integration/qa-capacity-control.test.ts
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:50075/postgres node --import tsx --test --test-reporter=tap tests/integration/agent-capacity.test.ts tests/integration/lock-admission.test.ts tests/integration/automation.test.ts tests/integration/member-rejoin.test.ts
node_modules/.bin/tsc --noEmit
```

## 资源和剩余限制

Node 24.21.0，复用主仓已锁定 node_modules 的本树临时软链接。本线独立容器 `kapibala-dev-cap009-1001a`，ID `48d848383538ec91e02eda6b365e6ee998644fd17663d58f95674971de75d014`，标签 `kapibala.owner=engineering-cap009-1001a`，loopback 端口 50075；镜像 postgres:17-alpine，匿名卷 `7b3ca174409555433a53da6c745b32399edacba6b4b5904f161356ef6d30d850`。完整归属见 `resource-ownership.json`，精确清理与 UUID 数据库残留检查见 `cleanup.json`。未读取或清理 QA、demo 的数据库或容器。

本修复只允许有明确持久派发前证明的步骤自动续跑。`dispatching` 后的未知效果、历史旧 executing、现有带 recoveryNote 的暂停 run 不被自动修写或重放。提交失败场景证明零 HTTP；当前失败会保守暂停，不宣称所有数据库故障都能自动收敛。没有消除本地 intent 提交到远端请求之间无法跨系统原子提交的窗口，也不新增远端幂等键或结果查询保证。CAP003 严格活动预算及整体验收由其独立线验证。
