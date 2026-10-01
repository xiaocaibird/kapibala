# 容量准入观测与故障控制接入

**当前状态：QA 客户端、10 条操作/断言脚本及 fake-controller 自测已编写；工程侧控制器尚未交付接入，产品未执行。** `automated` 表示有真实自动化入口，不表示环境就绪或原容量阻塞已通过。缺配置、归属或能力时用例运行时报告 BLOCKED，不能因接口返回“已饱和”就宣称触发成立。

依据是原 A5 的审计、权限、60 秒活动预算、取消和恢复，以及 D036/AR-04 的“零远端容量拒绝可以延期”。本文件不新增生产业务 API 要求。产品工程负责提供可验证的测试观测/故障接入；QA 负责独立预期、协议客户端、实际场景和网关副作用账本。可采用工程测试入口加本机薄适配服务，无需把控制接口部署到生产。

## 公开屏障能证明什么

`CAP-REG-001..004` 的网关 request 屏障证明请求已经派发，Agent audit 屏障证明审计响应尚未送出。它们均不能证明本地容量拒绝；其通过不关闭 CAP-001..010。

版本化技术文档中的“8 个本地执行槽”可以作为针对该版本的夹具布置参数，不能成为产品必须保持的容量。仅开启同等数量独立群 kick 仍缺少两项因果证据：每个在途网关请求具体持有多少层准入资源、这些资源持续到哪个外部边界，以及目标是否实际尝试过准入。不同 run/kick 层可以占用不同资源；多一个没有请求的目标可能只是尚未调度。QA 不通过固定槽数或随机睡眠猜测拒绝已发生。

因此最小工程接入至少包括：

- **关联诊断**：实例、groupId、runId、toolUseId、attemptId、单调 seq、reason=capacity，确认受保护回调未进入且尚无远端派发；可以由结构化日志承载。QA 与独立网关零请求/零效果交叉核对。
- **可保持/释放的真实容量占用**：合法外部操作持有者，或经确认的测试故障入口。不能仅强制返回一个 capacity 错误以替代真实资源耗尽。已确认的持有者与释放必须有证据。
- **仅 CAP-009 需要的精确窗口**：已发生零远端拒绝、但恢复 ready 状态尚未提交时可停住；这是工程故障控制依赖，不是用户业务语义待裁定。普通审计/网关屏障不能命中它。
- **CAP-003 活动计时**：原 run 活动预算决定的权威时间区间，排除停机；不将控制请求起点或每次重试起点当预算起点。采样区间跨 60 秒时保留 BLOCKED，不擅加容差。

工程已在固定候选0af6443交付容量控制器，详见[接收评审](../requirements/engineering-candidate-intake-20261001.md)。QA尚未实际联通或验证真实饱和；下面的客户端契约和工程交物均不能替代QA执行证据。

## 配置、归属与清理

目标配置可选 `adapters.capacityControl = { "url": "http://127.0.0.1:<port>", "contractReference": "已确认的工程接入文档/版本" }`。只允许显式 loopback origin，无用户名、密码、额外路径、query 或 fragment；配置纳入目标授权指纹。

0af6443工程入口还需要可选适配字段 `registryDirectory`。它须为本轮独占、已存在、当前uid拥有、权限精确0700的规范绝对目录，无符号链接别名；拼接 `<UUID>.sock` 后不超过100字节。macOS应先取realpath，使用 `/private/tmp/...` 而非 `/tmp/...`。这是临时IPC资源，接收/执行记录仍保存在QA目录。

QA在读取目标配置以及每次迁移、SUT/第二实例/页面服务启动前重新检查目录，再受控注入 `QA_CAPACITY_REGISTRY_DIR`；路径纳入目标指纹。仍禁止在 `sut.env` 直接设置任意 `QA_*`，不继承宿主同名变量。通用容量协议不强制其他工程实现也采用这个目录。QA启动器不创建或递归删除配置目录；后续资源准备须自行创建独占目录、记录归属，并只清理本轮资源。目录访问权限不能代替实际SUT的owner/PID/API/SHA核验。常驻控制器的启动、保活和退出仍须单独管理，不随某例SUT重启。

每用例 `QaEnvironment.capacityControlTarget()` 提供 `{apiUrl, revision, pid, ownerToken}`，token 由 QA 随机生成，并通过受控 `QA_ACCEPTANCE_RESOURCE_TOKEN` 传给当前专属 SUT。客户端不把 ownerToken 发送给控制器。控制器必须从绑定的实际进程观察 token，并在 `binding.observedOwnerToken` 返回；QA 核对 apiUrl、完整 revision、pid、token 一致后才允许创建故障。token 在证据中脱敏。

这里的 pid 是 `OwnedProcess` 的 guardian/进程组标识，不一定是实际应用子进程 PID。工程控制器须核对该拥有者下的实际应用及 API 绑定，不能以端口相同或一个任意进程的自报值代替归属。整个受控进程组继承本轮 token，重启后 pid 重新绑定。

每次故障使用客户端随机 leaseId。创建响应丢失时仍能针对已知 leaseId 清理；不得按全局条件释放他人的资源。DELETE 幂等，清理只操作该 lease；客户端异常也必须在 finally 请求释放。控制器独立执行 TTL 自动释放（最长 120 秒的 QA 试验安全界限，不是产品性能指标），并保留已释放租约的事件供核对。重启前释放旧实例租约，新实例须重新校验 pid/token；不得借原端口复用跳过归属。

## `qa-capacity-control/1` HTTP 协议

所有响应是 JSON，失败使用非 2xx；无重定向。GET 只读，PUT/DELETE 仅作用已校验的专属目标。请求不含业务 SQL、模块路径或可执行代码。

1. `GET /qa/capacity/v1/capabilities?apiUrl=...&revision=...&pid=...` 返回：

   ```json
   {
     "protocol": "qa-capacity-control/1",
     "binding": {
       "apiUrl": "http://127.0.0.1:1234",
       "revision": "<40位SHA>",
       "pid": 12345,
       "observedOwnerToken": "<从实际进程观察>"
     },
     "capabilities": ["admission-hold", "before-ready-window", "active-clock"]
   }
   ```

   能力只声明接入支持范围；后续真实事件与独立网关事实才是场景证据。普通容量用例仅需 `admission-hold`，CAP-003 额外需 `active-clock`，CAP-009 额外需 `before-ready-window`。

2. `PUT /qa/capacity/v1/leases/<client-generated-UUID>` 请求：

   ```json
   {
     "protocol": "qa-capacity-control/1",
     "target": { "apiUrl": "http://127.0.0.1:1234", "revision": "<40位SHA>", "pid": 12345 },
     "correlation": { "groupId": "...", "runId": "...", "toolUseId": "..." },
     "mode": "hold-admission-capacity",
     "ttlMs": 90000
   }
   ```

   另一个 mode 为 `hold-after-refusal-before-ready`。只有实际占用已建立才返回 held，并包含 `capacity-held` 事件；不接受只返回 armed。特殊窗口 mode 在目标真实拒绝后停住 ready 提交前位置，不能篡改步骤内容或提供额外幂等保证。

3. `GET /qa/capacity/v1/leases/<UUID>` 读取完整快照；`DELETE` 释放该租约及窗口，返回相同结构但 state=released。重复 DELETE 也返回同一已释放租约与完整历史。客户端校验事件不能倒退、删除或改写。

   ```json
   {
     "protocol": "qa-capacity-control/1",
     "leaseId": "<UUID>",
     "state": "held",
     "expiresAt": "<ISO UTC>",
     "binding": { "apiUrl": "...", "revision": "...", "pid": 12345, "observedOwnerToken": "..." },
     "correlation": { "groupId": "...", "runId": "...", "toolUseId": "..." },
     "events": [
       {
         "seq": 1,
         "at": "<ISO UTC>",
         "kind": "capacity-held",
         "groupId": "...",
         "runId": "...",
         "toolUseId": "..."
       },
       {
         "seq": 2,
         "at": "<ISO UTC>",
         "kind": "admission-refused",
         "groupId": "...",
         "runId": "...",
         "toolUseId": "...",
         "attemptId": "...",
         "reason": "capacity",
         "callbackEntered": false,
         "remoteRequestCount": 0
       }
     ]
   }
   ```

事件 `kind` 支持 `capacity-held / admission-refused / before-ready-held / ready-persisted / run-terminal`。拒绝和 before-ready 事件必须包含容量原因、唯一尝试身份和零派发证据，实体锁忙或已进入回调不能替代。`before-ready-held` 必须指向同一次已拒绝尝试，事件确认时该尝试 ready 提交仍被拦住。`ready-persisted` 可用于验证故障窗口没有提前溜过。

`run-terminal` 必须与原 run 的公开终态吻合，并在预算用例携带 `status / endReason / activeElapsedMs:[下界,上界]`。时间来自原活动计时，不得伪造精度或把派发后未知状态伪装为零效果。

## 用例闭合范围与纠正

- CAP-001..006 有确证拒绝后的释放、取消、预算、政策、群不可写、执行资格操作和断言。CAP-006 当前两变体是只剩合格 creator 与没有合格管理员；原终态矩阵和 CAP-005 保留群主终态原子后果覆盖。
- CAP-007 在拒绝期间让目标先退出或退出再重入，释放前已完成独立网关成员变化。原工具只绑定 platform_user_id，QA 不新增“成员加入代次”或“必须人工决定”的标准；按既定 `{kicked:true}`、最终不在群、同一步审计唯一和最多一次实际操作验收。它不替代“已派发未知效果之后重入”的强恢复轨迹。
- **CAP-008 范围纠正**：旧设计要求通过公开单活跃 run 制造同实体内部 lock_busy，却没有合法可达入口依据；撤回这个 QA 附加门禁，不声称原内部场景已通过。现在验证确证容量延期后 OWNER_LEFT/NO_PERMISSION 仍按原业务契约返回。以后若工程提供合法可达入口，再作为影响评估纳入。
- CAP-009 保留原 A5 正常续跑、同 runId 和不重复效果标准；不能把 paused 或人工处理当通过。精确窗口能力未接入仍 BLOCKED。
- CAP-010 验证已派发后遇容量压力的明确 504、1500ms 落地且无成员事件组合，不会把已派发状态改成零效果重试。任意未知外部效果、未知效果后重入、无限时刻恢复仍保留原 REC-007 与其他协议限制，不能宣称全面证明。

产品验收仍需后续明确授权。当前 fake-controller 自测只证明 QA 客户端的归属、协议、清理与断言工具行为，既未启动 SUT，也未证明工程控制器已实现或被测功能通过。

交叉复核后，通用场景以前置一次确证拒绝为足够，不强制产品在等待期间反复轮询。取消/预算/不可写终态释放容量后保留至少1500ms采样，不能瞬时零请求即宣称无迟发。CAP-009/010在关键窗口及收敛期间重新验证租约有效；CAP-003增加QA独立单调时钟创建/公开终态区间交叉核对，控制器自报值不能覆盖明显的真实提前/延后。相交只表示未被独立测量否证，不能伪称精确时刻已独立证实。
