# 本轮资源清理独立复核

**PASS：仅指本run精确识别资源的归属及清理后不存在，不是业务用例通过或全部历史资源清除。**

run `2026-10-01T16-42-20.128Z-67fb4dd4`；QA `60cd3dda117b9b38906902458175cd81bd42212a`；固定SUT `8e047aea842bfcec64802e4918b52b460b93c48b`；原phase `developer-preflight`。业务raw FAIL不受本资源结论影响。

| 资源 | 运行中真实归属 | 清理后证据 |
|---|---|---|
| PostgreSQL容器 | `8e4b6ac29276f8eac720b6972ed76b17575cb7cf43d033bc3ed2f086921e2a30`，qa.owner=`af919dff-a73d-4729-b271-7952b815bfc2`；61541→5432，worker33643实际连接 | 同Docker engine `1fbf2675-d415-458c-866c-28fd59cd7267`按完整ID inspect返回no such object |
| 本容器匿名卷 | `6c3e047291a14b0a748bdc1451e0ec93c8c542a39117c39c6d9aa4f71b79d950`；Mounts及mount事件均指向同container的`/var/lib/postgresql/data` | 按该完整卷名inspect返回no such volume |
| runtime控制器 | runner91982→guardian92199→listener92200，端口58891，`/private/tmp/qa-rte-iTZ5C6` | 三PID不存在、端口无占用、registry不存在 |
| capacity控制器 | runner92682→guardian92900→listener92901，端口58915，`/private/tmp/qa-cap-7qa9qh` | 三PID不存在、端口无占用、registry不存在 |
| 本例应用与QA worker | app33699/guardian33698；worker33643；API61554、Gateway61550、Agent61552 | snapshot确认app/worker不存在；补充只读ps确认guardian不存在，lsof确认61541/61550/61552/61554均无占用 |

清理后主快照为 `2026-10-01T16:44:55.497603+00:00`；本例cleanup记录于 `2026-10-01T16:43:25.515Z`，failures=[]。运行中2个注册目录均为uid501/0700且非symlink，controller marker、实际app启动串及API绑定一致。token已脱敏；本复核不恢复/输出秘密，不把脱敏字符串当独立token相等证明。

这次已保存真实运行中Mounts，因此可核对**这一只匿名卷**；不能由一个已清理卷推导历史全部卷已清理。共享Docker后台59212仍存在正常，不属于本次清理对象。复核仅读取现有JSON并对先前明确标识的guardian/端口补做ps/lsof，没有向任何进程发信号，没有启动产品、访问数据库或删除资源。

[JSON证据索引与逐项结论](final-resource-review.json)；[运行中独立记录](during-run-review.md)；[补充只读进程端口结果](post-cleanup-remaining-process-ports.json)。旧签发报告与原始文件未修改。
