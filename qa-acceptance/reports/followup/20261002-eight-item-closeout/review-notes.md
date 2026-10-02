# 独立证据复核

只读复核，没有新增产品请求、修复或补跑。下列路径均为离线归档 `batches/2026-10-02T01-25-09.419Z-47c5b140/evidence.tar.gz` 内的 `run/` 相对路径；真实模型另列。

## C1-005：完整下载与删除前提成立

| 保留期 | 已观察边界 | 证据 |
|---|---|---|
| 默认30天 | 29.999天保留；30.001天删除；31天控制文件先删除 | `cases/SR-C1-005/variant-1/{3,5,6}-media-age-fixture.json`、`media-cleanup-cycle.json` |
| 配置2天 | 1.999天保留；2.001天删除；3天控制文件先删除 | `cases/SR-C1-005/variant-2/{11,13,14}-media-age-fixture.json`、`media-cleanup-cycle.json` |
| 配置0天 | 完整下载后，同一ID真实deleted、公开路径null、物理文件不存在 | `cases/SR-C1-005/variant-3/18-media-zero-day-boundary.json` |

两侧年龄区间没有跨越阈值。0天源请求200、完整8193字节；源完成01:25:28.280Z，downloaded_at为01:25:28.281Z，download.beforeRows为ready，之后rows和cleanup为同一ID的deleted，physicallyAbsent=true。7、15、19号cleanup-summary均无失败。该证据修复了原先未等完整下载就判断删除的QA前提，原始失败仍留在原签发报告。

## USG011：实际容量而非合成历史

| 边界 | 实际HTTP 200数 | 最终保留记录 | 实际文件字节 | 证据 |
|---|---:|---:|---:|---|
| 10000条 | 10001 | 10000 | 3557934 | `cases/SR-BE-USG-011/variant-20/10170-actual-record-cap-boundary.json` |
| 16777216字节 | 9057 | 9035 | 16775714 | `cases/SR-BE-USG-011/variant-21/19235-actual-byte-cap-boundary.json` |
| 4096字节 | 33 | 2 | 3714 | `cases/SR-BE-USG-011/variant-22/19276-actual-byte-cap-boundary.json` |

这三个容量变体共19091次本地HTTP请求，均200。syntheticHistoryRows=0、paidCalls=0。每波最多4个在途请求，符合公开容量约束；32条是造数批次大小。完整wire账本为用例根目录的10174、19239、19280号 `provider-wire-complete-ledger.json`；对应10175、19240、19281号 `provider-offline-auth-validation.json`均验证合成凭据匹配。

记录边界淘汰最老一条并追加新记录，数量仍10000。字节边界实际新行1857字节，16775714+1857超过16777216，3713+1857超过4096；断言核对精确保留后缀，不能仅因文件较小判通过。

三个变体各正常退出并保持session目录，再由新进程启动；PID分别30759→31610、31652→34320、35478→35521。`provider-identity-1.json`和`provider-identity-2.json`记录真实重启。冻结QA脚本重启后读取实际文件并严格比较完整保留记录，成功后才写10171、19236、19277号 `actual-capacity-completion.json`。未单独归档最终完整JSONL镜像；有限观测事件历史也发生正常截断，不能宣称保留全部观测事件。完整HTTP/wire账本、真实文件读取断言和完成标记是本项证据基础。

`usage-obligations-summary.json`的records-1、records-2、configuration、retention-input、actual-capacity五项均PASS。全部44份清理JSON未报错；三个容量变体退出码均0。整个USG011持续264404.228ms、attempt=1，无自动重试。

## UI025：保留阻塞，不夸大局部正确观察

用例目录 `cases/SR-UI-025/` 包含trace、A页ui.ndjson和 `peer-entity/ui.ndjson`：

1. 同admin公共身份、真实排他focus、A/B各自有更新成立。
2. trace `call@691`摘要点击有input和click done；`call@705`第一次刷新曾等待节点稳定并重新定位，最终25610.979ms performing click，25613.609ms done，实际发出。
3. A日志ord9（01:25:34.485Z）记录remaining=1，余下通知为“执行步骤有更新。正在核对…”。
4. `call@721`第二次点击从25646.817ms开始，25707ms不稳定，25774.951ms detached，之后到40647.058ms超时。该次没有input、performing click或click done，未实际派发。
5. 结束A日志ord11为安静标题、无notice；B日志ord2仍为“有更新”并保留两条notice；均无pageErrors或routeErrors。清理failures为空。

A实际确认后通知消失，QA按剩余数量继续点击，与异步通知撤下竞争。缺少A确认完成的正式断言、A返回群后B仍pending、B独立确认／返回及最终身份核对。不能据A安静/B仍pending的片段判整例PASS；也没有产品拒绝点击或串清B的有效证据。维持原始BLOCKED，按最终停止指令不再改脚本或复验。

## C2-017：最小真实调用证据

真实批次：`batches/2026-10-02T01-31-12.546Z-live-a27892ae/`，9份原件全部归档。

`real-synthetic-turn.json`为HTTP200，tool_use包含唯一ID及get_recent_messages(limit:10)；`real-synthetic-audit.json`为HTTP200、合法verdict和reason，body/rawBody对应。生成工具未执行。

`live-transport.ndjson` seq2/8先分别预留360448/720896微美元，再于seq3/9创建native请求；seq4/10为TLS443发送边界，seq5/11为bodySent，seq6/12实际200头。仅attempt1/2，无denied/error/fallback。这里“无重试”指没有再次发起用例或HTTP/model请求；浏览器action内部的稳定性等待不等于新增用例尝试。

`actual-usage.jsonl`仅两行、不同attemptId：turn 707+41=748，audit 204+36=240，模型一致，stage为validated-generation，outcome均success。该usage为产品实际记录；未独立拦截或改写上游响应body，未把它当供应商账单。

seq14记录guard-process-exit，manifest exitOutcome为code0/signalnull，ownedRuntimeRemoved=true、cleanupErrors为空；根目录 `cleanup-and-evidence-check.json`另记录两PID不存在、专属运行目录不存在、SUT干净。TLS账本的198.18.0.123是当前网络路由的观测，不宣称直连供应商物理IP或独立完成证书审计。

此用例仅新增当前候选的最小真实模型协议证据。全Agent循环、所有工具、模型质量、长稳、生产准备和真人体验仍不能由它代替。
