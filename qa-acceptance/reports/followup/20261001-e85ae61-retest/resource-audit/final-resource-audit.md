# e85ae61 分段复测独立证据与资源审计

2026-10-01 12:56 UTC 完成只读核对。未连接产品、未启动新测试、未操作产品进程或删除资源。JSON 保存实际命令、时间、输出和证据摘要。

- 7 个运行、32 条执行历史：24 PASS / 3 FAIL / 5 BLOCKED。按 case + project 取最新结果为 30 项：24 PASS / 3 FAIL / 3 BLOCKED。
- 原 29 条首轮仍为 21 PASS / 3 FAIL / 5 BLOCKED；未覆盖、修改首轮状态。
- 最后一轮 `2026-10-01T12-46-08.250Z-9b50fc8a` 的 INT-STREAM-001、INT-STREAM-002、ARC-UI-015 均 PASS，attempt 0，runner passed，无 runnerErrors。三条的清理记录均无失败。
- 这些运行的 phase 均为 developer-preflight，不能据此声明完整业务验收通过；三个人工项及 C1/C2 不纳入上述计数。

## 源和归档核对

七轮 manifest/events/results/runner 均相互对应，events 与 results.attempts 逐值一致。每轮 QA tree 前后列表及摘要均相同，并独立按记录的文件列表重算摘要。首六轮 QA 为 `105ed289e0fbed6306025cd3dc1889730b17a423`，末轮为 `526d814db45d15896f96563e7a2a8b8f75064f81`；SUT 始终 `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb`。

记录中的所有 Git 跟踪文件与对应固定提交字节一致。每轮另含一个被 .gitignore 排除的 `config/preflight-authorization.local.json`，其 SHA-256 始终为 `13baf6a171e4747871c3f9fc94aaaee5fd0f84d54a08fe319b58106549079db6`；当前文件相同。没有把该本地配置说成 Git 提交的一部分。

末轮 QA tree 指纹为 `4dc2715ee57cf8deb83c831977432bf5c49d0a52942eff0022b6f9abbd3002fc`，target 指纹为 `3b41aa332cf319c6583b7dd452e54d66512071ec94281c779d00b182415f6115`。

七份 evidence.tar.gz 按成员流式读取核对，共 1,355 个文件与原运行目录逐字节一致，无缺项、多项或符号链接；另存的顶层报告也一致。见 `archive-verification.json` 和 `run-file-inventories.json`。原 stream/UI 首轮因 BLOCKED 导致整体 runner failed 的 integrity 提示仍保留；并非源文件漂移。

## 末轮原始证据复核

INT-STREAM-001 保持原 8,208 条、固定负载/排空/关闭/重放预算。健康端完整收到 8,208 条；旧慢流实际收到的游标后补 4,754 条，保留旧流与重放合并完整性。关闭的 1006 不是单独判据：同一真实连接身份的服务日志有 send-timeout → close-requested → terminate-requested → closed 因果链。未调大预算、减少采样检查或容忍数据缺口。

INT-STREAM-002 的同 snapshot 游标、变化页大小、自己的消息确认及后续补投有分开的原始快照；冻结集合 59 条，刷新后 61 条，未把刷新集合冒充原冻结集合。

ARC-UI-015 有原四次请求耗尽、第五次显式刷新真实 200 及预置内容。响应后的 marker/ack 属于同一 socket 代次、同 requestId、相同 startSeq；稳定观察窗内 document、URL、navigation、socket、auth 均未变，无 stale ready，无边界错误。没有忽略任意 scope_ready 或用整页跳转重置状态。

## 资源核对

最终 Docker qa.owner 容器快照为 0。对先前活体捕获并通过真实端口、进程祖先和 suite CLI 归属的 **5 个容器、5 个匿名卷**逐个 inspect，全部明确返回 no such container/volume；包括末轮的两个容器及其精确 Mounts 卷。没有仅凭全局空列表推断匿名卷已清除。

两个 controller 的 ready/lifecycle 记录确认其专属 registry 身份、SIGTERM、guardian 停止和 registry 删除。当前 6 个记录 PID（两组 runner/guardian/controller）均不存在，两个 registry 路径均不存在。七轮 32 份环境 cleanup.failures 均为空；已记录的 **103 个端口**最终均无监听。

自有有界 watcher 于 12:49:02.914 UTC 收尾，仅终止其 Docker 只读事件订阅（reader exit 143；外层执行 exit 0）。index 中每个文件摘要重新核对一致，当前 watch.py 进程不存在。其 16 份活体捕获覆盖 CAP 和末轮复测；原始 events.ndjson 保留。

## 明确限制

1. 早期 smoke/backend/UI 容器在首次活体审计前已经删除，没有捕获其 Mounts，因此不能声称这几轮每个匿名卷都已独立精确证明消失。其每例清理记录、已知端口检查和最终容器空列表有效，证明强度不同。
2. Docker 历史事件可能无法回溯，最终 events 空输出不等于历史上没有容器。只按已保存的实时事件和归属链归因。
3. 端口/PID 不存在是核查时点事实，生命周期日志提供原资源归属；不声称未来不会复用。
4. 每例 completedAt 为 runner start 加 duration，在 worker fixture 存在时可能早于清理/准备原始时间；时间线以原始事件和 runner 结束构成外包络，不将该派生时刻当成严格产品 SLA。

本审计完成后停止写入。原运行报告、冻结源和首次结果均保留。
