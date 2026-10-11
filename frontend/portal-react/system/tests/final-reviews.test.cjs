const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check){for(let i=0;i<200;i++){if(check())return;await wait()}assert.fail('Review did not reach the expected state')}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
async function mount(role,{kind='permits',hooks={}}={}){
 const dom=new JSDOM('<style>*{margin:0;padding:0}</style><div id="system-react-root" data-page="permits-superadmin"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document,calls=[];let saved=0;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.sessionStorage.setItem('oboUser',JSON.stringify({id:role==='admin'?2:3,role}));
 const final={status:'ready',label:'Ready for final review',ready:true,history:[]},station={id:50,discipline_name:'<Electrical>',engineer_name:'Reviewer',signature_status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02',feedback_remarks:'Station checked'},record={id:10,project_title:'<img src=x>',owner_name:'Owner',location:'Address',lot_numbers:['Lot 1'],permit_date:'2026-01-01',matrix:[station],sub_permits:kind==='permits'?[{id:7,sub_project_title:'Annex',matrix:[{...station,id:51}]}]:[],_version:'review-v1',final_approval:final};
 w.fetch=async(url,options={})=>{
  calls.push({url,options});let data;
  if(options.method==='PUT'){
   const body=JSON.parse(options.body),override=hooks.put&&await hooks.put(body,record);if(override)return override;
   saved++;final.status=body.decision==='approved'?'approved':'returned';final.label=body.decision==='approved'?'Finally approved':'Returned for correction';final.ready=false;record._version='review-v'+(saved+1);final.history.push({id:saved,decision:body.decision,remarks:body.remarks,reviewer_name:'Boss',created_at:'2026-01-02',current:true});data={success:true};
  }else if(url==='/api/final-reviews')data={projects:[{...record,kind}]};
  else if(url===`/api/${kind}/10`){const override=hooks.read&&await hooks.read(record,saved);if(override)return override;data=record}
  else if(url==='/api/admin/overview')data={totals:role==='superadmin'?{accounts:5,pendingAccounts:1}:{building:1,occupancy:1,buildingPending:0,occupancyPending:0,buildingDeletions:0,occupancyDeletions:0},recent:[]};else data={success:true};
  return reply(data);
 };
 w.eval(bundle);await until(()=>d.querySelector('.ao-stats'));if(role==='admin')await until(()=>d.querySelector('#finalReviews .fr-projects button'));
 return {dom,w,d,calls,record,open:async()=>{d.querySelector('#finalReviews .fr-projects button').click();await until(()=>d.querySelector('.fr-dialog').open&&!d.querySelector('[aria-label="Close review"]').disabled)}};
}
const writes=fixture=>fixture.calls.filter(call=>call.options.method==='PUT');
async function confirm(fixture){fixture.d.querySelector('.fr-actions .fr-primary').click();await until(()=>fixture.d.querySelector('.fr-confirm'));fixture.d.querySelector('.fr-confirm .fr-primary').click()}

test('IT workspace has only account navigation and never fetches engineering review data',async()=>{
 const {dom,d,calls}=await mount('superadmin');try{
  assert.equal(d.querySelector('.topbar h1').textContent,'User Account Management');assert.equal(d.querySelector('.permit-nav-identity-copy strong').textContent,'User Account Management');
  assert.ok(!d.querySelector('.permit-sidebar a[href="#buildingReview"],.permit-sidebar a[href="#occupancyReview"],.permit-sidebar a[href="#finalReviews"]'));
  assert.ok(!d.getElementById('buildingReview'));assert.ok(!d.getElementById('occupancyReview'));assert.ok(!d.getElementById('finalReviews'));assert.ok(!d.querySelector('.permit-transfer-tools'));assert.ok(d.getElementById('createAccountForm'));assert.ok(d.body.textContent.includes('Account access'));assert.equal(calls.filter(c=>/final-reviews|\/api\/permits|\/api\/occupancy/.test(c.url)).length,0);
 }finally{dom.window.close()}
});
for(const kind of ['permits','occupancy']){
 test(`${kind}: centered review confirms approval, prevents repeated clicks and announces the saved result`,async()=>{
  let release;const fixture=await mount('admin',{kind,hooks:{put:()=>new Promise(resolve=>release=resolve)}}),{dom,w,d}=fixture;
  try{
   await fixture.open();assert.equal(d.querySelectorAll('.fr-table tbody tr').length,kind==='permits'?2:1);assert.match(d.querySelector('.fr-dialog').textContent,/2026-01-01/);assert.match(d.querySelector('.fr-dialog').textContent,/Station checked/);assert.ok(!d.querySelector('.fr-dialog img'));assert.equal(d.querySelector('.fr-table tbody td').textContent,'<Electrical>');
   const style=w.getComputedStyle(d.querySelector('.fr-dialog'));assert.equal(style.position,'fixed');assert.equal(style.marginTop,'auto');assert.equal(style.marginLeft,'auto');assert.match(style.inset,/^0(?:px)?$/);
   d.querySelector('.fr-actions .fr-primary').click();await until(()=>d.querySelector('.fr-confirm'));assert.equal(writes(fixture).length,0);assert.equal(d.activeElement,d.querySelector('.fr-confirm .fr-primary'));assert.match(d.querySelector('.fr-confirm').textContent,/Give final approval to <img src=x>/);assert.ok(!d.querySelector('.fr-confirm img'));
   d.querySelector('.fr-confirm button').click();await until(()=>!d.querySelector('.fr-confirm'));assert.equal(writes(fixture).length,0);assert.equal(d.activeElement,d.querySelector('.fr-actions .fr-primary'));
   d.querySelector('.fr-actions .fr-primary').click();await until(()=>d.querySelector('.fr-confirm'));const accept=d.querySelector('.fr-confirm .fr-primary');accept.click();accept.click();await until(()=>release);
   assert.equal(writes(fixture).length,1);assert.match(d.querySelector('.fr-notice [role="status"]').textContent,/Saving final approval/);assert.equal(d.querySelector('[aria-label="Close review"]').disabled,true);
   const cancel=new w.Event('cancel',{cancelable:true});d.querySelector('.fr-dialog').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(d.querySelector('.fr-dialog').open,true);
   release();await until(()=>d.querySelector('.fr-success')&&!d.querySelector('[aria-label="Close review"]').disabled);
   const write=writes(fixture)[0];assert.equal(write.url,`/api/${kind}/10/final-review`);assert.equal(write.options.headers['x-record-version'],'review-v1');assert.equal(JSON.parse(write.options.body).decision,'approved');assert.match(d.querySelector('.fr-success').textContent,/Final approval recorded for <img src=x>/);assert.equal(d.querySelector('.fr-actions .fr-primary').textContent,'Finally approved');assert.equal(d.querySelector('.fr-actions .fr-primary').disabled,true);assert.equal(fixture.record.final_approval.history.length,1);
   assert.equal(d.querySelector('.fr-feedback'),null);assert.ok(![...d.querySelectorAll('.fr-dialog button')].some(button=>button.textContent==='Return for correction'));assert.match(d.querySelector('.fr-help').textContent,/read-only until project or station details change/);
   assert.match(d.querySelector('.fr-projects').textContent,/No projects match/);d.querySelector('[aria-label="Close review"]').click();await until(()=>!d.querySelector('.fr-dialog').open);assert.equal(d.activeElement,d.querySelector('#finalReviews>.fr-heading button'));
   const filter=d.querySelector('.fr-filters select');filter.value='approved';filter.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>d.querySelector('#finalReviews .fr-projects button'));await fixture.open();assert.equal(d.querySelector('.fr-feedback'),null);assert.equal(d.querySelectorAll('.fr-actions button').length,1);assert.equal(writes(fixture).length,1);assert.match(d.querySelector('.fr-history').textContent,/Final approval/);assert.ok(!d.querySelector('.fr-history').textContent.includes('Earlier approval'));
   fixture.record.final_approval.status='ready';fixture.record.final_approval.ready=true;fixture.record.final_approval.label='Ready for final review';fixture.record.final_approval.history[0].current=false;fixture.record._version='changed-project';
   d.querySelector('[aria-label="Close review"]').click();await until(()=>!d.querySelector('.fr-dialog').open);filter.value='all';filter.dispatchEvent(new w.Event('change',{bubbles:true}));await fixture.open();assert.ok(d.querySelector('.fr-feedback textarea'));assert.equal(d.querySelector('.fr-actions button').textContent,'Return for correction');assert.equal(d.querySelector('.fr-actions button').disabled,false);assert.equal(d.querySelector('.fr-actions .fr-primary').disabled,false);
  }finally{dom.window.close()}
 });
 test(`${kind}: conflicts show an error and retry uses the freshly loaded version`,async()=>{
  let fail=true;const fixture=await mount('admin',{kind,hooks:{put:(body,record)=>{if(fail){record._version='fresh-version';return reply({message:'This project changed. Review the updated details.'},409)}}}}),{dom,d}=fixture;
  try{
   await fixture.open();await confirm(fixture);await until(()=>d.querySelector('.fr-notice [role="alert"]')&&!d.querySelector('.fr-actions .fr-primary').disabled);assert.match(d.querySelector('.fr-error').textContent,/project changed/);assert.equal(d.querySelector('.fr-success'),null);assert.equal(fixture.record.final_approval.history.length,0);
   fail=false;await confirm(fixture);await until(()=>d.querySelector('.fr-success')&&!d.querySelector('[aria-label="Close review"]').disabled);assert.equal(writes(fixture).length,2);assert.equal(writes(fixture)[1].options.headers['x-record-version'],'fresh-version');assert.equal(fixture.record.final_approval.history.length,1);
  }finally{dom.window.close()}
 });
 test(`${kind}: a failed reload after approval retains success and refreshes without resubmitting`,async()=>{
  let failRead=true;const fixture=await mount('admin',{kind,hooks:{read:(record,saved)=>{if(saved&&failRead)return reply({message:'Details unavailable'},503)}}}),{dom,d}=fixture;
  try{
   await fixture.open();await confirm(fixture);await until(()=>d.querySelector('.fr-notice button')&&!d.querySelector('[aria-label="Close review"]').disabled);assert.match(d.querySelector('.fr-success').textContent,/Final approval recorded/);assert.match(d.querySelector('.fr-notice [role="alert"]').textContent,/decision was saved/);assert.equal(d.querySelector('.fr-actions .fr-primary').disabled,true);assert.equal(writes(fixture).length,1);
   failRead=false;d.querySelector('.fr-notice button').click();await until(()=>!d.querySelector('.fr-notice button')&&!d.querySelector('[aria-label="Close review"]').disabled);assert.equal(writes(fixture).length,1);assert.equal(d.querySelector('.fr-actions .fr-primary').textContent,'Finally approved');assert.equal(d.querySelector('.fr-notice [role="alert"]'),null);assert.ok(d.querySelector('.fr-success'));
  }finally{dom.window.close()}
 });
 test(`${kind}: returning for correction requires remarks and announces the saved correction`,async()=>{
  const fixture=await mount('admin',{kind}),{dom,w,d}=fixture;
  try{
   await fixture.open();d.querySelector('.fr-actions button').click();await until(()=>d.querySelector('.fr-notice [role="alert"]'));assert.equal(writes(fixture).length,0);const textarea=d.querySelector('.fr-feedback textarea');assert.equal(d.activeElement,textarea);
   Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(textarea,'  Please revise <img src=x>  ');textarea.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('.fr-actions button').click();await until(()=>d.querySelector('.fr-success')&&!d.querySelector('[aria-label="Close review"]').disabled);
   assert.match(d.querySelector('.fr-success').textContent,/returned for correction.*remarks have been recorded/);assert.equal(JSON.parse(writes(fixture)[0].options.body).remarks,'Please revise <img src=x>');assert.equal(fixture.record.final_approval.history[0].decision,'returned');assert.ok(!d.querySelector('.fr-history img'));assert.equal(d.querySelector('.fr-actions .fr-primary').disabled,true);
  }finally{dom.window.close()}
 });
}
