import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM,VirtualConsole} from 'jsdom'
const helper=readFileSync(new URL('../assets/permits/permit-duplicates.js',import.meta.url),'utf8')
const transport=readFileSync(new URL('../assets/permits/request-feedback.js',import.meta.url),'utf8')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const warning=(version='a'.repeat(64))=>({success:false,code:'POSSIBLE_DUPLICATE',message:'Review possible duplicates.',possibleDuplicates:{kind:'permits',version,total:1,matches:[{id:61,reference:'BP-61',project_title:`O'Brien "Annex" <img src=x onerror=alert(1)>`,owner_name:'Cruz',location:'Laoag',reasons:['Same project title']}]}})
function fixture(respond) {
 const dom=new JSDOM('<form id="draft"><input id="title" value="Keep this application"><button id="save">Save</button></form>',{url:'http://localhost:3000/index.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
 const w=dom.window,calls=[];w.Response=Response
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role:'operator'}))
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 w.fetch=async(url,options)=>{calls.push({url,body:options?.body?JSON.parse(options.body):null});const result=await respond(calls.at(-1),calls.length);return new Response(JSON.stringify(result.body??result),{status:result.status??200,headers:{'Content-Type':'application/json'}})}
 w.eval(helper);w.eval(transport)
 return {w,d:w.document,calls,close:()=>w.close(),submit:()=>w.RequestFeedback.fetch('/api/permits',{method:'POST',body:JSON.stringify({project_title:'Keep this application',requestId:w.PermitDuplicates.creationKey('permits')})})}
}
test('duplicate cancellation retains the form, safely renders names, and never resubmits',async()=>{
 const f=fixture(()=>({status:409,body:warning()}))
 try {
  f.d.getElementById('save').focus();const pending=f.submit();await tick()
  const dialog=f.d.getElementById('permitDuplicateDialog')
  assert.ok(dialog);assert.equal(dialog.querySelector('img')===null,true)
  assert.match(dialog.textContent,/<img src=x onerror=alert\(1\)>/)
  assert.equal(dialog.querySelector('a').getAttribute('href'),'/edit?id=61')
  assert.equal(dialog.querySelector('a').target,'_blank')
  assert.equal(dialog.querySelector('.permit-duplicate-continue').disabled,true)
  dialog.querySelector('.permit-duplicate-continue').click();assert.equal(f.calls.length,1)
  dialog.querySelector('.permit-duplicate-actions button').click()
  assert.equal((await (await pending).json()).cancelled,true)
  assert.equal(f.calls.length,1);assert.equal(f.d.getElementById('title').value,'Keep this application')
  assert.equal(f.d.activeElement.id,'save');assert.equal(f.d.getElementById('requestFeedback'),null)
 }finally{f.close()}
})
test('explicit acknowledgement sends the same request key and a fresh warning must be reviewed again',async()=>{
 const f=fixture((call,count)=>count<=2?{status:409,body:warning((count===1?'a':'b').repeat(64))}:{success:true,id:72})
 try {
  const pending=f.submit()
  for(let count=1;count<=2;count++) {
   await tick();const dialog=f.d.getElementById('permitDuplicateDialog');assert.ok(dialog)
   assert.equal(dialog.querySelector('input').checked,false)
   dialog.querySelector('input').checked=true;dialog.querySelector('input').dispatchEvent(new f.w.Event('change'))
   dialog.querySelector('.permit-duplicate-continue').click()
  }
  assert.equal((await (await pending).json()).id,72)
  assert.equal(f.calls.length,3)
  assert.equal(new Set(f.calls.map(call=>call.body.requestId)).size,1)
  assert.equal(f.calls[1].body.duplicateVersion,'a'.repeat(64));assert.equal(f.calls[2].body.duplicateVersion,'b'.repeat(64))
  assert.equal(f.calls[2].body.allowDuplicates,true);assert.equal(f.calls[2].body.project_title,'Keep this application')
 }finally{f.close()}
})
test('an uncertain creation can safely retry its original key; keys persist until success and stay isolated by account and registry',async()=>{
 const f=fixture((call,count)=>{if(count===1)throw Error('Network lost');return {success:true,replayed:true,id:71}})
 try {
  const first=f.w.PermitDuplicates.creationKey('permits')
  assert.notEqual(f.w.PermitDuplicates.creationKey('occupancy'),first)
  await assert.rejects(f.submit(),/unconfirmed/)
  assert.equal(f.w.PermitDuplicates.creationKey('permits'),first)
  assert.equal((await (await f.submit()).json()).id,71)
  assert.equal(f.calls[1].body.requestId,first)
  f.w.PermitDuplicates.complete('permits');assert.notEqual(f.w.PermitDuplicates.creationKey('permits'),first)
  f.w.sessionStorage.setItem('oboUser',JSON.stringify({id:2,role:'operator'}));assert.notEqual(f.w.PermitDuplicates.creationKey('permits'),first)
 }finally{f.close()}
})
test('Escape cancels duplicate review and simultaneous reviews remain separate dialogs',async()=>{
 const f=fixture(()=>({success:true}))
 try {
  const first=f.w.PermitDuplicates.confirm(warning().possibleDuplicates),second=f.w.PermitDuplicates.confirm({...warning().possibleDuplicates,kind:'occupancy'})
  await tick();assert.equal(f.d.querySelectorAll('dialog').length,1)
  f.d.querySelector('dialog').dispatchEvent(new f.w.Event('cancel',{cancelable:true}));assert.equal(await first,false)
  await tick();assert.equal(f.d.querySelectorAll('dialog').length,1)
  assert.equal(f.d.querySelector('dialog a').getAttribute('href'),'/occupancy/edit?id=61')
  f.d.querySelector('dialog').dispatchEvent(new f.w.Event('cancel',{cancelable:true}));assert.equal(await second,false)
 }finally{f.close()}
})
