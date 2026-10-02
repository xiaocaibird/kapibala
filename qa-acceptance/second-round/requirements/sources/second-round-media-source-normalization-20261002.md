# SR-C1-003：媒体来源规范化前校验修复

2026-10-02。独立分支 `agent/second-round-media-source-normalization`，基线 `c0d98958a3b4fcb5d5529de2b3e3e816f5e23af5`。最终产品与开发测试提交 **`22db66d7e82383eac17be6db85cf3e2bd512c975`**，前置提交 `892f4c07e030cb333fa06b40ef4a24a87a6c7174`；后者曾通过其当时 23 项，但随后发现同协议相对路径遗漏，不能作为最终修复结论。研发没有更改 QA、main、运行中的 SUT 或演示环境。

## 原故障与契约

QA 第三批固定源 `ed50ca14ae3f4140d7f020f282b313b137920209` 的 `SR-C1-003` 输入原始 `http://127.0.0.1:<owned>/media/denied-url-controls/../escape`，其独立 HTTP 来源与出口观察均记录了规范化后的 `GET /media/escape`；来源返回 404。来源是 QA 自有 loopback，未观察到本例向外网发出请求。[C1 来源契约](c1-media-files.md)与[接入契约](qa-media-scenarios-20261002.md#网关消息下载与独立事实)限制为配置 Gateway 同源的 `/media/:id`，拒绝其他路径及危险路径字符；不能依据解析后的实现行为放宽原输入要求。

产品原实现先 `new URL(source, base)`，再检查 `url.pathname`。Node 会先消除 `.`/`..` 和对应单层 `%2e` 点段、把反斜杠当路径分隔符、剔除部分控制字符。因此原始非法输入可变成合法形状后被放行；404 后路径为空不代表从未派发。这是产品来源校验缺陷。

QA 五份原件（result、环境、来源 HTTP 账本、下载周期原始行、独立出口快照）只读复制到[证据目录](evidence/media-source-normalization-20261002/)的 `qa-*.json.gz`；解压字节哈希与原绝对路径在 [qa-originals.json](evidence/media-source-normalization-20261002/qa-originals.json)，未覆写 QA 原件。`ed50ca1` 和本次基线的媒体产品文件相同，见 [verification.json](evidence/media-source-normalization-20261002/verification.json)。

## 最小改动

[trustedMediaUrl](../apps/server/src/modules/media-files/index.ts) 在 URL 构造前增加两项校验：

1. 拒绝原始反斜杠和 ASCII C0/DEL 控制字符。
2. 拒绝完整的单点/双点路径段，含 `%2e` 的大小写和单层混合编码。仅为这项检测剥掉开头的一次 URI scheme，覆盖 `http:../media/escape` 等同协议相对形式；实际 URL 仍用原始 source 解析，不递归解码，也不把任意冒号当路径分隔符。

原有长度、首尾空白、HTTP(S)、同源、凭据/查询/片段、根 `/media/:id` 和单次解码 ID 的危险字符检查保留；下载仍 `redirect:manual`。允许路径没有扩大为配置 URL 的任意 `base.pathname` 前缀；`/prefix/media/file` 仍拒绝。此前合法的可解析相对形式保留，其解析结果仍须落在根 `/media/:id`。

合法对照包含同源绝对 URL、根相对和网络路径相对 URL、`media/file-1`、同协议相对 `http:media/file-1`、以 `/media/` 为 base 时的 `http:file-1`，以及 `a..b`、`.hidden`、`v1.2`、`a:..`、`a:.`、`a:%2e%2e`、`%2Ehidden`、UTF-8/空格编码、`%252e`。后者只解码一次为字面 `%2e`，没有借此新增二次解码规则。

无数据库迁移、外部协议、重试策略、时限或字节限制变更。

## 修前、交叉复核与最终开发验证

新增 [media-source-url.test.ts](../tests/integration/media-source-url.test.ts)。真实 I/O 用例通过实际 `GatewayEvents.process` 持久化事件原始 source/text，然后启动既有单 worker 子进程入口；每次仍执行真实 recover + 一次 tick、保留每 tick 两文件上限。下载到独立端口 HTTP 服务并记录实际 method/raw URL，读取真实 PG 行、文件字节和目录，不 stub fetch 或伪造响应。

| 阶段 | 固定来源与实测 | 结论边界 |
|---|---|---|
| 原产品反例 | `c0d98958` 产品 + 初版新增测试：**1 PASS / 2 FAIL**；来源收到 12 条非法规范化请求及前后两条合法请求 | 包含 QA 的 `/../escape`。本开发 HTTP 服务实际返回 200 文件字节，原产品错误落为 ready；QA 原例实际 404，二者响应事实分别保留 |
| 第一候选关联回归 | `892f4c07`：**23 PASS / 0 FAIL / 0 SKIP** | 只覆盖当时样本，未覆盖之后发现的同协议冒号相对路径 |
| 扩展反例 | `892f4c07` 产品 + 新增五种同协议相对输入：**1 PASS / 2 FAIL**；真实来源收到这五条非法请求 | `http:../`、`http:./`、`http:%2e%2e/`、`http:.%2e/`、大写 scheme。保留首次候选缺口，不覆盖为通过 |
| 最终关联回归 | `22db66d7`：**23 PASS / 0 FAIL / 0 SKIP**，约 44.7 秒 | 20 项既有媒体检查 + 3 项新增检查；不是独立 QA 结果，也不与第一候选重复相加 |
| 最终静态验证 | 同一 `22db66d7`：`npm run typecheck`、`npm run verify:original` 退出 0 | 类型/职责检查与原文一致性；未额外执行全项目测试或前端构建 |

最终真实 I/O 检查使用 11 个顺序执行的 worker 子进程。17 个原始非法来源均保留消息文本和原 source，媒体/消息路径为空，状态 `unavailable`、`last_error=UNTRUSTED_MEDIA_URL`、`attempts=0`；自有 HTTP 账本只有 `GET /media/ok-start` 与 `GET /media/ok-end`，两份真实文件内容均正确、目录最终只有这两份文件。不是只用“零 HTTP”推断未派发。

既有 20 项同时覆盖合法下载、重试/404/重定向/大小限制、默认保留期、清理与运行引用、路径投影和已有子进程崩溃场景；这些开发通过不关闭其他 QA 用例或原保证缺口。事件进入为开发直接调用真实处理器、下载为真实 worker 子进程；**未跑完整标准 main/SSE 黑盒链路，也没有声称全进程任意出口都受此测试观察**。

原始 TAP、各阶段命令/退出码/产品与测试哈希、原/候选/最终源码、精确补丁均在[证据目录](evidence/media-source-normalization-20261002/)。`before.*`、`candidate-892-*`、`candidate-scheme-before.*`、`final-related.*` 分开保存。扩展后只新增非法输入和合法对照，没有降低原断言；各阶段测试字节不同处以对应哈希和源码副本为准。

复跑命令（需要执行者自己的 PG17；夹具只将 DATABASE_URL 用作连接参数，创建/删除 UUID 库）：

```sh
DATABASE_URL='<owned isolated PostgreSQL URL, never the demo database>' \
  node --import tsx --test --test-reporter=tap --test-concurrency=2 \
  tests/integration/media-source-url.test.ts tests/integration/media-files.test.ts
npm run typecheck
npm run verify:original
```

## 资源归属与交付限制

本次只创建 `kapibala-media-url-e72772fc`，完整容器 ID `1bdf7c54d1176664e54faf1f6ca73625a1547a1d5975292d1a68218678758380`，PG17 镜像身份、owner 和 loopback 端口 **59174** 见 [environment.json](evidence/media-source-normalization-20261002/environment.json)。停止前临时测试库为零；按完整 ID + owner 标签核对后停止 `--rm` 容器。容器及其唯一匿名卷最终不存在，42 个从测试记录提取的媒体目录均不存在，见 [cleanup.json](evidence/media-source-normalization-20261002/cleanup.json)。

第一次停止后立即检查容器/卷联合不存在的断言未满足；该检查没有打印哪一项仍被列出。随后仅重复只读查询，确认 Docker 异步自动移除已完成，没有再次删除或修改产品。该收尾观察单列于 `cleanup-first-check-note.json`，不计作产品失败，也不伪造为首次检查成功。

所有交付文件及本报告由 [SHA256SUMS](evidence/media-source-normalization-20261002/SHA256SUMS) 校验。main 合入与 QA 当前候选选择由负责人处理；本报告只交开发修复与证据，不改写第三批 QA 原 FAIL，也不代签复测 PASS。
