# 固定候选的 HTTP 快照来源与进程启动身份样例

本次 SUT 固定为 `2716abdd2d43a779b6a0972a6323f895cf2b5b9c`。仅复用已有 combined entry、runtime controller 和开发 fixture 取证，没有改产品、工程观察或测试源码，也没有改独立 QA 资产。

## 字段类型与实际值

`snapshotProvenance.applicationStarted` 序列化为 **JSON string**。它来自 `scripts/qa-capacity/ownership.ts:31` 执行的：

```sh
ps -p <actual-app-pid> -o ppid=,pgid=,uid=,lstart=
```

`stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)` 的第 4 组直接成为 `started`，并经 registration 的 `appStarted` 复制到 controller 的快照来源字段。没有转换为数字、Unix 时间或 ISO 时间。

在本次 macOS 实测中，值为 `"Thu Oct  1 21:54:08 2026"`，其中日期前的内部双空格保留。QA 应将它作为不透明的操作系统进程启动身份字符串，与实际 app PID 配合核对，不解析成活动时长，也不要假定跨操作系统或语言区域的日期格式相同。

真实 HTTP 返回的有关字段如下；这里只摘录字段，完整响应见后面的原始材料：

```json
{
  "snapshotProvenance": {
    "source": "live-bridge",
    "applicationPid": 8343,
    "applicationStarted": "Thu Oct  1 21:54:08 2026"
  }
}
```

杀死实际应用进程后，controller 返回：

```json
{
  "snapshotProvenance": {
    "source": "retained-after-process-exit",
    "applicationPid": 8343,
    "applicationStarted": "Thu Oct  1 21:54:08 2026"
  }
}
```

两路都为同一个已绑定 app 的字符串身份；`binding.pid=8342` 是 guardian，不能代替实际 app PID。来源赋值分别位于 `scripts/qa-observation/controller.ts:153` 和 `:224`，不来自客户端提交的字段。

## HTTP 证据与结果

外部临时脚本调用原有 `runtimeFixture`，启动真实 `scripts/qa-observation-server.ts`，通过 HTTP `GET /qa/runtime/v1/leases/:id` 读取控制器。脚本只观察该 HTTP 响应，没有通过 IPC 或直接调用 ActivityWitness 来替代响应。

| 材料                                                                                      | 用途                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [第一次实时响应](evidence/qa-epoch-http-20261001/live-first.json)                         | `live-bridge`；字段实际 JSON 类型和值                                      |
| [终止前实时响应](evidence/qa-epoch-http-20261001/live-before-kill.json)                   | 第二次实际 HTTP 读取，单调读数前进，历史事件前缀不变                       |
| [实际 app 退出后的响应](evidence/qa-epoch-http-20261001/retained-after-process-exit.json) | `retained-after-process-exit`；state=released，原 clock 与 events 保持不变 |
| [交换记录及进程身份](evidence/qa-epoch-http-20261001/http-provenance.json)                | 请求地址、状态码、原响应头、父时钟请求窗口、真实 `ps` 参数/输出及断言结果  |
| [执行日志](evidence/qa-epoch-http-20261001/capture.tap)                                   | 1/1 开发取证检查通过，无跳过；SUT revision 明确绑定固定候选                |
| [取证脚本副本](evidence/qa-epoch-http-20261001/replay-capture.mts.txt)                    | 实际在仓库外临时 `.mts` 文件执行的脚本，仅作为文档附件保留                 |

响应正文只把 `observedOwnerToken` 脱敏为 `<redacted>`，并追加文件末尾换行；其余 JSON 内容未重新生成或重排。响应头保留实际网络值，所以 `content-length` 是脱敏前的长度，不应与脱敏文件字节数直接比较。没有记录登录请求头、Cookie 或模型密钥。

第一次取证的字段断言均完成，但沿用 fixture 的进程组 SIGKILL 后，清理 hook 报错；记录保留在 [initial 目录](evidence/qa-epoch-http-20261001/initial/)。该 fixture 的 `kill()` 仅检查 `exitCode`，signal 退出后的重复清理可能再杀已退出的 guardian。本轮没有修改 fixture；最终临时脚本 SIGKILL 实际 app，并等待 guardian 随 child 退出，重新完成取证和清理。

## 执行与清理范围

实际从 `agent/qa-epoch-http-evidence` 的固定 pin 开始。启动受控 SUT 前，服务端、packages、scripts、db 与相关配置的 Git 状态为空。运行命令为：

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY \
  DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:57147/postgres \
  EPOCH_HTTP_OUTPUT=/Users/zcm/.codex/worktrees/architecture-test-fixtures/kapibala/docs/evidence/qa-epoch-http-20261001 \
  node --import tsx --test --test-reporter=tap \
  /tmp/kapibala-epoch-http-20261001/capture.mts
```

该地址为本次自有 PostgreSQL 容器的临时端口，已清理，不能用作现有环境入口。运行使用 fixture 创建的 UUID 库和本地远端替身，没有调用真实模型或演示服务。[清理记录](evidence/qa-epoch-http-20261001/cleanup.json) 确认两轮 app/guardian 均退出、UUID 库与连接为零、registry 目录、自有容器及卷、依赖软链接和临时脚本均已移除。最终产品、测试和 QA 目录仍无修改。

此样例只回答字段序列化和真实 HTTP 透传问题。缓存 clock 不能用于新的请求校准；本次没有重新计算跨 epoch 活动总量，也没有证明启动或接管间隙整段处于 inactive，更不据此宣称业务验收通过。已有 gap 字段和旧证据未改写。
