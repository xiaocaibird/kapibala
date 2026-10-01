from pathlib import Path
import sys,json,hashlib,tarfile,gzip,shutil,datetime
root=Path.cwd();source=(root/sys.argv[1]).resolve();assert source.parent==root/'reports/preflight'
assert json.loads((source/'runner-summary.json').read_text()).get('completedAt')
out=root/'reports/followup/20261002-dispatched-kick-budget/runs'/source.name;out.mkdir(parents=True,exist_ok=False)
files=[]
for path in sorted(source.rglob('*')):
 assert not path.is_symlink(),str(path)
 if not path.is_file():continue
 rel=str(path.relative_to(source));h=hashlib.sha256();size=0
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk);size+=len(chunk)
 files.append({'path':rel,'bytes':size,'sha256':h.hexdigest()})
 for_check=path.stat().st_size
 assert for_check==size
 if path.parent==source and path.suffix in ['.json','.xml','.md']:shutil.copyfile(path,out/path.name)
archive=out/'evidence.tar.gz'
with archive.open('xb') as raw:
 with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as compressed:
  with tarfile.open(fileobj=compressed,mode='w|') as tf:
   for item in files:tf.add(source/item['path'],arcname=source.name+'/'+item['path'],recursive=False)
with tarfile.open(archive,'r:gz') as tf:
 members=tf.getmembers();assert len(members)==len(files)
 for member,item in zip(members,files):
  assert member.isfile() and member.name==source.name+'/'+item['path']
  f=tf.extractfile(member);h=hashlib.sha256()
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
  assert h.hexdigest()==item['sha256']
b=archive.read_bytes();index={'archivedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceDirectory':str(source),'archiveRoot':source.name,'note':'Original bytes preserved including original developer-preflight labels and absolute evidence references. After extraction map sourceDirectory to extracted archiveRoot; do not rewrite original JSON.','files':files,'archive':{'path':'evidence.tar.gz','bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()},'verifiedDecompressedFiles':len(files)}
(out/'evidence-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'run':source.name,'files':len(files),'rawBytes':sum(f['bytes'] for f in files),'archiveBytes':len(b)}))
