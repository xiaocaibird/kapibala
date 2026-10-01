# UI 适配接入记录 — 0af6443

- 目的：确认真实页面定位与账号资源观察夹具；不产生业务验收通过结论。
- 候选：`0af644334b00eb13e2e56df33c70f22358a6a0f7`。
- 真实授权：冻结 QA `.runtime/authorization.business.json`，每次资源初始化均经 `requireAuthorization`；详见各轮 manifest。
- 实际浏览器：Chromium，专属 PostgreSQL、Gateway、Agent、API、Web 动态端口；第三轮清理 `failures=[]`。
- 66 个定位键：52 个取得可见 DOM 样本；另 1 个 `sequenceGroup` 在转换中首样本不可见，但随后 selectOption 与预检成功，保留原样本不改写；12 个条件定位仅静态确认，交正式运行核验；1 个实测缺失。
- 实测缺失：`sequenceResourceRefresh` 对应序列资源错误区，真实 403 页面没有重试按钮；不改为页面重载、不弱化用例。现有 ARC-UI-015 有明确 BLOCKED 分支。
- `verification.observation` 为已确认账号观察夹具：账号 ID 限定行、状态文本“在线/已离线”、真实错误区、页头纯刷新与同文档证明。只验证定位和刷新入口，未预跑完整未读确认业务用例。
- 前两次页面空白归因 QA 浏览器代理拒绝精确 `/@react-refresh` 路径；第二轮保存真实 403、DOM 和截图。根任务修复代理并自检后，第三轮完成关键路径，无 probe stage error。
- 所有 probe 原始数据与截图按 attempt 保留；中间一次业务基线指纹变化由授权门禁阻止，没有绕过。
- Firefox / WebKit 安装完成，兼容性结果仍待正式运行。

适配器：`config/ui-adapter-0af6443.json`。正式目标须取其 `ui`，重新冻结 target 指纹与授权，不能直接沿用旧 target 指纹。
