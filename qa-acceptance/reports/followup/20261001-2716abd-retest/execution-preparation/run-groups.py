from pathlib import Path
import subprocess,json,sys
root=Path.cwd();folder=root/'.runtime/boundaries-retest-2716-20261001'
groups=[('qa-2716-ui-compat','target.ui.json'),('qa-2716-combined-smoke','target.combined.json'),('qa-2716-send-regression','target.combined.json'),('qa-2716-controller-regression','target.combined.json'),('qa-2716-budget-retest','target.combined.json')]
records=[]
for suite,target in groups:
 target=str((folder/target).relative_to(root))
 bound=subprocess.run(['node','--import','tsx',str(folder/'bind-authority.ts'),target,suite],text=True,capture_output=True)
 if bound.returncode:
  print(bound.stderr,flush=True);raise SystemExit(bound.returncode)
 auth=bound.stdout.strip().splitlines()[-1]
 print('START '+suite,flush=True)
 code=subprocess.run(['python3',str(folder/'run-suite.py'),suite,target,auth]).returncode
 records.append({'suite':suite,'target':target,'authorization':auth,'exitCode':code})
 (root/'reports/followup/20261001-2716abd-retest/group-execution.json').write_text(json.dumps(records,indent=2)+'\n')
 print('COMPLETE '+suite+' exit='+str(code),flush=True)
