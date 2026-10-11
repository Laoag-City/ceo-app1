const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await pause(20)}assert.fail('History did not reach the expected state')}
const response=(data,ok=true)=>({ok,json:async()=>data});
const record=(id,extra={})=>({id,source:'request',kind:'permits',project_id:10,project_title:'Project '+id,status:'approved',message:'Approved request',actor_name:'operator',created_at:'2026-01-02T04:00:00Z',...extra});
async function mount(t,read,role='admin'){
 const dom=new JSDOM('<div id="system-react-root" data-page="permits-superadmin"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 t.after(()=>w.close());
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:5,role}));
 w.fetch=async(url,options={})=>{
  if(url.startsWith('/api/admin/history?')){assert.equal(options.method,undefined);assert.equal(options.credentials,'same-origin');return read(new URL(url,'http://localhost'),options)}
  if(url==='/api/admin/overview')return response({totals:role==='superadmin'?{accounts:4,pendingAccounts:1}:{building:15,occupancy:7,buildingPending:0,occupancyPending:0,buildingDeletions:0,occupancyDeletions:0},recent:[]});
  return response({profile:{id:5,role,username:'Admin'}});
 };
 w.eval(bundle);await until(()=>d.querySelector('.ao-stats'));
 return {w,d,open:async()=>{d.querySelector('.ao-history-launch').click();await until(()=>d.querySelector('.ao-history-dialog').open)}};
}
test('admin can browse past history, inspect original details and append older entries safely',async t=>{
 let calls=0;
 const initial=[record(1,{project_title:'<img src=x onerror=alert(1)>',remarks:'<script>bad()</script>',reviewed_at:'2026-01-03T04:00:00Z',reviewed_by:'boss',details:{changes:[{field:'Electrical · Status',before:'Pending',after:'Approved'}]}}),record(1,{source:'final_review',details:{stations:[{id:50,station:'Electrical',engineer:'Original display name',status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02',remarks:'Historical review'}]}}),...Array.from({length:5},(_,i)=>record(i+2))];
 const {d,open}=await mount(t,async url=>{calls++;return response(url.searchParams.has('before')?{records:[initial[0],record(8,{kind:'occupancy',project_title:'Old occupancy'})],next:null}:{records:initial,next:'older-page'})});
 assert.equal(calls,0);await open();await until(()=>d.querySelectorAll('.ao-history-entry').length===7);
 assert.equal(d.querySelector('.ao-history-feed img'),null);assert.equal(d.querySelector('.ao-history-feed script'),null);
 assert.match(d.querySelector('.ao-history-entry').textContent,/Before: Pending.*After: Approved/);assert.match(d.querySelectorAll('.ao-history-entry')[1].textContent,/Original display name.*2026-01-01.*2026-01-02/);
 d.querySelector('.ao-history-more').click();await until(()=>d.querySelectorAll('.ao-history-entry').length===8);
 assert.match(d.querySelector('.ao-history-feed').textContent,/Old occupancy/);assert.equal(d.querySelector('.ao-history-more'),null);
 d.querySelector('[aria-label="Close history"]').click();await until(()=>!d.querySelector('.ao-history-dialog').open);assert.equal(d.activeElement,d.querySelector('.ao-history-launch'));
});
test('failed older-history loads preserve existing entries and support retry',async t=>{
 let attempts=0;
 const {d,open}=await mount(t,async url=>{
  if(!url.searchParams.has('before'))return response({records:[record(1)],next:'older-page'});
  attempts++;return attempts===1?response({message:'Please retry older records.'},false):response({records:[record(2)],next:null});
 });
 await open();await until(()=>d.querySelector('.ao-history-more')&&!d.querySelector('.ao-history-more').disabled);
 d.querySelector('.ao-history-more').click();await until(()=>d.querySelector('.ao-history-feed [role="alert"]'));
 assert.equal(d.querySelectorAll('.ao-history-entry').length,1);assert.match(d.querySelector('.ao-history-feed [role="alert"]').textContent,/retry/);
 d.querySelector('.ao-history-more').click();await until(()=>d.querySelectorAll('.ao-history-entry').length===2);assert.equal(d.querySelector('.ao-history-feed [role="alert"]'),null);
});
test('history filters reset pagination, cancel stale loads and search both permit types',async t=>{
 let resolveOlder,olderSignal;const calls=[];
 const {w,d,open}=await mount(t,async(url,options)=>{
  calls.push(url);
  if(url.searchParams.has('before')){olderSignal=options.signal;return new Promise(resolve=>resolveOlder=resolve)}
  return response({records:[record(1,{project_title:url.searchParams.get('kind')==='occupancy'?'Filtered occupancy':'All history'})],next:url.searchParams.get('kind')==='all'?'older-page':null});
 });
 await open();await until(()=>d.querySelector('.ao-history-more')&&!d.querySelector('.ao-history-more').disabled);d.querySelector('.ao-history-more').click();await until(()=>resolveOlder);
 const kind=d.querySelector('.ao-history-filters select');kind.value='occupancy';kind.dispatchEvent(new w.Event('change',{bubbles:true}));
 await until(()=>d.querySelector('.ao-history-feed').textContent.includes('Filtered occupancy'));assert.equal(olderSignal.aborted,true);
 resolveOlder(response({records:[record(99,{project_title:'Stale result'})],next:null}));await pause(50);assert.ok(!d.querySelector('.ao-history-feed').textContent.includes('Stale result'));
 const source=d.querySelectorAll('.ao-history-filters select')[1];source.value='final_review';source.dispatchEvent(new w.Event('change',{bubbles:true}));
 const search=d.querySelector('.ao-history-search input');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(search,'Electrical');search.dispatchEvent(new w.Event('input',{bubbles:true}));
 await until(()=>calls.some(url=>url.searchParams.get('source')==='final_review'&&url.searchParams.get('q')==='Electrical'));
 assert.equal(calls.at(-1).searchParams.get('kind'),'occupancy');assert.equal(calls.at(-1).searchParams.has('before'),false);
 d.querySelector('.ao-history-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));await until(()=>!d.querySelector('.ao-history-dialog').open);
});
test('superadmin account workspace contains no engineering history viewer',async t=>{
 let historyCalls=0;const {d}=await mount(t,async()=>{historyCalls++;return response({records:[],next:null})},'superadmin');
 assert.equal(d.querySelector('.ao-history-launch'),null);assert.equal(d.querySelector('.ao-history-dialog'),null);assert.equal(historyCalls,0);
});
