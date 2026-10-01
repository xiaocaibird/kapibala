# C2 观测接入准备记录

本次仅修改 QA 资产，未执行产品。本记录不覆盖或修改前批原始结果。

已接 `qa-gemini-observation/1` 的实际实例/PID、写前屏障、真实队列与丢弃计数；C2-016 / USG004 会逐一比较实际接受、丢弃与最终持久化的 attempt ID。USG008 增加真实写前批次强杀，保留实际会话重放、文件与锁回收记录；人工回收锁不豁免 C2-012 的强恢复缺口。

factory 省略／显式 usage 已由真实进程观测核对。C2-018 的 `providerUsageConfiguration` 将 token 矩阵、配置合法上下界与非法输入、五类独立临时文件场景组合执行；每项失败证据保留，其他可执行部分继续。临时文件只在实际停止后创建和清理，清理逐一核对本例 inode/UID。

已用显式持久化老化输入接入年龄淘汰，见下文边界说明。仍不能以本接口证明：writer 关闭后直接 enqueue、另一系统用户 UID、生产 Key 文件只导入 Key、填满最大 10000 条／16 MiB 的容量，以及全进程零外连。相关用例继续按缺项 BLOCKED；合法配置被接收不能等同实际达到容量上界。

校验：完整 second-round TypeScript 检查通过，media QA 工具自身测试 43/43 通过，差异空白检查通过。新产品执行结果均为 NOT_RUN。

## 本批收口追加

C2-020 已新增 `runProviderTransportCase(driver)`：固定逻辑目标、Key header 布尔事实、真实 302 哨兵、HTTP 错误／取消与正常／硬退出三个独立变体。仅该专项显式安装 Node 出站 preload，绑定 frozen 脚本 hash、实际 PID、运行时和私有端点。正常退出要求最后一行 `process-exit`、exitCode 0、gaps 0 与 hookStillInstalled；硬退出尾不全原样记录，不声称未落盘尾部零活动或内核级全出口。

年龄接入在原进程确实停止后，保存原始日志证据，只改指定已有记录的 observedAt 作为明确的持久化老化输入。它不改系统时钟、不冒称旧日期真实发生过模型调用。启动裁剪以及“启动时未过期、实际墙钟跨界后新写入裁剪”分别执行。C2-015 仍缺直接向已关闭 writer enqueue 的入口；USG011 最大量级填充仍单独未覆盖。

本次最后校验：second-round 类型检查、差异检查通过，media QA 工具自测 48/48 通过。未执行产品。
