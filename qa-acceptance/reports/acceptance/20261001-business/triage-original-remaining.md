# 首轮剩余三项失败的独立归因

审核时间：2026-10-01T07:12:18.169167+00:00；候选 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。审核身份为独立 AI QA。仅读取冻结证据、需求与公开契约，未运行新增产品测试，未修改产品或冻结 QA 资产。

原运行：`2026-10-01T06-10-21.458Z-1fdb6180`。三项原始 FAIL 均保留；这里的归因不替代复测，不产生新的 PASS。全部来源文件及 SHA-256、脱敏请求和事件时间线见 [JSON证据索引](</Users/zcm/.codex/worktrees/independent-qa-acceptance/kapibala/qa-acceptance/reports/acceptance/20261001-business/triage-original-remaining.json>)。公开需求文件已逐字节核对与被测0af候选一致。

| 用例 | 原始状态 | 归因 | 尚需工作 |
|---|---|---|---|
| BLK-SPEC-006 | FAIL | 产品违反本轮公开资料长度契约，S2 | 按原契约复测；后续未执行步骤仍须完成 |
| UI-024 | FAIL | QA未排除初始化/历史事件刷新；消息因果断言不成立 | 建立真实回放与周期前提后独立复测 |
| UI-025 | FAIL | QA未建立稳定的23项分页前提；没有进入返回测试 | 保存确切分页结果并待回放收敛后复测 |

## BLK-SPEC-006：41个emoji越过80个UTF-16单元仍被接受

需求依据：[资料方案](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/docs/group-directory-profile-proposal.md:68>)、[D024](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/docs/decisions.md:41>)、[冲突保护公开契约](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/docs/group-profile-conflict-review.md:20>)、[QA冻结裁判依据](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/requirements/spec-boundaries-resolution.md:60>)。限制是本轮暂沿用的版本化profile，不是用户永久业务限制。公开契约已明确UTF-16计量，没有读到批准改为code point或grapheme的替代约定。

实测证据：[api.ndjson第109/110行](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/reports/runs/2026-10-01T06-10-21.458Z-1fdb6180/artifacts/system-spec-boundaries--BL-be9ba-ndependent-boundary-oracles-system/evidence/api.ndjson:109>)。`2026-10-01T06:38:55.813Z` 提交 `name="😀".repeat(41)`，为41个code point、82个UTF-16单元；HTTP **200**，响应完整返回41个emoji。[失败断言](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/tests/system/spec-boundaries.spec.ts:572>)期待400。此前40个emoji/80单元返回200、六项非法输入返回400的步骤均已执行。

结论：这是当前公开输入契约的产品符合性失败。不能根据实际200调低QA标准。缺陷建议S2（输入规则与承诺不一致；本证据不涉及数据丢失或越权）。未额外GET核对该次持久性，不把响应回显夸大为独立持久性验证；简介251emoji、清空及后面的Agent工具边界均尚未执行。

## UI-024：无关消息前已有允许的初始化/回放刷新

依据：[目录刷新约定](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/docs/group-directory-profile-proposal.md:53>)允许相关资料事件和连接恢复触发有界刷新；无关消息不能引起遍历。[trace原件](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/reports/runs/2026-10-01T06-10-21.458Z-1fdb6180/artifacts/ui-console--UI-024-单页五秒刷新、并发失效合并且无关消息不遍历目录-chromium/trace.zip>)中同一monotonic时钟的关键顺序如下：

| 时间ms | 原始观察 |
|---|---|
| 2203789.691 | 初始目录请求200，1条轮询起点 |
| 2203814.422 | scope_ready.startSeq=13；此时回放还未转交 |
| 2203816.695 | 搜索focus完成 |
| 2203873.565 | 第二次目录请求，仅比focus完成晚56.87ms |
| 2203907.379–2203911.580 | seq1–13账户/建群/成员/名称历史事件转交页面 |
| 2203973.316 | 第三次目录请求200 |
| 2204006.511 | 本次注入的无关message(seq14)才转交页面 |
| 2204025.455 | 第832行以请求数1→2失败 |

第三次请求比本消息到达页面早33.195ms，且存在明确相关事件回放。原断言没有排除合法触发，因此不能证明产品因无关消息刷新。第二次读取也不能因落在5秒以内就算真正周期证据。原用例在并发屏障注册前结束，资料变更合并段尚未执行。

最小修订方案（本次只建议，未修改冻结脚本）：

1. 在登录之前订阅真实浏览器WebSocket与目录请求/完成/失败记录；保留同一document和连接代次，导航采用公开同文档路由，不以整页跳转另造初始化。
2. 使用公开scope_ready.startSeq水位，验证本连接真实收到的初始回放已覆盖该水位（含已先收到的事件）；继续确认相关目录刷新已完成/没有在途请求。scope_ready自身先于回放到达，不能单凭它认为已收敛；无可靠完成证据则BLOCKED。
3. 在初始化、回放、重连及相关变更均已排除的稳定页面，记录真实定时读取及后续周期；不能让几十毫秒的初始化读取满足五秒断言。周期要求仍为原5秒；不新增或放宽SLA。
4. 在已识别周期完成后的窗口注入无关消息，先证明该消息实际到达浏览器，且该负向窗口不跨下一个已知周期，也无相关事件/重连；再断言没有因无关消息新增读取。
5. 保留原并发屏障：真实首次资料变更触发一个在途读取后继续两次变更，记录请求数量、并发峰值与最终资料，finally释放。不屏蔽事件、不强制成功响应、不以重试后通过抹掉首次失败。

保持原断言：五秒周期、焦点保持、消息不额外遍历、并发峰值1、至多两次合并读取、最终名称正确、无后页cursor且pageSize≤50。

## UI-025：加载更多与167条初始事件回放交叠

依据：[目录状态与返回约定](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/docs/group-directory-profile-proposal.md:52>)同时规定当前cursor分页、相关变化过期及返回内存恢复。[trace原件](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/reports/runs/2026-10-01T06-10-21.458Z-1fdb6180/artifacts/ui-console--UI-025-同标签返回保留条件与已加载页，整页刷新清空目录内存-chromium/trace.zip>)显示失败发生在[首次加载23项断言](</Users/zcm/.codex/worktrees/qa-business-execution/kapibala/qa-acceptance/tests/ui/console.spec.ts:892>)，并未进入详情或后退。

| 时间ms | 原始观察 |
|---|---|
| 2229503.207 / 2229516.253 / 2229517.765 | 三次scope_ready均为startSeq=167 |
| 2229512.742 | asc、cache-item首页200，000–019共20条及nextCursor |
| 2229540.683–2229634.355 | 加载更多点击调用；中途按钮等待稳定 |
| 2229575.194–2229626.237 | seq1–167造数历史事件转交页面 |
| 2229633.753 | 当前cursor请求HTTP200；trace无正文，不能证明3项已成功交付/合并 |
| 2229644.668 | 10.915ms后再请求首页200，000–019共20条 |
| 2234459.276 | 周期首屏读取仍20条 |
| 2237645.061 | 23项断言超时；最终界面“已加载20个群·还有更多” |

结论：测试没有建立稳定23项缓存的前提，不构成“返回丢页”的证据。相关事件与刷新交叠已经有实物记录，但不能据此证明产品内部取消/替换的每个决定都正确；第二页正文及取消理由缺失须保留证据限制。产品分页竞争行为若在新轮稳定前提下仍异常，应继续按产品失败调查。

最小修订方案（本次只建议，未修改冻结脚本）：

1. 沿用上述真实水位和目录刷新收敛前提；23次造数的历史事件全部到达且相关读取完成后再开始查询/分页，禁止仅见20行即推断准备完成。
2. 修改q/order前先装response观察；保存对应exact q=cache-item、order=asc、pageSize=20的已完成首页响应、20个唯一ID及nextCursor，核对可见名称顺序，不能由旧条件20行满足新条件前提。
3. 点击加载更多一次，保存使用该nextCursor的真实响应正文，核对第二页3个ID与首页不重叠、累计23唯一ID且可见23行；HTTP200但正文缺失不视为第二页成功。若并发相关失效未收敛，记录具体前提缺口；不反复点击到成功。
4. 前提成立后执行原详情进入/后退/刷新流程。保持搜索、asc、23项、稳定ID位置、已加载文案、整页刷新默认条件和20项全部断言。
5. 不为缓存用例丢弃实时事件。相关事件与加载更多竞争属于独立风险场景，应另行取证实际请求是否取消、是否提示过期与可恢复；首轮目前缺少第二页正文及取消/替换原因，不能推断已修复或不存在产品问题。

保持原断言：条件cache-item/asc、23个唯一群、末项进入详情后返回恢复条件与23项及稳定ID可见位置、已加载计数23、整页刷新清空并恢复desc/20项。

## 下一轮与统计边界

最终同用例若仍失败，先比对原始失败点、请求/帧时间线与前提是否已成立；同名FAIL不能自动继承归因。需要修订QA时应另冻结修订版本、单独定向复测并保留两个原始运行。不存在“因QA问题从FAIL直接改PASS”的步骤。首轮业务原始146 PASS／82 FAIL／23 BLOCKED／0 NOT_RUN不因本次归因重算；本报告不是三条产品通过证据。

本次仅新增本目录的 triage-original-remaining.json 和 triage-original-remaining.md；源证据文件读取前后哈希全部一致。
