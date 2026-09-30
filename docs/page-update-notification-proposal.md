# 页面实时更新提醒方案

状态：**待评审** · 2026-09-30 · 源码核对基线：`6bca533`

## 先评审这四点

**推荐：一个标签页只提醒当前路由的“页面类型 + 实体 ID”。失焦时显示静态 `[有更新]` 标题和 favicon 红点；前台不弹窗、不闪烁，内容未呈现时保留页内“有新消息 · 查看”入口。仅切回不清除，在相关内容已呈现且发生真实操作后消除。首版接入群详情的新消息，通用接口预留 Agent 运行详情。**

以下均为建议，尚未获用户批准；本文件保存不代表实施授权。

| 待拍板 | 推荐选择 | 另一选择与代价 |
|---|---|---|
| 1. 聚焦时是否提醒？ | 新内容已呈现则安静更新；未呈现则只保留一条页内提示。失焦后仍有待关注内容，再显示标签提示 | 前台也一直显示标签红点，更显眼但持续消息更易打扰 |
| 2. 什么操作清除？ | 仅切回不清除；相关内容呈现后，在消息区域点击、键盘操作或主动滚动才确认；“查看”逐项带到待关注内容 | 任意页面操作即消除更简单，但编辑群资料或输入消息可能掩盖尚未看到的消息 |
| 3. 首版接入哪些变化？ | 群详情中新建的消息记录：外部消息、后台 Agent/序列消息、其他标签页手动消息；排除本标签主动发送及纯发送状态回流。Agent 详情本轮只设计接口 | 同时接入 Agent 详情，需要增加运行状态/步骤适配与验收；群资料、成员变化需另列规则 |
| 4. 是否接受少量协议补充？ | 补充事件变化类型、页面订阅起点标记，以及手动发送预先关联 ID；复用现有事件表和消息字段，无数据库迁移 | 纯前端更快，但初始化历史与实时更新、发送响应前的自身事件不能完全可靠区分，不能声称满足严格边界 |

## 已确认要求与范围

用户要求：先出方案、马上评审，确认后再实施。浏览器页面**未聚焦时，当前已打开页面的相关实时更新必须提示**；前台策略尚待评审。提示按页面类型和实体 ID 隔离，不汇总所有群，不在群列表或服务账号页提示别的群。可复用不代表自动接入所有页面或所有事件。

本方案的“有更新”是当前标签页、当前页面生命周期内的关注状态，不是服务端未读数、阅读回执或跨设备已读系统。建议离开该路由即销毁状态，返回重新订阅；刷新也重新开始，不为离开期间补记提醒。关闭页面后不提醒，不请求系统通知权限，不加声音、Web Push 或 Service Worker。多标签页各自独立。

本次仅新增方案文档。群名称、简介、创建时间的现有实现不重做；其他分支若有提醒草稿，均不能视为已采纳设计。既有全局异常提示保持独立，本方案不重构它们。

## 官方依据与策略比较

查阅日期：2026-09-30。浏览器资料说明能力，产品帮助说明特定产品行为；下表不是统一行业规范。

| 官方资料 | 查证内容 | 对本方案的意义 |
|---|---|---|
| [MDN：document.title](https://developer.mozilla.org/en-US/docs/Web/API/Document/title) | 可读取/设置文档标题，影响浏览器标签或窗口标题 | 静态前缀是基础提醒渠道；不需要通知权限 |
| [MDN：Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | 可监听可见性；focus/blur 不能代替可见性判断；后台调度受浏览器策略影响 | 同时判断 visibility 与 focus，不承诺页面被暂停时仍即时更新 |
| [MDN：Document.hasFocus](https://developer.mozilla.org/en-US/docs/Web/API/Document/hasFocus) | 判断文档或其内部元素是否持有焦点 | 可覆盖“页面仍可见，但用户正在另一个窗口操作”的情况 |
| [MDN：rel=icon](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#icon) | icon 关联文档图标；多图标时浏览器按属性选择 | favicon 是增强渠道，须实际验证目标浏览器，标题仍保留 |
| [MDN：Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) | 观察元素与视口/祖先的交叉关系；普通交叉检测不等于完整遮挡检测 | 用于呈现证据，不能证明人已经阅读；还要排除应用内弹层遮挡 |
| [Slack：已读偏好](https://slack.com/intl/en-gb/help/articles/360043037853-Manage-your-Mark-as-read-preference) | 可在打开会话后标记已读，也可保留未见消息未读 | “打开即清”与“保留未见”都是产品选项；本方案推荐较保守的后者 |
| [Slack：通知设置](https://slack.com/help/articles/201355156-Configure-your-Slack-notifications) | 桌面图标 badge、Windows 闪烁与活跃状态可分别配置 | 提醒强度可分层，但桌面应用行为不能直接当作浏览器规则 |
| [Teams：角标活动](https://support.microsoft.com/en-au/teams/notifications-settings/catch-up-with-and-manage-badge-count-activity-in-microsoft-teams) | 聊天角标可在打开聊天或标记已读时清除；不同活动有不同计数规则 | 产品有“打开即清”的做法，但其全局计数体系超出本次范围 |

**设计判断：**采用静态二值提示，避免伪装成准确未读数量。标题示例为 `[有更新] 群详情 · Kapibala`；恢复后为 `群详情 · Kapibala`，不把消息正文放进标题。聚焦且正在看新内容时不再加标签提醒；未呈现的更新合并成一个页内入口，不重复 toast、不抢焦点、不强行滚走正在阅读的历史。

系统通知可让用户在看不到浏览器时更容易发现变化，但增加权限与平台策略；声音有打扰和播放限制；后台推送需要服务端投递及订阅生命周期。三者仅作后续备选，本轮不纳入。

## 已核对的代码接入点

下列是当前基线的代码事实，不是新功能已经实现的声明。

| 位置 | 现状与设计影响 |
|---|---|
| [useRoute](../apps/web/src/hooks/useRoute.ts)、[App](../apps/web/src/App.tsx) | hash 路由 `#/groups/:id`、`#/agent-runs/:id`；详情按 ID 设置 React key。可在 Workspace 确定唯一活动 scope，但仍需防旧异步回调 |
| [LiveProvider](../apps/web/src/state/live.tsx) | 一条 WS，按 seq 去重，sessionStorage 保存用户事件游标，60ms 合并 revision；只向组件暴露 revision/connection/notices，没有通用业务事件订阅。不能把 revision 增长等同新消息 |
| [实时服务](../apps/server/src/core/realtime.ts)、[事件持久化](../apps/server/src/core/db.ts) | 服务按 seq 重放，事务提交前串行持久化事件；认证响应只有 success，没有历史重放终点/页面起点。全局 lastSeq 不能当页面进入时服务器最新位置 |
| [useTimeline](../apps/web/src/hooks/useTimeline.ts)、[快照协调器](../apps/web/src/hooks/snapshotReconciler.ts) | 首屏分页、事件触发全量快照重核及失败重试；有生命周期隔离。新数组、首次快照或加载更早记录都不是新消息证据 |
| [消息合并](../apps/web/src/api/messages.ts)、[Timeline](../apps/web/src/components/Timeline.tsx) | 按 id 合并，sentAt/id 排序；近底部 80px 控制自动滚动。已有 data-message-id，但没有“用户看到更新”的确认机制，80px 不能作为已呈现判据 |
| [消息事件](../apps/server/src/modules/gateway/events.ts)、[发送流程](../apps/server/src/modules/gateway/messages.ts) | 入站插入、出站排队、accepted/sent/失败等都发 message 事件。id/clientMsgId/msgId 可关联；时间晚到不能按 sentAt 最大值过滤 |
| [消息 DTO](../apps/server/src/modules/gateway/models.ts)、[前端 schema](../apps/web/src/api/schemas.ts)、[发送 API](../apps/server/src/modules/gateway/index.ts) | DTO 不暴露 source；isOwn 指服务账号消息。发送 API 只收 accountId/text，返回 clientMsgId，当前 Timeline 丢弃该响应值 |
| [Agent 发送](../apps/server/src/modules/automation/tool-execution.ts)、[序列发送](../apps/server/src/modules/automation/sequences.ts) | 已在 metadata 写 source=agent/sequence；手动默认 manual。不能用 isOwn 屏蔽这些后台消息 |
| [Agent 运行](../apps/server/src/modules/automation/agent.ts)、[运行详情](../apps/web/src/pages/AgentRuns.tsx) | agent_run 携带 runId/groupId/status；详情读取运行快照，可以后按 runId 适配，不能只匹配 groupId |
| [登录生命周期](../apps/web/src/state/auth.tsx)、[HTML 入口](../apps/web/index.html) | 退出成功或会话失效会卸载 Workspace/LiveProvider；标题固定为 `Kapibala · 消息平台`，入口未声明 favicon，前端未发现其他标题写入者 |

## 页面作用域与五种状态

建议 scope 为 `{ pageType, entityId, sessionEpoch, generation }`。业务身份是前两项，后两项仅用于隔离重新登录及 A→B→A 的旧响应；不要用易歧义的字符串拼接。

| 状态 | 定义 | 不代表什么 |
|---|---|---|
| route active | 当前 Workspace 真正渲染这个详情 ID | 后台浏览器标签内也可以保持活动路由 |
| document visible | `visibilityState === 'visible'` | 不代表获得焦点或看到某条消息 |
| document focused | `document.hasFocus()`，监听 window focus/blur 后重算 | 不代表有真实操作，更不代表阅读 |
| 用户交互 | scope 内可信点击/键盘输入/触摸或滚轮引发的主动滚动 | 鼠标移动、程序滚动、定时器或自动聚焦不算 |
| 内容已呈现 | 对应更新实体已成功加载、React 已提交，目标区域进入实际视口且未被应用弹层挡住 | 数据请求成功、在 DOM 中、列表在底部均不能单独证明 |

前台条件为 `routeActive && visible && focused`；失焦提醒条件为 `routeActive && (!visible || !focused)`。就算标签页被切到后台，路由仍是群 A，所以可提醒 A；在同一标签内导航到群列表，则 A 的 scope 已结束，不再提示 A。

首版只允许 `group-detail + groupId` 注册消息适配器。Agent 详情的候选规则为终态变化与新增有结果的步骤（按 runId 和步骤身份去重）；不为每次轮询、运行心跳、相同快照提醒。接入时再确定“哪些步骤值得提示”。群详情里的 Agent 列表组件不能单独抢占全局标题。

## 触发与清除矩阵（建议）

“提示”只针对允许的业务变化；加载失败/断线仍使用相应错误或连接提示。

| 场景 | 标签标题/favicon | 页内状态与清除 |
|---|---|---|
| 当前 scope 已订阅，失焦收到相关新消息 | 立即设置静态提示，不等待内容渲染 | 记录待关注 ID；即使加载失败也保留，显示“有更新，内容待同步” |
| 前台收到新消息，内容尚未呈现或正在看旧消息 | 不新增标签提示 | 一个“有新消息 · 查看”入口；不得因持续打字而清除未见消息 |
| 前台新内容已呈现，持续在该消息区域交互 | 不新增标签提示 | 当前呈现的更新可确认；不弹窗、不闪烁 |
| 前台新内容已呈现，但没有更新后的真实操作 | 不新增标签提示 | 留待确认；之后失焦仍有待关注项则显示标签提示 |
| 失焦提示后仅切回/窗口获得焦点 | 已有标签提示保留 | 不把 focus/visibilitychange 当作确认；提供页内入口 |
| 在消息区点击/键盘操作，或用户滚动使目标呈现 | 仅在待关注集合清空后恢复 | 只确认该次操作时已呈现的更新；不清除视口外或加载失败的项 |
| 点击“查看” | 定位完成且对应内容呈现后逐项清除 | 默认定位最早待关注项；剩余项保留入口。“查看”失败不清除 |
| 输入框打字、发送消息、操作群资料/设置、点导航 | 不作为消息确认 | 发送后的自动滚动也不能把所有消息自动标为已关注；离开路由执行生命周期清理 |
| 本标签用户主动手动发送 | 不因自身消息创建/回流新增提示 | 通过预先登记的 clientMsgId 匹配，不按文本或 isOwn 猜测 |
| Agent/序列后台新增消息，或其他标签手动新增消息 | 按当前前台/失焦规则 | 都是本页新变化；同一记录后续发送状态不重复提示 |
| 首次历史、加载更早、重复事件、相同快照 | 不新增提示 | 初始化不等于已读操作；历史不加入待关注集合 |
| 切群 A→B、离开详情、退出登录或会话失效 | 恢复对应页面基础标题和正常图标 | 取消旧 scope、清空待关注项与自身发送集合，拒绝旧回调 |

呈现判据建议先用消息行正文区域与顶层视口/滚动裁剪的实际交集，超长消息至少有可阅读的正文片段，而非仅头像/行尾。可用 IntersectionObserver 辅助，操作时再核验当前布局；弹层打开时不自动确认。这个判据表示“更新已被呈现且用户有相关操作”，不宣称全文读完。阈值需浏览器验收后微调。

用户操作只能确认其捕获的那批 ID/版本；同一时刻新到的消息不能被一次 `clearAll()` 抹掉。程序化滚动需有“查看”按钮发出的明确操作令牌，普通 scroll 事件本身不足以证明用户滚动。不得在更新前的任意点击后长期自动清除未来消息。

## 去重、初始化与重连：建议的最小可靠路径

推荐复用现有 WS 和快照，不新建提醒 socket、不建通知中心、不写已读表。为解决已核实的协议缺口，评审后增加以下小范围契约；这些尚未实现。

1. **页面订阅起点。**在已认证 WS 增加一个无持久化的 marker 请求，携带 requestId。服务端读取已提交事件最大 seq 并返回 `scope_ready { requestId, startSeq }`；这是本次订阅成立的边界。前端进入详情即请求并缓冲候选事件，拿到对应 marker 后仅接收 `seq > startSeq`。控制消息不推进全局 lastSeq，不能跳过其他尚未消费事件。marker 不创建服务端未读状态，也不改变现有全局事件传输。
2. **业务变化类型。**新写入的 message 事件增加 `changeKind: 'created' | 'delivery'`。真正插入新记录时是 created；accepted/sent/失败及身份确认是 delivery。继续携带 groupId/id/clientMsgId/msgId；可附 source 帮助解释，但不把 source=manual 等同本标签用户。入站重复插入失败不再造 created。旧 payload 缺字段只能促使刷新，不能直接升格为新消息提示。
3. **本标签发送关联。**手动 POST 前生成 clientMsgId 并登记在当前 scope；发送 API 接受该可选字段，复用已支持它的 enqueueSend。这样 WS 先于 POST 响应也能准确排除本次自身发送。需校验 ID、拒绝冲突，不因此新增自动重发行为或承诺新幂等语义；其他消息仍正常提示。请求结果不确定时保留这个精确 ID 至 scope 结束，不能暂停整页消息提醒。
4. **事件与呈现分开。**合格 created 事件先写待关注集合，再让既有 revision/快照链路加载正文；首次快照不能顺便清掉这些项。快照中的历史不凭数组差异触发。新消息 sentAt 即使很早，仍按新提交事件处理。快照请求失败不能确认；重试成功后再允许用户确认。
5. **断线重放。**同一 scope 保留原 startSeq、候选项及去重记录，按既有 sinceSeq 恢复，不重新建立起点从而吞掉断线期间更新。同一 seq 只消费一次；同一消息身份只创建一次关注项。其他实体事件只刷新其原有数据路径，不进入本 scope。只有切换路由/会话才重置订阅起点。

消息逻辑身份优先关联本地 id，辅以 scope 内的 clientMsgId 与 msgId 别名；同一出站消息的临时回显与最终 outbox ID 要归并，不能因为确认后换了标识再次提醒。现有 findEcho 会向网关核对身份，但查询 404 后可能暂时按独立回显落库。因此 created 不能仅表示“插入了一行”：有待关联出站候选的服务账号回显应暂缓业务新消息判定，待权威关联结果后按原消息归并，或确认独立消息后再产生候选；不能凭相同文本或一次 404 判定来源。这个分支必须在实施前用隔离竞态测试验证，若现有网关无法提供足够关联证据，应明确保留身份待确认限制，不宣称完全消除误报。只比较消息条数、sentAt 最大值、isOwn、最后一次 revision 都不够。

**启动边界与降级必须如实显示：**页面进入至 marker 确认之间属于“正在建立提醒”，该期间开始前已经提交的记录按历史加载，不承诺从路由点击的毫秒起捕获一切变化。marker 成立后，即使首屏未加载完，相关事件也必须提示。若要求路由切换瞬间的严格覆盖，还需扩展带服务器边界的数据订阅协议，不能假称现有代码已具备。断网进入一个新详情时同样显示尚未建立；已建立的 scope 断网则等待恢复后补提醒。

若选纯前端备选：完整首次快照建立 ID 基线后才开始差分，保存发送响应的 clientMsgId 并缓冲响应前事件。它仍有初始化窗口和请求结果不确定时的误报风险；不能用固定延时、文本匹配或屏蔽所有服务账号消息掩盖限制。推荐先选协议补充路径，避免把这些问题留给用户猜。

## 状态机与接口草图

以下仅表达职责，具体命名可在实施时调整；所有调用都携带同一 lease，过期 lease 无效。

```ts
type PageScope = { pageType: 'group-detail' | 'agent-run-detail'; entityId: string };
type Lease = { scope: PageScope; sessionEpoch: number; generation: number };
type Update = { key: string; seq: number; targetId: string };

// 单一页面负责人注册；嵌套组件只通过 lease 提交证据。
activate(scope: PageScope, baseTitle: string): Lease;
establish(lease: Lease, startSeq: number): void;
observe(lease: Lease, update: Update): void;
confirmPresented(lease: Lease, keys: string[], interactionToken: string): void;
deactivate(lease: Lease): void;
```

```text
inactive → establishing → quiet
                    └── 合格事件 → pending（可先于正文加载成功）
quiet + 合格事件 → pending
pending + 有效操作及对应内容呈现 → 移除该批项；集合空才回 quiet
任意状态 + scope/session 结束 → inactive，释放资源
focus / visibility 变化只重算展示，不自动确认
```

建议由一个 `PageAttentionProvider` 持有当前 scope、待关注集合和浏览器展示状态，路由层决定唯一 owner，业务适配器决定是否值得关注，Timeline 提供呈现/操作证据。组件不得各自写 document.title 或 favicon。

基础标题和提醒前缀从状态派生，不读取已有标题反复拼接。管理器进入时记录原始图标节点属性；自己增加的节点在销毁时移除，原有节点则恢复。统一处理路由更换、登录退出、错误边界卸载、React 开发模式重复挂载；旧 lease 的 cleanup 不能覆盖新 owner 的标题。focus/blur/visibility、交互监听和 observer 都由明确生命周期注销。

favicon 建议使用本地静态正常/红点两份图标，复用当前品牌 K 的视觉，不引入图像生成、远端图标服务或 canvas 定时重绘。不显示精确数量，不以颜色作为唯一信号。页内入口支持键盘，状态文案可用 `aria-live="polite"`，只在无提示→有提示时播报，避免每条消息打断。

## 边界与未验证限制

- **前台持续更新：**同一轮多个更新合并为一个入口；已有提示不闪动。用户停在旧消息时保持原位置；晚到消息可能插入历史位置，“查看”要按待关注 ID 定位，不能只滚到底。
- **多标签页：**A 标签关注群 A，B 标签关注群 B；同群的两个标签分别确认，互不清除。不用 localStorage/BroadcastChannel 做隐式全局已读。
- **内容缺失或身份归并：**合格事件对应内容暂未取到时保留待同步状态；快照成功但 ID 已归并时按别名找最终行。找不到时提供重新同步，不自动当作已看过。
- **权限/实体失效：**明确 401、退出成功、确定 403/404 后终止该 scope 并展示现有错误；网络失败不能伪装成离开页面或确认成功。退出请求失败且仍登录则不提前清空。
- **重放缺口：**当前源码没有事件保留窗口/缺口协议。方案依赖所需事件仍可重放；若以后裁剪或重置事件流，须增加 reset/gap 信号并显示“同步范围待确认”，不能把任意快照差异报成新消息。旧缺字段事件也不具备新契约保证。
- **资源有界：**只保留活动 scope，合并 seq/消息别名；极长会话若达到实现时确定的待关注上限，降为一个“更新较多，需重新同步查看”状态，不能静默丢项后自动清空。首版不提供准确未读数。
- **浏览器限制：**标题/favicon 是页面可执行时的标签提示，不能保证用户已注意、浏览器被冻结时的实时性或窗口被遮住时一定看见。恢复执行后应重连补齐；favicon 动态刷新、固定标签及不同主题的实际显示仍待 Chrome/Edge/Safari 验证。本次未打开或自动操作用户验收页。

## 评审后最小实施任务与粗估

以下为熟悉当前代码的单人开发粗估，含针对性验证，非承诺；本次未实施。

| 任务 | 范围 | 粗估 |
|---|---|---|
| 事件/起点/发送关联契约 | WS marker、created/delivery、可选 clientMsgId，更新 contracts/schema；无表结构迁移 | 4–7 小时 |
| 页面提醒核心 | 唯一 owner、lease 隔离、静态标题/favicon、焦点与清理 | 3–5 小时 |
| 群详情适配 | 消息身份归并、呈现确认、“查看”入口、发送排除 | 4–7 小时 |
| 聚焦验收与回归 | 状态机/协议竞态测试，独立浏览器人工验收，文档更新 | 4–6 小时 |

推荐路径合计约 **15–25 小时（约 2–3 个工作日）**；主要不确定性是消息身份回显竞态与浏览器呈现判据。纯前端备选约 8–14 小时，但保留上述准确性限制。以后单独接入 Agent 详情约加 3–5 小时，需重新确认业务触发规则，不默认计入首版。

最低必要测试应覆盖 scope 与 epoch 隔离、乱序/重复/身份归并、初始 marker 与历史重放、POST 响应落后 WS、断线恢复及“操作只确认已呈现的一批”。仅针对新增行为及现有相关模块回归，不把本次文档检查写成工程测试通过。

## 可直接操作的验收清单（实施后执行，本次未执行）

使用独立验收环境与测试群 A/B；业务事件由验收者或隔离测试工具触发，不向用户当前验收页面注入操作。先确认提醒状态“已建立”。

- [ ] 群 A 保持打开，切到另一浏览器标签或其他应用，向 A 新增消息：标题和 favicon 出现提示；页面仍可见但窗口失焦也应生效。
- [ ] 同样状态向 B 新增消息：A 不出现 B 的提示；导航至群列表/服务账号页后再向 A 新增消息也不出现提醒。
- [ ] 只切回 A 不点击：已有提示保留；点资料编辑、只在输入框打字均不清除视口外的新消息。
- [ ] 点击“查看”，对应消息成功呈现后清除该项；有多条未呈现消息时继续保留入口。制造内容加载失败时，点击不能消除提示。
- [ ] 前台停在最新内容并进行相关操作：新消息自然更新，无弹窗/闪烁；滚到旧内容后新增消息：不抢滚动，出现单一页内入口。晚到旧时间戳消息也能定位。
- [ ] 本标签手动发送且让 WS 先到、POST 响应后到：不提醒自身；Agent/序列后台消息、另一标签手动消息仍提醒；queued→accepted→sent/failed 不新增第二次提示。
- [ ] 首次载入大量历史、加载更早、重复投递、重复快照均不误报；marker 后首屏加载期间的新消息即使已包含在首次快照中仍提示。
- [ ] 已建立 A 的 scope 后断线，期间新增消息，恢复时只补一次提示；快照暂时失败后自行恢复，未呈现内容不会被确认。此项只在隔离环境控制网络。
- [ ] A→B→A 快速切换并延迟旧请求，旧事件/响应/cleanup 不污染新 scope；退出成功或会话失效立即恢复标题图标并注销监听。
- [ ] 同群两个标签分别显示/确认；一个标签确认不替另一个清除。Chrome/Edge/Safari 检查正常图标恢复、固定标签显示与键盘操作，无权限弹窗。

## 本次交付记录

仅新增本文件，状态保持待评审；不修改应用代码、配置、依赖、数据库、现有决策或变更记录，不启动/停止/重启服务，不推送、不部署、不合并实现。原始需求文件校验值须保持 `c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75`。

文档导航集成点为 `docs/README.md` 的阅读顺序，可在协调后增加本方案入口；本次不修改该共享文件。用户评审后的具体采纳、调整或暂缓再进入决策记录。
