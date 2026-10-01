# 2716 固定候选：独立交付与文档复核

本次三条交付/文档用例可审定 **PASS**，只限下表明确步骤。它们不是用户真实输入法、系统焦点或未经指导的理解体验，不能关闭 MAN-IME-001、MAN-FOCUS-001、MAN-UX-001。

- SUT：`2716abdd2d43a779b6a0972a6323f895cf2b5b9c`。
- 正式 QA：`ec46f9b30fb2f5a312c92fc78463ddbfe200042f`。
- 正式业务 run：`2026-10-01T14-26-25.068Z-1e0cb38a`，manifest 开始时刻 `2026-10-01T14:26:25.113Z`。
- 复核人：独立 QA `intake_risk_map`（AI 接收与文档审核，未参与本次产品实现）。
- 最初静态准备使用 QA `04e4166`。正式 run 开始后重新读 Git/source/hash 和批准台账；[正式来源索引](source-index.json)保留真实复核时刻，原[准备记录](source-index-preparation-04e4166.json)不覆盖。两次所捕获来源文件的字节哈希相同。

| 用例 | 实际步骤与结论 | 直接证据 |
|---|---|---|
| MAN-DELIVERY-001 | 从真实 Git 接收候选：仓库非 shallow，可读父提交/历史，HEAD 精确等于2716，受跟踪与未忽略文件无额外修改。候选与d761390e产品源之间只增加文档/原始证据；README、package、Node约束和原文按固定提交取出。忽略目录只有本次已有依赖和构建输出，已明确记录。可以识别源码、README及验收所用版本，PASS。 | [source-index.json](source-index.json)、[候选 README](candidate-source/README.md)、[固定交接](candidate-source/docs/qa-final-boundaries-followup-20261001.md)、[本轮构建元数据](preparation/build-preparation.json) |
| MAN-DELIVERY-002 | 新 `git clone --shared --no-checkout`，detach2716；共享仅 Git 对象，新目录先无node_modules，再按README以Node24.21.0/npm12.1.0执行全新 `npm ci`。正式run开始后按README运行 `npm run dev:isolated -- --smoke`：随机端口/新PG真实迁移、健康、HTML、API/WS代理、两角色及权限、独立模拟状态均通过。另按README正常启动，在两个独立Chromium上下文中分别以admin/viewer真实登录并通过公开导航浏览6个账号与空群入口；保存实际响应和四张截图，pageerror为0。源码/README未补改，也未询问作者补全产品启动步骤；PASS。 | [新安装及哈希](readme-preparation.json)、[npm ci](readme-npm-ci.log)、[首次原始执行](readme-execution-first.json)、[完成浏览的实际执行](readme-execution.json)、[smoke输出](readme-smoke.log)、[管理员账号](admin-accounts.png)/[群](admin-groups.png)、[只读账号](viewer-accounts.png)/[群](viewer-groups.png) |
| DOC-MAN-001 | 逐项覆盖当前32个必验追加需求。核对CR001–014、D024/D027/D029/D030/D-ATT-01、QA-D6与D042的日期/来源、正文和影响、关联版本、验收入口及新旧决定关系。实施建议、用户批准、开发验证和用户验收分开；D039/D041工程方向不冒充强保证通过；H16/H17待真人复验、H18有限反馈及H19仅评估均保持边界。未发现影响本条用例的缺项，PASS。 | [32项批准要求](approved-additions.json)、[逐组复核与精确来源](doc-traceability.json)、[变更台账](candidate-source/docs/change-requests.md)、[决策](candidate-source/docs/decisions.md)、[人工介入归属](candidate-source/docs/human-review-record.md) |

## 首轮取证中断与复核

README smoke 于 `14:28:29 UTC` 完成；随后的正常启动及管理员账号页浏览成功。QA 浏览器脚本使用 `getByRole('heading', {name: '从第一个群组开始'})` 等空态，但该真实公开文本位于 `strong`，不是 heading，30秒后取证等待超时。该首次结果为 `REVIEW_REQUIRED`，未写成产品FAIL，也没有写成完整浏览PASS；[首轮原始JSON](readme-execution-first.json)、[原脚本](execute-readme-first.mjs)、[原管理员账号截图](first-admin-accounts.png)保留。

只将取证定位改为该公开可见文本，产品、数据要求和断言不变；没有把空态注入页面。`14:30:32.545–14:30:36.064 UTC` 在另一个新实例完成双角色浏览。此复核没有重复安装或把研发侧历史复现当作本轮结果。正常浏览证明公开入口与实际读取；不外推为整个业务、所有浏览器或真实输入法通过。

## 隔离与资源核验

三次 README 实例都属于本次新克隆；没有使用正在全量验收的SUT目录、日常演示或用户浏览器。全部使用默认模拟Agent，真实模型调用0次。私有manifest仅在内存读出供PID/启动身份/UID/归属核对，未归档正文、随机数据库密码或令牌。

| 实例 | runId | 存活归属与Mounts | 正常结束后的独立核对 |
|---|---|---|---|
| README smoke | `16d522e3-8203-4204-8dbf-e7919c433444` | [存活资源](readme-smoke-resources.json) | [精确容器/命名卷/状态目录不存在](readme-smoke-cleanup.json) |
| 首次浏览取证 | `1b92564f-ec15-4e0c-89cd-ddce6cac9170` | [存活资源](readme-ui-resources.json) | [精确清理](readme-ui-cleanup.json) |
| 双角色浏览复核 | `bf3d2ac3-ea60-46bc-b2aa-53789ead3255` | [存活资源](readme-ui-recheck-resources.json) | [精确清理](readme-ui-recheck-cleanup.json) |

smoke按README自行结束，两个常规实例仅对当时重新校验PID/lstart/UID的真实owner发送SIGINT；进程退出码均0，产品返回对应 `isolated-cleaned`。随后独立枚举同一Docker daemon，按三个精确容器/卷名称确认不存在，并确认各自临时状态目录不存在。没有prune或按公共前缀删除。新clone与其依赖作为本轮复现资产保留在QA `.runtime`，不是遗留运行服务；不修改冻结QA/产品源。

## 正式录入

[三条CLI输入](manual-review-inputs.json)记录真实完成时刻与最终状态；各独立输入位于 `inputs/`。先将**整个本目录**复制到上述正式run的 `manual-review/`，再由根任务调用 `record-manual`。证据路径以正式run为基准，必须全部实际存在于run内。录入将追加独立审计记录，不修改自动化events，也不把任何developer-preflight manifest改名为正式执行。

证据哈希索引由 [finalize.py](finalize.py)生成于 [evidence-index.json](evidence-index.json)。它只核对/整理本次已保存证据，不启动产品。[capture.py](capture.py)只读固定Git来源；[execute-readme.mjs](execute-readme.mjs)为本次受控接收执行脚本，重跑会真实启动新隔离资源，不能把它当静态自检。
