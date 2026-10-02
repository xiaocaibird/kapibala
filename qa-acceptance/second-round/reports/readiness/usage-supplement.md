# Usage 补充接入（准备态）

状态：`NOT_RUN`。该文件不是产品验收结果。未修改冻结执行树，也未执行产品。

## 独立入口

- `harness/provider-usage-supplement.ts#runUsageKeyFileIsolation(context)`：真实启动冻结 SUT 的 `apps/gemini-agent/src/main.ts`，每个变体重新核验执行授权。只创建本次私有合成 Key 文件；Key 文件故意含与进程配置冲突的 usage 开关、非法限额、非法 model/port 和另一个自有目录。验证真实 main 正常启动、默认私有 usage 空文件或显式 false 下无 usage 目录、无误用其它配置、哨兵与 Key 文件未变。只请求 health 与被拒绝的非法 turn，不发起有效生成；不读用户 .env。严格出站观察允许列表为空，核对实际进程与完整正常退出尾部，记录零 HTTP/出站 TCP 尝试。该有限分支与既有离线实际调用矩阵合用；它单独不代表完整 USG006/010 通过。
- `harness/provider-usage-supplement.ts#runUsageCapacitySupplement(driver)`：三个独立环境，覆盖 10000 条、16777216 字节及 4096 字节边界；通过实际服务 HTTP→真实 provider→QA 本机 HTTP 桩→真实 journal 生成记录。单批最多 32 请求、前一批真实 drain 后再发下一批，记录实际 drop/write failure。条数变体真实产生 10000+1 次 audit，检查最旧一条被淘汰。字节变体使用 512 字符的合法多字节 runId，最多 10000+1 次 turn，在条数上限之前实际越过 16 MiB 后验证 JSONL UTF-8 字节及原始记录后缀；随后真实重启核对记录一致。

三类容量实验最多 20035 次**本机模拟调用**，不是真实供应商调用，不产生任何计费结论。每行都必须由本次真实请求生成，夹具历史行数为 0。没有修改日志、日期、业务结果或系统时钟来制造容量通过。实际字节界若在合法输入下未触发，会保留 `BLOCKED`，不会把合法配置被接受当成达到上界。

## 集成边界

USG006 仍需既有权限／临时文件／关闭记录场景及另一 UID 补充一起评估。USG010 仍需既有实际 main/factory 入口矩阵。USG011 仍需既有配置上下界、低字节界及年龄场景；本补充负责最大实际条数／字节。年龄的显式持久化输入与自然经过完整保留天数的观察不能混写。已在原 USG runner 接线：USG010 执行旧矩阵及 Key 文件分支；USG006 执行旧权限、临时文件与 Key 文件，另 UID 未合证继续 BLOCKED；USG011 收集配置、年龄输入与实际容量全部子项，任一失败／阻塞不跳过其它可做子项。根报告必须保留各子项证据，不能用单个入口覆盖原先未测项。

## QA 自检

- `second-round/tsconfig.json` 类型检查通过。
- media QA 自身测试共 53/53 通过，包括合成配置分歧、多字节 ID、JSONL 字节／后缀 oracle、真实 QA 子进程 SIGKILL 取证，以及 writer close 的认证空 POST、真实关闭事件和后继拒绝 ID 要求。
- `git diff --check` 通过。

## C2-015 writer close 接线

已按研发确认的 POST `/qa/usage/v1/writer/close`（既有 Bearer＋instance、空 body、重复幂等）接独立观测 client 与 factory。收到 `closed:true` 后仍要求完整真实 closing/closed 事件，再通过公开 audit 请求实际触发一次推理；只有唯一后继 rejected-closed 含真实服务内 requestId/attemptId、独立 HTTP 桩调用增一、业务响应成功、文件原始 hash 不变且无新入队，才完成该子项。当前固定源码交付尚待根任务核验，缺事件／ID／实际关闭控制仍 BLOCKED；无产品试跑。

## 子义务合证清单

每个 USG006/010/011 子义务均保存 `usage-obligations/<exact-name>.json`，含独立状态、时间、固定 SUT 版本和本子项新生成的实际证据路径。最终 `usage-obligations-summary.json` 保留 exactNames、逐项 PASS/FAIL/BLOCKED、计数及合证规则。失败不截断后续；FAIL 优先；没有新执行证据不能 PASS。foreign UID 补件只允许核对同候选后满足唯一 `foreign-uid-proof` 项，其余所有列名必须各自 PASS，历史结果文件不覆盖。追加报告器自测 1/1 通过，验证失败后继续执行、真实文件引用和状态优先级。
