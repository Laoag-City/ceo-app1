const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const realRequire=createRequire(path.join(__dirname,'queueServer.js'));

test('queue entry point serves cloud health, same-origin assets and authenticated durable video uploads',async t=>{
 const root=path.resolve(__dirname,'../../.feature-backups/queue-cloud-smoke');await fs.mkdir(root,{recursive:true});
 const directory=await fs.mkdtemp(path.join(root,'case-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const token='c'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
 const videos=[],uploads=[],sent=[];let role='admin';
 const pool={dialect:'postgres',async end(){},async query(sql,args=[]){
  if(sql.includes('FROM permit_sessions s'))return [args[0]===hash?[{id:1,username:'fixture-admin',role}]:[]];
  if(sql.startsWith('SELECT filepath FROM videos'))return [videos];
  if(sql.startsWith('SELECT COALESCE(MAX(sort_order)'))return [[{last_order:videos.length}]];
  if(sql.startsWith('INSERT INTO videos')){videos.push({filepath:args[1],sort_order:args[2],is_active:1});return [{affectedRows:1}];}
  return [[]];
 }};
 pool.getConnection=async()=>({dialect:'postgres',query:pool.query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
 const url='https://res.cloudinary.com/fixture/video/upload/v1/ojt-queue-videos/clip.mp4';
 const sdk={uploader:{async upload(file,options){uploads.push({file,options});return {secure_url:url,public_id:'ojt-queue-videos/clip'};}}};
 const env={PORT:'0',QUEUE_PORT:'5000',OFFICE_BIND_HOST:'127.0.0.1',RENDER_EXTERNAL_URL:'https://queue.onrender.com',
  PERMIT_PUBLIC_ORIGIN:'https://ojt-permit-management.onrender.com',QUEUE_VIDEO_STORAGE:'cloudinary',
  CLOUDINARY_CLOUD_NAME:'fixture',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'};
 let server;
 class SocketHub {constructor(){this.sockets={sockets:new Map()};}on(){}emit(event,data){sent.push({event,data});}}
 const context={__dirname,console:{log(){},error(){}},process:{env,exitCode:0},Buffer,setTimeout,clearTimeout,
  require(name){
   if(name==='http')return {createServer(app){server=http.createServer(app);return server;}};
   if(name==='socket.io')return {Server:SocketHub};
   if(name==='node:os')return {tmpdir:()=>directory};
   if(name==='../database')return {createPool:()=>pool,dialect:'postgres'};
   if(name==='../office-services')return (app,current)=>realRequire(name)(app,current,env);
   if(name==='./video-storage')return (db,dir)=>realRequire(name)(db,dir,env,sdk);
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
 assert.ok(!config.includes('test-secret'));
 const portal=await(await fetch(base+'/portal.html')).text();
 const settingsScript=portal.match(/src="([^"]*office-services\.js)"/)[1];
 assert.equal(await(await fetch(base+settingsScript)).text(),config);
 for(const page of ['/monitor.html','/kiosk.html','/secret-management.html']){
  const html=await(await fetch(base+page)).text();assert.ok(!html.includes('http://localhost:5000'));
 }
 async function upload(cookie,size=5,name='clip.mp4',type='video/mp4') {
  const body=new FormData();body.append('videoFile',new Blob([Buffer.alloc(size)],{type}),name);
  return fetch(base+'/api/videos/upload',{method:'POST',headers:{'x-queue-request':'1',...(cookie?{cookie}:{})},body});
 }
 assert.equal((await upload()).status,401);assert.equal(uploads.length,0);
 role='operator';assert.equal((await upload('queue_session='+token)).status,200);assert.equal(uploads.length,1);
 role='admin';assert.equal((await upload('queue_session='+token,5,'bad.txt','text/plain')).status,400);
 const saved=await upload('queue_session='+token);assert.equal(saved.status,200);
 assert.equal((await saved.json()).playlist[0],url);assert.equal(uploads.length,2);
 await assert.rejects(()=>fs.stat(uploads[0].file),{code:'ENOENT'});
 assert.equal(uploads[0].options.resource_type,'video');
 assert.equal(sent.find(item=>item.event==='playlistUpdate').data.playlist[0],url);
 const playlist=await fetch(base+'/api/videos/playlist');assert.deepEqual((await playlist.json()).playlist,[url,url]);
 assert.equal((await fetch(base+'/api/logs')).status,401);
});
