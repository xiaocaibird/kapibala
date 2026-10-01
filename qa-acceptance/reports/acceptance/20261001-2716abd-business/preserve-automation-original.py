"""Append-only archival of generated automatic views before manual regeneration."""
from pathlib import Path
import json,hashlib,shutil,datetime
BASE=Path(__file__).resolve().parent; QA=BASE.parents[2]
RUN=QA/'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a'
m=json.loads((RUN/'manifest.json').read_text()); r=json.loads((RUN/'results.json').read_text())
runner=json.loads((RUN/'runner-summary.json').read_text())
assert runner['completedAt'] and not runner['runnerErrors']
assert m['sutRevision']=='2716abdd2d43a779b6a0972a6323f895cf2b5b9c'
assert m['qaTree']['sha256']==r['metadata']['qaTreeAfter']['sha256']
assert not (RUN/'manual-events.ndjson').exists()
out=RUN/'automation-original'; out.mkdir(exist_ok=False)
files=[]
for p in sorted(RUN.iterdir()):
    if not p.is_file() or p.suffix not in ['.json','.md','.xml']: continue
    assert not p.is_symlink()
    shutil.copyfile(p,out/p.name)
    b=p.read_bytes(); assert (out/p.name).read_bytes()==b
    files.append({'path':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(out/'index.json').write_text(json.dumps({'preservedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'purpose':'Original automatic generated views, preserved before manual append and report regeneration. events.json immutable; source after-tree proof retained here.','files':files},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'preserved':len(files),'qaTreeUnchanged':True}))
