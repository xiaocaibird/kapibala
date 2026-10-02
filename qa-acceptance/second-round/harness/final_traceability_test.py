"""QA-only integrity fixtures; never start or connect to the product."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('final_traceability', Path(__file__).with_name('final-traceability.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sign(directory, names):
    write(directory / 'report-hashes.json', {name: MODULE.file_sha(directory / name) for name in names})


def fixture(root):
    report, archive_dir, raw = root / 'report', root / 'archive', root / 'raw'
    report.mkdir(); archive_dir.mkdir()
    ids = ['SR-BE-DEL-001'] + [f'SR-TEST-{i:03}' for i in range(1, 112)]
    requirements = [f'REQ-{i:03}' for i in range(73)]
    rows = [{'id': case_id, 'status': 'PASS', 'requirements': [requirements[i % 73]], 'variants': []} for i, case_id in enumerate(ids)]
    manifest = {'runId': 'qa-only-fixture', 'sutRevision': 'a' * 40, 'qaRevision': 'b' * 40, 'autoRetries': 0,
                'completedAt': '2026-10-02T00:00:00Z', 'selection': 'all second-round cases', 'selectedCaseIds': ids}
    old_rows = [{'id': req, 'title': req, 'candidate': copy.deepcopy(manifest), 'currentCases':
                 [{'id': r['id'], 'mode': 'automated-driver', 'statusAtReview': 'NOT_RUN_AT_REVIEW', 'result': None} for r in rows if req in r['requirements']]}
                for req in requirements]
    reports = [{'report': {'path': f'/old/report-{i}.md', 'sha256': hashlib.sha256(str(i).encode()).hexdigest()},
                'contents': {'originalStatus': 'BLOCKED'}} for i in range(4)]
    original = {'reviewedAt': '2026-10-01T00:00:00Z', 'currentRequirements': old_rows,
                'originalRequirements': [{'id': f'OLD-{i:03}', 'historicalResults': [{'status': 'FAIL'}]} for i in range(128)],
                'firstRoundSignedReports': reports, 'sourceIndex': {r['report']['path']: {'sha256': r['report']['sha256']} for r in reports}}
    write(raw / 'cases/SR-BE-DEL-001/delivery-traceability.json', original)
    for row in rows:
        write(raw / 'cases' / row['id'] / 'result.json', row)
    raw_results = {'manifest': manifest, 'cases': rows}
    write(raw / 'results.json', raw_results); write(raw / 'manifest.json', manifest)
    entries = []
    with tarfile.open(archive_dir / 'evidence.tar.gz', 'w:gz') as tar:
        for path in sorted(raw.rglob('*.json')):
            member = 'run/' + path.relative_to(raw).as_posix()
            entries.append({'member': member, 'source': str(path), 'bytes': path.stat().st_size, 'sha256': MODULE.file_sha(path)})
            tar.add(path, arcname=member, recursive=False)
    archive = archive_dir / 'evidence.tar.gz'
    index = {'runId': manifest['runId'], 'archive': archive.name, 'bytes': archive.stat().st_size,
             'sha256': MODULE.file_sha(archive), 'fileCount': len(entries), 'files': entries}
    write(archive_dir / 'evidence-index.json', index); write(archive_dir / 'results.json', raw_results)
    sign(archive_dir, ['results.json'])
    binding = dict(runId=manifest['runId'], sutRevision=manifest['sutRevision'], qaRevision=manifest['qaRevision'],
                   archive=str(archive_dir), archiveSha256=index['sha256'], archiveBytes=index['bytes'], fileCount=len(entries))
    final = {'issuedAt': '2026-10-02T00:00:01Z', 'verdict': 'BLOCKED', 'scope': 'self-test fixture', 'productionReadiness': 'NOT_ASSESSED',
             'reference': manifest, 'batches': [binding], 'total': 112, 'counts': {'PASS': 112, 'FAIL': 0, 'BLOCKED': 0, 'NOT_RUN': 0},
             'cases': [dict(r, executionRunId=manifest['runId'], executionSutRevision=manifest['sutRevision'], executionQaRevision=manifest['qaRevision']) for r in rows],
             'requirements': [{'requirementId': req, 'status': 'PASS', 'cases': [r['id'] for r in rows if req in r['requirements']]} for req in requirements]}
    write(report / 'results.json', final); sign(report, ['results.json'])
    return report, archive_dir, original


class FinalTraceabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qa-final-traceability-self-')
        self.addCleanup(self.temp.cleanup)
        self.report, self.archive, self.original = fixture(Path(self.temp.name))

    def mutate_final(self, change):
        path = self.report / 'results.json'; data = MODULE.read_json(path); change(data); write(path, data)
        sign(self.report, ['results.json'])

    def test_preserves_history_raw_and_final_verdict_and_is_idempotent(self):
        raw_before = MODULE.file_sha(self.archive / 'evidence.tar.gz')
        signed_result = MODULE.file_sha(self.report / 'results.json')
        outcome = MODULE.refresh(self.report)
        document = MODULE.read_json(self.report / 'final-traceability.json')
        for key in ['originalRequirements', 'firstRoundSignedReports', 'sourceIndex']:
            self.assertEqual(document[key], self.original[key])
        self.assertEqual(document['finalReport']['verdict'], 'BLOCKED')
        self.assertEqual(document['counts']['currentCases'], 112)
        self.assertEqual(outcome['verifiedFiles'], 115)
        self.assertNotIn('NOT_RUN_AT_REVIEW', json.dumps(document['currentRequirements']))
        self.assertEqual(MODULE.file_sha(self.archive / 'evidence.tar.gz'), raw_before)
        self.assertEqual(MODULE.file_sha(self.report / 'results.json'), signed_result)
        hashes = MODULE.checked_hashes(self.report)
        MODULE.refresh(self.report)
        self.assertEqual(MODULE.checked_hashes(self.report), hashes)

    def test_refuses_tampered_signed_result(self):
        (self.report / 'results.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Signed artifact hash mismatch'):
            MODULE.refresh(self.report)
        self.assertFalse((self.report / 'final-traceability.json').exists())

    def test_refuses_modified_archive_even_if_gzip_still_readable(self):
        with (self.archive / 'evidence.tar.gz').open('ab') as stream:
            stream.write(b'extra bytes')
        with self.assertRaisesRegex(ValueError, 'Archive SHA256 mismatch'):
            MODULE.refresh(self.report)

    def test_refuses_index_member_hash_mismatch(self):
        path = self.archive / 'evidence-index.json'; index = MODULE.read_json(path)
        index['files'][0]['sha256'] = '0' * 64; write(path, index)
        with self.assertRaisesRegex(ValueError, 'Archive member hash mismatch'):
            MODULE.refresh(self.report)

    def test_refuses_case_revision_drift(self):
        self.mutate_final(lambda final: final['cases'][0].update(executionSutRevision='c' * 40))
        with self.assertRaisesRegex(ValueError, 'Case version mismatch'):
            MODULE.refresh(self.report)

    def test_refuses_missing_case_mapping(self):
        self.mutate_final(lambda final: final['requirements'][0]['cases'].pop())
        with self.assertRaisesRegex(ValueError, 'Requirement/case mapping mismatch'):
            MODULE.refresh(self.report)

    def test_refuses_unexplained_status_rewrite(self):
        def change(final):
            final['cases'][0]['status'] = 'BLOCKED'; final['counts'].update(PASS=111, BLOCKED=1)
        self.mutate_final(change)
        with self.assertRaisesRegex(ValueError, 'Unexplained final/raw status change'):
            MODULE.refresh(self.report)

    def test_refuses_overwriting_unsigned_output(self):
        (self.report / 'final-traceability.json').write_text('unowned')
        with self.assertRaisesRegex(ValueError, 'unsigned traceability output'):
            MODULE.refresh(self.report)
        self.assertEqual((self.report / 'final-traceability.json').read_text(), 'unowned')


if __name__ == '__main__':
    unittest.main()
