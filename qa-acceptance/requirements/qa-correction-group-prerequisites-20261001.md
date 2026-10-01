# GROUP-007/009/010 首轮失败的 QA 前提复核

原始运行：冻结QA `reports/runs/2026-10-01T06-10-21.458Z-1fdb6180`，产品 `0af644334b00eb13e2e56df33c70f22358a6a0f7`。原始FAIL和证据保留，本文不回填PASS。以下修正仅在QA开发树；产品、冻结执行树和初始报告均未修改。

## GROUP-007：failed不等于已处理完所有账号

原文§2.3第162行明确 `errors` 非空即 `failed`；B2第301行同时要求其余非群主继续退出、群主不退、失败账号两侧保留。两者必须同时验收，不能一看到failed就立即断言所有后续调用已经发生。

首轮 `api-groups--GROUP-007-fail-60c20-ontinues-remaining-accounts-system/evidence/api.ndjson` 第72行在06:26:27.784Z取得failed、`leave:account-2`错误，且`processing:true`。外部账本第275–281行只有06:26:27.746Z的一次500；06:26:27.848Z用例已经清理。该轨迹没有证明其余账号最终未退，旧断言过早，不能据此提交产品遗漏退群缺陷。

修正：共享`waitJob`尊重可选的公开`processing:true`，但不把processing扩成必填业务字段。25秒只是有限取证预算，耗尽无完成证据为BLOCKED；HTTP错误、非法job状态及errors非空却非failed仍立即失败，不重试掩盖。GROUP-007另外逐样本取job、本地成员及网关事实：立即守住群主不退/失败成员保留，待全部非群主真实请求及成员一致后核对原断言。若公开明确`processing:false`且遗漏非群主，是可证明违约，仍FAIL。无此字段的实现仍可由原API及外部事实完成验收。

影响范围：原共享调用为GROUP-002/003/005/006/007/008/009/010、EXT-007的退群前置、API-001公开job契约，以及`createGroup`的所有消费者。正常finished仍返回，失败且显式处理中不再提前收尾；没有把全部这些历史结果自动归咎QA，须按实际证据和需要重测。

## GROUP-009：建立已宣布成员，不伪造可promote条件

原文§2.1第50–51行区分当前成员与member_joined宣布，B2第300行规定ALREADY_MEMBER直接promote。旧准备调用`setMembership(...,{storeOnly:true})`只改成员并存事件，从未真正发布；网关因此不满足promote的历史宣布前提。原账本显示06:26:32.878Z join409，之后两次promote409；API第54行以NOT_MEMBER_YET/promote失败。产品确实尝试了promote，不是等待新事件不前进。

修正：临时隔离SSE传输并断开已有流，再真实发布member_joined、保留其历史，建立已宣布既有成员；SUT不接收这条事件。随后ALREADY_MEMBER不得产生新joined、promote应成功，公开角色应admin。finally恢复SSE并释放本例屏障。不更改网关promote规则、不偷偷新增桩保证。工具自测同时复现旧前提的409和真实发布后的200。

## GROUP-010：关联Agent桩共因，退群尚未执行

原账本`api-groups--GROUP-010-leav-d0f9c--keeps-left-groups-inactive-system/evidence/external-facts.json`第555/675/804行三次返回TOOLS_INVALID。请求包含合法draft2020-12 schema，旧Agent桩仅默认Ajv draft07，在消费turn计划前拒绝；`left-current-turn`屏障因此未命中。公开请求止于开启agent，尚无leave-all，也无网关leave。该轨迹不能证明D042退群后的外部成员/自动化行为失败；关联Agent桩版本兼容纠错，不重复修改该脚本。

## 最小重测

固定纠错后的新QA版本，先通过定向工具自测，再单独重跑GROUP-007、009；Agent桩兼容修正后重跑GROUP-010。全部保留初轮FAIL、QA根因、纠错diff、新QA版本和新运行ID。未经新执行不能宣称三项通过；缺少真实完成或屏障条件仍BLOCKED。本文及自测不执行产品。
