import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM, VirtualConsole} from 'jsdom'
const shell=readFileSync(new URL('../features/queue/client-history.html',import.meta.url),'utf8')
const controller=shell.match(/<script data-client-history>([\s\S]*?)<\/script>/)[1]
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const names=['Receiving Bldg. Permit','Receiving Bldg. Occupancy','Releasing Bldg. Permit','Releasing Bldg. Occupancy','Inquire']
const response=(count=2)=>({success:true,total:count*5,services:names.map(service=>({service,count}))})
function fixture(fetch=()=>response()){
 const dom=new JSDOM('<div id="system-react-root" data-page="queue-client-history"></div>',{url:'http://localhost:5000/client-history.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
 const w=dom.window,calls=[],get=id=>w.document.getElementById(id)
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 w.eval(bundle)
 w.RequestFeedback={fetch:async url=>{calls.push(new URL(url,w.location.href));return {ok:true,json:async()=>await fetch(calls.at(-1),calls.length)}}}
 w.eval(controller)
 return {dom,w,get,calls,submit(from,to){get('historyFrom').value=from;get('historyTo').value=to;get('historySearchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}}
}
test('service summary shows five service counts and a total without personal details',async()=>{
 const f=fixture();try{
 await tick();assert.equal(f.get('historyTableBody').children.length,5)
 for(const name of names)assert.ok(f.get('historyTableBody').textContent.includes(name))
 assert.equal(f.get('historyCount').textContent,'10')
 assert.equal(f.get('historyResults').getAttribute('aria-busy'),'false')
 assert.equal(f.get('historySearch'),null)
 assert.equal(f.calls[0].searchParams.get('from'),f.calls[0].searchParams.get('to'))
 }finally{f.dom.window.close()}
})
test('date selection and refresh request the selected range',async()=>{
 const f=fixture();try{
 await tick();f.submit('2026-11-01','2026-11-19');await tick()
 assert.equal(f.calls.at(-1).searchParams.get('from'),'2026-11-01')
 assert.equal(f.calls.at(-1).searchParams.get('to'),'2026-11-19')
 f.get('historyRefresh').click();await tick()
 assert.equal(f.calls.at(-1).searchParams.get('from'),'2026-11-01')
 }finally{f.dom.window.close()}
})
test('invalid dates do not issue a request and errors can be retried',async()=>{
 let fail=true;const f=fixture(()=>{if(fail)throw Error('Your session ended. Please sign in again.');return response(0)})
 try{await tick();assert.match(f.get('historyFeedback').textContent,/sign in again/)
 assert.equal(f.get('historyRefresh').disabled,false)
 fail=false;f.submit('2026-11-19','2026-11-01');await tick()
 assert.equal(f.calls.length,1);assert.match(f.get('historyFeedback').textContent,/valid date/)
 f.submit('2026-11-01','2026-11-19');await tick()
 assert.equal(f.get('historyFeedback').hidden,true);assert.equal(f.get('historyCount').textContent,'0')
 assert.equal(f.get('historyTableBody').children.length,5)
 }finally{f.dom.window.close()}
})
test('a stale response cannot overwrite newer counts',async()=>{
 let resolveOld;const f=fixture((url,n)=>n===2?new Promise(r=>{resolveOld=r}):response(n))
 try{await tick();f.submit('2026-11-01','2026-11-02');await tick()
 f.submit('2026-11-03','2026-11-04');await tick()
 assert.equal(f.get('historyCount').textContent,'15')
 resolveOld(response(99));await tick();assert.equal(f.get('historyCount').textContent,'15')
 }finally{f.dom.window.close()}
})
test('service labels are rendered as text',async()=>{
 const malicious='<img src=x onerror="alert(1)">',f=fixture(()=>({success:true,total:1,services:[{service:malicious,count:1}]}))
 try{await tick();assert.equal(f.get('historyTableBody').querySelector('img'),null);assert.ok(f.get('historyTableBody').textContent.includes(malicious))}
 finally{f.dom.window.close()}
})
test('workstation summary link does not claim a service window',()=>{
 const dom=new JSDOM('<div id="system-react-root" data-page="queue-log-in"></div>',{url:'http://localhost:5000/workstations.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
 try{dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.eval(bundle)
 const link=dom.window.document.querySelector('a.client-history-link')
 assert.equal(link.getAttribute('href'),'client-history.html');assert.match(link.textContent,/Service Summary/)
 assert.equal(link.hasAttribute('data-value'),false);assert.equal(dom.window.document.querySelectorAll('.station-card[data-value]').length,5)
 }finally{dom.window.close()}
})
