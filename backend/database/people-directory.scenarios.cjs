// Run the actual directory handler against connection-local tables only.
const {test}=require('node:test'),assert=require('node:assert/strict');
module.exports=function register(open,dialect){
 test('People: exact admin exclusion survives search, pagination and profile changes',async t=>{
  const db=await open();t.after(()=>db.end());
  const tables={
   users:'id INTEGER PRIMARY KEY,username VARCHAR(50),role VARCHAR(20),is_active INTEGER,is_verified INTEGER',
   permit_user_profiles:"user_id INTEGER PRIMARY KEY,display_name VARCHAR(80),bio VARCHAR(300) DEFAULT '',avatar_color VARCHAR(16) DEFAULT 'blue'",
   permit_sessions:'token_hash VARCHAR(64),user_id INTEGER,expires_at TIMESTAMP',
   permit_presence:'session_hash VARCHAR(64),last_seen TIMESTAMP,last_active TIMESTAMP',
   permit_people_settings:'setting_key VARCHAR(50) PRIMARY KEY,user_id INTEGER'
  };
  for(const [table,columns] of Object.entries(tables))await db.query(`CREATE ${dialect==='postgres'?'TEMP':'TEMPORARY'} TABLE ${table} (${columns})`);
  await db.query("INSERT INTO users VALUES (1,'admin','admin',1,1),(2,'Admin','admin',1,1),(3,'admin-assistant','operator',1,1),(4,'boss','admin',1,1),(5,'engineer','operator',1,1),(6,'superadmin','superadmin',1,1)");
  await db.query("INSERT INTO permit_user_profiles (user_id,display_name) VALUES (1,'A hidden boss'),(5,'admin')");
  await db.query("INSERT INTO permit_people_settings VALUES ('hidden_account',6)");
  if(dialect==='postgres'){
   await db.query('GRANT SELECT,INSERT,UPDATE ON TABLE '+Object.keys(tables).map(table=>'pg_temp.'+table).join(',')+' TO permit_app_migration');
   await db.query('SET ROLE permit_app_migration');
  }
  const people=require('../monitorBP backend/peopleProfiles')({promise:()=>db},{requireUser:(req,res,next)=>next()},async()=>db);
  async function route(path,query={},user=4){
   const handler=people.router.stack.find(layer=>layer.route?.path===path&&layer.route.methods.get).route.stack[0].handle;
   const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
   await handler({query,user:{id:user,role:'admin'}},res);assert.equal(res.code,200);return res.body;
  }
  let result=await route('/people');assert.deepEqual(result.people.map(person=>person.id).sort((a,b)=>a-b),[2,3,4,5]);
  assert.deepEqual((await route('/people',{q:'admin'})).people.map(person=>person.id).sort((a,b)=>a-b),[2,3,5]);
  assert.equal((await route('/people',{q:'A hidden boss'})).people.length,0);
  assert.equal((await route('/profile',{},1)).profile.username,'admin');
  await db.query("UPDATE permit_user_profiles SET display_name='Renamed boss' WHERE user_id=1");
  assert.equal((await route('/people',{q:'Renamed boss'})).people.length,0);
  for(let id=10;id<=40;id++)await db.query('INSERT INTO users VALUES (?, ?, ?, 1, 1)',[id,'paged-'+id,'operator']);
  const first=await route('/people'),second=await route('/people',{page:2});
  assert.equal(first.people.length,30);assert.equal(first.hasMore,true);assert.equal(second.people.length,5);assert.equal(second.hasMore,false);
  const ids=[...first.people,...second.people].map(person=>person.id);
  assert.equal(new Set(ids).size,35);assert.ok(!ids.includes(1));assert.ok(!ids.includes(6));
  assert.equal((await db.query('SELECT id FROM users WHERE id=1 AND is_active=1 AND is_verified=1'))[0].length,1);
 });
};
