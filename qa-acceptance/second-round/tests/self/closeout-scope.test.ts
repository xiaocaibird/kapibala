import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCloseoutSelection, OFFLINE_CLOSEOUT_IDS } from '../../harness/closeout-scope.js';
const revision='0be8575f326f709fe674e20033843d950385043d';
const scope={active:true,sutRevision:revision,offlineCaseIds:[...OFFLINE_CLOSEOUT_IDS]};
const args=['--closeout','--headed','--cases',OFFLINE_CLOSEOUT_IDS.join(',')];
test('exact approved offline selection and product are accepted',()=>assert.doesNotThrow(()=>assertCloseoutSelection(args,revision,scope)));
test('full suite, live case, duplicate and extra engine are rejected before resources',()=>{
  for(const invalid of [[],['--headed','--cases',OFFLINE_CLOSEOUT_IDS.join(',')],['--closeout','--cases',OFFLINE_CLOSEOUT_IDS.join(',')],['--closeout','--headed','--cases',OFFLINE_CLOSEOUT_IDS.join(',')+',SR-C2-017'],[...args,'--browser','firefox'],['--closeout','--headed','--cases','SR-C1-005,SR-C1-005,SR-UI-025']])assert.throws(()=>assertCloseoutSelection(invalid,revision,scope));
  assert.throws(()=>assertCloseoutSelection(args,'1'.repeat(40),scope));
});
