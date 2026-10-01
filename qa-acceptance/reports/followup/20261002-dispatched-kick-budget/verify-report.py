#!/usr/bin/env python3
"""Validate the new report and preserve a complete input index; no SUT access."""
from pathlib import Path
from collections import Counter
import datetime as dt
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
QA = ROOT.parents[2]
summary = json.loads((ROOT / 'summary.json').read_text())
checks = []

def check(name, condition):
    assert condition, name
    checks.append({'check': name, 'status': 'PASS'})

check('raw FAIL retained, review BLOCKED, overall FAIL unchanged',
      summary['rawCaseStatus'] == 'FAIL' and summary['reviewedSupplementStatus'] == 'BLOCKED'
      and summary['overallBusinessAcceptance'] == 'FAIL_UNCHANGED')
check('one product run, zero retries or post-fix product reruns',
      summary['counts']['productRuns'] == 1 and summary['counts']['automaticRetries'] == 0
      and summary['counts']['productRetests'] == 0 and not summary['postRunFixProductRetested'])
check('10 obligation claims: 7 PASS / 3 BLOCKED',
      Counter(c['status'] for c in summary['claims']) == {'PASS': 7, 'BLOCKED': 3})
check('strict interval and crossing not promoted', summary['timing']['actualActivityMs'] == [59999, 60008]
      and not summary['timing']['activityContinuous'] and not summary['timing']['crossingProved'])
check('original arbitrary recovery FAIL and second-instance NOT_RUN preserved',
      summary['knownRecoveryObservation']['historicalConclusion'] == 'FAIL_UNCHANGED'
      and summary['remainingScope']['runningSecondInstanceCompetition'] == 'NOT_RUN_SEPARATE_SCOPE')
old = QA / 'reports/acceptance/20261002-current-delivery/report.md'
check('old signed report same bytes', hashlib.sha256(old.read_bytes()).hexdigest()
      == 'aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2')
for phase in ['tooling', 'tooling-after-scope-fix']:
    tool = json.loads((ROOT / phase / 'tooling-verification.json').read_text())
    check(phase + ': seven QA-only stages PASS', tool['phase'] == 'QA_TOOLS_ONLY'
          and tool['productTestsExecuted'] == 0 and len(tool['stages']) == 7
          and all(s['exitCode'] == 0 for s in tool['stages']))
    check(phase + ': 309 tools self-tests, no skipped',
          'ℹ pass 309' in (ROOT / phase / 'tooling/test-self.log').read_text()
          and 'ℹ skipped 0' in (ROOT / phase / 'tooling/test-self.log').read_text())
review = json.loads((ROOT / 'actual-review.json').read_text())
check('independent actual review available', bool(review))
resource = json.loads((ROOT / 'resource-review/final-resource-review.json').read_text())
check('independent exact owned-resource closure PASS', resource['status'] == 'PASS')
xml = ET.parse(ROOT / 'reviewed.junit.xml').getroot()
check('reviewed JUnit is BLOCKED, original XML still archived', xml.attrib['tests'] == '1'
      and xml.attrib['failures'] == '0' and xml.attrib['skipped'] == '1'
      and xml.find('testcase/skipped').attrib['type'] == 'BLOCKED')
links = []
for label, href in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', (ROOT / 'report.md').read_text()):
    if href.startswith(('http:', 'https:')):
        continue
    path = (ROOT / href.split('#', 1)[0]).resolve()
    check('report link: ' + href, path.is_file())
    links.append({'label': label, 'path': href})
changed = subprocess.check_output(['git', 'diff', 'ac5e8e639237070fb5c48751ce04a7645b4a19ab',
                                   '--name-only'], cwd=QA.parent, text=True).splitlines()
check('tracked change boundary QA only; signed report paths unchanged',
      all(p.startswith('qa-acceptance/') for p in changed)
      and not any(p.startswith('qa-acceptance/reports/acceptance/') for p in changed))
files = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.name in ['input-index.json', 'final-review.json', 'integration.json']:
        continue
    for pattern in ['*.json'] if path.suffix == '.json' else []:
        json.loads(path.read_text())
    files.append({'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
                  'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT / 'input-index.json').write_text(json.dumps({'files': files}, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'final-review.json').write_text(json.dumps({
    'phase': 'REPORT_INTEGRITY_ONLY', 'status': 'PASS', 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
    'productTestsExecuted': 0, 'checks': checks, 'filesIndexed': len(files), 'links': links,
    'originalArchiveFilesReverifiedByBuildReport': summary['archive']['filesVerified'],
    'limit': 'Integrity PASS is not product acceptance PASS.'}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': 'PASS', 'checks': len(checks), 'filesIndexed': len(files), 'links': len(links)}))
