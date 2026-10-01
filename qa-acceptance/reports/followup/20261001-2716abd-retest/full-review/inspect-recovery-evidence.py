"""Read frozen local run evidence only; prints reviewer input, never edits a verdict.
Usage: python3 inspect-recovery-evidence.py > <new reviewer-input.json>
No product, Docker, HTTP, browser, source, original event/report writes.
"""
from pathlib import Path
import json,hashlib,sys
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[4]
RUN=ROOT/'reports/runs/2026-10-01T14-26-25.068Z-1e0cb38a'
IDS=['BLK-EXT-002','BLK-EXT-003','BLK-EXT-004','BLK-EXT-005','REC-007','INT-MSG-007']
EXPECTED={'runId':RUN.name,'phase':'business-acceptance','sutRevision':'2716abdd2d43a779b6a0972a6323f895cf2b5b9c','qaRevision':'ec46f9b30fb2f5a312c92fc78463ddbfe200042f','targetSha256':'6ccd4df091116eea6ee0324771526dde531bb834d5e3264bc76c5e9f706a028e'}
HASH='40b301c87542929beab4974f140879da2a698ac9498056cc2c3a3c5c1f52b0bd'
index={}
def raw(p):
 p=p.resolve();assert p.is_relative_to(ROOT.resolve());b=p.read_bytes();index[str(p.relative_to(ROOT))]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};return b
def read(p):return json.loads(raw(p))
def safe(p):
 p=Path(p)
 if not p.is_absolute():p=RUN/p
 p=p.resolve();assert p.is_relative_to(RUN.resolve()),'Evidence outside exact frozen run; do not silently rebind it';return p
m=read(RUN/'manifest.json')
assert all(m.get(k)==v for k,v in EXPECTED.items()),'Different run/version/phase/target needs explicit independent review'
assert m['qaTree']['sha256']==HASH
out={'reviewMode':'PREPARATION_ONLY_NO_ADJUDICATION','basis':EXPECTED|{'qaTreeSha256':HASH},'cases':{},'gates':{},'limits':['Does not classify note text as permanent pause automatically.','Does not infer product failure from 20/30 seconds or from previous versions.','No source/result/event changes; candidate facts require reviewer verification of full fault/effect/identity chain.']}
events=read(RUN/'events.json')if(RUN/'events.json').exists()else[]
summary=read(RUN/'runner-summary.json')if(RUN/'runner-summary.json').exists()else None
results=read(RUN/'results.json')if(RUN/'results.json').exists()else None
out['gates']['runnerCompleted']=bool(summary and summary.get('completedAt'))
out['gates']['runnerErrors']=None if not summary else summary.get('runnerErrors')
if results:
 md=results['metadata'];out['gates']['metadataMatchesManifest']=all(md.get(k)==m.get(k)for k in EXPECTED)
 out['gates']['qaSourceStable']=md.get('qaTreeAfter',{}).get('sha256')==HASH
 out['gates']['integrity']=results.get('integrity')
for cid in IDS:
 attempts=[x for x in events if x.get('id')==cid]
 row={'rawAttempts':attempts,'reviewedStatus':None,'factAvailability':'AWAITING_RAW_COMPLETED_ATTEMPT','reviewDecision':'NOT_MADE','publicResources':[],'proofFiles':[]}
 out['cases'][cid]=row
 if not attempts:continue
 if len(attempts)!=1 or attempts[0].get('attempt')!=0 or not attempts[0].get('completedAt'):
  row['factAvailability']='ATTEMPT_INTEGRITY_REVIEW_REQUIRED';continue
 a=attempts[0];row['rawStatus']=a['status'];row['factAvailability']='COMPLETED_RAW_ATTEMPT_REQUIRES_INDEPENDENT_REVIEW'
 edirs=[safe(p)for p in a.get('evidence',[])if safe(p).is_dir()]
 if len(edirs)!=1:
  row['factAvailability']='EXACT_EVIDENCE_DIRECTORY_MISSING_OR_AMBIGUOUS';continue
 e=edirs[0];api=e/'api.ndjson';resources={};malformed=[]
 if api.exists():
  lines=raw(api).decode().splitlines()
  for number,line in enumerate(lines,1):
   try:d=json.loads(line)
   except ValueError:malformed.append(number);continue
   if d.get('method')!='GET'or d.get('phase')!='response':continue
   path=urlparse(d.get('url','')).path
   if not any(path.startswith(p)for p in ['/api/jobs/','/api/agent-runs/','/api/sequence-runs/']):continue
   if d.get('status')!=200:continue
   body=d.get('responseBody')
   try:body=json.loads(body)if isinstance(body,str)else body
   except ValueError:malformed.append(number);continue
   if not isinstance(body,dict):continue
   obs={'line':number,'qaRequestId':d.get('qaRequestId'),'startedAt':d.get('startedAt'),'path':path,'id':body.get('id'),'status':body.get('status'),'processing':body.get('processing'),'endReason':body.get('endReason'),'recoveryNote':body.get('recoveryNote'),'groupId':body.get('groupId')}
   resources.setdefault(path,[]).append(obs)
  for path,samples in resources.items():
   notes=[x for x in samples if x.get('recoveryNote')]
   row['publicResources'].append({'path':path,'responseCount':len(samples),'first':samples[0],'last':samples[-1],'nonemptyNoteCount':len(notes),'firstNonemptyNote':notes[0]if notes else None,'lastNonemptyNote':notes[-1]if notes else None,'distinctNotes':sorted({str(x['recoveryNote'])for x in notes}),'artifact':str(api.relative_to(ROOT))})
  row['malformedApiLines']=malformed
 for p in e.glob('*.json'):
  if p.name.startswith(('created-id-lost','promotion-','kick-applied','kick-rejoin','lost-model-response','receipt-window','message-window-final-ledger','external-facts','cleanup','kill-')):
   value=read(p);row['proofFiles'].append({'path':str(p.relative_to(ROOT)),'topLevelKeys':list(value)if isinstance(value,dict)else None})
   if cid=='INT-MSG-007'and p.name=='receipt-window-after-restart.json':
    row['receiptEvidence']={k:value.get(k)for k in ['mode','receipt','crashLower','restartUpper','replayLower','replayDeliveryUpper']}
    row['receiptEvidence']['held']=value.get('held');row['receiptEvidence']['resumed']=value.get('resumed')
 if any(r['nonemptyNoteCount']for r in row['publicResources']):row['reviewFocus']='PUBLIC_NOTE_PRESENT: independently establish meaning, fault chain, exact resource and recovery refusal before adjudication; not automatic FAIL.'
 elif a['status']=='FAIL'and 'Condition not reached' in a.get('reason',''):row['reviewFocus']='TIMEOUT_ONLY_POSSIBLE: 30s is a QA probe, not a product deadline. Raw FAIL retained; reviewed product verdict requires evidence.'
 else:row['reviewFocus']='Assess actual explicit violation, finite observation gap or complete success from original evidence.'
out['sourceIndex']=index
print(json.dumps(out,ensure_ascii=False,indent=2))
