# 第二轮独立验收报告

**本轮结论：FAIL。上线准备度：未评估。**

固定产品：`0be8575f326f709fe674e20033843d950385043d`；QA：`0be8575f326f709fe674e20033843d950385043d`。
共 112 条：通过 100，失败 6，阻塞 6，未执行 0。

产品运行类：通过 94，失败 6，阻塞 6，未执行 0；交付材料核查：通过 6，失败 0，阻塞 0，未执行 0。

范围为 C1/C2、五项 P0、五项 P1 与受影响原功能。自动重试为零；研发日志仅作交付材料核查，不能替代产品实测。

首轮五秒解释和真实 IME/焦点确认按负责人决定暂缓；已决定的工程处置及外部协议限制保留原始结论。第二轮发现的真实新增回归另列。付费 provider 缺许可时保留阻塞，独立离线用例继续执行。

| 用例 | 标题 | 结果 | 说明 |
|---|---|---|---|
| SR-C1-001 | 真实附件下载、文本与私有绝对路径 | PASS |  |
| SR-C1-002 | 重复与双实例回放不改首次来源 | PASS |  |
| SR-C1-003 | 来源缺失、拒绝跳转、URL与大小边界 | PASS |  |
| SR-C1-004 | 暂时下载失败后原任务跨重启恢复 | PASS |  |
| SR-C1-005 | 默认30天和可配保留阈值两侧 | FAIL | AssertionError [ERR_ASSERTION]: 已删除/不可用附件不能留下旧路径 + actual - expected  + '/Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/.runtime/second-round/2026-10-02T00-12-11.076Z-760cef1e/SR-C1-005/variant-3/media/media-030cff11-5b1a-4306-9ac4-68fa03cf9129.bin' - null  |
| SR-C1-006 | 删除后旧分页游标和自身回声不复活路径 | PASS |  |
| SR-C1-007 | 触发、工具读取和未完成下载的活动引用 | PASS |  |
| SR-C1-008 | 引用登记与清理互斥的两个实际顺序 | PASS |  |
| SR-C1-009 | 下载/发布/删除四个崩溃窗口恢复 | PASS |  |
| SR-C1-010 | 真实unlink失败不留旧路径、不阻塞其他删除 | PASS |  |
| SR-C1-011 | 持久目录重启、共享实例和错目录拒绝 | PASS |  |
| SR-C1-012 | 旧schema拒绝启动、可重复迁移及历史回填 | PASS |  |
| SR-C2-001 | 独立turn/audit四工具和合法schema协议 | PASS |  |
| SR-C2-002 | 默认mock与只改AGENT_URL的显式切换 | PASS |  |
| SR-C2-003 | 历史、tool_result/错误续接与run隔离 | PASS |  |
| SR-C2-004 | 已完成响应和正常重启后复用 | PASS |  |
| SR-C2-005 | 同run在途并发与历史分叉拒绝 | PASS |  |
| SR-C2-006 | 上游错误、截断、安全拒绝和非法输出 | PASS |  |
| SR-C2-007 | 未决轮和死owner.lock的安全行为与限制 | PASS |  |
| SR-C2-008 | session目录私有、独占与损坏状态 | BLOCKED | PreparationBlocked: [BLOCKED] Private storage subscenarios lack actual fixtures: foreign-owner |
| SR-C2-009 | 主后端权限/托管保护与同key审计发送复用 | PASS |  |
| SR-C2-010 | 独立服务下真实步数与活动预算耗尽 | PASS |  |
| SR-C2-011 | 审计fail/三次未知/明确pass的主后端后果 | PASS |  |
| SR-C2-012 | 模型在途硬崩溃后的原强恢复义务 | FAIL | AssertionError [ERR_ASSERTION]: 原强恢复不豁免硬崩溃后必须人工清owner.lock才能继续  false !== true  |
| SR-C2-013 | 实际usage字段、缓存不计推理、未知和结果隔离 | PASS |  |
| SR-C2-014 | usage真实写失败隔离与容量裁剪 | PASS |  |
| SR-C2-015 | usage启用差异、默认限额、零值、年龄与关闭 | PASS |  |
| SR-C2-016 | usage有限队列与响应不等待磁盘 | PASS |  |
| SR-C2-017 | 最终候选真实提供方最小新增证据 | BLOCKED | PreparationBlocked: [BLOCKED] 真实提供方缺本轮有限收费授权/凭据引用/模型/调用与费用上限；不读取本机Key、不调用 |
| SR-C1-013 | 媒体通知不变新消息/提醒及页内更新 | BLOCKED | BlockedError: [BLOCKED] 浏览器未建立真实排他标签焦点；已移除适用的工具焦点仿真，不伪造visibility/focus事件 |
| SR-C1-014 | 未知效果暂停中的running引用跨重启保留 | PASS |  |
| SR-C1-015 | 文件打开/写入失败、部分文件与发布后收紧上限 | BLOCKED | opened-file-write-failure: PreparationBlocked: [BLOCKED] Actual QA-only OS probe shows immutable flag does not reject already-open descriptor writes; no safe deterministic product write-syscall failure fixture, no product failure inferred |
| SR-C2-018 | usage非法token/无效配置/临时文件精确清理 | PASS |  |
| SR-C2-019 | 后端原turn超时/严格工具5秒/跨epoch关联回归 | FAIL | original-five-second-wait-and-confirmed-key-reuse: AssertionError [ERR_ASSERTION]: 实际工具状态等待下界超过原始5000ms上限 |
| SR-C2-020 | 提供方目的地址、凭据header与退出资源 | PASS |  |
| SR-UI-001 | 原提交未改动的成功可清理原草稿 | PASS |  |
| SR-UI-002 | A提交后编辑B，旧成功保留B | PASS |  |
| SR-UI-003 | A提交后B再A，旧成功仍保留新A | PASS |  |
| SR-UI-004 | 换群后旧发送响应不清另一群输入 | PASS |  |
| SR-UI-005 | 换账号或会话后旧发送响应隔离 | PASS |  |
| SR-UI-006 | 失败回执保留等待期间编辑输入 | PASS |  |
| SR-UI-007 | 未知发送结果不清稿或盲重发 | PASS |  |
| SR-UI-008 | 新序列表单脏状态及保存中全部关闭入口 | PASS |  |
| SR-UI-009 | 保存快照与保存中编辑的实际记录一致 | PASS |  |
| SR-UI-010 | 建群和编辑群现有关闭保护回归 | PASS |  |
| SR-UI-011 | 群变化后旧预检晚到失效 | PASS |  |
| SR-UI-012 | 模板变化后旧预检晚到失效 | PASS |  |
| SR-UI-013 | 变量变化后旧预检晚到失效 | PASS |  |
| SR-UI-014 | 群模板变量ABA及响应乱序不能复活旧预检 | PASS |  |
| SR-UI-015 | 确认摘要绑定冻结目标与最终渲染内容 | PASS |  |
| SR-UI-016 | 显式选择和URL目标失效必须重选 | PASS |  |
| SR-UI-017 | 首次默认选择与显式目标失效区分 | PASS |  |
| SR-UI-018 | 运行时角色预检、限流顺延和排期回归 | PASS |  |
| SR-UI-019 | 群详情进入运行详情返回原群 | PASS |  |
| SR-UI-020 | 运行列表进入详情返回保留群筛选 | PASS |  |
| SR-UI-021 | 查看所属群及来源标题高亮一致 | PASS |  |
| SR-UI-022 | 直接入口和非法来源安全站内兜底 | PASS |  |
| SR-UI-023 | 刷新与历史前后退保留合法来源 | PASS |  |
| SR-UI-024 | 加载失败和身份变化仍可离开详情 | PASS |  |
| SR-UI-025 | 来源导航和提醒确认不串实体 | BLOCKED | BlockedError: [BLOCKED] 浏览器未建立真实排他标签焦点；已移除适用的工具焦点仿真，不伪造visibility/focus事件 |
| SR-UI-026 | 退出换账号或同账号重登不接受旧history | PASS |  |
| SR-UI-027 | refresh401且Workspace未挂载仍可安全离开 | PASS |  |
| SR-UI-028 | login成功后me失败恢复 | PASS |  |
| SR-UI-029 | 导航存储写失败有界降级 | PASS |  |
| SR-BE-DEL-001 | 首轮签发事实与第二轮差异逐项可追踪 | PASS |  |
| SR-BE-DEL-002 | 既有决定、真人与上线结论不相互替代 | PASS |  |
| SR-BE-DEL-003 | 组合候选与授权准入不借历史结果放行 | PASS |  |
| SR-BE-DEL-004 | 干净副本按最终README可隔离安装迁移启动 | PASS |  |
| SR-BE-DEL-005 | 升级重启保留数据且不会删除其他运行目录 | PASS |  |
| SR-BE-DEL-006 | C3复用新候选完整登录到实际run步骤 | PASS |  |
| SR-BE-GRD-001 | send_message 审计非pass绝不实际派发 | PASS |  |
| SR-BE-GRD-002 | kick_user 审计非pass绝不实际派发 | PASS |  |
| SR-BE-GRD-003 | 同key在未确认和已确认状态复用原消息不重审重发 | PASS |  |
| SR-BE-GRD-004 | 被拒调用不占send幂等key | PASS |  |
| SR-BE-GRD-005 | 幂等竞争与崩溃恢复不重复已有副作用 | PASS |  |
| SR-BE-GRD-006 | 关闭Agent在当前step结束后原子取消 | PASS |  |
| SR-BE-GRD-007 | 资料与取消事务失败不留半提交 | PASS |  |
| SR-BE-GRD-008 | CAS失败和旧执行者竞争不导致错误取消或额外效果 | PASS |  |
| SR-BE-MUT-001 | 审计守卫错误副本确由业务断言检出 | PASS |  |
| SR-BE-MUT-002 | 同key守卫错误副本由重审或重复副作用断言检出 | PASS |  |
| SR-BE-MUT-003 | 单事务入口与有限静态门禁交付可复核 | PASS |  |
| SR-BE-DB-001 | 两档真实PG计划与API成本可复现 | PASS |  |
| SR-BE-DB-002 | 一个局部优化或有依据的不优化结论 | PASS |  |
| SR-BE-DB-003 | 首次固定分页集合与同毫秒顺序不重复不遗漏 | PASS |  |
| SR-BE-DB-004 | 出站确认改时间与补投不破坏旧游标 | PASS |  |
| SR-BE-DB-005 | 局部优化回滚和并发读取保持公开语义 | PASS |  |
| SR-BE-DIA-001 | 真实tick失败形成可信原因时间和关联 | PASS |  |
| SR-BE-DIA-002 | 真实恢复更新当前建议并保留一份最近失败 | PASS |  |
| SR-BE-DIA-003 | 诊断admin/viewer权限和敏感信息隔离 | PASS |  |
| SR-BE-DIA-004 | 未知外部效果只建议核对不盲重发 | FAIL | dispatched-no-effect-unknown-restart-original-budget-and-completion: 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成；dispatched-effect-unknown-restart-original-budget-and-completion: 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成 |
| SR-BE-DIA-005 | 并发失败与重启诊断不串来源或泄露 | PASS |  |
| SR-BE-POL-001 | 有权审计pass也不能kick当前托管目标 | PASS |  |
| SR-BE-POL-002 | 审计等待时目标成为托管身份派发前重查 | PASS |  |
| SR-BE-POL-003 | 容量拒绝等待时目标身份变化仍零kick | PASS |  |
| SR-BE-POL-004 | 普通外部目标原审计开关权限预算保持 | PASS |  |
| SR-BE-POL-005 | 已派发外部kick的未知结果不被新政策误重放 | FAIL | dispatched-no-effect-unknown-restart-original-budget-and-completion: 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成；dispatched-effect-unknown-restart-original-budget-and-completion: 原A5.8强恢复差异：真实未知外部结果使原run进入recovery-paused；安全不重放不等于完成 |
| SR-BE-POL-006 | leave-all仍可清托管成员且群主最后 | PASS |  |
| SR-BE-POL-007 | 保护在重启恢复和C2提议下保持同目标事实 | PASS |  |
| SR-BE-USG-001 | turn与audit真实调用记录和实际usage精确对应 | PASS |  |
| SR-BE-USG-002 | HTTP错误坏输出和超时各自记录失败不虚构零消耗 | PASS |  |
| SR-BE-USG-003 | 完成结果缓存复用不增加实际推理计数 | PASS |  |
| SR-BE-USG-004 | 并发turn/audit下记录不串身份且有界 | PASS |  |
| SR-BE-USG-005 | 写入失败或慢存储不阻塞调用且可诊断 | PASS |  |
| SR-BE-USG-006 | 关闭记录与权限清理不触及秘密或其他目录 | BLOCKED | PreparationBlocked: [BLOCKED] Foreign UID evidence runs in a separately frozen Linux supplement; whole-case acceptance requires explicit same-candidate sub-obligation review, no inferred pass |
| SR-BE-USG-007 | 允许字段留存不泄露prompt工具正文和key | PASS |  |
| SR-BE-USG-008 | 正常关闭与硬崩溃后记录真实性和缓存边界 | PASS |  |
| SR-BE-USG-009 | 用量写失败诊断自身不造成递归或信息泄漏 | PASS |  |
| SR-BE-USG-010 | 正式入口与显式编程入口usage配置保持公开差异 | PASS |  |
| SR-BE-USG-011 | 记录数、UTF-8字节及年龄边界按启动与写入清理 | FAIL | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:  429 !== 200  |
| SR-BE-USG-012 | 成功HTTP真实用量与随后输出失败独立记录，非成功HTTP不取body用量 | PASS |  |
| SR-BE-USG-013 | 部分用量字段独立校验，零与未知不混淆且不补算总量 | PASS |  |
| SR-BE-POL-008 | 派发前托管目标明确拒绝跨真实work截止仍正确保存并保持取消优先级 | PASS |  |

逐项步骤与预期见同版本 cases/；原始事件、子项证据和清理异常见 results.json、events.ndjson 及 cases/ 证据目录。未命中故障窗口不得据此宣称恢复通过；有限执行不构成穷尽性证明。

只有本轮所有必验项实际通过且未留阻塞/未执行，才能给出本轮无条件通过建议；最终产品上线决定仍由负责人作出。
