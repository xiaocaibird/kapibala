from pathlib import Path
import hashlib, json, tarfile, gzip, io
qa=Path.cwd();run=qa/'reports/preflight/2026-10-01T18-39-27.933Z-15f16ec6';out=qa/'reports/followup/20261002-first-round-observation-retest'
files=sorted([p for p in run.rglob('*') if p.is_file()]+[p for p in out.rglob('*') if p.is_file() and p.suffix in ['.log','.txt']])
if any(p.is_symlink() for p in files): raise RuntimeError('Refuse symlink evidence')
entries=[]
archive=out/'original-evidence.tar.gz'
with archive.open('xb') as sink:
 with gzip.GzipFile(fileobj=sink,mode='wb',mtime=0) as gz:
  with tarfile.open(fileobj=gz,mode='w') as tar:
   for path in files:
    raw=path.read_bytes();name=str(path.relative_to(qa))
    entries.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    meta=tarfile.TarInfo(name);meta.size=len(raw);meta.mode=0o644;meta.mtime=0
    tar.addfile(meta,io.BytesIO(raw))
index={'runId':'2026-10-01T18-39-27.933Z-15f16ec6','rawChanged':False,'originalFileCount':len(entries),'originalByteCount':sum(e['bytes'] for e in entries),'archive':archive.name,'archiveBytes':archive.stat().st_size,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':entries}
(out/'original-file-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive,'r:gz') as tar:
 members=tar.getmembers()
 if len(members)!=len(entries): raise RuntimeError('Archive count mismatch')
 for member,entry in zip(members,entries):
  body=tar.extractfile(member).read()
  if member.name!=entry['path'] or len(body)!=entry['bytes'] or hashlib.sha256(body).hexdigest()!=entry['sha256']: raise RuntimeError('Original bytes mismatch')
print(json.dumps({k:v for k,v in index.items() if k!='files'}))
