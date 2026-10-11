const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const createStorage=require('./video-storage');
const root=path.resolve(__dirname,'../../.feature-backups/video-storage-tests');
const cloud={QUEUE_VIDEO_STORAGE:'cloudinary',CLOUDINARY_CLOUD_NAME:'fixture',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'};
const url='https://res.cloudinary.com/fixture/video/upload/v1/ojt-queue-videos/clip.mp4';

async function fixture(t) {
 await fs.mkdir(root,{recursive:true});
 const directory=await fs.mkdtemp(path.join(root,'case-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const file={filename:'clip.mp4',originalname:'Test video.mp4',path:path.join(directory,'clip.mp4')};
 await fs.writeFile(file.path,'fake video');
 const rows=[],db={async query(sql,args){
  if(sql.startsWith('INSERT')){rows.push({id:rows.length+1,filename:args[0],filepath:args[1],is_active:1,sort_order:args[2]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT COALESCE(MAX'))return [[{last_order:Math.max(0,...rows.map(row=>Number(row.sort_order)||0))}]];
  return [rows];
 }};
 db.getConnection=async()=>({dialect:'postgres',query:db.query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
 return {directory,file,db,rows};
}
test('cloud playlist survives a new storage instance after temporary files are removed',async t=>{
 const {directory,file,db}=await fixture(t);let options;
 const sdk={uploader:{async upload(source,config){assert.equal(source,file.path);options=config;return {secure_url:url,public_id:'ojt-queue-videos/clip'};}}};
 await createStorage(db,directory,cloud,sdk).save(file);
 assert.equal(options.resource_type,'video');assert.equal(options.overwrite,false);assert.equal(options.api_secret,'test-secret');
 await assert.rejects(()=>fs.stat(file.path),{code:'ENOENT'});
 const afterRestart=createStorage(db,directory,cloud,sdk);
 assert.deepEqual(await afterRestart.playlist(),[url]);
});
test('failed database save removes the new cloud asset and temporary file',async t=>{
 const {directory,file}=await fixture(t);let removed;
 const sdk={uploader:{async upload(){return {secure_url:url,public_id:'ojt-queue-videos/clip'};},async destroy(id){removed=id;}}};
 const db={async getConnection(){throw Error('test database unavailable');}};
 await assert.rejects(()=>createStorage(db,directory,cloud,sdk).save(file),/test database unavailable/);
 assert.equal(removed,'ojt-queue-videos/clip');await assert.rejects(()=>fs.stat(file.path),{code:'ENOENT'});
});
test('local storage still retains playable files and filters missing or unsafe playlist references',async t=>{
 const {directory,file,db,rows}=await fixture(t);
 const storage=createStorage(db,directory,{});await storage.save(file);
 rows.push({filepath:'uploads/missing.mp4'},{filepath:'uploads/../private'},{filepath:'https://attacker.invalid/clip.mp4'},
  {filepath:'https://res.cloudinary.com@attacker.invalid/fixture/video/upload/clip.mp4'},
  {filepath:'https://res.cloudinary.com/fixture/image/upload/clip.mp4'});
 assert.deepEqual(await storage.playlist(),['/uploads/clip.mp4']);assert.equal((await fs.stat(file.path)).isFile(),true);
});
test('cloud upload errors clean temporary files and do not downgrade to ephemeral storage',async t=>{
 const {directory,file,db,rows}=await fixture(t);
 const sdk={uploader:{async upload(){throw Error('test provider unavailable');}}};
 await assert.rejects(()=>createStorage(db,directory,cloud,sdk).save(file),/test provider unavailable/);
 assert.equal(rows.length,0);await assert.rejects(()=>fs.stat(file.path),{code:'ENOENT'});
 assert.throws(()=>createStorage(db,directory,{QUEUE_VIDEO_STORAGE:'cloudinary'}),/requires CLOUDINARY/);
});

test('local playlist finds original videos when PostgreSQL uploads use another directory',async t=>{
 const {directory,db,rows}=await fixture(t);
 const original=path.join(directory,'original');await fs.mkdir(original);
 await fs.writeFile(path.join(original,'old.mp4'),'original office video');
 rows.push({filepath:'uploads/old.mp4'},{filepath:'uploads/missing.mp4'},{filepath:'uploads/../secret.mp4'});
 const current=path.join(directory,'postgres');await fs.mkdir(current);
 assert.deepEqual(await createStorage(db,current,{},undefined,[original]).playlist(),['/uploads/old.mp4']);
 assert.equal(await fs.readFile(path.join(original,'old.mp4'),'utf8'),'original office video');
 assert.equal((await fs.readdir(current)).length,0,'Reading old media must not copy or change files');
});
