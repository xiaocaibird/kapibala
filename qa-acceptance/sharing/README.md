# 共享用例与开发提测入口

`qa-acceptance` 是同一份 QA 标准的存放位置。QA 负责维护需求、用例、断言、协议桩、子集清单及正式报告；开发可以读取标准，并通过提测入口选择已有子集执行预跑，不复制用例、另造期望或修改断言来获得通过。

开发发现规范歧义、定位适配问题或测试缺陷时，反馈用例 ID、候选提交、预期/实际与脱敏证据，由 QA 审核修改。需要调整标准时保留变更来源及影响，原执行证据不回写成新标准下已通过。此协作约定不是文件系统权限或密码学防篡改保证；执行端还应绑定 QA 文件哈希、SUT 提交和授权目标。

正常写入例外是开发预跑在 `reports/preflight/` 下保存**本轮自有**报告和证据。运行器自行创建、回收的隔离临时资源继续按 QA 运行规则处理。开发不覆盖正式 `reports` 中其他运行记录，不借提测入口修改标准、演示库、他人进程或用户数据。

## 子集

2026-10-01 联调及复测已经结束，当前结论见[正式报告](../reports/acceptance/20261001-business/report.md)。后续登记的浏览器适配、最终联调、UTF-16修复和QA前提纠正子集也都只引用正式用例，完整列表以[`suites.json`](suites.json)为准；下表保留常用开发入口。

[`suites.json`](suites.json) 只保存用例 ID、明确项目和子集边界，不保存步骤、预期或断言副本。唯一用例定义仍在 `cases/*.json`，唯一自动化入口仍是各定义的 `automation`。

| 子集                          | 内容                                                                                                                                                                | 明确边界                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `developer-smoke`             | 6 条已有 API/系统用例：健康与登录、缺失/错误身份、viewer 只读、注销、基本消息、合法序列变量流程                                                                     | 不含十五分钟 token 到期、长预算计时、杀进程/恢复、OPS、blocked 和浏览器；仍会创建隔离测试资源并调用候选产品                    |
| `architecture-regression`     | 25 条可执行设计：序列 API/UI 契约、读取恢复、公开并发及审计期间资格变化；项目为 system、chromium                                                                    | 不把公开 CAP-REG 当作容量拒绝证据，不选择 CAP-001..010；可执行设计不保证前提齐备，运行时仍可能 BLOCKED                         |
| `sequence-failure-regression` | 5 条正式用例：BLK-SPEC-002、SEQ-006/007/008/010；项目仅 system。同步失败终止、中间失败后重启、unknown期间等待及恢复确认失败，连同跳过、限流、群不可写和终态跳过例外 | 属于 QA-D6 新口径的定向回归，包含故障注入及杀进程/恢复；不加入短冒烟，不代表全部序列或全部重启窗口已验收。仍需独立产品执行授权 |

新增用例不会因 ID 前缀相同而自动进入子集；QA 显式维护 ID 清单，审查子集变化。未选中的用例仍留在完整 catalog 与报告中，状态继续 `NOT_RUN`，不能从覆盖分母中无声消失。

后续 `evidence-followup-20261001` 仅选七项工程补证，登记不表示已接入或执行；[交接与边界](../requirements/evidence-followup/README.md)列出具体依赖。三项真人体验使用[独立指引](manual-execution-20261001.md)，不计入七项预跑，也不把该预跑作为人工正式结果录入目标。

## 静态核对

在 `qa-acceptance` 目录执行以下命令只读取 QA 数据并执行 Playwright `--list` 登记，不启动产品或 fixture：

```sh
./node_modules/.bin/tsx harness/suites-check.ts
./node_modules/.bin/tsx harness/suites-check.ts developer-smoke
./node_modules/.bin/tsx harness/suites-check.ts architecture-regression
./node_modules/.bin/tsx harness/suites-check.ts sequence-failure-regression
```

输出包含准确 ID、自动化文件、选择项目、grep 及风险边界。未知、重复、非自动化或项目不匹配的 ID 直接报错，不会默默过滤。登记缺失、登记重复、文件不匹配或 grep 意外选中其他用例同样失败。

## 执行入口与运行器约定

实际命令是 `npm run preflight -- --suite <suite-id> --target config/target.local.json --authorization config/preflight-authorization.local.json`，具体环境和授权步骤见根 README。没有授权时只运行 `npm run check:suites` 和 `npm run hash:suite -- --suite <suite-id>`。

`sequence-failure-regression` 引用 [QA-D6 裁定](../requirements/sequence-failure-policy.md) 及正式用例，不复制另一份失败策略。预跑授权须绑定该子集 ID 和当前摘要；批准该业务口径、完成脚本登记或 QA 工具自检，均不表示开发或 QA 已执行过产品测试。

查询不可用时必须保持 `unknown`，此时不结束运行，也不继续后续步骤；恢复确认失败后才套用失败终止策略。A2 的一次重发是可选分支，子集不要求产品为满足测试而强制重发。

`resolveSuite(qaRoot, name)` 只解析标准并返回 `{ id, title, purpose, caseIds, projects, grep, cases, riskBoundaries }`。调用方必须将 `grep` 作为**单独参数值**传给 Playwright，并同时传入返回的全部 `projects`；不拼 shell 字符串，不丢弃项目限制，不增加任意额外 grep。

子集解析不构成产品执行授权，也不放松独立 SUT 工作树、版本、数据库/端口所有权、浏览器与故障注入的安全边界。实际提测通过根 [README](../README.md) 中独立开发预跑入口，由其校验预跑授权、固定目标和版本并生成隔离报告；不得绕过执行门禁直接调用 Playwright。

开发预跑的通过、失败和阻塞只属于该候选、该 QA 版本及该子集，输出路径是 `reports/preflight/`。正式 QA 验收必须独立授权、执行和出具报告；不能复制预跑事件填充正式验收、把未执行项改为通过，或把子集通过当作发布就绪。
