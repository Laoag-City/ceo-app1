const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const {createPermitSessions}=require('../monitorBP backend/permitSessions');
const createQueueAuth=require('./queue-auth');
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
test('real HTTP session checks protect queue ownership, roles, expiry, logout and CSRF',async()=>{
 const tokens=['a','b','c','d'].map(c=>c.repeat(64)),users=new Map(tokens.map((token,i)=>[hash(token),{id:i+1,username:'fixture'+i,role:['operator','operator','admin','superadmin'][i],created_at:new Date(),expires_at:new Date(Date.now()+1800000)}]));
 const db={promise:()=>({query:async(sql,args)=>{if(sql.startsWith('DELETE')){users.delete(args[0]);return [{affectedRows:1}]}return [users.has(args[0])?[users.get(args[0])]:[]]}})};
 const sessions=createPermitSessions(db,{cookieName:'queue_session'}),auth=createQueueAuth(sessions,async h=>users.has(h));
 const app=express();app.use(express.json());app.use(sessions.resolve);
 app.post('/claim',auth.protectWrite,sessions.requireRoles('operator','admin','superadmin'),auth.claim);
 app.post('/release',auth.protectWrite,auth.requireWindow,auth.release);
 app.post('/reset',auth.protectWrite,sessions.requireRoles('admin','superadmin'),(req,res)=>{auth.clear();res.json({success:true})});
 app.post('/logout',auth.protectWrite,async(req,res)=>{await sessions.logout(req,res);res.json({success:true})});
 for(const action of ['call-next','next','resume','recall','hold','complete','unhold','drop'])app.post('/'+action,auth.protectWrite,auth.requireWindow,(req,res)=>res.json({workspace:req.queueWorkspace,reasons:req.queueReasons}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,index,body={workspace:'PC1'},extra={})=>fetch(origin+route,{method:'POST',headers:{origin,'Content-Type':'application/json','x-queue-request':'1',...(index===null?{}:{cookie:'queue_session='+tokens[index]}),...extra},body:JSON.stringify(body)});
 try{
 for(const action of ['claim','reset','call-next','next','resume','recall','hold','complete','drop','unhold'])assert.equal((await post('/'+action,null,undefined,{'x-user-role':'superadmin','x-user-id':'3'})).status,401);
 assert.equal((await post('/claim',0,undefined,{origin:'https://attacker.invalid'})).status,403);assert.equal((await post('/claim',0,undefined,{'x-queue-request':''})).status,403);
 assert.equal((await post('/claim',0,{workspace:'Monitor'})).status,400);
 assert.equal((await post('/claim',0)).status,200);assert.equal((await post('/claim',0)).status,200);assert.equal((await post('/claim',1)).status,409);
 assert.equal((await post('/claim',1,{workspace:'PC2'})).status,200);
 for(const action of ['call-next','next','resume','recall','hold','complete','drop','unhold']){
  const response=await post('/'+action,0);assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{workspace:'PC1',reasons:['Receiving Bldg. Permit','Receiving Bldg. Occupancy','Inquire']});
  assert.equal((await post('/'+action,1,{workspace:'PC1',role:'superadmin'})).status,409);
 }
 assert.deepEqual(await (await post('/next',1,{workspace:'PC2'})).json(),{workspace:'PC2',reasons:['Releasing Bldg. Occupancy']});
 assert.equal((await post('/claim',2,{workspace:'PC3'})).status,200);
 assert.deepEqual(await (await post('/next',2,{workspace:'PC3'})).json(),{workspace:'PC3',reasons:['Releasing Bldg. Permit']});
 assert.equal((await post('/release',1)).status,409);assert.equal((await post('/reset',0,{confirmation:'RESET',role:'superadmin'})).status,403);
 users.get(hash(tokens[2])).role='operator';assert.equal((await post('/reset',2)).status,403);users.get(hash(tokens[2])).role='admin';
 assert.equal((await post('/reset',2)).status,200);assert.equal((await post('/call-next',0)).status,409);
 assert.equal((await post('/claim',0)).status,200);assert.equal((await post('/logout',0)).status,200);assert.equal((await post('/hold',0)).status,401);
 assert.equal((await post('/claim',1)).status,200);users.delete(hash(tokens[1]));assert.equal((await post('/hold',1)).status,401);assert.equal((await post('/claim',3)).status,200);
 const permitCookie=await post('/claim',null,undefined,{cookie:'permit_session='+tokens[3]});assert.equal(permitCookie.status,401);
 }finally{await new Promise(r=>server.close(r))}
});
test('production routes wire authorization before mutations and constrain ticket reasons',()=>{
 const source=fs.readFileSync(path.join(__dirname,'queueServer.js'),'utf8');
 assert.ok(source.includes("app.post('/api/tickets/' + action, queueAuth.protectWrite, queueAuth.requireWindow"));
 assert.ok(source.includes("for (const action of ['call-next', 'next', 'resume', 'drop', 'recall', 'hold', 'complete'])"));
 assert.ok(source.includes("app.post('/api/tickets/unhold', queueAuth.protectWrite, queueAuth.requireWindow"));
 assert.ok(source.includes("app.post('/api/system/reset', queueAuth.protectWrite, sessions.requireRoles('admin','superadmin')"));
 assert.ok(source.includes('workspace:req.queueWorkspace'));
 assert.ok(source.includes('registerVideoPlaylist(app, {storage:videoStorage, sessions, protectWrite:queueAuth.protectWrite'));
 const media=fs.readFileSync(path.join(__dirname,'video-playlist.js'),'utf8');
 assert.ok(media.includes("sessions.requireRoles('operator', 'admin', 'superadmin')"));
 assert.ok(media.includes("app.post('/api/videos/upload', noStore, protectWrite, staff, receiveVideo"));
 assert.ok(source.includes("app.get('/api/logs', sessions.requireRoles('admin','superadmin')"));
 const service=fs.readFileSync(path.join(__dirname,'queue-service.js'),'utf8');
 assert.ok((service.match(/reason IN \(\?\)/g)||[]).length>=3);
});

test('Render HTTPS origin is accepted behind its HTTP proxy and other origins are rejected',()=>{
 const before=process.env.RENDER_EXTERNAL_URL,custom=process.env.QUEUE_PUBLIC_ORIGIN;
 process.env.RENDER_EXTERNAL_URL='https://queue.onrender.com';delete process.env.QUEUE_PUBLIC_ORIGIN;
 try {
  const auth=createQueueAuth({},()=>true);
  function check(origin) {
   let status=200,passed=false;
   const headers={origin,host:'queue.onrender.com','x-queue-request':'1'};
   auth.protectWrite({protocol:'http',get:key=>headers[key]}, {status(value){status=value;return this;},json(){}},()=>{passed=true;});
   return {status,passed};
  }
  assert.deepEqual(check('https://queue.onrender.com'),{status:200,passed:true});
  assert.deepEqual(check('http://queue.onrender.com'),{status:403,passed:false});
  assert.deepEqual(check('https://attacker.invalid'),{status:403,passed:false});
 } finally {
  if(before===undefined)delete process.env.RENDER_EXTERNAL_URL;else process.env.RENDER_EXTERNAL_URL=before;
  if(custom===undefined)delete process.env.QUEUE_PUBLIC_ORIGIN;else process.env.QUEUE_PUBLIC_ORIGIN=custom;
 }
});

test('queue login uses its HttpOnly cookie and replaces prior account sessions',async()=>{
 const queries=[],cookies=[];const db={promise:()=>({query:async(sql,args)=>{queries.push({sql,args});return [sql.startsWith('SELECT')?[{id:1}]:{affectedRows:1}]},
 beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{}})};
 const sessions=createPermitSessions(db,{cookieName:'queue_session'});
 const res={cookie:(...args)=>cookies.push(args),clearCookie:(...args)=>cookies.push(args)};
 await sessions.issue({headers:{cookie:'permit_session='+'a'.repeat(64)}},res,{id:1,password:'hash',role:'operator'});
 assert.deepEqual(queries.find(q=>q.sql.startsWith('DELETE FROM permit_sessions')).args,[1]);assert.equal(cookies[0][0],'queue_session');assert.equal(cookies[0][2].httpOnly,true);assert.equal(cookies[0][2].sameSite,'strict');assert.equal(cookies[0][1].length,64);
 await sessions.logout({headers:{cookie:'queue_session='+cookies[0][1]}},res);assert.equal(cookies[1][0],'queue_session');assert.equal(queries.at(-1).args[0],hash(cookies[0][1]));
});
