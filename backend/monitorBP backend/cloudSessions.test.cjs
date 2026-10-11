const test=require('node:test'),assert=require('node:assert/strict');
const {createPermitSessions}=require('./permitSessions');
const db={promise:()=>({query:async sql=>[sql.startsWith('SELECT')?[{id:1}]:{affectedRows:1}],
 beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{}})};
function withEnvironment(values,run){
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 for(const [key,value] of Object.entries(values)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
 return Promise.resolve().then(run).finally(()=>{
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 });
}
function write(sessions,origin){
 let allowed=false,status,body;
 const headers={'origin':origin,'x-permit-request':'1','host':'internal:10000'};
 sessions.protectWrites({method:'PUT',protocol:'http',get:key=>headers[key]},
  {status(value){status=value;return this;},json(value){body=value;}},()=>{allowed=true;});
 return {allowed,status,body};
}
test('Render HTTPS origin permits legitimate writes despite its internal HTTP proxy',()=>withEnvironment({
 PERMIT_PUBLIC_ORIGIN:undefined,RENDER_EXTERNAL_URL:'https://permits-test.onrender.com'
},()=>{
 const sessions=createPermitSessions(db);
 assert.equal(write(sessions,'https://permits-test.onrender.com').allowed,true);
 assert.equal(write(sessions,'https://other.onrender.com').status,403);
 assert.equal(write(sessions,'http://internal:10000').status,403);
}));
test('explicit custom domain takes precedence over the Render service URL',()=>withEnvironment({
 PERMIT_PUBLIC_ORIGIN:'https://permits.example.test',RENDER_EXTERNAL_URL:'https://permits-test.onrender.com'
},()=>{
 const sessions=createPermitSessions(db);
 assert.equal(write(sessions,'https://permits.example.test').allowed,true);
 assert.equal(write(sessions,'https://permits-test.onrender.com').status,403);
}));
test('local writes still use the request origin without cloud configuration',()=>withEnvironment({
 PERMIT_PUBLIC_ORIGIN:undefined,RENDER_EXTERNAL_URL:undefined
},()=>{
 assert.equal(write(createPermitSessions(db),'http://internal:10000').allowed,true);
}));
test('cloud session cookies are secure, HttpOnly and scoped to the service',()=>withEnvironment({
 PERMIT_COOKIE_SECURE:'true'
},async()=>{
 let cookie;
 await createPermitSessions(db).issue({headers:{}},{cookie(name,value,options){cookie={name,value,options};}},
  {id:1,password:'test-only',role:'operator'});
 assert.equal(cookie.options.secure,true);
 assert.equal(cookie.options.httpOnly,true);
 assert.equal(cookie.options.sameSite,'strict');
 assert.equal(cookie.options.path,'/');
 assert.equal(cookie.options.domain,undefined);
}));
