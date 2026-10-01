# 消息计时与确认接收窗口的独立观测接入

此文补充 INT-R01 / INT-R03 的工程接入范围。原文 A2、B1、重启恢复和重复事件要求不变；观测接口不是新增业务 API。只允许作用于明确授权的隔离 QA 实例。

2026-10-01 接收：工程 `ffdc8b018be6c20cba2a9d34afda5225187df7cd` 的 `docs/qa-message-observation-handoff-20261001.md` 固定了下述单实例协议。QA新增 `INT-MSG-006..008`、独立客户端及工具自测；尚未运行这些产品场景。旧 `0af6443` 正式业务运行冻结的251条用例不含新三例，不追溯扩分母或拼接通过结论；后续须固定新QA/工程版本、按授权执行并单独留证。

## 已有独立黑盒能力

`integration-message-timing.spec.ts` 的 `INT-MSG-001..005` 使用原网关 GET/POST/SSE、实际远端账本及公开消息/序列 API：

- 已采集的旧404推迟到2秒窗之后发回；前提是候选真的在窗口内发起查询。若候选从不提前查询，本组合为未触达的分支，记录 BLOCKED，不能强制实现采用提前查询。
- 查询响应被真实屏障截留超过5秒，期间不得把未知判为失败；释放屏障后按原恢复2秒判定。重复计划共用同一个释放门，恢复后没有剩余未释放的计划。
- 1800ms的查询响应延迟分别覆盖原504的5秒判定与503恢复后的2秒判定。1800ms是注入数据，不是新增协议保证；若客户端把它中断为不可用，不能按“查询全程可用”的路径虚报通过或失败。
- 同一 `(clientMsgId,msgId)`、相同真实 `sentAt` 的确认用不同 `eventId` 分时递送；公开业务已提交后重启，确认时间及尚未过期的后步排期保持。**这只证明公开提交后的恢复，不证明单独接收记录已经保存但业务尚未提交的窗口。**

请求账本新增 `responsePreparedAt` / `preparedResponseStatus`，表示路由读到的外部事实快照；`responseFinishedAt` / `responseClosedAt` / `responseClosedBeforeFinish` 记录 HTTP 发送完成或提前关闭。`completedAt` 仍表示尝试写出响应，不能独自证明成功发送；`finish` 也不是 SUT 处理确认。事件的 `recordedAt` 只在QA账本中，绝不进入SSE数据。自测用真实独立 HTTP 验证旧404快照、取消连接和事件数据边界，不连接产品。

A2查询专项只切断SSE传输，网关仍真实落地、在2秒内生成推送并保留 `message_sent`，不以丢弃该事件破坏协议前提。脚本在采样中检查实际落地与事件时刻；如夹具未证明该保证，先判BLOCKED，不将之后产品反应误判FAIL。恢复查询时继续隔离SSE，保证收敛由查询取证；finally恢复本用例SSE可用性。

所有界限采用 QA 下发、HTTP、公开读回构成的时间区间。可证明违反原时限记 FAIL；上下界跨阈值记 BLOCKED。15秒、10秒等观察预算不增加产品 SLA。独立网关本身未能证明504后2秒内实际落地时，夹具无效，不能据此裁判产品。

## 三个窗口的独立验收目标

合同标识 `qa-message-observation/1`。三个能力分别验证，不能以普通数据库断网、随机延时或外部响应屏障代替。

| 窗口                                 | 最小标记与暂停点                                                                                                                                          | QA 操作与独立预期                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout-observed-before-local-save` | 目标发送客户端**已实际读取并识别504**，原时间已采集；尚未进入会推迟状态保存的本地工作。携带实例、请求身份、clientMsgId、发生时间/时钟区间；只暂停后续处理 | QA在保持查询可用的情况下延迟本地处理，再释放；5秒从原504接收起算，不能从锁释放/持久化完成重置。外部504记录与公开unknown仅辅助夹定，不伪称精确命中 |
| `receipt-before-commit`              | 已读取指定真实 `message_sent` 并捕获本地观察时间；确认接收记录尚未提交，也没有其他实例提交该身份；暂停窗口需由原事务边界证明                              | QA强杀目标实例，保持网关及数据库，重放原事实，记录原时刻是否仍可恢复。保存前丢失的已知限制不能标严格符合；不能假称客户端断连必然使SQL回滚         |
| `receipt-committed-before-business`  | 相同确认身份的接收记录**提交成功已确定**，但业务消息/序列排期事务未应用；可暂停/定向制造业务保存失败                                                      | QA强杀或释放为业务失败后恢复，重放相同与不同eventId，按初次独立接收时间区间及公开排期检查不重置、不重复效果。控制器自报时间不能是唯一oracle       |

## 归属、证据和故障约束

1. 控制器与业务监听分离，只绑127.0.0.1动态端口；必须验证QA运行ID、SUT冻结SHA、当前PID/启动身份、独立数据库身份及随机owner token。默认生产配置不可用，令牌不进入证据。
2. QA先按已知请求身份注册一次性门，控制器以单调序号返回armed/held/released及精确阶段。标记绑定实例、clientMsgId、msgId、eventId与尝试代次；在错误消息或错误实例命中不能算覆盖。
3. 标记只观察事实、暂停继续执行或在声明的业务保存点注入故障。不得写时间字段、代填已提交记录、改变查询结果、伪造网关事件或添加外部幂等。保存点次数、表名、采样频率不是QA验收指标。
4. 明确区分“SQL已发出”“数据库已提交”“客户端已收到提交成功”。提交结果未知必须照实记录，不把一个阶段冒充另一个；全局多实例首个物理观察还需每实例采时与时钟误差证据。
5. 用QA持有的lease和有限TTL恢复暂停；清理只释放本次门。控制器进程重启后不能错误命中旧PID。清理失败保留，不覆盖先前产品FAIL。
6. 工程交付冻结版本、启动配置、最小触发示例、缺失能力清单和控制器验证记录。QA完成绑定、自检后才按明确授权范围联调；本文件自身不授权产品执行。

`receipt-before-commit` 可使用更早且可证明的“接收时间已捕获、INSERT尚未发出”子窗口，并在证据中标明。自动提交语句发出之后，若无法确定提交结果，应记录为结果未知，不能冒充未提交；也不要求仅为测试将产品改为显式事务。涉及多实例时，“尚无该身份提交”须覆盖全部相关实例，单进程暂停不能证明全局未提交。

## 固定协议和当前覆盖上限

- `adapters.messageObservation={url,contractReference,registryDirectory?}`。这个固定工程入口要求专用 registry；目录必须现存、规范绝对路径、无symlink、当前uid、0700且`<UUID>.sock`路径不超过100字节。QA在每次启动/重启前复验并只注入`QA_MESSAGE_REGISTRY_DIR`；禁止用`sut.env`或宿主环境绕过。该字段计入target hash，QA客户端不创建/递归清理外部registry。
- 独立HTTP控制器与SUT分别启动，实际入口为`scripts/qa-message-observation-controller.ts`及`scripts/qa-message-observation-server.ts`。能力查询是`GET /qa/message/v1/capabilities?apiUrl&revision&pid`；`PUT /qa/message/v1/leases/<UUID>`携带`{protocol,target,mode,correlation,ttlMs}`，TTL为5000–120000ms。timeout correlation仅clientMsgId，两种receipt为clientMsgId/msgId/eventId字符串；不向控制器发送ownerToken或期望时间。
- `GET`返回完整租约历史；`POST /leases/<UUID>/advance`无正文且只放行held；`DELETE /leases/<UUID>`无正文，可释放armed/held，保留events与expiresAt。QA记录未知PUT响应的本地UUID以便定向清理。armed/未命中/到期/已有receipt窗口记BLOCKED。
- 响应绑定包含实际SUT读取的ownerToken，客户端与自己的随机token、PID、API和完整SHA比较，并在证据中脱敏。事件要求真实attemptId、observedAt、receiptObservedAt、instancePid、databaseIdentity、localBoundary、receiptPresentAtProbe和`coverage={scope:'bound-instance',allDatabaseWritersProven:false}`。不自造commitWitness字段。databaseIdentity由每个窗口实际PG系统元数据的SHA-256构成；QA仅连接本用例已拥有的PG，独立查询current_database/inet_server_addr/inet_server_port/pg_postmaster_start_time作相同规范hash，不读取业务表。
- 三个localBoundary依次为`504-recognized-local-result-save-not-started`、`receipt-insert-not-issued`、`receipt-autocommit-confirmed-business-not-started`。最后一项表示autocommit已经返回确定成功或已提交winner读回，不能用SQL已发出替代。控制器的时间仅辅助核对，QA始终使用实际递送和HTTP读回形成独立上下界。
- `INT-MSG-006`注入约2500ms的本地延迟，PASS仅证明这一轨迹在原5秒内收敛。放行后真实正查询可能立即返回，因此它不能单独排除所有内部重置deadline的实现；结合001..004时间组合解释，不伪造旧404或增加原文未有的容差来制造通过/失败。
- `INT-MSG-007/008`分别覆盖INSERT前和已确定提交后的单实例崩溃。重启保留PG/网关/控制器，显式递送原eventId和新eventId同一确认，避免依赖cursor自动重放。原后步到期前未完成恢复则BLOCKED；确定原时间丢失、排期后移或重复副作用仍FAIL。INSERT前物理时间丢失是已披露风险，不因控制器正确暴露而转为产品PASS。

这三例进入新版本业务用例分母；缺适配或真实命中证据时逐项BLOCKED。INT-R03多实例全局物理首次观察与历史未知记录迁移仍需独立设计/夹具证据。当前工具自测只能证明QA客户端分类/归属/协议，不代表工程候选通过。
