"""Read-only archival compatibility checks; no product process or test is run."""
import ast
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

# Load only the public reader function: the finalizer CLI deliberately executes
# at module scope, which must not issue reports when this small test is imported.
SOURCE = Path(__file__).with_name('finalize-report.py')
TREE = ast.parse(SOURCE.read_text())
FUNCTION = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == 'read_batch')
NAMESPACE = dict(Path=Path, hashlib=hashlib, json=json, tarfile=tarfile)
exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(SOURCE), 'exec'), NAMESPACE)
read_batch = NAMESPACE['read_batch']


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def create_fixture(path, legacy=False):
    results = {'manifest': {'runId': 'qa-only-self', 'completedAt': '2026-10-02T00:00:00Z', 'autoRetries': 0}, 'cases': []}
    write(path / 'results.json', results)
    content = (path / 'results.json').read_bytes()
    member = 'run/results.json'
    with tarfile.open(path / 'evidence.tar.gz', 'w:gz') as tar:
        info = tarfile.TarInfo(member); info.size = len(content); tar.addfile(info, io.BytesIO(content))
    archive = (path / 'evidence.tar.gz').read_bytes()
    index = {'archive': 'evidence.tar.gz', 'fileCount': 1,
             'files': [{'member': member, 'source': '/qa-owned-self/results.json', 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}]}
    if legacy:
        index.update(sourceRun='qa-only-self', archiveSha256=hashlib.sha256(archive).hexdigest(), archiveBytes=len(archive))
    else:
        index.update(runId='qa-only-self', sha256=hashlib.sha256(archive).hexdigest(), bytes=len(archive))
    write(path / 'evidence-index.json', index)
    write(path / 'report-hashes.json', {'results.json': hashlib.sha256(content).hexdigest()})
    return index


class ArchiveReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qa-finalizer-archive-self-')
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)

    def test_current_and_legacy_schemas_are_verified_without_rewriting(self):
        for legacy in [False, True]:
            original = create_fixture(self.path, legacy)
            before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.path.iterdir()}
            _, results, index = read_batch(self.path)
            self.assertEqual(index['runId'], results['manifest']['runId'])
            self.assertEqual(index['sha256'], original.get('sha256', original.get('archiveSha256')))
            self.assertEqual(before, {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.path.iterdir()})

    def test_alias_conflict_is_rejected(self):
        index = create_fixture(self.path, True); index['sha256'] = '0' * 64; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'Conflicting evidence-index aliases'):
            read_batch(self.path)

    def test_archive_size_and_hash_are_both_checked(self):
        index = create_fixture(self.path, True); index['archiveBytes'] += 1; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'byte count'):
            read_batch(self.path)
        index['archiveBytes'] -= 1; index['archiveSha256'] = '0' * 64; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'SHA256'):
            read_batch(self.path)

    def test_each_member_bytes_and_hash_are_checked(self):
        index = create_fixture(self.path, True); index['files'][0]['bytes'] += 1; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'member size'):
            read_batch(self.path)
        index['files'][0]['bytes'] -= 1; index['files'][0]['sha256'] = '0' * 64; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'member hash'):
            read_batch(self.path)

    def test_wrong_run_and_duplicate_index_are_rejected(self):
        index = create_fixture(self.path, True); index['sourceRun'] = 'other'; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'another run'):
            read_batch(self.path)
        index = create_fixture(self.path, True); index['files'].append(index['files'][0]); index['fileCount'] += 1; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'duplicate/count'):
            read_batch(self.path)

    def test_external_archive_path_is_rejected(self):
        index = create_fixture(self.path, True); index['archive'] = '../foreign.tar.gz'; write(self.path / 'evidence-index.json', index)
        with self.assertRaisesRegex(AssertionError, 'Unsafe archive artifact path'):
            read_batch(self.path)

    def test_signed_copy_cannot_replace_archived_original_results(self):
        create_fixture(self.path, True)
        results = json.loads((self.path / 'results.json').read_text()); results['cases'] = [{'id': 'invented', 'status': 'PASS'}]
        write(self.path / 'results.json', results)
        write(self.path / 'report-hashes.json', {'results.json': hashlib.sha256((self.path / 'results.json').read_bytes()).hexdigest()})
        with self.assertRaisesRegex(AssertionError, 'differ from the archived original'):
            read_batch(self.path)


if __name__ == '__main__':
    unittest.main()
