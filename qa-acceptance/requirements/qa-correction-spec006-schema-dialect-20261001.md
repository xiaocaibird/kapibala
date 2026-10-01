# QA 校正：SPEC006内联工具schema方言

首轮Agent桩修正了合法JSON Schema 2020-12被默认draft-07校验器误拒的问题，但遗漏了 `tests/system/spec-boundaries.spec.ts` 中两处直接 `new Ajv().compile(schema)`。这是QA横向排查不完整，不是产品新增需求。

真实独立复测 `2026-10-01T07-28-49.319Z-ac58f612` 固定候选a6b14e73ec738b979b05510fdfac8c6fcbb09df7、QA源码摘要6fa8116946d650d72e6d9f89af0cb3e1cf905f3e2a06dcd84308d0f933629df7。7例首次结果6 PASS/1 FAIL：资料UTF-16全部子步骤已执行并留存spec006-profile-policy.json；limit100000真实执行及50条内容断言完成后，schema编译器报 `no schema with key or ref https://json-schema.org/draft/2020-12/schema`。0/-1/1.5、文本和字节上限后半段未执行，不把资料修复单段通过写成整条通过。

最小修订将本用例两处校验改用独立 `contracts/declared-json-schema.ts`。现有Agent桩方言选择封装在私有状态中，因此复用其已验证的“只从内置draft-07/2019-09/2020-12校验器匹配声明”规则；不改桩、不导入产品schema、不删$schema、不下载远端meta，不放宽input_schema本身语义。未知方言明确BLOCKED，内置方言非法schema仍报错。原100000截50、0/-1/1.5自身契约、500字、8KB/2KB及摘要200字断言全部保留。

三个工具自测验证各声明方言、非法类型/额外字段/缺字段、2020-12 prefixItems真实语义、坏schema及未知远端方言，3/3通过；TypeScript通过。它们不启动产品。

旧run的manifest、events、源码tar、原始失败及未执行范围保留。另冻结修订QA摘要后独立执行同一API子集，记录新run，禁止覆盖旧结果或声称a6b全业务已通过。正在运行的完整业务QA及SUT不改；UI子集等待主协调明确释放浏览器时段。
