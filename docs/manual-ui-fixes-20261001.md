# 群搜索输入提示与浏览器提醒图标修复记录

## 范围与版本

- 对应[人工评审与需求调整记录](human-review-record.md) H16、H17：负责人在人工体验中指出组合输入提示不准确，以及确认更新后浏览器图标仍留红点，随后授权修复。
- 产品及开发验证脚本提交：`6e7d664caabcba0da89136057de49482c05629d0`，基于 `ae0b15b`。原始需求文件未修改。
- 本文记录开发修复和自测证据，不改 QA 用例、断言或判定，也不替代真人输入法与正式候选验收。路由、导航、返回问题另案只评估，本提交未实施。

## 原因与行为变化

| 项目               | 已确认原因                                                                                                                                | 修复后的行为与保持的边界                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 群搜索输入提示     | `pendingQuery` 同时包含输入法组合阶段和已结束输入、等待防抖查询的阶段，原来统一显示“正在应用搜索条件”                                     | 组合阶段显示“正在输入，完成选词后再搜索”；提交后等待防抖显示“等待应用搜索条件…”。不改变现有查询、重置、刷新禁用逻辑；按钮变化本身不代表请求已经发送               |
| 浏览器图标红点残留 | 旧实现隐藏普通图标、插入提醒图标，清除时只移除提醒节点。独立 Chromium 的 DOM 已清理，原生标签栏仍显示缓存的红点；仅补静态普通图标也未解决 | 页面提供普通图标，在同一个稳定图标节点切换 `href`，确认或退出时明确切回普通图标。新作用域接管前清理旧作用域，旧回调及重复清理不会覆盖新作用域。无需浏览器通知权限 |

普通图标沿用原提醒图标中的 K 图形，只去掉红点。没有调整页面提醒的触发、确认条件，也没有改动消息发送键盘行为。

## 验证结果与证据

| 验证                       | 结果                                                     | 证据与限制                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 搜索目录及提醒相关开发测试 | 63 项通过，0 跳过                                        | 五个现有测试文件：`group-directory`、`page-attention-core`、`page-attention-directory`、`pageAttentionAdapters`、`directoryAttention`。包括组合输入、查询条件、作用域和提醒确认规则                                                                                              |
| 独立产品页面浏览器回归     | 25 项通过，页面错误为空                                  | [结果清单](evidence/manual-ui-fixes-20261001/product-browser.json)、[执行日志](evidence/manual-ui-fixes-20261001/product-browser-final.log)。覆盖群、账号、Agent、序列、重复更新、切换范围、退出；开发夹具直接写隔离数据库并注入事件，不冒充 QA 公开入口端到端证据               |
| 搜索组合输入               | 合成组合期间无目录请求；提交中文后一次查询；焦点保留     | 属于上述 25 项之一。由浏览器派发合成 `compositionstart/end` 并更新输入，实际页面与真实 API 接收请求；不代表真实系统输入法的候选窗、按键、输入法版本兼容性已完成人工复验                                                                                                          |
| Chrome 原生图标            | 7 个阶段断言通过，原生截图显示确认、接管、销毁后红点消失 | 安装版 Chrome `154.0.8037.59`，Playwright 新建独立配置，不使用用户正在操作的浏览器。导入实际 `attention/browser.ts` 的机制夹具；[观测清单](evidence/manual-ui-fixes-20261001/chrome/observations.json)。DOM、标题断言自动执行，原生标签栏截图由开发侧视觉核对，不是仅凭 DOM 判定 |
| 类型、生产构建与范围       | 通过                                                     | `npm run build`、`npm run verify:original`、Prettier、`git diff --check`；[构建日志](evidence/manual-ui-fixes-20261001/build.log)                                                                                                                                                |

图标前后对照：

- [旧移除节点方案：标题已清除，原生红点仍在](evidence/manual-ui-fixes-20261001/before-2-clear.png)。[旧观测记录](evidence/manual-ui-fixes-20261001/before.json)保留原运行路径；只归档该轮关键原生画面。
- [仅加普通图标仍失败](evidence/manual-ui-fixes-20261001/after-2-clear.png)。[该轮原始观测](evidence/manual-ui-fixes-20261001/after.json)。此失败尝试不算通过。
- [修复后待确认](evidence/manual-ui-fixes-20261001/chrome/pending.png)、[确认后普通图标](evidence/manual-ui-fixes-20261001/chrome/confirmed.png)、[新作用域接管](evidence/manual-ui-fixes-20261001/chrome/handoff.png)、[销毁后普通图标](evidence/manual-ui-fixes-20261001/chrome/disposed.png)。原生图标验证另包含再次提醒、新作用域提醒、旧回调和重复销毁。

## 复验入口

以下是开发侧验证入口。QA 自行维护正式执行方式与断言。

```sh
# Node 24.21.0；PLAYWRIGHT_MODULE 指向可用 Playwright 安装。
npx tsx --test apps/web/tests/group-directory.test.ts apps/web/tests/page-attention-core.test.ts apps/web/tests/page-attention-directory.test.ts apps/web/tests/pageAttentionAdapters.test.ts apps/web/tests/directoryAttention.test.ts

# DATABASE_URL 必须指向本次独立、可创建临时库的 PostgreSQL，不能用演示库。
DATABASE_URL='<独立测试库连接>' PLAYWRIGHT_MODULE='<Playwright 模块路径>' npx tsx scripts/verify-page-attention-browser.mjs

# 全新无扩展 Chrome 配置；macOS 原生截图需已具备屏幕捕获权限。
PLAYWRIGHT_MODULE='<Playwright 模块路径>' BROWSER_CHANNEL=chrome CAPTURE_BROWSER_CHROME=1 node scripts/verify-browser-attention-icon.mjs

npm run build
npm run verify:original
```

浏览器验证均使用本次独立进程、临时端口和合成业务记录。隔离数据库创建/删除由脚本管理，外层测试容器及匿名卷按所有者和 ID 回收；[清理记录](evidence/manual-ui-fixes-20261001/cleanup-final.json)保留实际查询结果。用户演示服务、数据、QA 文件及原正式报告未修改。本记录不宣布正式 QA 或整体验收通过。
