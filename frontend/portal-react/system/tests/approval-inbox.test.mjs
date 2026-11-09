import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM,VirtualConsole} from 'jsdom'
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const preview=readFileSync(new URL('../assets/permits/approval-preview.js',import.meta.url),'utf8')
const transport=readFileSync(new URL('../assets/permits/request-feedback.js',import.meta.url),'utf8')
const wait=()=>new Promise(resolve=>setTimeout(resolve,20))
async function until(check){for(let i=0;i<250;i++){if(check())return;await wait()}assert.fail('Inbox did not reach the expected state')}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
function fixtures(){
 const building=[{id:1,permit_id:10,status:'pending',change_type:'permit_update',changes:{_baseSnapshot:'version',_before:{owner_name:'Old owner'},owner_name:'New <img src=x onerror=bad()> owner'},project_title:`O'Brien "Annex" \\ <img src=x>`,requested_by_name:'Displayed <script>name</script>',created_at:'2026-11-03T16:30:00Z'},
 {id:2,permit_id:10,status:'pending',change_type:'inspection_delete',changes:{inspection_id:7,inspection:{inspection_type:'Final',inspector_name:'Inspector',inspection_date:'2026-11-03',result:'Passed',findings:'<img src=x>'},_inspectionSnapshot:'version'},project_title:'Inspection parent',requested_by_name:'Inspector Display Name',created_at:'2026-11-03 11:00:00'}]
 const occupancy=[{id:1,occupancy_id:20,status:'pending',change_type:'delete',changes:{recordId:20},project_title:'Occupancy deletion',requested_by_name:'Occupancy Display Name',created_at:'2026-11-01 08:00:00'},
 {id:1,kind:'occupancy',bulk:true,status:'pending',change_type:'bulk_delete',record_count:2,changes:{projects:[{id:20,project_title:'One'},{id:21,project_title:'Two'}]},project_title:'All occupancy records',requested_by_name:'Bulk Display Name',created_at:'2026-11-02 09:00:00'}]
 const final={id:11,kind:'permits',project_title:'Final review project',owner_name:'Owner',location:'Laoag',permit_date:'2026-10-30',_version:'final-version',matrix:[{id:50,discipline_name:'Electrical',signature_status:'Approved',engineer_name:'Display Engineer'}],sub_permits:[],final_approval:{status:'ready',ready:true,label:'Ready for final review',history:[]}}
 return {building,occupancy,final,other:{id:21,kind:'occupancy',final_approval:{status:'in_review',ready:false}}}
}
async function mount({role='admin',hooks={},data=fixtures(),safeTransport=false}={}){
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',error=>{if(error.type!=='css-parsing')errors.push(error.message)})
 const dom=new JSDOM('<body class="approval-inbox-page"><div id="system-react-root" data-page="permits-approval-inbox"></div></body>',{url:'http://localhost/approval-inbox',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:3,role,session_id:'fixture',session_remaining_ms:1800000}));w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.Response=Response;w.AbortController=AbortController;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false}
 w.fetch=async(url,options={})=>{
  url=String(url);calls.push({url,options});const override=await hooks.request?.(url,options,data);if(override)return override
  if(options.method==='PUT'){
   if(url.endsWith('/final-review')){const body=JSON.parse(options.body);data.final.final_approval={status:body.decision==='approved'?'approved':'returned',ready:false,label:'Reviewed',history:[]};return reply({success:true,message:'Final decision saved'})}
   const bulk=url.startsWith('/api/permit-deletions/'),kind=url.includes('/occupancy/')?'occupancy':'building',id=Number(url.split('/').at(-2));data[kind]=data[kind].filter(item=>!(item.id===id&&!!item.bulk===bulk));return reply({success:true,message:url.endsWith('/reject')?'Request declined. Records retained.':'Request approved and saved.'})
  }
  if(url==='/api/permits/change-requests/pending')return reply({success:true,requests:data.building})
  if(url==='/api/occupancy/change-requests/pending')return reply({success:true,requests:data.occupancy})
  if(url==='/api/final-reviews')return reply({success:true,projects:[data.final,data.other]})
  if(url==='/api/permits/11')return reply(data.final)
  return reply({success:true,profile:{display_name:'Admin'},user:{id:3,role}})
 }
 w.eval(preview);if(safeTransport)w.eval(transport);w.eval(bundle)
 await until(()=>role!=='admin'?d.querySelector('main [role=alert]'):d.querySelector('.ai-stat')||d.querySelector('.ai-page>.ai-error'))
 return {dom,w,d,data,calls,errors}
}
const writes=v=>v.calls.filter(call=>call.options.method==='PUT')
const button=(v,text,scope=v.d)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===text)
async function open(v,title){v.d.querySelector(`button[aria-label='Review ${title}']`).click();await until(()=>v.d.querySelector('.ai-dialog').open&&v.d.querySelector('.ai-dialog-body'))}
async function click(v,text,scope){const node=button(v,text,scope);assert.ok(node,text);node.click();await wait()}

test('inbox merges colliding registry/bulk IDs, shows display names safely and orders office submission dates',async()=>{
 const v=await mount();try{assert.equal(v.d.querySelectorAll('.ai-request').length,5);assert.equal(v.d.querySelector('.ai-request h2').textContent,'Occupancy deletion');assert.match(v.d.querySelector('.ai-list').textContent,/Displayed <script>name<\/script>/);assert.match(v.d.querySelector('.ai-list').textContent,/11\/04\/2026, 12:30 AM/);assert.equal(v.d.querySelector('.ai-list img'),null);assert.ok(v.d.querySelector('a[href="/approval-inbox"][aria-current=page]'));assert.equal(v.d.querySelectorAll('.permit-sidebar [aria-current=page]').length,1);assert.deepEqual(v.errors,[])}finally{v.dom.window.close()}
})
test('request and registry filters show the correct subset and empty state',async()=>{
 const v=await mount();try{v.d.getElementById('ai-tab-deletion').click();await until(()=>v.d.querySelectorAll('.ai-request').length===3);const select=v.d.getElementById('approvalInboxKind');select.value='occupancy';select.dispatchEvent(new v.w.Event('change',{bubbles:true}));await until(()=>v.d.querySelectorAll('.ai-request').length===2);v.d.getElementById('ai-tab-final').click();await until(()=>v.d.querySelector('.ai-empty'));assert.match(v.d.querySelector('.ai-empty').textContent,/match these filters/)}finally{v.dom.window.close()}
})
test('page shell includes padding in sidebar/header widths so desktop chrome does not overflow',async()=>{
 const v=await mount();try{for(const element of [v.d.querySelector('.permit-sidebar'),v.d.querySelector('.ai-site-header')])assert.equal(v.w.getComputedStyle(element).boxSizing,'border-box')}finally{v.dom.window.close()}
})
test('inspection snapshots display the Manila date instead of truncating the previous UTC day',async()=>{
 const data=fixtures();data.building[1].changes.inspection.inspection_date='2026-11-03T16:00:00.000Z';const v=await mount({data});try{await open(v,'Inspection parent');assert.match(v.d.querySelector('.ai-changes').textContent,/2026-11-04/);assert.ok(!v.d.querySelector('.ai-changes').textContent.includes('2026-11-03'))}finally{v.dom.window.close()}
})
test('operators and IT receive neither inbox data requests nor navigation',async()=>{
 for(const role of ['operator','superadmin']){const v=await mount({role});try{assert.equal(v.calls.filter(call=>/pending|final-reviews/.test(call.url)).length,0);assert.equal(v.d.querySelector('a[href="/approval-inbox"]'),null);assert.match(v.d.querySelector('main').textContent,/available to engineering admins/)}finally{v.dom.window.close()}}
})
test('declining requires confirmation, cancellation sends nothing and repeated clicks write once',async()=>{
 let release;const v=await mount({hooks:{request:(url,options)=>options.method==='PUT'?new Promise(resolve=>release=()=>resolve(reply({success:true,message:'Request declined. Records retained.'}))):null}})
 try{await open(v,'Occupancy deletion');await click(v,'Decline request');await click(v,'Cancel',v.d.querySelector('.ai-confirm'));assert.equal(writes(v).length,0);await click(v,'Decline request');const confirm=button(v,'Confirm decline');confirm.click();confirm.click();await until(()=>release);assert.equal(writes(v).length,1);assert.equal(v.d.querySelector('[aria-label="Close request review"]').disabled,true);release();await until(()=>v.d.querySelector('.ai-success'));assert.match(v.d.querySelector('.ai-success').textContent,/Records retained/);assert.match(writes(v)[0].url,/\/occupancy\/change-requests\/1\/reject$/);assert.equal(button(v,'Approve deletion'),undefined)}finally{v.dom.window.close()}
})
test('edits show the existing escaped before/proposed comparison and use the established approval endpoint',async()=>{
 const v=await mount();try{v.d.getElementById('ai-tab-edit').click();await until(()=>v.d.querySelectorAll('.ai-request').length===1);v.d.querySelector('.ai-request button').click();await until(()=>v.d.querySelector('.ai-dialog-body'));assert.match(v.d.querySelector('.ai-changes').textContent,/Old owner/);assert.match(v.d.querySelector('.ai-changes').textContent,/New <img/);assert.equal(v.d.querySelector('.ai-changes img'),null);await click(v,'Approve edit');assert.equal(writes(v).length,0);await click(v,'Confirm approval');await until(()=>v.d.querySelector('.ai-success'));assert.equal(writes(v)[0].url,'/api/permits/change-requests/1/approve')}finally{v.dom.window.close()}
})
test('bulk approval shows scope, requires exact DELETE ALL and never uses the colliding single-delete endpoint',async()=>{
 const v=await mount();try{await open(v,'All occupancy records');assert.match(v.d.querySelector('.ai-changes').textContent,/2 occupancy permit records/);await click(v,'Approve deletion');const input=v.d.querySelector('.ai-confirm input'),set=Object.getOwnPropertyDescriptor(v.w.HTMLInputElement.prototype,'value').set;assert.equal(button(v,'Approve and delete permanently').disabled,true);set.call(input,'delete all');input.dispatchEvent(new v.w.Event('input',{bubbles:true}));await wait();assert.equal(button(v,'Approve and delete permanently').disabled,true);set.call(input,'DELETE ALL');input.dispatchEvent(new v.w.Event('input',{bubbles:true}));await until(()=>!button(v,'Approve and delete permanently').disabled);await click(v,'Approve and delete permanently');await until(()=>v.d.querySelector('.ai-success'));assert.equal(writes(v)[0].url,'/api/permit-deletions/occupancy/1/approve');assert.equal(JSON.parse(writes(v)[0].options.body).confirmation,'DELETE ALL');await until(()=>v.d.querySelectorAll('.ai-request').length===4)}finally{v.dom.window.close()}
})
test('inspection deletion identifies the inspection-only scope and retains the existing review route',async()=>{
 const v=await mount();try{await open(v,'Inspection parent');assert.match(v.d.querySelector('.ai-changes').textContent,/parent permit will remain/);assert.equal(v.d.querySelector('.ai-changes img'),null);await click(v,'Approve deletion');assert.match(v.d.querySelector('.ai-confirm').textContent,/only the listed inspection/);await click(v,'Approve and delete permanently');await until(()=>v.d.querySelector('.ai-success'));assert.equal(writes(v)[0].url,'/api/permits/change-requests/2/approve')}finally{v.dom.window.close()}
})
test('a request processed elsewhere is rechecked before the dialog can open',async()=>{
 const v=await mount();try{v.data.occupancy=v.data.occupancy.filter(item=>item.bulk);v.d.querySelector('[aria-label="Review Occupancy deletion"]').click();await until(()=>v.d.querySelector('.ai-page>.ai-error'));assert.match(v.d.querySelector('.ai-page>.ai-error').textContent,/no longer pending/);assert.equal(v.d.querySelector('.ai-dialog').open,false);assert.equal(writes(v).length,0)}finally{v.dom.window.close()}
})
test('conflicts block another decision and refresh the inbox instead of silently retrying',async()=>{
 const v=await mount({hooks:{request:(url,options,data)=>{if(options.method==='PUT'){data.occupancy=data.occupancy.filter(item=>item.bulk);return reply({success:false,conflict:true,message:'Request already reviewed'},409)}}}});try{await open(v,'Occupancy deletion');await click(v,'Approve deletion');await click(v,'Approve and delete permanently');await until(()=>v.d.querySelector('.ai-notice [role=alert]'));assert.equal(writes(v).length,1);assert.equal(button(v,'Approve deletion').disabled,true);assert.ok(button(v,'Refresh request details'));assert.match(v.d.querySelector('.ai-notice').textContent,/already reviewed/)}finally{v.dom.window.close()}
})
test('an uncertain write uses the existing recovery guard and is not automatically replayed',async()=>{
 const v=await mount({safeTransport:true,hooks:{request:(url,options)=>{if(options.method==='PUT')throw Error('Connection lost')}}});try{await open(v,'Occupancy deletion');await click(v,'Decline request');await click(v,'Confirm decline');await until(()=>v.d.querySelector('.ai-notice [role=alert]'));assert.match(v.d.querySelector('.ai-notice').textContent,/unconfirmed/);assert.equal(writes(v).length,1);assert.ok(v.w.sessionStorage.getItem('unconfirmedRequests').includes('/change-requests/1/reject'));assert.equal(button(v,'Approve deletion').disabled,true);assert.ok(v.d.getElementById('requestFeedback'))}finally{v.dom.window.close()}
})
test('failed or partial source responses never appear as a complete zero inbox',async()=>{
 for(const response of [reply({success:false,message:'Requests unavailable'},503),reply({success:true})]){const v=await mount({hooks:{request:url=>url==='/api/occupancy/change-requests/pending'?response:null}});try{assert.ok(v.d.querySelector('.ai-page>[role=alert]'));assert.equal(v.d.querySelector('.ai-stat'),null);assert.equal(v.d.querySelector('.ai-request'),null)}finally{v.dom.window.close()}}
})
test('final approvals reuse the version-checked station review and disappear after a confirmed decision',async()=>{
 const v=await mount();try{v.d.querySelector('[aria-label="Review Final review project"]').click();await until(()=>v.d.querySelector('.fr-dialog').open&&v.d.querySelector('.fr-actions .fr-primary'));assert.match(v.d.querySelector('.fr-table').textContent,/Electrical/);assert.equal(v.d.querySelector('.fr-table input'),null);v.d.querySelector('.fr-actions .fr-primary').click();await until(()=>v.d.querySelector('.fr-confirm'));assert.equal(writes(v).length,0);v.d.querySelector('.fr-confirm .fr-primary').click();await until(()=>v.d.querySelector('.fr-success'));assert.equal(writes(v)[0].options.headers['x-record-version'],'final-version');assert.equal(writes(v)[0].url,'/api/permits/11/final-review');await until(()=>v.d.querySelectorAll('.ai-request').length===4)}finally{v.dom.window.close()}
})
test('pagination keeps all pending entries reachable and filtering returns to the first page',async()=>{
 const data=fixtures();data.building=Array.from({length:22},(_,index)=>({...data.building[0],id:index+1,project_title:'Page record '+(index+1)}));data.occupancy=[];data.final.final_approval={status:'in_review',ready:false};const v=await mount({data});try{assert.equal(v.d.querySelectorAll('.ai-request').length,20);await click(v,'Next');await until(()=>v.d.querySelectorAll('.ai-request').length===2);assert.match(v.d.querySelector('.ai-pagination').textContent,/Page 2 of 2/);v.d.getElementById('ai-tab-edit').click();await until(()=>v.d.querySelectorAll('.ai-request').length===20);assert.match(v.d.querySelector('.ai-pagination').textContent,/Page 1 of 2/)}finally{v.dom.window.close()}
})
