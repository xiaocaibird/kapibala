"""Exact-byte completed full-run archival; no original file mutation or SUT access."""
from pathlib import Path
import json,hashlib,tarfile,gzip,shutil,datetime
BASE=Path(__file__).resolve().parent; QA=BASE.parents[2]
source=QA/'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a'
assert json.loads((source/'runner-summary.json').read_text())['completedAt']
assert len((source/'manual-events.ndjson').read_text().splitlines())==6
out=BASE/'raw-run'; out.mkdir(exist_ok=False)
files=[]
for p in sorted(source.rglob('*')):
    assert not p.is_symlink(),str(p)
    if not p.is_file(): continue
    h=hashlib.sha256();size=0
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk);size+=len(chunk)
    assert p.stat().st_size==size
    files.append({'path':str(p.relative_to(source)),'bytes':size,'sha256':h.hexdigest()})
    if p.parent==source and p.suffix in ['.json','.xml','.md']:shutil.copyfile(p,out/p.name)
archive=out/'evidence.tar.gz'
with archive.open('xb') as raw:
    with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as gz:
        with tarfile.open(fileobj=gz,mode='w|') as tf:
            for item in files:tf.add(source/item['path'],arcname=source.name+'/'+item['path'],recursive=False)
with tarfile.open(archive,'r:gz') as tf:
    members=tf.getmembers();assert len(members)==len(files)
    for member,item in zip(members,files):
        assert member.isfile() and member.name==source.name+'/'+item['path']
        h=hashlib.sha256()
        with tf.extractfile(member) as f:
            for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
        assert h.hexdigest()==item['sha256']
h=hashlib.sha256()
with archive.open('rb') as f:
    for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
index={'archivedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceDirectory':str(source),'archiveRoot':source.name,'originalPathsPreserved':True,'pathRebaseInstruction':'Extract evidence.tar.gz; map original sourceDirectory to extracted archiveRoot. Absolute paths in original JSON remain exact bytes.','files':files,'archive':{'path':'evidence.tar.gz','bytes':archive.stat().st_size,'sha256':h.hexdigest()},'verifiedDecompressedFiles':len(files)}
(out/'evidence-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(files),'rawBytes':sum(x['bytes'] for x in files),'archiveBytes':archive.stat().st_size}))
