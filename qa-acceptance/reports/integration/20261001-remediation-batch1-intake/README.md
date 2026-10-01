# 第一批修复的只读接收证据

候选 `ffdc8b018be6c20cba2a9d34afda5225187df7cd`，比较基线 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。

- [QA接收与技术影响结论](../../../requirements/remediation-batch1-intake-20261001.md)
- [机器核验、Git对象、6份主索引日志校验及29份来源摘要](review.json)
- [完整文件差异](candidate-diff-name-status.txt)
- [业务源码差异](product-source-diff.patch)
- [最终候选相对完整回归代码差异](final-delta.patch)

`evidence/` 保留研发交付文档、原始索引和相关日志的原样副本，每份的来源提交、字节及SHA256见 `review.json`。源证据版本 `16a60ef` 相对候选只增加/补全交接及日志。438全套属于6d5f，最终候选ffdc只重跑消息专项5项及原文校验；不得混合标注版本或将开发检查转录为QA PASS。

本目录由独立AI QA只读核验产生，未启动SUT、Docker、数据库、控制器或浏览器，未修改冻结执行树，没有创建执行授权。CAP003、receipt保存前及全局写入者限制、四条runtime接入依赖仍保留。
