"""Assemble manual-review CLI inputs from this run's actual saved evidence."""
import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

p = pathlib.Path(__file__).resolve().parent
qa = p.parents[3]
load = lambda name: json.loads((p / name).read_text())
source = load('source-index.json')
first = load('readme-execution-first.json')
final = load('readme-execution.json')
manifest = json.loads((qa / 'reports/runs' / source['formalRunId'] / 'manifest.json').read_text())
assert manifest['phase'] == 'business-acceptance'
assert final['status'] == 'PASS'
assert all(x['pageErrors'] == [] for x in final['browser'])
assert {x['role'] for x in final['browser']} == {'admin', 'viewer'}
for item in (source, first, final):
    assert item['sutRevision'] == manifest['sutRevision']
    assert item['qaRevision'] == manifest['qaRevision']
smoke = next(x for x in first['readmeCommands'] if x['stage'] == 'readme-smoke')
assert smoke['exit']['code'] == 0
assert any(x['event'] == 'isolated-smoke-passed' and len(x['checks']) == 8 for x in smoke['events'])
for stage in ('readme-smoke', 'readme-ui', 'readme-ui-recheck'):
    cleaned = load(stage + '-cleanup.json')
    assert cleaned['containerAbsent'] and cleaned['volumeAbsent'] and cleaned['directoryAbsent']
for entry in source['sources']:
    assert hashlib.sha256((p / entry['path']).read_bytes()).hexdigest() == entry['sha256']
trace = load('doc-traceability.json')
ids = [v for g in trace['groups'] for v in g['requirementIds']]
assert len(ids) == len(set(ids)) == 32
assert set(ids) == {r['id'] for r in load('approved-additions.json')}
for g in trace['groups']:
    for ref in g['directSources']:
        assert (p / ref.split(':')[0]).is_file()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=qa, text=True).strip() == manifest['qaRevision']
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source['sutDirectory'], text=True).strip() == manifest['sutRevision']

now = datetime.now(timezone.utc).isoformat()
assert datetime.fromisoformat(now) >= datetime.fromisoformat(manifest['startedAt'].replace('Z', '+00:00'))
reviewer = 'Independent QA intake_risk_map (AI receiver/document review; not human UX)'
records = [
    {
        'caseId': 'MAN-DELIVERY-001', 'status': 'PASS',
        'actual': '正式run开始后独立接收并复核固定2716 Git候选、父链、非shallow历史、干净tracked/untracked交付状态、README与原文哈希。候选与d761产品源间仅文档/证据变更，版本可独立识别；ignored依赖/构建明确列出。本条不依赖旧PASS，也不等同上线或真人体验。',
        'evidence': ['README.md', 'source-index.json', 'candidate-source/README.md', 'candidate-source/docs/qa-final-boundaries-followup-20261001.md', 'preparation/build-preparation.json', 'preparation/verify-original.log']
    },
    {
        'caseId': 'MAN-DELIVERY-002', 'status': 'PASS',
        'actual': '接收方从新clone/detach2716和全新npm ci完成README启动：正式run开始后README --smoke真实通过健康、两角色、随机API/WS与独立状态；正常入口独立Chromium两角色登录并浏览6账号/空群页，真实响应200、pageerror0及四截图。初次浏览取证将strong误作heading导致30秒观察中断，原始REVIEW_REQUIRED保留；仅修QA定位后新实例实际完成。三次实例均精确清理容器、命名卷和状态目录，私有manifest未归档，真实模型调用0。',
        'evidence': ['README.md', 'readme-preparation.json', 'readme-npm-ci.log', 'readme-execution-first.json', 'execute-readme-first.mjs', 'readme-execution.json', 'execute-readme.mjs', 'readme-smoke.log', 'readme-ui.log', 'readme-ui-recheck.log', 'admin-accounts.png', 'admin-groups.png', 'viewer-accounts.png', 'viewer-groups.png', 'readme-smoke-resources.json', 'readme-smoke-cleanup.json', 'readme-ui-resources.json', 'readme-ui-cleanup.json', 'readme-ui-recheck-resources.json', 'readme-ui-recheck-cleanup.json']
    },
    {
        'caseId': 'DOC-MAN-001', 'status': 'PASS',
        'actual': '正式run开始后重新核对固定2716文档和ec46f9b批准目录的32个必验追加条款，逐组定位CR/D/QA-D6的来源日期、要求影响、实现版本、验收入口和替代关系。建议/批准/开发验证/用户验收有明确区分；D039/D041方向不冒称强保证通过，D042差异明确，H16/H17真人复验和H18有限认可/H19仅评估分别记录。此为文档可追踪性审核，不对所述产品功能或真人体验代签PASS。',
        'evidence': ['README.md', 'source-index.json', 'doc-traceability.json', 'approved-additions.json', 'candidate-source/docs/change-requests.md', 'candidate-source/docs/decisions.md', 'candidate-source/docs/feature-matrix.md', 'candidate-source/docs/human-review-record.md', 'qa-source/requirements/sequence-failure-policy.md', 'qa-source/requirements/left-members-decision.md']
    }
]
(p / 'inputs').mkdir(exist_ok=True)
for r in records:
    r['reviewer'] = reviewer
    r['performedAt'] = now
    for evidence in r['evidence']:
        assert (p / evidence).is_file(), evidence
    r['evidence'] = ['manual-review/' + v for v in r['evidence']]
    (p / 'inputs' / (r['caseId'] + '.json')).write_text(json.dumps(r, ensure_ascii=False, indent=2) + '\n')
(p / 'manual-review-inputs.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')

broken = []
for target in re.findall(r'\]\(([^)]+)\)', (p / 'README.md').read_text()):
    if target == 'evidence-index.json': continue  # Written below; excludes its own hash.
    if not (p / target.split('#')[0]).exists(): broken.append(target)
assert not broken, broken
index = [{'path': str(f.relative_to(p)), 'bytes': f.stat().st_size, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
         for f in sorted(p.rglob('*')) if f.is_file() and f.name != 'evidence-index.json']
(p / 'evidence-index.json').write_text(json.dumps({'createdAt': now, 'sutRevision': manifest['sutRevision'],
    'qaRevision': manifest['qaRevision'], 'formalRunId': manifest['runId'], 'files': index}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'performedAt': now, 'reviews': [(r['caseId'], r['status']) for r in records],
                  'evidenceFiles': len(index), 'formalRecordsWritten': 0}, ensure_ascii=False))
