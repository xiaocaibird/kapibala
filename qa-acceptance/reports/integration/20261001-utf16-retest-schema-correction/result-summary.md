# UTF-16资料修复独立定向复测

候选 `a6b14e73ec738b979b05510fdfac8c6fcbb09df7` 的选定 API 7 条和 Chromium 4 条均通过。本次使用子集执行入口，结论只针对列出的 11 条补充复测；不代替该候选的完整业务验收，不覆盖上线评估。

| 阶段 | 原始run | PASS | FAIL | BLOCKED | NOT_RUN |
| --- | --- | ---: | ---: | ---: | ---: |
| 首次API（保留QA错误） | [2026-10-01T07-28-49.319Z-ac58f612](/Users/zcm/.codex/worktrees/qa-focused-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-28-49.319Z-ac58f612/acceptance.md) | 6 | 1 | 0 | 0 |
| 纠正QA后的API | [2026-10-01T07-32-37.918Z-3b6efd96](/Users/zcm/.codex/worktrees/qa-focused-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-32-37.918Z-3b6efd96/acceptance.md) | 7 | 0 | 0 | 0 |
| Chromium关联页面 | [2026-10-01T07-33-32.289Z-8a84ff03](/Users/zcm/.codex/worktrees/qa-focused-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-33-32.289Z-8a84ff03/acceptance.md) | 4 | 0 | 0 | 0 |

首次 API 的 BLK-SPEC-006 失败由 QA 两处内联 Ajv 使用错误 schema 方言造成。群资料 UTF-16 边界已执行，但后半段当时没有完整执行。该原始 FAIL、源码归档、事件及报告都原样保留，收尾哈希复核未发生变化。QA 已复用独立多方言 schema 校验方式并以 3 条工具自测验证，没有导入产品 schema 或放宽断言。

纠正后的 API run 中 BLK-SPEC-006 完整执行：名称/简介 UTF-16边界、limit100000 的50条上限和排序、0/-1/1.5 schema校验、2KB原始响应、8KB工具结果及200字符摘要均已留证。Unicode工具兼容性记录仍只是观察，不额外推导严格Unicode语义。其余API为 EXT-001、002、008、009、010、012；页面为 UI-012、013、015、022。

两个完成的修正后run均退出0，每项首次attempt=0，runnerErrors与integrity均为空；两组分别有7和4条 cleanup，failures均为空。初次API的7条cleanup同样无失败。这里依据各自环境清理记录，不声称全宿主不存在别的任务资源。

QA authored源码SHA：`0ddf161e203b71969885cd5db684574b0376d6325a0b9f10ced7fb5f5606acc2`（199文件）；target SHA：`536f47fdab2f4271558ed30309628f730d212f0eeff04587cacc1d8b3cd15653`。执行后SUT仍是上述精确提交且工作树干净；生产Web构建文件哈希不变。完整冻结信息、逐项结果、证据哈希及清理清单见同目录 [result-summary.json](./result-summary.json)。

独立QA复测审阅认为，可以关闭 BLK-SPEC-006 中已明确的 UTF-16 资料长度产品缺陷。工具登记 phase 仍为 `developer-preflight` 的选定子集执行，此审阅不改写 phase，也不表示 a6b14e7 全量通过。两个QA源码归档已逐项对照冻结文件哈希验证，三个run的完整文件哈希清单均附于 JSON。
