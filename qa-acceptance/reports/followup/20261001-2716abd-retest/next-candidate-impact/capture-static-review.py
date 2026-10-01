#!/usr/bin/env python3
"""Read Git/files only; writes new analysis indexes in this report directory."""
from pathlib import Path
import datetime, hashlib, json, re, subprocess

report = Path(__file__).resolve().parent
qa = report.parents[3]
candidate = Path('/Users/zcm/.codex/worktrees/qa-followup-integration/kapibala')
revision = '8e047aea842bfcec64802e4918b52b460b93c48b'
base = 'ec46f9b30fb2f5a312c92fc78463ddbfe200042f'
digest = lambda data: hashlib.sha256(data).hexdigest()
def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args])

docs = ['docs/original-interview-question.md', 'docs/qa-status-copy-review-20261001.md',
        'docs/agent-stage-budget-followup-20261001.md', 'docs/agent-kick-stage-budget-20261001.md',
        'docs/qa-final-boundaries-followup-20261001.md', 'docs/qa-backend-evidence-followup-20261001.md',
        'docs/first-acceptance-closeout-20261001.md']
qa_files = ['tests/system/agent.spec.ts', 'tests/system/capacity-control.spec.ts',
            'tests/system/recovery.spec.ts', 'tests/system/protocol-boundaries.spec.ts',
            'tests/ui/console.spec.ts', 'harness/manual-environment.ts',
            'contracts/runtime-observation.md', 'harness/lifecycle-observation.ts',
            'requirements/evidence-followup/static-closeout-contract-20261001.md',
            'cases/ui.json', 'cases/generated/ui.md']
index = {'status': 'STATIC_ANALYSIS_NO_PRODUCT_EXECUTION',
         'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'candidateRevision': revision, 'candidatePath': str(candidate),
         'qaBaseRevision': base,
         'productDocuments': [{'path': p, 'revision': revision,
            'sha256': digest(git(candidate, 'show', f'{revision}:{p}'))} for p in docs],
         'qaSourcesAtReview': [{'path': p, 'sha256': digest((qa/p).read_bytes()),
            'baselineSha256': digest(git(qa, 'show', f'{base}:qa-acceptance/{p}'))} for p in qa_files],
         'nonFileInput': 'Parent explicit final-candidate handoff and bounded read/cleanup semantics; no fabricated published observer interface.',
         'productDiffFileNamesOnly': git(candidate, 'diff', '--name-only',
            '2716abdd2d43a779b6a0972a6323f895cf2b5b9c', revision).decode().splitlines()}
(report/'source-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2)+'\n')
old_spec = git(qa, 'show', f'{base}:qa-acceptance/tests/ui/console.spec.ts').decode()
spec = (qa/'tests/ui/console.spec.ts').read_text()
added_imports = "import assert from 'node:assert/strict';\nimport { randomUUID } from 'node:crypto';\nimport { observe } from '../../harness/observation.js';\n"
prefix = spec.split("test('[UI-038]", 1)[0].replace(added_imports, '', 1).rstrip()
assert prefix == old_spec.rstrip(), 'Old test bodies changed'
old_cases = json.loads(git(qa, 'show', f'{base}:qa-acceptance/cases/ui.json'))
cases = json.loads((qa/'cases/ui.json').read_text())
assert cases[:len(old_cases)] == old_cases, 'Old UI case data changed'
new = cases[len(old_cases):]
assert [c['id'] for c in new] == ['UI-038', 'UI-039']
all_ids=[]
for file in (qa/'cases').glob('*.json'):
    all_ids.extend(c['id'] for c in json.loads(file.read_text()))
assert len(all_ids) == len(set(all_ids)), 'Duplicate catalog ID'
reqids=set()
for p in (qa/'requirements').glob('*.json'):
    value=json.loads(p.read_text())
    if isinstance(value,list):
        reqids.update(v['id'] for v in value if isinstance(v,dict) and 'id' in v)
for c in new:
    assert set(c['requirements']) <= reqids
    assert f"test('[{c['id']}]" in spec
    assert c['mode']=='automated' and c['data']['projects']==['chromium']
old_md = git(qa, 'show', f'{base}:qa-acceptance/cases/generated/ui.md').decode()
assert (qa/'cases/generated/ui.md').read_text().startswith(old_md), 'Old rendered UI cases changed'
subprocess.run(['git','-C',str(qa),'diff','--check','--','cases/ui.json','cases/generated/ui.md','tests/ui/console.spec.ts'], check=True)
checks = {'status':'PASS_SCOPED_STATIC_CHECKS_ONLY', 'noProductExecution':True,
          'oldUiBodiesBytePreservedExcludingThreeNewImports':True,
          'oldUiCaseObjectsUnchanged':True, 'oldRenderedUiPrefixUnchanged':True,
          'newCaseIds':['UI-038','UI-039'], 'uniqueIdsAndRequirementMappings':True,
          'sourceTypecheck':{'exitCode':0,'log':'source-typecheck.log'},
          'draftTypecheck':{'exitCode':0,'log':'typecheck.log'},
          'draftSemanticSelftest':{'pass':3,'fail':0,'skipped':0,'log':'draft-selftest.tap'},
          'initialGlobalCatalogCheck':{'exitCode':1,'log':'catalog-check.log',
            'reason':'Another workline INT-READ-001 script not yet catalogued during this check; root performs final integrated registration/check.'},
          'sourceFilesOwned':['tests/ui/console.spec.ts','cases/ui.json','cases/generated/ui.md'],
          'knownDependency':'UI-039 real zero-step failed/cancelled prerequisite; no delivered pre-first-dispatch activity hold',
          'noConclusionChange':'No old report or result rewritten; new cases unexecuted.'}
(report/'static-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'reviewIndex': 'source-index.json', 'checks': checks['status']}, ensure_ascii=False))
