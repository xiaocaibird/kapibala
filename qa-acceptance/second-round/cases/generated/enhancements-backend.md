# enhancements-backend

全部 NOT_RUN；自动化动作函数不代表实际工程 connector 已接入。

## SR-BE-DEL-001 首轮签发事实与第二轮差异逐项可追踪

**id**

```json
"SR-BE-DEL-001"
```

**title**

```json
"首轮签发事实与第二轮差异逐项可追踪"
```

**requirements**

```json
[
  "SR-P0-01-01",
  "SR-P0-01-02",
  "SR-AUTH-03"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "取得不可变第一轮签发/原始索引及第二轮最终diff；仅只读"
]
```

**data**

```json
[
  "原需求/批准修改ID；SUT/QA/hash；首次和复测结果；遗留列表"
]
```

**steps**

```json
[
  "逐条对照原需求与批准修改到实现来源/开发自测/独立原始结果",
  "区分真实修复通过、FAIL、证据不足、已决定限制及未执行",
  "检查新增候选影响映射与首轮索引均可定位且未覆写"
]
```

**faults**

```json
[
  "缺项/历史证据不可达作为材料缺口；禁止补写旧结果"
]
```

**expected**

```json
[
  "每条有真实版本证据及责任/去向",
  "开发自测不替代QA；第二轮新增不关闭旧缺陷",
  "签名/原始计数按原报告保留，缺证不能当通过",
  "QA目录由QA维护；研发材料不代填QA结果。"
]
```

**timing**

```json
[
  "按证据原执行时间记录；本次审阅时间另列，不伪造历史performedAt。"
]
```

**evidence**

```json
[
  "只读hash与原报告定位表；缺口逐项引用"
]
```

**cleanup**

```json
[
  "无需产品资源；仅保存新审阅表，不修改旧报告。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"review-ready-execution-not-authorized"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-FIRST-ROUND"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md"
]
```

## SR-BE-DEL-002 既有决定、真人与上线结论不相互替代

**id**

```json
"SR-BE-DEL-002"
```

**title**

```json
"既有决定、真人与上线结论不相互替代"
```

**requirements**

```json
[
  "SR-P0-01-02",
  "SR-P0-01-03",
  "SR-AUTH-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "首轮报告/决定/实际人工反馈可读"
]
```

**data**

```json
[
  "严格5秒、外部未知恢复、D039/D040/D041/D042、IME/跨窗口反馈"
]
```

**steps**

```json
[
  "将已决定实现边界与原文符合性分别列出",
  "核对未满足保证、责任及后续执行入口",
  "分开列真人/自动化/上线评估，检查第二轮报告模板不自动关闭这些项"
]
```

**faults**

```json
[
  "无额外故障；只读证据核验。"
]
```

**expected**

```json
[
  "明确偏差仍FAIL或按原证据状态；已决定不等于技术通过",
  "有限人工认可不扩大为全量人工PASS",
  "P0-01只作回归和交付证据，不增加产品功能分母"
]
```

**timing**

```json
[
  "仅文档审阅，不重新判定历史时钟样本。"
]
```

**evidence**

```json
[
  "条款—决定—原始状态三列表；真人原反馈引用"
]
```

**cleanup**

```json
[
  "保留原证据，只输出本轮审阅。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"review-ready-execution-not-authorized"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-FIRST-ROUND"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md"
]
```

## SR-BE-DEL-003 组合候选与授权准入不借历史结果放行

**id**

```json
"SR-BE-DEL-003"
```

**title**

```json
"组合候选与授权准入不借历史结果放行"
```

**requirements**

```json
[
  "SR-P0-02-01",
  "SR-P0-02-04",
  "SR-C2-08",
  "SR-AUTH-01",
  "SR-AUTH-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终交接和授权材料已取得；当前只准备本例"
]
```

**data**

```json
[
  "历史C1C2 2cf、首轮8e、新最终SUT、QA/config SHA"
]
```

**steps**

```json
[
  "核对新候选实际提交、diff、原文hash和依赖锁",
  "分列历史开发503、历史provider、当前离线与未来真实调用",
  "核对运行许可覆盖资源/候选/费用，缺任一不执行"
]
```

**faults**

```json
[
  "无额外故障；只读证据核验。"
]
```

**expected**

```json
[
  "历史结果仅引用、不计本轮执行",
  "只准备授权不能启动产品或付费provider",
  "业务验收与上线评估分开"
]
```

**timing**

```json
[
  "执行许可必须早于对应实际行为，不能事后补签。"
]
```

**evidence**

```json
[
  "准入核对表；版本/授权引用；NOT_RUN清单"
]
```

**cleanup**

```json
[
  "无产品启动；材料脱敏。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"review-ready-execution-not-authorized"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DELIVERY"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**conditionalDependencies**

```json
[
  {
    "id": "SR-DEP-REAL-PROVIDER",
    "when": "拟进行当前候选真实provider调用；不进行真实调用时不阻止准入材料审阅，但real-provider项目仍NOT_RUN。"
  }
]
```

## SR-BE-DEL-004 干净副本按最终README可隔离安装迁移启动

**id**

```json
"SR-BE-DEL-004"
```

**title**

```json
"干净副本按最终README可隔离安装迁移启动"
```

**requirements**

```json
[
  "SR-P0-02-03",
  "SR-C1-07",
  "SR-C1-08",
  "SR-C2-02",
  "SR-C2-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "已授权；新owned checkout、专用DB、私有媒体/session；不能复用开发node_modules"
]
```

**data**

```json
[
  "固定SUT锁文件；README runtime；动态端口；空DB；无任何用户key"
]
```

**steps**

```json
[
  "从固定源创建独立副本并按README安装",
  "显式配置模拟Agent及私有目录，运行迁移和启动",
  "核对health真实schema、账号/群公开入口和日志",
  "正常退出后核对精确容器/卷/进程/目录清理"
]
```

**faults**

```json
[
  "安装或迁移失败时保留真实日志，不绕过锁文件补包或沿用旧DB"
]
```

**expected**

```json
[
  "说明和实际命令一致；未接触真实provider",
  "health/入口真实可用，配置和schema来自最终候选",
  "资源创建与清理均按owner闭合，未归属资源不得清理"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "源码和lock hash；完整命令退出码；health/入口响应；owner manifest脱敏及cleanup"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DELIVERY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c1-media-files.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

## SR-BE-DEL-005 升级重启保留数据且不会删除其他运行目录

**id**

```json
"SR-BE-DEL-005"
```

**title**

```json
"升级重启保留数据且不会删除其他运行目录"
```

**requirements**

```json
[
  "SR-P0-02-03",
  "SR-C1-07",
  "SR-C1-08",
  "SR-C2-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终支持升级路径/迁移集合已冻结；专用旧schema副本；独立foreign标记目录"
]
```

**data**

```json
[
  "历史消息含无媒体；本次真实媒体和会话数据；另一owner的哨兵目录"
]
```

**steps**

```json
[
  "按支持升级流程迁移并重复启动",
  "保留DB/媒体/session重启，核对消息路径/字节/完成会话",
  "执行本次精确清理，复查foreign目录未变"
]
```

**faults**

```json
[
  "在官方允许恢复的迁移/启动边界中断；未有安全控制点则该变体BLOCKED"
]
```

**expected**

```json
[
  "历史消息仍可读；真实媒体不因重启丢失",
  "重复迁移不损坏数据；错误schema行为沿原要求",
  "cleanup不递归删共享配置目录或别人的注册/文件"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "升级前后schema与文件hash；进程退出/重启身份；foreign文件hash"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DELIVERY",
  "SR-DEP-MEDIA",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c1-media-files.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

## SR-BE-DEL-006 C3复用新候选完整登录到实际run步骤

**id**

```json
"SR-BE-DEL-006"
```

**title**

```json
"C3复用新候选完整登录到实际run步骤"
```

**requirements**

```json
[
  "SR-P0-02-02",
  "SR-P0-02-01"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "复用现有QA浏览器入口；已授权固定候选且模拟Agent可控"
]
```

**data**

```json
[
  "admin/viewer；独立群；受控真实工具步骤"
]
```

**steps**

```json
[
  "引用既有登录→打开群→进入run步骤用例编号和QA版本",
  "在当前组合候选实际执行并保存公开网络及页面步骤",
  "核对runId/工具/审计/错误信息与API一致，不复制另一套C3"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "存在Playwright框架或旧截图不算本轮结果",
  "当前源真实页面步骤呈现才可通过该流程",
  "viewer只读与实际run身份不串"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "旧入口定位+本轮项目/trace/截图/API和runId"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DELIVERY",
  "SR-DEP-UI",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "UI-008",
    "catalog": "../cases/ui.json",
    "automation": "../tests/ui/console.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-001 send_message 审计非pass绝不实际派发

**id**

```json
"SR-BE-GRD-001"
```

**title**

```json
"send_message 审计非pass绝不实际派发"
```

**requirements**

```json
[
  "SR-P0-05-01",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实在线有权执行者、群开关允许；Agent请求与网关独立账本"
]
```

**data**

```json
[
  "审计fail、verdict其他值、坏JSON、HTTP500、超时；text与合法短key"
]
```

**steps**

```json
[
  "先用合法pass正控证明工具可执行",
  "每个变体新run，记录真实工具提议及审计请求",
  "fail直接核对错误；无结论最多3次后核对blocked",
  "逐项对照实际远端请求、落地及步骤/错误码"
]
```

**faults**

```json
[
  "审计返回阶段控制失败/延迟，不能让原预算先终止却说覆盖3次审计"
]
```

**expected**

```json
[
  "非pass场景远端send/kick及落地为零",
  "明确fail为AUDIT_REJECTED；3次无明确结论为blocked/audit_blocked且通知操作员",
  "不足3次若原预算/取消先发生，按其独立语义记录，不能假称审计耗尽已覆盖"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "审计body/次数/时序；Gateway请求和效果；run/step与通知"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-014",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-015",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-033",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-002 kick_user 审计非pass绝不实际派发

**id**

```json
"SR-BE-GRD-002"
```

**title**

```json
"kick_user 审计非pass绝不实际派发"
```

**requirements**

```json
[
  "SR-P0-05-01",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实在线有权执行者、群开关允许；Agent请求与网关独立账本"
]
```

**data**

```json
[
  "审计fail、verdict其他值、坏JSON、HTTP500、超时；普通外部目标及合法reason"
]
```

**steps**

```json
[
  "先用合法pass正控证明工具可执行",
  "每个变体新run，记录真实工具提议及审计请求",
  "fail直接核对错误；无结论最多3次后核对blocked",
  "逐项对照实际远端请求、落地及步骤/错误码"
]
```

**faults**

```json
[
  "审计返回阶段控制失败/延迟，不能让原预算先终止却说覆盖3次审计"
]
```

**expected**

```json
[
  "非pass场景远端send/kick及落地为零",
  "明确fail为AUDIT_REJECTED；3次无明确结论为blocked/audit_blocked且通知操作员",
  "不足3次若原预算/取消先发生，按其独立语义记录，不能假称审计耗尽已覆盖"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "审计body/次数/时序；Gateway请求和效果；run/step与通知"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-015",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-017",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-018",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-003 同key在未确认和已确认状态复用原消息不重审重发

**id**

```json
"SR-BE-GRD-003"
```

**title**

```json
"同key在未确认和已确认状态复用原消息不重审重发"
```

**requirements**

```json
[
  "SR-P0-05-02",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "可控制504/确认与消息状态；独立run；首次工具真实审计pass"
]
```

**data**

```json
[
  "同run同key连续工具，不同tool_use.id；另run同key对照"
]
```

**steps**

```json
[
  "首调用取得真实clientMsgId及当前消息状态",
  "在queued/accepted/sent/failed/unknown实际可达到状态各独立变体请求同key",
  "核对返回身份/当前状态、审计和send增量",
  "另run同key正常独立执行"
]
```

**faults**

```json
[
  "用实际状态协议形成边界，queued若工具仍未返回则等待原等待规则再续轮；不能SQL造状态"
]
```

**expected**

```json
[
  "同run复用既有消息且第二次不再审计/发送",
  "原消息后来确认/失败反映当前状态，不返回伪成功",
  "不把未知结果强制重发；跨run不错误共用消息"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "run+key+toolUseId+clientMsgId链；审计和远端请求增量；实际状态"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-016",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-028",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-004 被拒调用不占send幂等key

**id**

```json
"SR-BE-GRD-004"
```

**title**

```json
"被拒调用不占send幂等key"
```

**requirements**

```json
[
  "SR-P0-05-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "合法提议；可让同run下一工具复用key且新toolUseId"
]
```

**data**

```json
[
  "先AUDIT_REJECTED后pass；适用POLICY_DENIED路径独立变体"
]
```

**steps**

```json
[
  "先记录拒绝及零副作用",
  "同run同key下一工具恢复准许并审计pass",
  "确认产生一条真实消息",
  "再同key调用验证复用且不再审计"
]
```

**faults**

```json
[
  "首次真实工具审计响应拒绝；在同run下一工具再提供合法pass，不伪造第一次已发送。"
]
```

**expected**

```json
[
  "首次拒绝不消耗key；后续许可可执行且再后复用",
  "实际拒绝与消息身份可对应，不能把第一次无效果叫发送失败"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "三次工具/审计/远端增量与消息身份"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-014",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-005 幂等竞争与崩溃恢复不重复已有副作用

**id**

```json
"SR-BE-GRD-005"
```

**title**

```json
"幂等竞争与崩溃恢复不重复已有副作用"
```

**requirements**

```json
[
  "SR-P0-05-02",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "独立多实例能力及真实持久边界可观察；新run"
]
```

**data**

```json
[
  "同key重复工具；真实send效果后确认/持久窗口"
]
```

**steps**

```json
[
  "记录首次审计、远端落地和消息身份",
  "在可证明的效果后窗口kill精确应用进程并保留Gateway/DB",
  "重启同run并观察续轮同key返回",
  "第二实例竞争变体单独执行与取证"
]
```

**faults**

```json
[
  "无法证明崩溃窗口或恢复停止则如实BLOCKED/原需求FAIL，不随机kill代替覆盖"
]
```

**expected**

```json
[
  "已有对外效果不重复、不被记成失败；同key不重审",
  "安全暂停与最终完成分开，未恢复不能整体PASS",
  "每个实例及窗口单独计，未执行双实例不得借单实例结论"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "实际效果/进程身份/恢复runId、key审计与请求计数"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-016",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-028",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-003",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-006 关闭Agent在当前step结束后原子取消

**id**

```json
"SR-BE-GRD-006"
```

**title**

```json
"关闭Agent在当前step结束后原子取消"
```

**requirements**

```json
[
  "SR-P0-05-04",
  "SR-P0-05-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "公开群资料/开关更新契约与CAS；可hold当前真实工具"
]
```

**data**

```json
[
  "运行中run、当前step/审计；并发资料变更"
]
```

**steps**

```json
[
  "记录群version/资料、activeRun和当前step",
  "在当前step真实等待时通过公开PATCH关闭Agent",
  "允许原当前step按原权限合法完成一次",
  "核对cancelled、引用清空、后续turn和副作用增量为零"
]
```

**faults**

```json
[
  "审计/容量/外部响应等待各独立变体；不要求释放容量前任意30秒内终态"
]
```

**expected**

```json
[
  "取消以当前step结束为边界，不强制中途伪失败",
  "同一更新资料与关闭结果一致，无额外下一轮",
  "当前合法副作用不误报迟发，终态后新派发为FAIL"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "PATCH/CAS响应；step完整时序；实际网关和模型请求"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-022",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "CAP-002",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity-control.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-GRD-007 资料与取消事务失败不留半提交

**id**

```json
"SR-BE-GRD-007"
```

**title**

```json
"资料与取消事务失败不留半提交"
```

**requirements**

```json
[
  "SR-P0-05-04",
  "SR-P0-05-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "公开更新可同时改资料和开关；真实事务故障控制及边界见证"
]
```

**data**

```json
[
  "原资料/version/agentEnabled/run当前step；修改值与关闭请求"
]
```

**steps**

```json
[
  "先证明请求正确且可正常成功",
  "新变体在已证明的共同事务中制造可回滚失败",
  "读取公开群资料/version和run取消状态并比对",
  "解除故障后新合法请求验证系统继续可用"
]
```

**faults**

```json
[
  "事务未提交前实际DB故障/明确rollback；缺挂点时不能拿任意断DB推定窗口"
]
```

**expected**

```json
[
  "失败事务不得只保留资料改动或取消一半",
  "独立当前step自然结束不等于错误取消，因果须区分",
  "恢复后原事务策略和事件顺序不被异步替代"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "事务控制证据/DB身份；公开前后值；请求与事件序列"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

## SR-BE-GRD-008 CAS失败和旧执行者竞争不导致错误取消或额外效果

**id**

```json
"SR-BE-GRD-008"
```

**title**

```json
"CAS失败和旧执行者竞争不导致错误取消或额外效果"
```

**requirements**

```json
[
  "SR-P0-05-04",
  "SR-P0-05-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "两独立客户端/应用实例可用；公开CAS版本；当前真实执行者"
]
```

**data**

```json
[
  "同版本两份冲突PATCH，一份关闭另一份资料；成员/权限变化"
]
```

**steps**

```json
[
  "屏障同时提交冲突更新，保存胜败请求",
  "验证只有成功请求后果且CAS失败不能另发取消",
  "在原旧执行者等待点改变权限/终态再恢复",
  "对照事件、activeRun和真实网关效果"
]
```

**faults**

```json
[
  "精确记录CAS结果与权限事件递送，不能据网络返回先后猜提交顺序"
]
```

**expected**

```json
[
  "保留原CAS/权限/取消规则；失败者无半后果",
  "失权旧执行者不得越权派发",
  "未命中竞争应BLOCKED而非误称覆盖"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "两请求身份/version；公开群/账号/run；独立副作用账本"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "CAP-REG-003",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity.spec.ts"
  },
  {
    "id": "CAP-REG-004",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity.spec.ts"
  },
  {
    "id": "CAP-006",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity-control.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-MUT-001 审计守卫错误副本确由业务断言检出

**id**

```json
"SR-BE-MUT-001"
```

**title**

```json
"审计守卫错误副本确由业务断言检出"
```

**requirements**

```json
[
  "SR-P0-05-03",
  "SR-P0-05-01"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "工程提供固定原版和独立临时错误副本的完整原件；当前可只读审阅"
]
```

**data**

```json
[
  "最小non-pass绕过patch；相同QA断言；真实DB/网关计数"
]
```

**steps**

```json
[
  "核对原版源及patch唯一差异",
  "核对原版业务PASS与错误副本对应FAIL",
  "逐条定位失败实际远端请求/数据库结果与断言",
  "检查没有改QA预期、编译环境异常和临时资源残留"
]
```

**faults**

```json
[
  "错误仅限工程临时副本，QA不向产品应用patch"
]
```

**expected**

```json
[
  "有效检出必须是明确业务违规；工具不启动/超时不算检出",
  "保留源patch命令原始日志及cleanup",
  "不能由一个mutation推断所有错误实现均可检出"
]
```

**timing**

```json
[
  "审阅原实验时间与候选关联；如需QA重跑须另获产品实验授权。"
]
```

**evidence**

```json
[
  "原版/错误源hash、patch、断言定位、请求和DB原件"
]
```

**cleanup**

```json
[
  "只读材料不改产品；核对工程临时副本清理证据。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

## SR-BE-MUT-002 同key守卫错误副本由重审或重复副作用断言检出

**id**

```json
"SR-BE-MUT-002"
```

**title**

```json
"同key守卫错误副本由重审或重复副作用断言检出"
```

**requirements**

```json
[
  "SR-P0-05-03",
  "SR-P0-05-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "独立原版/最小错误副本材料；真实同run同key场景"
]
```

**data**

```json
[
  "故意绕过复用守卫的patch；两次工具新toolUseId"
]
```

**steps**

```json
[
  "核对原版同key只一次审计/发送",
  "核对错误副本实际重复审计/发送/消息记录的至少一项明确违约",
  "确认业务断言是失败原因且QA源码未变",
  "检查副本源命令和清理"
]
```

**faults**

```json
[
  "无额外故障；只读证据核验。"
]
```

**expected**

```json
[
  "错误副本有效业务FAIL，编译错误/DB不可用/挂死不计",
  "原始数据能绑定同run/key而非不同正常操作",
  "实验只是指定规则敏感性证据"
]
```

**timing**

```json
[
  "原始实验和本轮审阅时间分列。"
]
```

**evidence**

```json
[
  "两个版本原件与hash；run/key/消息记录；实际审计send账本"
]
```

**cleanup**

```json
[
  "不执行错误补丁，仅核对临时资源精确清理。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

## SR-BE-MUT-003 单事务入口与有限静态门禁交付可复核

**id**

```json
"SR-BE-MUT-003"
```

**title**

```json
"单事务入口与有限静态门禁交付可复核"
```

**requirements**

```json
[
  "SR-P0-05-04",
  "SR-P0-05-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "工程提供最终source diff、检查规则/清单/命令与反例；QA业务预期仍来自需求"
]
```

**data**

```json
[
  "允许事务协作入口；重复直接写入的最小违规样例"
]
```

**steps**

```json
[
  "只为交付责任检查实际公开的工程源与diff，不导入实现作业务oracle",
  "确认关闭复用已说明协作入口且调用方事务未拆",
  "核对正常/允许协作检查通过、受控违规准确失败",
  "核对静态检查列入工程验证命令并说明覆盖盲区"
]
```

**faults**

```json
[
  "无额外故障；只读证据核验。"
]
```

**expected**

```json
[
  "收口指定入口不要求全模块重构",
  "规则可区分授权协作和重复写入；失败定位真实违规",
  "文本扫描不冒充完整SQL所有权证明，业务原子性由其他case验证"
]
```

**timing**

```json
[
  "静态交付审阅，无产品deadline。"
]
```

**evidence**

```json
[
  "最终diff/规则名单/检查命令退出码/违规patch和原件"
]
```

**cleanup**

```json
[
  "不变更工程源，只保存新审阅记录。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-GUARDS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

## SR-BE-DB-001 两档真实PG计划与API成本可复现

**id**

```json
"SR-BE-DB-001"
```

**title**

```json
"两档真实PG计划与API成本可复现"
```

**requirements**

```json
[
  "SR-P1-01-01",
  "SR-P1-01-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "专用PG与最终候选；独立数据生成/SQL映射得到工程说明并核对"
]
```

**data**

```json
[
  "1000和10000条；同毫秒/迟到/自身消息分布；索引/统计/PG版本"
]
```

**steps**

```json
[
  "为每档独立装载并确认实际行数和分布",
  "对实际执行SQL采集EXPLAIN ANALYZE BUFFERS及扫描/返回行",
  "实际调用首屏与续页API，记录体积/时延和可得内存",
  "保留原计划和参数，不拿解释器估算代执行"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "计划来自真实SQL与同库数据，API样本确已执行",
  "报告分清DB耗时、API时延、内存和未测页面速度",
  "不造p95/生产容量/延迟PASS阈值"
]
```

**timing**

```json
[
  "使用同域单调时钟记录实际API区间；1000/10000是输入，不是容量SLA。"
]
```

**evidence**

```json
[
  "生成命令/seed/数据摘要、PG及索引统计、完整计划、API原始样本"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DB-MEASUREMENT",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

## SR-BE-DB-002 一个局部优化或有依据的不优化结论

**id**

```json
"SR-BE-DB-002"
```

**title**

```json
"一个局部优化或有依据的不优化结论"
```

**requirements**

```json
[
  "SR-P1-01-03"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终前后候选和工程决策材料；可独立复现相同数据"
]
```

**data**

```json
[
  "同一两档数据；原版/局部索引或查询调整；回滚步骤"
]
```

**steps**

```json
[
  "先核对瓶颈基线是否存在",
  "有调整则限定实际一个局部点，前后同配置测量并验证可回滚",
  "无调整则核对证据与保持原实现的理由",
  "任何改快照/大回填/不稳定扩围明确记录"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "没有收益证据不强迫优化；不以有commit数算完成",
  "前后比较条件可比且保留不利样本",
  "没有新性能门槛，语义正确独立验收"
]
```

**timing**

```json
[
  "工程1小时参考不是产品性能或QA执行SLA。"
]
```

**evidence**

```json
[
  "diff、前后版本/计划/API、回滚记录或不优化决定"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DB-MEASUREMENT"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

## SR-BE-DB-003 首次固定分页集合与同毫秒顺序不重复不遗漏

**id**

```json
"SR-BE-DB-003"
```

**title**

```json
"首次固定分页集合与同毫秒顺序不重复不遗漏"
```

**requirements**

```json
[
  "SR-P1-01-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "独立公开消息来源和实际初页cursor；基线集合已完整记录"
]
```

**data**

```json
[
  "超过两页；同sentAt多ID；第一屏后到达新消息与补投旧时间消息"
]
```

**steps**

```json
[
  "记录首次实际分页集合和cursor",
  "在分页间发送新消息与历史补投",
  "沿同snapshot所有cursor遍历至末页",
  "按身份比较既有集合、顺序及去重，并单列实时新增合并"
]
```

**faults**

```json
[
  "取得首次实际cursor后，在两次续页间递送独立新消息与历史补投；保存真实递送下界和各snapshot来源。"
]
```

**expected**

```json
[
  "初次已有集合完整遍历无重复/遗漏",
  "后来补投通过实时/刷新合并，不强插旧snapshot要求",
  "排序tie规则按已批准公开契约，不从当前实现猜"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "首次响应/每cursor来源、预置消息ID、实时事件和完整输出集合"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DB-MEASUREMENT",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "MSG-012",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/messages.spec.ts"
  },
  {
    "id": "MSG-011",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/messages.spec.ts"
  },
  {
    "id": "UI-005",
    "catalog": "../cases/ui.json",
    "automation": "../tests/ui/console.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-DB-004 出站确认改时间与补投不破坏旧游标

**id**

```json
"SR-BE-DB-004"
```

**title**

```json
"出站确认改时间与补投不破坏旧游标"
```

**requirements**

```json
[
  "SR-P1-01-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实queued自身消息、可hold实际confirmation；首屏/后续页均有数据"
]
```

**data**

```json
[
  "不同受理时刻和最终网关sentAt；重复confirmation/晚消息"
]
```

**steps**

```json
[
  "在确认前取得首次列表和同cursor基线",
  "释放实际确认让原消息改sentAt，再取同旧snapshot后续页",
  "对照实时合并刷新和完整新排序",
  "重放同消息事件核对只有一行"
]
```

**faults**

```json
[
  "必须真实保持未确认窗口；若确认先到导致不同snapshot比较则BLOCKED"
]
```

**expected**

```json
[
  "同一消息按身份只有一行",
  "旧cursor按其来源snapshot合法，不要求新旧cursor字符串不同",
  "实时/刷新新排序正确且无丢失，不能拿两个snapshot错误比较"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "网关实际确认递送边界、old/new请求来源、msgId和页面/API集合"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DB-MEASUREMENT",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "INT-STREAM-002",
    "catalog": "../cases/integration-streams.json",
    "automation": "../tests/system/integration-streams.spec.ts"
  },
  {
    "id": "MSG-017",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/messages.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

## SR-BE-DB-005 局部优化回滚和并发读取保持公开语义

**id**

```json
"SR-BE-DB-005"
```

**title**

```json
"局部优化回滚和并发读取保持公开语义"
```

**requirements**

```json
[
  "SR-P1-01-04",
  "SR-P1-01-03"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "可回滚调整确实存在；无调整本例明确不适用而不计产品PASS"
]
```

**data**

```json
[
  "多个独立cursor链、同DB两读取者、写入与补投"
]
```

**steps**

```json
[
  "在独立会话并发建立各自snapshot并交错读页",
  "继续写入确认/补投并核对各集合",
  "若正式升级契约承诺跨重启/回滚cursor有效则按该契约验证",
  "缺跨版本承诺不自造永久cursor要求"
]
```

**faults**

```json
[
  "读期间实际应用重启仅在既有恢复契约范围；保留外部状态"
]
```

**expected**

```json
[
  "同版本并发链不串集合",
  "已批准旧cursor有效语义在局部改变中保留",
  "跨版本额外范围须先有明确契约，不从opaque字符串推断"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "每链初值与cursor来源、并发请求和集合、实际版本/回滚记录"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DB-MEASUREMENT",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"delivery-evidence"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

## SR-BE-DIA-001 真实tick失败形成可信原因时间和关联

**id**

```json
"SR-BE-DIA-001"
```

**title**

```json
"真实tick失败形成可信原因时间和关联"
```

**requirements**

```json
[
  "SR-P1-03-01",
  "SR-P1-03-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终DTO/分类/真实tick控制已交；admin；独立模块任务"
]
```

**data**

```json
[
  "有可靠entity关联失败 + 只有module关联失败两变体",
  "reason白名单及modules[].tickId/lastFailure.*按aa41冻结交接；本轮关联仅{module,tickId}。"
]
```

**steps**

```json
[
  "先取正常诊断基线",
  "在真实tick产生可追踪失败并保存实际控制时段",
  "读取background诊断并绑定发生时间/稳定类别/next-step",
  "无实体变体检验未编造群或消息"
]
```

**faults**

```json
[
  "在已开始真实tick中通过owned故障控制制造失败；同时记录tickId和捕获区间，未到tick前失败不冒充已打中。"
]
```

**expected**

```json
[
  "真实失败以白名单reason及lastFailure记录；occurredAt为捕获失败时刻，不冒称最早故障时刻。",
  "tickId为对应实际轮次UUID、correlation严格module/tickId；不要求或伪造群/消息关联。",
  "nextStep为安全固定说明，原始异常/连接串/正文/Key不公开。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "原始故障控制脱敏证据、GET DTO、可靠实体或module来源"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DIAGNOSTICS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-DIA-002 真实恢复更新当前建议并保留一份最近失败

**id**

```json
"SR-BE-DIA-002"
```

**title**

```json
"真实恢复更新当前建议并保留一份最近失败"
```

**requirements**

```json
[
  "SR-P1-03-03",
  "SR-P1-03-01"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "可控制连续失败后真实tick恢复；历史上限已公开"
]
```

**data**

```json
[
  "失败A→成功tick→再次成功→失败B；保存每一阶段公开快照。"
]
```

**steps**

```json
[
  "触发实际失败A，读取lastFailure/reason/occurredAt/correlation与recoveredAt:null。",
  "解除故障并取得首个成功tick见证；读取recoveredAt及当前模块nextStep，失败当时nextStep仍保留。",
  "再次成功tick不能把首次recoveredAt改成新的成功时间。",
  "再触发不同失败B，核对最近失败按本轮一份进程内策略更新为B；先前A原件由QA归档，不要求服务保存无限历史。"
]
```

**faults**

```json
[
  "真实失败A后解除故障，观察实际成功tick；再次失败B独立标识，不能靠伪造诊断响应制造历史。"
]
```

**expected**

```json
[
  "当前建议恢复，不把成功tick解释为旧业务/未知远端效果已恢复。",
  "lastFailure保留当前进程最近一次失败，recoveredAt准确记录该失败后首个成功tick。",
  "只有一份历史符合公开有界契约；不强求未批准的持久历史API。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "故障/tick真实身份时序、各阶段DTO、QA原始A与B快照。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DIAGNOSTICS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-DIA-003 诊断admin/viewer权限和敏感信息隔离

**id**

```json
"SR-BE-DIA-003"
```

**title**

```json
"诊断admin/viewer权限和敏感信息隔离"
```

**requirements**

```json
[
  "SR-P1-03-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "admin/viewer独立会话；可制造含唯一秘密哨兵的安全故障"
]
```

**data**

```json
[
  "假凭据/连接串/消息正文哨兵，禁止真实用户秘密"
]
```

**steps**

```json
[
  "admin读取真实诊断",
  "viewer和未认证直接请求同API",
  "比对响应/日志归档中允许字段，逐个搜索秘密哨兵",
  "轮换/注销后按原认证规则再读"
]
```

**faults**

```json
[
  "让合成秘密哨兵进入实际安全受控错误路径；采集真实admin/viewer响应，不使用真实用户秘密。"
]
```

**expected**

```json
[
  "admin只见允许安全字段",
  "viewer/无认证沿原权限错误，不获得敏感诊断",
  "原始异常/连接串/正文/key不直接公开，报告也不留秘密"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "请求/响应/角色及requestId；字段扫描摘要不输出真实秘密"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DIAGNOSTICS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-DIA-004 未知外部效果只建议核对不盲重发

**id**

```json
"SR-BE-DIA-004"
```

**title**

```json
"未知外部效果只建议核对不盲重发"
```

**requirements**

```json
[
  "SR-P1-03-05",
  "SR-P1-03-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实外部请求已派发且结果无法确认；独立请求/效果账本"
]
```

**data**

```json
[
  "已落地但响应丢失与未落地但无权威否定两分支"
]
```

**steps**

```json
[
  "形成真实unknown并读取run及诊断",
  "逐条核对next-step文字/操作是否仅核查已有事实",
  "保持无确定新事实观察是否自动重复副作用",
  "后续若权威事实可用再分别观察收敛"
]
```

**faults**

```json
[
  "不能把私有桩effect:none当作SUT可用的404否定保证"
]
```

**expected**

```json
[
  "未知安全与最终恢复单列",
  "下一步不诱导盲重发，不伪称操作从未执行",
  "实际已落地效果不得重复，恢复未完成不能整体PASS"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "实际POST/确认查询、效果账本、unknown步骤和next-step原文"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DIAGNOSTICS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-DIA-005 并发失败与重启诊断不串来源或泄露

**id**

```json
"SR-BE-DIA-005"
```

**title**

```json
"并发失败与重启诊断不串来源或泄露"
```

**requirements**

```json
[
  "SR-P1-03-01",
  "SR-P1-03-03",
  "SR-P1-03-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "至少两个独立模块/群失败可控；已知最近失败仅进程内一份、重启不保留"
]
```

**data**

```json
[
  "相近时刻不同实体错误；新应用进程"
]
```

**steps**

```json
[
  "交错触发两个真实失败并读取诊断",
  "实际恢复其中一个，确认只更新对应当前状态",
  "在允许恢复边界重启再读取",
  "重启后新进程尚无失败时lastFailure应null；这不证明所有依赖健康。"
]
```

**faults**

```json
[
  "两个真实模块/实体任务的失败交错，恢复其中一个；保存各tick身份后重启本例owned进程，保留外部状态。"
]
```

**expected**

```json
[
  "关联、时间、next-step不被其他失败污染",
  "恢复一个不把另一个仍失败模块误报正常",
  "重启不泄露旧异常；内存最近失败不跨进程保留，未启动或无记录不能表述为依赖全面健康。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "模块/实体/请求身份、DTO时间线、重启PID和实际策略"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-DIAGNOSTICS",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-001 有权审计pass也不能kick当前托管目标

**id**

```json
"SR-BE-POL-001"
```

**title**

```json
"有权审计pass也不能kick当前托管目标"
```

**requirements**

```json
[
  "SR-P1-04-01",
  "SR-P1-04-05",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "群autoKickEnabled=true，有在线creator/admin执行者；目标托管身份公开确认"
]
```

**data**

```json
[
  "creator/admin/member目标分组，含离线但仍托管目标；模拟模型",
  "公开托管事实映射：accounts.platform_user_id匹配或本群非空members.account_id关联；非直接DB写造数。"
]
```

**steps**

```json
[
  "每目标独立run提出kick并返回audit pass",
  "核对拒绝的tool_result/步骤与既有错误码",
  "查询网关请求和成员实际状态",
  "最后外部目标正控证明环境确实具备kick能力"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "所有当前托管目标远端kick请求及效果为零",
  "保护取决目标身份，不因执行者权限/audit pass绕过",
  "拒绝码POLICY_DENIED来自aa41公开契约，主后端真实零派发是判据，不以模型提示词代替。",
  "已确认命中保护时使用既有POLICY_DENIED；不额外引入错误码。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "target platformId/成员事件，审计pass原件、工具结果、网关增量"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-002 审计等待时目标成为托管身份派发前重查

**id**

```json
"SR-BE-POL-002"
```

**title**

```json
"审计等待时目标成为托管身份派发前重查"
```

**requirements**

```json
[
  "SR-P1-04-01",
  "SR-P1-04-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实audit响应屏障；可通过公开账号/成员路径确认目标身份变化"
]
```

**data**

```json
[
  "原普通外部目标T；同一platformId变为本群已确认托管",
  "公开托管事实映射：accounts.platform_user_id匹配或本群非空members.account_id关联；非直接DB写造数。"
]
```

**steps**

```json
[
  "先记录T普通外部事实并提议kick",
  "hold audit，通过公开路径建立T托管事实且确认事件实际递送",
  "release合法pass",
  "核对同工具被保护和零远端kick"
]
```

**faults**

```json
[
  "如身份变化API不可实现该窗口则BLOCKED，不直接改DB成员表"
]
```

**expected**

```json
[
  "派发用最新目标事实；旧提议快照不放行",
  "变化必须在实际派发之前有证据，不用本机消息创建时刻代替递送",
  "已确认命中保护时使用既有POLICY_DENIED；不额外引入错误码。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "audit屏障、成员/账号确认事件、目标ID、release和kick账本"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-003 容量拒绝等待时目标身份变化仍零kick

**id**

```json
"SR-BE-POL-003"
```

**title**

```json
"容量拒绝等待时目标身份变化仍零kick"
```

**requirements**

```json
[
  "SR-P1-04-01",
  "SR-P1-04-02"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "容量controller真实拒绝见证；audit已pass；公开目标身份变更可用"
]
```

**data**

```json
[
  "普通外部T；已审计工具step；容量租约",
  "公开托管事实映射：accounts.platform_user_id匹配或本群非空members.account_id关联；非直接DB写造数。"
]
```

**steps**

```json
[
  "先证明同step已通过audit且真实capacity拒绝、无远端POST",
  "等待中用真实公开事件确认T当前托管",
  "release容量并观察原step",
  "对照审计/步骤/网关零kick和既有拒绝结果"
]
```

**faults**

```json
[
  "必须证明容量确实耗尽；仅没有请求不足作前提"
]
```

**expected**

```json
[
  "容量等待不让陈旧身份穿透",
  "不得重审/新turn伪造替代原工具结果",
  "若预算在release前合法结束，窗口未命中单列BLOCKED而非强迫继续",
  "已确认命中保护时使用既有POLICY_DENIED；不额外引入错误码。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。",
  "身份变化须在可证明的最后DB检查前被读取；最后检查与远端间无跨系统原子承诺，不把不可定位竞态直接当违规。"
]
```

**evidence**

```json
[
  "容量refusal/lease身份、成员递送、同step审计及外部账本"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-004 普通外部目标原审计开关权限预算保持

**id**

```json
"SR-BE-POL-004"
```

**title**

```json
"普通外部目标原审计开关权限预算保持"
```

**requirements**

```json
[
  "SR-P1-04-03",
  "SR-P1-04-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "同群真实外部成员；完整原kick权限路径；安全owned故障"
]
```

**data**

```json
[
  "开关关、audit fail、无权执行者、全部满足、未派发预算不足"
]
```

**steps**

```json
[
  "按独立变体发相同目标kick",
  "核对拒绝分支原错误/零效果",
  "正控真实pass且有权时一个kick与成员移除",
  "未派发预算不足不发送，保持真实时间计量"
]
```

**faults**

```json
[
  "权限/开关在audit等待后改变，真实事件确认后再release"
]
```

**expected**

```json
[
  "新增政策不把所有kick禁掉",
  "外部目标依旧必须过原守卫；拒绝不得误称目标托管",
  "正控不重复效果，预算不截断/预扣伪造"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "真实目标分类、开关/权限、audit、活动见证与网关账本"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-017",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-018",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "AGENT-025",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "CAP-004",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity-control.spec.ts"
  },
  {
    "id": "CAP-006",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity-control.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-005 已派发外部kick的未知结果不被新政策误重放

**id**

```json
"SR-BE-POL-005"
```

**title**

```json
"已派发外部kick的未知结果不被新政策误重放"
```

**requirements**

```json
[
  "SR-P1-04-03",
  "SR-C2-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "普通外部目标；真实POST before-response与确认GET屏障；原预算见证"
]
```

**data**

```json
[
  "落地/未落地两分支，丢响应/超时、预算结束、重启或第二实例"
]
```

**steps**

```json
[
  "证明请求确实已派发并记录实际效果",
  "hold真实响应/确认在原窗口观察budget/unknown",
  "保留已结束run和历史，再单独按授权重启/竞争变体",
  "核对没有重放已有效果且安全/完成分别判定"
]
```

**faults**

```json
[
  "不得用新政策或未派发准入规则推断已派发请求必无效果；多实例未跑单列NOT_RUN"
]
```

**expected**

```json
[
  "原unknown/history与零重放保护不变",
  "明确活动下界超60000仍FAIL，不被取证不足覆盖",
  "结果未确认/不能完成不得假称强恢复通过"
]
```

**timing**

```json
[
  "沿原60秒实际活动预算，严格单侧区间判定；原请求timeout和已派发未知保护不豁免。"
]
```

**evidence**

```json
[
  "POST effect/GET精确身份与单调时钟、真实活动区间、终态/history/多实例日志"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "AGENT-029",
    "catalog": "../cases/backend.json",
    "automation": "../tests/system/agent.spec.ts"
  },
  {
    "id": "CAP-010",
    "catalog": "../cases/architecture-capacity.json",
    "automation": "../tests/system/capacity-control.spec.ts"
  },
  {
    "id": "INT-ACT-001",
    "catalog": "../cases/integration-runtime.json",
    "automation": "../tests/system/integration-runtime.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-006 leave-all仍可清托管成员且群主最后

**id**

```json
"SR-BE-POL-006"
```

**title**

```json
"leave-all仍可清托管成员且群主最后"
```

**requirements**

```json
[
  "SR-P1-04-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实本群多个托管账号和外部成员；admin调用独立leave-all"
]
```

**data**

```json
[
  "全部成功与非群主失败两变体"
]
```

**steps**

```json
[
  "调用公开leave-all并跟踪真实成员退出顺序",
  "成功后比较DB公开成员与网关服务账号集合",
  "失败变体记录errors并确认其他非群主继续、群主不退",
  "外部成员按D042保留"
]
```

**faults**

```json
[
  "失败分支在非群主真实leave请求被接收而尚未落地前返回原协议失败；其他成员和owner后续请求顺序全部记录。"
]
```

**expected**

```json
[
  "自动kick保护不阻断独立退群职责",
  "群主最后；失败成员仍两边保留且job failed",
  "不要求清除外部成员"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "job/events、真实leave请求顺序与最终两侧成员集合"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"existing-regression"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**regressionReferences**

```json
[
  {
    "id": "GROUP-006",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/groups.spec.ts"
  },
  {
    "id": "GROUP-007",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/groups.spec.ts"
  },
  {
    "id": "GROUP-010",
    "catalog": "../cases/backend.json",
    "automation": "../tests/api/groups.spec.ts"
  }
]
```

**regressionBoundary**

```json
"仅复用已核对的旧用例入口/相关子断言；新候选须实际执行。扩展变体未必已有自动化，不能由引用声称全变体已接入或传播旧PASS。"
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-POL-007 保护在重启恢复和C2提议下保持同目标事实

**id**

```json
"SR-BE-POL-007"
```

**title**

```json
"保护在重启恢复和C2提议下保持同目标事实"
```

**requirements**

```json
[
  "SR-P1-04-01",
  "SR-P1-04-02",
  "SR-P1-04-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "实际C2离线provider替身和主后端；已审计/未派发真实恢复边界"
]
```

**data**

```json
[
  "托管目标；C2合法kick；故障前同run/step；可独立验证未派发",
  "公开托管事实映射：accounts.platform_user_id匹配或本群非空members.account_id关联；非直接DB写造数。"
]
```

**steps**

```json
[
  "由C2按原协议提出真实工具并审计pass",
  "在未派发可证明边界重启主后端，保留外部/DB/session",
  "恢复后确认目标仍当前托管并观察原step处理",
  "核对C2提示文本不是唯一保护证据"
]
```

**faults**

```json
[
  "缺可证明安全窗口时保留该变体BLOCKED；不调用真实付费provider"
]
```

**expected**

```json
[
  "主后端保护仍生效且无kick",
  "结果符合既有错误协议；恢复不得另建run掩盖",
  "离线C2结果不能宣称当前真实模型PASS",
  "已确认命中保护时使用既有POLICY_DENIED；不额外引入错误码。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "C2公开turn/audit、恢复run/step、目标事实和零网关效果"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-MANAGED-POLICY",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-001 turn与audit真实调用记录和实际usage精确对应

**id**

```json
"SR-BE-USG-001"
```

**title**

```json
"turn与audit真实调用记录和实际usage精确对应"
```

**requirements**

```json
[
  "SR-P1-05-01",
  "SR-P1-05-02",
  "SR-P1-05-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终记录格式/ID时钟契约；独立provider替身经真实服务调用"
]
```

**data**

```json
[
  "turn成功、audit pass/fail、显式实际usage值及缺usage",
  "requestId/attemptId服务UUID；turn真实runId、audit null；stage validated-generation；elapsedMs仅provider调用到返回/抛错。"
]
```

**steps**

```json
[
  "分别调用服务并保存provider实际请求/响应",
  "读取允许的usage记录，绑定每次request/attempt、用途、model和真实耗时",
  "比对usage原始值和缺字段语义",
  "验证audit fail调用成功不等于工具被授权成功"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "只记录provider实际数据；缺失unknown，显式0与缺失可区分",
  "服务ID不冒充后端run/step；用途不串",
  "调用/解析结果和业务授权结果不混淆",
  "按完整白名单核对字段；audit verdict fail的合法响应可outcome success，但绝非工具许可。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "provider原件脱敏、服务记录字段/ID、时间域、调用与业务分层表"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-002 HTTP错误坏输出和超时各自记录失败不虚构零消耗

**id**

```json
"SR-BE-USG-002"
```

**title**

```json
"HTTP错误坏输出和超时各自记录失败不虚构零消耗"
```

**requirements**

```json
[
  "SR-P1-05-01",
  "SR-P1-05-02",
  "SR-P1-05-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实C2服务+可控provider；最终failure记录契约"
]
```

**data**

```json
[
  "HTTP500/坏JSON/无合法块/网络断开/实际超时；provider可能不报告usage，失败未知不能虚构零。"
]
```

**steps**

```json
[
  "逐变体建立新请求并保存真实失败因果",
  "核对失败状态、ID/用途/耗时",
  "缺失/非法provider token应为null，非成功HTTP不解析其body中的usage。成功HTTP已校验的真实usage即使后续输出失败也保留，失败仍failure；按5a53澄清及新增USG012/013逐阶段取证。",
  "继续正常调用确认错误未污染后续会话"
]
```

**faults**

```json
[
  "延迟真实响应至超时后，核对迟到输出不能改写已记录结果/推进轮次"
]
```

**expected**

```json
[
  "失败不能记成0token或工具业务成功",
  "未实际取得的字段null且不虚构零；已取得合法字段与失败状态分开，不能按产品输出倒选预期。",
  "迟到响应和重试身份不被合并为伪成功"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "provider连接/响应/超时、服务响应、usage记录和后续正常请求",
  "5a53澄清下provider响应/输出校验/实际记录的分层证据；旧冲突原件保留。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/product-enhancement-proposal.5a53cc8.md",
  "requirements/sources/second-round-qa-intake-20261002.5a53cc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json 与5a53文档澄清；最终driver/SUT/执行授权仍未到。"
```

**conditionalDependencies**

```json
[]
```

## SR-BE-USG-003 完成结果缓存复用不增加实际推理计数

**id**

```json
"SR-BE-USG-003"
```

**title**

```json
"完成结果缓存复用不增加实际推理计数"
```

**requirements**

```json
[
  "SR-P1-05-03",
  "SR-C2-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "公开可靠请求身份/完成复用契约；真实provider计数账本"
]
```

**data**

```json
[
  "同已完成请求重放；不同真实请求正控"
]
```

**steps**

```json
[
  "完成首次调用记录实际provider数与usage",
  "重放同已完成请求数次并核对返回相同完成结果",
  "核对provider数和推理记录未增加",
  "发新合法请求确认新推理真实计数"
]
```

**faults**

```json
[
  "并发重放只有在公开支持的同身份路径测试；不凭文本相同认同一请求"
]
```

**expected**

```json
[
  "缓存复用不多推进轮次/计新推理",
  "可记录cache读取但必须与实际调用区分",
  "新请求不被错误吞作缓存"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "真实provider请求ID/次数、完成结果hash、usage增量"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-004 并发turn/audit下记录不串身份且有界

**id**

```json
"SR-BE-USG-004"
```

**title**

```json
"并发turn/audit下记录不串身份且有界"
```

**requirements**

```json
[
  "SR-P1-05-01",
  "SR-P1-05-04"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终队列/文件上限、轮换和溢出策略已交；独立session/run"
]
```

**data**

```json
[
  "不同run并发turn/audit与不同实际usage；超过公布队列或文件界限",
  "等待队列上限64、活动批次最多64；明确可丢观察且不是完整账本。"
]
```

**steps**

```json
[
  "记录配置与基线大小",
  "受控并发发送且保存真实provider关联",
  "达到公布边界后核对文件/队列行为及允许丢弃/诊断策略",
  "读取各有效记录核对身份、用途和usage没有互串"
]
```

**faults**

```json
[
  "仅以最终公布界限造边界，不凭内部对象大小/猜最大条数"
]
```

**expected**

```json
[
  "真实已保留记录不混归属",
  "队列/活动批次各按64有界；队满可丢观察但应有USAGE_QUEUE_FULL，不能因此要求无限无损队列。",
  "丢弃或错误须符合最终诊断/可观测说明"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "配置、实际调用映射、文件大小/记录边界、诊断及资源趋势"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-005 写入失败或慢存储不阻塞调用且可诊断

**id**

```json
"SR-BE-USG-005"
```

**title**

```json
"写入失败或慢存储不阻塞调用且可诊断"
```

**requirements**

```json
[
  "SR-P1-05-04",
  "SR-P1-05-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "独立owned记录目录和可控写故障；固定配置；真实服务路径"
]
```

**data**

```json
[
  "permission denied/容量耗尽安全替身/可控慢写；成功和失败模型调用"
]
```

**steps**

```json
[
  "先验证正常记录路径",
  "制造真实写入失败或受控积压后继续合法turn/audit",
  "确认业务响应及会话推进仍正常，保存故障诊断",
  "解除故障观察已声明恢复/丢弃行为"
]
```

**faults**

```json
[
  "只对owned目录/存储挂载施加故障，不占满宿主磁盘；若无安全控制点则BLOCKED"
]
```

**expected**

```json
[
  "日志记录失败不代替模型业务失败或挂住主调用",
  "写失败有安全诊断，不泄漏secret",
  "未约定最大响应延迟不能因慢一个样本判违反SLA，但明确await死锁/被写失败拒绝可FAIL",
  "固定诊断USAGE_STORE_UNAVAILABLE/USAGE_WRITE_FAILED/USAGE_QUEUE_FULL/USAGE_RECORD_INVALID按实际故障对应；响应不等待落盘。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "实际服务响应、provider账本、受控IO故障和诊断、恢复状态"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-006 关闭记录与权限清理不触及秘密或其他目录

**id**

```json
"SR-BE-USG-006"
```

**title**

```json
"关闭记录与权限清理不触及秘密或其他目录"
```

**requirements**

```json
[
  "SR-P1-05-04",
  "SR-P1-05-06",
  "SR-C2-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终配置开关/目录权限/清理契约；另owner哨兵目录"
]
```

**data**

```json
[
  "关闭记录配置；新开启目录；foreign文件及假key哨兵",
  "usage/usage.jsonl；目录0700/文件0600；仅GEMINI_USAGE_ENABLED字符串false关闭，旧记录保留。"
]
```

**steps**

```json
[
  "关闭记录后实际调用并确认无新增推理记录文件",
  "开启后核对实际权限和允许读者",
  "运行公布轮换/保留清理并核对仅owned范围",
  "检查foreign目录和session历史未被误删",
  "准备确属本次且权限安全的usage-<UUID>.tmp与不同名称/其他owner哨兵，重启只允许清前者；绝不以本例为由删除不明资源。"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "可关闭且不阻业务",
  "权限/保留按最终契约，不猜mode或默认保留数",
  "清理不递归触及别人的目录/session/凭据",
  "关闭不删除旧记录；不把Key文件中的usage变量当进程env导入。",
  "清理只处理停服且确属本次的usage文件，绝不能删除整session目录或活跃owner.lock。",
  "启动清理仅匹配精确临时文件名及安全归属；普通单链接日志、本uid及0600/目录0700按公开契约核对。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "配置hash、文件stat/owner、清理前后精确路径hash、实际调用"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-007 允许字段留存不泄露prompt工具正文和key

**id**

```json
"SR-BE-USG-007"
```

**title**

```json
"允许字段留存不泄露prompt工具正文和key"
```

**requirements**

```json
[
  "SR-P1-05-06",
  "SR-P1-05-01"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "独立无真实秘密provider与最终allowlist"
]
```

**data**

```json
[
  "不同唯一哨兵放prompt/工具text/审计text/假key/异常字符串",
  "白名单requestId,attemptId,runId,observedAt,stage,purpose,model,elapsedMs,outcome,errorCode,inputTokens,outputTokens,totalTokens。"
]
```

**steps**

```json
[
  "经真实turn/audit分别输入哨兵并执行成功与失败路径",
  "读取所有本例usage文件及公开诊断，扫描禁止哨兵和未知字段",
  "核对所需model/用途/安全ID仍可关联",
  "保存只含hash/位置的检查证据避免再传播敏感正文"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "仅允许字段持久化，不把完整request/response错误日志塞入记录",
  "真实关联不足宁记服务ID，不伪造run关联",
  "禁止从record做计费承诺或推算token"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "allowlist契约、记录字段集合、禁词检查摘要、正向调用关联"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-008 正常关闭与硬崩溃后记录真实性和缓存边界

**id**

```json
"SR-BE-USG-008"
```

**title**

```json
"正常关闭与硬崩溃后记录真实性和缓存边界"
```

**requirements**

```json
[
  "SR-P1-05-04",
  "SR-P1-05-03",
  "SR-C2-05"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终关闭flush/持久策略与owner.lock处理契约；owned进程/session"
]
```

**data**

```json
[
  "已完成调用、写队列待落盘、未决provider各独立变体"
]
```

**steps**

```json
[
  "先正常关闭重启核对已承诺完成记录和缓存复用",
  "另变体在可证明写入窗口硬杀进程并保留目录",
  "核验owner归属后按公开恢复流程处理",
  "对照实际provider已发生调用与可恢复记录、缺尾段和pending"
]
```

**faults**

```json
[
  "无额外故障注入；按步骤执行真实公开操作并保存证据，当前准备阶段不运行。"
]
```

**expected**

```json
[
  "正常关闭/硬崩溃按公布策略取证，硬退出/队满/磁盘失败允许usage观察丢失；缺尾段如实披露，不假称完整账本。",
  "缓存不重复计新推理，未决远端不盲重试",
  "owner.lock人工处置不是全面自动恢复PASS，原强恢复差异独立记录"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "进程PID/start/退出、目录owner、实际调用与记录前后hash、pending结果"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-009 用量写失败诊断自身不造成递归或信息泄漏

**id**

```json
"SR-BE-USG-009"
```

**title**

```json
"用量写失败诊断自身不造成递归或信息泄漏"
```

**requirements**

```json
[
  "SR-P1-05-05",
  "SR-P1-05-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行，后续须授权且冻结候选/配置。",
  "C2公开进程日志诊断和owned usage写故障通道已接；不依赖或要求后台管理员diagnostics API。"
]
```

**data**

```json
[
  "实际写入失败，重复相同故障与其他固定诊断类型；安全恢复后再次调用。"
]
```

**steps**

```json
[
  "在owned usage目录产生实际写错误。",
  "采集C2公开进程日志中的固定诊断事件，同时继续真实离线turn/audit。",
  "同实例有限次重复同类失败，核对每类诊断只一次，服务响应不被日志递归阻塞。",
  "解除故障核对业务继续、记录恢复按公布策略；不把日志恢复推断为旧未知工具效果恢复。"
]
```

**faults**

```json
[
  "正常usage路径成立后，在owned目录制造真实写入错误；重复同类故障及解除过程按实际进程事件记录，不触及其他目录。"
]
```

**expected**

```json
[
  "固定诊断USAGE_STORE_UNAVAILABLE/USAGE_WRITE_FAILED/USAGE_QUEUE_FULL/USAGE_RECORD_INVALID按真实故障取证，每类同实例一次。",
  "诊断无路径、原始异常、正文/key或记录内容；不要求新查询API、页面或自动关联后端background模块。",
  "日志写失败与模型调用失败分开；日志诊断本身不形成递归写错误阻塞调用。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "C2实际进程PID/启动身份、原始stdout/stderr固定事件脱敏、owned IO故障、真实provider及API响应。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-010 正式入口与显式编程入口usage配置保持公开差异

**id**

```json
"SR-BE-USG-010"
```

**title**

```json
"正式入口与显式编程入口usage配置保持公开差异"
```

**requirements**

```json
[
  "SR-P1-05-04",
  "SR-C2-02",
  "SR-C2-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终配置开关/目录权限/清理契约；另owner哨兵目录"
]
```

**data**

```json
[
  "安全离线provider、独占session目录；main环境未设置/false/其他字符串；独立公开createGeminiAgent调用不传usage与usage:{}。",
  "假Key文件含不应导入的usage变量；不使用真实密钥。"
]
```

**steps**

```json
[
  "正式入口未设usage选项时发一条真实离线调用，确认默认记录。",
  "设置GEMINI_USAGE_ENABLED=false再调用，确认不新增且旧记录未删；其他字符串按仅false关闭的公开约定验证。",
  "通过工程公开编程入口的独立宿主分别不传usage与显式usage:{}；前者不建usage文件、后者记录。",
  "检查Key文件只供明确key读取，不导入usage开关或限额；实际适配缺公开宿主时该分支BLOCKED。"
]
```

**faults**

```json
[
  "配置入口差异为真实入口操作，不通过QA自己直接创建/删除usage文件伪造。"
]
```

**expected**

```json
[
  "正式main默认启用；createGeminiAgent不传usage不创建记录，usage:{}启用。",
  "仅字符串false禁用且保留旧记录；无意环境/本机key不能改变隔离默认或产生真实模型费用。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "入口命令/显式参数脱敏、进程配置来源、实际provider请求、文件创建与增量及旧文件hash。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/original-interview-question.md",
  "requirements/sources/c2-gemini-agent.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-011 记录数、UTF-8字节及年龄边界按启动与写入清理

**id**

```json
"SR-BE-USG-011"
```

**title**

```json
"记录数、UTF-8字节及年龄边界按启动与写入清理"
```

**requirements**

```json
[
  "SR-P1-05-04",
  "SR-P1-05-06"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终队列/文件上限、轮换和溢出策略已交；独立session/run"
]
```

**data**

```json
[
  "MAX_RECORDS默认1000及有效边界1/10000；MAX_BYTES默认2097152及4096/16777216；MAX_AGE_DAYS默认30及1/365。",
  "多字节model/允许安全ID上下文（仅协议允许字段）、独立生成已过/未过保留期记录的真实调用来源与可信时钟。"
]
```

**steps**

```json
[
  "分别以未设/有效上下界配置启动，保存实际配置与真实调用。",
  "逐条达到records和UTF-8 JSONL bytes边界，核对实际文件字节/完整行/保留策略；不按JS字符数代字节。",
  "对已形成可信年龄的记录在无写入空闲期取证，不要求定时删除；随后实际启动或写入触发清理并核对界限。",
  "对非整数/越界配置分别启动，采集USAGE_STORE_UNAVAILABLE并确认本次可选记录停用、模型调用继续；不要求未声明的进程退出码。"
]
```

**faults**

```json
[
  "年龄需真实时间或已批准独立时钟接口；不得只修改产品记录observedAt便声称实际保留期已覆盖。",
  "写入中断保持有效原始文件/临时文件证据，不手工替换文件制造正确轮换。"
]
```

**expected**

```json
[
  "真实配置范围及默认准确；按records、UTF-8字节和年龄有界。",
  "年龄只启动/写入时清理，无空闲定时任务不是失败。",
  "合法保留记录完整可解析、不混秘密；硬故障观察丢失按尽力记录边界披露。",
  "非法配置按公开契约停用可选记录且固定诊断，不强行要求整个服务退出。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "配置与实际文件size/UTF-8行字节、记录来源/年龄时钟和每次启动/写入事件。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json；公开契约已交，独立driver/最终候选/执行授权仍待接。"
```

## SR-BE-USG-012 成功HTTP真实用量与随后输出失败独立记录，非成功HTTP不取body用量

**id**

```json
"SR-BE-USG-012"
```

**title**

```json
"成功HTTP真实用量与随后输出失败独立记录，非成功HTTP不取body用量"
```

**requirements**

```json
[
  "SR-P1-05-01",
  "SR-P1-05-02",
  "SR-P1-05-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "真实C2服务+可控provider；最终failure记录契约"
]
```

**data**

```json
[
  "同形provider响应对照：HTTP200携带合法usage(11,7,18)但decision格式/块数/后续输出协议非法；HTTP500携带同样看似合法usage。",
  "独立变体：成功HTTP内容阻断但实际可校验usage；没有任何可解析usage的网络取消/超时。"
]
```

**steps**

```json
[
  "固定每变体真实provider请求/响应ID与服务request/attempt；通过真实独立C2服务调用。",
  "HTTP200变体保存已取得usage与后续输出校验失败证据；核对failure和安全errorCode，三个真实数字仍保留。",
  "HTTP500同body对照，确认failure且token均null，不能按body看似有数字就虚构已解析。",
  "取消/超时/阻断分别按实际阶段核对；不得把没有收到有效数据的取消归为已知usage。",
  "比较失败状态与主业务结果：不得因记录了token就当工具成功、审计通过或会话保存成功。"
]
```

**faults**

```json
[
  "真实provider HTTP响应阶段控制200非法输出与500同body；仅在请求已进入时才取消/超时，保存实际接收边界。"
]
```

**expected**

```json
[
  "成功HTTP已经校验有效的非负安全整数保留；后续输出/协议失败仍明确failure。",
  "非成功HTTP当前不解析body用量、异常文字不作数据源，未取得字段均null。",
  "未知不记0、不推算，记录usage不能洗成业务成功；各失败类型需独立子结果。"
]
```

**timing**

```json
[
  "只采用原服务/provider契约的实际deadline与本地单调时钟；此用量澄清不新增耗时容差。",
  "请求/响应与校验先后由真实日志和外部响应账本关联，缺阶段证据该分支BLOCKED。"
]
```

**evidence**

```json
[
  "实际provider HTTP状态/响应原件脱敏及hash、真实request/attempt与failure记录、各字段期望对照表。",
  "只归档允许字段与响应结构摘要，不把系统提示/正文/key存入usage或公开报告。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/product-enhancement-proposal.5a53cc8.md",
  "requirements/sources/second-round-qa-intake-20261002.5a53cc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json 与5a53文档澄清；最终driver/SUT/执行授权仍未到。"
```

**conditionalDependencies**

```json
[]
```

**clarificationSource**

```json
"requirements/contract-conflicts.json#CONFLICT-USAGE-001"
```

## SR-BE-USG-013 部分用量字段独立校验，零与未知不混淆且不补算总量

**id**

```json
"SR-BE-USG-013"
```

**title**

```json
"部分用量字段独立校验，零与未知不混淆且不补算总量"
```

**requirements**

```json
[
  "SR-P1-05-02",
  "SR-P1-05-07"
]
```

**source**

```json
"requirements/sources/product-enhancement-proposal.md"
```

**priority**

```json
"P1"
```

**preconditions**

```json
[
  "第二轮尚未执行；实际执行须另获授权并冻结SUT/QA/配置，本条准备不启动产品或真实provider。",
  "最终记录格式/ID时钟契约；独立provider替身经真实服务调用"
]
```

**data**

```json
[
  "每字段合法非负安全整数：0、正值、Number.MAX_SAFE_INTEGER。",
  "逐字段非法：缺失、null、负数、小数、字符串数字、布尔、超过安全整数；其他两个字段保持有效。",
  "input=3/output=4/total缺失；input缺失/output=4/total=7；实际provider明确total=99（不擅自按3+4改写）。"
]
```

**steps**

```json
[
  "以合法输出和成功HTTP逐变体调用真实C2离线服务，保存provider实际数值类型。",
  "逐字段比较记录，合法整数原值保留；非法或缺失仅该字段null，不能连带抹除其他合法字段。",
  "验证0仍为0，缺失total不能从input+output补7，缺input不能total-output补3。",
  "对仍为有效数字但与其他字段不相加的total保持来源原值，不以QA算术改写供应方声明。",
  "选择混合已知/未知变体附加输出校验失败，结果failure且字段判断规则保持；未命中该输出失败前提则该变体BLOCKED。"
]
```

**faults**

```json
[
  "无额外产品故障；以真实provider响应分别注入字段缺失/类型非法/输出协议非法，实际服务仍完整运行。"
]
```

**expected**

```json
[
  "字段knownness彼此独立；合法0与未知null明确区分，不接受字符串0或小数。",
  "只保留供应方实际合法值；不推算缺失、不纠正/杜撰总和或费用。",
  "合法输出按其自身结果；随后输出失败仍failure，不因有usage转成功。"
]
```

**timing**

```json
[
  "使用已批准业务时限；未约定响应上限时仅配置有限诊断观察，逾期无充分因果为BLOCKED而非自创SLA FAIL。",
  "真实屏障形成后才计场景，保存原始时钟域，不用随机等待推定内部窗口。"
]
```

**evidence**

```json
[
  "每变体provider输入JSON类型/原值与hash、真实调用身份、记录逐字段对照和独立输出结果。"
]
```

**cleanup**

```json
[
  "保存首次原始结果与副作用账本后，在租约/owner核对下释放本例屏障和停止本例进程。",
  "先终止本例仍可派发的owned执行者再放开挂起副作用；只删除本次manifest列出的DB/临时副本/文件，保留原始报告和共享媒体/session目录归属边界。"
]
```

**mode**

```json
"manual"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-USAGE",
  "SR-DEP-MODEL",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
null
```

**executionBoundary**

```json
"Second-round product execution, real-provider calls and main merge are not authorized."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.md",
  "requirements/sources/second-round-qa-intake-20261002.md",
  "requirements/sources/decisions.md",
  "requirements/sources/second-round-qa-intake-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-delivery-20261002.aa41fc8.md",
  "requirements/sources/final-enhancement-measurement-20261002.aa41fc8.md",
  "requirements/sources/product-enhancement-proposal.5a53cc8.md",
  "requirements/sources/second-round-qa-intake-20261002.5a53cc8.md"
]
```

**contractEvidence**

```json
"requirements/contract-mappings.json 与5a53文档澄清；最终driver/SUT/执行授权仍未到。"
```

**clarificationSource**

```json
"requirements/contract-conflicts.json#CONFLICT-USAGE-001"
```

## SR-BE-POL-008 派发前托管目标明确拒绝跨真实work截止仍正确保存并保持取消优先级

**id**

```json
"SR-BE-POL-008"
```

**title**

```json
"派发前托管目标明确拒绝跨真实work截止仍正确保存并保持取消优先级"
```

**requirements**

```json
[
  "SR-P1-04-01",
  "SR-P1-04-02",
  "SR-P1-04-05"
]
```

**source**

```json
"requirements/sources/second-round-managed-rejection-20261002.md"
```

**priority**

```json
"P0"
```

**preconditions**

```json
[
  "第二轮已获实际用户授权；仍须绑定最终main SUT、QA源和专属资源。",
  "真实PostgreSQL、独立Agent/Gateway协议桩及已审核runtime工程观察入口。",
  "独立工程故障子例，不替代POL-003的公开身份变化容量场景，不伪造active_ms或预置已完成步骤。"
]
```

**data**

```json
[
  "无取消和已请求取消两个新建真实run，各自工具id、数据库门锁、独立观察租约。",
  "初始目标为普通外部成员，合法kick提议及实际审计pass；在线有权执行者。"
]
```

**steps**

```json
[
  "经HTTP建群并形成真实Agent新run和审计等待，不预扣活动时钟。",
  "只对当前tool的awaiting_admission→dispatching UPDATE安装公开交接的真实PG门锁trigger；实际pg_stat_activity阻塞PID必须对应本例控制连接，真实步骤已提交executing/audit pass/awaiting_admission。",
  "在已命中等待后，按工程故障契约于独占库事务改变一个本例账号platform_user_id为目标；保存前后查询和实际COMMIT返回、公开账号投影。",
  "取消分支通过真实管理员PATCH关闭Agent并读到同run cancel_requested；无取消分支保持启用。",
  "等待真实kick-work-budget-signal-aborted，核对run/step/attempt/clock及完整前缀、hard信号尚未出现，再放开真实SQL锁。",
  "读取原run/step结果与history，核对POLICY_DENIED完整落库、recovery_note为空；真实保存事务COMMIT返回和终态COMMIT必须有观察；网关该关联kick请求和效果均为零。",
  "分别核对无取消failed/wall_clock、取消cancelled/cancelled及原活动上限；零HTTP不是单独的故障窗口判据。"
]
```

**faults**

```json
[
  "真实意图更新等待跨实际work截止；目标事实在初次检查后、最终检查前提交。",
  "只修改明确列出的本例身份故障数据；不得导入产品AgentTools、覆写产品时钟/方法/结果或生成预算通过事实。"
]
```

**expected**

```json
[
  "明确未派发的本地POLICY_DENIED不得误记远端结果未知、不能留下executing/recovery_note。",
  "步骤complete/is_error=true/error_code=POLICY_DENIED，原history仅一个对应tool_result，审计一次，实际kick请求与效果均零。",
  "已请求取消保留cancelled优先级；无取消按剩余预算无法开始下一完整模型轮的wall_clock结束。",
  "原60000ms上限保持，work/hard身份不混，缺实际窗口/完整clock/提交证据为BLOCKED；明确观察违约仍FAIL。"
]
```

**timing**

```json
[
  "每变体从公开新run起实际运行，不写active_ms。工程signal不是活动结束或终态提交；保留原同域实际活动及事务包络。",
  "收到真实work事件后才发出门锁ROLLBACK，以因果顺序核对释放晚于信号，不直接减跨进程单调时钟。"
]
```

**evidence**

```json
[
  "独立HTTP/Agent/Gateway原始账本、PG gate/backendpid/lock/step/identity前后、实际runtime完整事件、公共run、保存与终态事务COMMIT、逐变体清理。"
]
```

**cleanup**

```json
[
  "窗口未完成先停止本例执行者再释放PG门与audit，防止清理触发迟发。",
  "只删除本例trigger/schema并释放本例lease及连接，正常完成才复原本例身份；数据库最终由root按owner销毁。"
]
```

**mode**

```json
"automated-driver"
```

**state**

```json
"NOT_RUN"
```

**readiness**

```json
"driver-implemented-final-binding-pending"
```

**dependencies**

```json
[
  "SR-DEP-CANDIDATE",
  "SR-DEP-OWNED-FAULTS"
]
```

**automation**

```json
"tests/backend-flows.ts#runBackendCase"
```

**executionBoundary**

```json
"Human approved second-round execution; exact final main and QA/target freeze remain mandatory before product execution."
```

**coverageKind**

```json
"product-behavior"
```

**sources**

```json
[
  "requirements/sources/product-enhancement-proposal.5a53cc8.md",
  "requirements/sources/second-round-managed-rejection-20261002.md"
]
```

**engineeringSeam**

```json
"Explicit owned SQL fault recipe from developer 7a3ea584; acceptance oracles independently maintained by QA."
```
