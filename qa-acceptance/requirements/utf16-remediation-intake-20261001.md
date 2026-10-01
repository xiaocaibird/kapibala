# 资料长度修复独立接收

2026-10-01，固定86ad4e7 → a6b14e73ec738b979b05510fdfac8c6fcbb09df7。来源文件、变更列表与哈希见 [review](../reports/integration/20261001-utf16-candidate-intake/review.json)。本接收为只读影响评审，不是产品通过。

原需求profile仍为trim后名称80、简介500个UTF-16代码单元；没有批准改用code point/grapheme或提高上限。研发修复声明只收紧待写值，保持历史响应与expected原值可读取/条件修正。没有新增页面或业务范围。改动涉及server写校验、web写校验、contract注释及研发测试/文档；普通运行入口、数据库迁移、消息/Agent/容量执行、原文和QA标准未变。

独立复测登记 `utf16-remediation-retest-20261001`：BLK-SPEC-006完整边界段，以及EXT-001/002/008/009/010/012和UI-012/013/015/022。使用干净固定checkout、真实PostgreSQL、独立网关/Agent、生产构建Chromium；不复用作者数据库、不将156项研发回归作为QA通过。新fixture归档不在该子集范围，因此目标不携带旧版本fixture绑定。

86ad原全量和任何失败原样保留；本新候选只能给出该修改范围的补充复测结果，不能声称a6b已重新全量验收。容量60000ms、接收前崩溃排期、外部未知效果及人工证据边界仍按完整基线结果独立保留；本次修复不关闭这些问题。
