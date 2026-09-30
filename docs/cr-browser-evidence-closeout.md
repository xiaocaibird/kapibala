# 已批准群表单的浏览器补证

2026-10-01。仅补 CR-008/010 及创建任务存储兼容记录中明确未测的细项；不新增功能、不改产品源码、共享验收台账或独立 QA。基线为 `17b2d431f36fbd727af031e51b5bb2a6f41ad10e`，独立分支 `agent/cr-browser-evidence-closeout`。本记录不代表人工验收，也未切换演示。

原工作区 `c805530` 与该基线的 `apps/web` 树相同：`3482f253e2d198b9546eb85598cbcfa75ff4a602`。基线的 contracts 只新增事件类型约束。本轮从指定基线创建分支，重新执行生产构建与前后端类型检查后运行真实页面；构建产物摘要保存在机器记录中，未将旧构建充当当前证据。

## 环境与结果

[独立脚本](../scripts/verify-cr-browser-closeout.mjs)使用真实 production React、REST/WS、正式迁移和专用 PostgreSQL `64550` 上的 UUID 临时数据库。API/前端随机端口为 `64435/64436`，独立 headless Chromium `151.0.7922.34`，每项新建浏览器上下文。后台调度关闭，外部网关/Agent 地址固定为本机不可用端口，服务账号在线状态和一条群资料仅在临时库中准备。因此创建测试证明平台 POST 受理、真实 job 落库及前端处理，不证明远端建群完成。

最终 **8/8 场景通过，pageerror 为 0**。[完整 JSON](evidence/cr-browser-closeout-2026-09-30T22-48-45-258Z.json)含请求计数、截图、原生鼠标事件、存储错误、数据库名及资产摘要；[运行日志](evidence/cr-browser-closeout-second.log)保留原始输出。

| 场景 | 实际观察 |
|---|---|
| 创建表单遮罩与放弃 | 真实鼠标点击弹窗外 `(5,5)`，事件 `isTrusted=true`，目标为原生 dialog；创建弹窗和草稿保留。点击取消出现确认，再点击确认层遮罩仍保留，实际点击“放弃修改”后关闭；重开名称为空，POST 为 0。 |
| 编辑表单遮罩与放弃 | 同样实点两层遮罩及“放弃修改”；重开仍是已保存名称，数据库名称未变，PATCH 为 0。遮罩未绑定关闭行为，本轮证明点击不会意外丢稿，不把它描述为“点击遮罩会关闭”。 |
| 创建卸载后迟到成功 | 向真实 API 提交并取得 202/jobId，暂缓将响应交给页面；浏览器后退到账号页使组件卸载，再进目录创建新草稿。释放旧成功响应后，新弹窗和草稿不变，未保存旧 jobId、未读取旧任务，POST 恰好 1 次，旧任务在服务端仍存在。 |
| 创建卸载后迟到失败 | 同样通过浏览器历史卸载/重挂载；向旧请求释放受控 503，新草稿未关闭/覆盖，没有显示旧错误、没有保存任务或再次 POST。此失败响应由浏览器路由注入。 |
| 存储 getItem 拒绝 | 仅对 `sessionStorage` 的 `kapibala:createJob` 注入 `SecurityError`，记录真实调用；目录与创建表单仍可使用。 |
| 存储 setItem 拒绝 | 同键写入异常注入；真实 POST 202 后弹窗正常关闭，任务进度显示，服务端只有该次已受理任务，没有把持久化失败呈现成需重发的创建失败。 |
| 存储 removeItem 拒绝 | 同键删除异常注入；本页隐藏任务成功，但持久值仍在，刷新后恢复旧任务；全过程仅 1 次创建 POST。删除异常不等于已持久隐藏。 |
| 浏览器原生配额耗尽 | 在独立上下文填入 5,242,864 个 padding 字符，真实浏览器对目标键写入抛出 `QuotaExceededError`（code 22），没有覆盖 Storage 方法。随后真实 POST 202，任务仍在当前页显示且只提交一次；目标键未保存，刷新后不能找回任务跟踪。服务端已受理任务仍存在。 |

截图示例：[迟到成功后的新草稿](evidence/cr-browser-closeout-2026-09-30T22-48-45-258Z-create-unmount-late-success.png)、[原生配额拒绝后已受理任务仍显示](evidence/cr-browser-closeout-2026-09-30T22-48-45-258Z-storage-quota-accepted.png)、[删除被拒后当前页隐藏](evidence/cr-browser-closeout-2026-09-30T22-48-45-258Z-storage-remove-hidden.png)。

## 修订与清理证据

第一轮停于群主 select 的精确 label locator 超时：该 label 的可访问名称包含选项文字。没有进入产品行为断言，也没有页面异常。按实际 DOM 改为角色 combobox 与名称前缀后重新完整执行上述八项；没有修改产品行为或放宽业务断言。[首次失败日志](evidence/cr-browser-closeout-first.log)、[失败 JSON/截图入口](evidence/cr-browser-closeout-2026-09-30T22-48-11-793Z.json)原样保留。

[构建日志](evidence/cr-browser-closeout-build.log)记录 `npm run build`，包含前后端类型检查及 Vite production build。脚本另经 Node 语法检查及 Prettier 检查；本轮没有重跑全项目单元/集成测试，也没有执行独立 QA 验收。

两轮都使用既有 `temporaryDatabase` 提前注册清理，关闭浏览器、预览、API 和数据库连接后只删除本轮 UUID 库。[清理复核](evidence/cr-browser-closeout-cleanup.json)再次查询两库及对应会话，剩余均为 0；专用 PG 容器未停止，未访问演示库或用户浏览器。

## 保留边界

- **真实 OS 输入法仍未测。** 本轮无头浏览器没有适用的系统输入法交互路径；没有把合成 composition 事件、普通 fill 或 Playwright 输入当作 OS IME 实测。
- `SecurityError` 三项是目标键的异常注入，证明对应 React 捕获分支；没有证明浏览器隐私策略、第三方 iframe、全站 Storage 被禁或所有浏览器的行为。原生配额耗尽一项才是浏览器实际拒写。
- 存储不可用时只保留当前挂载中的任务显示；写入失败后的跨刷新跟踪、删除失败后的持久隐藏没有保证。卸载后的旧请求不会取消已受理服务端任务，也没有在新页面自动找回该任务的新保证。
- 遮罩与丢弃观察限定本次 Chromium、两处群表单及确认弹窗；不扩大为全应用弹窗、全部关闭组合或跨浏览器通过。

复现需先运行 `npm run build`，再显式指定专用 PG 与已安装 Playwright 模块：

```sh
DATABASE_URL=postgres://kapibala:kapibala@127.0.0.1:64550/postgres \
PLAYWRIGHT_MODULE=/Users/zcm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node --import tsx scripts/verify-cr-browser-closeout.mjs
```

脚本拒绝其他 PG 端口，每轮创建 UUID 库和独立浏览器上下文；可选 `CHROMIUM_EXECUTABLE` 指定已安装二进制。前端源码树断言固定为本轮指定候选，未来前端变更后须先重新核对适用范围，再更新验证基准。
