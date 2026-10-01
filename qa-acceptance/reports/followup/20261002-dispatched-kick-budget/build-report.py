#!/usr/bin/env python3
"""Read-only adjudication of a preserved run. Never launches/retries the SUT."""
from pathlib import Path
from decimal import Decimal
from collections import Counter
import datetime as dt
import hashlib
import json
import tarfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
QA = ROOT.parents[2]
RUN = '2026-10-01T16-42-20.128Z-67fb4dd4'
RAW = ROOT / 'runs' / RUN

def read(p):
    return json.loads(p.read_text())

def save(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

manifest = read(RAW / 'manifest.json')
result = read(RAW / 'results.json')
archive = read(RAW / 'evidence-index.json')
assert result['integrity'] == []
assert len(result['attempts']) == 1 and result['attempts'][0]['attempt'] == 0
assert manifest['qaRevision'] == '60cd3dda117b9b38906902458175cd81bd42212a'
assert manifest['sutRevision'] == '8e047aea842bfcec64802e4918b52b460b93c48b'
assert sha(RAW / 'evidence.tar.gz') == archive['archive']['sha256']
with tarfile.open(RAW / 'evidence.tar.gz', 'r:gz') as tf:
    members = tf.getmembers()
    assert len(members) == archive['verifiedDecompressedFiles'] == 1411
    for member, item in zip(members, archive['files']):
        assert member.isfile() and member.name == RUN + '/' + item['path']
        h = hashlib.sha256()
        stream = tf.extractfile(member)
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
        assert h.hexdigest() == item['sha256']
    name = next(m.name for m in members if m.name.endswith('/dispatched-kick-budget-final.json'))
    evidence = json.load(tf.extractfile(name))
    cleanup = json.load(tf.extractfile(next(m.name for m in members if m.name.endswith('/evidence/cleanup.json'))))
assert cleanup['failures'] == []
terminal = next(e for e in evidence['activity']['events'] if e['kind'] == 'activity-terminal')
created = next(e for e in evidence['lifecycle']['events'] if e['kind'] == 'agent-run-created')
decision = next(e for e in evidence['lifecycle']['events'] if e['kind'] == 'agent-termination-decided')
committed = next(e for e in evidence['lifecycle']['events'] if e['kind'] == 'agent-terminal-committed')
assert decision['attemptId'] == committed['attemptId']
online = [str(Decimal(str(decision['decisionWindowMs'][0])) - Decimal(str(created['creationWindowMs'][1]))),
          str(Decimal(str(decision['decisionWindowMs'][1])) - Decimal(str(created['creationWindowMs'][0])))]
mapped = evidence['mappedConfirmationBoundary']
assert mapped['proof'] is False and evidence['decisionObservedWithPendingConfirmation'] is False
margin = str(Decimal(str(mapped['parentDecisionWindowMs'][0])) - Decimal(str(mapped['confirmation']['responseClosedMonoMs'])))
assert Decimal(margin) > 0
assert terminal['activeElapsedMs'] == [59999, 60008]
assert terminal['epochObservation']['continuous'] is False
assert any(e['activityState'] == 'recovery-paused' for e in evidence['activity']['events'])
assert all('原A5.8强恢复未满足' in f for f in evidence['failures'])
original = QA / 'reports/acceptance/20261002-current-delivery/report.md'
assert sha(original) == 'aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2'
claims = [
    ('SCOPE', 'PASS', '固定版本、单实例、新建原run、真实时间、零SQL活动计数注入；仅一次执行、attempt=0。'),
    ('CAPACITY', 'PASS', '真实准入拒绝且callbackEntered=false/remoteRequestCount=0；38–40秒活动窗口释放前零kick请求/效果。'),
    ('POST-EFFECT', 'PASS', '唯一kick POST #16实际收到并落地一次；效果观察保守上界4.386875ms；真实HTTP504已完成。'),
    ('CONFIRMATION-CROSS', 'BLOCKED', '唯一确认GET #17关闭早于实际预算决定映射下界4.508292ms，未建立仍在途跨决定的正证。'),
    ('ACTIVE-BUDGET', 'BLOCKED', '包含未保存尾段的活动区间[59999,60008]ms跨严格60000ms，且尾段暂停/continuous=false；不可判通过或活动超限。'),
    ('DECISION-COMMIT', 'PASS', '真实failed/wall_clock决定与同attempt外层COMMIT配对；仅证明决定和持久状态存在，不替代活动预算符合性。'),
    ('PUBLIC-UNKNOWN', 'PASS', '公开终态failed/wall_clock；原step审计pass、isError=false/errorCode=null、unknown说明诚实保留，群activeAgentRunId为空。'),
    ('FINITE-NO-REPLAY', 'PASS', '一次审计、一次turn、一次POST/副作用；实际stop后未见新turn，有限1500ms观察中未见重放；不外推永久保证。'),
    ('TRANSPORT-CAUSE', 'BLOCKED', 'GET关闭且未finish为实际传输事实；缺原请求取消来源，不能声明由预算主动取消，亦不新增取消SLA。'),
    ('CLEANUP', 'PASS', '自有进程/控制器/注册目录/端口退出，实际Mounts精确映射容器及匿名卷消失，cleanup.failures=[]。'),
]
rows = [{'id': i, 'status': s, 'reason': reason} for i, s, reason in claims]
summary = {
    'formatVersion': 1, 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
    'timezone': 'Asia/Shanghai', 'scope': 'Independent single-instance two-factor supplementary adjudication',
    'caseId': 'INT-KICK-BUDGET-001', 'requirements': ['R-A5-06', 'R-A5-09'],
    'sutRevision': manifest['sutRevision'], 'executedQaRevision': manifest['qaRevision'],
    'postRunAttributionFixRevision': '318cc3290ef31b73bdee015fc132163e48ff6298',
    'postRunFixProductRetested': False,
    'targetSha256': manifest['targetSha256'], 'suiteSha256': manifest['suiteSha256'],
    'qaTreeSha256': manifest['qaTree']['sha256'], 'runId': RUN, 'rawPhase': manifest['phase'],
    'rawCaseStatus': 'FAIL', 'reviewedSupplementStatus': 'BLOCKED',
    'overallBusinessAcceptance': 'FAIL_UNCHANGED', 'releaseReadiness': 'NOT_ASSESSED',
    'counts': {'uniqueCases': 1, 'caseResults': {'PASS': 0, 'FAIL': 0, 'BLOCKED': 1},
               'obligations': len(rows), 'obligationResults': dict(Counter(row['status'] for row in rows)),
               'productRuns': 1, 'automaticRetries': 0, 'productRetests': 0},
    'adjudication': 'Raw FAIL retained. Both raw assertions enforce original A5.8 before budget comparison. This no-restart supplement does not execute that recovery obligation; no new budget FAIL is substantiated. Strict budget and crossing remain BLOCKED, never PASS. Existing strong recovery FAIL is unchanged.',
    'claims': rows,
    'timing': {'actualActivityMs': terminal['activeElapsedMs'], 'activityContinuous': False,
               'creationWindowMs': created['creationWindowMs'], 'decisionWindowMs': decision['decisionWindowMs'],
               'commitMonotonicMs': committed['monotonicMs'], 'sameClockOnlineToDecisionMsDiagnosticOnly': online,
               'mappedParentDecisionWindowMs': mapped['parentDecisionWindowMs'],
               'confirmationCloseParentMonoMs': mapped['confirmation']['responseClosedMonoMs'],
               'closePrecedesDecisionLowerMs': margin, 'crossingProved': False},
    'knownRecoveryObservation': {'status': 'OBSERVED_EXISTING_RISK', 'historicalConclusion': 'FAIL_UNCHANGED',
                                  'restartExecutionThisRun': 'NOT_RUN', 'recoveryState': 'recovery-paused',
                                  'notANewBudgetDefect': True},
    'remainingScope': {'runningSecondInstanceCompetition': 'NOT_RUN_SEPARATE_SCOPE',
                      'arbitraryRestartRecovery': 'NOT_RUN_THIS_SUPPLEMENT',
                      'postFixProductExecution': 'NOT_RUN', 'realIMEAndFocus': 'NO_NEW_HUMAN_EVIDENCE',
                      'secondRoundC1C2P0P1': 'PREPARATION_ONLY_SEPARATE_BRANCH'},
    'archive': {'directory': 'runs/' + RUN, 'filesVerified': 1411, **archive['archive']},
    'previousSignedReport': {'path': '../../acceptance/20261002-current-delivery/report.md', 'sha256': sha(original), 'immutable': True},
    'limits': ['No second product run or silent retry.', 'No new business rule, SLA tolerance or protocol outcome guarantee.',
               'Single finite experiment is not proof for all restart times or all future effects.',
               'Exact cleanup proof applies only to this run, not all historical resources.'],
}
save('summary.json', summary)
pending = [
    {'id': 'KB-CROSS', 'status': 'BLOCKED', 'owner': 'QA / engineering observation handoff', 'reason': rows[3]['reason'], 'next': '明确真实取消边界与终止决定记录的关系，按既有标准补观测正证；保留首次，不通过随机重跑修饰结果。'},
    {'id': 'KB-ACTIVITY', 'status': 'BLOCKED', 'owner': 'Engineering observation / QA', 'reason': rows[4]['reason'], 'next': '完善包含真实尾段的活动边界精度/连续性说明；不加尾差、不使用persistedActiveMs或在线时间代替。'},
    {'id': 'KB-CANCEL', 'status': 'BLOCKED_DETAIL', 'owner': 'Engineering observation / QA', 'reason': rows[8]['reason'], 'next': '若需因果结论，接入真实请求取消来源观测；仅诊断字段，不自创业务取消期限。'},
    {'id': 'KB-SECOND-INSTANCE', 'status': 'NOT_RUN', 'owner': 'Separate approved scope', 'reason': '本次仅两因素单实例，第二实例竞争单独登记，不能由端口/终态后样例证明。'},
]
save('pending-items.json', pending)
suite = ET.Element('testsuite', name='independent-kick-budget-adjudication', tests='1', failures='0', errors='0', skipped='1')
properties = ET.SubElement(suite, 'properties')
for key in ['sutRevision', 'executedQaRevision', 'rawCaseStatus', 'reviewedSupplementStatus', 'targetSha256', 'runId']:
    ET.SubElement(properties, 'property', name=key, value=str(summary[key]))
case = ET.SubElement(suite, 'testcase', classname='independent-qa.supplement', name='INT-KICK-BUDGET-001')
ET.SubElement(case, 'skipped', type='BLOCKED', message='Strict activity upper bound and pending-confirmation crossing unproven; raw FAIL remains archived.')
ET.indent(suite)
ET.ElementTree(suite).write(ROOT / 'reviewed.junit.xml', encoding='utf-8', xml_declaration=True)
table = '\n'.join(f"| {r['id']} | {r['status']} | {r['reason']} |" for r in rows)
(ROOT / 'report.md').write_text(f'''# 独立补充验收报告：原活动预算 × 已派发 kick

**结论：本次专项 BLOCKED；整体验收仍为 FAIL，上线准备度未评估。** 实际执行一条用例一次、零自动重试；本专项10项审定断言中7 PASS、3 BLOCKED（不另计为10条正式用例或全量义务）。这些断言通过仅限表中具体事实，不能把组合场景记通过。已签全量和差异报告的结果、计数及原件保持不变。

## 冻结范围与时间

产品 `8e047aea842bfcec64802e4918b52b460b93c48b`，实际执行 QA `60cd3dda117b9b38906902458175cd81bd42212a`；run `{RUN}`。执行器保留 `developer-preflight` 原标签，QA 在此独立审定补证，不借改名升级为新版全量验收。

原运行 UTC 2026-10-01 16:42:20 至16:43:25，对应北京时间 **2026-10-02 00:42:20 至00:43:25**。真实隔离 PostgreSQL、单应用实例、独立网关/Agent；未写入活动计数、未改产品、未改外部协议、未调用付费真实模型。

目标 SHA256 `{manifest['targetSha256']}`；子集 SHA256 `{manifest['suiteSha256']}`。源冻结、授权绑定、命令、环境、原始结果和证据见[原运行归档](runs/{RUN}/manifest.json)与[文件哈希索引](runs/{RUN}/evidence-index.json)。

## 逐项判定

| 断言 | 结果 | 证据与边界 |
|---|---|---|
{table}

## 首次失败归因与时序

原始执行 **FAIL** 原样保留：[原 JSON](runs/{RUN}/results.json)、[原 JUnit](runs/{RUN}/junit.xml)、[Playwright 原输出](runs/{RUN}/playwright.junit.xml)。两个失败信息均来自共享 `assertNoRecoveryPause` 的原 A5.8 强恢复检查，发生在预算判断之前，不能称为两个新预算缺陷。该原强恢复要求及历史 FAIL 没有豁免或改签。

本专项未重启，原活动末段包含 `recovery-paused`，`continuous=false`；实际活动 `[59999,60008]ms` 下界未超过60000、上界跨界。真实创建到决定的同进程在线包络 `{online}`ms只供诊断，包含暂停段，不能冒充连续活动超限。预算既不通过，也没有被本次证明失败。

真实成员确认 GET #17 未返回，父域关闭时间 `63009.885042ms`；真实终止决定映射包络 `[63014.393334,63045.845292]ms`。关闭早于决定下界 `{margin}ms`，两种正证都未成立。不得靠墙钟、poll点、close事件或未知的abort原因推导仍在途跨决定；取消原因细项也保留 BLOCKED。

QA 判定范围修正提交 `318cc3290ef31b73bdee015fc132163e48ff6298` 将本专项预算完整性与强恢复观察分开，共享强恢复检查未改；**修正后只执行工具校验，没有再次运行产品**。首次 source、所有原结果、失败及证据均保留。本报告由独立 AI QA 审定为 BLOCKED，修正源也不能被表述为产品复测通过。

## 清理与证据完整性

专属容器的实际 Mounts 与匿名卷已在运行时捕获；同 Docker engine 的结束快照证实精确容器/卷不存在。两控制器、registry、自有应用/guardian/worker与相应端口已退出，原 `cleanup.failures=[]`。共享 Docker daemon仍作为基础设施保留。详见[独立资源复核](resource-review/final-resource-review.md)。结论只覆盖本run，不追溯宣称全部历史匿名卷已被证明清理。

压缩包保留 **1411 个原字节文件**，归档时和报告生成时均逐项解压验证哈希；[独立实际结果复核](actual-review.md)与[判定 JSON](summary.json)、[审定 JUnit](reviewed.junit.xml)同时交付。审定 JUnit 的skipped明确表示BLOCKED，不表示未执行或通过；原失败 XML同时保留。

## 剩余事项与总体建议

[剩余事项](pending-items.json)记录交叉正证、真实活动精度/连续性及取消来源细项；未提出新业务时限或尾差容忍。运行中第二实例竞争、任意重启恢复属于本次未执行范围；本次没有新增真人IME/系统焦点证据。第二轮C1/C2及批准P0/P1另立准备分支，未启动其产品测试。

[已签当前交付验收报告](../../acceptance/20261002-current-delivery/report.md)仍为业务 FAIL。它的2716全量254条与8e差异51条统计不因本补充被重写；本次独立新增1 BLOCKED，不合并成新版全量通过。不建议无条件验收通过；产品修复、标准差异接受与正式上线决定继续分开记录。
''')
print(json.dumps({'status': 'BLOCKED', 'claims': Counter(r['status'] for r in rows), 'rawStatus': 'FAIL', 'archiveFiles': 1411}))
