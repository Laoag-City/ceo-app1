import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM,VirtualConsole} from 'jsdom'
import {helpForPage} from '../shared/help-topics.js'

const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const wait=()=>new Promise(resolve=>setTimeout(resolve,25))
async function until(check){for(let i=0;i<80;i++){if(check())return;await wait()}assert.fail('Help did not reach the expected state')}
async function fixture(page,{role='operator',workspace='PC1',url='/'}={}){
 const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url:'http://localhost'+url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()})
 const w=dom.window,d=w.document
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}}
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus()}
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))}
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:2,role}));w.sessionStorage.setItem('currentWorkspace',workspace)
 w.fetch=async()=>({ok:false,json:async()=>({success:false,message:'Offline fixture'})})
 w.eval(bundle);await until(()=>d.querySelector('.context-help-guide'))
 return {dom,w,d}
}

test('station help preserves the draft, table headers, and focus without running an action',async()=>{
 const {dom,w,d}=await fixture('permits-edit')
 try{
  const body=d.querySelector('#matrixTableBody'),table=body.closest('table'),header=[...table.querySelectorAll('th')].find(th=>/Assigned Engineer/.test(th.textContent))
  const control=d.createElement('input');control.value='Unsaved station remarks';body.append(control)
  await until(()=>header.querySelector('[data-context-help="permit-engineer"]'))
  assert.equal(header.textContent.trim(),'Assigned Engineer','Help must not change exported table headings')
  let clicks=0;table.addEventListener('click',()=>clicks++)
  const trigger=header.querySelector('button');trigger.focus();trigger.click()
  await until(()=>d.querySelector('.context-help-dialog').open)
  assert.match(d.querySelector('.context-help-dialog h2').textContent,/read only/)
  assert.equal(clicks,0);assert.equal(control.value,'Unsaved station remarks')
  d.querySelector('.context-help-close').click();await wait()
  assert.equal(d.querySelector('.context-help-dialog').open,false);assert.equal(d.activeElement,trigger)
 }finally{dom.window.close()}
})

test('help follows dynamic station status redraws without duplicate buttons',async()=>{
 const {dom,d}=await fixture('permits-occupancy_edit')
 try{
  const status=d.createElement('section');status.id='projectFinalApproval';d.querySelector('#matrixTableBody').closest('.card').before(status)
  for(let i=0;i<3;i++){
   status.innerHTML='<strong>Ready for final review</strong><p>Station details changed.</p>'
   await until(()=>status.querySelector('[data-context-help="permit-progress"]'));await wait()
   assert.equal(status.querySelectorAll('button').length,1)
  }
  status.querySelector('button').click();await until(()=>d.querySelector('.context-help-dialog').open)
  assert.match(d.querySelector('.context-help-summary').textContent,/admin makes the final project decision/)
 }finally{dom.window.close()}
})

test('queue help does not call, hold, drop, or submit a ticket and related topics stay keyboard accessible',async()=>{
 const {dom,d}=await fixture('queue-kiosk')
 try{
  let actions=0,submits=0;d.querySelector('#clerkSection').addEventListener('click',()=>actions++);d.querySelector('#queueForm').addEventListener('submit',()=>submits++)
  const trigger=d.querySelector('.desk-action-hint [data-context-help="queue-actions"]');trigger.click()
  await until(()=>d.querySelector('.context-help-dialog').open)
  assert.match(d.querySelector('.context-help-steps').textContent,/moves the current client to Finished and calls the next waiting client/)
  const held=[...d.querySelectorAll('.context-help-related button')].find(button=>/Bring back/.test(button.textContent));held.click();await wait()
  assert.match(d.querySelector('.context-help-dialog h2').textContent,/held ticket/);assert.equal(d.activeElement,d.querySelector('.context-help-dialog h2'))
  assert.equal(actions,0);assert.equal(submits,0)
  d.querySelector('.context-help-dialog').dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));await wait();assert.equal(d.querySelector('.context-help-dialog').open,false)
 }finally{dom.window.close()}
})

test('superadmin help is limited to accounts and station assignments',async()=>{
 const {dom,d}=await fixture('permits-superadmin',{role:'superadmin'})
 try{
  d.querySelector('.context-help-guide').click();await until(()=>d.querySelector('.context-help-dialog').open)
  assert.equal(d.querySelector('.context-help-dialog h2').textContent,'Manage user accounts')
  assert.deepEqual([...d.querySelectorAll('.context-help-related button')].map(button=>button.textContent.replace('›','').trim()),['Assign stations to operators'])
  assert.equal(d.querySelector('[data-context-help="permit-final-review"]'),null)
 }finally{dom.window.close()}
})

test('the public monitor and login screens do not receive operational help controls',async()=>{
 assert.deepEqual(helpForPage('queue-kiosk','operator','Kiosk').topics,['queue-registration','queue-start'])
 assert.ok(!helpForPage('queue-kiosk','operator','PC1').topics.includes('queue-reset'))
 assert.ok(helpForPage('queue-kiosk','admin','PC1',true).topics.includes('queue-reset'))
 for(const page of ['queue-monitor','permits-login','queue-log-in']){
  const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url:'http://localhost/log-in.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
  try{dom.window.eval(bundle);await wait();assert.equal(dom.window.document.querySelector('.context-help-dialog'),null)}finally{dom.window.close()}
 }
})
