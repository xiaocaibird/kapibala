# 2716abd 本轮资源现场审计

只读检查正在运行及后续清理的专属资源，不发产品 HTTP/数据库请求，不发信号，不删除容器、卷、registry 或其他文件。所有现场结果追加为本目录的新 JSON；不修改冻结 QA、原始报告和旧快照。

运行一次快照：

```sh
python3 reports/followup/20261001-2716abd-retest/resource-audit/snapshot.py --phase during-run
```

主任务明确完成清理后再运行：

```sh
python3 reports/followup/20261001-2716abd-retest/resource-audit/snapshot.py --phase post-cleanup
```

脚本没有后台循环。Docker events 的截止时间取调用开始时已过去的整秒，单个命令有界；不持续订阅。每次发现本 QA 根目录 `reports/preflight` / `reports/runs` 下 14:13 UTC 以后、SUT 完整 SHA 为 `2716abdd2d43a779b6a0972a6323f895cf2b5b9c` 的 manifest，保存其摘要及已落盘用例环境/清理证据引用。运行中的报告文件可能继续增加；这里只保存读取当时状态，不为尚未结束的运行签发结论。

容器信息只保存 ID、创建时间、qa.owner、镜像、状态、公开端口及 Mounts，不落 Docker Env。registry 只保存非秘密身份字段及文件摘要，不保存 token/nonce。进程记录包含 PID/PPID/PGID/UID/原始 lstart/comm；端口由 lsof 被动观察。controller ready、registry 与具体目标分别关联，PID 或端口数字本身不等于资源归属。

精确卷映射来源分开保留：

- 活容器 `docker inspect` 的 Mounts 是现场映射。
- 已销毁容器如尚有 Docker `volume mount/unmount` 事件，可用其中完整 `container` ID 与卷 ID 建立历史映射，不靠时间近似猜测。
- 没有上述任一证据就保留映射缺口；不能把“当前没有 QA 容器”推导成“所有匿名卷已删”。Docker 事件历史可能被环形缓冲截断，分次快照合并已有证据，不能把缺事件当作从未存在。
- `qa.owner` 标签及时间窗口只筛选候选资源。并发其他 QA 资源如不能与本轮 manifest、进程/端口、控制器及主任务执行时间链关联，不计作本轮资源，亦不授权任何清理。

首个 developer-smoke 在正式现场脚本完成前已结束。曾从命令输出读到其容器 create/destroy；没有该容器存活时 Mounts，故首轮匿名卷映射目前未建立。UI 12 条运行的第一只容器已于 14:15:48 UTC 活捕 Mounts；后续精确卷关联与状态见逐次 JSON。三 controller 在取证时按预期存活，最终消失核对须等主任务收尾通知。

14:21 前脚本同时探测 Docker 短 ID 与事件中的完整 ID，个别快照对同一容器记录了两份相同完整 Id 的结果；它们不能计作两个资源。原快照保留。之后改为 `ps --no-trunc` 并对 inspect 返回的完整 Id 去重；最终汇总始终按完整 ID 唯一计数。早期不存在卷的错误消息为小写 `no such volume`，首张快照未解析出布尔结论但保留了原始 stderr；后续快照已按实际消息核对其不存在。
