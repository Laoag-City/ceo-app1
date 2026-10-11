import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM,VirtualConsole} from 'jsdom'

const shell=readFileSync(new URL('../features/queue/reports.html',import.meta.url),'utf8')
const controller=shell.match(/<script data-queue-reports>([\s\S]*?)<\/script>/)[1]
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const payload=(filters={from:'2026-10-02',to:'2026-10-08',window:'',service:''})=>({success:true,filters,
 summary:{registered:6,completed:2,dropped:1,waiting:1,holding:1,serving:1,averageWaitSeconds:85,averageServiceSeconds:null},
 daily:[{date:'2026-10-02',registered:6,completed:2,dropped:1}],
 windows:[{window:'PC1',registered:6,completed:2,dropped:1,waiting:1,holding:1,serving:1,averageWaitSeconds:85,averageServiceSeconds:null}],
 timingCoverage:{total:6,measured:2,waitMeasured:2,serviceMeasured:0}})
function fixture(handler) {
 const dom=new JSDOM('<body class="queue-admin-page queue-reports-page"><div id="system-react-root" data-page="queue-reports"></div></body>',{url:'http://localhost:5000/reports.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
 const w=dom.window,calls=[];w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 w.eval(bundle)
 w.RequestFeedback={fetch:async url=>{const parsed=new URL(url,w.location.href);calls.push(parsed);return {ok:true,json:async()=>handler?handler(parsed,calls.length):payload()}}}
 w.eval(controller)
 return {dom,w,calls,get:id=>w.document.getElementById(id),submit(){w.document.getElementById('reportFilters').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}}
}
test('reports show real counts and unavailable old service timing without presenting it as zero',async()=>{
 const f=fixture()
 try{await tick();assert.equal(f.get('report-registered').textContent,'6');assert.equal(f.get('report-completed').textContent,'2');assert.equal(f.get('reportWait').textContent,'1 min 25 sec');assert.equal(f.get('reportDuration').textContent,'Unavailable');assert.match(f.get('reportCoverage').textContent,/2 measured visits/);assert.match(f.get('reportWindowRows').textContent,/Window 1/);assert.equal(f.get('reportExport').disabled,false);assert.equal(f.get('reportResults').getAttribute('aria-busy'),'false')}finally{f.w.close()}
})
test('changing window limits service choices and submitted filters reach the report API',async()=>{
 const f=fixture(url=>payload(Object.fromEntries(url.searchParams)))
 try{await tick();f.get('reportService').value='Releasing Bldg. Occupancy';f.get('reportWindow').value='PC1';f.get('reportWindow').dispatchEvent(new f.w.Event('change'));assert.equal(f.get('reportService').value,'');assert.ok([...f.get('reportService').options].find(o=>o.value==='Releasing Bldg. Occupancy').disabled);f.get('reportFrom').value='2026-10-01';f.get('reportTo').value='2026-10-04';f.submit();await tick();assert.equal(f.calls.at(-1).searchParams.get('window'),'PC1');assert.equal(f.calls.at(-1).searchParams.get('from'),'2026-10-01');assert.match(f.get('reportPeriod').textContent,/Window 1/)}finally{f.w.close()}
})
test('invalid dates do not request a report and API failure disables CSV and print',async()=>{
 let fail=false
 const f=fixture(()=>fail?{success:false,message:'Report unavailable.'}:payload())
 try{await tick();const count=f.calls.length;f.get('reportFrom').value='2026-10-09';f.get('reportTo').value='2026-10-08';f.submit();await tick();assert.equal(f.calls.length,count);assert.match(f.get('reportFeedback').textContent,/end date/);f.get('reportFrom').value='2026-10-01';fail=true;f.submit();await tick();assert.equal(f.get('reportResults').hidden,true);assert.equal(f.get('reportExport').disabled,true);assert.equal(f.get('reportPrint').disabled,true);assert.equal(f.get('reportFeedback').textContent,'Report unavailable.')}finally{f.w.close()}
})
test('empty periods stay readable and response labels cannot create markup',async()=>{
 const f=fixture(()=>({...payload(),summary:{registered:0},daily:[],windows:[{label:'<img src=x onerror=alert(1)>',registered:0}],timingCoverage:{}}))
 try{await tick();assert.match(f.get('reportChart').textContent,/No registered visits/);assert.equal(f.get('reportWindowRows').querySelector('img'),null);assert.match(f.get('reportWindowRows').textContent,/<img src=x/);assert.match(f.get('reportDailyRows').textContent,/No visits/)}finally{f.w.close()}
})
test('CSV uses the displayed report filters rather than unsaved changes and includes timing sample counts',async()=>{
 const f=fixture();const blobs=[]
 try{await tick();f.w.Blob=class{constructor(parts){blobs.push(parts.join(''))}};f.w.URL.createObjectURL=()=> 'blob:report';f.w.URL.revokeObjectURL=()=>{};f.w.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'queue-report-2026-10-02-to-2026-10-08.csv')};f.get('reportFrom').value='2025-01-01';f.get('reportExport').click();assert.equal(blobs.length,1);assert.match(blobs[0],/"Registered from","2026-10-02"/);assert.match(blobs[0],/"Average service \(seconds\)","Unavailable"/);assert.match(blobs[0],/"Measured wait visits",2|"Measured wait visits","2"/);assert.ok(!blobs[0].includes('2025-01-01'))}finally{f.w.close()}
})
