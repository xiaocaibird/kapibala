#!/usr/bin/env python3
"""Offline QA preparation audit; no SUT/process/database/provider operations."""
from pathlib import Path
from collections import Counter
import datetime as dt
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT.parent
OUT = ROOT / 'reports/preparation'
OUT.mkdir(parents=True, exist_ok=True)
baseline = json.loads((ROOT / 'requirements/baseline.json').read_text())
catalog = json.loads((ROOT / 'requirements/catalog.json').read_text())
dependencies = json.loads((ROOT / 'requirements/dependencies.json').read_text())
dep_ids = {d['id'] for d in dependencies}
assert len(dep_ids) == len(dependencies)
for dependency in dependencies:
    if dependency.get('aliasOf'):
        target = next(d for d in dependencies if d['id'] == dependency['aliasOf'])
        assert not target.get('aliasOf'), 'dependency aliases must resolve directly'
assert baseline['executionAuthorized'] is False
assert baseline['realProviderAuthorized'] is False
assert baseline['mergeMainAuthorized'] is False and baseline['finalSutRevision'] is None
requirements = {r['id']: r for r in catalog}
assert len(requirements) == len(catalog)
for r in catalog:
    assert r['expectation'].strip() and r['state'] == 'NOT_RUN', r['id']
    for location in r.get('sourceLocations', []):
        p = ROOT / location['path']
        assert 1 <= location['startLine'] <= location['endLine'] <= len(p.read_text().splitlines())
    for source in r.get('sources', [r['source']]):
        assert (ROOT / source.split('#', 1)[0]).is_file(), (r['id'], source)
source_checks = []
for source in baseline['sources']:
    p = ROOT / source['snapshot']
    data = p.read_bytes()
    assert len(data) == source['bytes']
    assert hashlib.sha256(data).hexdigest() == source['sha256']
    actual = subprocess.check_output(['git', 'show', source['revision'] + ':' + source['repositoryPath']], cwd=QA)
    assert data == actual, source['snapshot']
    source_checks.append({'snapshot': source['snapshot'], 'sha256': source['sha256'], 'sameGitObject': True})
first_input = json.loads((ROOT / 'requirements/first-round-input.json').read_text())
first_checks = []
for report in first_input['reports']:
    data = subprocess.check_output(['git', 'show', report['revision'] + ':' + report['repositoryPath']], cwd=QA)
    assert len(data) == report['bytes'] and hashlib.sha256(data).hexdigest() == report['sha256']
    first_checks.append({'revision': report['revision'], 'path': report['repositoryPath'], 'sha256': report['sha256'], 'sameGitObject': True})
conflicts = json.loads((ROOT / 'requirements/contract-conflicts.json').read_text())
assert all(c['state'] == 'RESOLVED_BY_DOCUMENTED_CLARIFICATION' for c in conflicts)
assert all(not r.get('unresolvedInterpretations') for r in catalog)
cases = []
for p in sorted((ROOT / 'cases').glob('*.json')):
    for case in json.loads(p.read_text()):
        case['caseSourceFile'] = str(p.relative_to(ROOT))
        cases.append(case)
assert cases and len({c['id'] for c in cases}) == len(cases)
case_ids = {c['id'] for c in cases}
smoke = json.loads((ROOT / 'config/smoke-selection.json').read_text())
assert smoke['state'] == 'NOT_RUN' and smoke['executionAuthorized'] is False and smoke['selectorOnly'] is True
smoke_cases = [c['id'] for g in smoke['groups'] for c in g['cases']]
assert len(smoke_cases) == len(set(smoke_cases)) and set(smoke_cases) <= case_ids
assert 'SR-C2-017' not in smoke_cases, 'real-provider must not enter offline smoke'
coverage = {r: [] for r in requirements}
for c in cases:
    assert c['state'] == 'NOT_RUN', c['id']
    assert c['mode'] in ['automated-driver', 'manual', 'existing-regression', 'real-provider']
    for key in ['title', 'priority', 'readiness', 'preconditions', 'data', 'steps', 'faults', 'expected', 'timing', 'evidence', 'cleanup', 'dependencies']:
        assert c.get(key), (c['id'], key)
    for r in c['requirements']:
        assert r in requirements, (c['id'], r)
        coverage[r].append(c['id'])
    for d in c['dependencies']:
        assert d in dep_ids, (c['id'], 'unregistered dependency', d)
    entry = c.get('automation')
    if entry:
        assert isinstance(entry, str) and '#' in entry, (c['id'], entry)
        module, name = entry.split('#', 1)
        source = (ROOT / module).read_text()
        assert re.search(r'export\s+(?:async\s+)?function\s+' + re.escape(name) + r'\b', source), (c['id'], entry)
        assert c['readiness'] != 'ready', 'function/driver interface is not a connected product adapter'
    if c['mode'] == 'automated-driver':
        assert entry, c['id']
    for reference in c.get('regressionReferences', []):
        old = json.loads((ROOT / reference['catalog']).read_text())
        match = next((row for row in old if row['id'] == reference['id']), None)
        assert match and (ROOT / reference['automation']).is_file(), reference
boundary = [r for r in requirements if r.startswith('SR-AUTH-')]
product = [r for r in requirements if r not in boundary]
assert all(coverage[r] for r in product), [r for r in product if not coverage[r]]
status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=QA.parent, text=True)
assert all(line[3:].startswith('qa-acceptance/second-round/') for line in status.splitlines()), status
branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=QA, text=True).strip()
assert branch == 'agent/qa-second-round-preparation'
tree = ET.Element('testsuite', name='second-round-preparation-NOT_RUN', tests=str(len(cases)), failures='0', errors='0', skipped=str(len(cases)))
for c in cases:
    item = ET.SubElement(tree, 'testcase', classname=c['caseSourceFile'], name=c['id'])
    ET.SubElement(item, 'skipped', type='NOT_RUN', message='Preparation only; second-round product execution is not authorized.')
ET.indent(tree)
ET.ElementTree(tree).write(OUT / 'not-run.junit.xml', encoding='utf-8', xml_declaration=True)
doc = ['# 第二轮需求—用例追踪', '', '这是第二轮 overlay；不重写原全局目录、候选范围或已签首轮统计。所有产品结果 NOT_RUN。', '', '| 条款 | 来源性质 | 用例 / 准备边界 |', '|---|---|---|']
for r in catalog:
    mapped = ', '.join(coverage[r['id']]) if coverage[r['id']] else '准备授权闸门/版本隔离检查（非产品执行）'
    doc.append(f"| {r['id']} {r['title']} | {r.get('nature', '')} | {mapped} |")
(ROOT / 'requirements/traceability.md').write_text('\n'.join(doc) + '\n')
generated = ROOT / 'cases/generated'
generated.mkdir(exist_ok=True)
for p in sorted((ROOT / 'cases').glob('*.json')):
    text = ['# ' + p.stem, '', '全部 NOT_RUN；自动化动作函数不代表实际工程 connector 已接入。', '']
    for c in [v for v in cases if v['caseSourceFile'] == str(p.relative_to(ROOT))]:
        text.extend(['## ' + c['id'] + ' ' + c['title'], ''])
        for key, value in c.items():
            if key == 'caseSourceFile':
                continue
            text.extend(['**' + key + '**', '', '```json', json.dumps(value, ensure_ascii=False, indent=2), '```', ''])
    (generated / (p.stem + '.md')).write_text('\n'.join(text))
summary = {
    'phase': 'SECOND_ROUND_PREPARATION_ONLY', 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
    'qaBranch': branch, 'productTestsExecuted': 0, 'realProviderCalls': 0, 'mergedMain': False,
    'productConclusion': 'NOT_RUN', 'releaseReadiness': 'NOT_ASSESSED', 'candidateFrozenForExecution': False,
    'requirements': len(catalog), 'scopedClauses': len(product), 'authorizationBoundaries': len(boundary),
    'scopedClausesWithCases': sum(bool(coverage[r]) for r in product), 'cases': len(cases),
    'caseResults': {'NOT_RUN': len(cases)}, 'modes': dict(Counter(c['mode'] for c in cases)),
    'readiness': dict(Counter(c['readiness'] for c in cases)),
    'scopeCountingNote': '69 non-authorization clauses include functional behavior, regression and delivery/measurement evidence; not 69 new product features.',
    'clauseNatureCounts': dict(Counter(r.get('nature', 'unspecified') for r in catalog)),
    'casesWithActionAssertionEntry': sum(bool(c.get('automation')) for c in cases),
    'distinctActionAssertionEntries': len({c['automation'] for c in cases if c.get('automation')}),
    'automationCasesWithManualSubObligations': [c['id'] for c in cases if c.get('automation') and c.get('manualCoverage')],
    'dependencyStates': dict(Counter(d['state'] for d in dependencies if not d.get('aliasOf'))),
    'canonicalDependencies': sum(not bool(d.get('aliasOf')) for d in dependencies),
    'dependencyAliases': sum(bool(d.get('aliasOf')) for d in dependencies),
    'smokeSelection': {g['id']: len(g['cases']) for g in smoke['groups']},
    'smokeSelectionState': 'NOT_RUN',
    'sources': source_checks, 'frozenFirstRoundInputs': first_checks, 'coverage': coverage,
    'unresolvedOracleConflicts': 0,
    'limits': ['Actual engineering drivers, fixtures and authorized final version binding remain pending.',
               'Developer results and QA self-tests do not become product PASS.',
               'Approved scope has case mappings; actual execution readiness and evidence sufficiency remain separate.'],
}
(OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: summary[k] for k in ['requirements', 'scopedClauses', 'scopedClausesWithCases', 'cases', 'modes', 'caseResults', 'productTestsExecuted']}, ensure_ascii=False))
