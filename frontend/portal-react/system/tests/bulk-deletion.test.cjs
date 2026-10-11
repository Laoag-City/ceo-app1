const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const bundle=()=>fs.readFileSync(path.join(__dirname,'../../system-dist/app.js'),'utf8');
const asset=name=>fs.readFileSync(path.join(__dirname,'../assets/'+name),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,45));
function dialogs(w){
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(asset('common/destructive-action.js'));
}
async function registryFixture(kind,initial={success:true,count:3,version:'scope-v1',pending:null},role='operator'){
 const page=kind==='permits'?'permits-index':'permits-occupancy';
 const dom=new JSDOM('<div id="system-react-root" data-page="'+page+'"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];let state=initial,fail=false,finish;
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}));
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.fetch=async()=>({ok:true,json:async()=>({success:true})});
 w.RequestFeedback={fetch:async(url,options={})=>{
  calls.push({url,...options});
  if(fail)throw Error('Server unavailable. Retry.');
  if(options.method==='POST'){
   await new Promise(resolve=>finish=resolve);
   state={...state,pending:{id:42,record_count:3}};
   return {ok:true,json:async()=>({success:true,pending:true,requestId:42,count:3,message:'Request sent to the admin.'})};
  }
  return {ok:true,json:async()=>state};
 }};
 dialogs(w);w.eval(bundle());await wait();await wait();
 return {dom,w,d:w.document,calls,fail:value=>fail=value,finish:()=>finish?.(),setState:value=>state=value};
}
for(const kind of ['permits','occupancy']){
 test(kind+': entire-registry deletion needs typed confirmation and submits once without deleting locally',async()=>{
  const f=await registryFixture(kind);try{
   const button=f.d.querySelector('.registry-delete-all');assert.equal(button.disabled,false);
   button.click();await wait();let dialog=f.d.querySelector('.danger-confirm');assert.ok(dialog);assert.match(dialog.textContent,/all 3/);assert.match(dialog.textContent,/outside your current search or filter/);
   dialog.querySelector('.danger-confirm-actions button').click();await wait();assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
   button.click();await wait();dialog=f.d.querySelector('.danger-confirm');const input=dialog.querySelector('input'),accept=dialog.querySelector('.danger-confirm-accept');
   assert.equal(accept.disabled,true);input.value='delete all';input.dispatchEvent(new f.w.Event('input'));assert.equal(accept.disabled,true);
   input.value='DELETE ALL';input.dispatchEvent(new f.w.Event('input'));accept.click();accept.click();await wait();
   const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].url,'/api/permit-deletions/'+kind);assert.deepEqual(JSON.parse(writes[0].body),{confirmation:'DELETE ALL',version:'scope-v1'});
   assert.equal(writes[0].headers['x-permit-request'],'1');assert.equal(accept.disabled,true);
   f.finish();await wait();await wait();assert.equal(f.d.querySelector('.danger-confirm'),null);assert.equal(button.disabled,true);assert.match(f.d.querySelector('.registry-bulk-delete [role=status]').textContent,/sent to the admin/);
   assert.equal(f.calls.some(c=>c.method==='DELETE'),false);
  }finally{f.dom.window.close()}
 });
 test(kind+': pending, empty, and unavailable states prevent submission and can recover',async()=>{
  const f=await registryFixture(kind,{success:true,count:3,version:'v1',pending:{id:18,record_count:3}});try{
   const button=f.d.querySelector('.registry-delete-all');assert.equal(button.disabled,true);assert.match(f.d.querySelector('.registry-bulk-delete [role=status]').textContent,/awaiting admin review/);
   f.setState({success:true,count:0,version:'v2',pending:null});f.w.dispatchEvent(new f.w.Event('permit-registry-changed'));await wait();assert.equal(button.disabled,true);
   f.fail(true);f.w.dispatchEvent(new f.w.Event('focus'));await wait();assert.equal(button.disabled,true);assert.match(f.d.querySelector('.registry-bulk-delete-error').textContent,/unavailable/);
   f.fail(false);f.setState({success:true,count:2,version:'v3',pending:null});f.d.querySelector('.registry-bulk-delete-error button').click();await wait();assert.equal(button.disabled,false);
   assert.equal(f.calls.some(c=>c.method),false);
  }finally{f.dom.window.close()}
 });
}
test('IT and admin accounts do not receive the registry deletion request control',async()=>{
 for(const role of ['superadmin','admin']){const f=await registryFixture('permits',undefined,role);try{assert.equal(f.d.querySelector('.registry-delete-all'),null);assert.equal(f.calls.length,0)}finally{f.dom.window.close()}}
});

test('admin bulk requests show the full scope safely and use distinct review routes from individual deletions',async()=>{
 const dom=new JSDOM('<div class="topbar"><h1></h1><p></p></div><div id="permitApprovals"></div><div id="occupancyApprovals"></div>',{url:'http://localhost/admin',runScripts:'dangerously'});
 const w=dom.window,d=w.document,calls=[],errors=[];let pending=true;
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:2,role:'admin'}));w.alert=()=>{};
 const bulk=kind=>({id:9,kind,bulk:true,change_type:'bulk_delete',project_title:'All '+kind+' records',requested_by_name:'Operator <script>',record_count:2,changes:{count:2,projects:[{id:10,project_title:'<img src=x onerror=bad()>'},{id:20,project_title:'Normal project'}]}});
 w.RequestFeedback={report:error=>errors.push(error),fetch:async(url,options={})=>{
  calls.push({url,...options});
  if(options.method==='PUT'){pending=false;return {ok:true,json:async()=>({success:true,message:'Deleted fixtures.'})}}
  return {ok:true,json:async()=>({success:true,requests:pending?[bulk(url.includes('occupancy')?'occupancy':'permits'),{id:9,change_type:'delete',permit_id:77,project_title:'Individual project',requested_by_name:'Other'}]:[]})};
 }};
 try{
  dialogs(w);w.eval(asset('permits/approval-preview.js'));w.eval(asset('permits/admin-request-cards.js'));
  const shell=fs.readFileSync(path.join(__dirname,'../features/administration/dashboard.html'),'utf8'),controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function loadPendingAccounts'));
  w.eval(controller);await wait();
  const cards=d.querySelectorAll('#permitApprovals .review-request');assert.equal(cards.length,2);assert.match(cards[0].textContent,/See 2 records/);assert.equal(cards[0].querySelector('img,script'),null);assert.match(cards[0].textContent,/<img src=x/);
  cards[0].querySelector('.approve').click();await wait();const dialog=d.querySelector('.danger-confirm');assert.match(dialog.textContent,/2 permit records/);assert.match(dialog.textContent,/request #9/);
  assert.equal(calls.some(c=>c.method==='PUT'),false);
  const input=dialog.querySelector('input');input.value='DELETE ALL';input.dispatchEvent(new w.Event('input'));dialog.querySelector('.danger-confirm-accept').click();await wait();
  const approval=calls.find(c=>c.method==='PUT');assert.equal(approval.url,'/api/permit-deletions/permits/9/approve');assert.equal(JSON.parse(approval.body).confirmation,'DELETE ALL');assert.equal(errors.length,0);
  pending=true;await w.loadOccupancyApprovals();d.querySelector('#occupancyApprovals .reject').click();await wait();assert.ok(calls.some(c=>c.url==='/api/permit-deletions/occupancy/9/reject'&&c.method==='PUT'));
 }finally{dom.window.close()}
});
