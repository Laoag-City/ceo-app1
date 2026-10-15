const {test}=require('node:test'),assert=require('node:assert/strict'),history=require('../monitorBP backend/adminHistory');
module.exports=function register(open,dialect){
 async function fixture(t,seed){
  const db=await open();t.after(()=>db.end());
  const tables={users:'id INTEGER PRIMARY KEY,username VARCHAR(50)',permit_user_profiles:'user_id INTEGER PRIMARY KEY,display_name VARCHAR(80)',permits:'id INTEGER PRIMARY KEY,project_title VARCHAR(255)',occupancy_permits:'id INTEGER PRIMARY KEY,project_title VARCHAR(255)',
   permit_change_requests:'id INTEGER PRIMARY KEY,permit_id INTEGER,requested_by INTEGER,status VARCHAR(30),change_type VARCHAR(50),created_at TIMESTAMP NULL,changes JSON,remarks TEXT,reviewed_by VARCHAR(50),reviewed_at TIMESTAMP NULL',
   occupancy_change_requests:'id INTEGER PRIMARY KEY,occupancy_id INTEGER,requested_by INTEGER,status VARCHAR(30),change_type VARCHAR(50),created_at TIMESTAMP NULL,changes JSON,remarks TEXT,reviewed_by VARCHAR(50),reviewed_at TIMESTAMP NULL',
   project_records:'id INTEGER PRIMARY KEY,kind VARCHAR(16),project_id INTEGER,project_title VARCHAR(255),outcome VARCHAR(20),category VARCHAR(16),message TEXT,actor_name VARCHAR(100),created_at TIMESTAMP,details TEXT,actor_id INTEGER DEFAULT 1',
   permit_final_reviews:'id INTEGER PRIMARY KEY,kind VARCHAR(16),project_id INTEGER,decision VARCHAR(16),reviewer_name VARCHAR(100),created_at TIMESTAMP,remarks TEXT,snapshot JSON,reviewer_id INTEGER DEFAULT 2'};
  for(const [table,columns] of Object.entries(tables))await db.query(`CREATE ${dialect==='postgres'?'TEMP':'TEMPORARY'} TABLE ${table} (${columns.replace(/\bTIMESTAMP\b/g,'TIMESTAMP(6)')})`);
  await db.query("INSERT INTO users VALUES (1,'operator'),(2,'boss')");await db.query("INSERT INTO permits VALUES (10,'Building <Cruz>'),(20,'Deleted later')");await db.query("INSERT INTO occupancy_permits VALUES (10,'Occupancy')");
  await db.query("INSERT INTO permit_user_profiles VALUES (1,'Operator Display Name'),(2,'Admin Display Name')");
  const change={_before:{matrix:[{id:50,discipline_name:'Electrical',signature_status:'Pending'}]},updatedMatrixRows:[{id:50,signature_status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02'}]};
  await db.query("INSERT INTO permit_change_requests VALUES (1,10,1,'approved','matrix_update','2026-01-02 12:00:00',?,'Reviewed','boss','2026-01-03 12:00:00')",[JSON.stringify(change)]);
  await db.query("INSERT INTO occupancy_change_requests VALUES (1,10,1,'rejected','matrix_update','2026-01-02 12:00:00',?,'Revise','boss','2026-01-03 12:00:00')",[JSON.stringify(change)]);
  await db.query("INSERT INTO project_records (id,kind,project_id,project_title,outcome,category,message,actor_name,created_at,details) VALUES (1,'permits',10,'Building <Cruz>','saved','activity','Updated routing matrix','operator','2026-01-02 12:00:00',?),(2,'permits',20,'Deleted later','saved','activity','Approved project deletion','boss','2026-01-01 12:00:00',''),(3,'occupancy',10,'Occupancy','failed','activity','Failed save','operator','2026-01-05 12:00:00','')",[JSON.stringify({version:1,changes:[{field:'Electrical · Remarks',before:'',after:'Bring revised plans'}]})]);
  await db.query('UPDATE project_records SET actor_id=2 WHERE id=2');
  const snapshot={matrix:[{id:50,discipline_name:'Electrical',engineer_name:'Stored engineer',signature_status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02',feedback_remarks:'Original review'}],reviewed_engineers:[{station_id:50,display_name:'Historical display name'}]};
  await db.query("INSERT INTO permit_final_reviews (id,kind,project_id,decision,reviewer_name,created_at,remarks,snapshot) VALUES (1,'permits',10,'approved','boss','2026-01-03 12:00:00','Final approval',?)",[JSON.stringify(snapshot)]);
  await db.query('DELETE FROM permits WHERE id=20');
  if(seed)await seed(db);
  if(dialect==='postgres'){await db.query('GRANT SELECT ON TABLE '+Object.keys(tables).map(table=>'pg_temp.'+table).join(',')+' TO permit_app_migration');await db.query('SET ROLE permit_app_migration');}
  const query=async(sql,args=[]) => (await db.query(sql,args))[0];return {db,query};
 }
 test('admin history includes reviewed requests, station changes, final snapshots and deleted-project audit entries',async t=>{
  const {query}=await fixture(t),result=await history(query);
  assert.equal(result.records.length,5);assert.equal(result.next,null);
  const review=result.records.find(row=>row.source==='final_review');assert.equal(review.details.stations[0].engineer,'Historical display name');assert.equal(review.details.stations[0].date_approved,'2026-01-02');
  const request=result.records.find(row=>row.source==='request'&&row.kind==='permits');assert.equal(request.status,'approved');assert.equal(request.reviewed_by,'Admin Display Name');assert.ok(request.details.changes.some(change=>change.field==='Electrical · Status'&&change.before==='Pending'&&change.after==='Approved'));
  assert.equal(request.actor_name,'Operator Display Name');assert.equal(review.actor_name,'Admin Display Name');
  assert.equal(result.records.find(row=>row.source==='activity'&&row.project_id===10).actor_name,'Operator Display Name');
  assert.equal((await query('SELECT actor_name FROM project_records WHERE id=1'))[0].actor_name,'operator','Existing audit snapshots must not be rewritten');
  const deleted=result.records.find(row=>row.project_id===20);assert.equal(deleted.project_title,'Deleted later');assert.equal(deleted.message,'Approved project deletion');
  assert.ok(!result.records.some(row=>row.message==='Failed save'));
 });
 test('admin history pagination has stable ties, filters, literal search and read-only access',async t=>{
  const {query}=await fixture(t);let next=null,records=[];
  do{const page=await history(query,next?{before:next}:{},2);records.push(...page.records);next=page.next;}while(next);
  assert.equal(records.length,5);assert.equal(new Set(records.map(row=>row.source+row.kind+row.id)).size,5);
  assert.deepEqual((await history(query,{kind:'occupancy',source:'request'})).records.map(row=>row.status),['rejected']);
  assert.equal((await history(query,{q:'deleted later'})).records.length,1);assert.equal((await history(query,{q:'%'})).records.length,0);assert.equal((await history(query,{q:"x'); DELETE FROM permits; --"})).records.length,0);
  for(const input of [{kind:'users'},{source:'secret'},{before:'invalid'},{q:'x'.repeat(101)}])await assert.rejects(history(query,input),{status:400});
 assert.equal((await query('SELECT id FROM permits'))[0].id,10);
 });
 test('history reaches beyond one page and preserves timestamp precision and legacy submissions',async t=>{
  const {query}=await fixture(t,async db=>{
   for(let id=10;id<40;id++)await db.query("INSERT INTO project_records (id,kind,project_id,project_title,outcome,category,message,actor_name,created_at,details) VALUES (?,'occupancy',10,'Occupancy','saved','comment','Older remark','operator','2026-01-06 12:00:00','')",[id]);
   for(const [id,time] of [[40,'2026-01-07 12:00:00.123456'],[41,'2026-01-07 12:00:00.123455']])await db.query("INSERT INTO project_records (id,kind,project_id,project_title,outcome,category,message,actor_name,created_at,details) VALUES (?,'occupancy',10,'Occupancy','saved','activity','Precise timestamp','operator',?,'')",[id,time]);
   await db.query("INSERT INTO permit_change_requests VALUES (2,10,1,'approved','matrix_update','2026-01-04 12:00:00',?,'Old submission','boss','2026-01-05 12:00:00')",[JSON.stringify({updatedMatrixRows:[null,{id:50,signature_status:'Approved',feedback_remarks:'Older remarks'}]})]);
  });
  const first=await history(query,{},1),second=await history(query,{before:first.next},1);
  assert.equal(Number(first.records[0].id),40);assert.equal(Number(second.records[0].id),41);
  let page=await history(query),all=[...page.records];assert.equal(page.records.length,25);assert.ok(page.next);
  while(page.next){page=await history(query,{before:page.next});all.push(...page.records)}
  assert.equal(all.length,38);assert.equal(new Set(all.map(row=>row.source+row.kind+row.id)).size,38);
  const legacy=all.find(row=>row.source==='request'&&row.kind==='permits'&&Number(row.id)===2);assert.match(legacy.details.text,/Older remarks/);
 });
};
