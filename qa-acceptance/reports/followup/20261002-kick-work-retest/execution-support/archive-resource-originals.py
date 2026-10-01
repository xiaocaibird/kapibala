"""Byte-preserving streamed archive of this run's raw readonly resource snapshots."""
from pathlib import Path
import hashlib,json,tarfile,gzip
qa=Path.cwd();out=qa/'reports/followup/20261002-kick-work-retest'
files=sorted((out/'resource-audit').glob('snapshot-*.json'))
archive=out/'resource-observation-originals.tar.gz';entries=[]
with archive.open('xb') as sink:
 with gzip.GzipFile(fileobj=sink,mode='wb',mtime=0,compresslevel=3) as gz:
  with tarfile.open(fileobj=gz,mode='w') as tar:
   for p in files:
    if p.is_symlink():raise RuntimeError('Refuse symlink')
    with p.open('rb') as f:checksum=hashlib.file_digest(f,'sha256').hexdigest()
    e={'path':str(p.relative_to(qa)),'bytes':p.stat().st_size,'sha256':checksum};entries.append(e)
    info=tarfile.TarInfo(e['path']);info.size=e['bytes'];info.mode=0o644;info.mtime=0
    with p.open('rb') as f:tar.addfile(info,f)
with archive.open('rb') as f:checksum=hashlib.file_digest(f,'sha256').hexdigest()
index={'runId':'2026-10-01T20-05-52.805Z-2f02f728','rawChanged':False,'originalFileCount':len(entries),'originalByteCount':sum(e['bytes'] for e in entries),'archive':archive.name,'archiveBytes':archive.stat().st_size,'archiveSha256':checksum,'files':entries,'note':'Large duplicate extracted facts preserved as original bytes; not counts of distinct resources. Readonly wrong-run-id snapshot remains with runs=0 and is not another product execution.'}
(out/'resource-observation-file-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive,'r|gz') as tar:
 for entry in entries:
  member=tar.next()
  if not member or member.name!=entry['path'] or member.size!=entry['bytes']:raise RuntimeError('Member identity mismatch')
  with tar.extractfile(member) as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
  if actual!=entry['sha256']:raise RuntimeError('Original byte mismatch')
 if tar.next() is not None:raise RuntimeError('Extra member')
print(json.dumps({k:v for k,v in index.items() if k!='files'}),flush=True)
