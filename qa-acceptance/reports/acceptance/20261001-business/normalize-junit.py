"""Create valid CI copies; raw JUnit bytes and all result statuses remain immutable."""
from pathlib import Path
import re,json,hashlib,datetime,xml.etree.ElementTree as ET
B=Path(__file__).resolve().parent;Q=B.parents[2]
ansi=re.compile(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]')
def allowed(c):
 n=ord(c);return n in [9,10,13] or 0x20<=n<=0xd7ff or 0xe000<=n<=0xfffd or 0x10000<=n<=0x10ffff
records=[]
for folder in ['runs','preflight']:
 for source in sorted((Q/'reports'/folder).glob('*/junit.xml')):
  original=source.read_bytes();text=original.decode('utf-8');text,count=ansi.subn('',text)
  invalid=sum(not allowed(c) for c in text);text=''.join(c if allowed(c) else f'\\u{ord(c):04x}' for c in text)
  tree=ET.fromstring(text);cases=tree.findall('testcase');assert int(tree.attrib['tests'])==len(cases)
  assert int(tree.attrib.get('failures','0'))==sum(c.find('failure') is not None for c in cases)
  assert int(tree.attrib.get('skipped','0'))==sum(c.find('skipped') is not None for c in cases)
  out=B/'junit'/source.parent.name/'junit.xml';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(text)
  records.append({'raw':str(source.relative_to(Q)),'rawSha256':hashlib.sha256(original).hexdigest(),'normalized':str(out.relative_to(Q)),'normalizedSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'ansiSequencesRemoved':count,'invalidXmlCharactersRenderedAsLiteralUnicodeEscape':invalid,'testCount':len(cases),'failureCount':int(tree.attrib.get('failures','0')),'blockedOrNotRunCount':int(tree.attrib.get('skipped','0'))})
assert records
(B/'junit-normalization.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'policy':'Only presentation control sequences normalized; raw originals untouched. No test status, count or reason semantics changed. All copies parsed by Python ElementTree XML1.0. BLOCKED maps skipped, never PASS.','records':records},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'copies':len(records),'ansiSequencesRemoved':sum(r['ansiSequencesRemoved'] for r in records),'invalidXmlCharacters':sum(r['invalidXmlCharactersRenderedAsLiteralUnicodeEscape'] for r in records)}))
