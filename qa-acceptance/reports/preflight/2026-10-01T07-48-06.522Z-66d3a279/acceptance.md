# 开发预跑报告

子集：**qa-premise-retest-20261001**；预跑结论：**FAIL**。

这是开发预跑，不是正式 QA 验收。正式需求符合性及上线准备度均为 **INCOMPLETE**，不能据此宣称正式验收或无条件通过。

所选 16 条用例、2 个项目，共 16 个用例/项目组合。未选项保持 NOT_RUN；仅完成Chromium不等于完成该用例要求的所有浏览器。JSON保留全部attempt及被拒绝的越界结果。

## 预跑项目结果

|用例|项目|结果|说明|
|---|---|---|---|
|CAP-002|system|PASS||
|CAP-005|system|BLOCKED|BlockedError: [BLOCKED] 有限观察内未建立真实GROUP_WRITE_FORBIDDEN消息及群不可写前提；不能由群主终态推导|
|UI-011|chromium|PASS||
|UI-020|chromium|PASS||
|UI-021|chromium|PASS||
|UI-024|chromium|PASS||
|UI-025|chromium|PASS||
|UI-028|chromium|FAIL|Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveTitle[2m([22m[32mexpected[39m[2m)[22m failed  Expected: [32m"群详情 · Kapibala"[39m Received: [31m"[7m[有更新] [27m群详情 · Kapibala"[39m Timeout:  8000ms  Call log: [2m  - Expect "toHaveTitle" with timeout 8000ms[22m [2m    20 × locator resolved to <html lang="zh-CN">…</html>[22m [2m       - unexpected value "[有更新] 群详情 · Kapibala"[22m |
|UI-029|chromium|PASS||
|UI-030|chromium|FAIL|Error: [2mexpect([22m[31mreceived[39m[2m).[22mnot[2m.[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m  Expected: not [32m"群组工作台 · Kapibala"[39m|
|UI-031|chromium|PASS||
|UI-032|chromium|BLOCKED|BlockedError: [BLOCKED] 需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期|
|UI-033|chromium|PASS||
|UI-034|chromium|PASS||
|UI-035|chromium|PASS||
|ARC-UI-BLK-001|chromium|PASS||

- 只对86ad原版本纠正QA场景前提；不继承旧PASS，不覆盖完整业务或上线门禁。
- 实际独立数据库、公开协议、真实故障控制器与浏览器；每项目首次运行，原失败留存。
- 有头Chromium移除Playwright默认always-focused仿真，使用真实原生标签焦点；不证明OS跨应用或输入法人工义务。

以下是完整catalog的观测清单，不能转用为正式验收结果。

准备状态专项登记 38 条：脚本可进入后续授权试跑 18；仍缺工程/夹具接入 20；业务口径待决 0。这是准备状态，不是产品执行结果。自动化数量增加不能解释为这些依赖已解决。

- 范围内用例：261；通过 12，失败 2，阻塞 2，未执行 245。
- 方法登记（非就绪统计）：自动化 251，人工 10，尚缺完整执行方案 0，候选 5。
- 有用例覆盖、实际执行和通过率分别统计；跳过、缺少浏览器项目、缺少环境均不作通过。JSON另列required/release/candidate各范围计数及已执行通过率；多范围用例分别计数，不可直接相加。

## 版本、环境与授权

```json
{
  "runId": "2026-10-01T07-48-06.522Z-66d3a279",
  "phase": "developer-preflight",
  "suite": {
    "id": "qa-premise-retest-20261001",
    "title": "QA前提纠正后的原版本定向复测",
    "purpose": "独立复测当前步取消、真实群不可写、目录回放/分页、并发401和移除工具焦点仿真后的提醒场景；引用正式用例，不改原全量结果。",
    "caseIds": [
      "CAP-002",
      "CAP-005",
      "UI-011",
      "UI-020",
      "UI-021",
      "UI-024",
      "UI-025",
      "UI-028",
      "UI-029",
      "UI-030",
      "UI-031",
      "UI-032",
      "UI-033",
      "UI-034",
      "UI-035",
      "ARC-UI-BLK-001"
    ],
    "projects": [
      "system",
      "chromium"
    ],
    "riskBoundaries": [
      "只对86ad原版本纠正QA场景前提；不继承旧PASS，不覆盖完整业务或上线门禁。",
      "实际独立数据库、公开协议、真实故障控制器与浏览器；每项目首次运行，原失败留存。",
      "有头Chromium移除Playwright默认always-focused仿真，使用真实原生标签焦点；不证明OS跨应用或输入法人工义务。"
    ],
    "grep": "(?:^|\\s)\\[(?:CAP-002|CAP-005|UI-011|UI-020|UI-021|UI-024|UI-025|UI-028|UI-029|UI-030|UI-031|UI-032|UI-033|UI-034|UI-035|ARC-UI-BLK-001)\\](?=\\s|$)",
    "cases": [
      {
        "id": "CAP-002",
        "title": "容量拒绝后关闭 Agent，原当前步完成后取消且无后续工作",
        "automation": "tests/system/capacity-control.spec.ts",
        "projects": [
          "system"
        ]
      },
      {
        "id": "CAP-005",
        "title": "容量等待期间群变不可写阻止迟发踢人",
        "automation": "tests/system/capacity-control.spec.ts",
        "projects": [
          "system"
        ]
      },
      {
        "id": "UI-011",
        "title": "前端并发401单次续期",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-020",
        "title": "失焦提醒和呈现后确认",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-021",
        "title": "路由范围销毁",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-024",
        "title": "单页五秒轮询及并发失效合并",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-025",
        "title": "返回恢复内存条件分页位置及刷新清空",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-028",
        "title": "前台安静与失焦静态标题favicon",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-029",
        "title": "加载失败不冒称已确认",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-030",
        "title": "列表范围消失的两阶段确认",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-031",
        "title": "变化后回原值保留期间变化候选",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-032",
        "title": "提示确认与目录过期相互独立",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-033",
        "title": "本地手动clientMsgId及早回流归属",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-034",
        "title": "Agent自动消息失焦提醒",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "UI-035",
        "title": "序列自动消息失焦提醒",
        "automation": "tests/ui/console.spec.ts",
        "projects": [
          "chromium"
        ]
      },
      {
        "id": "ARC-UI-BLK-001",
        "title": "通用资源读取失败不能提交成功快照或提前确认未呈现提醒",
        "automation": "tests/ui/observation-boundaries.spec.ts",
        "projects": [
          "chromium"
        ]
      }
    ]
  },
  "suiteSha256": "96870977a6e880ccee12bb1c3f7f55cee6fda6520c0555b8f7e743e10c2bfc22",
  "playwrightArgs": [
    "test",
    "--grep",
    "(?:^|\\s)\\[(?:CAP-002|CAP-005|UI-011|UI-020|UI-021|UI-024|UI-025|UI-028|UI-029|UI-030|UI-031|UI-032|UI-033|UI-034|UI-035|ARC-UI-BLK-001)\\](?=\\s|$)",
    "--project=system",
    "--project=chromium"
  ],
  "startedAt": "2026-10-01T07:48:06.582Z",
  "baseline": {
    "schemaVersion": 1,
    "name": "多账号群组消息平台独立QA验收基线",
    "createdDate": "2026-10-01",
    "timeZone": "Asia/Shanghai",
    "baseRef": "main",
    "baseCommit": "9087630de475a91fc6244c39cd08c6bc4dadb278",
    "qaBranch": "agent/independent-qa-acceptance",
    "originalRequirement": {
      "path": "docs/original-interview-question.md",
      "sha256": "c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75",
      "immutable": true
    },
    "sourceSnapshots": [
      {
        "path": "docs/original-interview-question.md",
        "sha256": "c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/engineering-requirements.md",
        "sha256": "3a8ed32ba6d6086cd253d420dc058c21530afcdb3b7375c4c3272e610114e56d",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/change-requests.md",
        "sha256": "5c3bec0fbb00d0ea5145974227e7956185d44b921f4c1cc4fc874cedc13334f4",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/group-directory-profile-proposal.md",
        "sha256": "c38470a4d68e6a84ab9dc94c09a4952f55dad875146eb30540577b884e2164f1",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/group-profile-conflict-review.md",
        "sha256": "81c47b552a5f76292816de3409443e2334018a5846534aba1b655cb702ab7ba7",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/page-update-notification-implementation.md",
        "sha256": "5afe8d29b3c2a292046e79fcf8c3af844aa09a61d4b54aee4b7aa96fc3e98a19",
        "usage": "只采用需求、已批准范围和公开契约；不采用实现入口、旧测试、修复结论、运行证据或旧通过状态"
      },
      {
        "path": "docs/page-update-notification-proposal.md",
        "sha256": "2c31b688b67d31b2454a2ee4f3e1445f5bae50a93071eeb17cdc11f712d6f21b",
        "usage": "仅用户已选择原则及后续已批准范围对应语义；未采纳实现接入点、旧验证清单和未批准建议"
      },
      {
        "path": "docs/decisions.md",
        "sha256": "d9566e00c35705a9adcbb1b94aae1d5fd3447cc2975e7bee2ef8da7a17e4837e",
        "atCommit": "48adfd96f470532cc78c2d3c559414a09434eeff",
        "revision": "QA-REV-02",
        "usage": "仅采用D036/D037的实际批准范围、实施选择与合并边界；不采用开发验证通过或人工验收结论"
      },
      {
        "path": "docs/architecture-reviews/2026-10-01-baseline.md",
        "sha256": "476a579465dd8a1f01498e1c6fe5d3b3d6696d664b5370c3061e536cdd8e1b94",
        "atCommit": "48adfd96f470532cc78c2d3c559414a09434eeff",
        "revision": "QA-REV-02",
        "usage": "仅采用D036明确批准的AR-04/08/09/10质量行为及未授权范围边界；源码事实、建议和旧通过数均不作为独立QA期望"
      },
      {
        "path": "docs/architecture-quality-closeout.md",
        "sha256": "ae4ec49e7c54382640f2103b5d06f193cf285c087d2eed5228caf8a80faeb9f4",
        "atCommit": "48adfd96f470532cc78c2d3c559414a09434eeff",
        "revision": "QA-REV-02",
        "usage": "仅用于变更影响识别和版本化技术参数分类；实现机制及开发测试结果不作为独立QA裁判、不代替新验收"
      },
      {
        "path": "docs/decisions.md",
        "sha256": "e4189c2af1c3933346ac5d296d7ac6dd954f8c4785cc29cae9faef870c5cfa6f",
        "atCommit": "993f7588c1105894e0543554209a8c085423589f",
        "revision": "QA-REV-04",
        "usage": "只采用明确决策、版本化公开契约和交付配置；开发自测/实现不作为QA通过或原始预期来源"
      },
      {
        "path": "docs/qa-integration-handoff.md",
        "sha256": "e10a433edcb6a33387ca7c132a707224617983b07c38f6d83406368a6c81ac4f",
        "atCommit": "bdf27432ed35cabcf998a8dc0dd8110d63725a02",
        "revision": "QA-REV-04",
        "usage": "只采用明确决策、版本化公开契约和交付配置；开发自测/实现不作为QA通过或原始预期来源"
      },
      {
        "path": "docs/core-resource-observability.md",
        "sha256": "24b12c3eb3d88471eef0cb3b427457e7769f8e1086a97e4cb4f536466886d3d9",
        "atCommit": "993f7588c1105894e0543554209a8c085423589f",
        "revision": "QA-REV-04",
        "usage": "只采用明确决策、版本化公开契约和交付配置；开发自测/实现不作为QA通过或原始预期来源"
      }
    ],
    "authorityOrder": [
      "本次用户明确确认",
      "原始A/B要求与对其明确批准的补充",
      "已批准CR要求与公开契约",
      "仅作为待澄清项的技术建议"
    ],
    "confirmedDecisions": [
      {
        "id": "QA-D1",
        "source": "用户批准的《独立 QA 验收体系建设计划》（当前会话）",
        "decision": "本轮最终功能验收覆盖A/B及已批准追加需求；C1/C2只建候选；忽略面试/笔试/限时/选做语境。"
      },
      {
        "id": "QA-D2",
        "source": "用户批准的《独立 QA 验收体系建设计划》（当前会话）",
        "decision": "消息分页以首次分页时已有记录为固定遍历集合；新到及变更消息实时按身份合并、重新排序。该语义不套用群目录活数据分页。"
      },
      {
        "id": "QA-D3",
        "source": "用户批准的《独立 QA 验收体系建设计划》（当前会话）",
        "decision": "leave-all后本地与网关成员一致性比较服务账号投影，外部用户可继续在群。"
      },
      {
        "id": "QA-D4",
        "source": "用户批准的《独立 QA 验收体系建设计划》（当前会话）",
        "decision": "创建独立QA资产并只自检QA工具；实际产品测试须在开发及自测完成后获得用户单独授权。"
      },
      {
        "id": "QA-D5",
        "source": "用户本次明确授权必要QA资产调整；D036/D037批准范围见docs/decisions.md:53–57",
        "decision": "补齐容量耗尽、触发停止、读写重试、取消/预算/政策交错等通用质量风险的QA设计；原遗漏属于QA覆盖不足，不以新增业务需求解释。仅调整QA资产并自检工具，产品执行仍须单独授权。"
      },
      {
        "id": "QA-D6",
        "source": "2026-10-01本会话：QA建议普通序列失败使整条run为failed且停止后续发送，用户明确回复“按你的建议执行”；详见qa-acceptance/requirements/sequence-failure-policy.md",
        "decision": "补充原B1未规定的普通发送失败策略：步骤及run为failed，后续不发送，重启不恢复后续发送；保留原无匹配账号skipped继续、rate_limited等待、unknown确认流程和群不可写stopped。只授权QA资产更新，产品执行仍须单独授权。"
      },
      {
        "id": "QA-D7",
        "source": "docs/decisions.md D042最终确认@993f7588c1105894e0543554209a8c085423589f；交接DEV-QA-20261001-01",
        "decision": "采用已单独确认的退群公开成员语义：只退出托管成员，left群公开members保留外部成员。明确取代原2.3 members=[]部分；QA-D3托管投影与原群不可写/停止自动化/失败保护不变。不代填验收通过。"
      }
    ],
    "requiredAdditions": [
      "CR-001",
      "CR-002",
      "CR-004",
      "CR-005",
      "CR-006",
      "CR-007",
      "CR-008",
      "CR-009",
      "CR-010",
      "CR-011",
      "CR-012",
      "CR-013",
      "ADD-SEQ-FAIL-01",
      "ADD-LEFT-MEMBERS-01",
      "ENG-DIAG-01"
    ],
    "additionNotes": {
      "CR-003": "排序方向最终由CR-007承接，不能把早期实现默认值冒充当时用户确认。",
      "CR-014": "原始核心质量修复仍映射A/B，不增加独立业务能力或把旧修复证据当验收。",
      "C3": "本次QA交付包含Playwright端到端旅程，作为A/B及已批准追加需求的验证手段。"
    },
    "excludedOrDeferred": [
      "C1/C2产品执行和生产凭据使用，待明确批准",
      "i18n/主题切换/响应式不属于基础承诺",
      "未批准PI-03剩余部分及PI-04～23等新功能",
      "公开部署/推送/操作用户演示或生产数据"
    ],
    "independence": {
      "ignored": "业务实现、既有测试、旧缺陷修复及验收报告不作为期望值来源",
      "systemUnderTest": "后续明确交付的候选构建，经HTTP/SSE/WS与浏览器观察；隔离故障控制和副作用账本用于独立裁判",
      "forbiddenShortcut": "不得从源码结果生成期望值；不得改QA mock以迁就实现；不得省略强保证换取通过"
    },
    "executionPolicy": {
      "productTestingAuthorized": false,
      "initialResult": "NOT_RUN",
      "testPreparation": "只生成用例、自动化及报告模板并自检自身；不得启动SUT或连接其数据库",
      "reportAuthority": "根报告统一生成所有用例状态；用例文件不预填通过"
    },
    "typicalScenarioMapping": {
      "S1": [
        "R-A2-02"
      ],
      "S2": [
        "R-A2-05",
        "R-A5-01"
      ],
      "S3": [
        "R-A2-06"
      ],
      "S4": [
        "R-A1-06",
        "R-A2-09"
      ],
      "S5": [
        "R-A2-03",
        "R-A5-10"
      ],
      "S6": [
        "R-A5-03",
        "R-A5-04",
        "R-A5-05"
      ],
      "S7": [
        "R-B1-06"
      ],
      "S8": [
        "R-B1-04"
      ]
    },
    "openClarifications": "qa-acceptance/requirements/clarifications.md",
    "releaseGates": "qa-acceptance/requirements/release-gates.md",
    "revisions": [
      {
        "id": "QA-REV-02",
        "date": "2026-10-01",
        "reviewedRange": {
          "from": "cc5d3d2",
          "to": "48adfd96f470532cc78c2d3c559414a09434eeff"
        },
        "qaBranch": "agent/qa-architecture-impact",
        "classification": "已有工程质量具体化与QA风险覆盖修正；无新增业务域/外部服务协议",
        "requirementIds": [
          "ENG-ADMISSION-01",
          "ENG-CONTRACT-01",
          "ENG-READ-01",
          "ENG-READ-02"
        ],
        "preserves": [
          "原始需求内容和SHA-256",
          "原baseCommit、原sourceSnapshots与QA-D1至QA-D4",
          "A/B硬性行为和既有待澄清强保证",
          "产品未执行状态"
        ],
        "impactReview": "qa-acceptance/requirements/architecture-impact.md",
        "riskReview": "qa-acceptance/requirements/risk-coverage-review.md",
        "productTestingAuthorized": false
      },
      {
        "id": "QA-REV-03",
        "date": "2026-10-01",
        "qaBaseCommit": "7cfa1743c71656d561419db75bb0c8f5583d466c",
        "qaBranch": "agent/qa-sequence-failure-policy",
        "classification": "用户批准原B1普通失败终止的补充口径；同步修正原A2可选重发的过约束断言",
        "requirementIds": [
          "ADD-SEQ-FAIL-01"
        ],
        "decisionIds": [
          "QA-D6"
        ],
        "decisionRecord": "qa-acceptance/requirements/sequence-failure-policy.md",
        "preserves": [
          "原始需求内容和SHA-256、原baseCommit及sourceSnapshots",
          "原跳过/限流等待/unknown确认/群不可写stopped规则",
          "13项工程接入依赖及产品NOT_RUN状态"
        ],
        "productTestingAuthorized": false
      },
      {
        "id": "QA-REV-04",
        "date": "2026-10-01",
        "qaBranch": "agent/qa-integration-intake",
        "reviewedRange": {
          "from": "48adfd96f470532cc78c2d3c559414a09434eeff",
          "to": "993f7588c1105894e0543554209a8c085423589f"
        },
        "classification": "接收开发提测；D042明确需求差异与D045诊断公开profile纳入；其余保留原要求、补强弱断言并登记接入/覆盖缺口",
        "requirementIds": [
          "ADD-LEFT-MEMBERS-01",
          "ENG-DIAG-01"
        ],
        "impactReview": "qa-acceptance/requirements/integration-intake-20261001.md",
        "riskReview": "qa-acceptance/requirements/integration-risk-review-20261001.md",
        "productTestingAuthorized": false
      },
      {
        "id": "QA-REV-05",
        "date": "2026-10-01",
        "qaBranch": "agent/qa-next-integration-preparation",
        "qaBaseCommit": "4c035b8c24e95f33182b4248ee676fcd184f74a5",
        "classification": "首轮六条联调之后补齐既有需求风险组合和版本化D043/D044/D045技术契约，业务验收与上线评估分开；不放松原始强保证",
        "requirementIds": [
          "ENG-ACCOUNT-RECOVERY-01",
          "ENG-STREAM-01",
          "ENG-DIAG-01"
        ],
        "riskReview": "qa-acceptance/requirements/integration-risk-review-20261001.md",
        "preparationReview": "qa-acceptance/requirements/next-integration-preparation-20261001.md",
        "productTestingAuthorized": false,
        "scopeNote": "该false只指本次新增专项/正式业务执行尚未启动；此前6条已获授权并实际完成，见executionHistory"
      }
    ],
    "executionHistory": [
      {
        "phase": "developer-preflight",
        "suite": "developer-smoke",
        "runId": "2026-10-01T04-48-30.855Z-08486f22",
        "caseCount": 6,
        "pass": 6,
        "retries": 0,
        "sutRevision": "993f7588c1105894e0543554209a8c085423589f",
        "qaRevision": "1e40092b2acd295e5bac8ae495a5e32243f487a9",
        "report": "qa-acceptance/reports/integration/20261001-smoke.md",
        "note": "独立授权只用于该范围；原executionPolicy保留资产创建时的基线快照，不是当前执行结果或全量授权。"
      }
    ]
  },
  "qaRevision": "c529f31076f9c645b5b1b04a2184e641c81b031b",
  "qaDirtyState": " M qa-acceptance/cases/architecture-capacity.json\n M qa-acceptance/cases/generated/architecture-capacity.md\n M qa-acceptance/requirements/change-reviews.json\n M qa-acceptance/requirements/traceability.md\n M qa-acceptance/sharing/suites.json\n M qa-acceptance/tests/self/suites.test.ts\n M qa-acceptance/tests/system/capacity-control.spec.ts\n M qa-acceptance/tests/system/spec-boundaries.spec.ts\n M qa-acceptance/tests/ui/console.spec.ts\n M qa-acceptance/tests/ui/observation-boundaries.spec.ts\n?? qa-acceptance/contracts/declared-json-schema.ts\n?? qa-acceptance/reports/integration/20261001-capacity-controller/controller-4332c6cc-8f15-4247-b156-363b9a5826da/lifecycle-script.ts\n?? qa-acceptance/reports/integration/20261001-capacity-controller/controller-4332c6cc-8f15-4247-b156-363b9a5826da/lifecycle.ndjson\n?? qa-acceptance/reports/integration/20261001-capacity-controller/controller-4332c6cc-8f15-4247-b156-363b9a5826da/ready.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/admin-accounts.png\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/admin-group-detail.png\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/admin-sent-message.png\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/admin-sequences.png\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/artifact-hashes.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/browser-continuation-rest.ndjson\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/browser-continuation-result.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/browser-continuation.mjs\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/cleanup-verification.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/cleanup.mjs\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/document-review.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/document-review.mjs\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/environment.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/manual-review-inputs.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/npm-ci-result.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/qa-script-corrections.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/receiver-result.json\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/receiver.mjs\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/rest.ndjson\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/review.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/README.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__README.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__change-requests.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__decisions.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__group-directory-profile-proposal.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__group-profile-conflict-review.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__isolated-local-reproduction.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__page-update-notification-implementation.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/sources/docs__qa-remediation-final-20261001.md\n?? qa-acceptance/reports/integration/20261001-final-delivery-reproduction/viewer-group-detail.png\n?? qa-acceptance/reports/integration/20261001-qa-premise-retest/execution-approval.json\n?? qa-acceptance/reports/integration/20261001-qa-premise-retest/execution-plan.json\n?? qa-acceptance/reports/integration/20261001-qa-premise-retest/source-before.json\n?? qa-acceptance/reports/integration/20261001-qa-premise-retest/source-files.txt\n?? qa-acceptance/reports/integration/20261001-qa-premise-retest/source.tar.gz\n?? qa-acceptance/reports/integration/20261001-utf16-candidate-intake/review.json\n?? qa-acceptance/reports/integration/20261001-utf16-candidate-intake/sources/docs/README.md\n?? qa-acceptance/reports/integration/20261001-utf16-candidate-intake/sources/docs/evidence/qa-group-profile-utf16-after-verification.json\n?? qa-acceptance/reports/integration/20261001-utf16-candidate-intake/sources/docs/evidence/qa-group-profile-utf16-before-verification.json\n?? qa-acceptance/reports/integration/20261001-utf16-candidate-intake/sources/docs/qa-group-profile-utf16-fix-20261001.md\n?? qa-acceptance/reports/integration/20261001-utf16-retest-preparation/first-api-result-and-correction.json\n?? qa-acceptance/reports/integration/20261001-utf16-retest-preparation/freeze.json\n?? qa-acceptance/reports/integration/20261001-utf16-retest-preparation/qa-authored-source.tar.gz\n?? qa-acceptance/reports/integration/20261001-utf16-retest-preparation/version-evidence.json\n?? qa-acceptance/reports/integration/20261001-utf16-retest-schema-correction/freeze.json\n?? qa-acceptance/reports/integration/20261001-utf16-retest-schema-correction/qa-authored-source.tar.gz\n?? qa-acceptance/reports/integration/20261001-utf16-retest-schema-correction/result-summary.json\n?? qa-acceptance/reports/integration/20261001-utf16-retest-schema-correction/result-summary.md\n?? qa-acceptance/requirements/qa-correction-capacity-cancellation-20261001.md\n?? qa-acceptance/requirements/qa-correction-directory-premises-20261001.md\n?? qa-acceptance/requirements/qa-correction-spec006-schema-dialect-20261001.md\n?? qa-acceptance/requirements/qa-correction-ui-concurrency-pagination-20261001.md\n?? qa-acceptance/requirements/utf16-remediation-intake-20261001.md\n?? qa-acceptance/tests/self/capacity-prerequisites.test.ts\n?? qa-acceptance/tests/self/declared-json-schema.test.ts\n?? qa-acceptance/tests/self/directory-observer.test.ts\n?? qa-acceptance/tests/ui/directory-observer.ts\n?? qa-acceptance/tests/ui/native-focus.ts\n",
  "qaTree": {
    "sha256": "e1cb1318cc16c2d93992d9c891eb4a4f78861247ee19c9829c45a2d1b0db90a9",
    "files": [
      {
        "path": ".gitignore",
        "sha256": "419ced137b12d10386b0c3d71d1247a2ec99e8f841b3f1e1ba28018230801ab8"
      },
      {
        "path": ".prettierrc.json",
        "sha256": "8123eeaf657f177f4617a71e78584ac602b6ca7b4fa7e1e6c24e59c2dee1a2b7"
      },
      {
        "path": "cases/architecture-capacity.json",
        "sha256": "598f7bec88b4ef0c9b286ed979e915f49f5145e4d075296a5af08d11f1f9f82e"
      },
      {
        "path": "cases/architecture-contract.json",
        "sha256": "2664fe797b4a38c81df3a7054015b2a04a2a6c5bbcea7043573dcfd41e39adb0"
      },
      {
        "path": "cases/architecture-observation.json",
        "sha256": "8ebe6cff255a6e50fe581ad6bfd3a198a26a734d2ddfd6c9c997e3fa75f343fe"
      },
      {
        "path": "cases/architecture-ui.json",
        "sha256": "bec51c6d708dc28167dd69be15505225a91915bb7428e2e9d4ddd0395c12a9a3"
      },
      {
        "path": "cases/backend.json",
        "sha256": "51d90f95de89f0d898057975732ede4b9234b9194752e3ff7880624ee12fcd6b"
      },
      {
        "path": "cases/candidates.json",
        "sha256": "4c7fa9c688cadc7a877ac2a7feae18b1f7e909db31f0460ed5c87b7827b07968"
      },
      {
        "path": "cases/extensions.json",
        "sha256": "074baa35d0bc74cc10deaf18b2964a303eca4dfe2cfd018d7352485226fa7f58"
      },
      {
        "path": "cases/fixture-boundaries.json",
        "sha256": "a1c9961d2152aa9f4cd73aacaf29f6a3e06eb00d37fbc1a85f9fd90c70887434"
      },
      {
        "path": "cases/foundation.json",
        "sha256": "ec233fc421a1fbc3269c03cf4a28890a5236b75f03ea4cf9daad3a92e9ad83b1"
      },
      {
        "path": "cases/generated/architecture-capacity.md",
        "sha256": "4b5c3dedd2a4a488a7ee61bc101b7a31a22771187e83f3ebc195524ade21d865"
      },
      {
        "path": "cases/generated/architecture-contract.md",
        "sha256": "b4724c249fe3b35b66d246c200ddfea71d48f339afa20fe72b19fd4e6bb8e2a7"
      },
      {
        "path": "cases/generated/architecture-observation.md",
        "sha256": "f70e22926b46e57ad4c09192620931b3ffe19057ace9be85098a80400520661e"
      },
      {
        "path": "cases/generated/architecture-ui.md",
        "sha256": "554d33f9804e43493326edf301fc6f4e9198cc8a54e6d0749c3f6d8c39aaa5ec"
      },
      {
        "path": "cases/generated/backend.md",
        "sha256": "ae04322e9e0e2dbce22fc8fa00d68b00fd2864ec667d4bfd674462e353b82c47"
      },
      {
        "path": "cases/generated/candidates.md",
        "sha256": "8c9392e707121c4ea7e800d24b0c3cff50f31c5f6e31080c74013007b61ac568"
      },
      {
        "path": "cases/generated/extensions.md",
        "sha256": "8b1591b8f450fe984e8f0c7d59fdf0b622c7b5573587184f80fead2e57b53b03"
      },
      {
        "path": "cases/generated/fixture-boundaries.md",
        "sha256": "b744d74442b9f5105834e2a67c919c8a3a80e2918ad36df45292ec321fa944a6"
      },
      {
        "path": "cases/generated/foundation.md",
        "sha256": "102f91ecae3b27404e554aa576a34e085cecd63d9727ab1d2b28e36c83bd7865"
      },
      {
        "path": "cases/generated/integration-diagnostics.md",
        "sha256": "355d1ea290cbb754de378f21c5b6c9e123c9a052dbfcea6c94b3fb257d131db9"
      },
      {
        "path": "cases/generated/integration-message-boundaries.md",
        "sha256": "b7bc9f399416d7006659b13c2297601839b91f94110dbd69894c4f48cdc6604f"
      },
      {
        "path": "cases/generated/integration-message-timing.md",
        "sha256": "d28ae43917e56aa0f6e3bf53385dfe19e8162b6a9257bed7da0c0cc25b1abec4"
      },
      {
        "path": "cases/generated/integration-runtime.md",
        "sha256": "ebe41032344a14a756203b47acad7fe1f8e966f3fd267ff1ff35c2cbf94f0fef"
      },
      {
        "path": "cases/generated/integration-streams.md",
        "sha256": "b56e7036cedb49c8cc63bdc1bfdd8c4bc13f9fae276cfdac220df767a9b1815a"
      },
      {
        "path": "cases/generated/manual.md",
        "sha256": "406f26b4f276afe1a8af9f3460d8d1a3d07b444e15bb5ab146bc481b42ac301b"
      },
      {
        "path": "cases/generated/protocol-boundaries.md",
        "sha256": "b510e69b193cd2b177e150400ffcb2d2a677127053d0a164469846b974ad621e"
      },
      {
        "path": "cases/generated/release.md",
        "sha256": "837b108b673cde29a511b1731b21d55d3a1d8a37bdd076a7719ea0ead63d1539"
      },
      {
        "path": "cases/generated/sequence-failure-policy.md",
        "sha256": "8c1a6c4a7387af03a65954d85bb0a92119ba9e9cf961c1d40641d95224bf423b"
      },
      {
        "path": "cases/generated/spec-boundaries.md",
        "sha256": "fdbdb1f133788378d3f1a771578503aa5a7547a8f3e4a5a10c46b5120c883080"
      },
      {
        "path": "cases/generated/ui-extra.md",
        "sha256": "febafe0515246359b9ad9edfbf9a07ea171bdfd232565d64aa338720cee164b4"
      },
      {
        "path": "cases/generated/ui.md",
        "sha256": "dd563942610d15c28bf93b848a283d856b62d235950109213c4c49db4e7700ac"
      },
      {
        "path": "cases/integration-diagnostics.json",
        "sha256": "11d29d4931c38d3a59f891e16febba15e8109bf14939b86e162a3772ce953986"
      },
      {
        "path": "cases/integration-message-boundaries.json",
        "sha256": "50d2339ddec3e5f852425e1b515fe84ca710361345cff86eac33a09fdf7dfe9b"
      },
      {
        "path": "cases/integration-message-timing.json",
        "sha256": "b982b66135a54195c98c18c06d5fea6a3101024d9b53e86ff39361e75fa51c0c"
      },
      {
        "path": "cases/integration-runtime.json",
        "sha256": "ae9560eba0779e54d607e17b98b63dc4fb8b99e521fbbc8daa0dee346e68ccba"
      },
      {
        "path": "cases/integration-streams.json",
        "sha256": "f331f8edfabada4451f6d5a1a61af6b4449e4f07b4278ae66e33d4281800c1e8"
      },
      {
        "path": "cases/manual.json",
        "sha256": "c39ae9f01a41e2668dfca386d377cac1a9ae616d4c00aea1fda736a6c2b168de"
      },
      {
        "path": "cases/protocol-boundaries.json",
        "sha256": "1568eb71e8d6ec2c443eebf540ce307ed9dc380330a20a10901755f6391a647d"
      },
      {
        "path": "cases/README.md",
        "sha256": "31e0c1e80083864ae2d6f58c5bc621291b942b07b075903ebbb11f0269247f2f"
      },
      {
        "path": "cases/release.json",
        "sha256": "222f7f0acc1e75306962898ee42d38fcc2d32edb65672a5fe16695c33bad77d5"
      },
      {
        "path": "cases/sequence-failure-policy.json",
        "sha256": "117a74dfc124e38165f7d7a900741cb53147066d1a3a0ef8c397132048884168"
      },
      {
        "path": "cases/spec-boundaries.json",
        "sha256": "5a90daa846daa1678b6bdaaf7648588cd2113c0db2864994c3d0696d6cc2bb84"
      },
      {
        "path": "cases/ui-extra.json",
        "sha256": "4d593ba7932d37b2a36076e06fc45e5cec0a0c8240a04b9aa6931c156fa300d4"
      },
      {
        "path": "cases/ui.json",
        "sha256": "7abbf1c0931846e493465b8b50ad8bb2194a3fc4606aaa4ae27ba848bbd05bea"
      },
      {
        "path": "config/authorization.example.json",
        "sha256": "730d90bffa800678a795c3f7d6b49c46ddb0eda32a411e84470996a2eabda92d"
      },
      {
        "path": "config/fixture-binding.example.json",
        "sha256": "04afa7758840d5fcce194a3ba759d0485f943af526135f14d8986e06093fa865"
      },
      {
        "path": "config/fixture-binding.integration-0af6443-startup.json",
        "sha256": "0aed2583724d574ae9a91d507196dd6683291f85d1c73587ce8ded221d2d20cc"
      },
      {
        "path": "config/fixture-binding.integration-0af6443.json",
        "sha256": "37734439d1b87063623f9a398d858d8e07234f4289a7223ac2a71bf28921a80f"
      },
      {
        "path": "config/fixture-binding.integration-86ad4e7.json",
        "sha256": "ea502d281bb9823b858dc026ab4b475ead90ebd6b256a125ed2326c10dd6f266"
      },
      {
        "path": "config/fixtures.example.json",
        "sha256": "dfe0b94771afa7fe47f2994a6e7024ae4316e48f2f613501e4669d65e2f2d7e1"
      },
      {
        "path": "config/fixtures.integration-0af6443-startup.json",
        "sha256": "46e50f4e7da54e555b788b0785a6bdcb84313928ea9a8d38e9fb7a9e3a2fdb62"
      },
      {
        "path": "config/fixtures.integration-0af6443.json",
        "sha256": "c0581223556f09b81455c5b014689d67faeaf7b3482ef533eaefb25686c92ec6"
      },
      {
        "path": "config/fixtures.integration-86ad4e7.json",
        "sha256": "f9c8420f6890b76b6ef2485c7527a4035abbd94b13e9fb271d76a9d32f2d2346"
      },
      {
        "path": "config/integration-plan-993f758.json",
        "sha256": "bc22c1206499ec7bd7238ecdd000ec7f2084664a14d6a923579dbd06fd14deca"
      },
      {
        "path": "config/manual-review.example.json",
        "sha256": "0ab5a4ff86e729179ea82bd00e6d98890a7bcacc49e659a46669aadde8f31bb8"
      },
      {
        "path": "config/preflight-authorization.example.json",
        "sha256": "4fd1a5409585e9aa42cb616212134df49d9d975ae047943712ab97c6253d5530"
      },
      {
        "path": "config/preflight-authorization.local.json",
        "sha256": "13baf6a171e4747871c3f9fc94aaaee5fd0f84d54a08fe319b58106549079db6"
      },
      {
        "path": "config/target.example.json",
        "sha256": "f0cfc7ff8cf3d372e1fa5578fa7cbdb41cb87b2082c68062b68fe1660b0475ba"
      },
      {
        "path": "config/target.integration-993f758.json",
        "sha256": "e3588fa34e3add96e200521acdc71223cb75baa44b330462dc2c62e7adaf03ca"
      },
      {
        "path": "config/ui-adapter-0af6443-retest.json",
        "sha256": "a19888556291e3bab55b7e3cdc481f89ab366a27ae80ef0188dc5c7afa1f8627"
      },
      {
        "path": "config/ui-adapter-0af6443.json",
        "sha256": "df2223cc48f1cfd8a98ab82ae96b89259156f940efe54c12f2696f863888350a"
      },
      {
        "path": "contracts/capacity-observation.md",
        "sha256": "558b585c571f77e304b507ead0e062cbeeb95b041165db0d4defe0f50c5b922c"
      },
      {
        "path": "contracts/declared-json-schema.ts",
        "sha256": "1b4e17b13ad40596e76feaa01e5e8dc199373dd093de0f8acca5c06908fe530d"
      },
      {
        "path": "contracts/fixture-artifacts.md",
        "sha256": "724d47a508a475c6d750c94a130e010a41d604545d55d2c0298c854de9374ec2"
      },
      {
        "path": "contracts/message-receipt-observation.md",
        "sha256": "b8fe423b10ab038cfb9100fa82938c2af28302d461d18ebd73a4071bdd7b122e"
      },
      {
        "path": "contracts/public-api.ts",
        "sha256": "85d5069b89869e9aff6a6ba3e64b913630f810e32783aac3e2ff8a43e3bc84a2"
      },
      {
        "path": "contracts/runtime-observation.md",
        "sha256": "29cbae987899132603201fdba9874a752d0f5237a2ab7cbb8d15cad7d88497e3"
      },
      {
        "path": "contracts/simulator.md",
        "sha256": "1c7f64df8b0c1528c6dc80c573b7e1865e5bb2f6e1d160950ab647614a1eb971"
      },
      {
        "path": "fixtures/20261001-0af6443/directory-precision.json",
        "sha256": "c0b6a9b11663343673af60994fb3bcf0261a573f2f8c5cdc6b1bb63e6d1cef11"
      },
      {
        "path": "fixtures/20261001-0af6443/legacy-schema.json",
        "sha256": "2d6a383ea0d22a30c2dc1157b9261a513c4a20729297b967ff85c4bcff4fad36"
      },
      {
        "path": "fixtures/20261001-0af6443/legacy.dump",
        "sha256": "24f49db6ecfb7cf54e614d6d00a3e9f77e7ade2f5dfd040ba31bb7550990cb4f"
      },
      {
        "path": "fixtures/20261001-0af6443/precision.dump",
        "sha256": "0554319ab7ad4483f0a03fcb78416168267a0cd46ecf77b3a204cdea7e23ea38"
      },
      {
        "path": "fixtures/20261001-86ad4e7/directory-precision.json",
        "sha256": "b74456924618450e6471d054fb4b9a793664d1304f8a9277760dcbc582d98add"
      },
      {
        "path": "fixtures/20261001-86ad4e7/legacy-schema.json",
        "sha256": "93985edc23351de52aa79c99015d02d67f862a1de507f57704b2a268f7a2f846"
      },
      {
        "path": "harness/agent.ts",
        "sha256": "d9906d9fa9da3884cc8390e1b028fab525ae7e7a66d3bac3238d715a344b036b"
      },
      {
        "path": "harness/barrier.ts",
        "sha256": "3c7b7636bc2c8488bc28a4bd7068171a521d71ac0c256c938a65c8f022b4b177"
      },
      {
        "path": "harness/business-scope.ts",
        "sha256": "f11522b38606b2965e8158d1d4f66ebea58dbc9092afebb243d304ebf2e49fa8"
      },
      {
        "path": "harness/capacity-control.ts",
        "sha256": "c231c8002ac55c7e9f72eb62104569f8d306e1b70b60f2c3addc1744d3b929e4"
      },
      {
        "path": "harness/capacity-probe.ts",
        "sha256": "74cfdc37ca6b66d81e2d4b2397c8a3fbfd4de968a1195818403da646e85dc958"
      },
      {
        "path": "harness/catalog-check.ts",
        "sha256": "239e57aa09c2e95162cedc2bdc4a86e5b7298a634d6951c45257a785dc5fe434"
      },
      {
        "path": "harness/catalog.ts",
        "sha256": "5001a2b1172cb4b8f07ca5ef80f22ea752b47a9a7ac0b6920f5ccadc5ca35411"
      },
      {
        "path": "harness/change-review-check.ts",
        "sha256": "5458c44daf92dc9806d836a2e63ab75e0ab31502d85b552e8fd52ddf63735950"
      },
      {
        "path": "harness/change-review.ts",
        "sha256": "866bb98382624aedb931e01b0547830a87b26a941082e20b9fcd44a1651e4316"
      },
      {
        "path": "harness/cli.ts",
        "sha256": "2efc746529d1d38e4234a53bd18b4bcb648f4bbc3b1fac0b81b6bab33efef743"
      },
      {
        "path": "harness/database.ts",
        "sha256": "d0f69b102bcc9c792ba5c395792b5be18a4ec3e783498c511d267987c3dd6bcb"
      },
      {
        "path": "harness/environment.ts",
        "sha256": "9e84c047bfd704352a5c605bdf02c92f4b4a365fcc9d06a36cf592097055660a"
      },
      {
        "path": "harness/execution-gate.ts",
        "sha256": "f9975961f0667a65f0ffb2370326dfb6d86b26eac62509886944379cf6563932"
      },
      {
        "path": "harness/execution-plan.ts",
        "sha256": "6422c9768170aa8e51d31c75a97162acd2b7c8408990d5c7c09ed33c4a8d1549"
      },
      {
        "path": "harness/fixture-artifacts.ts",
        "sha256": "96a05c3b9b021a75e043bcd7056d82420d80c21a309e5e96d5467ef91f2143fe"
      },
      {
        "path": "harness/gateway.ts",
        "sha256": "966292c0866702435f147834988fd5f444143e0be7d03157603f52a2805d1077"
      },
      {
        "path": "harness/http-server.ts",
        "sha256": "c4f5b6a80b79f3f88dec987fe133558def705ec6e065c53fa956f64af932c07d"
      },
      {
        "path": "harness/manual.ts",
        "sha256": "e197c71216e4b181241185a5e4eb43a00180ab8fafdebe187038f02324b2ae9d"
      },
      {
        "path": "harness/message-observation.ts",
        "sha256": "32e6f16c3a110af7bf100d2f6a56d8c29260f690dc23d9bb49991f523e196743"
      },
      {
        "path": "harness/network.ts",
        "sha256": "be935118cc6b719ff340a8a04355d7ca6fd64175189c1b6368a2fff941090030"
      },
      {
        "path": "harness/observation.ts",
        "sha256": "8fc04d7fffc3bfb023d77368cb1979a17331322f25d6dc6b7498080079fe27b8"
      },
      {
        "path": "harness/platform-client.ts",
        "sha256": "fc14a9420981cf046ac015f31f25b9c657d71bfe2bafc99aa79939a8df404c23"
      },
      {
        "path": "harness/process.ts",
        "sha256": "e0047da7d54a2b7f2a8e9055e2b21f49b7e1d655b268c101b6d7758cb072ee0e"
      },
      {
        "path": "harness/provenance.ts",
        "sha256": "10e3661ba876c9ba9ee490e36784e69b61f1b9a9c09f646a6931de1c7781a342"
      },
      {
        "path": "harness/receipt-socket.ts",
        "sha256": "59006a0e0184d4721eb6d126e620ffcc14791dd893bdb2487cae1f10f2811680"
      },
      {
        "path": "harness/recovery-drill.ts",
        "sha256": "07dfbc2db5f9842edcfcba7d3ceae7e7520d8c3d682bac71fc9895fc92189f2e"
      },
      {
        "path": "harness/render-cases.ts",
        "sha256": "b83e78b005aabe2cd2f9a45c394d10e5ef0b1009f0b3ddd1e97d1e365c830dd7"
      },
      {
        "path": "harness/report.ts",
        "sha256": "5db1991ee0c25a000ca1333209c432e844f100340be08dc46c45b92fbac61f8f"
      },
      {
        "path": "harness/reporter.ts",
        "sha256": "9cd59b41071aedae085b46bea8c0c46b69ce04efc2e7c7589d02d541fc6f7794"
      },
      {
        "path": "harness/runtime-observation.ts",
        "sha256": "f161589e5c8ff93e73bece0458e61c3f73f01f4d60b0696c8c0d71d5826afe99"
      },
      {
        "path": "harness/security.ts",
        "sha256": "d355b4da7fbd5f57c21a0f55cd2e714274a27260b199a077ccbf4342f21a4e13"
      },
      {
        "path": "harness/suites-check.ts",
        "sha256": "ee03bf05a199bb826f9b61ac890d1302e14db0debde21bf252bc5757346393c6"
      },
      {
        "path": "harness/suites.ts",
        "sha256": "b85ed0a9097060f7f2ff240e8013f14925874963f30c7b8a074871f38dec4735"
      },
      {
        "path": "harness/types.ts",
        "sha256": "f41ee7934a39babd25300e25522783ad6ea43658650d68a56c768dbab1e54eb3"
      },
      {
        "path": "harness/verify-tools.ts",
        "sha256": "d269ffa546bc2c477f870491c198ede53a925cb4b73f46779399970805dafb96"
      },
      {
        "path": "package-lock.json",
        "sha256": "7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883"
      },
      {
        "path": "package.json",
        "sha256": "6d8de82b1cd439f839c69a3e472b8ca253836eeca7bd4fd4e3a1b3bbf7af764b"
      },
      {
        "path": "playwright.config.ts",
        "sha256": "4a063f59db9037042c62f6e4df550e53972db3edf9a5923a06a4304df84c245e"
      },
      {
        "path": "README.md",
        "sha256": "d2a502876545e9cf4ae2e73c533721c5bc6830888f06deb27ff6fef1c406be52"
      },
      {
        "path": "requirements/architecture-impact.md",
        "sha256": "8be2e077a3d5c68cd4067fb689f241fffcd816f69dcf404388abebf6a4e57477"
      },
      {
        "path": "requirements/baseline.json",
        "sha256": "fc909783677cd54cde10f71a4aab80a467312f4f46e593ff0ffd285b86a17d82"
      },
      {
        "path": "requirements/blocker-reassessment.md",
        "sha256": "f2c901aa22aaa72448673245574ff06f5a591ab9f5ddf74d444761c4e92e7404"
      },
      {
        "path": "requirements/catalog.json",
        "sha256": "07689a14f445f1bf5b3c92ad0fe3a55094b6b97ebe99c39e60dcd0a3aaa4fce6"
      },
      {
        "path": "requirements/change-reviews.json",
        "sha256": "7352464f67203aa0f03ff42aef314ff8453c58e344e82830646a8cc7c0cb9f06"
      },
      {
        "path": "requirements/clarifications.md",
        "sha256": "805cb9d65a139a0520496680a306aa1d10ff34d7f97956111b7e177b5ad86b32"
      },
      {
        "path": "requirements/collaboration.md",
        "sha256": "5bd518dda0c35fe037aafa9c26a57cf97cd44cf0ad434ecdbc8f2f38d0022073"
      },
      {
        "path": "requirements/coverage.md",
        "sha256": "202ce9cb58785950a909189c9ddd5d37df323b189c972b38fc19228f70d2b363"
      },
      {
        "path": "requirements/engineering-candidate-intake-20261001.md",
        "sha256": "89a4056f807ff750a847c5ea9bed9cc365de9f982cf6f28e4f02a7cd5e992e47"
      },
      {
        "path": "requirements/integration-intake-20261001.md",
        "sha256": "8b05f6133bcab992480d26cd71c7fa5230051c1965794959cf1dbcabd23b01a2"
      },
      {
        "path": "requirements/integration-risk-review-20261001.md",
        "sha256": "187ba6c714769454919261d23b43a092465f081f19ff5aebb228fcd38e43716a"
      },
      {
        "path": "requirements/left-members-decision.md",
        "sha256": "691a8f1445ad7a93bd5ca88085b9a64ec3ba6aae9cbb1e598cab583e9101af20"
      },
      {
        "path": "requirements/next-integration-preparation-20261001.md",
        "sha256": "40eeb2640d7f16e0d1ee4967fb9d07e8cf6e95b71d026296f8208b8c3a036b8a"
      },
      {
        "path": "requirements/qa-correction-auxiliary-startup-20261001.md",
        "sha256": "63a5516443d039753778db68f6aa203c1d2291ba06cc70575001c85c7c10351e"
      },
      {
        "path": "requirements/qa-correction-browser-adapter-20261001.md",
        "sha256": "659a48f7cbaaf018ed7a047c2885fd8088ff5ecca40309c94eb30ce82c625f4d"
      },
      {
        "path": "requirements/qa-correction-capacity-cancellation-20261001.md",
        "sha256": "b0f7ec8acfe272e6f09b718cdcf194b0caf2654421b8330b3dfdb4403f987746"
      },
      {
        "path": "requirements/qa-correction-directory-premises-20261001.md",
        "sha256": "0ef2b6c42d24167b240f38a69b358e4b0c46676b7e0aefc82c681616c55a9fe5"
      },
      {
        "path": "requirements/qa-correction-group-prerequisites-20261001.md",
        "sha256": "9dc7877d0cdbe3400a6266766dd9c7b482dc94237e93de5e20c003e52218d63b"
      },
      {
        "path": "requirements/qa-correction-pagination-reference-20261001.md",
        "sha256": "20e6f0bd5a9da66ed85b059967ef0b7be9b230cc881b21135f724997ed63c5bd"
      },
      {
        "path": "requirements/qa-correction-recovery-ws-20261001.md",
        "sha256": "34f36103ea8105ee34927e3aab55edd0f4dcbfb7e40c9b49814127bcd631d6a7"
      },
      {
        "path": "requirements/qa-correction-sequence-failed-sent-at-20261001.md",
        "sha256": "f99d7ba7e18c617396c8b7971ef8e17c7d78edb5dfc85b7485216f4fd99550a8"
      },
      {
        "path": "requirements/qa-correction-spec006-schema-dialect-20261001.md",
        "sha256": "bdda2e2c849a718729af6b3d8599b28bcf56b68bbd473c0ba8891efb874057ba"
      },
      {
        "path": "requirements/qa-correction-ui-concurrency-pagination-20261001.md",
        "sha256": "896d04635de34e2f3bce591e0f1178de3f49b9f9715dd21043c21973493e95a4"
      },
      {
        "path": "requirements/release-gates.md",
        "sha256": "0757bbe778819225ca5106cade3bd13ae70e2458dfe5ea2d3501682771f19a40"
      },
      {
        "path": "requirements/remediation-batch1-intake-20261001.md",
        "sha256": "f5a3687ca45be6dfa68c9f35c4666826bd1c9dc404f22329bd807e8f19b17154"
      },
      {
        "path": "requirements/remediation-final-intake-20261001.md",
        "sha256": "b14aed1865a8f3a39395b6186f2d534cbe202704c9395a52fbece245070f5328"
      },
      {
        "path": "requirements/risk-coverage-review.md",
        "sha256": "1f58a3f5e8d50779ac70073d1073a851a037298c75d7fbedeb00d0d9223f1c88"
      },
      {
        "path": "requirements/sequence-failure-policy.md",
        "sha256": "7198bf020dda26110e7104e5fc9d963695911c4e86b9adeafbd38c4ca8afb105"
      },
      {
        "path": "requirements/spec-boundaries-resolution.md",
        "sha256": "82de0ec1595d600033cd3a4661a89f6b508fa3067a3d823b7735334baab8e262"
      },
      {
        "path": "requirements/traceability.md",
        "sha256": "21968897bc010b9a521fa2edacc7475c2a1a47856312615c7077b9d1ec8f27bf"
      },
      {
        "path": "requirements/utf16-remediation-intake-20261001.md",
        "sha256": "8c088708428f03c417a41b1dd09cda61f164ec191102f45a6e34eb815b09b2be"
      },
      {
        "path": "sharing/business-acceptance.md",
        "sha256": "e75ed41093e23ad6d481e0e0397d1ab2db889cb10a3f333ac942b8ad87407a70"
      },
      {
        "path": "sharing/README.md",
        "sha256": "6c90def8d1a51642a42bd2460635e57abfd0c9c6cf75aa212d49374b58403ee8"
      },
      {
        "path": "sharing/suites.json",
        "sha256": "aef73c072699cb44f4d0965a2b1477f57efcf886058401bc69ecbb7ff34fa6df"
      },
      {
        "path": "tests/api/accounts.spec.ts",
        "sha256": "0dd82760e6733f5bd43cf3dd31b5706b7547048a4e4f83c2f4a29094a0ce88b1"
      },
      {
        "path": "tests/api/auth.spec.ts",
        "sha256": "ac579fe93a50e2f68c03b2102bdb3ba5511ca785aab77844b60952ff31b6dc0e"
      },
      {
        "path": "tests/api/diagnostics.spec.ts",
        "sha256": "64f802e0952b3ab65924a012c48e43d85a49953a1c868ed151999ec1f0d509f0"
      },
      {
        "path": "tests/api/groups.spec.ts",
        "sha256": "7d995ba75ecce1cdda2f881b1a8946c3c46aa4b9990e0626de90bb15d704190e"
      },
      {
        "path": "tests/api/messages.spec.ts",
        "sha256": "d034ca319f4862fcbaf1a53b33487d7bb2a01f273c637531d13348001df617af"
      },
      {
        "path": "tests/api/realtime.spec.ts",
        "sha256": "9ec54083fb257fe2de805ec803943ad93aaf4ade0526244841f7355fb38d3a37"
      },
      {
        "path": "tests/api/sequence-contracts.spec.ts",
        "sha256": "82ccf634ea4b37fda481766773e66e6e899ae11f055b4d0a8bfe6d329cd8d5c7"
      },
      {
        "path": "tests/extensions/api.spec.ts",
        "sha256": "0f67b5af5b25803ce679128f38adf48392799b61f75abc8588e6886d66e974a3"
      },
      {
        "path": "tests/fixtures.ts",
        "sha256": "db89ae4a3c75848f832fb1d911a8fb01c36ca6b13c9fc26a6be87c59e3e3d7e1"
      },
      {
        "path": "tests/foundation/contracts.spec.ts",
        "sha256": "0990ad89aa348469accfa1a00ca1dc55bda4b8edc7a5c1f04eb55c5f4f94f2c4"
      },
      {
        "path": "tests/foundation/startup.spec.ts",
        "sha256": "f1ad6daff9c215aa7d8692ba492c4799e64e7dbc03c41a1ad00da9d259574238"
      },
      {
        "path": "tests/release/operations.spec.ts",
        "sha256": "418ce615bb184bcdc0ee461354a8adce44c8dd726e288e9232effef67aff293b"
      },
      {
        "path": "tests/self/authorization-projects.test.ts",
        "sha256": "6ad27adc0a265270cd73a9fb8db2ae8310bec55b97e284bb9a9e063980fd5491"
      },
      {
        "path": "tests/self/auxiliary-startup.test.ts",
        "sha256": "c8354461071868b13572dd2167747e3ca219d22adcfd01ccae7e62b40c22d84e"
      },
      {
        "path": "tests/self/business-acceptance.test.ts",
        "sha256": "a7336707d53e2e85a7ee67f2346ec7005f2495b255048360e2c8c2f63ec4e72f"
      },
      {
        "path": "tests/self/capacity-control.test.ts",
        "sha256": "11d5e0c6cf9836d25ffa348bd12ece0f3cb693bef7e5cf67f8cb18ca1a7076aa"
      },
      {
        "path": "tests/self/capacity-prerequisites.test.ts",
        "sha256": "8280cedaf87aded2b0b05b08b9a7d86d896b038c36419faa8eafc93b4c028b15"
      },
      {
        "path": "tests/self/capacity-registry.test.ts",
        "sha256": "36013d1d75dbd4ade6f9347c9a1683578a6a37670c8d962be8b173fb4b560cbc"
      },
      {
        "path": "tests/self/change-review.test.ts",
        "sha256": "66d74355d476cca2f5a5abb17d5108c5e4e824f39b81f3df1c3517f70b5e8010"
      },
      {
        "path": "tests/self/contracts.test.ts",
        "sha256": "19ac7aab7fc096f22557a87384838d8012b62180366c17d5e65e6e96880149b0"
      },
      {
        "path": "tests/self/database-cleanup.test.ts",
        "sha256": "c725b5aa17a7b6e5909e1cbc7947947c2030e915060a22b5f2387bec8a9b524b"
      },
      {
        "path": "tests/self/declared-json-schema.test.ts",
        "sha256": "d0673beea17761fcc086a7b0ece99ded5f867d7c8b24d01a8822f57f9ffadf4a"
      },
      {
        "path": "tests/self/directory-observer.test.ts",
        "sha256": "2b050d8a34d66828e190404ef65f0b30b5421f5b38dc312e86ca46bbb7fc656d"
      },
      {
        "path": "tests/self/fixture-artifacts.test.ts",
        "sha256": "6ffbf445060266b2e04d4f84dde140c94dc809119fd97794bfda408dcb597301"
      },
      {
        "path": "tests/self/gateway-timing-evidence.test.ts",
        "sha256": "f624690035be93b35514b63f92991e5ad5191f88994da6a93723dfa6e1338f82"
      },
      {
        "path": "tests/self/group-prerequisites.test.ts",
        "sha256": "272b27e561c1126d9136eb012990bff708873c0d8c68699a74f2d3f498d9c1f3"
      },
      {
        "path": "tests/self/infrastructure.test.ts",
        "sha256": "e5c9750449e3d0c912a8c42769029dd71d064273c7d896f45eaf8b98df9cdbb3"
      },
      {
        "path": "tests/self/message-observation.test.ts",
        "sha256": "4657f56206fea8de2f975ec5c4099d7e0777558f16aad81e1f7a0606032fee43"
      },
      {
        "path": "tests/self/message-registry.test.ts",
        "sha256": "173443626c0b4ee05cb02d1ec936fa37673274a5b0b3d4ae49528e99d6ecc9dc"
      },
      {
        "path": "tests/self/observation.test.ts",
        "sha256": "7bdd33818f79f012ee260f4c38aed6c04271fb99e1783a5e73ef84a8aafde2d9"
      },
      {
        "path": "tests/self/preflight-execution.test.ts",
        "sha256": "4cbaae8d842dd2f6cb98cf721510ca160def3aaa4e80eb4b69eece839a57e7c4"
      },
      {
        "path": "tests/self/preflight-report.test.ts",
        "sha256": "ec6925b6f18a1245215f5bb727facf9f559d49cc802b3011b807aff610cf36de"
      },
      {
        "path": "tests/self/receipt-socket.test.ts",
        "sha256": "e5b95eb7427dd20df5569f4d1c2f98b2c25b0365265004f160896a211a9e5992"
      },
      {
        "path": "tests/self/recovery-tools.test.ts",
        "sha256": "438865585136b45fa30da1481c4e67b76d1e3131f96d63f15c19d64d7043b35c"
      },
      {
        "path": "tests/self/recovery-ws-prerequisites.test.ts",
        "sha256": "c124c1ea80a04f5ff873ba8d22a38da5f2ddfdc8b0b0703bec490f56204ba788"
      },
      {
        "path": "tests/self/runtime-observation.test.ts",
        "sha256": "98bc22df35d25d60f533c4305a5d742b093d0e0014ebfb1d359572ca6fe2157f"
      },
      {
        "path": "tests/self/runtime-registry.test.ts",
        "sha256": "43f792bfaab7780abfc2ba8581cf6798cf72eadc3f4a5350829c41a31185751d"
      },
      {
        "path": "tests/self/simulators.test.ts",
        "sha256": "50c2cc5db05f4514146fa29e53d7a8b98d02d3138cd4e67951197dcece7e5b38"
      },
      {
        "path": "tests/self/suites.test.ts",
        "sha256": "79c7f7252a3a9d0e4fec4f59f27f18348df13fb72b817d7dd60955fc05ccd181"
      },
      {
        "path": "tests/support/sequence-timeout-policy.ts",
        "sha256": "59c8745b02f362fd816e025f86daf939a77d25ceb817255ed9caae2681448b44"
      },
      {
        "path": "tests/system/agent.spec.ts",
        "sha256": "5db54d5d0de2ddba161c101d32112fa9f3c643764e02811ea3c184efbf4dc7fa"
      },
      {
        "path": "tests/system/capacity-control.spec.ts",
        "sha256": "3ece39cf11e35482bb27cd1115eb3606abce379aa6e6d83eef7ba26fa6a06ae4"
      },
      {
        "path": "tests/system/capacity.spec.ts",
        "sha256": "2bad4b9fe01ceae7b8ab46945ec3b5e1eff2900e9bec6eec69fd52d49f89c467"
      },
      {
        "path": "tests/system/fixture-boundaries.spec.ts",
        "sha256": "14bc528c07ad1b536d13324c0387af9226ba2782c67c9ef7d212f809f444a597"
      },
      {
        "path": "tests/system/integration-message-boundaries.spec.ts",
        "sha256": "dabf3cfda975c436b99eef8c689fc58c9b6b244a1fb1300b724a1f03423d8a99"
      },
      {
        "path": "tests/system/integration-message-timing.spec.ts",
        "sha256": "52c213d14cbc05b68dbbd9a5a6fafb67e4c42c78ccb284ef335b8e345e67136d"
      },
      {
        "path": "tests/system/integration-runtime.spec.ts",
        "sha256": "75448e31562b87041090a32211688f9e0ca636837e7a5ced8c0495e04df7a863"
      },
      {
        "path": "tests/system/integration-streams.spec.ts",
        "sha256": "287d0b2e76b4839e434d0b08e268c6ca983880193efe696c6fe962b378866caf"
      },
      {
        "path": "tests/system/protocol-boundaries.spec.ts",
        "sha256": "56ec359ef23e9fe05d4aaf2b80c892c7659919f1cec8fbc809f969a555cbc4af"
      },
      {
        "path": "tests/system/recovery.spec.ts",
        "sha256": "4c3d39d1ac48df9c6f46b4f4e642507fc0df838a8de8b8de2dd9df7a5a97b2e6"
      },
      {
        "path": "tests/system/sequence-failure-policy.spec.ts",
        "sha256": "c5ba9ec47e993e3862b384baf094a387b304ad9f935b5a3cc1b83242f84267f4"
      },
      {
        "path": "tests/system/sequence.spec.ts",
        "sha256": "cfcf92bbc0a3ae007ee2c20cf36fa871fe5f4c89e036f2d9e49270438f527875"
      },
      {
        "path": "tests/system/spec-boundaries.spec.ts",
        "sha256": "5a2cbf9d9d97a8400008bbd1de31cafe2de95b9e0902d9864e39cf161240059f"
      },
      {
        "path": "tests/ui/architecture.spec.ts",
        "sha256": "f258875b7d7582433e7deaee05c8e2d1172c1122319080d40947a31cb6151ea4"
      },
      {
        "path": "tests/ui/console.spec.ts",
        "sha256": "45a6ef8131a2cebf93d7e60adfcd3f75012938488b9355e237e33f2779035c67"
      },
      {
        "path": "tests/ui/directory-observer.ts",
        "sha256": "fa7f5490d86e3f4600a6b7482ce040f5045b2593ebfc278807904829d9aba27a"
      },
      {
        "path": "tests/ui/native-focus.ts",
        "sha256": "ef918c3770635466fc65b99153dac7e041e5ecd60b21eb7ef58c97a59102d617"
      },
      {
        "path": "tests/ui/observation-boundaries.spec.ts",
        "sha256": "1f7c5b3337c092da5eddbfe7f518ff41ef86d8458ec158ec5e47875da80438ec"
      },
      {
        "path": "tsconfig.json",
        "sha256": "e2464fea00f8b0217ffac5386447dc802c2ee896951b81a0e5b4adf38cf6e403"
      }
    ],
    "excluded": [
      "node_modules (package-lock hash recorded)",
      "reports",
      ".runtime",
      "test-results",
      "playwright-report",
      ".git (revision and dirty state recorded)"
    ]
  },
  "sutRevision": "86ad4e7e63786f652c965308b032b98415bdd7ac",
  "targetSha256": "963177452104bbfbd2b16cae038490dbfa9b89ea2d10bd23cd041092f894db06",
  "target": {
    "version": 1,
    "sut": {
      "cwd": "/Users/zcm/.codex/worktrees/qa-sut-remediation/kapibala",
      "revision": "86ad4e7e63786f652c965308b032b98415bdd7ac",
      "start": {
        "command": "node",
        "args": [
          "--import",
          "tsx",
          "scripts/qa-observation-server.ts"
        ]
      },
      "migrate": {
        "command": "node",
        "args": [
          "--import",
          "tsx",
          "scripts/migrate.ts"
        ]
      },
      "web": {
        "command": "npm",
        "args": [
          "exec",
          "--workspace",
          "apps/web",
          "--",
          "vite",
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          "{WEB_PORT}",
          "--strictPort"
        ]
      },
      "env": {
        "AGENT_TURN_TIMEOUT_MS": "12000"
      },
      "startupTimeoutMs": 45000
    },
    "database": {
      "image": "postgres:17-alpine"
    },
    "ui": {
      "routes": {
        "login": "/",
        "accounts": "/#/accounts",
        "groups": "/#/groups",
        "group": "/#/groups/{id}",
        "agentRun": "/#/agent-runs/{id}",
        "sequences": "/#/sequences"
      },
      "selectors": {
        "username": "input[autocomplete=\"username\"]",
        "password": "[REDACTED]",
        "login": "button.login-submit",
        "groupName": "input[aria-describedby=\"create-group-name-help\"],input[aria-describedby=\"edit-group-name-help\"]",
        "groupDescription": "textarea[aria-describedby=\"create-group-description-help\"],textarea[aria-describedby=\"edit-group-description-help\"]",
        "createGroup": ".page-header button:has-text(\"创建群组\")",
        "editProfile": "button:text-is(\"编辑资料\")",
        "saveProfile": "dialog:has(> .modal-heading > h2:text-is(\"编辑群资料\")) form button.primary",
        "confirmConflict": "dialog:has(> .modal-heading > h2:text-is(\"编辑群资料\")) form button.primary",
        "profileDialog": "dialog:has(> .modal-heading > h2:text-is(\"编辑群资料\"))",
        "closeProfile": "dialog:has(> .modal-heading > h2:text-is(\"编辑群资料\")) > .modal-heading > button[aria-label=\"关闭弹窗\"]",
        "closeCreateGroup": "dialog:has(> .modal-heading > h2:text-is(\"创建群组\")) > .modal-heading > button[aria-label=\"关闭弹窗\"]",
        "continueEditing": "button:text-is(\"继续编辑\")",
        "discardChanges": "button:text-is(\"放弃修改\")",
        "search": "input[type=\"search\"]",
        "statusFilter": ".directory-tools label:has-text(\"群状态\") select",
        "agentFilter": ".directory-tools label:has-text(\"Agent 自动应答\") select",
        "order": ".directory-tools label:has-text(\"创建时间\") select",
        "clearSearch": ".directory-tools button:text-is(\"清除搜索\")",
        "resetFilters": ".directory-tools button:text-is(\"重置条件\")",
        "refreshDirectory": ".directory-tools button:has-text(\"刷新\")",
        "directoryItem": "a[data-directory-group-id]",
        "directoryLink": "xpath=.",
        "directorySummary": ".directory-description",
        "directoryLoadedCount": ".section-heading > [aria-live=\"polite\"]",
        "directoryEmpty": ".empty:has(> strong:text-is(\"没有匹配的群\")),.empty:has(> strong:text-is(\"从第一个群组开始\"))",
        "directoryError": ".directory-empty [role=\"alert\"],.directory-page-error [role=\"alert\"],div:has(> .warning-text:text-is(\"刷新失败，当前显示上次取得的结果。\")) > [role=\"alert\"]",
        "retryDirectory": ".directory-empty [role=\"alert\"] button,.directory-page-error [role=\"alert\"] button,div:has(> .warning-text:text-is(\"刷新失败，当前显示上次取得的结果。\")) > [role=\"alert\"] button",
        "directoryStale": ".section-heading > [aria-live=\"polite\"]:has-text(\"列表待刷新\")",
        "loadMoreGroups": ".directory-load-more > button",
        "groupCreatedAt": ".group-created > time,.group-profile > div:has(> dt:text-is(\"创建时间\")) > dd",
        "groupDescriptionView": ".group-profile > div:has(> dt:text-is(\"群简介\")) > dd",
        "accountRow": "section:has(> .panel-header > h2:text-is(\"账号列表\")) tbody > tr",
        "logout": "button[aria-label=\"退出登录\"]",
        "navAccounts": "nav a[href=\"#/accounts\"]",
        "navSequences": "nav a[href=\"#/sequences\"]",
        "messageInput": "textarea[aria-label=\"消息内容\"]",
        "senderAccount": "select[aria-label=\"发送身份\"]",
        "sendMessage": "form.composer button.primary",
        "messageRow": "article[data-message-id]",
        "messageError": ".timeline [role=\"alert\"]",
        "retryMessages": ".timeline > [role=\"alert\"] button",
        "loadEarlier": ".timeline-load > button",
        "runLink": "a.run-list-item",
        "rawResponseToggle": ".raw-response > summary",
        "sequenceGroup": ".sequence-form label:has-text(\"目标群组\") > select",
        "sequence": ".sequence-form label:has-text(\"消息序列\") > select",
        "sequenceVars": "textarea[aria-describedby=\"vars-help\"]",
        "sequenceStepVars": "textarea[aria-describedby=\"step-vars-help\"]",
        "previewSequence": "form.sequence-form > button.primary",
        "startSequence": "dialog:has(> .modal-heading > h2:text-is(\"预检通过 · 确认发送内容\")) .modal-footer > button.primary",
        "sequencePreview": "dialog:has(> .modal-heading > h2:text-is(\"预检通过 · 确认发送内容\"))",
        "sequencePreviewError": "main > [role=\"alert\"]",
        "sequenceErrorStepIndex": "span:has-text(\"步缺少变量\")",
        "sequenceErrorKey": "code",
        "createSequence": ".page-header button:text-is(\"新建序列\")",
        "sequenceDefinitionInput": "dialog:has(> .modal-heading > h2:text-is(\"新建消息序列\")) textarea",
        "saveSequenceDefinition": "dialog:has(> .modal-heading > h2:text-is(\"新建消息序列\")) form button.primary",
        "sequenceDefinitionError": "dialog:has(> .modal-heading > h2:text-is(\"新建消息序列\")) [role=\"alert\"]",
        "sequenceInputError": "main > [role=\"alert\"]",
        "sequenceResourceError": "main > [role=\"alert\"]",
        "attentionConfirm": ".attention-summary button:text-is(\"确认这条更新摘要\")",
        "attentionRefresh": ".attention-notice > button",
        "attentionScopeConfirm": ".attention-summary button:text-is(\"确认当前范围更新\")",
        "attentionScopeSummary": ".attention-summary:has(button:text-is(\"确认当前范围更新\"))",
        "sequenceResourceRefresh": "main > [role=\"alert\"] button:text-is(\"重试\")"
      },
      "adapterConfirmed": true,
      "headless": false
    },
    "release": {
      "approvedProfile": null,
      "concurrentUsers": null,
      "durationSeconds": null,
      "p95LatencyMs": null,
      "maxErrorRate": null,
      "soakSeconds": null,
      "rpoSeconds": null,
      "rtoSeconds": null,
      "monitoringEvidence": null,
      "backupRestoreEvidence": null,
      "rollbackEvidence": null,
      "productionSecurityEvidence": null
    },
    "adapters": {
      "fixtureArtifacts": {
        "configPath": "config/fixtures.integration-86ad4e7.json",
        "sha256": "f9c8420f6890b76b6ef2485c7527a4035abbd94b13e9fb271d76a9d32f2d2346"
      },
      "capacityControl": {
        "url": "http://127.0.0.1:64184",
        "registryDirectory": "/private/tmp/qa-cap-6Kn0Gg",
        "contractReference": "docs/qa-remediation-final-20261001.md @ 86ad4e7e63786f652c965308b032b98415bdd7ac; QA capacity observation independent contract"
      },
      "messageObservation": {
        "url": "http://127.0.0.1:64210",
        "registryDirectory": "/private/tmp/qa-mes-7zr1un",
        "contractReference": "docs/qa-remediation-final-20261001.md @ 86ad4e7e63786f652c965308b032b98415bdd7ac; QA message observation independent contract"
      },
      "runtimeObservation": {
        "url": "http://127.0.0.1:64213",
        "registryDirectory": "/private/tmp/qa-run-n9kMPL",
        "contractReference": "docs/qa-remediation-final-20261001.md @ 86ad4e7e63786f652c965308b032b98415bdd7ac; QA runtime observation independent contract",
        "diagnostics": {
          "module": "gateway",
          "modulesPointer": "/modules",
          "namePointer": "/name",
          "statePointer": "/status",
          "consecutiveFailuresPointer": "/consecutiveFailures",
          "lastFailureAtPointer": "/lastFailedAt",
          "lastSuccessAtPointer": "/lastSucceededAt",
          "currentDurationMsPointer": "/runningForMs",
          "tickCountPointer": "/ticks",
          "states": {
            "failed": "failed",
            "running": "running",
            "healthy": "idle"
          }
        }
      }
    }
  },
  "authorization": "[REDACTED]",
  "executionApproval": {
    "scope": "developer-preflight",
    "approvedBy": "项目负责人（本会话用户）",
    "approvalReference": "2026-10-01 本会话：全权执行隔离联调、全部冒烟、正式业务验收直到当前版本报告；未解决项记入报告，不阻断独立测试；允许交研发修复并复测。",
    "approvedAt": "2026-10-01T05:55:15.000Z",
    "expiresAt": "2026-10-04T05:55:15.000Z",
    "suiteId": "qa-premise-retest-20261001",
    "suiteSha256": "96870977a6e880ccee12bb1c3f7f55cee6fda6520c0555b8f7e743e10c2bfc22",
    "targetSha256": "963177452104bbfbd2b16cae038490dbfa9b89ea2d10bd23cd041092f894db06"
  },
  "changeReview": {
    "id": "QA-IMPACT-20261001-REMEDIATION-FINAL",
    "fromRevision": "003952188a3413152d73ae77bd1cb77ed7d66d2b",
    "reviewedRevision": "86ad4e7e63786f652c965308b032b98415bdd7ac",
    "state": "assets-prepared-not-executed",
    "artifact": "requirements/remediation-final-intake-20261001.md",
    "riskReview": "requirements/integration-risk-review-20261001.md",
    "artifactSha256": "b14aed1865a8f3a39395b6186f2d534cbe202704c9395a52fbece245070f5328",
    "riskReviewSha256": "187ba6c714769454919261d23b43a092465f081f19ff5aebb228fcd38e43716a",
    "candidateRevision": "86ad4e7e63786f652c965308b032b98415bdd7ac",
    "changesOutsideAcceptanceScope": [],
    "conclusion": "已做变更影响评审；不代表场景充分性或产品通过"
  },
  "originalSha256": "c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75",
  "dependencyLockSha256": "7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883",
  "node": "v24.21.0",
  "timezone": "Asia/Shanghai",
  "qaTreeAfter": {
    "sha256": "e1cb1318cc16c2d93992d9c891eb4a4f78861247ee19c9829c45a2d1b0db90a9",
    "files": [
      {
        "path": ".gitignore",
        "sha256": "419ced137b12d10386b0c3d71d1247a2ec99e8f841b3f1e1ba28018230801ab8"
      },
      {
        "path": ".prettierrc.json",
        "sha256": "8123eeaf657f177f4617a71e78584ac602b6ca7b4fa7e1e6c24e59c2dee1a2b7"
      },
      {
        "path": "cases/architecture-capacity.json",
        "sha256": "598f7bec88b4ef0c9b286ed979e915f49f5145e4d075296a5af08d11f1f9f82e"
      },
      {
        "path": "cases/architecture-contract.json",
        "sha256": "2664fe797b4a38c81df3a7054015b2a04a2a6c5bbcea7043573dcfd41e39adb0"
      },
      {
        "path": "cases/architecture-observation.json",
        "sha256": "8ebe6cff255a6e50fe581ad6bfd3a198a26a734d2ddfd6c9c997e3fa75f343fe"
      },
      {
        "path": "cases/architecture-ui.json",
        "sha256": "bec51c6d708dc28167dd69be15505225a91915bb7428e2e9d4ddd0395c12a9a3"
      },
      {
        "path": "cases/backend.json",
        "sha256": "51d90f95de89f0d898057975732ede4b9234b9194752e3ff7880624ee12fcd6b"
      },
      {
        "path": "cases/candidates.json",
        "sha256": "4c7fa9c688cadc7a877ac2a7feae18b1f7e909db31f0460ed5c87b7827b07968"
      },
      {
        "path": "cases/extensions.json",
        "sha256": "074baa35d0bc74cc10deaf18b2964a303eca4dfe2cfd018d7352485226fa7f58"
      },
      {
        "path": "cases/fixture-boundaries.json",
        "sha256": "a1c9961d2152aa9f4cd73aacaf29f6a3e06eb00d37fbc1a85f9fd90c70887434"
      },
      {
        "path": "cases/foundation.json",
        "sha256": "ec233fc421a1fbc3269c03cf4a28890a5236b75f03ea4cf9daad3a92e9ad83b1"
      },
      {
        "path": "cases/generated/architecture-capacity.md",
        "sha256": "4b5c3dedd2a4a488a7ee61bc101b7a31a22771187e83f3ebc195524ade21d865"
      },
      {
        "path": "cases/generated/architecture-contract.md",
        "sha256": "b4724c249fe3b35b66d246c200ddfea71d48f339afa20fe72b19fd4e6bb8e2a7"
      },
      {
        "path": "cases/generated/architecture-observation.md",
        "sha256": "f70e22926b46e57ad4c09192620931b3ffe19057ace9be85098a80400520661e"
      },
      {
        "path": "cases/generated/architecture-ui.md",
        "sha256": "554d33f9804e43493326edf301fc6f4e9198cc8a54e6d0749c3f6d8c39aaa5ec"
      },
      {
        "path": "cases/generated/backend.md",
        "sha256": "ae04322e9e0e2dbce22fc8fa00d68b00fd2864ec667d4bfd674462e353b82c47"
      },
      {
        "path": "cases/generated/candidates.md",
        "sha256": "8c9392e707121c4ea7e800d24b0c3cff50f31c5f6e31080c74013007b61ac568"
      },
      {
        "path": "cases/generated/extensions.md",
        "sha256": "8b1591b8f450fe984e8f0c7d59fdf0b622c7b5573587184f80fead2e57b53b03"
      },
      {
        "path": "cases/generated/fixture-boundaries.md",
        "sha256": "b744d74442b9f5105834e2a67c919c8a3a80e2918ad36df45292ec321fa944a6"
      },
      {
        "path": "cases/generated/foundation.md",
        "sha256": "102f91ecae3b27404e554aa576a34e085cecd63d9727ab1d2b28e36c83bd7865"
      },
      {
        "path": "cases/generated/integration-diagnostics.md",
        "sha256": "355d1ea290cbb754de378f21c5b6c9e123c9a052dbfcea6c94b3fb257d131db9"
      },
      {
        "path": "cases/generated/integration-message-boundaries.md",
        "sha256": "b7bc9f399416d7006659b13c2297601839b91f94110dbd69894c4f48cdc6604f"
      },
      {
        "path": "cases/generated/integration-message-timing.md",
        "sha256": "d28ae43917e56aa0f6e3bf53385dfe19e8162b6a9257bed7da0c0cc25b1abec4"
      },
      {
        "path": "cases/generated/integration-runtime.md",
        "sha256": "ebe41032344a14a756203b47acad7fe1f8e966f3fd267ff1ff35c2cbf94f0fef"
      },
      {
        "path": "cases/generated/integration-streams.md",
        "sha256": "b56e7036cedb49c8cc63bdc1bfdd8c4bc13f9fae276cfdac220df767a9b1815a"
      },
      {
        "path": "cases/generated/manual.md",
        "sha256": "406f26b4f276afe1a8af9f3460d8d1a3d07b444e15bb5ab146bc481b42ac301b"
      },
      {
        "path": "cases/generated/protocol-boundaries.md",
        "sha256": "b510e69b193cd2b177e150400ffcb2d2a677127053d0a164469846b974ad621e"
      },
      {
        "path": "cases/generated/release.md",
        "sha256": "837b108b673cde29a511b1731b21d55d3a1d8a37bdd076a7719ea0ead63d1539"
      },
      {
        "path": "cases/generated/sequence-failure-policy.md",
        "sha256": "8c1a6c4a7387af03a65954d85bb0a92119ba9e9cf961c1d40641d95224bf423b"
      },
      {
        "path": "cases/generated/spec-boundaries.md",
        "sha256": "fdbdb1f133788378d3f1a771578503aa5a7547a8f3e4a5a10c46b5120c883080"
      },
      {
        "path": "cases/generated/ui-extra.md",
        "sha256": "febafe0515246359b9ad9edfbf9a07ea171bdfd232565d64aa338720cee164b4"
      },
      {
        "path": "cases/generated/ui.md",
        "sha256": "dd563942610d15c28bf93b848a283d856b62d235950109213c4c49db4e7700ac"
      },
      {
        "path": "cases/integration-diagnostics.json",
        "sha256": "11d29d4931c38d3a59f891e16febba15e8109bf14939b86e162a3772ce953986"
      },
      {
        "path": "cases/integration-message-boundaries.json",
        "sha256": "50d2339ddec3e5f852425e1b515fe84ca710361345cff86eac33a09fdf7dfe9b"
      },
      {
        "path": "cases/integration-message-timing.json",
        "sha256": "b982b66135a54195c98c18c06d5fea6a3101024d9b53e86ff39361e75fa51c0c"
      },
      {
        "path": "cases/integration-runtime.json",
        "sha256": "ae9560eba0779e54d607e17b98b63dc4fb8b99e521fbbc8daa0dee346e68ccba"
      },
      {
        "path": "cases/integration-streams.json",
        "sha256": "f331f8edfabada4451f6d5a1a61af6b4449e4f07b4278ae66e33d4281800c1e8"
      },
      {
        "path": "cases/manual.json",
        "sha256": "c39ae9f01a41e2668dfca386d377cac1a9ae616d4c00aea1fda736a6c2b168de"
      },
      {
        "path": "cases/protocol-boundaries.json",
        "sha256": "1568eb71e8d6ec2c443eebf540ce307ed9dc380330a20a10901755f6391a647d"
      },
      {
        "path": "cases/README.md",
        "sha256": "31e0c1e80083864ae2d6f58c5bc621291b942b07b075903ebbb11f0269247f2f"
      },
      {
        "path": "cases/release.json",
        "sha256": "222f7f0acc1e75306962898ee42d38fcc2d32edb65672a5fe16695c33bad77d5"
      },
      {
        "path": "cases/sequence-failure-policy.json",
        "sha256": "117a74dfc124e38165f7d7a900741cb53147066d1a3a0ef8c397132048884168"
      },
      {
        "path": "cases/spec-boundaries.json",
        "sha256": "5a90daa846daa1678b6bdaaf7648588cd2113c0db2864994c3d0696d6cc2bb84"
      },
      {
        "path": "cases/ui-extra.json",
        "sha256": "4d593ba7932d37b2a36076e06fc45e5cec0a0c8240a04b9aa6931c156fa300d4"
      },
      {
        "path": "cases/ui.json",
        "sha256": "7abbf1c0931846e493465b8b50ad8bb2194a3fc4606aaa4ae27ba848bbd05bea"
      },
      {
        "path": "config/authorization.example.json",
        "sha256": "730d90bffa800678a795c3f7d6b49c46ddb0eda32a411e84470996a2eabda92d"
      },
      {
        "path": "config/fixture-binding.example.json",
        "sha256": "04afa7758840d5fcce194a3ba759d0485f943af526135f14d8986e06093fa865"
      },
      {
        "path": "config/fixture-binding.integration-0af6443-startup.json",
        "sha256": "0aed2583724d574ae9a91d507196dd6683291f85d1c73587ce8ded221d2d20cc"
      },
      {
        "path": "config/fixture-binding.integration-0af6443.json",
        "sha256": "37734439d1b87063623f9a398d858d8e07234f4289a7223ac2a71bf28921a80f"
      },
      {
        "path": "config/fixture-binding.integration-86ad4e7.json",
        "sha256": "ea502d281bb9823b858dc026ab4b475ead90ebd6b256a125ed2326c10dd6f266"
      },
      {
        "path": "config/fixtures.example.json",
        "sha256": "dfe0b94771afa7fe47f2994a6e7024ae4316e48f2f613501e4669d65e2f2d7e1"
      },
      {
        "path": "config/fixtures.integration-0af6443-startup.json",
        "sha256": "46e50f4e7da54e555b788b0785a6bdcb84313928ea9a8d38e9fb7a9e3a2fdb62"
      },
      {
        "path": "config/fixtures.integration-0af6443.json",
        "sha256": "c0581223556f09b81455c5b014689d67faeaf7b3482ef533eaefb25686c92ec6"
      },
      {
        "path": "config/fixtures.integration-86ad4e7.json",
        "sha256": "f9c8420f6890b76b6ef2485c7527a4035abbd94b13e9fb271d76a9d32f2d2346"
      },
      {
        "path": "config/integration-plan-993f758.json",
        "sha256": "bc22c1206499ec7bd7238ecdd000ec7f2084664a14d6a923579dbd06fd14deca"
      },
      {
        "path": "config/manual-review.example.json",
        "sha256": "0ab5a4ff86e729179ea82bd00e6d98890a7bcacc49e659a46669aadde8f31bb8"
      },
      {
        "path": "config/preflight-authorization.example.json",
        "sha256": "4fd1a5409585e9aa42cb616212134df49d9d975ae047943712ab97c6253d5530"
      },
      {
        "path": "config/preflight-authorization.local.json",
        "sha256": "13baf6a171e4747871c3f9fc94aaaee5fd0f84d54a08fe319b58106549079db6"
      },
      {
        "path": "config/target.example.json",
        "sha256": "f0cfc7ff8cf3d372e1fa5578fa7cbdb41cb87b2082c68062b68fe1660b0475ba"
      },
      {
        "path": "config/target.integration-993f758.json",
        "sha256": "e3588fa34e3add96e200521acdc71223cb75baa44b330462dc2c62e7adaf03ca"
      },
      {
        "path": "config/ui-adapter-0af6443-retest.json",
        "sha256": "a19888556291e3bab55b7e3cdc481f89ab366a27ae80ef0188dc5c7afa1f8627"
      },
      {
        "path": "config/ui-adapter-0af6443.json",
        "sha256": "df2223cc48f1cfd8a98ab82ae96b89259156f940efe54c12f2696f863888350a"
      },
      {
        "path": "contracts/capacity-observation.md",
        "sha256": "558b585c571f77e304b507ead0e062cbeeb95b041165db0d4defe0f50c5b922c"
      },
      {
        "path": "contracts/declared-json-schema.ts",
        "sha256": "1b4e17b13ad40596e76feaa01e5e8dc199373dd093de0f8acca5c06908fe530d"
      },
      {
        "path": "contracts/fixture-artifacts.md",
        "sha256": "724d47a508a475c6d750c94a130e010a41d604545d55d2c0298c854de9374ec2"
      },
      {
        "path": "contracts/message-receipt-observation.md",
        "sha256": "b8fe423b10ab038cfb9100fa82938c2af28302d461d18ebd73a4071bdd7b122e"
      },
      {
        "path": "contracts/public-api.ts",
        "sha256": "85d5069b89869e9aff6a6ba3e64b913630f810e32783aac3e2ff8a43e3bc84a2"
      },
      {
        "path": "contracts/runtime-observation.md",
        "sha256": "29cbae987899132603201fdba9874a752d0f5237a2ab7cbb8d15cad7d88497e3"
      },
      {
        "path": "contracts/simulator.md",
        "sha256": "1c7f64df8b0c1528c6dc80c573b7e1865e5bb2f6e1d160950ab647614a1eb971"
      },
      {
        "path": "fixtures/20261001-0af6443/directory-precision.json",
        "sha256": "c0b6a9b11663343673af60994fb3bcf0261a573f2f8c5cdc6b1bb63e6d1cef11"
      },
      {
        "path": "fixtures/20261001-0af6443/legacy-schema.json",
        "sha256": "2d6a383ea0d22a30c2dc1157b9261a513c4a20729297b967ff85c4bcff4fad36"
      },
      {
        "path": "fixtures/20261001-0af6443/legacy.dump",
        "sha256": "24f49db6ecfb7cf54e614d6d00a3e9f77e7ade2f5dfd040ba31bb7550990cb4f"
      },
      {
        "path": "fixtures/20261001-0af6443/precision.dump",
        "sha256": "0554319ab7ad4483f0a03fcb78416168267a0cd46ecf77b3a204cdea7e23ea38"
      },
      {
        "path": "fixtures/20261001-86ad4e7/directory-precision.json",
        "sha256": "b74456924618450e6471d054fb4b9a793664d1304f8a9277760dcbc582d98add"
      },
      {
        "path": "fixtures/20261001-86ad4e7/legacy-schema.json",
        "sha256": "93985edc23351de52aa79c99015d02d67f862a1de507f57704b2a268f7a2f846"
      },
      {
        "path": "harness/agent.ts",
        "sha256": "d9906d9fa9da3884cc8390e1b028fab525ae7e7a66d3bac3238d715a344b036b"
      },
      {
        "path": "harness/barrier.ts",
        "sha256": "3c7b7636bc2c8488bc28a4bd7068171a521d71ac0c256c938a65c8f022b4b177"
      },
      {
        "path": "harness/business-scope.ts",
        "sha256": "f11522b38606b2965e8158d1d4f66ebea58dbc9092afebb243d304ebf2e49fa8"
      },
      {
        "path": "harness/capacity-control.ts",
        "sha256": "c231c8002ac55c7e9f72eb62104569f8d306e1b70b60f2c3addc1744d3b929e4"
      },
      {
        "path": "harness/capacity-probe.ts",
        "sha256": "74cfdc37ca6b66d81e2d4b2397c8a3fbfd4de968a1195818403da646e85dc958"
      },
      {
        "path": "harness/catalog-check.ts",
        "sha256": "239e57aa09c2e95162cedc2bdc4a86e5b7298a634d6951c45257a785dc5fe434"
      },
      {
        "path": "harness/catalog.ts",
        "sha256": "5001a2b1172cb4b8f07ca5ef80f22ea752b47a9a7ac0b6920f5ccadc5ca35411"
      },
      {
        "path": "harness/change-review-check.ts",
        "sha256": "5458c44daf92dc9806d836a2e63ab75e0ab31502d85b552e8fd52ddf63735950"
      },
      {
        "path": "harness/change-review.ts",
        "sha256": "866bb98382624aedb931e01b0547830a87b26a941082e20b9fcd44a1651e4316"
      },
      {
        "path": "harness/cli.ts",
        "sha256": "2efc746529d1d38e4234a53bd18b4bcb648f4bbc3b1fac0b81b6bab33efef743"
      },
      {
        "path": "harness/database.ts",
        "sha256": "d0f69b102bcc9c792ba5c395792b5be18a4ec3e783498c511d267987c3dd6bcb"
      },
      {
        "path": "harness/environment.ts",
        "sha256": "9e84c047bfd704352a5c605bdf02c92f4b4a365fcc9d06a36cf592097055660a"
      },
      {
        "path": "harness/execution-gate.ts",
        "sha256": "f9975961f0667a65f0ffb2370326dfb6d86b26eac62509886944379cf6563932"
      },
      {
        "path": "harness/execution-plan.ts",
        "sha256": "6422c9768170aa8e51d31c75a97162acd2b7c8408990d5c7c09ed33c4a8d1549"
      },
      {
        "path": "harness/fixture-artifacts.ts",
        "sha256": "96a05c3b9b021a75e043bcd7056d82420d80c21a309e5e96d5467ef91f2143fe"
      },
      {
        "path": "harness/gateway.ts",
        "sha256": "966292c0866702435f147834988fd5f444143e0be7d03157603f52a2805d1077"
      },
      {
        "path": "harness/http-server.ts",
        "sha256": "c4f5b6a80b79f3f88dec987fe133558def705ec6e065c53fa956f64af932c07d"
      },
      {
        "path": "harness/manual.ts",
        "sha256": "e197c71216e4b181241185a5e4eb43a00180ab8fafdebe187038f02324b2ae9d"
      },
      {
        "path": "harness/message-observation.ts",
        "sha256": "32e6f16c3a110af7bf100d2f6a56d8c29260f690dc23d9bb49991f523e196743"
      },
      {
        "path": "harness/network.ts",
        "sha256": "be935118cc6b719ff340a8a04355d7ca6fd64175189c1b6368a2fff941090030"
      },
      {
        "path": "harness/observation.ts",
        "sha256": "8fc04d7fffc3bfb023d77368cb1979a17331322f25d6dc6b7498080079fe27b8"
      },
      {
        "path": "harness/platform-client.ts",
        "sha256": "fc14a9420981cf046ac015f31f25b9c657d71bfe2bafc99aa79939a8df404c23"
      },
      {
        "path": "harness/process.ts",
        "sha256": "e0047da7d54a2b7f2a8e9055e2b21f49b7e1d655b268c101b6d7758cb072ee0e"
      },
      {
        "path": "harness/provenance.ts",
        "sha256": "10e3661ba876c9ba9ee490e36784e69b61f1b9a9c09f646a6931de1c7781a342"
      },
      {
        "path": "harness/receipt-socket.ts",
        "sha256": "59006a0e0184d4721eb6d126e620ffcc14791dd893bdb2487cae1f10f2811680"
      },
      {
        "path": "harness/recovery-drill.ts",
        "sha256": "07dfbc2db5f9842edcfcba7d3ceae7e7520d8c3d682bac71fc9895fc92189f2e"
      },
      {
        "path": "harness/render-cases.ts",
        "sha256": "b83e78b005aabe2cd2f9a45c394d10e5ef0b1009f0b3ddd1e97d1e365c830dd7"
      },
      {
        "path": "harness/report.ts",
        "sha256": "5db1991ee0c25a000ca1333209c432e844f100340be08dc46c45b92fbac61f8f"
      },
      {
        "path": "harness/reporter.ts",
        "sha256": "9cd59b41071aedae085b46bea8c0c46b69ce04efc2e7c7589d02d541fc6f7794"
      },
      {
        "path": "harness/runtime-observation.ts",
        "sha256": "f161589e5c8ff93e73bece0458e61c3f73f01f4d60b0696c8c0d71d5826afe99"
      },
      {
        "path": "harness/security.ts",
        "sha256": "d355b4da7fbd5f57c21a0f55cd2e714274a27260b199a077ccbf4342f21a4e13"
      },
      {
        "path": "harness/suites-check.ts",
        "sha256": "ee03bf05a199bb826f9b61ac890d1302e14db0debde21bf252bc5757346393c6"
      },
      {
        "path": "harness/suites.ts",
        "sha256": "b85ed0a9097060f7f2ff240e8013f14925874963f30c7b8a074871f38dec4735"
      },
      {
        "path": "harness/types.ts",
        "sha256": "f41ee7934a39babd25300e25522783ad6ea43658650d68a56c768dbab1e54eb3"
      },
      {
        "path": "harness/verify-tools.ts",
        "sha256": "d269ffa546bc2c477f870491c198ede53a925cb4b73f46779399970805dafb96"
      },
      {
        "path": "package-lock.json",
        "sha256": "7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883"
      },
      {
        "path": "package.json",
        "sha256": "6d8de82b1cd439f839c69a3e472b8ca253836eeca7bd4fd4e3a1b3bbf7af764b"
      },
      {
        "path": "playwright.config.ts",
        "sha256": "4a063f59db9037042c62f6e4df550e53972db3edf9a5923a06a4304df84c245e"
      },
      {
        "path": "README.md",
        "sha256": "d2a502876545e9cf4ae2e73c533721c5bc6830888f06deb27ff6fef1c406be52"
      },
      {
        "path": "requirements/architecture-impact.md",
        "sha256": "8be2e077a3d5c68cd4067fb689f241fffcd816f69dcf404388abebf6a4e57477"
      },
      {
        "path": "requirements/baseline.json",
        "sha256": "fc909783677cd54cde10f71a4aab80a467312f4f46e593ff0ffd285b86a17d82"
      },
      {
        "path": "requirements/blocker-reassessment.md",
        "sha256": "f2c901aa22aaa72448673245574ff06f5a591ab9f5ddf74d444761c4e92e7404"
      },
      {
        "path": "requirements/catalog.json",
        "sha256": "07689a14f445f1bf5b3c92ad0fe3a55094b6b97ebe99c39e60dcd0a3aaa4fce6"
      },
      {
        "path": "requirements/change-reviews.json",
        "sha256": "7352464f67203aa0f03ff42aef314ff8453c58e344e82830646a8cc7c0cb9f06"
      },
      {
        "path": "requirements/clarifications.md",
        "sha256": "805cb9d65a139a0520496680a306aa1d10ff34d7f97956111b7e177b5ad86b32"
      },
      {
        "path": "requirements/collaboration.md",
        "sha256": "5bd518dda0c35fe037aafa9c26a57cf97cd44cf0ad434ecdbc8f2f38d0022073"
      },
      {
        "path": "requirements/coverage.md",
        "sha256": "202ce9cb58785950a909189c9ddd5d37df323b189c972b38fc19228f70d2b363"
      },
      {
        "path": "requirements/engineering-candidate-intake-20261001.md",
        "sha256": "89a4056f807ff750a847c5ea9bed9cc365de9f982cf6f28e4f02a7cd5e992e47"
      },
      {
        "path": "requirements/integration-intake-20261001.md",
        "sha256": "8b05f6133bcab992480d26cd71c7fa5230051c1965794959cf1dbcabd23b01a2"
      },
      {
        "path": "requirements/integration-risk-review-20261001.md",
        "sha256": "187ba6c714769454919261d23b43a092465f081f19ff5aebb228fcd38e43716a"
      },
      {
        "path": "requirements/left-members-decision.md",
        "sha256": "691a8f1445ad7a93bd5ca88085b9a64ec3ba6aae9cbb1e598cab583e9101af20"
      },
      {
        "path": "requirements/next-integration-preparation-20261001.md",
        "sha256": "40eeb2640d7f16e0d1ee4967fb9d07e8cf6e95b71d026296f8208b8c3a036b8a"
      },
      {
        "path": "requirements/qa-correction-auxiliary-startup-20261001.md",
        "sha256": "63a5516443d039753778db68f6aa203c1d2291ba06cc70575001c85c7c10351e"
      },
      {
        "path": "requirements/qa-correction-browser-adapter-20261001.md",
        "sha256": "659a48f7cbaaf018ed7a047c2885fd8088ff5ecca40309c94eb30ce82c625f4d"
      },
      {
        "path": "requirements/qa-correction-capacity-cancellation-20261001.md",
        "sha256": "b0f7ec8acfe272e6f09b718cdcf194b0caf2654421b8330b3dfdb4403f987746"
      },
      {
        "path": "requirements/qa-correction-directory-premises-20261001.md",
        "sha256": "0ef2b6c42d24167b240f38a69b358e4b0c46676b7e0aefc82c681616c55a9fe5"
      },
      {
        "path": "requirements/qa-correction-group-prerequisites-20261001.md",
        "sha256": "9dc7877d0cdbe3400a6266766dd9c7b482dc94237e93de5e20c003e52218d63b"
      },
      {
        "path": "requirements/qa-correction-pagination-reference-20261001.md",
        "sha256": "20e6f0bd5a9da66ed85b059967ef0b7be9b230cc881b21135f724997ed63c5bd"
      },
      {
        "path": "requirements/qa-correction-recovery-ws-20261001.md",
        "sha256": "34f36103ea8105ee34927e3aab55edd0f4dcbfb7e40c9b49814127bcd631d6a7"
      },
      {
        "path": "requirements/qa-correction-sequence-failed-sent-at-20261001.md",
        "sha256": "f99d7ba7e18c617396c8b7971ef8e17c7d78edb5dfc85b7485216f4fd99550a8"
      },
      {
        "path": "requirements/qa-correction-spec006-schema-dialect-20261001.md",
        "sha256": "bdda2e2c849a718729af6b3d8599b28bcf56b68bbd473c0ba8891efb874057ba"
      },
      {
        "path": "requirements/qa-correction-ui-concurrency-pagination-20261001.md",
        "sha256": "896d04635de34e2f3bce591e0f1178de3f49b9f9715dd21043c21973493e95a4"
      },
      {
        "path": "requirements/release-gates.md",
        "sha256": "0757bbe778819225ca5106cade3bd13ae70e2458dfe5ea2d3501682771f19a40"
      },
      {
        "path": "requirements/remediation-batch1-intake-20261001.md",
        "sha256": "f5a3687ca45be6dfa68c9f35c4666826bd1c9dc404f22329bd807e8f19b17154"
      },
      {
        "path": "requirements/remediation-final-intake-20261001.md",
        "sha256": "b14aed1865a8f3a39395b6186f2d534cbe202704c9395a52fbece245070f5328"
      },
      {
        "path": "requirements/risk-coverage-review.md",
        "sha256": "1f58a3f5e8d50779ac70073d1073a851a037298c75d7fbedeb00d0d9223f1c88"
      },
      {
        "path": "requirements/sequence-failure-policy.md",
        "sha256": "7198bf020dda26110e7104e5fc9d963695911c4e86b9adeafbd38c4ca8afb105"
      },
      {
        "path": "requirements/spec-boundaries-resolution.md",
        "sha256": "82de0ec1595d600033cd3a4661a89f6b508fa3067a3d823b7735334baab8e262"
      },
      {
        "path": "requirements/traceability.md",
        "sha256": "21968897bc010b9a521fa2edacc7475c2a1a47856312615c7077b9d1ec8f27bf"
      },
      {
        "path": "requirements/utf16-remediation-intake-20261001.md",
        "sha256": "8c088708428f03c417a41b1dd09cda61f164ec191102f45a6e34eb815b09b2be"
      },
      {
        "path": "sharing/business-acceptance.md",
        "sha256": "e75ed41093e23ad6d481e0e0397d1ab2db889cb10a3f333ac942b8ad87407a70"
      },
      {
        "path": "sharing/README.md",
        "sha256": "6c90def8d1a51642a42bd2460635e57abfd0c9c6cf75aa212d49374b58403ee8"
      },
      {
        "path": "sharing/suites.json",
        "sha256": "aef73c072699cb44f4d0965a2b1477f57efcf886058401bc69ecbb7ff34fa6df"
      },
      {
        "path": "tests/api/accounts.spec.ts",
        "sha256": "0dd82760e6733f5bd43cf3dd31b5706b7547048a4e4f83c2f4a29094a0ce88b1"
      },
      {
        "path": "tests/api/auth.spec.ts",
        "sha256": "ac579fe93a50e2f68c03b2102bdb3ba5511ca785aab77844b60952ff31b6dc0e"
      },
      {
        "path": "tests/api/diagnostics.spec.ts",
        "sha256": "64f802e0952b3ab65924a012c48e43d85a49953a1c868ed151999ec1f0d509f0"
      },
      {
        "path": "tests/api/groups.spec.ts",
        "sha256": "7d995ba75ecce1cdda2f881b1a8946c3c46aa4b9990e0626de90bb15d704190e"
      },
      {
        "path": "tests/api/messages.spec.ts",
        "sha256": "d034ca319f4862fcbaf1a53b33487d7bb2a01f273c637531d13348001df617af"
      },
      {
        "path": "tests/api/realtime.spec.ts",
        "sha256": "9ec54083fb257fe2de805ec803943ad93aaf4ade0526244841f7355fb38d3a37"
      },
      {
        "path": "tests/api/sequence-contracts.spec.ts",
        "sha256": "82ccf634ea4b37fda481766773e66e6e899ae11f055b4d0a8bfe6d329cd8d5c7"
      },
      {
        "path": "tests/extensions/api.spec.ts",
        "sha256": "0f67b5af5b25803ce679128f38adf48392799b61f75abc8588e6886d66e974a3"
      },
      {
        "path": "tests/fixtures.ts",
        "sha256": "db89ae4a3c75848f832fb1d911a8fb01c36ca6b13c9fc26a6be87c59e3e3d7e1"
      },
      {
        "path": "tests/foundation/contracts.spec.ts",
        "sha256": "0990ad89aa348469accfa1a00ca1dc55bda4b8edc7a5c1f04eb55c5f4f94f2c4"
      },
      {
        "path": "tests/foundation/startup.spec.ts",
        "sha256": "f1ad6daff9c215aa7d8692ba492c4799e64e7dbc03c41a1ad00da9d259574238"
      },
      {
        "path": "tests/release/operations.spec.ts",
        "sha256": "418ce615bb184bcdc0ee461354a8adce44c8dd726e288e9232effef67aff293b"
      },
      {
        "path": "tests/self/authorization-projects.test.ts",
        "sha256": "6ad27adc0a265270cd73a9fb8db2ae8310bec55b97e284bb9a9e063980fd5491"
      },
      {
        "path": "tests/self/auxiliary-startup.test.ts",
        "sha256": "c8354461071868b13572dd2167747e3ca219d22adcfd01ccae7e62b40c22d84e"
      },
      {
        "path": "tests/self/business-acceptance.test.ts",
        "sha256": "a7336707d53e2e85a7ee67f2346ec7005f2495b255048360e2c8c2f63ec4e72f"
      },
      {
        "path": "tests/self/capacity-control.test.ts",
        "sha256": "11d5e0c6cf9836d25ffa348bd12ece0f3cb693bef7e5cf67f8cb18ca1a7076aa"
      },
      {
        "path": "tests/self/capacity-prerequisites.test.ts",
        "sha256": "8280cedaf87aded2b0b05b08b9a7d86d896b038c36419faa8eafc93b4c028b15"
      },
      {
        "path": "tests/self/capacity-registry.test.ts",
        "sha256": "36013d1d75dbd4ade6f9347c9a1683578a6a37670c8d962be8b173fb4b560cbc"
      },
      {
        "path": "tests/self/change-review.test.ts",
        "sha256": "66d74355d476cca2f5a5abb17d5108c5e4e824f39b81f3df1c3517f70b5e8010"
      },
      {
        "path": "tests/self/contracts.test.ts",
        "sha256": "19ac7aab7fc096f22557a87384838d8012b62180366c17d5e65e6e96880149b0"
      },
      {
        "path": "tests/self/database-cleanup.test.ts",
        "sha256": "c725b5aa17a7b6e5909e1cbc7947947c2030e915060a22b5f2387bec8a9b524b"
      },
      {
        "path": "tests/self/declared-json-schema.test.ts",
        "sha256": "d0673beea17761fcc086a7b0ece99ded5f867d7c8b24d01a8822f57f9ffadf4a"
      },
      {
        "path": "tests/self/directory-observer.test.ts",
        "sha256": "2b050d8a34d66828e190404ef65f0b30b5421f5b38dc312e86ca46bbb7fc656d"
      },
      {
        "path": "tests/self/fixture-artifacts.test.ts",
        "sha256": "6ffbf445060266b2e04d4f84dde140c94dc809119fd97794bfda408dcb597301"
      },
      {
        "path": "tests/self/gateway-timing-evidence.test.ts",
        "sha256": "f624690035be93b35514b63f92991e5ad5191f88994da6a93723dfa6e1338f82"
      },
      {
        "path": "tests/self/group-prerequisites.test.ts",
        "sha256": "272b27e561c1126d9136eb012990bff708873c0d8c68699a74f2d3f498d9c1f3"
      },
      {
        "path": "tests/self/infrastructure.test.ts",
        "sha256": "e5c9750449e3d0c912a8c42769029dd71d064273c7d896f45eaf8b98df9cdbb3"
      },
      {
        "path": "tests/self/message-observation.test.ts",
        "sha256": "4657f56206fea8de2f975ec5c4099d7e0777558f16aad81e1f7a0606032fee43"
      },
      {
        "path": "tests/self/message-registry.test.ts",
        "sha256": "173443626c0b4ee05cb02d1ec936fa37673274a5b0b3d4ae49528e99d6ecc9dc"
      },
      {
        "path": "tests/self/observation.test.ts",
        "sha256": "7bdd33818f79f012ee260f4c38aed6c04271fb99e1783a5e73ef84a8aafde2d9"
      },
      {
        "path": "tests/self/preflight-execution.test.ts",
        "sha256": "4cbaae8d842dd2f6cb98cf721510ca160def3aaa4e80eb4b69eece839a57e7c4"
      },
      {
        "path": "tests/self/preflight-report.test.ts",
        "sha256": "ec6925b6f18a1245215f5bb727facf9f559d49cc802b3011b807aff610cf36de"
      },
      {
        "path": "tests/self/receipt-socket.test.ts",
        "sha256": "e5b95eb7427dd20df5569f4d1c2f98b2c25b0365265004f160896a211a9e5992"
      },
      {
        "path": "tests/self/recovery-tools.test.ts",
        "sha256": "438865585136b45fa30da1481c4e67b76d1e3131f96d63f15c19d64d7043b35c"
      },
      {
        "path": "tests/self/recovery-ws-prerequisites.test.ts",
        "sha256": "c124c1ea80a04f5ff873ba8d22a38da5f2ddfdc8b0b0703bec490f56204ba788"
      },
      {
        "path": "tests/self/runtime-observation.test.ts",
        "sha256": "98bc22df35d25d60f533c4305a5d742b093d0e0014ebfb1d359572ca6fe2157f"
      },
      {
        "path": "tests/self/runtime-registry.test.ts",
        "sha256": "43f792bfaab7780abfc2ba8581cf6798cf72eadc3f4a5350829c41a31185751d"
      },
      {
        "path": "tests/self/simulators.test.ts",
        "sha256": "50c2cc5db05f4514146fa29e53d7a8b98d02d3138cd4e67951197dcece7e5b38"
      },
      {
        "path": "tests/self/suites.test.ts",
        "sha256": "79c7f7252a3a9d0e4fec4f59f27f18348df13fb72b817d7dd60955fc05ccd181"
      },
      {
        "path": "tests/support/sequence-timeout-policy.ts",
        "sha256": "59c8745b02f362fd816e025f86daf939a77d25ceb817255ed9caae2681448b44"
      },
      {
        "path": "tests/system/agent.spec.ts",
        "sha256": "5db54d5d0de2ddba161c101d32112fa9f3c643764e02811ea3c184efbf4dc7fa"
      },
      {
        "path": "tests/system/capacity-control.spec.ts",
        "sha256": "3ece39cf11e35482bb27cd1115eb3606abce379aa6e6d83eef7ba26fa6a06ae4"
      },
      {
        "path": "tests/system/capacity.spec.ts",
        "sha256": "2bad4b9fe01ceae7b8ab46945ec3b5e1eff2900e9bec6eec69fd52d49f89c467"
      },
      {
        "path": "tests/system/fixture-boundaries.spec.ts",
        "sha256": "14bc528c07ad1b536d13324c0387af9226ba2782c67c9ef7d212f809f444a597"
      },
      {
        "path": "tests/system/integration-message-boundaries.spec.ts",
        "sha256": "dabf3cfda975c436b99eef8c689fc58c9b6b244a1fb1300b724a1f03423d8a99"
      },
      {
        "path": "tests/system/integration-message-timing.spec.ts",
        "sha256": "52c213d14cbc05b68dbbd9a5a6fafb67e4c42c78ccb284ef335b8e345e67136d"
      },
      {
        "path": "tests/system/integration-runtime.spec.ts",
        "sha256": "75448e31562b87041090a32211688f9e0ca636837e7a5ced8c0495e04df7a863"
      },
      {
        "path": "tests/system/integration-streams.spec.ts",
        "sha256": "287d0b2e76b4839e434d0b08e268c6ca983880193efe696c6fe962b378866caf"
      },
      {
        "path": "tests/system/protocol-boundaries.spec.ts",
        "sha256": "56ec359ef23e9fe05d4aaf2b80c892c7659919f1cec8fbc809f969a555cbc4af"
      },
      {
        "path": "tests/system/recovery.spec.ts",
        "sha256": "4c3d39d1ac48df9c6f46b4f4e642507fc0df838a8de8b8de2dd9df7a5a97b2e6"
      },
      {
        "path": "tests/system/sequence-failure-policy.spec.ts",
        "sha256": "c5ba9ec47e993e3862b384baf094a387b304ad9f935b5a3cc1b83242f84267f4"
      },
      {
        "path": "tests/system/sequence.spec.ts",
        "sha256": "cfcf92bbc0a3ae007ee2c20cf36fa871fe5f4c89e036f2d9e49270438f527875"
      },
      {
        "path": "tests/system/spec-boundaries.spec.ts",
        "sha256": "5a2cbf9d9d97a8400008bbd1de31cafe2de95b9e0902d9864e39cf161240059f"
      },
      {
        "path": "tests/ui/architecture.spec.ts",
        "sha256": "f258875b7d7582433e7deaee05c8e2d1172c1122319080d40947a31cb6151ea4"
      },
      {
        "path": "tests/ui/console.spec.ts",
        "sha256": "45a6ef8131a2cebf93d7e60adfcd3f75012938488b9355e237e33f2779035c67"
      },
      {
        "path": "tests/ui/directory-observer.ts",
        "sha256": "fa7f5490d86e3f4600a6b7482ce040f5045b2593ebfc278807904829d9aba27a"
      },
      {
        "path": "tests/ui/native-focus.ts",
        "sha256": "ef918c3770635466fc65b99153dac7e041e5ecd60b21eb7ef58c97a59102d617"
      },
      {
        "path": "tests/ui/observation-boundaries.spec.ts",
        "sha256": "1f7c5b3337c092da5eddbfe7f518ff41ef86d8458ec158ec5e47875da80438ec"
      },
      {
        "path": "tsconfig.json",
        "sha256": "e2464fea00f8b0217ffac5386447dc802c2ee896951b81a0e5b4adf38cf6e403"
      }
    ],
    "excluded": [
      "node_modules (package-lock hash recorded)",
      "reports",
      ".runtime",
      "test-results",
      "playwright-report",
      ".git (revision and dirty state recorded)"
    ]
  },
  "runnerStatus": "failed",
  "runnerErrors": []
}
```

## 逐项结果

|用例|需求|结果|说明|证据|
|---|---|---|---|---|
|CAP-REG-001 不同群同名目标的重叠 kick 保持各自审计、步骤和副作用唯一|R-A5-01, R-A5-07, R-A5-08, R-A5-09|NOT_RUN|尚未执行||
|CAP-REG-002 审计等待期间关闭 autoKick 后不得继续派发|R-A5-07, R-A5-09|NOT_RUN|尚未执行||
|CAP-REG-003 审计等待后重新检查执行账号在线状态|R-A5-07, R-A5-08|NOT_RUN|尚未执行||
|CAP-REG-004 审计等待后成员身份和管理员角色均重新检查|R-A5-07, R-A5-08|NOT_RUN|尚未执行||
|CAP-001 确证容量拒绝后零远端且释放后同一步只审计/踢人一次|ENG-ADMISSION-01, R-A5-05, R-A5-07, R-A5-09|NOT_RUN|尚未执行||
|CAP-002 容量拒绝后关闭 Agent，原当前步完成后取消且无后续工作|ENG-ADMISSION-01, R-A5-13|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/system-capacity-control--C-3baf2-ish-and-prevents-later-work-system/evidence)|
|CAP-003 持续容量拒绝计入原 60 秒活动预算|ENG-ADMISSION-01, R-A5-05, R-A5-06|NOT_RUN|尚未执行||
|CAP-004 容量等待期间关闭踢人政策再次检查|ENG-ADMISSION-01, R-A5-07, R-A5-09|NOT_RUN|尚未执行||
|CAP-005 容量等待期间群变不可写阻止迟发踢人|ENG-ADMISSION-01, R-A2-11, R-A5-13|BLOCKED|BlockedError: [BLOCKED] 有限观察内未建立真实GROUP_WRITE_FORBIDDEN消息及群不可写前提；不能由群主终态推导|[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/system-capacity-control--C-5c31e-cancels-without-a-late-kick-system/evidence) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/system-capacity-control--C-5c31e-cancels-without-a-late-kick-system/error-context.md) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/system-capacity-control--C-5c31e-cancels-without-a-late-kick-system/trace.zip)|
|CAP-006 容量等待后在线、成员与管理员资格复核|ENG-ADMISSION-01, R-A1-04, R-A5-08|NOT_RUN|尚未执行||
|CAP-007 容量等待中目标退出或重新加入后按同一用户身份完成移除且不重复|ENG-ADMISSION-01, R-A5-09, R-A5-11|NOT_RUN|尚未执行||
|CAP-008 容量延期后真实网关群主或权限错误仍按原业务契约返回|ENG-ADMISSION-01, R-A5-09|NOT_RUN|尚未执行||
|CAP-009 容量已拒绝但 ready 持久化之前崩溃的恢复|ENG-ADMISSION-01, R-A5-11|NOT_RUN|尚未执行||
|CAP-010 已派发且2秒内收敛的504踢人遇容量压力不退回重放|ENG-ADMISSION-01, R-A5-09, R-A5-11|NOT_RUN|尚未执行||
|ARC-API-001 序列定义的独立严格输入矩阵|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-API-002 序列启动的键类型边界与失败后可重试|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-API-003 序列启动缺省变量对象兼容|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-UI-BLK-001 通用资源读取失败不能提交成功快照或提前确认未呈现提醒|ENG-READ-02, ADD-ATT-03|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-observation-boundaries--d3e18-001-通用账号资源读取失败不能提前确认未呈现的新状态-chromium/attachments/resource-observation-final-0df5ac8f45ecfdf89d1c17710c0b4c654aa278dd.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-observation-boundaries--d3e18-001-通用账号资源读取失败不能提前确认未呈现的新状态-chromium/evidence)|
|ARC-UI-001 序列定义额外字段明确拒绝而非静默剥离|ENG-CONTRACT-01|NOT_RUN|尚未执行||
|ARC-UI-002 非连续或重复步号在浏览器阻止提交|ENG-CONTRACT-01|NOT_RUN|尚未执行||
|ARC-UI-003 已登记序列尺寸边界在浏览器明确拒绝|ENG-CONTRACT-01|NOT_RUN|尚未执行||
|ARC-UI-004 vars和stepVars非法键值不发预检或启动请求|ENG-CONTRACT-01|NOT_RUN|尚未执行||
|ARC-UI-005 合法序列一次保存并保留公开输入行为|ENG-CONTRACT-01|NOT_RUN|尚未执行||
|ARC-UI-006 序列写请求503失败不自动重放|ENG-READ-02|NOT_RUN|尚未执行||
|ARC-UI-007 无后续事件或轮询时两次503后自动呈现|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-008 权限403不形成资源请求风暴|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-009 429不无视限流进行通用重试|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-010 请求校验400不自动重试|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-011 成功HTTP的非法响应格式不按502临时错误重试|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-012 持续暂时失败耗尽后停止自动读取|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-013 切页取消旧读取及后续退避|ENG-READ-02|NOT_RUN|尚未执行||
|ARC-UI-014 换身份期间旧读取迟到不能覆盖新会话|ENG-READ-02|NOT_RUN|尚未执行||
|ARC-UI-015 耗尽后显式同页刷新可开始新一轮|ENG-READ-01|NOT_RUN|尚未执行||
|ARC-UI-016 错误后离页取消退避期间的后续读取|ENG-READ-02|NOT_RUN|尚未执行||
|ARC-UI-017 在途读取期间多个实时失效合并且不能延长失败预算|ENG-READ-02|NOT_RUN|尚未执行||
|ARC-UI-018 网络失败及其他已登记暂时HTTP错误均可自动恢复|ENG-READ-01|NOT_RUN|尚未执行||
|STATE-11 state transition idle to idle|R-A1-01|NOT_RUN|尚未执行||
|STATE-12 state transition idle to online|R-A1-01|NOT_RUN|尚未执行||
|STATE-13 state transition idle to rate_limited|R-A1-01|NOT_RUN|尚未执行||
|STATE-14 state transition idle to disconnected|R-A1-01|NOT_RUN|尚未执行||
|STATE-15 state transition idle to suspended|R-A1-01|NOT_RUN|尚未执行||
|STATE-16 state transition idle to session_expired|R-A1-01|NOT_RUN|尚未执行||
|STATE-21 state transition online to idle|R-A1-01|NOT_RUN|尚未执行||
|STATE-22 state transition online to online|R-A1-01|NOT_RUN|尚未执行||
|STATE-23 state transition online to rate_limited|R-A1-01|NOT_RUN|尚未执行||
|STATE-24 state transition online to disconnected|R-A1-01|NOT_RUN|尚未执行||
|STATE-25 state transition online to suspended|R-A1-01|NOT_RUN|尚未执行||
|STATE-26 state transition online to session_expired|R-A1-01|NOT_RUN|尚未执行||
|STATE-31 state transition rate_limited to idle|R-A1-01|NOT_RUN|尚未执行||
|STATE-32 state transition rate_limited to online|R-A1-01|NOT_RUN|尚未执行||
|STATE-33 state transition rate_limited to rate_limited|R-A1-01|NOT_RUN|尚未执行||
|STATE-34 state transition rate_limited to disconnected|R-A1-01|NOT_RUN|尚未执行||
|STATE-35 state transition rate_limited to suspended|R-A1-01|NOT_RUN|尚未执行||
|STATE-36 state transition rate_limited to session_expired|R-A1-01|NOT_RUN|尚未执行||
|STATE-41 state transition disconnected to idle|R-A1-01|NOT_RUN|尚未执行||
|STATE-42 state transition disconnected to online|R-A1-01|NOT_RUN|尚未执行||
|STATE-43 state transition disconnected to rate_limited|R-A1-01|NOT_RUN|尚未执行||
|STATE-44 state transition disconnected to disconnected|R-A1-01|NOT_RUN|尚未执行||
|STATE-45 state transition disconnected to suspended|R-A1-01|NOT_RUN|尚未执行||
|STATE-46 state transition disconnected to session_expired|R-A1-01|NOT_RUN|尚未执行||
|STATE-51 state transition suspended to idle|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-52 state transition suspended to online|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-53 state transition suspended to rate_limited|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-54 state transition suspended to disconnected|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-55 state transition suspended to suspended|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-56 state transition suspended to session_expired|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-61 state transition session_expired to idle|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-62 state transition session_expired to online|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-63 state transition session_expired to rate_limited|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-64 state transition session_expired to disconnected|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-65 state transition session_expired to suspended|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-66 state transition session_expired to session_expired|R-A1-01, R-A1-02|NOT_RUN|尚未执行||
|STATE-041 validation precedence and stale expectedFrom are explicit|R-A1-03, R-A0-03|NOT_RUN|尚未执行||
|STATE-042 concurrent compare-and-swap has one winner|R-A1-03|NOT_RUN|尚未执行||
|STATE-043 reconnect retains stable gateway identity|R-A1-07, R-A1-08|NOT_RUN|尚未执行||
|STATE-044 repeated suspended events preserve processing and cannot reconnect|R-A1-02, R-A1-04, R-A2-08|NOT_RUN|尚未执行||
|STATE-045 repeated session_expired events preserve processing and cannot reconnect|R-A1-02, R-A1-04, R-A2-08|NOT_RUN|尚未执行||
|AUTH-001 health, login and UTC account contract|R-A0-04, R-A0-06|NOT_RUN|尚未执行||
|AUTH-002 protected reads reject missing and invalid credentials|R-A0-03, R-A0-04|NOT_RUN|尚未执行||
|AUTH-003 viewer cannot execute any original business write endpoint|R-A0-05|NOT_RUN|尚未执行||
|AUTH-004 refresh token is cookie-only, HttpOnly and rotates|R-B3-01, R-B3-02|NOT_RUN|尚未执行||
|AUTH-005 refresh replay revokes both new credentials immediately|R-B3-02|NOT_RUN|尚未执行||
|AUTH-006 logout invalidates the existing access token immediately|R-B3-03|NOT_RUN|尚未执行||
|AUTH-007 access token expires at fifteen minutes (real clock)|R-A0-04|NOT_RUN|尚未执行||
|GROUP-001 creation validates members and online status before external effects|R-A3-01|NOT_RUN|尚未执行||
|GROUP-002 asynchronous creation materializes creator and event-confirmed roles|R-A3-01, R-A3-02, R-A3-03, R-A3-04|NOT_RUN|尚未执行||
|GROUP-003 accepted join without member_joined fails after ten seconds|R-A3-03, R-A3-04, R-A3-05|NOT_RUN|尚未执行||
|GROUP-004 invite readiness is respected without retry resetting the wait|R-B2-01|NOT_RUN|尚未执行||
|GROUP-005 expired invitation is refreshed once and joining succeeds|R-B2-02|NOT_RUN|尚未执行||
|GROUP-006 leave-all removes service accounts with creator strictly last|R-B2-04|NOT_RUN|尚未执行||
|GROUP-007 failed noncreator leave preserves owner and continues remaining accounts|R-B2-04, R-A3-05|NOT_RUN|尚未执行||
|GROUP-008 member rows wait for actual joined event before promotion|R-A3-03, R-A3-04|NOT_RUN|尚未执行||
|GROUP-009 ALREADY_MEMBER confirms existing membership without waiting for another event|R-B2-03|NOT_RUN|尚未执行||
|GROUP-010 leave-all preserves public external members and keeps left groups inactive|R-B2-04, ADD-LEFT-MEMBERS-01|NOT_RUN|尚未执行||
|MSG-001 accepted is observable until message_sent and own echo stays one row|R-A2-01, R-A2-02, R-A2-06|NOT_RUN|尚未执行||
|MSG-002 rate limiting blocks all account sends until deadline and preserves FIFO|R-A2-09, R-A1-06|NOT_RUN|尚未执行||
|MSG-003 terminal marking cancels queued sends and removes member atomically|R-A1-04|NOT_RUN|尚未执行||
|MSG-004 504 that lands within two seconds is reconciled without resending|R-A2-03|NOT_RUN|尚未执行||
|MSG-005 absent 504 permits at most one retry after the two-second uncertainty window|R-A2-03|NOT_RUN|尚未执行||
|MSG-006 unavailable confirmation preserves unknown until recovery|R-A2-04|NOT_RUN|尚未执行||
|MSG-007 synchronous ACCOUNT_SUSPENDED applies terminal consequences without relying on events|R-A2-10, R-A1-04|NOT_RUN|尚未执行||
|MSG-008 synchronous SESSION_EXPIRED applies terminal consequences without relying on events|R-A2-10, R-A1-04|NOT_RUN|尚未执行||
|MSG-009 SENDER_NOT_IN_GROUP only fails that message|R-A2-12|NOT_RUN|尚未执行||
|MSG-010 ACCOUNT_OFFLINE only fails that message|R-A2-12|NOT_RUN|尚未执行||
|MSG-011 incoming duplicate and out-of-order historical messages are merged and sorted|R-A2-05, R-A4-02|NOT_RUN|尚未执行||
|MSG-012 snapshot cursor traversal has no omission or duplicates under concurrent writes|R-A4-01|NOT_RUN|尚未执行||
|MSG-013 manual send validates unavailable account and nonmember before enqueue|R-A2-12|NOT_RUN|尚未执行||
|MSG-014 leaving rate_limited manually prevents stale timer resurrection|R-A1-06, R-A1-08|NOT_RUN|尚未执行||
|MSG-015 asynchronous message_failed applies ACCOUNT_SUSPENDED consequences|R-A2-02, R-A2-10, R-A1-04|NOT_RUN|尚未执行||
|MSG-016 asynchronous message_failed applies GROUP_WRITE_FORBIDDEN consequences|R-A2-02, R-A2-11|NOT_RUN|尚未执行||
|MSG-017 message echo arriving before confirmation still merges one own row|R-A2-01, R-A2-05, R-A2-06|NOT_RUN|尚未执行||
|WS-001 business events start after auth and have strictly increasing global seq|R-A4-03, R-A4-04, R-A1-05|NOT_RUN|尚未执行||
|WS-002 unauthenticated and invalid-token sockets receive no business events|R-A4-03|NOT_RUN|尚未执行||
|WS-003 account_terminal is published only after terminal state and cleanup|R-A4-04, R-A1-04, R-A1-05|NOT_RUN|尚未执行||
|AGENT-001 four schema-complete tools and correct trigger context keep one run identity|R-A5-02, R-A5-03, R-A5-14, R-A5-17|NOT_RUN|尚未执行||
|AGENT-002 duplicate inbound and own echo never duplicate triggers|R-A5-01, R-A2-06|NOT_RUN|尚未执行||
|AGENT-003 multi-instance active run excludes competitors and batches all pending messages|R-A5-01, R-A5-02|NOT_RUN|尚未执行||
|AGENT-004 non-JSON produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-005 fenced JSON produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-006 multiple blocks produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-007 stop reason mismatch produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-008 non-2xx produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-009 UNKNOWN_TOOL appends assistant tool use and error result|R-A5-03, R-A5-04|NOT_RUN|尚未执行||
|AGENT-010 INVALID_INPUT appends assistant tool use and error result|R-A5-03, R-A5-04|NOT_RUN|尚未执行||
|AGENT-011 duplicate tool_use id is protocol error and has no repeated effect|R-A5-04|NOT_RUN|尚未执行||
|AGENT-012 three consecutive protocol errors fail and a legal response resets the count|R-A5-04, R-A5-05|NOT_RUN|尚未执行||
|AGENT-013 repeated read loop cannot exceed twelve turns|R-A5-05, R-A5-18|NOT_RUN|尚未执行||
|AGENT-014 audit rejection blocks side effect and rejected key remains reusable|R-A5-07, R-A5-10|NOT_RUN|尚未执行||
|AGENT-015 three inconclusive audit attempts block run without execution|R-A5-07|NOT_RUN|尚未执行||
|AGENT-016 idempotency retry returns current sent state without another audit or send|R-A5-10, R-A5-16, R-A2-03|NOT_RUN|尚未执行||
|AGENT-017 kick denied by policy never calls external kick|R-A5-09|NOT_RUN|尚未执行||
|AGENT-018 permitted kick audits exact action and uses owner or promoted member|R-A5-07, R-A5-08, R-A5-09|NOT_RUN|尚未执行||
|AGENT-019 OWNER_LEFT is returned as tool error without changing group or accounts|R-A5-09|NOT_RUN|尚未执行||
|AGENT-020 NO_PERMISSION is returned as tool error without changing group or accounts|R-A5-09|NOT_RUN|尚未执行||
|AGENT-021 recent messages include new arrivals and obey text, count, byte and summary limits|R-A5-12, R-A5-15|NOT_RUN|尚未执行||
|AGENT-022 disabling agent lets current step complete then cancels|R-A5-13|NOT_RUN|尚未执行||
|AGENT-023 finish tool stores summary and does not ask another turn|R-A5-17|NOT_RUN|尚未执行||
|AGENT-024 turn timeout records error and late response never sends a message|R-A5-06, R-A5-04|NOT_RUN|尚未执行||
|AGENT-025 run reaches sixty-second active wall-clock budget including slow turns|R-A5-06|NOT_RUN|尚未执行||
|AGENT-026 no online member returns NO_AVAILABLE_ACCOUNT as ordinary tool error|R-A5-08|NOT_RUN|尚未执行||
|AGENT-027 raw protocol response truncates to two KiB and remains inspectable|R-A5-12, R-A5-14|NOT_RUN|尚未执行||
|AGENT-028 unknown send times out in five seconds and same key still cannot resend|R-A5-10, R-A5-16|NOT_RUN|尚未执行||
|AGENT-029 kick timeout reconciles membership and never executes twice|R-A5-09|NOT_RUN|尚未执行||
|AGENT-030 account becoming terminal during send returns SEND_FAILED and run continues|R-A5-08, R-A5-16|NOT_RUN|尚未执行||
|AGENT-031 group write error cancels current run after its step and stops future triggers|R-A2-11, R-A5-13, R-A5-16|NOT_RUN|尚未执行||
|AGENT-032 twelve distinct turns exhaust budget without a thirteenth request|R-A5-05|NOT_RUN|尚未执行||
|AGENT-033 audit retries resolve before informing agent and do not consume turn budget|R-A5-07|NOT_RUN|尚未执行||
|REC-001 SSE reconnect recovers all retained events once including out-of-order delivery|R-A2-08, R-A2-05|NOT_RUN|尚未执行||
|REC-002 hard process restart recovers events produced while stopped|R-A2-08|NOT_RUN|尚未执行||
|REC-003 database write outage loses no event and produces inconsistency notice|R-A2-07|NOT_RUN|尚未执行||
|REC-004 crash after send effect before response never duplicates gateway delivery|R-A2-01|NOT_RUN|尚未执行||
|REC-005 sequence restart reschedules only earliest overdue step and spaces subsequent sends|R-B1-09|NOT_RUN|尚未执行||
|REC-006 agent restarts with same run id and reconciles already-sent tool effect|R-A5-11, R-A2-01|NOT_RUN|尚未执行||
|REC-007 agent restart after kick effect uses membership reconciliation without repeating kick|R-A5-11, R-A5-09|NOT_RUN|尚未执行||
|REC-008 repeated migration preserves data and schema version|R-A0-01|NOT_RUN|尚未执行||
|SEQ-001 variables inherit latest nonempty override with original source|R-B1-03, R-B1-05|NOT_RUN|尚未执行||
|SEQ-002 all-step preflight rejects step three and leaves no running record or send|R-B1-04|NOT_RUN|尚未执行||
|SEQ-003 simultaneous starts admit exactly one sequence run|R-B1-06|NOT_RUN|尚未执行||
|SEQ-004 admin preferred and member selected lexicographically|R-B1-01|NOT_RUN|尚未执行||
|SEQ-005 next delay begins at actual sent event, not acceptance|R-B1-07|NOT_RUN|尚未执行||
|SEQ-006 unavailable member step is skipped with timestamp and progress continues|R-B1-01, R-B1-08|NOT_RUN|尚未执行||
|SEQ-007 rate-limited role waits rather than skips and preserves later delays|R-B1-01, R-B1-07, R-A2-09|NOT_RUN|尚未执行||
|SEQ-008 group write prohibition stops sequence while account remains online|R-A2-11|NOT_RUN|尚未执行||
|SEQ-009 placeholder grammar includes letters digits underscore and leaves other braces literal|R-B1-02|NOT_RUN|尚未执行||
|SEQ-010 terminal account skips its queued sequence step and advances progress|R-A1-04, R-B1-08|NOT_RUN|尚未执行||
|AGENT-034 missing stop reason produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-035 zero content blocks produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|AGENT-036 text surrounding JSON produces BAD_JSON history without assistant block|R-A5-03, R-A5-04, R-A5-14|NOT_RUN|尚未执行||
|MSG-018 terminal event removes account and cancels its queue across every group|R-A1-04|NOT_RUN|尚未执行||
|CAN-MEDIA-001 下载媒体并保存可读取路径|CAND-C1-01|NOT_RUN|尚未执行||
|CAN-MEDIA-002 保留期边界和默认30天|CAND-C1-02|NOT_RUN|尚未执行||
|CAN-MEDIA-003 清理断点不留下悬空引用|CAND-C1-03|NOT_RUN|尚未执行||
|CAN-MEDIA-004 运行中Agent引用媒体不清理|CAND-C1-04|NOT_RUN|尚未执行||
|CAN-LLM-001 真实模型服务协议替换|CAND-C2-01|NOT_RUN|尚未执行||
|EXT-001 群资料可选、局部编辑及简介清空|ADD-META-01, ADD-META-02, ADD-META-03, ADD-META-04|NOT_RUN|尚未执行||
|EXT-002 viewer资料越权拒绝|R-A0-05, ADD-META-01, ADD-CONFLICT-01|NOT_RUN|尚未执行||
|EXT-003 目录四字段及字面搜索|ADD-DIR-02|NOT_RUN|尚未执行||
|EXT-004 目录分页兼容与双向遍历|ADD-DIR-01, ADD-DIR-04, ADD-DIR-06|NOT_RUN|尚未执行||
|EXT-005 目录输入边界与鉴权|ADD-DIR-04|NOT_RUN|尚未执行||
|EXT-006 完整查询游标绑定|ADD-DIR-05, ADD-DIR-12|NOT_RUN|尚未执行||
|EXT-007 组合筛选先于分页|ADD-DIR-12|NOT_RUN|尚未执行||
|EXT-008 同字段并发原值竞争|ADD-CONFLICT-01, ADD-CONFLICT-02|NOT_RUN|尚未执行||
|EXT-009 冲突请求无部分副作用|ADD-CONFLICT-02|NOT_RUN|尚未执行||
|EXT-010 异字段并发及旧请求兼容|ADD-CONFLICT-03, ADD-META-04|NOT_RUN|尚未执行||
|EXT-011 null原值与非法条件|ADD-CONFLICT-01|NOT_RUN|尚未执行||
|EXT-012 资料跨重启持久性|ADD-META-03, ADD-META-04, ADD-CONFLICT-01|NOT_RUN|尚未执行||
|BLK-MIG-001 已有历史schema低于候选时明确拒启且不改变结构数据|R-A0-02|NOT_RUN|尚未执行||
|BASE-001 全新未迁移schema拒启|R-A0-02|NOT_RUN|尚未执行||
|BASE-002 交付声明与栈约束入口|R-A0-06|NOT_RUN|尚未执行||
|API-001 独立公开API结构契约|R-A0-03, R-A0-06, R-A3-05, R-A5-14, R-B1-05|NOT_RUN|尚未执行||
|DIAG-001 后台诊断仅管理员可读且不泄漏测试凭据或业务样本|ENG-DIAG-01|NOT_RUN|尚未执行||
|INT-MSG-006 已识别504后延迟本地保存仍从原接收起按5秒确定状态|R-A2-01, R-A2-03|NOT_RUN|尚未执行||
|INT-MSG-007 单实例首次确认已观察但INSERT未发出时崩溃的排期时间保留|R-A2-01, R-A2-08, R-B1-07, R-B1-09|NOT_RUN|尚未执行||
|INT-MSG-008 receipt自动提交已确认但业务未应用时崩溃后复用首次时间|R-A2-01, R-A2-08, R-B1-07, R-B1-09|NOT_RUN|尚未执行||
|INT-MSG-001 旧404跨过2秒确认窗不能否定已真实落地消息|R-A2-03, R-A2-04|NOT_RUN|尚未执行||
|INT-MSG-002 真实查询响应持续延迟跨5秒后仍unknown并按恢复2秒收敛|R-A2-03, R-A2-04|NOT_RUN|尚未执行||
|INT-MSG-003 慢但可用的确认查询仍从最初504计五秒|R-A2-03|NOT_RUN|尚未执行||
|INT-MSG-004 查询503恢复成慢200后仍保留原两秒判定|R-A2-04|NOT_RUN|尚未执行||
|INT-MSG-005 同一确认以不同eventId迟到并在公开提交后重启不改排期|R-B1-07, R-B1-09, R-A2-08|NOT_RUN|尚未执行||
|INT-ACT-001 安全阶段重启累计活动预算、恢复归因与完整尾段真值|R-A5-06, R-A5-11|NOT_RUN|尚未执行||
|INT-ACCOUNT-001 远端成功后的局部保存暂错在原事务恢复，新断开不被旧连接覆盖|R-A1-03, R-A1-05, R-A1-07, R-A1-08, ENG-ACCOUNT-RECOVERY-01|NOT_RUN|尚未执行||
|INT-ACCOUNT-002 持续本地保存失败显式回滚，无虚假状态事件或远端自动重放|R-A1-05, R-A1-07, ENG-ACCOUNT-RECOVERY-01|NOT_RUN|尚未执行||
|INT-DIAG-002 真实tick失败、进行中保持与恢复诊断及错误样本脱敏|ENG-DIAG-01|NOT_RUN|尚未执行||
|INT-STREAM-001 真实暂停TCP读取与健康消费者并行、按实际已收游标重放|ENG-STREAM-01, R-A4-03, R-A4-04|NOT_RUN|尚未执行||
|INT-STREAM-002 续页改变页大小并交错发送确认、历史补投与新消息，冻结集合内容保持|ENG-STREAM-01, R-A4-01, R-A4-02|NOT_RUN|尚未执行||
|MAN-UX-001 操作员能识别阻断、失败与账号/群角色含义|R-A6-03, ADD-COPY-01|NOT_RUN|尚未执行||
|MAN-IME-001 真实操作系统中文输入法不触发中间查询|ADD-DIR-11|NOT_RUN|尚未执行||
|MAN-FOCUS-001 真实失焦与浏览器标签标题favicon呈现|ADD-ATT-02, ADD-ATT-03|NOT_RUN|尚未执行||
|MAN-DELIVERY-001 接收方核对仓库Git历史及版本对应|R-DELIVERY-01|NOT_RUN|尚未执行||
|MAN-DELIVERY-002 接收方只依README在全新隔离环境复现启动|R-DELIVERY-02|NOT_RUN|尚未执行||
|BLK-EXT-001 未收到响应的发送崩溃：相同前缀下落地/不落地两个分支|R-A2-01, R-A5-11|NOT_RUN|尚未执行||
|BLK-EXT-002 建群成功响应丢失：原群身份与额外远端群核对|R-A3-02, R-A2-01|NOT_RUN|尚未执行||
|BLK-EXT-003 promote响应丢失：角色真相与两次调用上限|R-A3-02, R-A3-04|NOT_RUN|尚未执行||
|BLK-EXT-004 kick已生效后目标重新加入：恢复不重踢|R-A5-09, R-A5-11|NOT_RUN|尚未执行||
|BLK-EXT-005 模型未执行响应丢失：允许不同合法响应且保留已持久历史|R-A5-02, R-A5-11|NOT_RUN|尚未执行||
|OPS-001 批准负载profile的混合API容量|REL-05|NOT_RUN|尚未执行||
|OPS-002 批准持续时间的稳定运行|REL-05|NOT_RUN|尚未执行||
|OPS-003 真实备份与隔离恢复演练|REL-05|NOT_RUN|尚未执行||
|OPS-MAN-001 部署升级及回滚演练|REL-05, REL-02|NOT_RUN|尚未执行||
|OPS-MAN-002 生产身份与部署安全评审|REL-06|NOT_RUN|尚未执行||
|OPS-MAN-003 监控与告警实际到达及恢复|REL-05, REL-03|NOT_RUN|尚未执行||
|OPS-MAN-004 授权版本证据及清理复核|REL-01, REL-02, REL-04, REL-07|NOT_RUN|尚未执行||
|DOC-MAN-001 追加需求台账来源与状态审核|ADD-DOC-01|NOT_RUN|尚未执行||
|BLK-SPEC-002 普通序列发送失败终止整run且重启后不发送后续步骤|ADD-SEQ-FAIL-01, R-B1-07, R-B1-08, R-A2-12, R-A2-03, R-A2-04|NOT_RUN|尚未执行||
|BLK-SPEC-001 序列在线候选过滤与已入队限流消息的账号及顺序保持|R-B1-01, R-A2-09|NOT_RUN|尚未执行||
|BLK-SPEC-003 手动状态遵守CAS和已提交事件，离线目标产生明确disconnect效果|R-A1-01, R-A1-08|NOT_RUN|尚未执行||
|BLK-SPEC-004 混合协议错误累计三次，合法工具业务错误清零连续计数|R-A5-04, R-A5-05|NOT_RUN|尚未执行||
|BLK-SPEC-005 第三次未知审计与关闭Agent重叠时合法终态稳定且不产生副作用|R-A5-07, R-A5-13|NOT_RUN|尚未执行||
|BLK-SPEC-006 资料版本化输入规则、工具公开schema一致性及明确字节上限|ADD-META-04, R-A5-12, R-A5-15|NOT_RUN|尚未执行||
|UI-023 简介两行纯文本摘要与完整详情|ADD-DIR-03|NOT_RUN|尚未执行||
|UI-024 单页五秒轮询及并发失效合并|ADD-DIR-07, ADD-DIR-11|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-024-单页五秒刷新、并发失效合并且无关消息不遍历目录-chromium/attachments/ui-final-screenshot-957c313260f95a37b760d9ec87cd82f6a754240c.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-024-单页五秒刷新、并发失效合并且无关消息不遍历目录-chromium/attachments/ui-final-state-fa3d7d170ede6419c3532394ecaa88cf0c13375a.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-024-单页五秒刷新、并发失效合并且无关消息不遍历目录-chromium/evidence)|
|UI-025 返回恢复内存条件分页位置及刷新清空|ADD-DIR-09, ADD-DIR-06|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-025-同标签返回保留条件与已加载页，整页刷新清空目录内存-chromium/attachments/ui-final-screenshot-d8edcdd76dd7d48abe46dcb609d8fd1358a88cc9.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-025-同标签返回保留条件与已加载页，整页刷新清空目录内存-chromium/attachments/ui-final-state-9b2d72c363d7260cc0bb7ae8c1bfee6e096cc50f.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-025-同标签返回保留条件与已加载页，整页刷新清空目录内存-chromium/evidence)|
|UI-026 注销换身份清除目录会话状态|ADD-DIR-09, R-A6-01|NOT_RUN|尚未执行||
|UI-027 浏览器composition不发中间查询|ADD-DIR-11|NOT_RUN|尚未执行||
|UI-028 前台安静与失焦静态标题favicon|ADD-ATT-02, ADD-ATT-03|FAIL|Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveTitle[2m([22m[32mexpected[39m[2m)[22m failed  Expected: [32m"群详情 · Kapibala"[39m Received: [31m"[7m[有更新] [27m群详情 · Kapibala"[39m Timeout:  8000ms  Call log: [2m  - Expect "toHaveTitle" with timeout 8000ms[22m [2m    20 × locator resolved to <html lang="zh-CN">…</html>[22m [2m       - unexpected value "[有更新] 群详情 · Kapibala"[22m |[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/test-failed-1.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/attachments/ui-final-screenshot-942e7eefec06b8674371a3dbb71cfbbb62993383.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/attachments/ui-final-state-a93cd4ea019a7d6026b211a002793400e50a0bf5.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/evidence) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/video-1.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/video.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/error-context.md) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-028-前台呈现安静，失焦标题和favicon静态提醒且聚焦不清除-chromium/trace.zip)|
|UI-029 加载失败不冒称已确认|ADD-ATT-03|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-029-内容加载失败不能确认，成功呈现后相关操作才清提醒-chromium/attachments/ui-final-screenshot-0e04ed1de637547f476d239fb908989233626e06.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-029-内容加载失败不能确认，成功呈现后相关操作才清提醒-chromium/attachments/ui-final-state-e0101bb88909d813560cc39bad21b646931ebc28.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-029-内容加载失败不能确认，成功呈现后相关操作才清提醒-chromium/evidence)|
|UI-030 列表范围消失的两阶段确认|ADD-ATT-01, ADD-ATT-04|FAIL|Error: [2mexpect([22m[31mreceived[39m[2m).[22mnot[2m.[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m  Expected: not [32m"群组工作台 · Kapibala"[39m|[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/test-failed-1.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/attachments/ui-final-screenshot-41388dcb8309c85e9e274200370e3900743d1b05.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/attachments/ui-final-state-8ae065cf25b8f5d69573c51b35c50b7f64927b49.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/evidence) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/video-1.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/video.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/error-context.md) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-030-搜索范围记录消失先展示成功结果，再明确确认范围变化-chromium/trace.zip)|
|UI-031 变化后回原值保留期间变化候选|ADD-ATT-04|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-031-状态先改变后还原仍保留期间变化候选-chromium/attachments/ui-final-screenshot-327c3b2cfc8a3209808e2f85606d2cce7ea694d7.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-031-状态先改变后还原仍保留期间变化候选-chromium/attachments/ui-final-state-b92a4230f57946ee18b4bb3300ed9901078cdb96.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-031-状态先改变后还原仍保留期间变化候选-chromium/evidence)|
|UI-032 提示确认与目录过期相互独立|ADD-ATT-05, ADD-DIR-08|BLOCKED|BlockedError: [BLOCKED] 需要适配独立于整体刷新、且只确认已呈现相关变化的公开操作，不能伪造已读状态绕过目录过期|[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/test-failed-1.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/attachments/ui-final-screenshot-62d8d3d5797a27d2bd1781f6d9c11983fe0240c8.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/attachments/ui-final-state-84eb309c2263af0ad000dce44d1e6cc811c60cbe.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/evidence) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/video-1.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/video.webm) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/error-context.md) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-032-提醒确认不能恢复多页过期旧游标-chromium/trace.zip)|
|UI-033 本地手动clientMsgId及早回流归属|ADD-ATT-06|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-033-本地手动发送先带clientMsgId，回流早于响应不误标远端未读-chromium/attachments/ui-final-screenshot-72d1ed54a14b8f1d887a582cdf0689f408dfbe66.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-033-本地手动发送先带clientMsgId，回流早于响应不误标远端未读-chromium/attachments/ui-final-state-3184b3c0e60d6f9f2044240f1c87f2341c9b4955.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-033-本地手动发送先带clientMsgId，回流早于响应不误标远端未读-chromium/evidence)|
|UI-034 Agent自动消息失焦提醒|ADD-ATT-06|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-034-Agent自己的自动消息仍参与失焦提醒-chromium/attachments/ui-final-screenshot-d8706328a482b8ef87d7d9bc6522ebe98663ea7c.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-034-Agent自己的自动消息仍参与失焦提醒-chromium/attachments/ui-final-state-f7df5a1e0ee7d1071e375807a2c9337e2b3942d0.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-034-Agent自己的自动消息仍参与失焦提醒-chromium/evidence)|
|UI-035 序列自动消息失焦提醒|ADD-ATT-06|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-035-序列自动发送不因isOwn被排除提醒-chromium/attachments/ui-final-screenshot-57a158f6cdf80230814e74219030a0d39fed424e.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-035-序列自动发送不因isOwn被排除提醒-chromium/attachments/ui-final-state-95eccce4d73aa7036f3683be1f5e3668542bca1d.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-035-序列自动发送不因isOwn被排除提醒-chromium/evidence)|
|UI-036 编辑卸载迟到结果隔离|ADD-FORM-02|NOT_RUN|尚未执行||
|UI-037 目录微秒及同时间ID跨页边界的确定性数据夹具|ADD-DIR-01, ADD-DIR-05|NOT_RUN|尚未执行||
|UI-001 viewer登录后各页不提供业务写入口|R-A6-01, R-A0-05|NOT_RUN|尚未执行||
|UI-002 账号状态与合法操作实时更新|R-A6-02, ADD-COPY-01|NOT_RUN|尚未执行||
|UI-003 群角色及消息回流只显示一行|R-A6-03, R-A4-02|NOT_RUN|尚未执行||
|UI-004 页面显示accepted到sent|R-A6-03, R-A2-02, R-A4-02|NOT_RUN|尚未执行||
|UI-005 历史分页和实时新增合并|R-A4-01, R-A4-02, R-A6-03|NOT_RUN|尚未执行||
|UI-006 前端断线3秒内补齐|R-B4-01|NOT_RUN|尚未执行||
|UI-007 审计阻断显示在群运行列表|R-A6-03, R-A5-07|NOT_RUN|尚未执行||
|UI-008 登录至Agent步骤详情完整旅程|R-B4-02, R-A5-14|NOT_RUN|尚未执行||
|UI-009 序列预检变量继承与来源|R-B1-03, R-B1-05|NOT_RUN|尚未执行||
|UI-010 序列预检错误定位|R-B1-04|NOT_RUN|尚未执行||
|UI-011 前端并发401单次续期|R-B3-04|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-011-多个页面请求同时401只续期一次并恢复加载-chromium/attachments/ui-final-screenshot-a0d68319ae2be9fe743f10ef9905ef0b9be05df5.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-011-多个页面请求同时401只续期一次并恢复加载-chromium/attachments/ui-final-state-593946155adf1f7193eceb2e3f034e5f18642230.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-011-多个页面请求同时401只续期一次并恢复加载-chromium/evidence)|
|UI-012 群资料纯文本呈现|ADD-META-01, ADD-META-02, ADD-DIR-03|NOT_RUN|尚未执行||
|UI-013 编辑表单dirty关闭保护|ADD-FORM-01|NOT_RUN|尚未执行||
|UI-014 提交中保护及失败保留草稿|ADD-FORM-02|NOT_RUN|尚未执行||
|UI-015 冲突必须明确再次确认|ADD-CONFLICT-04|NOT_RUN|尚未执行||
|UI-016 搜索迟到响应隔离|ADD-DIR-11|NOT_RUN|尚未执行||
|UI-017 多页过期和原子刷新|ADD-DIR-08, ADD-ATT-05|NOT_RUN|尚未执行||
|UI-018 组合筛选clear与reset|ADD-DIR-12|NOT_RUN|尚未执行||
|UI-019 首次错误与成功空结果区分|ADD-DIR-10|NOT_RUN|尚未执行||
|UI-020 失焦提醒和呈现后确认|ADD-ATT-01, ADD-ATT-02, ADD-ATT-03|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-020-当前群失焦只提示相关更新，聚焦本身不确认-chromium/attachments/ui-final-screenshot-9023bc680bd8042b5007ac665394775ec6c3ff48.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-020-当前群失焦只提示相关更新，聚焦本身不确认-chromium/attachments/ui-final-state-a91d3824c8dd352fb7dc2afd61c264f686e60d09.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-020-当前群失焦只提示相关更新，聚焦本身不确认-chromium/evidence)|
|UI-021 路由范围销毁|ADD-ATT-01|PASS||[证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-021-离开群详情销毁提醒范围，旧群变化不污染新页-chromium/attachments/ui-final-screenshot-15d3e2531377d5e0d2c6fba24aff44af734708f6.png) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-021-离开群详情销毁提醒范围，旧群变化不污染新页-chromium/attachments/ui-final-state-184e9eb28416ac0ac21a4060eca6e2bc11132138.json) [证据](/Users/zcm/.codex/worktrees/qa-premise-retest/kapibala/qa-acceptance/reports/preflight/2026-10-01T07-48-06.522Z-66d3a279/artifacts/ui-console--UI-021-离开群详情销毁提醒范围，旧群变化不污染新页-chromium/evidence)|
|UI-022 创建表单关闭保护|ADD-FORM-01|NOT_RUN|尚未执行||

## 准备依赖专项登记

|用例|准备状态|责任方|待办与边界|
|---|---|---|---|
|CAP-001|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-002|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-003|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-004|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-005|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-006|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-007|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-008|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-009|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|CAP-010|dependency-pending|工程提供观测/控制接入，QA绑定与验收|工程固定候选0af6443已交付真实容量控制；QA尚未实际接入或执行；仍需专属控制器生命周期、实际归属、run/step拒绝关联与释放证据；CAP-003与CAP-009已有未修复开发复现，见requirements/engineering-candidate-intake-20261001.md；控制器自测与开发回归不能关闭QA依赖或产品结果|
|ARC-UI-BLK-001|dependency-pending|QA|账号通用读取失败与提醒确认脚本已实现；尚需授权后确认候选真实页面定位及消费者关联，adapterConfirmed当前不代表已确认|
|BLK-MIG-001|dependency-pending|QA与候选交付方|真实版本化dump和独立台账已收到，候选0af6443已固定；QA哈希/来源静态核验完成；仍需独立恢复、内容与无待执行工作审核，之后才生成真实review和双哈希manifest；UI另需实际页面适配；当前保持dependency-pending，开发恢复结果不能代替QA实测；见requirements/engineering-candidate-intake-20261001.md|
|INT-MSG-006|dependency-pending|QA/工程|客户端按ffdc8b018be6c20cba2a9d34afda5225187df7cd工程交接对齐，尚未与此候选实际联调；新例纳入后续完整业务分母，旧0af6443冻结验收不含本例，不能拼接成旧范围通过|
|INT-MSG-007|dependency-pending|QA/工程|ffdc8b018be6c20cba2a9d34afda5225187df7cd仅提供单实例精确窗口，QA脚本未跑产品；本例新增到后续验收分母；D041已知保存前风险不因工程自测通过而关闭|
|INT-MSG-008|dependency-pending|QA/工程|客户端按ffdc8b018be6c20cba2a9d34afda5225187df7cd的实际协议对齐，尚待QA联调；后续单独冻结/授权/执行留证，不向当前旧251条业务运行回填结果|
|INT-MSG-001|script-ready|QA|独立公开协议操作与断言已实现；仅静态及协议桩自测，尚未对SUT执行；不包含504已收到后本地保存暂停、接收记录保存前后或多实例物理首次窗口，见contracts/message-receipt-observation.md|
|INT-MSG-002|script-ready|QA|独立公开协议操作与断言已实现；仅静态及协议桩自测，尚未对SUT执行；不包含504已收到后本地保存暂停、接收记录保存前后或多实例物理首次窗口，见contracts/message-receipt-observation.md|
|INT-MSG-003|script-ready|QA|独立公开协议操作与断言已实现；仅静态及协议桩自测，尚未对SUT执行；不包含504已收到后本地保存暂停、接收记录保存前后或多实例物理首次窗口，见contracts/message-receipt-observation.md|
|INT-MSG-004|script-ready|QA|独立公开协议操作与断言已实现；仅静态及协议桩自测，尚未对SUT执行；不包含504已收到后本地保存暂停、接收记录保存前后或多实例物理首次窗口，见contracts/message-receipt-observation.md|
|INT-MSG-005|script-ready|QA|独立公开协议操作与断言已实现；仅静态及协议桩自测，尚未对SUT执行；不包含504已收到后本地保存暂停、接收记录保存前后或多实例物理首次窗口，见contracts/message-receipt-observation.md|
|INT-ACT-001|dependency-pending|工程提供真实观测与局部故障，QA接入验收|QA客户端与四条操作/断言已实现，真实工程控制器尚未交付；最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过；新增安全阶段屏障和实际恢复状态见证是待工程接入条件，不声称纯预算已实测|
|INT-ACCOUNT-001|dependency-pending|工程提供真实观测与局部故障，QA接入验收|QA客户端与四条操作/断言已实现，真实工程控制器尚未交付；最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过；真实后请求等待观测和原外层COMMIT边界仍需工程证明|
|INT-ACCOUNT-002|dependency-pending|工程提供真实观测与局部故障，QA接入验收|QA客户端与四条操作/断言已实现，真实工程控制器尚未交付；最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过|
|INT-DIAG-002|dependency-pending|工程提供真实观测与局部故障，QA接入验收|QA客户端与四条操作/断言已实现，真实工程控制器尚未交付；最小合同contracts/runtime-observation.md；工具自测不证明工程接入或产品通过|
|INT-STREAM-001|script-ready|QA|公开接口/独立网关/真实客户端操作及断言已准备；产品结果仍为NOT_RUN；真实有限负载能否触发慢端关闭和回放缺口需后续授权实跑；未建立前提必须BLOCKED，不能用工具自测代填通过|
|INT-STREAM-002|script-ready|QA|公开接口/独立网关/真实客户端操作及断言已准备；产品结果仍为NOT_RUN；真实有限负载能否触发慢端关闭和回放缺口需后续授权实跑；未建立前提必须BLOCKED，不能用工具自测代填通过|
|BLK-EXT-001|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过；外部强恢复风险保留，明确违约FAIL、观察不足BLOCKED；不虚造协议幂等或恢复期限|
|BLK-EXT-002|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过；外部强恢复风险保留，明确违约FAIL、观察不足BLOCKED；不虚造协议幂等或恢复期限|
|BLK-EXT-003|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过；外部强恢复风险保留，明确违约FAIL、观察不足BLOCKED；不虚造协议幂等或恢复期限|
|BLK-EXT-004|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过；外部强恢复风险保留，明确违约FAIL、观察不足BLOCKED；不虚造协议幂等或恢复期限|
|BLK-EXT-005|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过；外部强恢复风险保留，明确违约FAIL、观察不足BLOCKED；不虚造协议幂等或恢复期限|
|BLK-SPEC-002|script-ready|QA|QA-D6已记录用户批准的普通失败终止策略；脚本含六种同步故障位置/错误组合、两种重启检查，以及一个unknown确认后失败的组合场景；仅完成准备期校验，产品仍NOT_RUN；原13项工程/夹具接入待办未随本裁定关闭|
|BLK-SPEC-001|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过|
|BLK-SPEC-003|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过|
|BLK-SPEC-004|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过|
|BLK-SPEC-005|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过|
|BLK-SPEC-006|script-ready|QA|已有公开操作、故障屏障与独立断言，可在后续明确授权后进行接入试跑；尚未启动或测试SUT；scripts存在不等于实际通过|
|UI-037|dependency-pending|QA与候选交付方|真实版本化dump和独立台账已收到，候选0af6443已固定；QA哈希/来源静态核验完成；仍需独立恢复、内容与无待执行工作审核，之后才生成真实review和双哈希manifest；UI另需实际页面适配；当前保持dependency-pending，开发恢复结果不能代替QA实测；见requirements/engineering-candidate-intake-20261001.md|

## 缺陷与复测

- DEF-UI-028：Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveTitle[2m([22m[32mexpected[39m[2m)[22m failed  Expected: [32m"群详情 · Kapibala"[39m Received: [31m"[7m[有更新] [27m群详情 · Kapibala"[39m Timeout:  8000ms  Call log: [2m  - Expect "toHaveTitle" with timeout 8000ms[22m [2m    20 × locator resolved to <html lang="zh-CN">…</html>[22m [2m       - unexpected value "[有更新] 群详情 · Kapibala"[22m ；严重级别 UNTRIAGED，未分诊项待结合业务影响评定，不从用例优先级推断。JSON保存复现前提、步骤、预期、实际、证据及真实执行时间线。
- DEF-UI-030：Error: [2mexpect([22m[31mreceived[39m[2m).[22mnot[2m.[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m  Expected: not [32m"群组工作台 · Kapibala"[39m；严重级别 UNTRIAGED，未分诊项待结合业务影响评定，不从用例优先级推断。JSON保存复现前提、步骤、预期、实际、证据及真实执行时间线。

## 报告完整性

未发现未知用例或执行器完整性异常。

## 风险、例外与最终决定

需求澄清、协议缺口及上线待定指标见 requirements/clarifications.md、requirements/release-gates.md。未执行或阻塞的必验项阻止无条件通过。例外需记录批准人、原要求、替代保证、剩余风险、有效版本和复测范围；本报告不自动接受例外。最终上线决定及人工签署单独填写。
