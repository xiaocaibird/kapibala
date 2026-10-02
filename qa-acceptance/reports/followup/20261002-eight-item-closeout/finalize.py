#!/usr/bin/env python3
"""Compose this bounded closeout from immutable evidence; never executes SUT."""
import collections
import datetime
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
QA = ROOT.parents[2]
PRIOR = QA / 'reports/acceptance/20261002-second-round'
OFFLINE = '2026-10-02T01-25-09.419Z-47c5b140'
LIVE = '2026-10-02T01-31-12.546Z-live-a27892ae'
SUT = '0be8575f326f709fe674e20033843d950385043d'
IDS = ['SR-C1-005', 'SR-BE-USG-011', 'SR-UI-025', 'SR-C2-017']

def read(path):
    return json.loads(path.read_text())

def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def counts(rows):
    found = collections.Counter(row['status'] for row in rows)
    return {status: found[status] for status in ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']}

def xml_text(value):
    # Playwright error strings contain ANSI escapes. Keep raw originals in JSON
    # and archives; only this derived XML presentation removes terminal codes.
    value = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', str(value))
    return ''.join(c for c in value if c in '\t\n\r' or 0x20 <= ord(c) <= 0xD7FF or 0xE000 <= ord(c) <= 0xFFFD or 0x10000 <= ord(c) <= 0x10FFFF)

def junit(name, rows, label):
    n = counts(rows)
    suite = ET.Element('testsuite', name=label, tests=str(len(rows)), failures=str(n['FAIL']), errors='0', skipped=str(n['BLOCKED'] + n['NOT_RUN']))
    for row in rows:
        case = ET.SubElement(suite, 'testcase', name=row.get('caseId', row.get('id')), classname=label)
        properties = ET.SubElement(case, 'properties')
        for k in ['status', 'executionRunId', 'executionSutRevision', 'executionQaRevision', 'evidenceOrigin']:
            if k in row:
                ET.SubElement(properties, 'property', name=k, value=xml_text(row[k]))
        if row['status'] == 'FAIL':
            ET.SubElement(case, 'failure', type='REQUIREMENT_NONCONFORMITY', message=xml_text(row.get('reason', 'Original technical failure retained'))).text = xml_text(row.get('reviewNote', ''))
        elif row['status'] != 'PASS':
            ET.SubElement(case, 'skipped', type=row['status'], message=xml_text(row.get('reason', 'Evidence incomplete; never PASS')))
    ET.indent(suite)
    ET.ElementTree(suite).write(ROOT / name, encoding='utf-8', xml_declaration=True)

prior = read(PRIOR / 'results.json')
assert prior['counts'] == {'PASS': 103, 'FAIL': 4, 'BLOCKED': 5, 'NOT_RUN': 0}
prior_hashes = read(PRIOR / 'report-hashes.json')
for name, expected in prior_hashes.items():
    assert sha(PRIOR / name) == expected, name
scope = read(QA / 'second-round/config/bounded-closeout.json')
assert scope['sutRevision'] == SUT and set(scope['caseIds']) == set(IDS)
offline_path, live_path = [ROOT / 'batches' / rid for rid in [OFFLINE, LIVE]]
offline, live = read(offline_path / 'results.json'), read(live_path / 'result.json')
manifests = [read(path / 'manifest.json') for path in [offline_path, live_path]]
assert all(m['sutRevision'] == SUT and m['completedAt'] and m['autoRetries'] == 0 for m in manifests)
assert set(manifests[0]['selectedCaseIds']) == set(IDS[:3])
assert manifests[0]['runnerErrors'] == [] and manifests[1]['cleanupErrors'] == []
assert all(row['absent'] for row in read(offline_path / 'database-cleanup-verification.json'))
assert manifests[1]['exitOutcome'] == {'code': 0, 'signal': None} and manifests[1]['ownedRuntimeRemoved']
observed = {r['caseId']: r for r in offline['cases'] if r['caseId'] in IDS[:3]}
observed[live['caseId']] = live
assert set(observed) == set(IDS)
old = {r['caseId']: r for r in prior['cases']}
rows = []
for id in IDS:
    row = observed[id].copy()
    m = manifests[1 if id == 'SR-C2-017' else 0]
    row.update(title=old[id]['title'], requirements=old[id]['requirements'], previousSignedStatus=old[id]['status'],
               executionRunId=m['runId'], executionSutRevision=SUT, executionQaRevision=m['qaRevision'], evidenceOrigin='THIS_BOUNDED_RETEST')
    assert row['cleanupErrors'] == [] and row['attempt'] == 1
    rows.append(row)
assert counts(rows) == {'PASS': 3, 'FAIL': 0, 'BLOCKED': 1, 'NOT_RUN': 0}
effective = []
for previous in prior['cases']:
    replacement = next((r for r in rows if r['caseId'] == previous['caseId']), None)
    row = replacement.copy() if replacement else {**previous, 'evidenceOrigin': 'PRIOR_SIGNED_SAME_SUT_NOT_RERUN'}
    assert row['executionSutRevision'] == SUT
    row['acceptanceDisposition'] = next((d for d in scope['acceptedDispositions'] if row['caseId'] in d['caseIds']), None)
    effective.append(row)
assert counts(effective) == {'PASS': 106, 'FAIL': 4, 'BLOCKED': 2, 'NOT_RUN': 0}
assert len(effective) == 112
effective_map = {r['caseId']: r for r in effective}
requirements = read(PRIOR / 'requirement-coverage.json')
for requirement in requirements:
    statuses = {effective_map[id]['status'] for id in requirement['cases']}
    requirement['previousSignedStatus'] = requirement['status']
    requirement['status'] = next(s for s in ['FAIL', 'BLOCKED', 'NOT_RUN', 'PASS'] if s in statuses)
    requirement['evidenceBasis'] = 'Same frozen SUT; prior signed evidence plus four bounded retest results, not a new full execution'
write('effective-requirement-coverage.json', requirements)
archives = []
for path in [offline_path, live_path]:
    index = read(path / 'evidence-index.json')
    assert sha(path / index['archive']) == index['sha256']
    archives.append({k: v for k, v in index.items() if k != 'files'})
cleanup = read(ROOT / 'cleanup-and-evidence-check.json')
assert cleanup['ownedLiveRuntimeAbsent'] and cleanup['sutTrackedAndUntrackedClean'] and all(p['absent'] for p in cleanup['processes'])
issued = datetime.datetime.now(datetime.timezone.utc).isoformat()
summary = {
    'schemaVersion': 1, 'issuedAt': issued, 'taskStatus': 'COMPLETE_AND_STOPPED',
    'authorization': scope['authorization'], 'finalExecutionBoundary': scope['finalExecutionBoundary'],
    'sutRevision': SUT, 'thisRetest': {'total': 4, 'counts': counts(rows), 'verdict': 'BLOCKED', 'autoRetries': 0, 'cases': rows},
    'priorSignedReport': {'path': '../../acceptance/20261002-second-round/report.md', 'counts': prior['counts'], 'hashesVerifiedUnchanged': prior_hashes},
    'sameSutEffectiveSnapshot': {'total': 112, 'counts': counts(effective), 'technicalVerdict': 'FAIL', 'unconditionalAcceptance': False,
        'executedThisBatch': 4, 'retainedSameSutEvidence': 108, 'notANewFullRun': True, 'cases': effective,
        'requirementCounts': counts(requirements), 'requirementTotal': len(requirements)},
    'acceptedDispositions': scope['acceptedDispositions'], 'humanImeFocusSigned': False,
    'productionReadiness': 'NOT_ASSESSED', 'realProvider': {'caseStatus': 'PASS', **manifests[1]['costAndCalls'],
        'model': 'gemini-3.1-flash-lite', 'usage': manifests[1]['usage'], 'fullAgentLoopExecuted': False,
        'networkLimit': 'Normal native TLS through this environment; remoteAddress 198.18.0.123 is observed routing, not proof of direct Google physical IP or an independent certificate audit'},
    'archives': archives, 'cleanup': cleanup, 'additionalProductExecutionPermitted': False,
    'rawReporterIssue': {'id': 'CLOSEOUT-QA-XML-001', 'status': 'DERIVED_REPORT_FIXED_RAW_PRESERVED', 'detail': 'Offline raw junit.xml contains ANSI control bytes in Playwright error. Original remains immutable; the two issued JUnit files sanitize XML presentation only and are parse-verified. Product results are unchanged.'},
    'remaining': [
        {'caseId': 'SR-UI-025', 'status': 'BLOCKED', 'type': 'QA_AUTOMATION_RACE', 'nextAction': 'Recorded only; no fix or retest under this exhausted one-attempt authorization'},
        {'caseId': 'SR-C1-015', 'status': 'BLOCKED', 'type': 'ACCEPTED_EVIDENCE_GAP_DEFERRED', 'nextAction': 'No execution in this closeout'},
        {'scope': 'original first-round manual IME/focus', 'status': 'UNSIGNED', 'nextAction': 'Not replaced by headed automation'},
    ],
}
write('results.json', summary)
junit('junit.xml', rows, 'bounded-closeout-four-actual-cases')
junit('effective-snapshot.junit.xml', effective, 'same-sut-evidence-composition-not-a-new-full-run')
write('defects-and-dispositions.json', {
    'retainedTechnicalFailures': [r for r in effective if r['status'] == 'FAIL'],
    'remainingBlockers': [r for r in effective if r['status'] == 'BLOCKED'],
    'closedEvidenceGaps': [r['caseId'] for r in rows if r['status'] == 'PASS'],
    'ownerAcceptanceDoesNotRewriteTechnicalStatus': True, 'noFurtherFixOrRetestScheduled': True,
})
table = '\n'.join(f"| {r['caseId']} | {r['title']} | {r['status']} | {r['executionQaRevision'][:7]} |" for r in rows)
archive_table = '\n'.join(f"| {a['runId']} | {a['fileCount']} | {a['bytes']} | `{a['sha256']}` |" for a in archives)
req_counts = counts(requirements)
(ROOT / 'report.md').write_text(f'''# 八项处置与四项定向复验收尾报告

**本次授权任务已完成并停止。本次复验 3 PASS / 0 FAIL / 1 BLOCKED；不能判为无条件验收通过。**

被测产品固定为 `{SUT}`，未修改产品代码。按你在主任务窗口的最新决定，媒体保留、容量、跨实体提醒及真实模型各执行一次，无自动重试；失败或阻塞也直接出报告，不再进入修复／复测循环。

上一份[第二轮签发报告](../../acceptance/20261002-second-round/report.md)仍为 **103 PASS / 4 FAIL / 5 BLOCKED**，全部签发文件哈希已核对且未修改。将本次四项结果叠加到**同一产品提交**的既有证据，当前技术快照为 **106 PASS / 4 FAIL / 2 BLOCKED**。其中只有4项本次执行，108项来自同一冻结版本的已签证据；这不是重新全量运行。4项技术失败已有明确接受处置，但不改成 PASS；2项阻塞也不计通过。

## 本次实际执行

| 用例 | 验证点 | 结果 | QA 版本 |
|---|---|---|---|
{table}

离线批次 UTC 01:25:09–01:30:14（北京时间09:25:09–09:30:14）；真实模型 UTC 01:31:12–01:31:15（北京时间09:31:12–09:31:15），日期均为2026-10-02。范围登记率4/4，形成完整符合性结论3/4，通过率3/4。原始离线报告中的109条 NOT_RUN 是未选择范围，不属于本次4条的漏跑，也不会覆盖原签发结果。

媒体保留验证了完整下载之后的默认30天、配置2天阈值两侧，以及0天保留的真实删除终态。公开路径为空与物理文件不存在同时成立。容量用例按公开最多4个模型请求在途限制造数，完成记录数、UTF-8字节、年龄清理及重启边界验证；不以手工改日志制造容量证据。具体数值与归档路径见[证据复核](review-notes.md)。

跨实体提醒仍 **BLOCKED**：A摘要与第一次刷新按钮实际点击成功；A刷新后，下一条提醒在自动化等待按钮稳定期间消失，第二次点击未派发并超时。结束截图和日志显示A安静、B仍保留更新提醒，无页面或路由错误。但A返回、B独立确认／返回及最终身份核对未完成，因此只能确认局部观察，不能判整例通过，也不足以判产品违约。这是QA流程与异步提醒消失的竞争，记录后停止，没有再次修改脚本或补跑。

## 已决定的八项如何处置

| 项 | 对应用例 | 本次处置 | 技术状态 |
|---|---|---|---|
| 1 | SR-C2-012 | 接受硬崩溃后需要人工恢复服务的限制；不保证原在途轮恢复 | 保留 FAIL |
| 2 | SR-BE-DIA-004 / SR-BE-POL-005 | 接受未知kick安全暂停；不盲重放，不宣称自动完成 | 保留两条 FAIL |
| 3 | SR-C2-019 | 仅接受本次实测5000.265833ms；不改5000ms原要求，不豁免历史更大超限 | 保留 FAIL |
| 4 | SR-C1-005 | 修正QA完整下载／清理前提后，本次一次复验通过 | PASS |
| 5 | SR-BE-USG-011 | 修正QA超过公开在途并发限制的造数方式，本次一次复验通过 | PASS |
| 6 | SR-UI-025 | 去掉不存在的摘要弹层前提后，本次仍遇QA点击竞争；按最终指令直接报告 | BLOCKED |
| 7 | SR-C1-015 | 接受已打开描述符真实write失败的取证缺口暂缓 | 保留 BLOCKED |
| 8 | SR-C2-017 | 本冻结版本新增一次真实turn和一次真实audit | PASS |

授权及停止指令逐项记录在[结构化结果](results.json)；开发侧决定为D053与[处置记录](../../../../docs/second-round-disposition-20261002.md)。[人工恢复说明](../../../../docs/c2-manual-recovery.md)已由研发源代码核对，本轮QA没有再运行人工恢复步骤；清除锁不等于恢复原在途任务。严格5秒的接受仅适用上述这次观测。

## 真实模型与费用边界

SUT `{SUT}`；QA `{manifests[1]['qaRevision']}`；模型 `gemini-3.1-flash-lite`。使用原产品入口，QA仅在标准global fetch发送前做目的地、次数和费用保护，未修改请求或响应。真实native账本记录2次TLS/443发送、2次200响应，与一次 `/agent/turn` 和一次 `/agent/audit` 对应。turn生成合法 `get_recent_messages(limit=10)`，audit返回合法pass；生成工具未实际执行。只有合成数据，没有完整Agent循环或业务数据。

产品真实usage记录：turn输入707／输出41／合计748 tokens；audit输入204／输出36／合计240 tokens。事前按[官方模型上限](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)与[官方单价](https://ai.google.dev/gemini-api/docs/pricing)为两次共预留 **$0.720896**，低于$1授权上限；失败同样占用预留，未重试或切换模型。该金额是保守额度占用，**不是实际账单**。本次网络经过当前环境路由，账本地址198.18.0.123不作为直连Google物理IP或独立证书审计证据。

密钥只由原产品从获准引用读取，QA未打印、复制或归档密钥；新证据9份经过常见密钥模式检查，模式检查不能替代所有秘密检测。只证明本版本此次最小连通与协议，不外推模型质量、所有工具、长期可用性、真实费用对账或生产可用性。

## 证据、清理和追踪

| 批次 | 归档文件数 | 压缩字节 | SHA256 |
|---|---|---|---|
{archive_table}

合计{sum(a['fileCount'] for a in archives)}份原件，逐文件读取压缩包并校验SHA256；[两个批次](batches/)按实际产生类型保留原始证据：离线批次含MD/JSON/JUnit、请求与外部账本、文件、截图/trace和清理记录；真实模型批次含MD/JSON、native请求账本、usage及清理记录，没有原始JUnit或浏览器截图/trace。本次统一JUnit位于报告根目录。进程、专属数据库容器及匿名卷已清理；真实模型进程正常code0退出，私有运行目录移除，QA另行检查两PID均不存在。保留证据与防重跑授权标记，未删除其他工作区、演示资源或原签发材料。

需求追踪沿用原73条范围，本次同版本证据合并得到 {req_counts['PASS']} PASS / {req_counts['FAIL']} FAIL / {req_counts['BLOCKED']} BLOCKED，见[逐需求追踪](effective-requirement-coverage.json)。原第一轮128条及其它版本历史没有重新全量执行或被本报告覆盖。QA准备校验：三个离线用例相关自身测试13项、真实模型入口自身测试9项及TypeScript检查通过；这些自检不当作产品通过证据。

[本次4项JUnit](junit.xml)只含实际复验；[同版本112项快照JUnit](effective-snapshot.junit.xml)明确标注同版本证据合成与每项来源；[JSON](results.json)保留逐例、授权、接受范围与原签发哈希；[缺陷与处置](defects-and-dispositions.json)保留原失败和剩余阻塞。CI不得把JUnit的skipped当PASS。

归档中的离线原始JUnit包含Playwright错误里的ANSI控制字符，原件保持不变；本报告两份正式JUnit仅在XML展示时移除控制字符，已验证可解析，原始错误仍在JSON和归档中。自动化集成应读取本报告根目录的JUnit，不读取该原始批次JUnit。此报告格式修正没有再次运行产品或改变测试结果。

## 收尾边界

本次执行、报告和归档工作完成。仍缺跨实体提醒完整流程证据、已暂缓的真实write失败证据，以及首轮真人IME／系统焦点签字。业务需求技术结论仍不是无条件通过；上线准备度 **NOT_ASSESSED**。已接受的限制无需再次索要同一决定，本次不自动安排新的修复、产品复测、发布或上线。
''')
print(json.dumps({'thisRetest': counts(rows), 'effective': counts(effective), 'requirements': req_counts, 'archives': len(archives)}, ensure_ascii=False))
