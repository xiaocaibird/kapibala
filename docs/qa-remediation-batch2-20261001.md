# 联调接入第二批：账号、模块与组合入口

固定候选 `003952188a3413152d73ae77bd1cb77ed7d66d2b`。此候选包含第一批全部产品修复；本批增加隔离观测接入，没有调整原业务断言或外部协议。QA 初始全量运行及第一批定向复测仍绑定各自版本，不合并为单一版本全量通过。

## 交付能力

- runtime：`account-local-save`、`account-intent-wait`、`module-tick`。实际错误在原事务 savepoint 内发生，提交事件在外层 COMMIT 确认后发布；真实新断开请求的阻塞由 PostgreSQL 验证；模块生命周期从原调度执行与诊断读取。
- 新增 `scripts/qa-observation-server.ts`，一个固定启动命令同时接入 capacity、message、runtime。三个独立控制器的 URL 和协议保持原样。各 SUT registry 环境变量可选，至少启用一项，且必须使用不同的规范目录；没有提供的能力不注册。
- 本候选 runtime **尚无 activity-witness/activity-safe-boundary**，相应依赖继续保留。严格 60 秒预算、跨崩溃未保存活动尾段、receipt 保存前物理接收时间的已有局限未因此关闭。

## 单一 SUT 启动方式

在固定提交仓库根目录，由 QA 已有 guardian 启动以下命令；QA 配置负责注入独占数据库、`PORT`、远端两个 URL 和实际 `QA_ACCEPTANCE_RESOURCE_TOKEN`：

```sh
node --import tsx scripts/qa-observation-server.ts
```

按所需组合额外提供 `QA_CAPACITY_REGISTRY_DIR`、`QA_MESSAGE_REGISTRY_DIR`、`QA_RUNTIME_REGISTRY_DIR`。每个目录由 QA 独立创建，当前用户拥有、0700、短绝对规范路径，macOS 使用 `/private/tmp/...`。SUT 不创建或清理 QA 的目录，不使用运行时请求提供的 token 作为身份依据。不能把三个协议放在同一个 registry。

独立控制器分别启动：

```sh
node --import tsx scripts/qa-capacity-controller.ts
node --import tsx scripts/qa-message-observation-controller.ts
node --import tsx scripts/qa-runtime-observation-controller.ts
```

每个控制器仅配置自己对应的 registry 与端口变量：`QA_CAPACITY_PORT`、`QA_MESSAGE_PORT`、`QA_RUNTIME_PORT`。它们在不同端口监听回环地址。组合入口仍不增加任何生产 HTTP 控制路由；普通 `apps/server/src/main.ts` 即使存在这些环境变量也不安装 observer。各原独立 SUT 入口继续可用。

账号/模块的请求 JSON、挂点、真实诊断 profile、TTL 与历史边界见 [runtime 接入说明](qa-runtime-observation-adapter.md)；receipt 见 [消息接入说明](qa-message-observation-handoff-20261001.md)。容量接入沿用第一批与既有协议。

组合入口把同一个真实数据库实例用于全部模块：容量准入观察与事务提交观察分别包装原方法，context 中三类 observer 分别设置，互不覆盖。关闭时先释放测试门/容量，再关闭桥接、应用和数据库；初始化中途失败同样逐项清理。此处释放故障门不等于取消已发生的业务 SQL 或远端操作。

## 开发实证

候选 `0039521` 定向 **42/42，零失败、零跳过**，类型检查及原文校验通过，见 [原始执行日志](evidence/qa-combined-batch2-final-focused.log)、[机器索引](evidence/qa-combined-batch2-final-verification.json)。先前仅 runtime 的 41 项集成结果单列保留在 [前序索引](evidence/qa-runtime-batch2-final-verification.json)，不冒称同一次执行。

CO01 在同一个真实 guardian/API/数据库中同时保持三种窗口：容量耗尽使 kick 确实未派发；账号远端连接成功但原事务保存保持，本地仍 idle；发送确认已 autocommit 但消息业务更新保持，本地仍 accepted。逐项放行后，真实消息变 sent、账号原外层事务提交、kick 仅一次并完成原 run。三者绑定同一个真实资源 token 与 guardian，证明组合接入并非仅声明 capabilities。

本批验证使用独占 PostgreSQL 随机回环端口 62167 与随机 UUID 数据库，结束后核对库为零、精确清理自身容器及匿名卷。没有使用现有演示或 QA 容器。开发结果不替代 QA 独立联调和业务验收；README 的隔离复现配方与 activity 接入另批交付。
