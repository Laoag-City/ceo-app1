const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const realRequire=createRequire(path.join(__dirname,'queueServer.js'));

test('queue entry point serves cloud health and same-origin queue pages after retiring the playlist',async t=>{
 const token='c'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
 const createdAt=new Date();
 const expiresAt=new Date(createdAt.getTime()+30*60*1000);
 const role='operator';
 const pool={dialect:'postgres',async end(){},async query(sql,args=[]){
  if(sql.includes('FROM permit_sessions s'))return [args[0]===hash?[{id:1,username:'fixture-admin',role,created_at:createdAt,expires_at:expiresAt}]:[]];
  assert.doesNotMatch(sql,/\bvideos\b/i,'Runtime must not require the old videos table.');
  return [[]];
 }};
 pool.getConnection=async()=>({dialect:'postgres',query:pool.query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
 const env={PORT:'0',QUEUE_PORT:'5000',OFFICE_BIND_HOST:'127.0.0.1',RENDER_EXTERNAL_URL:'https://queue.onrender.com',
  PERMIT_PUBLIC_ORIGIN:'https://ojt-permit-management.onrender.com',QUEUE_VIDEO_STORAGE:'cloudinary'};
 let server;
 class SocketHub {on(){}}
 const context={__dirname,console:{log(){},error(){}},process:{env,exitCode:0},Buffer,setTimeout,clearTimeout,
  require(name){
   if(name==='http')return {createServer(app){server=http.createServer(app);return server;}};
   if(name==='socket.io')return {Server:SocketHub};
   if(name==='../database')return {createPool:()=>pool,dialect:'postgres'};
   if(name==='../office-services')return (app,current)=>realRequire(name)(app,current,env);
   if(name==='./queue-service')return {createQueueService:()=>async()=>{},ensureQueueSchema:async()=>{}};
   if(name==='./ticket-submission')return {createTicketSubmission:()=>({initialize:async()=>{}})};
   if(name==='./client-history')return {...realRequire(name),ensureClientHistorySchema:async()=>{}};
   return realRequire(name);
  }};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'queueServer.js'),'utf8'),context);
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const health=await fetch(base+'/api/health');assert.deepEqual(await health.json(),{success:true});
 assert.equal(health.headers.get('access-control-allow-origin'),'*');
 const config=await (await fetch(base+'/office-services.js')).text();
 assert.match(config,/https:\/\/queue.onrender.com/);assert.match(config,/https:\/\/ojt-permit-management.onrender.com/);
 const portal=await(await fetch(base+'/portal.html')).text();
 const settingsScript=portal.match(/src="([^"]*office-services\.js)"/)[1];
 assert.equal(await(await fetch(base+settingsScript)).text(),config);
 const headers={cookie:'queue_session='+token,'x-queue-request':'1'};
 for(const page of ['/monitor.html','/kiosk.html','/workstations.html','/reports.html','/client-history.html']){
  const response=await fetch(base+page,{headers,redirect:'manual'});
  assert.equal(response.status,200,page);
  assert.ok(!(await response.text()).includes('http://localhost:5000'),page);
 }
 const bookmark=await fetch(base+'/secret-management.html',{redirect:'manual'});
 assert.equal(bookmark.status,302);
 assert.equal(bookmark.headers.get('location'),'/workstations.html');
 for(const [method,route] of [['GET','playlist'],['GET','manage'],['POST','upload'],['POST','1/active'],['POST','1/move'],['DELETE','1']]){
  assert.equal((await fetch(base+'/api/videos/'+route,{method,headers})).status,404,route);
 }
 assert.equal((await fetch(base+'/api/reports',{headers})).status,200);
 assert.equal((await fetch(base+'/api/reports')).status,401);
 assert.equal((await fetch(base+'/api/logs')).status,401);
});
