import assert from 'node:assert/strict';
import test from 'node:test';
import {deferInstallation,getOrCreateStore} from '../web/priority.mjs';
const readyError=missing=>Object.assign(Error('not ready'),{retryable:true,missing});

test('deferred installation returns before work starts and retries transient readiness',async()=>{
 let setupReturned=false,calls=0,done;
 const finished=new Promise(resolve=>done=resolve);
 const bootstrap=deferInstallation({delayMs:1,maxAttempts:3,
  async install(){assert.equal(setupReturned,true);if(++calls===1)throw readyError(['mounted Vue app']);return {active:true}},
  onSuccess:done
 });
 assert.equal(calls,0);setupReturned=true;assert.equal((await finished).active,true);
 assert.equal(bootstrap.status().phase,'installed');assert.equal(calls,2);
});
test('missing prerequisites are preserved in diagnostics after bounded retries',async()=>{
 let finish;
 const done=new Promise(resolve=>finish=resolve);
 const bootstrap=deferInstallation({delayMs:1,maxAttempts:2,
  async install(){throw readyError(['nodeFrequency store'])},onSuccess(){assert.fail('unexpected installation')},
  onStatus(status){if(status.phase==='failed')finish()}
 });
 await done;assert.equal(bootstrap.status().attempts,2);assert.deepEqual(bootstrap.status().missing,['nodeFrequency store']);
});
test('nonretryable failure does not keep patching repeatedly',async()=>{
 let finish,calls=0;
 const done=new Promise(resolve=>finish=resolve);
 const bootstrap=deferInstallation({delayMs:1,async install(){calls++;throw Error('unsupported property')},onSuccess(){assert.fail()},onStatus(s){if(s.phase==='failed')finish()}});
 await done;assert.equal(calls,1);assert.equal(bootstrap.status().lastError,'unsupported property');
});
test('cancel before the scheduled attempt installs no hooks',async()=>{
 let calls=0;
 const bootstrap=deferInstallation({install:()=>{calls++},onSuccess(){assert.fail()}});bootstrap.cancel();
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,0);assert.equal(bootstrap.status().phase,'cancelled');
});
test('cancellation during an async install restores any completed installation',async()=>{
 let release,started,restored=0;
 const starting=new Promise(resolve=>started=resolve);
 const bootstrap=deferInstallation({async install(){started();await new Promise(resolve=>release=resolve);return {restore(){restored++}}},onSuccess(){assert.fail()}});
 await starting;bootstrap.cancel();release();await new Promise(resolve=>setTimeout(resolve,1));assert.equal(restored,1);
});
test('lazy store resolution uses the existing application Pinia and preserves existing stores',()=>{
 const pinia={_s:new Map()},store={data:'keep'};let calls=0;
 const accessor=Object.assign(p=>{assert.equal(p,pinia);calls++;p._s.set('nodeFrequency',store);return store},{$id:'nodeFrequency'});
 assert.equal(getOrCreateStore(pinia,{minified:accessor},'nodeFrequency'),store);
 assert.equal(getOrCreateStore(pinia,{minified:accessor},'nodeFrequency'),store);assert.equal(calls,1);
 assert.equal(getOrCreateStore(pinia,{},'absent'),undefined);assert.equal(getOrCreateStore(undefined,{},'anything'),undefined);
});
