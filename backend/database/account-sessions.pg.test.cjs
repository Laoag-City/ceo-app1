// Exercises real PostgreSQL row locks through the production database adapter.
// Fixtures live in a fresh schema inside permit_system_test, never the live DB.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const pg=require('pg');
const express=require('../monitorBP backend/node_modules/express');
const bcrypt=require('../monitorBP backend/node_modules/bcryptjs');
const {createPermitSessions}=require('../monitorBP backend/permitSessions');

test('one account has one active session across devices and both applications',async t=>{
 const configs=JSON.parse(process.env.OFFICE_PG_CONNECTIONS || '[]');
 const config=configs.find(item=>item.source==='permit_system');
 assert.equal(config?.database,'permit_system_test','Requires the isolated test database');
 const schema='session_verify_'+crypto.randomBytes(8).toString('hex');
 assert.match(schema,/^session_verify_[a-f0-9]{16}$/);
 const owner=new pg.Client(config);await owner.connect();
 const pools=[];let server;
 try {
  await owner.query('CREATE SCHEMA '+schema);
  await owner.query(`CREATE TABLE ${schema}.users (
   id INT PRIMARY KEY,username VARCHAR(50),password VARCHAR(255),role VARCHAR(20),is_active INT,is_verified INT)`);
  await owner.query(`CREATE TABLE ${schema}.permit_sessions (
   token_hash CHAR(64) PRIMARY KEY,user_id INT,expires_at TIMESTAMP NOT NULL,created_at TIMESTAMP DEFAULT clock_timestamp())`);
  await owner.query(`CREATE TABLE ${schema}.permit_session_replacements (token_hash CHAR(64) PRIMARY KEY,expires_at TIMESTAMP NOT NULL)`);
  const password='isolated-session-fixture',verified=await bcrypt.hash(password,4);
  await owner.query(`INSERT INTO ${schema}.users VALUES (1,'one',$1,'operator',1,1),(2,'other',$1,'admin',1,1)`,[verified]);
  const RealPool=pg.Pool;
  pg.Pool=class extends RealPool {constructor(options){super({...options,options:options.options+' -c search_path='+schema});}};
  try {
   const database=require('./index');
   for(let i=0;i<2;i++)pools.push(database.createPool({database:'permit_system'}));
  } finally {pg.Pool=RealPool;}
  const adapters=pools.map(pool=>({promise:()=>pool,query(sql,args,callback){
   if(typeof args==='function'){callback=args;args=[];}pool.query(sql,args).then(([rows])=>callback(null,rows),callback);
  }}));
  const sessions=adapters.map((db,index)=>createPermitSessions(db,{cookieName:index?'queue_session':'permit_session'}));
  const app=express();app.use(express.json());
  for(let index=0;index<2;index++) {
   const prefix=index?'/queue':'/permit';
   app.use(prefix,sessions[index].resolve,require('../monitorBP backend/authServer')(adapters[index],sessions[index]));
  }
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  async function request(system,path,cookie='',body) {
   return fetch(origin+'/'+system+path,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  async function login(system='permit',username='one',secret=password) {
   const response=await request(system,'/login','',{username,password:secret});assert.equal(response.status,200);
   return response.headers.get('set-cookie').split(';')[0];
  }
  const valid=async(system,cookie)=>(await request(system,'/session',cookie)).status;
  const other=await login('permit','other');
  let current;
  await t.test('new login ends the other device while unrelated accounts stay signed in',async()=>{
   const first=await login();current=await login();
   assert.equal(await valid('permit',first),401);assert.equal(await valid('permit',current),200);
   const notice=await (await request('permit','/session',first)).json();
   assert.equal(notice.code,'SESSION_REPLACED');assert.match(notice.message,/signed in somewhere else/);
   assert.equal(notice.user,undefined);
   assert.equal(await valid('permit',other),200);
  });
  await t.test('Queue sign-in ends Permit sign-in for the same account, including socket ownership checks',async()=>{
   const old=current;current=await login('queue');
   assert.equal(await valid('permit',old),401);assert.equal(await valid('queue',current),200);
   assert.equal((await (await request('permit','/session',old)).json()).code,'SESSION_REPLACED');
   const oldHash=crypto.createHash('sha256').update(old.split('=')[1]).digest('hex');
   assert.equal(await sessions[1].isActiveSession(oldHash),false);
   assert.equal(await valid('permit',other),200);
  });
  await t.test('ten simultaneous logins across independent pools leave exactly one usable session',async()=>{
   const attempts=await Promise.all(Array.from({length:10},async(_,index)=>({system:index%2?'queue':'permit',cookie:await login(index%2?'queue':'permit')})));
   const statuses=await Promise.all(attempts.map(attempt=>valid(attempt.system,attempt.cookie)));
   assert.equal(statuses.filter(status=>status===200).length,1);
   assert.equal(statuses.filter(status=>status===401).length,9);
   const winner=attempts[statuses.indexOf(200)];current=winner;
   const rows=await owner.query(`SELECT COUNT(*)::int AS total FROM ${schema}.permit_sessions WHERE user_id=1`);
   assert.equal(rows.rows[0].total,1);assert.equal(await valid('permit',other),200);
  });
  await t.test('wrong passwords, stale credentials and failed inserts preserve the valid session',async()=>{
   assert.equal((await request('permit','/login','',{username:'one',password:'wrong'})).status,401);
   await assert.rejects(sessions[0].issue({headers:{}},{cookie(){assert.fail('Must not issue a stale login cookie');}},
    {id:1,password:'outdated hash',role:'operator'}),{code:'ACCOUNT_CHANGED'});
   const failed=createPermitSessions(adapters[0],{openConnection:async()=>{
    const connection=await pools[0].getConnection();
    return {...connection,query(sql,args){if(sql.startsWith('INSERT INTO permit_sessions'))throw Error('Simulated insert failure');return connection.query(sql,args);}};
   }});
   await assert.rejects(failed.issue({headers:{}},{cookie(){assert.fail('Failed save must not set a cookie');}},
    {id:1,password:verified,role:'operator'}),/Simulated insert failure/);
   assert.equal(await valid(current.system,current.cookie),200);
   const currentHash=crypto.createHash('sha256').update(current.cookie.split('=')[1]).digest('hex');
   assert.equal((await owner.query(`SELECT * FROM ${schema}.permit_session_replacements WHERE token_hash=$1`,[currentHash])).rowCount,0);
   assert.equal(await valid('permit',other),200);
  });
  await t.test('logging out a displaced device cannot end the replacement session',async()=>{
   const old=current;const replacement=await login('permit');
   assert.equal((await request(old.system,'/logout',old.cookie,{})).status,200);
   assert.equal(await valid('permit',replacement),200);
   assert.equal((await request('permit','/logout',replacement,{})).status,200);
   assert.equal(await valid('permit',replacement),401);
   assert.equal((await (await request('permit','/session',replacement)).json()).code,undefined);
   assert.equal(await valid('permit',other),200);
  });
  await t.test('natural expiry and forged tokens do not report another sign-in',async()=>{
   const expiring=await login();
   await owner.query(`UPDATE ${schema}.permit_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=1`);
   for(const cookie of [expiring,'permit_session='+'f'.repeat(64),'']) {
    const response=await request('permit','/session',cookie);assert.equal(response.status,401);
    assert.equal((await response.json()).code,undefined);
   }
   const resumed=await login();assert.equal(await valid('permit',resumed),200);
  });
  await t.test('only one pre-existing legacy session is accepted before its next sign-in',async()=>{
   const older='a'.repeat(64),latest='b'.repeat(64);
   const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
   await owner.query(`INSERT INTO ${schema}.permit_sessions VALUES ($1,1,NOW()+INTERVAL '1 hour',NOW()-INTERVAL '1 minute'),($2,1,NOW()+INTERVAL '1 hour',NOW())`,[hash(older),hash(latest)]);
   assert.equal(await valid('permit','permit_session='+older),401);
   assert.equal(await valid('queue','queue_session='+latest),200);
  });
 } finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const pool of pools)await pool.end();
  await owner.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await owner.end();
 }
});
