"""Read-only delivery/document evidence capture; never starts the product."""
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime, timezone

OUT = pathlib.Path(__file__).resolve().parent
QA = OUT.parents[3]
SUT = pathlib.Path('/Users/zcm/.codex/worktrees/qa-sut-evidence-retest/kapibala')
REV = '2716abdd2d43a779b6a0972a6323f895cf2b5b9c'
QA_REV = 'ec46f9b30fb2f5a312c92fc78463ddbfe200042f'

def git(cwd, *args):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True, check=True)
    return r.stdout

def save(path, data):
    path = OUT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {'path': str(path.relative_to(OUT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}

assert git(SUT, 'rev-parse', 'HEAD').decode().strip() == REV
assert git(QA, 'rev-parse', 'HEAD').decode().strip() == QA_REV
formal = json.loads((QA / 'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a/manifest.json').read_text())
assert formal['phase'] == 'business-acceptance'
assert formal['qaRevision'] == QA_REV and formal['sutRevision'] == REV
commands = {}
for args in [('rev-parse', '--is-shallow-repository'), ('status', '--porcelain=v1', '--untracked-files=all'),
             ('log', '-12', '--format=%H %P %s'), ('rev-list', '--count', REV),
             ('ls-files', '--others', '--exclude-standard'),
             ('status', '--short', '--ignored'), ('diff', '--name-only', 'd761390e085308885af6c8baaffd76b20772030c', REV)]:
    commands['git ' + ' '.join(args)] = git(SUT, *args).decode()
files = []
sources = ['README.md', 'package.json', '.nvmrc', 'docs/original-interview-question.md',
           'docs/change-requests.md', 'docs/decisions.md', 'docs/feature-matrix.md',
           'docs/README.md', 'docs/human-review-record.md',
           'docs/group-directory-profile-proposal.md', 'docs/group-directory-filter-review.md',
           'docs/group-profile-conflict-review.md', 'docs/page-update-notification-implementation.md',
           'docs/page-update-notification-proposal.md', 'docs/account-operation-copy.md',
           'docs/core-verification-closeout.md', 'docs/qa-final-boundaries-followup-20261001.md',
           'docs/isolated-local-reproduction.md']
for src in sources:
    data = git(SUT, 'show', f'{REV}:{src}')
    files.append({**save('candidate-source/' + src, data), 'origin': src, 'revision': REV})
for src in ['qa-acceptance/cases/manual.json', 'qa-acceptance/cases/release.json',
            'qa-acceptance/requirements/catalog.json',
            'qa-acceptance/requirements/sequence-failure-policy.md',
            'qa-acceptance/requirements/left-members-decision.md']:
    data = git(QA, 'show', f'{QA_REV}:{src}')
    files.append({**save('qa-source/' + src.removeprefix('qa-acceptance/'), data),
                  'origin': src, 'revision': QA_REV})
for src in ['build-preparation.json', 'build.log', 'verify-original.log']:
    data = (OUT.parent / src).read_bytes()
    files.append({**save('preparation/' + src, data), 'origin': '../' + src})
catalog = json.loads((OUT / 'qa-source/requirements/catalog.json').read_text())
required_additions = [r for r in catalog if r['scope'] == 'required' and r['id'].startswith('ADD-')]
files.append(save('approved-additions.json', (json.dumps(required_additions, ensure_ascii=False, indent=2) + '\n').encode()))
original = next(x for x in files if x['origin'] == 'docs/original-interview-question.md')
assert original['sha256'] == 'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75'
record = {'reviewedAt': datetime.now(timezone.utc).isoformat(), 'reviewer': 'independent QA / intake_risk_map',
          'formalRunId': formal['runId'], 'formalStartedAt': formal['startedAt'],
          'sutRevision': REV, 'qaRevision': QA_REV, 'sutDirectory': str(SUT),
          'commands': commands, 'originalSha256': original['sha256'], 'sources': files,
          'productSystemsStartedByThisReview': 0, 'databasesOrBrowsersUsedByThisReview': 0,
          'formalManualRecordsWritten': 0}
save('source-index.json', (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode())
print(json.dumps({'reviewedAt': record['reviewedAt'], 'sourceFiles': len(files),
                  'requiredAdditions': len(required_additions), 'sutStatus': commands['git status --porcelain=v1 --untracked-files=all']}, ensure_ascii=False))
