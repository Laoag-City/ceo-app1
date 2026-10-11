const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const createStorage=require('./video-storage');
const {registerVideoPlaylist,ensureVideoSchema}=require('./video-playlist');
const express=require('express');
const remote=name=>'https://res.cloudinary.com/fixture/video/upload/v1/'+name+'.mp4';

function database(initial=[]) {
 let rows=initial.map(row=>({...row})), tail=Promise.resolve();
 async function run(sql,args=[]) {
  if(sql.startsWith('SELECT COALESCE(MAX'))return [[{last_order:Math.max(0,...rows.map(row=>Number(row.sort_order)||0))}]];
  if(sql.startsWith('SELECT')){
   let selected=rows.slice().sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id);
   if(sql.includes('WHERE is_active = 1'))selected=selected.filter(row=>row.is_active===1);
   if(sql.includes('WHERE id = ?'))selected=selected.filter(row=>row.id===args[0]);
   return [selected.map(row=>({...row}))];
  }
  if(sql.startsWith('INSERT INTO videos')) {rows.push({id:Math.max(0,...rows.map(row=>row.id))+1,filename:args[0],filepath:args[1],is_active:1,sort_order:args[2]});return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE videos SET is_active'))rows.find(row=>row.id===args[1]).is_active=args[0];
  else if(sql.startsWith('UPDATE videos SET sort_order'))rows.find(row=>row.id===args[1]).sort_order=args[0];
  else throw Error('Unexpected fixture SQL: '+sql);
  return [{affectedRows:1}];
 }
 const db={dialect:'postgres',query:run,get rows(){return rows;}};
 db.getConnection=async()=>{
  let unlock, snapshot;
  const conn={dialect:'postgres',beginTransaction:async()=>{},async commit(){unlock?.();unlock=null;},async rollback(){if(snapshot)rows=snapshot;unlock?.();unlock=null;},release(){}};
  conn.query=async(sql,args)=>{
   if(sql.includes('pg_advisory_xact_lock')){const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;snapshot=rows.map(row=>({...row}));return [[]];}
   return run(sql,args);
  };
  return conn;
 };
 return db;
}
const clips=[{id:1,filename:'One.mp4',filepath:remote('one'),sort_order:10,is_active:1,uploaded_at:new Date('2026-10-01T02:00:00Z')},
 {id:2,filename:'Two.mp4',filepath:remote('two'),sort_order:20,is_active:0},
 {id:3,filename:'Three.mp4',filepath:remote('three'),sort_order:30,is_active:1}];

test('disabled clips remain manageable and keep their chosen order across storage instances',async()=>{
 const db=database(clips),storage=createStorage(db,'.',{});
 assert.deepEqual(await storage.playlist(),[remote('one'),remote('three')]);
 assert.equal((await storage.list())[1].active,false);
 await storage.move(2,'up');await storage.setActive(2,true);
 assert.deepEqual(await createStorage(db,'.',{}).playlist(),[remote('two'),remote('one'),remote('three')]);
 assert.deepEqual(db.rows.slice().sort((a,b)=>a.sort_order-b.sort_order).map(row=>row.id),[2,1,3]);
 assert.deepEqual(await storage.move(2,'up'),{name:'Two.mp4',changed:false});
 await assert.rejects(()=>storage.setActive(999,true),{status:404});
});

test('parallel uploads append after every existing clip with distinct positions',async t=>{
 const root=path.resolve(__dirname,'../../.feature-backups/video-storage-tests');await fs.mkdir(root,{recursive:true});
 const directory=await fs.mkdtemp(path.join(root,'append-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const db=database(clips),storage=createStorage(db,directory,{});
 const files=await Promise.all(['four.mp4','five.mp4'].map(async filename=>{const file={filename,originalname:filename,path:path.join(directory,filename)};await fs.writeFile(file.path,'fixture');return file;}));
 await Promise.all(files.map(file=>storage.save(file)));
 assert.deepEqual(db.rows.slice(3).map(row=>row.sort_order).sort(),[31,32]);
 assert.deepEqual((await storage.list()).slice(3).map(row=>row.name),['four.mp4','five.mp4']);
});

test('management exposes unavailable clips while the public playlist skips unsafe references',async()=>{
 const db=database([...clips,{id:4,filename:'Unavailable.mp4',filepath:'uploads/missing.mp4',is_active:1,sort_order:40},
  {id:5,filename:'Unsafe.mp4',filepath:'https://attacker.invalid/video.mp4',is_active:1,sort_order:50}]);
 const storage=createStorage(db,'.',{}),list=await storage.list();
 assert.equal(list[3].available,false);assert.equal(list[3].url,null);
 assert.equal(list[4].available,false);assert.deepEqual(await storage.playlist(),[remote('one'),remote('three')]);
 assert.equal(Object.hasOwn(list[0],'filepath'),false);
});

test('PostgreSQL schema validation does not perform runtime migrations',async()=>{
 const calls=[];await ensureVideoSchema({dialect:'postgres',async query(sql){calls.push(sql);return [[]];}});
 assert.equal(calls.length,1);assert.match(calls[0],/^SELECT.+sort_order.+LIMIT 0$/);
});

test('all staff roles can manage videos, public clients cannot mutate, and logs use display names',async t=>{
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{if(req.headers['x-role'])req.user={username:'operator-login',role:req.headers['x-role'],id:1};next();});
 const db=database(clips),storage=createStorage(db,'.',{}),logs=[],events=[];
 const sessions={requireRoles(...roles){return(req,res,next)=>{if(!req.user)return res.status(401).json({success:false});if(!roles.includes(req.user.role))return res.status(403).json({success:false});next();};}};
 registerVideoPlaylist(app,{storage,sessions,protectWrite:(req,res,next)=>req.headers['x-queue-request']==='1'?next():res.status(403).json({success:false}),receiveVideo:(req,res,next)=>next(),
  writeLog:async(...args)=>logs.push(args),io:{emit:(...args)=>events.push(args)},displayName:async()=> 'Engineer Gabriel'});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(suffix,role,body)=>fetch(base+'/api/videos/'+suffix,{method:body?'POST':'GET',headers:{...(role?{'x-role':role}:{}),...(body?{'x-queue-request':'1','Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('manage')).status,401);
 assert.equal((await request('1/active',null,{active:false})).status,401);
 assert.equal((await request('1/active','visitor',{active:false})).status,403);
 for(const role of ['operator','admin','superadmin'])assert.equal((await request('manage',role)).status,200);
 const managed=await request('manage','operator');assert.equal((await managed.json()).user.displayName,'Engineer Gabriel');assert.equal(managed.headers.get('cache-control'),'no-store');
 assert.equal((await request('2/active','operator',{active:true})).status,200);
 assert.equal(logs.at(-1)[0],'Engineer Gabriel');assert.equal(logs.at(-1)[1],'VIDEO_ENABLE');
 assert.deepEqual(events.at(-1),['playlistUpdate',{playlist:[remote('one'),remote('two'),remote('three')]}]);
 assert.equal((await request('3/move','operator',{direction:'up'})).status,200);
 assert.deepEqual((await(await request('playlist')).json()).playlist,[remote('one'),remote('three'),remote('two')]);
 const before=logs.length;
 for(const [suffix,body] of [['3/move',{direction:'sideways'}],['0/active',{active:true}],['2/active',{active:'true'}],['2/active',{active:true,role:'admin'}]])assert.equal((await request(suffix,'operator',body)).status,400);
 assert.equal(logs.length,before);assert.equal((await request('999/active','operator',{active:true})).status,404);
 assert.equal((await request('1/move','operator',{direction:'up'})).status,200);assert.equal(logs.length,before);
});

function handlers(options) {
 const routes=new Map(),app={get(route,...chain){routes.set(route,chain.at(-1));},post(route,...chain){routes.set(route,chain.at(-1));}};
 registerVideoPlaylist(app,{sessions:{requireRoles:()=>()=>{}},protectWrite(){},receiveVideo(){},writeLog:async()=>{},io:{emit(){}},...options});
 return async(route,req)=>{
  let body,status=200;
  const res={json(value){body=value;return res;},status(value){status=value;return res;}};
  await routes.get(route)({params:{id:'1'},user:{username:'fixture-operator',role:'operator'},...req},res);
  return {status,body};
 };
}

test('delayed playlist checks cannot broadcast an older enabled clip after a later disable',async()=>{
 let active=true,reads=0,releaseFirst,firstStarted,disableSaved;
 const blocked=new Promise(resolve=>{releaseFirst=resolve;});
 const started=new Promise(resolve=>{firstStarted=resolve;});
 const disabled=new Promise(resolve=>{disableSaved=resolve;});
 const events=[];
 const storage={async setActive(id,value){active=value;if(!value)disableSaved();return 'One.mp4';},async playlist(){
  const snapshot=active?[remote('one')]:[];
  if(++reads===1){firstStarted();await blocked;}
  return snapshot;
 }};
 const invoke=handlers({storage,io:{emit:(event,payload)=>events.push(payload.playlist)}});
 const first=invoke('/api/videos/:id/active',{body:{active:true}});
 await started;
 const second=invoke('/api/videos/:id/active',{body:{active:false}});
 await disabled;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(active,false,'The later disable is already saved while the earlier file check waits');
 assert.equal(reads,1,'The later announcement waits for the entire earlier read and emit');
 releaseFirst();
 assert.deepEqual((await Promise.all([first,second])).map(result=>result.status),[200,200]);
 assert.deepEqual(events,[[remote('one')],[]]);
 assert.deepEqual(events.at(-1),await storage.playlist());
});

test('long profile names and maximum usernames fit the audit station field without losing actor identity',async()=>{
 const actors=[{username:'profile-user',display_name:'Gabriel '.repeat(9)+'GabrielX'},
  {username:'u'.repeat(100)},
  {username:'unicode-profile',display_name:'A'.repeat(49)+'🙂'+'B'.repeat(29)}];
 const logs=[];
 const storage={async setActive(){return 'One.mp4';},async move(){return {name:'One.mp4',changed:true};},async save(){},async playlist(){return [];}};
 const invoke=handlers({storage,writeLog:async(...entry)=>{assert.ok(Array.from(entry[0]).length<=50);logs.push(entry);}});
 for(const user of actors) {
  const fullName=(user.display_name||user.username).trim();
  const start=logs.length;
  for(const [route,request] of [['/api/videos/:id/active',{body:{active:false}}],['/api/videos/:id/move',{body:{direction:'up'}}],['/api/videos/upload',{file:{originalname:'One.mp4'}}]]) {
   assert.equal((await invoke(route,{...request,user})).status,200);
  }
  for(const [station,action,details] of logs.slice(start)) {
   assert.equal(station,Array.from(fullName).slice(0,50).join(''));
   assert.ok(details.includes('Staff member: '+fullName+'. '));
   assert.ok(['VIDEO_DISABLE','VIDEO_REORDER','VIDEO_UPLOAD'].includes(action));
  }
 }
});
