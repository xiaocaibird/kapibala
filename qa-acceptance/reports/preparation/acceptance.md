# 独立 QA 验收报告

需求符合性：**INCOMPLETE**；上线准备度：**INCOMPLETE**。

本报告是准备状态清单，未启动或连接被测系统，不能用于宣称产品验收通过。

准备状态专项登记 24 条：脚本可进入后续授权试跑 11；仍缺工程/夹具接入 13；业务口径待决 0。这是准备状态，不是产品执行结果。自动化数量增加不能解释为这些依赖已解决。

- 范围内用例：247；通过 0，失败 0，阻塞 0，未执行 247。
- 方法登记（非就绪统计）：自动化 237，人工 10，尚缺完整执行方案 0，候选 5。
- 有用例覆盖、实际执行和通过率分别统计；跳过、缺少浏览器项目、缺少环境均不作通过。JSON另列required/release/candidate各范围计数及已执行通过率；多范围用例分别计数，不可直接相加。

## 版本、环境与授权

```json
{
  "phase": "preparation",
  "sutExecutionAuthorized": false,
  "productTestsExecuted": 0,
  "qaTree": {
    "sha256": "16fa05c43f5e8e618fa90d6877b4bc3576aca92264148306d79bd2e3ad82ebd7",
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
        "sha256": "1478b40b7974ccebd0da697a3a38d72423108b4ae740373815318d4667d57442"
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
        "sha256": "9a73dc870406caea69309b5fc9ee8f084c37170c954827ddbeca0ff7e3315e21"
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
        "sha256": "8e757f798887e88d9bbe87629f506321872384c1f4f59f7e020a421d4a0eb32a"
      },
      {
        "path": "cases/foundation.json",
        "sha256": "56e39ef944c862aa0439c96bae47e5fa5ee834068123e144ea4494100c720a74"
      },
      {
        "path": "cases/generated/architecture-capacity.md",
        "sha256": "ed52781697bccbb040157031fa3595e45a15b792871a3b95ffaba0a2f1c31d74"
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
        "sha256": "c38a11fb227b7ffb8fc60768c267745c81d9c719a130ba5f004d988084d4f88a"
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
        "sha256": "8219fbba27b0de6fcfc46c009cf9cc2651018cecd033923029f4e434aca9a077"
      },
      {
        "path": "cases/generated/foundation.md",
        "sha256": "947dac820cbdd69ebd66f7100862fe34496a4710405275e40b502f5fe7324150"
      },
      {
        "path": "cases/generated/integration-diagnostics.md",
        "sha256": "355d1ea290cbb754de378f21c5b6c9e123c9a052dbfcea6c94b3fb257d131db9"
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
        "sha256": "ea4c088b3427cd70f04bb1f62b173bbcc2f1eca1150622550b1c636727a81460"
      },
      {
        "path": "cases/generated/spec-boundaries.md",
        "sha256": "fdbdb1f133788378d3f1a771578503aa5a7547a8f3e4a5a10c46b5120c883080"
      },
      {
        "path": "cases/generated/ui-extra.md",
        "sha256": "d5a5213158c4e5d6084e5f57fd14cc09eb5e7961d1190f57879dbb505067de75"
      },
      {
        "path": "cases/generated/ui.md",
        "sha256": "29e54a2c48e04893c3f7b515761b8d2b299df9c81d9a311fd0b946dee5b93331"
      },
      {
        "path": "cases/integration-diagnostics.json",
        "sha256": "11d29d4931c38d3a59f891e16febba15e8109bf14939b86e162a3772ce953986"
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
        "sha256": "2f7c854c69baad8aa143b5e5f5f8c5cf8e7303bc9e5f56b2436b14aa9880d4bb"
      },
      {
        "path": "cases/spec-boundaries.json",
        "sha256": "5a90daa846daa1678b6bdaaf7648588cd2113c0db2864994c3d0696d6cc2bb84"
      },
      {
        "path": "cases/ui-extra.json",
        "sha256": "c4d0ec4dd3d14c1041b0e023abbed867a24d8e78203ff5a8e530a257e2a0b1f8"
      },
      {
        "path": "cases/ui.json",
        "sha256": "e14d75c609c9bae18f05b9ee84a530f6844a83f6a572fb1b7f4b2ad646358fb1"
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
        "path": "config/fixtures.example.json",
        "sha256": "ee59614befde0df4a56c627c2813802448ad9293c8b1a600a1d730e9010bd013"
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
        "path": "config/target.example.json",
        "sha256": "f0cfc7ff8cf3d372e1fa5578fa7cbdb41cb87b2082c68062b68fe1660b0475ba"
      },
      {
        "path": "config/target.integration-993f758.json",
        "sha256": "e3588fa34e3add96e200521acdc71223cb75baa44b330462dc2c62e7adaf03ca"
      },
      {
        "path": "contracts/capacity-observation.md",
        "sha256": "0f8cc16469aaf2e0b761f6965d612a5ccb4a314e696defa15f5b05aa7d4290c9"
      },
      {
        "path": "contracts/fixture-artifacts.md",
        "sha256": "caa28d6b83ffb1235fbb1e1c9c8dc3656880acdd4ba3038950ca2dc87d46bcf7"
      },
      {
        "path": "contracts/public-api.ts",
        "sha256": "85d5069b89869e9aff6a6ba3e64b913630f810e32783aac3e2ff8a43e3bc84a2"
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
        "sha256": "ae0997be4cbedc692e74b987e31d1912f689bfb904d46c37c89c95a434c29cd0"
      },
      {
        "path": "harness/database.ts",
        "sha256": "8bf8b5fb1c8121fa73e335446015278e67dbeb82f27f62f9ce6bf4f98c9d6ace"
      },
      {
        "path": "harness/environment.ts",
        "sha256": "375879485199a34b78aa376a5eb8aa7cf83e0b1e2a99e8649a30e9a053cd9458"
      },
      {
        "path": "harness/execution-gate.ts",
        "sha256": "743ee9ef26a3e1cb69944dadbb528e2cd60718c3aa8beb873ddd12b445c21437"
      },
      {
        "path": "harness/execution-plan.ts",
        "sha256": "428db84da8047471dcebf601ea7186468f86ae18cbc783b51eb0a13230ba4c3f"
      },
      {
        "path": "harness/fixture-artifacts.ts",
        "sha256": "2c959275286d2a337f7257385ee79ad6b721d15055e22cd179ef49aeb6f6a3d8"
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
        "path": "harness/observation.ts",
        "sha256": "8fc04d7fffc3bfb023d77368cb1979a17331322f25d6dc6b7498080079fe27b8"
      },
      {
        "path": "harness/platform-client.ts",
        "sha256": "c76cccacc3245b83e21fa9ce78d13f74904cc6af094ab0d0a5bd2b9c4aff31e9"
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
        "path": "harness/recovery-drill.ts",
        "sha256": "f9934e587a58e5f30bbc3151114c89c68beb2252c6c64a273028a620390313ec"
      },
      {
        "path": "harness/render-cases.ts",
        "sha256": "b83e78b005aabe2cd2f9a45c394d10e5ef0b1009f0b3ddd1e97d1e365c830dd7"
      },
      {
        "path": "harness/report.ts",
        "sha256": "da209b5752c4bde87c28b6ea9c1c030285e082ded7ba95c6274047ad97a9da42"
      },
      {
        "path": "harness/reporter.ts",
        "sha256": "9cd59b41071aedae085b46bea8c0c46b69ce04efc2e7c7589d02d541fc6f7794"
      },
      {
        "path": "harness/security.ts",
        "sha256": "296f28438f92ee2951a97c3c296fdc4f098b3b1c11ef9f3531db7763eecff1f2"
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
        "sha256": "4cf3a35cb633052f2405bfdf4bed2280f93c02d6c3e37105e566556fc581be92"
      },
      {
        "path": "harness/verify-tools.ts",
        "sha256": "d19cb49593f32f93832d59663f812a3b6a0e793d58ec9c60d73fb798abc21075"
      },
      {
        "path": "package-lock.json",
        "sha256": "7462a4670d1e4036156d1639ebfeaa0cd4276bc918d1b805b3677d862c2cb883"
      },
      {
        "path": "package.json",
        "sha256": "07d5d8a19130d7e7037da29184929f07fe2fb797a84959bc4e18c74ce9aa4df1"
      },
      {
        "path": "playwright.config.ts",
        "sha256": "4a063f59db9037042c62f6e4df550e53972db3edf9a5923a06a4304df84c245e"
      },
      {
        "path": "README.md",
        "sha256": "92b82d0a7053abadb31a79b026fd4a740fde88fb16567319b62b6db6f1aec553"
      },
      {
        "path": "requirements/architecture-impact.md",
        "sha256": "8be2e077a3d5c68cd4067fb689f241fffcd816f69dcf404388abebf6a4e57477"
      },
      {
        "path": "requirements/baseline.json",
        "sha256": "d11dee52636dc11f4edf1a9f3821faaf252740cf1b5a046addfef3286c8815ea"
      },
      {
        "path": "requirements/blocker-reassessment.md",
        "sha256": "f2c901aa22aaa72448673245574ff06f5a591ab9f5ddf74d444761c4e92e7404"
      },
      {
        "path": "requirements/catalog.json",
        "sha256": "5d7928762c0849a4f5c8d454ec0b841891c2f0085d864c43a8ce4198d7ef9fbe"
      },
      {
        "path": "requirements/change-reviews.json",
        "sha256": "53b9df114e98c5ac2356c33d883f38a5a6101245a359d53fe38f44bc70f21bde"
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
        "path": "requirements/integration-intake-20261001.md",
        "sha256": "56ff7d3abe48e51cef0a040ace49ffc270d77e230e9b67adf5888e5728fdcc72"
      },
      {
        "path": "requirements/integration-risk-review-20261001.md",
        "sha256": "64e7710dbe5f6ea94f28d4e64ce980d326430060f9d11f18f52158fe7e282977"
      },
      {
        "path": "requirements/left-members-decision.md",
        "sha256": "691a8f1445ad7a93bd5ca88085b9a64ec3ba6aae9cbb1e598cab583e9101af20"
      },
      {
        "path": "requirements/release-gates.md",
        "sha256": "0757bbe778819225ca5106cade3bd13ae70e2458dfe5ea2d3501682771f19a40"
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
        "sha256": "df69822281c3760145879451f5008a464867e5250c3bc497e6d488bcbb9e467d"
      },
      {
        "path": "sharing/README.md",
        "sha256": "6c90def8d1a51642a42bd2460635e57abfd0c9c6cf75aa212d49374b58403ee8"
      },
      {
        "path": "sharing/suites.json",
        "sha256": "bce28f1da283a44b579105a86e36d7017e35120f3f8689f84ac86e7852aac235"
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
        "sha256": "85609e4f22e9172777eff6fa8c385fa05721d3f053a2109cfe03e77311ac972e"
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
        "sha256": "e0a10beb75d099ff759699f094da8e4834c451f535308bcac95624c0167735bb"
      },
      {
        "path": "tests/foundation/contracts.spec.ts",
        "sha256": "71ee7c6145688fb2b662241366252a14a654874dc69c4bf8ccf965cb8267b847"
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
        "path": "tests/self/authorization-projects.test.ts",
        "sha256": "8da85c9c1a06b07468b7c679007b48ec8aec40c69e99e8ffade85b3ba842ecb4"
      },
      {
        "path": "tests/self/capacity-control.test.ts",
        "sha256": "11d5e0c6cf9836d25ffa348bd12ece0f3cb693bef7e5cf67f8cb18ca1a7076aa"
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
        "path": "tests/self/fixture-artifacts.test.ts",
        "sha256": "6ffbf445060266b2e04d4f84dde140c94dc809119fd97794bfda408dcb597301"
      },
      {
        "path": "tests/self/infrastructure.test.ts",
        "sha256": "4a6abe6ba45f61c65c05869420816330301e0a2dc9fb44a95a6076681f56a6ad"
      },
      {
        "path": "tests/self/observation.test.ts",
        "sha256": "7bdd33818f79f012ee260f4c38aed6c04271fb99e1783a5e73ef84a8aafde2d9"
      },
      {
        "path": "tests/self/preflight-execution.test.ts",
        "sha256": "32570c7c6d5810f81403e97a97e39da81cbe4eb0f610ae202b0ba54e42a59c3d"
      },
      {
        "path": "tests/self/preflight-report.test.ts",
        "sha256": "ec6925b6f18a1245215f5bb727facf9f559d49cc802b3011b807aff610cf36de"
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
        "path": "tests/self/suites.test.ts",
        "sha256": "5848bd23bc908ceea04a92229b10a710dd0a2f5c037709eaa5fe7db6a1264ec8"
      },
      {
        "path": "tests/support/sequence-timeout-policy.ts",
        "sha256": "c67626de6102f62ec16ac3c7d4973947d09b8fd3add128b200c7e59f2b4aeaf1"
      },
      {
        "path": "tests/system/agent.spec.ts",
        "sha256": "5550fa7a986332300cca2a6224f3de8bb2f8fa2213a4da660f8e5a374a9a4613"
      },
      {
        "path": "tests/system/capacity-control.spec.ts",
        "sha256": "9e467cdfcfd8cd2a9667f6c35c6154ab6bda9117f06542d6b325b3efd0ce0c64"
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
        "path": "tests/system/protocol-boundaries.spec.ts",
        "sha256": "56ec359ef23e9fe05d4aaf2b80c892c7659919f1cec8fbc809f969a555cbc4af"
      },
      {
        "path": "tests/system/recovery.spec.ts",
        "sha256": "1911640e16571ad889f8899450c4b3f3975036683f2f83255e7ff2c1d0f347bf"
      },
      {
        "path": "tests/system/sequence-failure-policy.spec.ts",
        "sha256": "0938403559f31420f1a6b68144c76b49cc34a8510b054d2a66a4b3b9ed15de4d"
      },
      {
        "path": "tests/system/sequence.spec.ts",
        "sha256": "cfcf92bbc0a3ae007ee2c20cf36fa871fe5f4c89e036f2d9e49270438f527875"
      },
      {
        "path": "tests/system/spec-boundaries.spec.ts",
        "sha256": "372161bb7b08813065e7b7168241f7ece148a275047bed93af9f9d0935566748"
      },
      {
        "path": "tests/ui/architecture.spec.ts",
        "sha256": "f258875b7d7582433e7deaee05c8e2d1172c1122319080d40947a31cb6151ea4"
      },
      {
        "path": "tests/ui/console.spec.ts",
        "sha256": "b318f886a43ed028e2d62a1b4b3208698849bbfa1d2862639111e3ad2fb2e936"
      },
      {
        "path": "tests/ui/observation-boundaries.spec.ts",
        "sha256": "2be9efe6eb097a39848bac06563e3ce5d454c3eaea5dd4878196818ccfadd66f"
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
      }
    ]
  }
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
|CAP-002 容量等待期间关闭 Agent 的取消边界|ENG-ADMISSION-01, R-A5-13|NOT_RUN|尚未执行||
|CAP-003 持续容量拒绝计入原 60 秒活动预算|ENG-ADMISSION-01, R-A5-05, R-A5-06|NOT_RUN|尚未执行||
|CAP-004 容量等待期间关闭踢人政策再次检查|ENG-ADMISSION-01, R-A5-07, R-A5-09|NOT_RUN|尚未执行||
|CAP-005 容量等待期间群变不可写阻止迟发踢人|ENG-ADMISSION-01, R-A1-04, R-A5-13|NOT_RUN|尚未执行||
|CAP-006 容量等待后在线、成员与管理员资格复核|ENG-ADMISSION-01, R-A1-04, R-A5-08|NOT_RUN|尚未执行||
|CAP-007 容量等待中目标退出或重新加入后按同一用户身份完成移除且不重复|ENG-ADMISSION-01, R-A5-09, R-A5-11|NOT_RUN|尚未执行||
|CAP-008 容量延期后真实网关群主或权限错误仍按原业务契约返回|ENG-ADMISSION-01, R-A5-09|NOT_RUN|尚未执行||
|CAP-009 容量已拒绝但 ready 持久化之前崩溃的恢复|ENG-ADMISSION-01, R-A5-11|NOT_RUN|尚未执行||
|CAP-010 已派发且2秒内收敛的504踢人遇容量压力不退回重放|ENG-ADMISSION-01, R-A5-09, R-A5-11|NOT_RUN|尚未执行||
|ARC-API-001 序列定义的独立严格输入矩阵|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-API-002 序列启动的键类型边界与失败后可重试|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-API-003 序列启动缺省变量对象兼容|ENG-CONTRACT-01, R-B1-02, R-A0-03|NOT_RUN|尚未执行||
|ARC-UI-BLK-001 通用资源读取失败不能提交成功快照或提前确认未呈现提醒|ENG-READ-02, ADD-ATT-03|NOT_RUN|尚未执行||
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

## 准备依赖专项登记

|用例|准备状态|责任方|待办与边界|
|---|---|---|---|
|CAP-001|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-002|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-003|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-004|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-005|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-006|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-007|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-008|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-009|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|CAP-010|dependency-pending|工程提供观测/控制接入，QA绑定与验收|操作与断言脚本已实现，尚无真实工程容量控制器；需真实占用/释放、实例归属、run/step拒绝关联证据；CAP-003活动时间和CAP-009精确窗口见contracts/capacity-observation.md；fake-controller自测不证明工程接入或容量场景已触发|
|ARC-UI-BLK-001|dependency-pending|QA|账号通用读取失败与提醒确认脚本已实现；尚需授权后确认候选真实页面定位及消费者关联，adapterConfirmed当前不代表已确认|
|BLK-MIG-001|dependency-pending|QA与候选交付方|解析、恢复与断言已实现；真实版本化dump及独立manifest尚未提供；制品双哈希和对应版本/出处需按contracts/fixture-artifacts.md准备；授权后仅导入本轮新建专属库|
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
|UI-037|dependency-pending|QA与候选交付方|解析、恢复与断言已实现；真实版本化dump及独立manifest尚未提供；制品双哈希和对应版本/出处需按contracts/fixture-artifacts.md准备；授权后仅导入本轮新建专属库|

## 缺陷与复测

本轮没有产品失败结果记录；这不表示没有缺陷。

## 报告完整性

未发现未知用例或执行器完整性异常。

## 风险、例外与最终决定

需求澄清、协议缺口及上线待定指标见 requirements/clarifications.md、requirements/release-gates.md。未执行或阻塞的必验项阻止无条件通过。例外需记录批准人、原要求、替代保证、剩余风险、有效版本和复测范围；本报告不自动接受例外。最终上线决定及人工签署单独填写。
