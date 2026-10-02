# Linux 双 UID 子义务补证入口

状态：入口与 QA 自身检查已准备；产品补证尚未执行。Node 24.21.0 镜像已拉取并经过隔离非 root 版本探针，事实见 `foreign-uid-image.json`。独立依赖容器会安装固定 npm 12.1.0 后按被测锁文件执行 `npm ci --ignore-scripts`，这项安装仍在执行阶段核实。

在已提交、独立 QA checkout 根目录执行：

```sh
./qa-acceptance/node_modules/.bin/tsx qa-acceptance/second-round/harness/foreign-uid-runner.ts \
  --target /absolute/path/to/third-batch/target.json \
  --authorization /absolute/path/to/third-batch/authorization.json \
  --revision FULL_40_CHARACTER_SUT_SHA
```

入口不生成或扩大授权。它核对实际文件、完整 target hash、现有授权生效时间及第二轮范围 hash。SUT 必须是干净且固定 SHA 的独立 checkout；QA 必须已提交，只允许新增 `reports/runs/` 文件。SUT/QA/范围在执行前后分别复核。

资源限定于固定 Docker daemon `unix:///var/run/docker.sock`。每次 Docker 操作都复核 daemon ID、ServerVersion、OSType。依赖准备容器无宿主挂载；实际产品容器 rootfs 只读、网络 none、无公开端口，只使用本次新建的带 owner label 的 volume 与临时 `/tmp`。QA 协调进程有切换 UID 和停止本次子进程的最低所需 capability，实际 SUT UID 10001 与创建 foreign 文件的 UID 10002 均以真实 `/proc`/进程取证确认 `CapEff=0`。没有修改 `getuid` 或以 chmod 代替不同用户。

报告位于 `second-round/reports/runs/<run-id>/`，运行数据位于 `qa-acceptance/.runtime/second-round/<run-id>/`。包含 manifest、原 target/authorization、事件、逐子项原始结果、清理证明、Markdown、JSON、JUnit 和报告 SHA-256。原有 `archive-batch.py` 可用同名 run/runtime 直接归档。所有本次容器、临时镜像、volume 按精确身份和 label 清理；来源不明则保留并记录 BLOCKED，绝不 prune。基础 Node 镜像保留供后续使用。

仅关联 `SR-C2-008`、`SR-BE-USG-006` 的以下子义务：Linux 实际会话正控、foreign UID 会话拒绝与不重购、owned 安全临时文件清理正控、foreign UID 临时文件及独立目录哨兵保留且可选记录故障不阻业务。报告固定标记两条整例 `NOT_ASSESSED_BY_SUPPLEMENT`，不修改原 112 条报告，也不关闭 Key 文件配置导入等其他义务。Linux 与 Darwin 的证据分别保留。
