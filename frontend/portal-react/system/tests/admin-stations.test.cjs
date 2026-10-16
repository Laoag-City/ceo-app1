const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');

const shell=fs.readFileSync(path.join(__dirname,'../features/administration/dashboard.html'),'utf8');
const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
 .map(match=>match[1]).find(script=>script.includes('function loadPendingAccounts'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
const stationKey=name=>String(name || '').normalize('NFKC').trim().toUpperCase()
 .replace(/&/g,' AND ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

async function accountFixture(users,stations){
 const dom=new JSDOM('<div class="topbar"><h1></h1><p></p></div><form id="createAccountForm"></form><div id="accountSection"></div><div id="accountListSection"></div><div id="pendingAccounts"></div><div id="allAccounts"></div>',{url:'http://localhost/superadmin',runScripts:'dangerously'});
 const w=dom.window,calls=[],errors=[];let fail=false;
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:99,role:'superadmin'}));
 w.FormSafety={guard:(id,handler)=>handler,clean:()=>{}};
 w.RequestFeedback={
  report:error=>errors.push(error),
  fetch:async(url,options={})=>{
   calls.push({url,...options});
   if(url==='/api/auth/accounts/pending')return {json:async()=>({success:true,users:[]})};
   if(url==='/api/auth/stations')return {json:async()=>({success:true,stations})};
   if(url==='/api/auth/accounts' && !options.method)return {json:async()=>({success:true,users})};
   const assignment=url.match(/^\/api\/auth\/accounts\/(\d+)\/stations$/);
   if(assignment && options.method==='PUT'){
    if(fail)throw Error('Assignments could not be saved.');
    const user=users.find(item=>item.id===Number(assignment[1]));
    user.assigned_stations=JSON.parse(options.body).stations;
    return {json:async()=>({success:true})};
   }
   throw new Error('Unexpected fixture request: '+url);
  }
 };
 try{w.eval(controller);await settle();}
 catch(error){dom.window.close();throw error;}
 return {dom,w,d:w.document,calls,errors,setFailure(value){fail=value}};
}

test('IT selects several stations together, saves once and restores their checks when reopened',async()=>{
 const fixture=await accountFixture([
  {id:1,username:'Alice',role:'operator',is_active:1,is_verified:1},
  {id:2,username:'Boss',role:'admin',is_active:1,is_verified:1}
 ],['Sanitary','Electrical']);
 const {dom,w,d,calls,errors}=fixture;
 try{
  const trigger=d.querySelector('[aria-label="Assigned stations for Alice"]');
  assert.ok(trigger);assert.equal(trigger.disabled,false);assert.equal(trigger.textContent,'Stations (0)');trigger.click();
  const menu=trigger.closest('.station-assignment-control').querySelector('.station-assignment-menu');assert.equal(menu.hidden,false);
  for(const input of menu.querySelectorAll('input'))input.checked=true;
  assert.equal(calls.filter(call=>call.method==='PUT').length,0);
  menu.querySelector('.approve').click();menu.querySelector('.approve').click();
  await settle();
  const assignment=calls.filter(call=>call.url==='/api/auth/accounts/1/stations' && call.method==='PUT');
  assert.equal(assignment.length,1);
  assert.deepEqual(JSON.parse(assignment[0].body),{stations:['Sanitary','Electrical']});
  assert.equal(menu.hidden,true);assert.equal(trigger.textContent,'Stations (2)');trigger.click();assert.ok([...menu.querySelectorAll('input')].every(input=>input.checked));
  menu.querySelector('.approve').click();await settle();assert.equal(calls.filter(call=>call.method==='PUT').length,1);
  assert.equal(errors.length,0);
 }finally{await settle();dom.window.close();}
});

test('stations remain selectable for several operators and spelling variants are deduplicated',async()=>{
 const fixture=await accountFixture([
  {id:1,username:'Alice',role:'operator',is_active:1,is_verified:1},
  {id:2,username:'Ben',role:'operator',is_active:1,is_verified:1,assigned_station:'Line & Grade'},
  {id:3,username:'Cara',role:'operator',is_active:1,is_verified:1,assigned_station:'Ｓａｎｉｔａｒｙ'}
 ],['Line and Grade','Sanitary','Electrical']);
 const {dom,d,errors}=fixture;
 try{
  const alice=d.querySelector('[aria-label="Assigned stations for Alice"]');alice.click();
  const options=alice.closest('.station-assignment-control').querySelectorAll('input');
  for(const station of ['Line and Grade','Sanitary','Electrical'])assert.equal([...options].find(input=>stationKey(input.value)===stationKey(station)).disabled,false);
  const ben=d.querySelector('[aria-label="Assigned stations for Ben"]');ben.click();
  const benChecks=ben.closest('.station-assignment-control').querySelectorAll('input');
  assert.equal([...benChecks].filter(input=>stationKey(input.value)===stationKey('Line & Grade')).length,1);
  assert.equal([...benChecks].find(input=>stationKey(input.value)===stationKey('Line & Grade')).checked,true);
  assert.equal(errors.length,0);
 }finally{await settle();dom.window.close();}
});

test('admin accounts can receive station assignments while IT accounts remain ineligible',async()=>{
 const fixture=await accountFixture([
  {id:1,username:'Alice',role:'operator',is_active:1,is_verified:1},
  {id:2,username:'Boss',role:'admin',is_active:1,is_verified:1},
  {id:3,username:'IT',role:'superadmin',is_active:1,is_verified:1}
 ],['Sanitary']);
 const {dom,d,calls,errors}=fixture;
 try{
  assert.ok(d.querySelector('[aria-label="Assigned stations for Alice"]'));
  const admin=d.querySelector('[aria-label="Assigned stations for Boss"]');assert.ok(admin);
  admin.click();const menu=admin.closest('.station-assignment-control');
  menu.querySelector('input[value="Sanitary"]').checked=true;menu.querySelector('.approve').click();await settle();
  assert.deepEqual(JSON.parse(calls.find(call=>call.url==='/api/auth/accounts/2/stations').body),{stations:['Sanitary']});
  assert.equal(admin.textContent,'Stations (1)');
  assert.ok(!d.querySelector('[aria-label="Assigned stations for IT"]'));
  const rows=[...d.querySelectorAll('#allAccounts tbody tr')];
  for(const name of ['IT']){
   const row=rows.find(item=>item.cells[0].textContent===name);
   assert.ok(row);assert.match(row.cells[4].textContent,/Not applicable/);
  }
  assert.equal(errors.length,0);
 }finally{await settle();dom.window.close();}
});

test('cancel discards station drafts; failed saves preserve the draft and can be retried or cleared',async()=>{
 const {dom,d,calls,errors,setFailure}=await accountFixture([{id:1,username:'Alice',role:'operator',is_active:1,is_verified:1,assigned_stations:['Electrical']}],['Electrical','Sanitary']);
 try{
  const trigger=d.querySelector('[aria-label="Assigned stations for Alice"]'),menu=trigger.closest('.station-assignment-control').querySelector('.station-assignment-menu');
  trigger.click();menu.querySelector('input[value="Sanitary"]').checked=true;menu.querySelector('.station-assignment-actions button').click();assert.equal(calls.filter(call=>call.method==='PUT').length,0);
  trigger.click();assert.equal(menu.querySelector('input[value="Sanitary"]').checked,false);menu.querySelector('input[value="Sanitary"]').checked=true;
  setFailure(true);menu.querySelector('.approve').click();await settle();assert.equal(menu.hidden,false);assert.equal(trigger.textContent,'Stations (1)');assert.equal(menu.querySelector('input[value="Sanitary"]').checked,true);assert.match(menu.textContent,/could not be saved/);assert.equal(errors.length,1);
  setFailure(false);menu.querySelector('.approve').click();await settle();assert.equal(trigger.textContent,'Stations (2)');
  trigger.click();menu.querySelectorAll('input').forEach(input=>{input.checked=false});menu.querySelector('.approve').click();await settle();
  assert.equal(trigger.textContent,'Stations (0)');assert.deepEqual(JSON.parse(calls.filter(call=>call.method==='PUT').at(-1).body),{stations:[]});
 }finally{dom.window.close()}
});
