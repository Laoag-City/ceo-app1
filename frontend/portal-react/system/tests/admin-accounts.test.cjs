const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');const path=require('node:path');
const shell=fs.readFileSync(path.join(__dirname,'../features/administration/dashboard.html'),'utf8');
const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function loadPendingAccounts'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test('account lists render hostile names as text and preserve account actions',async()=>{
 const dom=new JSDOM('<div class="topbar"><h1></h1><p></p></div><form id="createAccountForm"></form><div id="accountSection"></div><div id="accountListSection"></div><div id="pendingAccounts"></div><div id="allAccounts"></div>',{url:'http://localhost/',runScripts:'dangerously'});
 const w=dom.window,d=w.document,calls=[],confirmations=[];
 const names=['<img src=x onerror="window.attacked=true">',"O’Neil O'Connor", "');window.attacked=true;//",'<svg onload="window.attacked=true"></svg>','<script>window.attacked=true</script>'];
 let users=names.map((username,i)=>({id:i+1,username,role:'operator',created_at:'2026-01-01',is_active:1,is_verified:1}));
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:99,role:'superadmin'}));
 w.alert=()=>{};w.confirm=message=>{confirmations.push(message);return true};
 w.FormSafety={guard:(id,fn)=>fn};
 w.RequestFeedback={fetch:async(url,options={})=>{calls.push({url,...options});return {json:async()=>({success:true,users,requests:[],message:'Fixture success'})}}};
 try{
 w.eval(controller);await settle();
 for(const id of ['pendingAccounts','allAccounts']){
  const wrap=d.getElementById(id);assert.deepEqual([...wrap.querySelectorAll('tbody tr')].map(row=>row.cells[0].textContent),names);
  assert.equal(wrap.querySelector('img,svg,script,[onclick],[onchange],[onerror],[onload]'),null);
 }
 assert.equal(w.attacked,undefined);
 d.querySelector('#pendingAccounts .approve').click();await settle();assert.ok(calls.some(c=>c.url==='/api/auth/accounts/1/approve'&&c.method==='PUT'));
 d.querySelector('#pendingAccounts .reject').click();await settle();assert.ok(calls.some(c=>c.url==='/api/auth/accounts/1/decline'&&c.method==='DELETE'));
 const select=d.querySelector('#allAccounts select');select.value='admin';select.dispatchEvent(new w.Event('change'));await settle();assert.ok(calls.some(c=>c.url==='/api/auth/accounts/1/role'&&JSON.parse(c.body).role==='admin'));
 d.querySelectorAll('#allAccounts .delete')[2].click();await settle();assert.ok(confirmations.some(message=>message.includes(names[2])));assert.ok(calls.some(c=>c.url==='/api/auth/accounts/3'&&c.method==='DELETE'));assert.equal(w.attacked,undefined);
 users=[{id:'1);window.attacked=true',username:'bad id',role:'<img src=x onerror="window.attacked=true">'}];await w.loadAllAccounts();await w.loadPendingAccounts();
 assert.equal(d.querySelector('#allAccounts img'),null);assert.equal(d.querySelector('#allAccounts .delete').disabled,true);assert.equal(d.querySelector('#allAccounts select').disabled,true);assert.equal(d.querySelector('#pendingAccounts .approve').disabled,true);
 users=[];await w.loadAllAccounts();await w.loadPendingAccounts();assert.match(d.getElementById('allAccounts').textContent,/No accounts/);assert.match(d.getElementById('pendingAccounts').textContent,/No pending/);
 }finally{dom.window.close()}
});

test('own account is protected by ID, including renamed accounts and string IDs',async()=>{
 const dom=new JSDOM('<div class="topbar"><h1></h1><p></p></div><form id="createAccountForm"></form><div id="accountSection"></div><div id="accountListSection"></div><div id="pendingAccounts"></div><div id="allAccounts"></div>',{url:'http://localhost/',runScripts:'dangerously'});
 const w=dom.window,d=w.document,calls=[],alerts=[];
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:99,username:'renamed-it',role:'superadmin'}));
 w.alert=message=>alerts.push(message);w.confirm=()=>{assert.fail('Own account must never reach deletion confirmation')};
 w.FormSafety={guard:(id,fn)=>fn};
 const users=[{id:'99',username:'renamed-it',role:'superadmin',is_active:1,is_verified:1},{id:7,username:'other-it',role:'superadmin',is_active:1,is_verified:1},{id:8,username:'admin',role:'admin',is_active:1,is_verified:1}];
 w.RequestFeedback={fetch:async(url,options={})=>{calls.push({url,...options});return {json:async()=>({success:true,users,requests:[],stations:[]})}}};
 try{
  w.eval(controller);await settle();
  const [own,other,admin]=d.querySelectorAll('#allAccounts tbody tr');
  assert.equal(own.cells[0].textContent,'renamed-it (You)');assert.equal(own.querySelector('select').disabled,true);
  assert.equal(own.cells[5].textContent,'Your account');assert.equal(own.querySelectorAll('button').length,0);
  for(const row of [other,admin]){assert.equal(row.querySelector('select').disabled,false);assert.deepEqual([...row.cells[5].querySelectorAll('button')].map(button=>button.textContent),['Deactivate','Delete']);}
  await w.deleteAccount('99','renamed-it');
  assert.match(alerts.at(-1),/cannot delete your own account/);assert.ok(!calls.some(call=>call.method==='DELETE'));
 }finally{dom.window.close()}
});
