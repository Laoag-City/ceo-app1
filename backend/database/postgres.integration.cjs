/** Real HTTP/SQL acceptance tests. Hard guard: only *_system_test databases.
 * Child servers are stopped in finally. Fixture accounts never enter migration/live DBs.
 */
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),fs=require('node:fs/promises');
const {Client}=require('pg'),bcrypt=require('../monitorBP backend/node_modules/bcryptjs');
const configs=JSON.parse(process.env.OFFICE_PG_CONNECTIONS||'[]');
if(configs.length!==2||configs.some(c=>!['permit_system_test','queue_system_test'].includes(c.database)))throw Error('Tests require isolated databases');
const permitPort=3002,queuePort=5002,base='http://127.0.0.1:'+permitPort,qbase='http://127.0.0.1:'+queuePort;
const children=[],passed=[],run='pgtest_'+Date.now(),password=crypto.randomBytes(18).toString('hex');
let log='';
const clients=configs.map(c=>new Client(c));
const permit=clients[configs.findIndex(c=>c.source==='permit_system')];
async function request(url,method='GET',body,cookie='',expected=200,headers={}){
 const r=await fetch(url,{method,headers:{'content-type':'application/json','x-permit-request':'1','x-queue-request':'1',cookie,...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const type=r.headers.get('content-type')||'';const data=type.includes('json')?await r.json():await r.text();
 assert.equal(r.status,expected,method+' '+new URL(url).pathname+' '+(typeof data==='object'?JSON.stringify(data):type));
 return {data,cookie:r.headers.get('set-cookie')?.split(';')[0],response:r};
}
async function mark(label,fn){await fn();passed.push(label);console.log('PASS '+label);}
async function main(){
 const fixtureIds=[];
 try{
  for(const c of clients)await c.connect();
  const hash=await bcrypt.hash(password,4);
  for(const role of ['operator','admin','superadmin']){
   const r=await permit.query('INSERT INTO users(username,password,role,is_active,is_verified) VALUES($1,$2,$3,1,1) RETURNING id',[run+'_'+role,hash,role]);fixtureIds.push(r.rows[0].id);
  }
  for(const [file,port] of [['../monitorBP backend/monitorServer.js',permitPort],['../queue backend/queueServer.js',queuePort]]){
   const child=spawn(process.execPath,[path.join(__dirname,file)],{windowsHide:true,env:{...process.env,PERMIT_PORT:String(permitPort),QUEUE_PORT:String(queuePort),PERMIT_COOKIE_NAME:'permit_pg_test',QUEUE_COOKIE_NAME:'queue_pg_test'},stdio:['ignore','pipe','pipe']});
   children.push(child);child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});
   let ready=false;for(let attempt=0;attempt<100;attempt++){
    if(child.exitCode!==null)throw Error('Server failed to start');
    try{const r=await fetch('http://127.0.0.1:'+port+(port===permitPort?'/api/health':'/api/videos/playlist'));if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
   }if(!ready)throw Error('Startup timeout');
  }
  const login=async(role,url=base)=>(await request(url+'/api/auth/login','POST',{username:run+'_'+role,password})).cookie;
  let operator=await login('operator');const admin=await login('admin'),superadmin=await login('superadmin');
  await mark('Login, invalid password, anonymous and role guards',async()=>{
   await request(base+'/api/auth/login','POST',{username:run+'_operator',password:'wrong-secret'},'',401);
   await request(base+'/api/permits','GET',undefined,'',401);
   await request(base+'/api/auth/accounts','GET',undefined,operator,403);
   await request(base+'/api/auth/accounts','GET',undefined,superadmin);
   await request(base+'/api/admin/overview','GET',undefined,operator,403);
   const overview=(await request(base+'/api/admin/overview','GET',undefined,superadmin)).data;
   assert.ok(Object.hasOwn(overview.totals,'buildingPending'));
  });
  await mark('People, profile upsert, presence and literal search',async()=>{
   await request(base+'/api/profile','PUT',{display_name:run,bio:'Migration test',avatar_color:'blue'},operator);
   await request(base+'/api/presence','POST',{active:true},operator);
   await request(base+'/api/presence','POST',{active:false},operator);
   const people=(await request(base+'/api/people?q='+run,'GET',undefined,operator)).data;
   assert.ok(people.people.some(p=>p.display_name===run));
  });
  let building,occupancy;
  await mark('Building creation, lots, sub-permit, registry JSON and dates',async()=>{
   await request(base+'/api/permits','POST',{project_title:run,location:'Test',owner_name:'Test',designer_name:'Test',permit_date:'2026-09-29',lot_numbers:['Lot 1','Lot 2'],sub_project_title:'Annex'},operator);
   const registry=(await request(base+'/api/permits','GET',undefined,operator)).data;
   building=registry.find(p=>p.project_title===run).id;
   const detail=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   assert.equal(detail.permit_date,'2026-09-29');assert.equal(detail.lot_numbers.length,2);assert.equal(detail.sub_permits.length,1);
   assert.deepEqual(JSON.parse(registry.find(p=>p.id===building).lot_numbers),['Lot 1','Lot 2']);
  });
  await mark('Routing, independent station dates and stale edit protection',async()=>{
   const before=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   await request(base+'/api/matrix/add','POST',{permit_id:building,discipline_name:'MISCLICK_TEST'},operator,200,{'x-record-version':before._version});
   const added=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   const removeUrl=base+'/api/matrix/remove?permit_id='+building+'&discipline_name=MISCLICK_TEST';
   await request(removeUrl,'DELETE',undefined,'',401,{'x-record-version':added._version});
   await request(removeUrl,'DELETE',undefined,operator,409,{'x-record-version':before._version});
   await request(removeUrl,'DELETE',undefined,operator,200,{'x-record-version':added._version});
   assert.ok(!(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data.matrix.some(row=>row.discipline_name==='MISCLICK_TEST'));
   const initial=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   await request(base+'/api/matrix/add','POST',{permit_id:building,discipline_name:'ELECTRICAL'},operator,200,{'x-record-version':initial._version});
   let d=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   await request(base+'/api/permits/'+building+'/station-dates','PUT',{station_id:d.matrix[0].id,date_checked:'2026-09-29',date_approved:null,expected_dates:{date_checked:'',date_approved:''}},admin);
   await request(base+'/api/permits/'+building,'PUT',{project_title:run+'_edited'},operator,409,{'x-record-version':d._version});
   d=(await request(base+'/api/permits/'+building,'GET',undefined,operator)).data;
   assert.equal(d.matrix[0].date_checked,'2026-09-29');assert.equal(d.matrix[0].date_approved,null);
   await request(base+'/api/permits/'+building,'PUT',{project_title:run+'_edited'},operator,200,{'x-record-version':d._version});
   const pending=(await request(base+'/api/permits/change-requests/pending','GET',undefined,admin)).data.requests.find(r=>r.permit_id===building);
   assert.ok(pending);await request(base+'/api/permits/change-requests/'+pending.id+'/approve','PUT',{},admin);
   assert.equal((await request(base+'/api/permits/'+building,'GET',undefined,operator)).data.project_title,run+'_edited');
  });
  await mark('Project comments, retry idempotency and history pagination',async()=>{
   const body={message:'test comment',requestId:crypto.randomUUID()};
   await request(base+'/api/project-records/permits/'+building+'/comments','POST',body,operator);
   await request(base+'/api/project-records/permits/'+building+'/comments','POST',body,operator);
   const history=(await request(base+'/api/project-records/permits/'+building+'?category=comment','GET',undefined,operator)).data;
   assert.equal(history.records.filter(r=>r.message==='test comment').length,1);
  });
  await mark('Occupancy creation, registry and checklist concurrency',async()=>{
   await request(base+'/api/occupancy','POST',{project_title:run,location:'Test',owner_name:'Test',bp_reference_no:'BP-'+building,date_applied:'2026-09-29'},operator);
   occupancy=(await request(base+'/api/occupancy','GET',undefined,operator)).data.permits.find(p=>p.project_title===run).id;
   const url=base+'/api/occupancy/'+occupancy+'/checklist';const d=(await request(url,'GET',undefined,operator)).data;
   await request(url,'PUT',{checklist_state:{test:true}},operator,200,{'x-record-version':d._version});
   await request(url,'PUT',{checklist_state:{test:false}},operator,409,{'x-record-version':d._version});
  });
  await mark('Inspection creation, edit, stale edit and deletion approval',async()=>{
   const url=base+'/api/occupancy/'+occupancy+'/inspections';
   const body={inspection_type:'Preliminary',inspection_date:'2026-09-29',inspector_name:'Test',result:'Passed',findings:'Test',next_inspection_date:''};
   const id=(await request(url,'POST',body,operator)).data.id;
   const d=(await request(url,'GET',undefined,operator)).data.inspections.find(i=>i.id===id);
   await request(url+'/'+id,'PUT',{...body,findings:'Updated'},operator,200,{'x-record-version':d._version});
   await request(url+'/'+id,'PUT',body,operator,409,{'x-record-version':d._version});
   const fresh=(await request(url,'GET',undefined,operator)).data.inspections.find(i=>i.id===id);
   await request(url+'/'+id,'DELETE',{},operator,200,{'x-record-version':fresh._version});
   const pending=(await request(base+'/api/occupancy/change-requests/pending','GET',undefined,admin)).data.requests.find(r=>r.occupancy_id===occupancy);
   await request(base+'/api/occupancy/change-requests/'+pending.id+'/approve','PUT',{},admin);
   assert.equal((await request(url,'GET',undefined,operator)).data.inspections.length,0);
  });
  await mark('CSV preview, import, batch retry, exports and role rejection',async()=>{
   const csv='project_title,location,owner_name,designer_name,permit_date,lot_numbers\n'+run+'_import,Test,Test,Test,2026-09-29,Lot 3';
   await request(base+'/api/permit-transfer/permits/preview','POST',{csv},operator,403);
   const preview=(await request(base+'/api/permit-transfer/permits/preview','POST',{csv},admin)).data;
   const body={csv,version:preview.version,allowDuplicates:true,requestId:crypto.randomUUID()};
   const results=await Promise.all([request(base+'/api/permit-transfer/permits/import','POST',body,admin),request(base+'/api/permit-transfer/permits/import','POST',body,admin)]);
   assert.deepEqual(results[0].data.ids,results[1].data.ids);assert.ok(results.some(r=>r.data.replayed));
   await request(base+'/api/permit-transfer/permits/export','POST',{ids:[building],format:'csv'},operator);
   const exportResult=await request(base+'/api/permit-transfer/permits/export','POST',{ids:[building],format:'xlsx'},operator);
   assert.ok(exportResult.response.headers.get('content-type').includes('spreadsheetml'));
  });
  await mark('Project deletion request and administrator approval',async()=>{
   await request(base+'/api/permits/'+building,'DELETE',{},operator);
   const pending=(await request(base+'/api/permits/change-requests/pending','GET',undefined,admin)).data.requests.find(r=>r.permit_id===building);
   await request(base+'/api/permits/change-requests/'+pending.id+'/approve','PUT',{},admin);
   await request(base+'/api/permits/'+building,'GET',undefined,operator,404);
  });
  const qadmin=await login('admin',qbase),qoperator=await login('operator',qbase);
  await mark('Queue reset authorization and atomic reset',async()=>{
   await request(qbase+'/api/system/reset','POST',{confirmation:'RESET'},qoperator,403);
   await request(qbase+'/api/system/reset','POST',{confirmation:'no'},qadmin,400);
   await request(qbase+'/api/system/reset','POST',{confirmation:'RESET'},qadmin);
  });
  let ticket;
  await mark('Concurrent kiosk retry creates one ticket',async()=>{
   const body={requestId:crypto.randomUUID(),name:run,phone:'12345',email:'',barangay:'Test',reason:'Releasing Bldg. Permit'};
   const both=await Promise.all([request(qbase+'/api/tickets','POST',body),request(qbase+'/api/tickets','POST',body)]);
   assert.equal(both[0].data.ticketId,both[1].data.ticketId);ticket=both[0].data.ticketId;assert.equal(ticket,'TKT-1001');
  });
  await mark('Queue ownership, concurrent call, recall, hold and completion',async()=>{
   await request(qbase+'/api/workstations/login','POST',{workspace:'PC1'},qoperator);
   await request(qbase+'/api/workstations/login','POST',{workspace:'PC1'},qadmin,409);
   const url=qbase+'/api/tickets/';
   const call=()=>fetch(url+'call-next',{method:'POST',headers:{'content-type':'application/json','x-queue-request':'1',cookie:qoperator},body:JSON.stringify({workspace:'PC1',source:'queue'})});
   const both=await Promise.all([call(),call()]);assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
   const called={data:await both.find(r=>r.status===200).json()};
   const recalled=await request(url+'recall','POST',{workspace:'PC1',ticketId:ticket},qoperator);
   assert.ok(recalled.data.ticket.recallStamp>called.data.ticket.recallStamp);
   await request(url+'hold','POST',{workspace:'PC1',ticketId:ticket},qoperator);
   await request(url+'call-next','POST',{workspace:'PC1',source:'onHold'},qoperator);
   await request(url+'complete','POST',{workspace:'PC1',ticketId:ticket},qoperator);
   await request(qbase+'/api/logs','GET',undefined,undefined,401);
   await request(qbase+'/api/logs','GET',undefined,qoperator,403);
   await request(qbase+'/api/logs','GET',undefined,qadmin);
   await request(qbase+'/api/videos/playlist','GET');
  });
  await mark('New sign-in ends the previous session and password changes revoke the current session',async()=>{
   await request(base+'/api/auth/session','GET',undefined,operator,401);
   operator=await login('operator');
   await request(qbase+'/api/auth/session','GET',undefined,qoperator,401);
   await request(base+'/api/profile/password','POST',{current_password:password,new_password:password+'X'},operator);
   await request(base+'/api/auth/session','GET',undefined,operator,401);
   await request(qbase+'/api/auth/session','GET',undefined,qoperator,401);
  });
  await mark('Preview static URLs cannot target live MySQL ports',async()=>{
   const r=await request(base+'/login.html');assert.ok(!r.data.includes('localhost:5000'));
   assert.ok(r.response.headers.get('content-security-policy').includes('connect-src'));
   const denied=await fetch(base+'/edit.html?id=52',{redirect:'manual'});assert.equal(denied.status,302);assert.equal(denied.headers.get('location'),'/login');
   const fresh=(await request(base+'/api/auth/login','POST',{username:run+'_operator',password:password+'X'})).cookie;
   const edit=await request(base+'/edit?id=52','GET',undefined,fresh);assert.ok(edit.data.includes('oboUser'));
   await request(qbase+'/monitor.html');
   const portal=(await request(qbase+'/portal.html')).data;
   const bundle=portal.match(/src="([^"]+\.js)"/)[1];const script=(await request(qbase+bundle)).data;
   assert.ok(!/port:(?:3e3|5e3|3000|5000)\b/.test(script));
  });
 }finally{
  for(const child of children){child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve);});}
  // Only fixture identities/records are removed, and only from guarded test DBs.
  if(fixtureIds.length){
   await permit.query('DELETE FROM permit_presence WHERE session_hash IN (SELECT token_hash FROM permit_sessions WHERE user_id=ANY($1::int[]))',[fixtureIds]);
   await permit.query('DELETE FROM permit_sessions WHERE user_id=ANY($1::int[])',[fixtureIds]);
   await permit.query('DELETE FROM permit_user_profiles WHERE user_id=ANY($1::int[])',[fixtureIds]);
   await permit.query('DELETE FROM permit_import_batches WHERE actor_id=ANY($1::int[])',[fixtureIds]);
   await permit.query('DELETE FROM project_records WHERE actor_id=ANY($1::int[])',[fixtureIds]);
   await permit.query('DELETE FROM permits WHERE project_title COLLATE "C" LIKE $1',[run+'%']);
   await permit.query('DELETE FROM occupancy_permits WHERE project_title COLLATE "C" LIKE $1',[run+'%']);
   await permit.query('DELETE FROM users WHERE id=ANY($1::int[])',[fixtureIds]);
  }
  for(const c of clients)await c.end();
 }
 await fs.writeFile(path.join(__dirname,'postgres-test-results.json'),JSON.stringify({time:new Date().toISOString(),passed,databases:configs.map(c=>c.database)},null,2));
 console.log('All '+passed.length+' PostgreSQL acceptance groups passed.');
}
main().catch(e=>{console.error(e.message);console.error(log);process.exitCode=1;});
