"""Read-only verification of the sealed report delivery; never starts a SUT.

Run from any directory. Use --git-revision HEAD to check committed Git bytes.
Raw ignored run files are delivered in the independently indexed archive.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--git-revision')
args = parser.parse_args()
folder = Path(__file__).resolve().parent.parent
repo = folder.parents[3]

def read(relative):
    path = folder / relative
    if args.git_revision:
        return subprocess.check_output([
            'git', '-C', str(repo), 'show',
            f'{args.git_revision}:{path.relative_to(repo).as_posix()}',
        ])
    return path.read_bytes()

integrity = json.loads(read('delivery-integrity.json'))
for item in integrity['files']:
    content = read(item['path'])
    assert len(content) == item['bytes'], item['path']
    assert hashlib.sha256(content).hexdigest() == item['sha256'], item['path']

index = json.loads(read('original-file-index.json'))
assert len(index['files']) == index['originalFileCount'] == 1559
assert sum(x['bytes'] for x in index['files']) == index['originalByteCount'] == 766909283
archive = read(index['archive'])
assert len(archive) == index['archiveBytes']
assert hashlib.sha256(archive).hexdigest() == index['archiveSha256']
results = json.loads(read('results.json'))
assert results['independentCounts'] == {'PASS': 1, 'FAIL': 2, 'BLOCKED': 0}
assert results['firstIndependentCounts'] == {'PASS': 0, 'FAIL': 2, 'BLOCKED': 1}
assert results['rawCounts'] == {'PASS': 0, 'FAIL': 3, 'BLOCKED': 0}
assert results['productInvocations'] == 4 and results['automaticRetries'] == 0
assert results['sutRevision'] == '01f2c1a237e84bcff68ade470402b369b345cd58'
assert not results['fullCandidateSuiteRerun']
assert results['releaseReadiness'] == 'NOT_ASSESSED'
assert results['qaTooling']['correctedSelfTests'] == 343
junit = ET.fromstring(read('junit.xml'))
assert [junit.get(k) for k in ('tests', 'failures', 'errors', 'skipped')] == ['3', '2', '0', '0']
assert len(junit.findall('testcase')) == 3
for old in results['historicalReportsImmutable']:
    path = repo / 'qa-acceptance' / old['path']
    content = subprocess.check_output([
        'git', '-C', str(repo), 'show',
        f'{args.git_revision}:{path.relative_to(repo).as_posix()}',
    ]) if args.git_revision else path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == old['sha256'], old['path']
print(json.dumps({
    'status': 'PASS', 'source': args.git_revision or 'filesystem',
    'sealedFiles': len(integrity['files']), 'originalFiles': 1559,
    'latestCases': '2 FAIL / 1 PASS', 'productStartedByVerifier': False,
}))
