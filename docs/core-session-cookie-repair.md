# 同页会话 cookie 顺序修复

基于候选 `d270057`，分支 `agent/core-session-cookie`。本提交仅修改客户端会话入口和专项测试，不修改服务端协议、WebSocket 模块或 QA 脚本，不包含多标签协调。

## 问题与实现

旧 WebSocket 触发的 refresh 响应若在新登录之后到达，旧 401 的 `Set-Cookie` 会删除新 refresh cookie；旧成功响应也可能覆盖它。客户端代次检查可以拒绝旧 access token，但浏览器收到响应头时已处理 HttpOnly cookie，不能靠之后检查 JSON 修正。

`client.ts` 的登录、退出、续期现在共用同页串行队列。前一次会话请求连响应体都结束后，才发下一次 cookie 变更请求；失败也释放队列。refresh 保留原有按代次 singleflight，REST 和 WebSocket 仍共用；已排队的旧代次 refresh 在网络请求前检查，不会拿新 cookie 续期旧操作。

`AuthProvider` 使用专用 `loginSession` / `logoutSession`。登录在轮到自己时建立新代次，防止旧 REST 错误清掉正在建立的新身份。退出在队列内优先使用前序 refresh 更新的 access token；必要时在同一队列操作中续期一次再撤销，避免把续期排在自己后面形成死锁。缺失或已撤销的续期/访问凭据按已退出收口；网络或服务器失败仍报告错误，不伪报退出成功。即使前序成功 refresh 因代次变化丢弃了内存 access token，退出仍可凭已经轮换的 cookie 取得有效身份并撤销。

副作用顺序通过等待既有请求完成或其原有 20 秒超时结束保证，没有声称取消请求会回滚服务端。用户在旧续期尚未完成时点退出，需要等该请求结束；新登录不会抢先发出。此保证覆盖本页面这些正式客户端入口，不覆盖其他标签页或外部客户端。

## 验证

新增 `apps/web/tests/session-cookie.test.ts`：

- 模拟响应头即写 cookie，旧 200/401 的响应体保持未完成时，logout/login 均不发出；释放后最后 cookie 与 access token 属于 viewer，清除内存后仍能以该 cookie 续期 viewer。
- 旧成功响应已经轮换 cookie，但代次变更使其 access token 被丢弃；退出仍取得可撤销身份，撤销后才发新登录。
- 网络错误和 TimeoutError 都释放队列，后续登录继续；过期 access 的退出在队列内续期并到达撤销接口。
- 旧代次 refresh 排在新登录之后时，在请求前拒绝，零额外 cookie 变更。
- 可选真实计时测试使用生产 `AbortSignal.timeout(20000)`，没有缩短超时；实际 **20001ms** 后 refresh 拒绝，排队登录正常完成。

命令：

```sh
PATH=/Users/zcm/.nvm/versions/node/v24.21.0/bin:$PATH \
SESSION_COOKIE_TIMING_TESTS=1 \
node --import tsx --test \
  apps/web/tests/session-cookie.test.ts \
  apps/web/tests/session-boundary.test.ts \
  apps/web/tests/reliability.test.ts
```

结果 **20 passed / 0 failed / 0 skipped，20.140 秒**。原四个代次测试未修改。全部 web 测试另跑 **109 passed / 0 failed / 1 skipped**，唯一 skip 是上述显式启用的 20 秒测试。`npm run typecheck`、格式、diff 与原文 SHA 检查通过。

这些是受控 fetch、cookie 模型与真实超时证据，不冒充浏览器 HttpOnly 实验。根任务另做实际浏览器验证，应检查旧响应释放后再整页刷新或再次续期；仅看到当前页面仍为 viewer 不足以验收。本分支没有启动服务、接触数据库或演示环境。
