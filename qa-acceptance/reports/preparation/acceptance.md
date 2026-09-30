# 独立 QA 验收报告

需求符合性：**INCOMPLETE**；上线准备度：**INCOMPLETE**。

本报告是准备状态清单，未启动或连接被测系统，不能用于宣称产品验收通过。

- 范围内用例：210；通过 0，失败 0，阻塞 0，未执行 210。
- 自动化 187，人工 10，设计阻塞 13，候选 5。
- 有用例覆盖、实际执行和通过率分别统计；跳过、缺少浏览器项目、缺少环境均不作通过。JSON另列required/release/candidate各范围计数及已执行通过率；多范围用例分别计数，不可直接相加。

## 版本、环境与授权

```json
{
  "phase": "preparation",
  "sutExecutionAuthorized": false,
  "productTestsExecuted": 0,
  "qaTree": {
    "sha256": "4cce2d869fd58531a5273cd006b47c7bb22c1394eb2fd50f64a9b2b9aaab1240",
    "files": [
      {
        "path": ".gitignore",
        "sha256": "37d2a4281fb6b0465fab4a826a189cafb6448d12d9cb6e5f28468d2f970e8cba"
      },
      {
        "path": ".prettierrc.json",
        "sha256": "8123eeaf657f177f4617a71e78584ac602b6ca7b4fa7e1e6c24e59c2dee1a2b7"
      },
      {
        "path": "cases/backend.json",
        "sha256": "0eacb1515e677ad888960b4d1c9c24fef4915df91b2504580be8ef7b70ece3ee"
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
        "path": "cases/foundation.json",
        "sha256": "56e39ef944c862aa0439c96bae47e5fa5ee834068123e144ea4494100c720a74"
      },
      {
        "path": "cases/generated/backend.md",
        "sha256": "932eaa12b9bd5802e98fc56f48d7008e23410fec86f748c01e13832437d1a9a8"
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
        "path": "cases/generated/foundation.md",
        "sha256": "947dac820cbdd69ebd66f7100862fe34496a4710405275e40b502f5fe7324150"
      },
      {
        "path": "cases/generated/manual.md",
        "sha256": "ff3b3ed7a50f5b2be9ef960756fe579d088839a8d73547d0dc9cfbd9f2f2ee28"
      },
      {
        "path": "cases/generated/release.md",
        "sha256": "837b108b673cde29a511b1731b21d55d3a1d8a37bdd076a7719ea0ead63d1539"
      },
      {
        "path": "cases/generated/ui-extra.md",
        "sha256": "0ed285df0cb659b04336187efb696824caf54efeda959336c2b32a6f75c60fe5"
      },
      {
        "path": "cases/generated/ui.md",
        "sha256": "6307e30dfc00ceb8ff5a0d2928cab1f42e9ce1260c46b17d83474a4ca40e9bdd"
      },
      {
        "path": "cases/manual.json",
        "sha256": "06e0f21016c979dd71b940b244d0e37d19c0aea6e3a7e6241065d0c950f19af7"
      },
      {
        "path": "cases/README.md",
        "sha256": "6aafb2ef2b6698fb092ea6e48ea029f7fcfca7d2240a15650050700fb4c802a4"
      },
      {
        "path": "cases/release.json",
        "sha256": "222f7f0acc1e75306962898ee42d38fcc2d32edb65672a5fe16695c33bad77d5"
      },
      {
        "path": "cases/ui-extra.json",
        "sha256": "d48b694024f15a3353cc706c7d75ccfff347029b7d02ca6876a9912461f291af"
      },
      {
        "path": "cases/ui.json",
        "sha256": "1a86a23d4f310516d0c1d05e111e27c13a4e52dd6713d941bee9561bb42e0df2"
      },
      {
        "path": "config/authorization.example.json",
        "sha256": "730d90bffa800678a795c3f7d6b49c46ddb0eda32a411e84470996a2eabda92d"
      },
      {
        "path": "config/manual-review.example.json",
        "sha256": "0ab5a4ff86e729179ea82bd00e6d98890a7bcacc49e659a46669aadde8f31bb8"
      },
      {
        "path": "config/target.example.json",
        "sha256": "ce5c6aa0b0b134388bc6f8a592fb35b246e2705ca16979b989e014e5cf96618c"
      },
      {
        "path": "contracts/public-api.ts",
        "sha256": "89415185350b23ca9d083ce02ca1641c1df7a4b614ed127d6dd7b178599b0f1e"
      },
      {
        "path": "contracts/simulator.md",
        "sha256": "e69dfbefb69ab7a279da7021164ca34601b9a04e661402b4f26f61e944c4cf35"
      },
      {
        "path": "harness/agent.ts",
        "sha256": "67a874bab7fdc80c3d264a6c4ab9d97717f68cf7ff302c5b215eb7ce2910e12c"
      },
      {
        "path": "harness/barrier.ts",
        "sha256": "3c7b7636bc2c8488bc28a4bd7068171a521d71ac0c256c938a65c8f022b4b177"
      },
      {
        "path": "harness/catalog-check.ts",
        "sha256": "239e57aa09c2e95162cedc2bdc4a86e5b7298a634d6951c45257a785dc5fe434"
      },
      {
        "path": "harness/catalog.ts",
        "sha256": "aaa1bb8749dec08006c0e75607953e5be3379035af005f4693b88c52c598ede5"
      },
      {
        "path": "harness/cli.ts",
        "sha256": "338fb79d116c43c1d6210e34d13ee4068c360b9dd4cc87c05b909c6e7e1f35a7"
      },
      {
        "path": "harness/database.ts",
        "sha256": "8bf8b5fb1c8121fa73e335446015278e67dbeb82f27f62f9ce6bf4f98c9d6ace"
      },
      {
        "path": "harness/environment.ts",
        "sha256": "b6819886f6321cd796c89799a466da5a3cfcb904d0b0587f5a6840650b7ced94"
      },
      {
        "path": "harness/execution-gate.ts",
        "sha256": "da28e2719b92838c5dea21ba3e914163746b2c48826417fd72ec0a1381a47d9c"
      },
      {
        "path": "harness/gateway.ts",
        "sha256": "67deeb1186d503425526c39c75e5b968ed5a5dcbb0a0f2b2ea88c672befed20a"
      },
      {
        "path": "harness/http-server.ts",
        "sha256": "c4f5b6a80b79f3f88dec987fe133558def705ec6e065c53fa956f64af932c07d"
      },
      {
        "path": "harness/manual.ts",
        "sha256": "1622607c6d6a553e04cd4cc81bfea07dfd5c5e7dd9fde0f973e4b76119b638f3"
      },
      {
        "path": "harness/network.ts",
        "sha256": "3ccb1c4855732d4e6154b8a9ff824f9a6749b31edd0a8b707ea58b30fadd51b1"
      },
      {
        "path": "harness/platform-client.ts",
        "sha256": "2b995c004a297c17d1d5d562605eb1965d215d82951281a53a3933519624a9e1"
      },
      {
        "path": "harness/process.ts",
        "sha256": "b3715e14018755318a36ecbdb4b2eb6fae702a30eacac2ed922faab652db8784"
      },
      {
        "path": "harness/provenance.ts",
        "sha256": "10e3661ba876c9ba9ee490e36784e69b61f1b9a9c09f646a6931de1c7781a342"
      },
      {
        "path": "harness/recovery-drill.ts",
        "sha256": "f9934e587a58e5f30bbc3151114c89c68beb2252c6c64a273028a620390313ec"
      },
      {
        "path": "harness/render-cases.ts",
        "sha256": "ab68f3c2d94289f74f9c4beeb827dd4a49db86b381d9f1828d4e62bbcb0607db"
      },
      {
        "path": "harness/report.ts",
        "sha256": "ebd2048bf91aab14aa2d2e5341c4586b350ec4ad5f309e3289a00b0c0b987066"
      },
      {
        "path": "harness/reporter.ts",
        "sha256": "38c6e8f7b0b9774d819925e7bc01649906b7816f8e740111213fcf861bf76c26"
      },
      {
        "path": "harness/security.ts",
        "sha256": "ad71128f9172f673f58bba62b1b43c197ae3564a8cfce1bf4beaa098a624a32e"
      },
      {
        "path": "harness/types.ts",
        "sha256": "64aa0162a71dcfe76a6e31f204683e663c1b6463bc95d3bbe7c6d145cc391b43"
      },
      {
        "path": "harness/verify-tools.ts",
        "sha256": "f156508cb99a05f1d20b54269d9c6e680154a5d29e79c200e14bd009b2919f03"
      },
      {
        "path": "package-lock.json",
        "sha256": "7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883"
      },
      {
        "path": "package.json",
        "sha256": "52d400792e0a083c62e587f7c42b1af3174b8ba0ce685ad2a68db4ee140ae869"
      },
      {
        "path": "playwright.config.ts",
        "sha256": "4a063f59db9037042c62f6e4df550e53972db3edf9a5923a06a4304df84c245e"
      },
      {
        "path": "README.md",
        "sha256": "bbb1ab62ebd03e80782c8be3ea2d6d1ca9701b4e00ac97c01a420c2a60d48c28"
      },
      {
        "path": "requirements/baseline.json",
        "sha256": "d29073902adfee41c22245c0e74d6091d2653a5f376d00ef876201a06e48668e"
      },
      {
        "path": "requirements/catalog.json",
        "sha256": "ce6d38d4cb597fd28cb9fa28ab6dc987f50c635485440be726c23846317eba27"
      },
      {
        "path": "requirements/clarifications.md",
        "sha256": "fc01df5fe9a0588d6601c59dd760f877afbd106a0186f2cdc821957a742f1fce"
      },
      {
        "path": "requirements/coverage.md",
        "sha256": "202ce9cb58785950a909189c9ddd5d37df323b189c972b38fc19228f70d2b363"
      },
      {
        "path": "requirements/release-gates.md",
        "sha256": "0757bbe778819225ca5106cade3bd13ae70e2458dfe5ea2d3501682771f19a40"
      },
      {
        "path": "requirements/traceability.md",
        "sha256": "cdb477d6bc33960c6d281572a22a10e5335506e6703ebb3b20dbb46133d98abe"
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
        "path": "tests/api/groups.spec.ts",
        "sha256": "88bb0c83994b594666c6fcc0527f3fc10e7964b4335d28c2e8550b7e5d4fa603"
      },
      {
        "path": "tests/api/messages.spec.ts",
        "sha256": "f7bc739c779c8803448bf4760e280768401cf8c0ac09350d92ff6375ba355b55"
      },
      {
        "path": "tests/api/realtime.spec.ts",
        "sha256": "9ec54083fb257fe2de805ec803943ad93aaf4ade0526244841f7355fb38d3a37"
      },
      {
        "path": "tests/extensions/api.spec.ts",
        "sha256": "0f67b5af5b25803ce679128f38adf48392799b61f75abc8588e6886d66e974a3"
      },
      {
        "path": "tests/fixtures.ts",
        "sha256": "fd160d217715c2422ce814a6388344caa21af6d24653f031dfc155be57f3921f"
      },
      {
        "path": "tests/foundation/contracts.spec.ts",
        "sha256": "b88720df2c1401613aade3e596178cf3ba2837d39c85b4e8400c2569abd4c239"
      },
      {
        "path": "tests/foundation/startup.spec.ts",
        "sha256": "59e85976c5f53694a157870622fd8aae3a09c7afe60fd9b4f217d9473e313ea0"
      },
      {
        "path": "tests/release/operations.spec.ts",
        "sha256": "418ce615bb184bcdc0ee461354a8adce44c8dd726e288e9232effef67aff293b"
      },
      {
        "path": "tests/self/contracts.test.ts",
        "sha256": "95bb9eeb805323cdf01833285387b709685bd27c5da7c2060804be3961539d5c"
      },
      {
        "path": "tests/self/infrastructure.test.ts",
        "sha256": "a3efc8de97ae77f8c6412f9c8f35342e45cf2859b405ce58c290027b98cc80b0"
      },
      {
        "path": "tests/self/recovery-tools.test.ts",
        "sha256": "438865585136b45fa30da1481c4e67b76d1e3131f96d63f15c19d64d7043b35c"
      },
      {
        "path": "tests/self/simulators.test.ts",
        "sha256": "337e1be6f665c6d46fbceb8064ec22d8d7298af533cc230aff0561209297d06d"
      },
      {
        "path": "tests/system/agent.spec.ts",
        "sha256": "5550fa7a986332300cca2a6224f3de8bb2f8fa2213a4da660f8e5a374a9a4613"
      },
      {
        "path": "tests/system/recovery.spec.ts",
        "sha256": "1911640e16571ad889f8899450c4b3f3975036683f2f83255e7ff2c1d0f347bf"
      },
      {
        "path": "tests/system/sequence.spec.ts",
        "sha256": "e8e0162a3fad5f99464ab41875cf296a959bd064bbdad6b2c8e0d8238a555a1d"
      },
      {
        "path": "tests/ui/console.spec.ts",
        "sha256": "06ad239798d3990b5b586efafee7dfbec3762b96d6387db0310fdc6cb54e9002"
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
      "CR-013"
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
    "releaseGates": "qa-acceptance/requirements/release-gates.md"
  }
}
```

## 逐项结果

|用例|需求|结果|说明|证据|
|---|---|---|---|---|
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
|GROUP-010 leave-all consistency excludes external users|R-B2-04|NOT_RUN|尚未执行||
|MSG-001 accepted is observable until message_sent and own echo stays one row|R-A2-01, R-A2-02, R-A2-06|NOT_RUN|尚未执行||
|MSG-002 rate limiting blocks all account sends until deadline and preserves FIFO|R-A2-09, R-A1-06|NOT_RUN|尚未执行||
|MSG-003 terminal marking cancels queued sends and removes member atomically|R-A1-04|NOT_RUN|尚未执行||
|MSG-004 504 that lands within two seconds is reconciled without resending|R-A2-03|NOT_RUN|尚未执行||
|MSG-005 absent 504 is retried only once after the two-second uncertainty window|R-A2-03|NOT_RUN|尚未执行||
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
|BASE-001 全新未迁移schema拒启|R-A0-02|NOT_RUN|尚未执行||
|BASE-002 交付声明与栈约束入口|R-A0-06|NOT_RUN|尚未执行||
|API-001 独立公开API结构契约|R-A0-03, R-A0-06, R-A3-05, R-A5-14, R-B1-05|NOT_RUN|尚未执行||
|MAN-UX-001 操作员能识别阻断、失败与账号/群角色含义|R-A6-03, ADD-COPY-01|NOT_RUN|尚未执行||
|MAN-IME-001 真实操作系统中文输入法不触发中间查询|ADD-DIR-11|NOT_RUN|尚未执行||
|MAN-FOCUS-001 真实失焦与浏览器标签标题favicon呈现|ADD-ATT-02, ADD-ATT-03|NOT_RUN|尚未执行||
|BLK-EXT-001 send响应前崩溃的未决远端副作用|R-A2-01, R-A5-11|NOT_RUN|CL-01：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-EXT-002 create成功但groupId尚未保存的恢复|R-A3-02, R-A2-01|NOT_RUN|CL-01：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-EXT-003 promote响应丢失且角色无查询能力|R-A3-02, R-A3-04|NOT_RUN|CL-01：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-EXT-004 kick已经生效后目标重新加入|R-A5-09, R-A5-11|NOT_RUN|CL-01：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-EXT-005 有状态Agent轮次响应丢失重放|R-A5-02, R-A5-11|NOT_RUN|CL-01：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-001 混合在线和限流序列候选选择|R-B1-01|NOT_RUN|CL-08：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-002 序列普通发送失败后的运行策略|R-B1-07, R-B1-08|NOT_RUN|CL-09：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-003 手动online或rate_limited状态的外部含义|R-A1-01, R-A1-08|NOT_RUN|CL-05：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-004 未知工具和非法参数是否重置协议错误计数|R-A5-04, R-A5-05|NOT_RUN|CL-06：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-005 审计预算和取消同时发生的终态优先级|R-A5-06, R-A5-07, R-A5-13|NOT_RUN|CL-07：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|BLK-SPEC-006 资料与工具输入未定边界|ADD-META-04, R-A5-12, R-A5-15|NOT_RUN|CL-10/CL-11：参见requirements/clarifications.md；没有已确认的唯一验收裁判||
|MAN-DELIVERY-001 接收方核对仓库Git历史及版本对应|R-DELIVERY-01|NOT_RUN|尚未执行||
|MAN-DELIVERY-002 接收方只依README在全新隔离环境复现启动|R-DELIVERY-02|NOT_RUN|尚未执行||
|BLK-MIG-001 已有历史schema低于候选的拒启|R-A0-02|NOT_RUN|尚缺经确认的旧版本不透明数据库快照与预期公开API夹具；root BASE用例仅覆盖空schema，不能读取产品迁移实现来构造符合实现的期望||
|OPS-001 批准负载profile的混合API容量|REL-05|NOT_RUN|尚未执行||
|OPS-002 批准持续时间的稳定运行|REL-05|NOT_RUN|尚未执行||
|OPS-003 真实备份与隔离恢复演练|REL-05|NOT_RUN|尚未执行||
|OPS-MAN-001 部署升级及回滚演练|REL-05, REL-02|NOT_RUN|尚未执行||
|OPS-MAN-002 生产身份与部署安全评审|REL-06|NOT_RUN|尚未执行||
|OPS-MAN-003 监控与告警实际到达及恢复|REL-05, REL-03|NOT_RUN|尚未执行||
|OPS-MAN-004 授权版本证据及清理复核|REL-01, REL-02, REL-04, REL-07|NOT_RUN|尚未执行||
|DOC-MAN-001 追加需求台账来源与状态审核|ADD-DOC-01|NOT_RUN|尚未执行||
|UI-023 简介两行纯文本摘要与完整详情|ADD-DIR-03|NOT_RUN|尚未执行||
|UI-024 单页五秒轮询及并发失效合并|ADD-DIR-07, ADD-DIR-11|NOT_RUN|尚未执行||
|UI-025 返回恢复内存条件分页位置及刷新清空|ADD-DIR-09, ADD-DIR-06|NOT_RUN|尚未执行||
|UI-026 注销换身份清除目录会话状态|ADD-DIR-09, R-A6-01|NOT_RUN|尚未执行||
|UI-027 浏览器composition不发中间查询|ADD-DIR-11|NOT_RUN|尚未执行||
|UI-028 前台安静与失焦静态标题favicon|ADD-ATT-02, ADD-ATT-03|NOT_RUN|尚未执行||
|UI-029 加载失败不冒称已确认|ADD-ATT-03|NOT_RUN|尚未执行||
|UI-030 列表范围消失的两阶段确认|ADD-ATT-01, ADD-ATT-04|NOT_RUN|尚未执行||
|UI-031 变化后回原值保留期间变化候选|ADD-ATT-04|NOT_RUN|尚未执行||
|UI-032 提示确认与目录过期相互独立|ADD-ATT-05, ADD-DIR-08|NOT_RUN|尚未执行||
|UI-033 本地手动clientMsgId及早回流归属|ADD-ATT-06|NOT_RUN|尚未执行||
|UI-034 Agent自动消息失焦提醒|ADD-ATT-06|NOT_RUN|尚未执行||
|UI-035 序列自动消息失焦提醒|ADD-ATT-06|NOT_RUN|尚未执行||
|UI-036 编辑卸载迟到结果隔离|ADD-FORM-02|NOT_RUN|尚未执行||
|UI-037 目录微秒及同时间ID跨页边界的确定性数据夹具|ADD-DIR-01, ADD-DIR-05|NOT_RUN|待可复现、经审核的外部数据库快照/数据夹具；禁止用随机创建宣称覆盖||
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
|UI-011 前端并发401单次续期|R-B3-04|NOT_RUN|尚未执行||
|UI-012 群资料纯文本呈现|ADD-META-01, ADD-META-02, ADD-DIR-03|NOT_RUN|尚未执行||
|UI-013 编辑表单dirty关闭保护|ADD-FORM-01|NOT_RUN|尚未执行||
|UI-014 提交中保护及失败保留草稿|ADD-FORM-02|NOT_RUN|尚未执行||
|UI-015 冲突必须明确再次确认|ADD-CONFLICT-04|NOT_RUN|尚未执行||
|UI-016 搜索迟到响应隔离|ADD-DIR-11|NOT_RUN|尚未执行||
|UI-017 多页过期和原子刷新|ADD-DIR-08, ADD-ATT-05|NOT_RUN|尚未执行||
|UI-018 组合筛选clear与reset|ADD-DIR-12|NOT_RUN|尚未执行||
|UI-019 首次错误与成功空结果区分|ADD-DIR-10|NOT_RUN|尚未执行||
|UI-020 失焦提醒和呈现后确认|ADD-ATT-01, ADD-ATT-02, ADD-ATT-03|NOT_RUN|尚未执行||
|UI-021 路由范围销毁|ADD-ATT-01|NOT_RUN|尚未执行||
|UI-022 创建表单关闭保护|ADD-FORM-01|NOT_RUN|尚未执行||

## 缺陷与复测

本轮没有产品失败结果记录；这不表示没有缺陷。

## 报告完整性

未发现未知用例或执行器完整性异常。

## 风险、例外与最终决定

需求澄清、协议缺口及上线待定指标见 requirements/clarifications.md、requirements/release-gates.md。未执行或阻塞的必验项阻止无条件通过。例外需记录批准人、原要求、替代保证、剩余风险、有效版本和复测范围；本报告不自动接受例外。最终上线决定及人工签署单独填写。
