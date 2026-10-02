#!/usr/bin/env python3
"""Refresh DEL001 from an issued report; raw archives and historical verdicts are immutable.

Usage: python3 final-traceability.py --report /absolute/issued-report-directory
This is evidence post-processing, never a product test or a new adjudication.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

STATUSES = ('PASS', 'FAIL', 'BLOCKED', 'NOT_RUN')
TRACE_MEMBER = 'run/cases/SR-BE-DEL-001/delivery-traceability.json'
OUTPUTS = ('final-traceability.json', 'final-traceability.md')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_file(root, name):
    relative = PurePosixPath(name)
    require(not relative.is_absolute() and relative.parts and all(p not in ('.', '..') for p in relative.parts), 'Unsafe relative artifact: ' + name)
    path = root.joinpath(*relative.parts)
    require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), 'Missing/nonregular/outside artifact: ' + str(path))
    return path


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def checked_hashes(directory):
    path = safe_file(directory, 'report-hashes.json')
    hashes = read_json(path)
    require(isinstance(hashes, dict) and hashes, 'Empty report hash manifest')
    for name, want in hashes.items():
        require(name != 'report-hashes.json' and isinstance(want, str) and re.fullmatch('[0-9a-f]{64}', want), 'Invalid signed artifact hash: ' + name)
        require(file_sha(safe_file(directory, name)) == want, 'Signed artifact hash mismatch: ' + str(directory / name))
    return hashes


def unique(rows, key, label, count=None):
    require(isinstance(rows, list), label + ' must be a list')
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), 'Duplicate ' + label)
    if count is not None:
        require(len(result) == count, f'{label} count must be {count}, got {len(result)}')
    return result


def verify_batch(binding, full=False):
    directory = Path(binding['archive']).resolve()
    signed = checked_hashes(directory)
    require('results.json' in signed, 'Unsigned batch results')
    index_path = safe_file(directory, 'evidence-index.json')
    index = read_json(index_path)
    require(index['runId'] == binding['runId'], 'Archive run identity mismatch')
    archive = safe_file(directory, index['archive'])
    require(index['sha256'] == binding['archiveSha256'] == file_sha(archive), 'Archive SHA256 mismatch: ' + str(archive))
    require(archive.stat().st_size == index['bytes'], 'Archive byte count mismatch')
    if 'archiveBytes' in binding:
        require(index['bytes'] == binding['archiveBytes'], 'Final archive byte count differs')
    entries = unique(index['files'], 'member', 'archive members', index['fileCount'])
    if 'fileCount' in binding:
        require(len(entries) == binding['fileCount'], 'Final archive member count differs')
    seen, extracted = set(), {}
    wanted = {'run/results.json', 'run/manifest.json'} | ({TRACE_MEMBER} if full else set())
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            require(member.isfile() and member.name in entries and member.name not in seen, 'Unexpected/nonregular/duplicate archive member: ' + member.name)
            parts = PurePosixPath(member.name)
            require(not parts.is_absolute() and '..' not in parts.parts, 'Unsafe archive member')
            entry = entries[member.name]
            require(member.size == entry['bytes'], 'Archive member size mismatch: ' + member.name)
            stream = tar.extractfile(member)
            h, size, chunks = hashlib.sha256(), 0, []
            keep = member.name in wanted or bool(re.fullmatch(r'run/cases/[^/]+/result\.json', member.name))
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(chunk); size += len(chunk)
                if keep:
                    chunks.append(chunk)
            require(size == entry['bytes'] and h.hexdigest() == entry['sha256'], 'Archive member hash mismatch: ' + member.name)
            if keep:
                extracted[member.name] = json.loads(b''.join(chunks))
            seen.add(member.name)
    require(seen == set(entries), 'Archive index contains missing members')
    batch = read_json(directory / 'results.json')
    require(extracted.get('run/results.json') == batch, 'Batch copy differs from archived original results')
    manifest = batch['manifest']
    require(extracted.get('run/manifest.json') == manifest, 'Archived manifest differs from raw results')
    require(manifest.get('completedAt') and manifest.get('autoRetries') == 0, 'Incomplete/retried raw batch')
    for key in ('runId', 'sutRevision', 'qaRevision'):
        require(manifest[key] == binding[key], 'Final/raw batch binding differs: ' + key)
    if full:
        require(manifest['selection'] == 'all second-round cases' and TRACE_MEMBER in extracted, 'Full batch/DEL001 traceability missing')
    return {'binding': binding, 'directory': directory, 'manifest': manifest, 'results': batch,
            'entries': entries, 'json': extracted,
            'verification': {'runId': binding['runId'], 'sutRevision': binding['sutRevision'], 'qaRevision': binding['qaRevision'],
                             'archive': str(archive), 'archiveSha256': index['sha256'], 'archiveBytes': index['bytes'],
                             'evidenceIndex': str(index_path), 'evidenceIndexSha256': file_sha(index_path),
                             'verifiedFileCount': len(seen), 'batchReportHashes': signed}}


def member_reference(batch, name):
    require(name in batch['entries'], 'Missing archived evidence: ' + name)
    return dict(batch['entries'][name], runId=batch['manifest']['runId'], archiveSha256=batch['verification']['archiveSha256'])


def evidence_reference(batch, case_id):
    prefix = 'run/cases/' + case_id + '/'
    entries = [entry for name, entry in batch['entries'].items() if name.startswith(prefix)]
    require(entries, 'Case has no archived evidence: ' + case_id)
    return {'rawResult': member_reference(batch, prefix + 'result.json'), 'caseArchivePrefix': prefix,
            'verifiedCaseFileCount': len(entries), 'archive': batch['verification']['archive'],
            'archiveSha256': batch['verification']['archiveSha256'],
            'evidenceIndex': batch['verification']['evidenceIndex'], 'evidenceIndexSha256': batch['verification']['evidenceIndexSha256'],
            'resolution': 'Exact member names, original source paths, byte counts and SHA256 values are in the verified evidence index; no live source file is substituted.'}


def count_status(rows):
    return {status: sum(row['status'] == status for row in rows) for status in STATUSES}


def build_document(report_directory):
    report_directory = report_directory.resolve()
    signed = checked_hashes(report_directory)
    require('results.json' in signed, 'Final results must be signed')
    final = read_json(report_directory / 'results.json')
    require(final.get('issuedAt') and final.get('verdict') in STATUSES, 'Not an issued final report')
    cases = unique(final['cases'], 'id', 'final cases', 112)
    requirements = unique(final['requirements'], 'requirementId', 'final requirements', 73)
    require(final['total'] == 112 and all(row['status'] in STATUSES for row in cases.values()), 'Invalid final case total/status')
    require(final['counts'] == count_status(cases.values()), 'Final case counts disagree')
    reference = final['reference']
    bindings = unique(final['batches'], 'runId', 'final batches')
    require(reference['runId'] in bindings, 'Reference full batch absent')
    batches = {key: verify_batch(binding, key == reference['runId']) for key, binding in bindings.items()}
    full = batches[reference['runId']]
    require(full['manifest'] == reference, 'Final reference differs from archived full manifest')
    original = full['json'][TRACE_MEMBER]
    old_rows = unique(original['currentRequirements'], 'id', 'original current requirement mapping', 73)
    unique(original['originalRequirements'], 'id', 'original requirements', 128)
    require(len(original['firstRoundSignedReports']) == 4, 'Expected four historical signed reports')
    require(set(old_rows) == set(requirements), 'Final requirement scope differs from archived DEL001')
    old_case_ids = {c['id'] for row in old_rows.values() for c in row['currentCases']}
    require(old_case_ids == set(cases), 'Final case scope differs from archived DEL001')
    for historical in original['firstRoundSignedReports']:
        report = historical['report']
        require(original['sourceIndex'].get(report['path'], {}).get('sha256') == report['sha256'], 'Historical signed report/source index disagreement')
    final_cases = {}
    for case_id, row in cases.items():
        batch = batches.get(row['executionRunId'])
        require(batch is not None, 'Case execution batch missing: ' + case_id)
        for final_key, raw_key in [('executionSutRevision', 'sutRevision'), ('executionQaRevision', 'qaRevision')]:
            require(row[final_key] == batch['manifest'][raw_key], 'Case version mismatch: ' + case_id)
        require(case_id in batch['manifest']['selectedCaseIds'], 'Case not selected in its execution batch: ' + case_id)
        member = 'run/cases/' + case_id + '/result.json'
        require(member in batch['json'], 'Case raw result missing: ' + case_id)
        raw = batch['json'][member]
        raw_batch_row = next((r for r in batch['results']['cases'] if r['id'] == case_id), None)
        require(raw_batch_row is not None and raw['status'] == raw_batch_row['status'], 'Raw case/raw batch disagreement: ' + case_id)
        require(row['requirements'] == raw_batch_row['requirements'], 'Case requirements changed after execution: ' + case_id)
        if row['status'] != raw['status']:
            require(row.get('rawStatus') == raw['status'] and (row.get('composition') or row.get('review', {}).get('classification') == 'QA_PREMISE_ERROR'), 'Unexplained final/raw status change: ' + case_id)
        value = copy.deepcopy(row)
        value['mappingKind'] = 'ISSUED_FINAL_RESULT_MAPPING'
        value['rawObservationStatus'] = raw['status']
        value['archivedEvidence'] = evidence_reference(batch, case_id)
        value['compositionEvidence'] = None
        if row.get('composition'):
            composition = row['composition']
            supplement = batches.get(composition['supplementRunId'])
            require(supplement is not None, 'Composition supplement archive missing: ' + case_id)
            for key in ('sutRevision', 'qaRevision'):
                require(composition[key] == supplement['manifest'][key], 'Composition supplement version mismatch: ' + case_id)
            value['compositionEvidence'] = {'prerequisite': member_reference(batch, composition['prerequisiteArchiveMember']),
                                          'supplementResults': member_reference(supplement, 'run/results.json'),
                                          'supplementArchive': supplement['verification'], 'record': copy.deepcopy(composition)}
        final_cases[case_id] = value
    refreshed = []
    for requirement_id, old in old_rows.items():
        final_requirement = requirements[requirement_id]
        linked = [c for c in cases.values() if requirement_id in c['requirements']]
        require(set(final_requirement['cases']) == {c['id'] for c in linked} == {c['id'] for c in old['currentCases']}, 'Requirement/case mapping mismatch: ' + requirement_id)
        statuses = {c['status'] for c in linked}
        expected = 'FAIL' if 'FAIL' in statuses else 'PASS' if statuses == {'PASS'} else 'BLOCKED'
        require(final_requirement['status'] == expected, 'Requirement aggregate mismatch: ' + requirement_id)
        row = copy.deepcopy(old)
        row['candidateAtReview'] = row.pop('candidate')
        row['candidate'] = copy.deepcopy(reference)
        row['mappingKind'] = 'ISSUED_FINAL_RESULT_MAPPING'
        row['status'] = final_requirement['status']
        row['finalReportIssuedAt'] = final['issuedAt']
        old_current = {c['id']: c for c in row['currentCases']}
        row['currentCases'] = [dict(id=case_id, automation=old_current[case_id].get('automation'), mode=old_current[case_id].get('mode'),
                                    status=final_cases[case_id]['status'], executionRunId=final_cases[case_id]['executionRunId'],
                                    executionSutRevision=final_cases[case_id]['executionSutRevision'], executionQaRevision=final_cases[case_id]['executionQaRevision'],
                                    evidence=final_cases[case_id]['archivedEvidence'], composition=final_cases[case_id]['compositionEvidence'],
                                    result=final_cases[case_id]) for case_id in final_requirement['cases']]
        refreshed.append(row)
    document = copy.deepcopy(original)
    document.update(schemaVersion=1, kind='DEL001 final issuance traceability mapping; no new product execution or adjudication',
                    reviewedAt=final['issuedAt'], originalTraceabilityReviewedAt=original['reviewedAt'], currentCandidate=copy.deepcopy(reference),
                    counts={'originalRequirements': 128, 'secondRoundRequirements': 73, 'currentCases': 112,
                            'finalCaseStatuses': copy.deepcopy(final['counts']), 'finalRequirementStatuses': count_status(refreshed)},
                    currentRequirements=refreshed, finalCases=list(final_cases.values()),
                    finalReport={'directory': str(report_directory), 'issuedAt': final['issuedAt'], 'verdict': final['verdict'],
                                 'resultsSha256': signed['results.json'], 'scope': final['scope'], 'productionReadiness': final['productionReadiness'],
                                 'inputReportHashes': {k: v for k, v in signed.items() if k not in OUTPUTS}},
                    traceabilitySource=member_reference(full, TRACE_MEMBER), verifiedArchives=[b['verification'] for b in batches.values()],
                    preservation={'originalRequirements': 'UNCHANGED', 'firstRoundSignedReports': 'UNCHANGED', 'historicalSourceIndex': 'UNCHANGED',
                                  'rawResultsAndArchives': 'READ_ONLY', 'currentMapping': 'Refreshed exclusively from issued final results, exact execution versions and verified archive evidence; early NOT_RUN_AT_REVIEW values are not current outcomes.'},
                    conclusion='The 73 current requirement rows map to the 112 issued final case outcomes with exact execution versions, verified evidence and explicit composition. Original 128 requirements, historical outcomes and four signed report hashes are preserved verbatim. This mapping neither changes the acceptance verdict nor closes human/production obligations.')
    require(document['originalRequirements'] == original['originalRequirements'] and document['firstRoundSignedReports'] == original['firstRoundSignedReports'] and document['sourceIndex'] == original['sourceIndex'], 'Historical preservation failure')
    require('NOT_RUN_AT_REVIEW' not in json.dumps(document['currentRequirements']), 'Early review placeholder leaked into final current mapping')
    return document, signed


def markdown(document):
    def cell(value):
        return str(value).replace('|', '／').replace('\n', ' ')
    final = document['finalReport']
    lines = ['# 签发时需求追踪映射', '', f"签发时间：{final['issuedAt']}；沿用最终验收结论 **{final['verdict']}**。", '',
             '本文件是已签发结果的追踪刷新，不是新产品测试或新的验收裁定。73 条当前要求对应 112 条最终用例；原 128 条要求、原版结果和四份历史签发报告 SHA256 原样保留。早期核查的 NOT_RUN_AT_REVIEW 不作为当前状态。', '',
             f"当前用例计数：`{json.dumps(document['counts']['finalCaseStatuses'], ensure_ascii=False)}`。需求计数：`{json.dumps(document['counts']['finalRequirementStatuses'], ensure_ascii=False)}`。", '',
             f"最终 results.json SHA256：`{final['resultsSha256']}`。完整版本、逐例证据成员及合证记录见 [结构化映射](final-traceability.json)。上线准备度：{final['productionReadiness']}。", '',
             '| 当前要求 | 结果 | 用例／确切批次／SUT／QA |', '|---|---|---|']
    for row in document['currentRequirements']:
        values = ['{} {} / {} / {} / {}{}'.format(c['id'], c['status'], c['executionRunId'], c['executionSutRevision'], c['executionQaRevision'], ' / COMPOSITE_EVIDENCE' if c['composition'] else '') for c in row['currentCases']]
        lines.append(f"| {row['id']} {cell(row['title'])} | {row['status']} | {'<br>'.join(values)} |")
    lines += ['', '## 保留的历史签发', '']
    for old in document['firstRoundSignedReports']:
        lines.append(f"- `{old['report']['path']}`：SHA256 `{old['report']['sha256']}`；原签发结果和处置不重写。")
    lines += ['', '## 完整性核对', '']
    for batch in document['verifiedArchives']:
        lines.append(f"- `{batch['runId']}`：归档 SHA256 `{batch['archiveSha256']}`；逐一读取并校验 {batch['verifiedFileCount']} 个文件。")
    lines += ['', '原始批次、截图与日志、历史签发和最终 results.json 均未改写。已有验收失败、阻塞、人工义务和上线评估边界继续有效。', '']
    return '\n'.join(lines)


def refresh(report_directory):
    directory = Path(report_directory).resolve()
    document, signed = build_document(directory)
    rendered = {OUTPUTS[0]: json.dumps(document, ensure_ascii=False, indent=2) + '\n', OUTPUTS[1]: markdown(document)}
    # Verify again before writing: refuse concurrent report regeneration or stale signatures.
    require(checked_hashes(directory) == signed, 'Report changed while traceability was being built')
    for name in OUTPUTS:
        path = directory / name
        require(not path.is_symlink(), 'Output must not be a symlink')
        require(not path.exists() or name in signed, 'Refuse to overwrite an unsigned traceability output')
    expanded = dict(signed)
    for name, contents in rendered.items():
        (directory / name).write_text(contents, encoding='utf-8')
        expanded[name] = sha(contents.encode('utf-8'))
    (directory / 'report-hashes.json').write_text(json.dumps(expanded, indent=2) + '\n', encoding='utf-8')
    require(checked_hashes(directory) == expanded, 'Post-write report hash mismatch')
    return {'report': str(directory), 'counts': document['counts'], 'verifiedArchives': len(document['verifiedArchives']),
            'verifiedFiles': sum(b['verifiedFileCount'] for b in document['verifiedArchives']), 'signedArtifacts': len(expanded),
            'outputs': list(OUTPUTS), 'rawArchiveWrites': 0, 'productExecutions': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', required=True, help='Existing issued final report directory')
    args = parser.parse_args()
    print(json.dumps(refresh(args.report), ensure_ascii=False))


if __name__ == '__main__':
    main()
