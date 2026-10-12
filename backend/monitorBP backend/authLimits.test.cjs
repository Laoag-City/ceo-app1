const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const createLimits=require('./authLimits');
const policy=require('./passwordPolicy');
function request(middleware, username='one', ip='127.0.0.1', status=401) {
 const res=new EventEmitter();res.statusCode=status;res.headers={};
 res.set=(k,v)=>{res.headers[k]=v;return res};res.status=n=>{res.statusCode=n;return res};res.json=b=>{res.body=b;return res};
 let allowed=false;
 middleware({body:{username},socket:{remoteAddress:ip},headers:{'x-forwarded-for':Math.random().toString()}},res,()=>{allowed=true;res.emit('finish')});
 return {allowed,res};
}
test('login cooldown, normalized names, peer isolation, untrusted forwarding, expiry',()=>{
 let time=0;const limits=createLimits({now:()=>time});
 for(let i=0;i<10;i++)assert.ok(request(limits.login).allowed);
 const blocked=request(limits.login,' ONE ');assert.equal(blocked.res.statusCode,429);assert.equal(blocked.res.headers['Retry-After'],'900');
 assert.ok(request(limits.login,'two').allowed);assert.ok(request(limits.login,'one','127.0.0.2').allowed);
 time=900000;assert.ok(request(limits.login).allowed);
});
test('successful login clears account bucket, but IP cap remains',()=>{
 const limits=createLimits();
 for(let i=0;i<100;i++)assert.ok(request(limits.login,'one','ip',200).allowed);
 assert.equal(request(limits.login,'two','ip').res.statusCode,429);
});
test('registration counts all attempts, expires after an hour; storage is bounded',()=>{
 let time=0;const limits=createLimits({now:()=>time});
 for(let i=0;i<10;i++)assert.ok(request(limits.register,String(i),'ip',200).allowed);
 assert.equal(request(limits.register,'new','ip').res.headers['Retry-After'],'3600');
 time=3600000;assert.ok(request(limits.register,'new','ip').allowed);
 const bounded=createLimits({maxEntries:2});assert.ok(request(bounded.login).allowed);
 assert.equal(request(bounded.login,'two').res.statusCode,429);
});
test('password policy rejects malformed, short and over-72-byte values',()=>{
 for(const value of [null,123456,{},'12345','é'.repeat(37),'a'.repeat(73)])assert.ok(policy(value));
 for(const value of ['123456','a'.repeat(72),'é'.repeat(36)])assert.equal(policy(value),null);
});
test('HTTP auth rejects bad registration before SQL and hashes valid six-character password',async()=>{
 const express=require('express'),bcrypt=require('bcryptjs');let inserts=0,queries=0,issues=0;
 const hash=await bcrypt.hash('old',4);
 const db={query(sql,args,cb){queries++;if(sql.startsWith('INSERT')){inserts++;assert.notEqual(args[1],'123456');bcrypt.compare('123456',args[1]).then(ok=>{assert.ok(ok);cb(null,{})});}
 else cb(null,sql.includes('password, role')&&args[0]==='existing'?[{id:1,username:'existing',password:hash,role:'operator',is_active:1,is_verified:1}]:[]);}};
 const sessions={requireUser:(req,res,next)=>next(),requireRoles:()=>(req,res,next)=>next(),issue:async()=>{issues++}};
 const app=express();app.use(express.json());app.use(require('./authServer')(db,sessions));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {
 const post=(route,body)=>fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const password of ['12345','é'.repeat(37),{},123456])assert.equal((await post('/register',{username:'new',password})).status,400);
 assert.equal(queries,0);
 assert.equal((await post('/register',{username:'new',password:'123456'})).status,200);assert.equal(inserts,1);
 assert.equal((await post('/login',{username:'existing',password:'old'})).status,200);assert.equal(issues,1);
 for(let i=0;i<10;i++)assert.equal((await post('/login',{username:'missing',password:'wrong'})).status,401);
 const before=queries;const response=await post('/login',{username:'missing',password:'wrong'});assert.equal(response.status,429);assert.ok(response.headers.get('retry-after'));assert.equal(queries,before);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('failed passwords do not reveal pending accounts; approval still gates valid credentials',async()=>{
 const express=require('express'),bcrypt=require('bcryptjs');
 const hash=await bcrypt.hash('correct-password',4);let issues=0,queries=0;
 const users={
  active:{id:1,username:'active',password:hash,role:'operator',is_active:1,is_verified:1},
  pending:{id:2,username:'pending',password:hash,role:'operator',is_active:0,is_verified:0},
  inactive:{id:3,username:'inactive',password:hash,role:'operator',is_active:0,is_verified:1},
  broken:{id:4,username:'broken',password:'',role:'operator',is_active:1,is_verified:1}
 };
 const db={query(sql,args,cb){queries++;if(args[0]==='db-error')return cb(Error('Private database detail'));
  cb(null,users[args[0]]?[users[args[0]]]:[]);}};
 const sessions={requireUser:(req,res,next)=>next(),requireRoles:()=>(req,res,next)=>next(),issue:async()=>{issues++}};
 const app=express();app.use(express.json());app.use(require('./authServer')(db,sessions));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const post=(username,password)=>fetch('http://127.0.0.1:'+server.address().port+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 try {
  for(const username of ['missing','active','pending','inactive']) {
   const response=await post(username,'wrong-password');
   assert.equal(response.status,401);
   assert.deepEqual(await response.json(),{success:false,message:'Invalid username or password.'});
   assert.equal(response.headers.get('set-cookie'),null);
  }
  assert.equal(issues,0);
  for(const username of ['missing','broken']) {
   const response=await post(username,'office-unassigned-account');assert.equal(response.status,401);
   assert.equal(response.headers.get('set-cookie'),null);assert.equal(issues,0);
  }
  const pending=await post('pending','correct-password');assert.equal(pending.status,403);
  assert.match((await pending.json()).message,/pending approval/);assert.equal(issues,0);
  const inactive=await post('inactive','correct-password');assert.equal(inactive.status,403);
  assert.match((await inactive.json()).message,/inactive/);assert.equal(issues,0);
  assert.equal((await post('active','correct-password')).status,200);assert.equal(issues,1);
  const before=queries;assert.equal((await post('missing','a'.repeat(73))).status,400);assert.equal(queries,before);
  const failure=await post('db-error','wrong-password');assert.equal(failure.status,503);
  assert.doesNotMatch(JSON.stringify(await failure.json()),/Private database detail/);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
