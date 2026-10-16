const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),settle=()=>new Promise(resolve=>setTimeout(resolve,50));

async function fixture(kind,role='admin'){
 const occupancy=kind==='occupancy',calls=[],homes=[],errors=[],confirmations=[];let deleted=false;
 const dom=new JSDOM('<div id="system-react-root" data-page="'+(occupancy?'permits-occupancy':'permits-index')+'"></div>',{url:'http://localhost/'+(occupancy?'occupancy':'index.html'),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;
 w.console.error=(...values)=>errors.push(values.map(value=>value?.stack||String(value)).join(' '));
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}));w.AbortController=AbortController;w.alert=()=>{};w.confirm=()=>true;
 w.PermitRouting={home(user){homes.push(user.role);return '/'+user.role;},logout:async()=>{}};
 w.DestructiveAction={run:options=>{confirmations.push(options);return Promise.resolve(false);}};
 const record={id:7,project_title:'Visible permit',owner_name:'Owner',location:'Laoag',permit_date:'2026-10-16',date_applied:'2026-10-16',lot_numbers:'[]',sub_permits:'[]',routing_tracks:'[]',bp_reference_no:'BP-7'};
 w.fetch=async(url,options={})=>{
  calls.push({url,options});let data;
  if(options.method==='DELETE'){deleted=true;data={success:true,pending:false,deletedCount:1,message:'Permit deleted.'};}
  else if(String(url).startsWith('/api/permit-deletions/'))data={success:true,count:deleted?0:1,version:'registry',pending:null};
  else data=occupancy?{permits:deleted?[]:[record],matrix:[]}:deleted?[]:[record];
  return new Response(JSON.stringify(data));
 };
 w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));await settle();
 for(const file of ['request-feedback.js','form-safety.js','project-identity.js','registry-filters.js','station-dates.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',file),'utf8'));
 const shell=fs.readFileSync(path.join(base,'features',kind,'registry.html'),'utf8');
 const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(code=>code.includes(occupancy?'let allPermits':'let globalPermitsCache'));
 assert.ok(controller,'Registry controller exists');w.eval(controller);
 d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
 return {dom,w,d,calls,homes,errors,confirmations};
}

for(const kind of ['building','occupancy'])test(kind+': admin registry permits confirmed direct deletion while creation stays operator-only',async()=>{
 const {dom,w,d,calls,homes,errors,confirmations}=await fixture(kind);try{
  assert.deepEqual(homes,[],'Admin is not redirected to its dashboard');
  assert.match(d.getElementById('permitTableBody').textContent,/Visible permit/,errors.join('\n'));
  assert.equal(d.querySelector('.btn-details,.btn-action').getAttribute('href'),kind==='building'?'/edit?id=7':'/occupancy/edit?id=7');
  assert.ok(d.querySelector('.btn-progress'));
  assert.ok(d.querySelector('.btn-delete-record'));assert.ok(d.querySelector('.registry-bulk-delete'));
  assert.equal(d.querySelector('.top-bar-controls .btn-new-permit:not(.btn-logout)'),null);
  if(kind==='building'){w.openCreatePermitModal();await w.executePermitRemoval(7,'Visible permit');assert.equal(d.getElementById('createPermitModal').style.display,'none');}
  else {w.openModal();await w.deletePermit(7,'Visible permit');assert.notEqual(d.getElementById('createModal').style.display,'flex');}
  assert.equal(calls.filter(call=>['POST','PUT','DELETE'].includes(call.options.method)&&call.url!=='/api/presence').length,0);
  const confirmation=confirmations.at(-1);assert.match(confirmation.title,/Permanently delete/);assert.match(confirmation.message,/Visible permit/);assert.match(confirmation.message,/No admin approval request/);assert.equal(confirmation.confirmLabel,'Delete permanently');
  await confirmation.action();await settle();
  const writes=calls.filter(call=>call.options.method==='DELETE');assert.equal(writes.length,1);assert.equal(writes[0].url,'/api/'+(kind==='building'?'permits':'occupancy')+'/7');assert.deepEqual(JSON.parse(writes[0].options.body),{confirmation:'DELETE'});
  assert.doesNotMatch(d.getElementById('permitTableBody').textContent,/Visible permit/);
 }finally{dom.window.close()}
});
