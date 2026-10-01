#!/usr/bin/env python3
"""Publish a version-separated delivery assessment from signed QA evidence only.
Never starts a service, connects a database, or modifies original test results.
"""
from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, shutil

P=Path(__file__).resolve().parent
Q=P.parents[2]
B=Q/'reports/acceptance/20261001-2716abd-business'
D=Q/'reports/followup/20261001-8e047-retest'
inputs={}
def read(path):
 b=path.read_bytes();inputs[str(path.relative_to(Q))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 return json.loads(b)
baseline=read(B/'adjudicated-results.json')
delta=read(D/'summary.json')
latest=read(D/'latest-results.json')
binding=read(D/'main-product-version-binding.json')
cleanup=read(D/'resource-cleanup-review.json')
assert delta['state']=='FINAL_DELTA_REPORT'
assert baseline['conclusions']['businessConformity']=='FAIL'
assert delta['sutRevision']==binding['fixedSut']==cleanup['sutRevision']
assert binding['productTreeUnchangedSinceCandidate'] and binding['productDiffBytes']==0
assert delta['finalizationDependencies']==[]
assert len(latest['latestUniqueCases'])==51 and len(latest['executionHistory'])==62
now=datetime.now(timezone.utc).isoformat()
groups=[
 {'id':'QA8E-D01','severity':'P2','title':'工具实际等待超过原始5秒上限','cases':['AGENT-028','INT-READ-001'],'facts':'普通发送工具 [5001.359666,5001.471375] ms；真实数据库持锁样本 [5000.443875,5000.529792] ms。实际结果就绪已超限，不将 COMMIT 尾段计入违约下界。','evidence':['backend-review/backend-review.md','review/delivery-read-corrected-attempt-review.md']},
 {'id':'QA8E-D02','severity':'P1','title':'kick远端结果未记录后原run明确暂停续跑','cases':['BLK-EXT-004','REC-007'],'facts':'实际副作用与完整故障链已取证；公开恢复说明明确暂停，原任意时刻重启续跑承诺未满足。未以有限轮询时间发明恢复期限。','evidence':['review/recovery-adjudication-three-cases.md']},
 {'id':'QA8E-D03','severity':'P1','title':'模型响应未记录即中断后原run明确暂停续跑','cases':['BLK-EXT-005'],'facts':'消息/历史保留，但原任务不自动续跑。要求不包含模型逐字确定性重放；保守暂停的工程方向已决定，原验收标准未因此改变。','evidence':['review/recovery-adjudication-three-cases.md']},
]
actual={x['id']:x for x in latest['latestUniqueCases']}
assert {cid for g in groups for cid in g['cases']}=={cid for cid,v in actual.items() if v['status']=='FAIL'}
for g in groups:
 g['evidence']=['../../followup/20261001-8e047-retest/'+name for name in g['evidence']]
 assert all((P/name).is_file() for name in g['evidence'])
 g.update({'status':'OPEN_CONFIRMED_ON_FIXED_8E','sutRevision':delta['sutRevision'],'reproduction':'执行绑定的独立冻结用例与目标；固定用例步骤、故障时点和原始错误上下文见所选 run 的归档及 latest-results.json。','caseResults':[actual[cid] for cid in g['cases']]})
historical=[{'caseId':cid,'status':'NOT_RETESTED_ON_8E','firstResult':'FAIL','basis':'2716 full acceptance','interpretation':'仍需关闭/复验；不宣称本候选已重现，也不导入旧版本PASS。'} for cid in ['INT-MSG-007','BLK-EXT-002','BLK-EXT-003']]
pending=[{'caseId':'BLK-EXT-001','status':'BLOCKED_ON_2716_NOT_RETESTED_ON_8E','reason':'缺未落地分支的权威结果或明确永久停止证据；有限观察不能证明永久不恢复。'},*historical,*delta['pendingGaps']]
pending.append({'id':'GAP-RUNNING-SECOND-INSTANCE-COMPETITION','status':'NOT_RUN','scope':'预算×已派发kick期间的运行中第二实例竞争未测，单独登记，不作为两因素专项关单的新必要条件；终态后启动第二实例不能证明运行中竞争。','owner':'QA覆盖补强','notInExecutedCounts':True})
result={'formatVersion':1,'reportState':'FINAL_DELIVERY_ASSESSMENT','issuedAt':now,'currentProductCandidate':delta['sutRevision'],'observedMainAtVersionBinding':binding['observedMain'],'conclusions':{'businessConformity':'FAIL','unconditionalAcceptance':False,'productionReadiness':'NOT_ASSESSED','fullBusinessRerunOn8e':'NOT_CLAIMED'},'baselineFullAcceptance':{'sutRevision':baseline['basis']['candidate'],'cases':254,'counts':baseline['metrics']['adjudicatedCaseCounts'],'requirements':116,'requirementCounts':baseline['metrics']['adjudicatedRequirementCounts'],'report':'../20261001-2716abd-business/report.md'},'currentCandidateDelta':{'scope':'51独立用例/59用例项目最新义务，保留6run/62历史执行；不是新版254条完整复跑。','counts':delta['latestReviewedUniqueCases'],'obligations':delta['latestReviewedObligations'],'rawHistory':delta['rawExecutionHistory'],'reviewedHistory':delta['reviewedExecutionHistory'],'report':'../../followup/20261001-8e047-retest/report.md'},'currentConfirmedDefects':groups,'historicalUnclosedNotRetested':historical,'pendingItems':pending,'cleanup':cleanup,'inputIndex':inputs,'automaticRetries':0,'productionGatesExcluded':7,'C1C2CandidateCasesExcluded':5,'paidModelCalls':0}
(P/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(P/'defects.json').write_text(json.dumps({'formatVersion':1,'issuedAt':now,'candidate':delta['sutRevision'],'counts':{'groups':3,'affectedFailCases':5,'P1':2,'P2':1},'confirmedCurrent':groups,'historicalUnclosedNotRetested':historical},ensure_ascii=False,indent=2)+'\n')
(P/'pending-items.json').write_text(json.dumps({'formatVersion':1,'issuedAt':now,'items':pending,'settledDirections':'D039–D042及D047已有决定，不重问工程/账号/模型方向；标准不符合仍保留。H18有限四态认可不重开；完整真人证据不代签。'},ensure_ascii=False,indent=2)+'\n')
for source,name in [(B/'adjudicated-results.xml','2716-full-reviewed.junit.xml'),(D/'reviewed.junit.xml','8e-delta-reviewed.junit.xml')]:
 b=source.read_bytes();inputs[str(source.relative_to(Q))]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)};shutil.copyfile(source,P/name)
bc=baseline['metrics']['adjudicatedCaseCounts'];dc=delta['latestReviewedUniqueCases']['counts']
text=f'''# 当前交付版本独立 QA 验收报告

**业务验收结论：FAIL，不满足无条件通过；上线准备度另算，本轮未评估。** 联调、全量业务测试、修复版本差异复测及证据审定已经完成，问题没有中断后续测试。报告签发时间为 `{now}`（UTC，北京时间加8小时）。

当前固定产品候选：`{delta['sutRevision']}`。核查 main `{binding['observedMain']}` 的产品路径与该候选无差异；后续文档提交没有改变本次被测产品。[版本绑定](../../followup/20261001-8e047-retest/main-product-version-binding.json)。

## 执行范围与结果

| 独立执行阶段 | 固定产品版本 | 用例结果 | 结论范围 |
| --- | --- | --- | --- |
| 完整业务验收 | 2716abdd | 254条：{bc['PASS']}通过、{bc['FAIL']}失败、{bc['BLOCKED']}阻塞 | 116条需求：97通过、12失败、7阻塞 |
| 修复版本差异复测及补证 | 8e047aea | 51条最新结果：{dc['PASS']}通过、{dc['FAIL']}失败、{dc['BLOCKED']}阻塞 | 59个最新项目义务；保留62条实际历史记录 |

两个阶段分别冻结 SUT、QA源、环境配置和证据，自动重试均为0。新版复测覆盖预算、容量、恢复、工具等待、数据库持锁及相关浏览器行为；**没有把旧版通过项移植成新版全量通过，也没有把两种版本相加生成通过率**。首次测试前提错误、修正提交、独立复测均保留。

- [完整业务报告、逐项结果、需求追踪和原始归档](../20261001-2716abd-business/report.md)
- [修复候选差异报告与全部复测历史](../../followup/20261001-8e047-retest/report.md)
- [本报告JSON](summary.json)、[缺陷详情](defects.json)、[剩余事项](pending-items.json)
- 分版本JUnit：[完整业务](2716-full-reviewed.junit.xml)、[修复候选差异](8e-delta-reviewed.junit.xml)

## 已验证的修复

单进程预算停止、真实容量拒绝等待预算及安全阶段崩溃续跑分别通过。跨 epoch 活动上界包含未证非活动的启动间隙，原3步续接至7步，未重复外部请求。证明限于本次实际场景，不外推为任意故障的全面保证。

已成功发消息后再进入审计阻塞的页面说明通过；真实排队后的零步骤 failed/cancelled 两种页面分别通过。最终两种状态均没有模型派发、审计、send/kick或自有消息效果，原活动引用已清空，页面显示“暂无步骤”并不再提示等待第一步。首次数据库 OID误判和重复浏览器登录是 QA错误，原始结果及独立归因保留，不记作产品缺陷。

## 本候选仍不符合的要求

| 缺陷组 | 严重度 | 本候选已确认的用例 | 事实 |
| --- | --- | --- | --- |
| 工具等待超限 | P2 | AGENT-028、INT-READ-001 | 真实等待区间分别为5001.360–5001.471ms、5000.444–5000.530ms，超过原5000ms上限；没有自创容差 |
| kick未知结果后暂停 | P1 | BLK-EXT-004、REC-007 | 明确停止原run自动恢复，不满足原任意重启续跑要求 |
| 模型响应未知后暂停 | P1 | BLK-EXT-005 | 原run明确暂停，未自动续跑；不是要求模型确定性逐字重放 |

共5条失败归为3组当前已证缺陷。数据库锁释放后消息sent、同key恢复和历史收口正常，审计/send/落地各一次；精确工具到PG查询及ROLLBACK的因果关联仍缺证，不能把该细项缺证变成整体PASS，也不能掩盖已证超限。[持锁专项独立复核](../../followup/20261001-8e047-retest/review/delivery-read-corrected-attempt-review.md)。

D039–D041 已决定采用保守处理的工程方向，该方向不自动构成对原强恢复承诺的偏差接受；本报告不重复要求选择方案。若将来按例外接受，应另留具体版本、影响和接受决定，技术FAIL不改成PASS。

旧完整验收的首次接收落盘前崩溃排期、建群未知结果及提权未知结果尚未在8e差异子集重跑，列为 **NOT_RETESTED_ON_8E**。旧版事实保留，但不伪装成新版已重现或已修复。

## 剩余证据与范围边界

BLK-EXT-001 未落地分支缺权威终态，仍需补证。“预算逼近上限×已经派发kick”两因素专项未执行；运行中第二实例竞争作为额外交叉范围单独登记，终态后启动实例不能证明它，也不将该第三因素变成两因素专项关单的新必要条件。多个分别通过样本不能合成组合通过。真实IME、跨应用焦点及完整真人UX三项没有代签；已关闭的H18四态有限体验不重新打开。

7条上线门禁及5条C1/C2候选用例不计入本轮结果。媒体30天与Gemini方向已有决定，真实模型未执行、没有模型费用。性能容量、持续运行、RPO/RTO、备份恢复、监控及部署回滚需要单独上线评估。

## 清理与归档

8e六个run的62个隔离环境均有 cleanup.failures=[] 记录；两组已核身份控制器正常退出，registry已移除，端口无占用。独立终态核查确认2个有精确映射的容器和2个卷已不存在，共享Docker基础设施保留。[清理审定](../../followup/20261001-8e047-retest/resource-cleanup-review.json)。

早期容器在活体Mounts映射前已删除，匿名卷无法全部独立追溯；没有声称所有历史卷均证实清理，也没有删除未知资源。原始事件、错误上下文、截图、trace和每文件摘要保存在各run归档；原字节没有为了审定结论而改写。

建议保留当前验收FAIL，按报告缺陷修复或明确记录承诺偏差，再对受影响用例复验。报告已经提供可复现事实及专业验收建议；最终交付和上线决定由负责人作出。
'''
(P/'report.md').write_text(text)
for name,record in inputs.items():assert hashlib.sha256((Q/name).read_bytes()).hexdigest()==record['sha256']
(P/'input-index.json').write_text(json.dumps({'issuedAt':now,'inputs':inputs},indent=2)+'\n')
print(json.dumps({'state':result['reportState'],'candidate':delta['sutRevision'],'baseline':bc,'deltaLatest':dc,'defectGroups':3,'report':'report.md'},ensure_ascii=False))
