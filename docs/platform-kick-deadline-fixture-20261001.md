# 平台 kick 截止测试前置修正

2026-10-01，基线 `b433e474834066a286b2b35f6bb86b69ac0ca530`，固定测试源 `0398c83a0eea8d556fdb6d56167de061e6c18ece`，分支 `agent/qa-platform-kick-deadline-fixture`。**仅修改 `tests/integration/platform.test.ts`，无产品修改，无 QA 资产、外部协议、原文或验收标准变更。**

根在组合源 `a6843fa` 全回归中报告唯一失败：`platform: Agent kick deadline cancels real HTTP confirmation without replaying an uncertain effect`，`recoveryNote` 预期 unknown，实际为空。[根日志路径和哈希](evidence/platform-kick-before-source.json)保持准确来源，不复制或改写根全套结果。

独立自有 PG 的[修前定向运行](evidence/platform-kick-before.tap)真实复现同一断言失败，1 FAIL。旧用例设置持久活动 59500ms，只余约 500ms，已不足新策略规定的首次 kick POST 15000ms 准入窗口。因此请求未派发就以 wall_clock 结束，未产生未知外部效果；空 recoveryNote 正确。不能仅把断言改为接受空值，否则不再验证在途请求取消。

修正后的场景从持久活动 **43000ms** 开始，为首次 POST 留出完整已有配置窗口。保留 ready 工具和已保存 audit pass，并补入相应的有效 assistant tool_use 历史。既有模拟器 `NETWORK_TIMEOUT_NO_EFFECT` 返回真实 HTTP 504/NETWORK_TIMEOUT；应用不知道这一故障夹具的内部无效果事实，仍必须查询确认。本例不声称真实远端已成功执行，也不新增“无效果证明”协议。

仅测试夹具在模拟器 listen 前安装本地 `preHandler`，让首次 kick 后的真实 `/members` HTTP 响应保持未返回，原 run deadline 继续真实走时并取消请求。真实 socket 的关闭被记录；测试在断言后释放挂点，并在 finally 保证释放和关闭。没有伪造 gateway 返回值、修改预算、取消 SQL 或调整产品时钟。挂点匹配 kick 后的 members 请求，未来若引入并发成员事件，该夹具需重新审查请求归属；当前日志只有一条后续 GET，且在 504 后约 2104ms 到达，符合既有 2100ms 确认等待。

固定源的[定向结果](evidence/platform-kick-fixed.tap)为 **1 PASS、0 FAIL、0 SKIP**，20521.924ms（含群准备与清理）。相对插入 run 前的本地单调时间：

| 真实观察 | 耗时 |
| --- | ---: |
| 首次 POST 被模拟器接收 | 61.598ms |
| 确认 GET 被模拟器接收 | 2165.633ms |
| 确认 socket 关闭 | 17002.877ms |
| failed 终态被 API 观察 | 17050.811ms |

请求数：POST 1、后续 members GET 1；状态 failed/wall_clock，recoveryNote 保留 unknown，步骤 executing/dispatching、is_error=false、error_code=null，持久 assistant 历史不变，无虚构 tool_result，已保存审计 pass 复用且零新增审计。再启动第二实例后，通过第二实例 API 检查 failed/unknown，并再次检查同一历史与总 POST=1。**这里是新增实例，不是停止首实例后的冷重启。**

持久活动原样记录为 59980ms，不截断、不重写。43000ms 既有活动加本次约 17 秒真实等待不是一次从零 60 秒测量；该测试只证明真正进入确认后的取消和不重放，**不声明严格 60000ms 通过**，也不覆盖已知五秒/终态 SQL 锁硬界。

[关联运行](evidence/platform-kick-related.tap)另验证三个 fixture 故障清理路径与既有真实 504 kick/权限错误路径：**4 PASS、0 FAIL、0 SKIP**，9001.968084ms。[类型检查](evidence/platform-kick-typecheck.log) `tsc --noEmit` 成功。这是定向开发验证，不冒称全仓回归；根全套结果另记。[固定来源](evidence/platform-kick-fixed-source.json)记录命令模式与测试文件 SHA。

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GEMINI_ENV_FILE \
  GEMINI_LIVE_TESTS=0 DATABASE_URL='postgres://kapibala:kapibala@127.0.0.1:64866/kapibala' \
  node_modules/.bin/tsx --test --test-reporter=tap \
  --test-name-pattern='Agent kick deadline cancels' tests/integration/platform.test.ts
# 同样环境，独立关联命令的模式为：'platform fixture:|audited kick confirms'
```

[资源记录](evidence/platform-kick-resources.json)保留本次新专属容器 `kapibala-platform-kick-20261001`，完整 ID `1bb53d9d5014dc75270f8ae3ce964b5a969c0aa4126712cfe44159341bee4042`、端口 64866 与匿名卷。完成后临时库及连接为零，按自有标签和完整 ID 删除容器/卷并二次确认不存在，见[清理记录](evidence/platform-kick-cleanup.json)。本直接平台夹具没有启动 guardian，HTTP app/模拟器均走注册的清理回调；没有独立逐临时目录删除清单，不夸大清理证明。依赖软链已移除，未访问真实模型、密钥、QA 服务或演示环境。原失败和成功日志均原样保留，[SHA-256 清单](evidence/platform-kick-sha256.json)覆盖全部证据。
