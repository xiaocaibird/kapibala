import copy,unittest
import xml.etree.ElementTree as ET
from report_composition import compatibility_status,compose_uid_case,UID_VARIANTS,COMPATIBILITY_CASES,archive_composition_issues,execution_gate_rows,execution_gate_suite
class CompositionTest(unittest.TestCase):
 def test_missing_compatibility_is_not_pass(self):
  r=compatibility_status([]);self.assertEqual(r['status'],'BLOCKED');self.assertEqual(r['counts']['NOT_RUN'],8)
 def test_real_compatibility_failure_is_failure(self):
  b=[{'browser':x,'runId':x,'results':[{'id':c,'status':'PASS'} for c in COMPATIBILITY_CASES]} for x in ['firefox','webkit']]
  self.assertEqual(compatibility_status(b)['status'],'PASS');b[0]['results'][0]['status']='FAIL';self.assertEqual(compatibility_status(b)['status'],'FAIL')
 def test_uid_only_known_missing_obligation(self):
  s={'subObligationVerdict':'PASS','cleanupErrors':[],'manifest':{'runId':'uid','sutRevision':'same','qaRevision':'frozen'},'subObligations':[{'id':x,'status':'PASS','evidence':['actual']} for x in UID_VARIANTS]}
  c={'id':'SR-C2-008','status':'BLOCKED','reason':'Private storage subscenarios lack actual fixtures: foreign-owner'}
  rows=[{'variant':v,'status':'BLOCKED' if v=='foreign-owner' else 'PASS'} for v in ['competing-owner','corrupt','symlink','wide-permissions','foreign-owner']]
  r=compose_uid_case(c,rows,s);self.assertEqual(r['status'],'PASS');self.assertEqual(c['status'],'BLOCKED')
  for change in ['extra_failure','missing_variant','cleanup','case_fail','host_cleanup','host_uncovered','host_auth']:
   cc,rr,ss=copy.deepcopy(c),copy.deepcopy(rows),copy.deepcopy(s)
   if change=='extra_failure':rr[0]['status']='FAIL'
   if change=='missing_variant':ss['subObligations'].pop()
   if change=='cleanup':ss['cleanupErrors']=['remaining container']
   if change=='case_fail':cc['status']='FAIL'
   if change=='host_cleanup':cc['cleanupErrors']=['live owned service']
   if change=='host_uncovered':cc['uncoveredVariants']=['another missing variant']
   issues=[{'member':'same-case/auth.json','status':'FAIL','reason':'auth mismatch'}] if change=='host_auth' else []
   with self.assertRaises(AssertionError):compose_uid_case(cc,rr,ss,issues)
 def test_secondary_cleanup_and_auth_facts_cannot_hide_behind_foreign_block(self):
  prefix='run/cases/SR-C2-008/'
  artifacts={prefix+'1-secondary-cleanup-error.json':{'primaryPresent':True,'name':'AssertionError'},prefix+'2-cleanup-summary.json':{'failures':['process remains']},prefix+'3-provider-offline-auth-validation.json':{'status':'FAIL','actualRequests':1,'matchedRequests':0},'run/cases/OTHER/cleanup-summary.json':{'failures':['unrelated']},prefix+'4-cleanup.json':{'failures':[],'evidence':{'raw':{'cleanupErrors':[]}}}}
  rows=archive_composition_issues('SR-C2-008',artifacts);self.assertEqual(len(rows),3);self.assertEqual([r['status'] for r in rows],['BLOCKED','BLOCKED','FAIL']);self.assertTrue(all(r['member'].startswith(prefix) for r in rows))
  self.assertEqual(archive_composition_issues('SR-C2-008',{prefix+'cleanup-summary.json':{'failures':[]},prefix+'provider-offline-auth-validation.json':{'status':'PASS','actualRequests':1,'matchedRequests':1}}),[])
 def test_runner_failure_has_non_green_independent_gate_without_business_count_changes(self):
  compatibility={'status':'PASS'};supplement={'runId':'uid','verdict':'PASS','cleanupErrors':[],'runnerErrors':[]}
  rows=execution_gate_rows({'current':['owned volume remains']},[supplement],compatibility,[],'BLOCKED');suite=execution_gate_suite(rows)
  parsed=ET.fromstring(ET.tostring(suite));self.assertEqual(parsed.attrib['failures'],'0');self.assertGreater(int(parsed.attrib['errors']),0);self.assertTrue(any(e.attrib['name']=='execution-cleanup/current' and e.find('error') is not None for e in parsed.findall('testcase')))
  green=execution_gate_suite(execution_gate_rows({'current':[]},[supplement],compatibility,[],'PASS'));self.assertEqual(green.attrib['errors'],'0');self.assertEqual(green.attrib['failures'],'0')
 def test_supplement_and_host_auth_failure_remain_gates_even_with_green_case_samples(self):
  supplements=[{'runId':'uid','verdict':'PASS','cleanupErrors':[],'runnerErrors':['owner check unavailable']}]
  issues=[{'status':'FAIL','reason':'auth mismatch','caseId':'SR-C2-008','runId':'host','member':'actual-auth-proof.json'}]
  rows=execution_gate_rows({},supplements,{'status':'PASS'},issues,'FAIL');suite=execution_gate_suite(rows)
  self.assertGreater(int(suite.attrib['failures']),0);self.assertGreater(int(suite.attrib['errors']),0)
 def test_usage_composition_needs_all_five_named_evidenced_rows(self):
  supplement={'subObligationVerdict':'PASS','cleanupErrors':[],'manifest':{'runId':'uid','sutRevision':'same','qaRevision':'frozen'},'subObligations':[{'id':x,'status':'PASS','evidence':['actual']} for x in UID_VARIANTS]}
  case={'id':'SR-BE-USG-006','status':'BLOCKED','reason':'Foreign UID evidence runs in a separately frozen Linux supplement'}
  names=['SR-BE-USG-006-true','SR-BE-USG-006-false','entry-or-private-temp','key-file-import','foreign-uid-proof'];rows=[{'name':name,'status':'BLOCKED' if name=='foreign-uid-proof' else 'PASS','evidence':['actual-owned-artifact']} for name in names]
  self.assertEqual(compose_uid_case(case,rows,supplement)['status'],'PASS');rows[0]['evidence']=[]
  with self.assertRaisesRegex(AssertionError,'without evidence'):compose_uid_case(case,rows,supplement)
if __name__=='__main__':unittest.main()

