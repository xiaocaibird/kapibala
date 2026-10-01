"""Seal delivery bytes; omit only independently indexed archive-backed duplicates."""
from pathlib import Path
import hashlib,json,datetime
r=Path.cwd()/'reports/followup/20261002-kick-work-retest'
assert (r/'report-independent-review.json').is_file(),'Final readonly report review required'
files=[]
for p in sorted(r.rglob('*')):
 if not p.is_file():continue
 name=str(p.relative_to(r))
 if p.is_symlink():raise RuntimeError('Refuse symlink')
 if name in ['delivery-integrity.json','SHA256SUMS'] or p.suffix in ['.log','.txt']:continue
 if p.parent.name=='resource-audit' and p.name.startswith('snapshot-') and 'preflight' not in p.name:continue
 with p.open('rb') as f:checksum=hashlib.file_digest(f,'sha256').hexdigest()
 files.append({'path':name,'bytes':p.stat().st_size,'sha256':checksum})
seal={'formatVersion':1,'sealedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'archiveBackedExceptions':['ignored native preflight originals and .log/.txt: original-file-index.json','large duplicate raw readonly resource snapshots: resource-observation-file-index.json'],'sourceExecutionVersion':'4f1af77add3b4ae32161b0581e2a913058c60909','productExecutionRevision':'7d53ee1f054961c9c997ff79dcb30e5a7e89ac46'}
(r/'delivery-integrity.json').write_text(json.dumps(seal,ensure_ascii=False,indent=2)+'\n')
(r/'SHA256SUMS').write_text(''.join(e['sha256']+'  '+e['path']+'\n' for e in files))
print(json.dumps({'sealedFiles':len(files),'sealedBytes':sum(e['bytes'] for e in files)}))
