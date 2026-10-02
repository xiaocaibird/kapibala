# C2-020 第三批退出证据归因

原批次：`2026-10-01T23-12-22.471Z-739fbbec`，原结果保留 BLOCKED。本文件不覆盖运行证据，也不声称复测通过。

- requests 变体与 normal-exit 变体已保存真实 code 0 / signal null，以及绑定对应 generation 的完整 egress 尾部。证据如 `cases/SR-C2-020/variant-2/27-provider-exit-observed.json`、`30-provider-finite-egress-proof.json`、`31-provider-finite-egress-proof.json`。
- hard-exit 变体 `46-provider-transport-hard-exit-result.json` 为 `No actual exit`；`variant-3/42-cleanup-summary.json` 没有 actualExit。不是 egress binding 漏复制已知退出值。
- QA `OwnedProcess.stop(SIGKILL)` 原来直接对整个进程组发 SIGKILL，同时终止实际子进程与负责报告其退出的 guardian。guardian 来不及回传真实 child exit，exitOutcome 因而未知。不得根据“已经发送 SIGKILL”自行补造观察信号。

修复：增加 `OwnedProcess.killApplication()`，由存活 guardian 接收 IPC 后对其原始 ChildProcess 发 SIGKILL，保留 guardian 直到取得真实 exit 事件；再调用原 stop 清理所有组内后代。独立 Provider 的 SIGKILL 路径使用这一方法，将实际 exit 写到对应 egress binding。未知或异常退出仍阻塞／失败，不返回猜测值。

验证：只启动 QA 自有无业务 Node 子进程，确认真实退出信号为 SIGKILL、清理后仍保留原始结果、未启动时拒绝操作。1/1 自测通过；second-round 类型检查与差异检查通过。未运行被测系统。

C2-015 未关闭项仍是工程缺口：现控制器 close 不是 journal close；正常服务退出先关闭 HTTP，无法再经公开请求触发 journal 的 rejected-closed。已向主任务提供真实 writer close 控制、实际事件及后续正常业务调用的最小接入条件，当前不擅造能力。
