import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM,VirtualConsole} from 'jsdom'
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const settle=()=>new Promise(resolve=>setTimeout(resolve,60))
function report(kind='all',page=1){return {success:true,period:{month:'2026-10',kind,from:'2026-10-01',to:'2026-10-31',as_of:'2026-11-04',timezone:'Asia/Manila'},summary:{filed:2,approved:1,returned:0,average_days:5,completed_with_dates:1,missing_processing_dates:0},breakdown:[{kind:'permits',filed:1,approved:1,returned:0,average_days:5,completed_with_dates:1}],weeks:[{from:'2026-10-01',to:'2026-10-07',permits:1,occupancy:1,total:2}],coverage:{archived_records:0,invalid_history_dates:0},pagination:{page,pages:2,total:21,page_size:20},records:[{kind:'permits',id:page,reference:'BP-'+page,project_title:`O'Brien "Annex" \\ <img src=x onerror=bad()>`,owner_name:'Owner',location:'Laoag',filed_on:'2026-10-01',approved_on:'2026-10-06',approval_filed_on:'2026-10-01',processing_days:5,events:[{type:'approved',date:'2026-10-06'}]}]}}
async function mount({role='admin',handler}={}){
 const calls=[],errors=[],downloads=[],releases=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css-parsing')errors.push(e.message)})
 const dom=new JSDOM('<div id="system-react-root" data-page="permits-monthly-reports"></div>',{url:'http://localhost/monthly-reports',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,username:'admin',role,session_id:'fixture',session_remaining_ms:1800000}));
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=url=>releases.push(url);w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,download:this.download})};
 w.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).startsWith('/api/admin/monthly-reports')){if(handler)return handler(String(url),options);return {ok:true,json:async()=>report()}}return {ok:true,json:async()=>({success:true,user:{id:1,role},profile:{display_name:'Admin'}})}};
 w.eval(bundle);await settle();return {dom,w,d:w.document,calls,errors,downloads};
}
test('live report tabs display returned data literally and retain the server-scoped month and processing rules',async()=>{
 const v=await mount();try{assert.match(v.d.getElementById('mr-summary').textContent,/5\.0/);assert.ok(v.d.querySelector('a[href="/monthly-reports"][aria-current="page"]'));v.d.getElementById('mr-tab-details').click();await settle();assert.match(v.d.getElementById('mr-details').textContent,/10\/01\/2026/);assert.equal(v.d.querySelector('#mr-details img'),null);assert.match(v.d.getElementById('mr-details').textContent,/<img/);v.d.getElementById('mr-tab-print').click();await settle();assert.equal(v.d.getElementById('mr-print').hidden,false);assert.match(v.d.getElementById('mr-print').textContent,/Monthly permit accomplishment report/);assert.deepEqual(v.errors,[])}finally{v.dom.window.close()}
})
test('operator and IT sessions receive no report requests or monthly-report navigation',async()=>{
 for(const role of ['operator','superadmin']){const v=await mount({role});try{assert.equal(v.calls.filter(c=>c.url.startsWith('/api/admin/monthly-reports')).length,0);assert.match(v.d.querySelector('main').textContent,/available to engineering admins/);assert.equal(v.d.querySelector('a[href="/monthly-reports"]'),null)}finally{v.dom.window.close()}}
})

test('native month input events change the requested month immediately and reset pagination',async()=>{
 const v=await mount();try{const month=v.d.getElementById('monthlyReportMonth');month.value='2026-11';month.dispatchEvent(new v.w.Event('input',{bubbles:true}));await settle();const calls=v.calls.filter(c=>c.url.startsWith('/api/admin/monthly-reports?'));const params=new URL(calls.at(-1).url,'http://localhost').searchParams;assert.equal(params.get('month'),'2026-11');assert.equal(params.get('page'),'1')}finally{v.dom.window.close()}
})
test('failed and incomplete responses show an error rather than zero or stale report figures',async()=>{
 for(const response of [{ok:false,json:async()=>({success:false,message:'Database unavailable'})},{ok:true,json:async()=>({success:true})}]){const v=await mount({handler:async()=>response});try{assert.ok(v.d.querySelector('[role="alert"]'));assert.equal(v.d.querySelector('.mr-stat-value'),null);assert.equal([...v.d.querySelectorAll('button')].find(b=>b.textContent==='Export Excel').disabled,true)}finally{v.dom.window.close()}}
})
test('exports include month/type but no page restriction and prevent duplicate downloads',async()=>{
 const v=await mount({handler:async(url)=>url.includes('/export')?{ok:true,headers:{get:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},blob:async()=>new Blob(['test'])}:{ok:true,json:async()=>report('all',2)}});try{
  const button=[...v.d.querySelectorAll('button')].find(b=>b.textContent==='Export Excel');button.click();button.click();await settle();const exports=v.calls.filter(c=>c.url.includes('/export'));assert.equal(exports.length,1);const params=new URL(exports[0].url,'http://localhost').searchParams;assert.equal(params.get('month'),'2026-10');assert.equal(params.get('kind'),'all');assert.equal(params.has('page'),false);assert.equal(v.downloads.length,1);assert.equal(v.downloads[0].download,'monthly-permits-2026-10-all.xlsx');assert.match(v.d.querySelector('.mr-export-message').textContent,/downloaded/);
 }finally{v.dom.window.close()}
})
test('a failed export stays on the report and exposes the server error without creating a download',async()=>{
 const v=await mount({handler:async(url)=>url.includes('/export')?{ok:false,json:async()=>({message:'Export unavailable'})}:{ok:true,json:async()=>report()}});try{[...v.d.querySelectorAll('button')].find(b=>b.textContent==='CSV').click();await settle();assert.equal(v.downloads.length,0);assert.match(v.d.querySelector('.mr-export-message').textContent,/Export unavailable/);assert.ok(v.d.querySelector('.mr-stat-value'))}finally{v.dom.window.close()}
})
