# 控制台设计与验收入口

## 模块与数据流

控制台使用 React 18、TypeScript 与 Vite，REST 同源 `/api`，WebSocket `/ws`。Vite 将两者代理至 `127.0.0.1:3100`。页面不内置业务结果，展示均来自实际 API；原始需求只读。

| 层次 | 入口 | 职责 |
|---|---|---|
| API 契约 | `apps/web/src/api/schemas.ts` | 复用共享公开类型，并对每次 REST/WS 响应做运行时校验 |
| 认证请求 | `apps/web/src/api/client.ts`、`state/auth.tsx` | 内存 access token、HttpOnly cookie 续期、单飞 refresh、失效清理 |
| 实时同步 | `apps/web/src/state/live.tsx` | WS 认证、序列去重、断线重连、增量游标与异常提醒 |
| 查询与时间线 | `hooks/useResource.ts`、`hooks/useTimeline.ts` | 请求取消、过期响应隔离、分页与稳定消息身份合并 |
| 页面 | `pages/*` | 登录、账号、群组详情、Agent 步骤、序列预检与进度 |
| 复用视图 | `components/*` | 消息、任务进度、成员设置、执行轨迹与弹窗 |

## 会话与权限

access token 只在内存保存，刷新页面先通过 cookie 恢复，再从 `/api/auth/me` 获取真实角色。REST 并发 401 和 WebSocket 重连共用一个 refresh promise；较晚到达的旧 token 401 直接使用已经换出的 token，避免再次消耗同一 refresh token。logout 只有服务端成功后才清理本地会话，确保远端失效没有被错误报告为成功。401 续期失败会回到登录页。

viewer 隐藏账号写按钮、创建群组、发送、群设置切换、退群、序列创建及启动入口，保留真实只读数据。账号按钮按已读取的状态计算合法转移；状态提交带 `expectedFrom`，并发冲突显示服务端错误及 requestId，再刷新状态。权限仍由服务端验证，前端隐藏不作为授权依据。

## 消息与断线恢复

初次进入群读取 50 条消息及快照游标，“加载更早”沿同一快照继续。稳定内部 `id` 是唯一视图身份，`msgId` / `clientMsgId` 和 `sentAt` 改写不会生成第二行。旧快照分页只补不存在的行，不覆盖较新的发送状态。

WS 记录并去重 `seq`，按用户保存在当前标签页 sessionStorage。认证成功以及事件到达会重新查询当前页面。由于任意历史补投可能早于所有已显示消息，时间线实时核对会完整遍历新快照，按稳定 id 合并；不能遇到第一条重复消息就提前停止。完整核对完成后历史已全部载入，不再展示“加载更早”。这是首版演示规模的取舍：同步成本随群历史增长，后续可通过持久化消息变更版本提供增量查询，但不能仅用 `sentAt` 替代。

WS 异常后约 400ms 开始续期重连；网络未恢复继续重试。重连后读取新快照，即使前次事件已记游标但页面查询失败，也会重新核对。页面显示连接恢复状态；一致性、账号终态、审计阻塞事件显示醒目提醒。实际“三秒内补齐”需在网络恢复、服务可用且演示数据规模下进行集成验证，构建通过不代表该时限已通过。

## 页面入口与操作路径

- `#/accounts`：状态、平台身份、限流结束时间；连接、合法状态转移。
- `#/groups`：创建群组、异步任务状态、错误步骤和恢复说明。
- `#/groups/:id`：成员角色、设置、稳定消息时间线、手动发送、最近 Agent 运行、群主最后退出任务。
- `#/agent-runs/:id`：运行终态、摘要、恢复说明、各步 kind / tool / input / result / audit / error / rawResponse。
- `#/sequences/:groupId`：选择序列，输入 vars / stepVars，服务端预检弹窗逐步展示文本、最终值与来源，再按同一参数启动。预检失败展示 stepIndex / key，运行展示逐步状态与时间。

业务失败保留错误码和 requestId；任务、消息和运行均可定位关联 ID。Agent `blocked` 和 `unknown` 消息不被包装成成功。

## 已执行检查与待验收

2026-09-30 首轮：使用协调工作树的 Node 24.21.0、TypeScript 7.0.2、Vite 8.3.1 依赖执行 `npm run build -w apps/web`，类型检查与生产构建通过。安装版本由共享根工作树统一维护，控制台不单独生成 lock。

以下仍需真实服务和浏览器验收，不能因构建通过标为完成：双角色入口、refresh 并发/注销、账号 CAS 冲突、建群/退群任务、accepted→sent 单行回流、历史补投/分页、WS 断线补齐、Agent blocked 与协议错误详情、序列预检及执行进度。核心合并与续期机制另补必要自动验证；完整 Playwright 扩展不在本批范围。
