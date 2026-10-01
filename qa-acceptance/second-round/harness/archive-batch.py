#!/usr/bin/env python3
"""Archive a completed immutable QA batch and re-read every archived byte."""
import argparse, hashlib, json, shutil, stat, tarfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--run',required=True);p.add_argument('--runtime',required=True);p.add_argument('--destination',required=True);a=p.parse_args()
run=Path(a.run).resolve();runtime=Path(a.runtime).resolve();out=Path(a.destination).resolve()
manifest=json.loads((run/'manifest.json').read_text());assert manifest.get('completedAt'),'batch must have finished'
assert manifest['runId']==run.name==runtime.name==out.name
assert not out.exists(),'never overwrite a previous archive'
for name,want in json.loads((run/'report-hashes.json').read_text()).items():assert hashlib.sha256((run/name).read_bytes()).hexdigest()==want
entries=[]
for prefix,root in [('run',run),('runtime',runtime)]:
 for path in sorted(root.rglob('*')):
  mode=path.lstat().st_mode
  if stat.S_ISDIR(mode):continue
  assert stat.S_ISREG(mode),f'Unexpected nonregular artifact: {path}'
  data=path.read_bytes();entries.append({'member':prefix+'/'+str(path.relative_to(root)),'source':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
out.mkdir(parents=True)
archive=out/'evidence.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for entry in entries:tar.add(entry['source'],arcname=entry['member'],recursive=False)
with tarfile.open(archive,'r:gz') as tar:
 assert len(tar.getmembers())==len(entries)
 for entry in entries:
  data=tar.extractfile(entry['member']).read();assert len(data)==entry['bytes'];assert hashlib.sha256(data).hexdigest()==entry['sha256']
for name in ['report.md','results.json','junit.xml','manifest.json','events.ndjson','target.json','authorization.json','report-hashes.json','database-owner.json','database-cleanup-verification.json']:
 if (run/name).exists():shutil.copyfile(run/name,out/name)
index={'runId':run.name,'archive':'evidence.tar.gz','bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'fileCount':len(entries),'verification':'Every archived regular file read back and SHA256 checked; original run not changed','files':entries}
(out/'evidence-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in index.items() if k!='files'}))
