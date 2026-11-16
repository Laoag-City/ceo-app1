const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../monitorBP backend/projectRecords');
const auditNames=require('../monitorBP backend/auditNames');
module.exports=function register(open){
 async function fixture(t){
  const db=await open();t.after(()=>db.end());
  const tables={
   users:'id INT PRIMARY KEY,username VARCHAR(50),role VARCHAR(20),is_active INT,is_verified INT',
   permit_user_profiles:'user_id INT PRIMARY KEY,display_name VARCHAR(80)',
   permits:'id INT PRIMARY KEY,project_title VARCHAR(100)',occupancy_permits:'id INT PRIMARY KEY,project_title VARCHAR(100)',
   project_records:'id BIGSERIAL PRIMARY KEY,kind VARCHAR(16),project_id INT,project_title VARCHAR(255),actor_id INT,actor_name VARCHAR(100),actor_role VARCHAR(20),category VARCHAR(16),outcome VARCHAR(20),message TEXT,details TEXT,request_key VARCHAR(100) UNIQUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
  };
  for(const [table,columns]of Object.entries(tables))await db.query('CREATE TEMP TABLE '+table+' ('+columns+')');
  await db.query("INSERT INTO users VALUES (1,'account14','operator',1,1),(2,'gab','admin',1,1),(3,'fallback','operator',1,1)");
  await db.query("INSERT INTO permit_user_profiles VALUES (1,?),(2,'Gabriel Santos'),(3,'   ')",["  Edward O'Brien <Engineer>  "]);
  for(const table of ['permits','occupancy_permits'])await db.query("INSERT INTO "+table+" VALUES (10,'Sample project')");
  const query=async(sql,args=[])=>(await db.query(sql,args))[0];
  const records=create({promise:()=>db}),routes={};
  records.routes({
   get:(path,handler)=>routes.get=handler,
   post:(path,handler)=>routes.post=handler,
   delete:(path,handler)=>routes.delete=handler
  });
  function response(){let done;const completed=new Promise(resolve=>done=resolve);return {locals:{},statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;done();return this},completed}}
  const request=(kind='permits',user=1)=>({user:{id:user,role:'operator'},params:{kind,id:'10'},query:{},body:{message:'Test remark',requestId:'11111111-1111-4111-8111-111111111111'}});
  return {db,query,records,routes,response,request};
 }
 for(const kind of ['permits','occupancy'])test(kind+': new logs save profile names and legacy logs display current names without rewriting originals',async t=>{
  const f=await fixture(t);
  const req=f.request(kind),posted=f.response();await f.routes.post(req,posted);assert.equal(posted.body.success,true);
  assert.equal((await f.query('SELECT actor_name FROM project_records'))[0].actor_name,"Edward O'Brien <Engineer>");
  const action=f.request(kind);Object.assign(action,{method:'POST',path:'/api/'+kind,body:{project_title:'Sample project'}});
  const saved=f.response();await f.records.audit(action,saved,()=>{saved.locals.projectRecordId=10;saved.json({success:true})});await saved.completed;
  await f.query("INSERT INTO project_records (kind,project_id,project_title,actor_id,actor_name,actor_role,category,outcome,message) VALUES (?,10,'Sample project',1,'account14','operator','activity','saved','Legacy update')",[kind]);
  await f.query("UPDATE permit_user_profiles SET display_name='Updated Display Name' WHERE user_id=1");
  const feed=f.response();await f.routes.get(f.request(kind),feed);
  assert.equal(feed.body.records.length,3);assert.ok(feed.body.records.every(row=>row.actor_name==='Updated Display Name'));
  assert.equal((await f.query("SELECT actor_name FROM project_records WHERE message='Legacy update'"))[0].actor_name,'account14');
  await f.query('DELETE FROM permit_user_profiles WHERE user_id=1');
  const noProfile=f.response();await f.routes.get(f.request(kind),noProfile);assert.ok(noProfile.body.records.length===3);
  assert.equal(noProfile.body.records.find(row=>row.category==='comment').actor_name,"Edward O'Brien <Engineer>",'Stored display name survives profile removal');
 });
 test('reviewer name resolution handles IDs, usernames, missing/blank profiles and deleted accounts',async t=>{
  const f=await fixture(t),resolve=await auditNames(f.query,['1','gab','fallback','deleted-user',' 2 ']);
  assert.equal(resolve('1'),"Edward O'Brien <Engineer>");assert.equal(resolve('gab'),'Gabriel Santos');
  assert.equal(resolve('fallback'),'fallback');assert.equal(resolve('deleted-user'),'deleted-user');
  assert.equal(resolve('Old reviewer',2),'Gabriel Santos');assert.equal(resolve(' 2 '),'Gabriel Santos');
  const missing=f.response();await f.routes.post(f.request('permits',3),missing);assert.equal(missing.body.success,true);
  assert.equal((await f.query('SELECT actor_name FROM project_records'))[0].actor_name,'fallback');
 });
};
