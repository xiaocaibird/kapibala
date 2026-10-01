# 后端已保存证据事后复核

来源：`reports/preflight/2026-10-01T12-23-10.195Z-e84c34eb`；SUT `e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb`；QA `105ed289e0fbed6306025cd3dc1889730b17a423`。本记录只读取既存 JSON，并使用与冻结 QA 提交相同字节的 helper 做内存验证；没有执行产品、数据库或浏览器，也没有重新验证存活进程归属。原始文件在分析前后摘要一致。

**原测试状态不变：AGENT-025 FAIL、AGENT-028 FAIL、BLK-EXT-001 BLOCKED。以下后续校验是事后分析，不是原测试已经执行的断言，不追加或回填 PASS。**

| 项目 | 已保存证据的事后结论 | 原执行中断边界 |
| --- | --- | --- |
| AGENT-025 | 完整活动区间 [60011,60023]ms；创建事务至实际终止决定 [60011.182125,60016.268708]ms；INSERT至决定 [60013.011041,60013.82325]ms；决定到COMMIT [6.497208000000683,6.523375000004307]ms。同域同run、决定和COMMIT同attempt，仍明确超60000ms。 | 在原activity下界断言失败；后续lifecycle断言未执行。 |
| AGENT-028 第一次 | 等待 [5000.021624999999,5000.157999999999]ms；attempt `37bdafb7-0c4e-443f-b822-afac0aca2125`；返回和history同run/step/tool/attempt及结果。事后history检查通过，时限检查仍失败。 | 第一次真实等待下界超过5000ms而失败；history断言未执行。 |
| AGENT-028 第二次 | 同clientMsgId `c5b2e387-9278-40b3-ade3-b5428811d28c`；keyReused=true，使用独立attempt `0ff5d8f3-62be-4742-bc68-8f581701ed84`；等待 [0.9491250000000946,0.9789160000000265]ms，返回sent；事后时限及同attempt history检查满足。 | 第二次工具计时/history断言未执行；此前公开同key返回sent、一次审计/发送/落地断言已执行。 |
| BLK-EXT-001 落地分支 | 公开REST见sent；独立Gateway唯一落地 `gateway-message-1`，同时记录message_sent及echo。28次查询的headers/body均404，正向查询提交0条。 | 不能归因正向query；这些文件不能唯一证明SUT采用了哪一条入站事件。静默分支BLOCKED不变。 |

详见 [analysis.json](analysis.json) 的区间、身份、每项内存校验结果及全部输入/helper摘要。脚本 [analyze.ts](analyze.ts) 与 [摘要](analysis-script.sha256) 可复核。复跑只能传入新的输出目录，例如从 qa-acceptance 执行 `node_modules/.bin/tsx reports/followup/20261001-e85ae61-retest/backend-postmortem/analyze.ts <new-output-directory>`；输出使用exclusive-create，不覆盖既有分析或raw。
