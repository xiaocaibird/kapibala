# 验收用例数据

各JSON文件均为用例数组。公共字段：`id`、`title`、`requirements`、`priority`（P0/P1/P2）、`mode`（automated/manual/blocked/candidate）、`preconditions`、`data`、`steps`、`expected`、`timing`、`faults`、`evidence`、`cleanup`；自动化用例增加`automation`执行入口，阻塞用例增加`blocker`具体原因。

所有用例映射 `../requirements/catalog.json` 的稳定需求ID。用例文件只写设计，不写PASS/FAIL/NOT_RUN；本轮根报告统一初始化NOT_RUN，实际执行后才改变状态。`mode=blocked`是设计时已知前提阻塞，初始报告仍不得误报已执行。

`manual.json` 包含少量真实人工质量判断和待澄清协议边界；`candidates.json` 是未纳入本轮硬性功能范围的C1/C2。可自动化场景即使适配未完成，也应保留自动化目标及具体阻塞原因，不能以人工兜底宣称完整。

优先级按影响而非实现难度：P0为数据/副作用失真、权限越界或核心保证失效；P1为主要业务不可用及明确时序/恢复/交互要求；P2为局部表现和主观可用性。优先级不修改原要求的强制性。

执行前先核对基线与隔离清单。测试数据应有本轮唯一标识；只能清理本轮自建资源。原始预置身份用于测试协议，不用于真实生产凭据。断言来自需求、外部协议和独立网关账本，不读取产品私有函数或数据库表布局来生成期望。
