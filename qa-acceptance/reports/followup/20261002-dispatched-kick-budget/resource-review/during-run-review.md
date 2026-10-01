# 本轮运行中资源归属复核

快照 `2026-10-01T16:42:39.715654+00:00`，run `2026-10-01T16-42-20.128Z-67fb4dd4`，QA `60cd3dda117b9b38906902458175cd81bd42212a`，SUT `8e047aea842bfcec64802e4918b52b460b93c48b`。归属链可确认；该运行中快照不证明清理完成。

QA worker 33643的Gateway时钟域与ps/lsof吻合，连接环境API61554、两控制器58891/58915、PG61541。API由app33699监听，其PPID/PGID33698与控制器绑定一致。容器`8e4b6ac29276f8eac720b6972ed76b17575cb7cf43d033bc3ed2f086921e2a30`发布61541，运行中Mounts与volume mount事件将匿名卷`6c3e047291a14b0a748bdc1451e0ec93c8c542a39117c39c6d9aa4f71b79d950`精确关联到同容器的`/var/lib/postgresql/data`。

两registry均uid501、0700、非symlink，marker绑定本QA目录和固定候选，实际app PID/启动串一致；runtime与capacity的runner→guardian→listener父链及端口均吻合。environment不直接记录container ID，关联依赖上述完整交叉证据，不能据qa.owner/名字单独授权清理。

原始字段与哈希见[during JSON](during-run-review.json)。结束后的状态另见[最终资源复核](final-resource-review.md)，不倒填到运行中快照。
