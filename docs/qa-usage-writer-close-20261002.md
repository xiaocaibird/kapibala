# C2-015 实际 writer 独立关闭接缝

开发基线为 `c0d98958a3b4fcb5d5529de2b3e3e816f5e23af5`，分支 `agent/second-round-usage-writer-close`。第三批固定产品 `ed50ca14` 的 C2-015 两个启用用量子场景在最后一步报告 `Provider operation shutdownUsageWriter lacks reviewed real fixture`：此前启停、零 token、保留文件和启动年龄裁剪断言已经执行；缺的是关闭真实 writer 后仍请求业务服务的独立控制入口。原第三批 BLOCKED 保留，本开发验证不能代替 QA 重跑。

新增 `POST /qa/usage/v1/writer/close`，详细请求和错误约束见 [观察协议](qa-usage-observation-20261002.md)。原 `UsageTestObserver` 仅增加可选 `bindWriter` 回调，在 journal 实际初始化后绑定真实 `close()`。不传 hook 的生产 main/factory 路径、默认用量配置、队列规则、业务成功结果均不变。工程路由在既有 token 和 instance 校验后释放当前写门，等待真实 close；同一实例并发/重复关闭只调用一次。后续真实调用仍通过实际 GeminiProvider 和 HTTP transport，由原 journal 关闭分支拒绝新增用量。拒绝事件的 requestId/attemptId 直接来自本次 `record(value)`。

独立进程验证使用自有随机 loopback HTTP 桩、固定合成凭据、临时 session 目录，不读取 dotenv/真实 Key、不访问收费服务。main 与显式 factory 各建立真实 `activeBatch=1, queued=1`、文件尚空的状态；错误 token、instance、请求体不能释放门。随后并发关闭释放门并保留两条记录，第三次实际 provider HTTP 调用仍成功，文件字节不变，真实 `rejected-closed` 事件仅一次且带新 ID。重复关闭不会重复 closing/closed；新建门被拒绝；正常进程退出为 code 0 并释放 owner.lock。用量关闭、factory 真省略、仅 transport 观察均返回 409；无观察开关时路由为 404。

证据目录：[qa-usage-writer-close-20261002](evidence/qa-usage-writer-close-20261002/)。`before.tap` 是开发添加用例、尚未添加接口时的原始 Node 文本输出：main/factory 均收到 404，父测试随之失败；不是产品业务失败。`after.tap` 为初版接口的专项通过，最终版本以 `focused.tap` 和 `verification.json` 为准；最终源码哈希记录测试时未提交的实际文件，不宣称提交后运行。构建包含类型与架构边界检查，另保留原题完整性检查。所有进程、HTTP 桩和临时目录由测试 finally/after 清理，没有数据库资源。

C2-020 的 `No actual exit` 另属 QA guardian 在整组 SIGKILL 后丢失 IPC 退出回报的前提问题；独立 source 原账本已有连接关闭事实。本改动不调整产品退出或恢复语义，不删除硬崩溃遗留的 owner.lock，也不声称 SIGKILL 后存在进程内完整尾部事件。
