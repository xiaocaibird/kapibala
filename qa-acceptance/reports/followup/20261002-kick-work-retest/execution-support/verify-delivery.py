"""Readonly verification; no SUT/DB/network/process launch except Git blob reads.
Default validates sealed delivery, indexes and conclusions. --verify-originals
also streams and hashes every original member of both compressed archives.
--git-revision HEAD validates actual committed Git bytes from any checkout.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess,tarfile,io,xml.etree.ElementTree as ET
ap=argparse.ArgumentParser();ap.add_argument('--git-revision');ap.add_argument('--verify-originals',action='store_true');a=ap.parse_args()
f=Path(__file__).resolve().parent.parent;repo=f.parents[3]
def read(rel):
 p=f/rel
 if a.git_revision:return subprocess.check_output(['git','-C',str(repo),'show',f'{a.git_revision}:{p.relative_to(repo).as_posix()}'])
 return p.read_bytes()
def digest(raw):return hashlib.sha256(raw).hexdigest()
seal=json.loads(read('delivery-integrity.json'))
for e in seal['files']:
 raw=read(e['path']);assert len(raw)==e['bytes'] and digest(raw)==e['sha256'],e['path']
r=json.loads(read('results.json'));m=json.loads(read('raw-run-summary/manifest.json'));ev=json.loads(read('raw-run-summary/events.json'))
assert r['sutRevision']==m['sutRevision']=='7d53ee1f054961c9c997ff79dcb30e5a7e89ac46'
assert r['executionQaRevision']==m['qaRevision']=='4f1af77add3b4ae32161b0581e2a913058c60909'
assert r['qaDirtyStateAtExecution']==m['qaDirtyState']=='?? qa-acceptance/reports/followup/20261002-kick-work-retest/executor-logs/20261001T200552-qa-first-round-kick-work-start.json\n'
assert m['qaDirtyState'].count('\n')==1 and '-start.json' in m['qaDirtyState']
assert r['qaTreeSha256']==m['qaTree']['sha256']
assert r['rawCounts']==r['independentCounts']=={'PASS':5,'FAIL':0,'BLOCKED':0}
assert len(ev)==5 and all(x['attempt']==0 and x['status']=='PASS' for x in ev)
assert len(r['cases'])==5 and r['productRuns']==1 and r['automaticRetries']==0 and r['driverCorrectionProductReruns']==0
assert not r['unconditionalAcceptance'] and not r['fullCandidateSuiteRerun']
assert r['businessConformity']=='NOT_ACCEPTED_WITH_UNRESOLVED_FIRST_ROUND_ITEMS'
assert r['releaseReadiness']=='NOT_ASSESSED'
assert r['workEvidence']['creationToCommitElapsedMs']==[58014.728959,58023.478584]
assert r['workEvidence']['hardBudgetListenerCount']==0
assert r['qaTooling']['selfTests']==r['qaTooling']['passed']==361
xml=ET.fromstring(read('junit.xml'));assert [xml.get(k) for k in ['tests','failures','errors','skipped']]==['5','0','0','0'];assert len(xml.findall('testcase'))==5
native=ET.fromstring(read('raw-run-summary/playwright.junit.xml'))
assert int(native.get('tests',-1))==5 and int(native.get('failures',-1))==0
archive_files=archive_bytes=0
for filename,expected_files,expected_bytes in [('original-file-index.json',1311,598357642),('resource-observation-file-index.json',6,2955164619)]:
 ix=json.loads(read(filename));assert ix['originalFileCount']==len(ix['files'])==expected_files;assert ix['originalByteCount']==sum(e['bytes'] for e in ix['files'])==expected_bytes
 raw=read(ix['archive']);assert len(raw)==ix['archiveBytes'] and digest(raw)==ix['archiveSha256']
 if a.verify_originals:
  with tarfile.open(fileobj=io.BytesIO(raw),mode='r|gz') as tar:
   for e in ix['files']:
    member=tar.next();assert member is not None and member.name==e['path'] and member.size==e['bytes']
    with tar.extractfile(member) as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
    assert actual==e['sha256'],e['path']
   assert tar.next() is None
 archive_files+=ix['originalFileCount'];archive_bytes+=ix['originalByteCount']
for old in r['historicalReportsImmutable']:
 p=repo/'qa-acceptance'/old['path'];raw=subprocess.check_output(['git','-C',str(repo),'show',f'{a.git_revision}:{p.relative_to(repo).as_posix()}']) if a.git_revision else p.read_bytes();assert digest(raw)==old['sha256'],old['path']
p=json.loads(read('input-provenance-review.json'));raw=read(p['file']);assert digest(raw)==p['actualSha256'] and len(raw)==927
print(json.dumps({'status':'PASS','source':a.git_revision or 'filesystem','sealedFiles':len(seal['files']),'archivedOriginalFiles':archive_files,'archivedOriginalBytes':archive_bytes,'eachOriginalMemberRehashed':a.verify_originals,'boundedCases':'5 PASS /0 FAIL /0 BLOCKED','firstRoundAccepted':False,'productExecutedByVerifier':False}))
