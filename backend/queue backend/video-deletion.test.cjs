const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const createStorage=require('./video-storage');
const cloud={QUEUE_VIDEO_STORAGE:'cloudinary',CLOUDINARY_CLOUD_NAME:'fixture',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'};
const url='https://res.cloudinary.com/fixture/video/upload/v123/folder/office.clip.mp4';
async function fixture(t,reference='uploads/clip.mp4'){
 const root=path.resolve(__dirname,'../../.feature-backups/video-storage-tests');await fs.mkdir(root,{recursive:true});
 const directory=await fs.mkdtemp(path.join(root,'delete-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const rows=[{id:1,filename:'Test clip.mp4',filepath:reference,is_active:1,sort_order:1}];
 const query=async(sql,args)=>{
  if(sql.includes('pg_advisory_xact_lock'))return [[]];
  if(sql.startsWith('SELECT COUNT'))return [[{reference_count:rows.filter(row=>row.filepath===args[0]).length}]];
  if(sql.startsWith('SELECT'))return [rows.filter(row=>!sql.includes('WHERE id = ?')||row.id===args[0]).map(row=>({...row}))];
  if(sql.startsWith('DELETE')){const index=rows.findIndex(row=>row.id===args[0]);rows.splice(index,1);return [{affectedRows:1}];}
  throw Error('Unexpected SQL: '+sql);
 };
 const db={query,getConnection:async()=>({dialect:'postgres',query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 return {directory,db,rows};
}
test('deleting a local clip removes only the selected file, and missing files are safe',async t=>{
 const {directory,db,rows}=await fixture(t);await fs.writeFile(path.join(directory,'clip.mp4'),'fixture');await fs.writeFile(path.join(directory,'other.mp4'),'keep');
 const storage=createStorage(db,directory,{});assert.deepEqual(await storage.remove(1),{name:'Test clip.mp4',cleanupPending:false});
 await assert.rejects(fs.stat(path.join(directory,'clip.mp4')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(directory,'other.mp4'),'utf8'),'keep');assert.equal(rows.length,0);
 rows.push({id:2,filename:'Missing.mp4',filepath:'uploads/missing.mp4'});assert.equal((await storage.remove(2)).cleanupPending,false);
});
test('shared files remain until their last playlist entry is deleted, including original upload folders',async t=>{
 const {directory,db,rows}=await fixture(t);const original=path.join(directory,'original');await fs.mkdir(original);await fs.writeFile(path.join(original,'clip.mp4'),'fixture');
 rows.push({...rows[0],id:2});const storage=createStorage(db,directory,{},undefined,[original]);
 await storage.remove(1);assert.equal((await fs.stat(path.join(original,'clip.mp4'))).isFile(),true);
 await storage.remove(2);await assert.rejects(fs.stat(path.join(original,'clip.mp4')),{code:'ENOENT'});
});
test('owned Cloudinary clips use the full public ID and invalidate cached video delivery',async t=>{
 const {directory,db,rows}=await fixture(t,url);let call;
 const sdk={uploader:{async destroy(...args){call=args;return {result:'ok'};}}};
 assert.equal((await createStorage(db,directory,cloud,sdk).remove(1)).cleanupPending,false);
 assert.equal(call[0],'folder/office.clip');assert.equal(call[1].resource_type,'video');assert.equal(call[1].invalidate,true);assert.equal(rows.length,0);
});
test('provider failure is a saved removal with an explicit cleanup warning, and foreign or unsafe assets are never destroyed',async t=>{
 const {directory,db,rows}=await fixture(t,url);let calls=0;
 const sdk={uploader:{async destroy(){calls++;throw Error('Provider unavailable');}}};
 assert.deepEqual(await createStorage(db,directory,cloud,sdk).remove(1),{name:'Test clip.mp4',cleanupPending:true});assert.equal(calls,1);assert.equal(rows.length,0);
 for(const reference of [url.replace('/fixture/','/another-cloud/'),'uploads/../private.mp4',url.replace('/v123/','/w_400,c_fill/v123/')]){
  rows.push({id:1,filename:'Unsafe.mp4',filepath:reference});assert.equal((await createStorage(db,directory,cloud,sdk).remove(1)).cleanupPending,true);
 }
 assert.equal(calls,1);assert.equal(createStorage.cloudVideoId(url,'fixture'),'folder/office.clip');
});
test('database failure does not delete a stored file',async t=>{
 const {directory}=await fixture(t);const file=path.join(directory,'clip.mp4');await fs.writeFile(file,'keep');
 const storage=createStorage({getConnection:async()=>{throw Error('Database unavailable');}},directory,{});
 await assert.rejects(storage.remove(1),/Database unavailable/);assert.equal(await fs.readFile(file,'utf8'),'keep');
});
