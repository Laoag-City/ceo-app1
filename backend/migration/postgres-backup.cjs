/** PostgreSQL logical backup/recovery for the current two migration databases.
 * Exported snapshots bind pg_dump and row checksums to the same data. No backup
 * can overwrite a database: restore creates unique, isolated names. Drill restores
 * run as disposable NOSUPERUSER roles and only resources created here are removed.
 * Confidential dump/media files live outside the workspace, protected by Windows ACL.
 */
const fs=require('node:fs/promises'),nativeFs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {Client}=require('pg');
const databases=['permit_system_migration','queue_system_migration'];
const idPattern=/^pg-office-\d{14}-[a-f0-9]{12}$/;
const root=path.resolve(process.env.OFFICE_BACKUP_ROOT||path.join(process.env.USERPROFILE,'PermitManagementPostgresBackups'));
const project=path.resolve(__dirname,'../..');
const password=process.env.OFFICE_BACKUP_PASSWORD;delete process.env.OFFICE_BACKUP_PASSWORD;
const config={host:'localhost',port:5432,user:'postgres',password};
const bin='C:/Program Files/PostgreSQL/18/bin';
const q=n=>'"'+String(n).replace(/"/g,'""')+'"';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function fileHash(file){const h=crypto.createHash('sha256');for await(const chunk of nativeFs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function json(file,value){const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(tmp,file);}
async function connect(database){const db=new Client({...config,database});await db.connect();await db.query("SET TIME ZONE 'UTC'");await db.query("SET DateStyle='ISO, YMD'");return db;}
async function command(tool,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(path.join(bin,tool+'.exe'),['--host=localhost','--port=5432','--username=postgres','--no-password',...args],{windowsHide:true,env:{...process.env,PGPASSWORD:password},stdio:['ignore','ignore','pipe']});
  // Never print raw server diagnostics: they can contain private row values.
  let diagnostic='';child.stderr.on('data',b=>{if(diagnostic.length<2000)diagnostic+=b.toString();});
  child.on('error',()=>reject(Error(tool+' could not start')));
  child.on('close',code=>code===0?resolve():reject(Object.assign(Error(tool+' failed'),{code:'PG_TOOL_FAILED'})));
 });
}
async function describe(db){
 const {rows:tables}=await db.query("SELECT tablename name FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const {rows:constraints}=await db.query("SELECT c.relname AS table_name,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname");
 const {rows:indexes}=await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
 const {rows:columns}=await db.query("SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,is_identity,identity_generation,character_maximum_length,datetime_precision,collation_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
 const {rows:functions}=await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname");
 const {rows:triggers}=await db.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname");
 const {rows:collations}=await db.query("SELECT collname,collprovider,collisdeterministic,colllocale FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public' ORDER BY collname");
 const summaries=[];
 for(const {name} of tables){
  const {rows}=await db.query('SELECT row_to_json(t)::text AS value FROM public.'+q(name)+' t');
  const values=rows.map(r=>r.value).sort();
  const h=crypto.createHash('sha256');for(const value of values)h.update(Buffer.byteLength(value)+':'+value);
  summaries.push({table:name,rows:values.length,sha256:h.digest('hex')});
 }
 const {rows:seqs}=await db.query("SELECT sequencename,start_value,increment_by,min_value,max_value,cycle FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename");
 const sequences=[];
 for(const seq of seqs){const {rows:[state]}=await db.query('SELECT last_value::text,is_called FROM public.'+q(seq.sequencename));sequences.push({...seq,...state});}
 const schema={constraints,indexes,columns,functions,triggers,collations};
 return {tables:summaries,schemaHash:hash(JSON.stringify(schema)),schemaParts:Object.fromEntries(Object.entries(schema).map(([name,value])=>[name,hash(JSON.stringify(value))])),constraintDefinitions:constraints,foreignKeys:constraints.filter(c=>c.contype==='f').length,sequences};
}
// Diagnostics include table names/check results, never private row contents.
function normalizeConstraintDefinition(definition){
 // pg_dump/reparse can distribute a varchar[] -> text[] cast across its literal
 // elements. Only these two complete CHECK forms are normalized; types with a
 // length limit, arbitrary expressions and every other constraint stay exact.
 // https://www.postgresql.org/docs/18/sql-expressions.html#SQL-SYNTAX-ARRAY-CONSTRUCTORS
 const column='(?:[A-Za-z_][A-Za-z0-9_$]*|"(?:[^"]|"")+")';
 const check=String(definition).match(new RegExp('^CHECK \\(\\(\\(('+column+')\\)::text = ANY \\((.+)\\)\\)\\)$'));
 if(!check)return definition;
 const outer=check[2].match(/^\(ARRAY\[(.*)\]\)::text\[\]$/),inner=check[2].match(/^ARRAY\[(.*)\]$/);
 if(!outer&&!inner)return definition;
 const body=(outer||inner)[1],literal="'(?:[^']|'')*'";
 const item=outer?literal+'::character varying':'\\('+literal+'::character varying\\)::text';
 if(!new RegExp('^'+item+'(?:, '+item+')*$').test(body))return definition;
 const values=body.match(new RegExp(literal,'g'));
 return 'CHECK ((('+check[1]+')::text = ANY (ARRAY['+values.map(value=>value+'::text').join(', ')+'])))';
}
const normalizedConstraints=rows=>rows.map(row=>({...row,definition:normalizeConstraintDefinition(row.definition)}));
function compareDescription(actual,expected){
 const names=[...new Set([...expected.tables,...actual.tables].map(t=>t.table))];
 const comparable=expected.constraintDefinitions&&actual.constraintDefinitions&&expected.schemaParts&&actual.schemaParts;
 const constraintsMatch=!!comparable&&same(normalizedConstraints(actual.constraintDefinitions),normalizedConstraints(expected.constraintDefinitions));
 const equivalentSchema=constraintsMatch&&same(Object.keys(actual.schemaParts).sort(),Object.keys(expected.schemaParts).sort())&&Object.keys(expected.schemaParts).every(name=>name==='constraints'||actual.schemaParts[name]===expected.schemaParts[name]);
 return {dataMatches:same(actual.tables,expected.tables),schemaMatches:actual.schemaHash===expected.schemaHash||!!equivalentSchema,foreignKeysMatch:actual.foreignKeys===expected.foreignKeys,
  equivalentConstraintCasts:!!equivalentSchema&&actual.schemaHash!==expected.schemaHash,
  mismatchedTables:names.filter(name=>!same(actual.tables.find(t=>t.table===name),expected.tables.find(t=>t.table===name))),
  schemaDifferences:expected.schemaParts?Object.keys(expected.schemaParts).filter(name=>actual.schemaParts?.[name]!==expected.schemaParts[name]&&!(name==='constraints'&&constraintsMatch)):null,
  constraintDifferences:expected.constraintDefinitions?[...new Set([...expected.constraintDefinitions,...actual.constraintDefinitions].map(c=>c.table_name+'\0'+c.conname))].flatMap(key=>{
   const find=rows=>rows.find(c=>c.table_name+'\0'+c.conname===key),before=find(expected.constraintDefinitions),after=find(actual.constraintDefinitions);
   return before&&after&&same(normalizedConstraints([before]),normalizedConstraints([after]))?[]:[{expected:before||null,restored:after||null}];
  }):null};
}
async function contained(file,base){
 const real=await fs.realpath(file),parent=await fs.realpath(base);
 if(!real.startsWith(parent+path.sep)||(await fs.lstat(file)).isSymbolicLink())throw Error('Unsafe file path');
 return real;
}
async function media(db,folder){
 const {rows}=await db.query('SELECT filepath FROM videos ORDER BY id');
 const originals=path.join(project,'frontend','queue frontend','uploads');
 const preview=path.join(__dirname,'preview-uploads');
 const result=[];await fs.mkdir(path.join(folder,'media'));
 for(const reference of [...new Set(rows.map(r=>r.filepath))]){
  if(typeof reference!=='string'||!/^uploads\/[^/\\:]+$/.test(reference))throw Error('Unsafe media reference');
  const name=reference.slice(8);if(name==='.'||name==='..')throw Error('Unsafe media filename');
  let source;
  try{source=await contained(path.join(preview,name),preview);}catch(e){if(e.code!=='ENOENT')throw e;source=await contained(path.join(originals,name),originals);}
  const before=await fileHash(source),destination=path.join(folder,'media',name);
  await fs.copyFile(source,destination,nativeFs.constants.COPYFILE_EXCL);
  if(before!==await fileHash(source)||before!==await fileHash(destination))throw Error('Media changed while backing up');
  result.push({reference,file:'media/'+name,sha256:before,bytes:(await fs.stat(destination)).size});
 }
 return result;
}
async function create(){
 const id='pg-office-'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'-'+crypto.randomBytes(6).toString('hex');
 const folder=path.join(root,id);await fs.mkdir(folder);
 const manifest={version:1,id,createdAt:new Date().toISOString(),status:'creating',databases:[],media:[],scope:'Current PostgreSQL migration databases; independent consistent snapshots per database'};
 await json(path.join(folder,'manifest.json'),manifest);
 for(const database of databases){
  const db=await connect(database);
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const {rows:[snapshot]}=await db.query('SELECT pg_export_snapshot() AS id');
   const description=await describe(db);
   const file=database+'.dump';
   await command('pg_dump',['--format=custom','--file='+path.join(folder,file),'--snapshot='+snapshot.id,'--lock-wait-timeout=10000',database]);
   if(database==='queue_system_migration')manifest.media=await media(db,folder);
   manifest.databases.push({source:database,file,sha256:await fileHash(path.join(folder,file)),...description});
   await db.query('ROLLBACK');
  }finally{await db.end();}
 }
 manifest.status='backup-complete';await json(path.join(folder,'manifest.json'),manifest);
 console.log('Backup created: '+id);return id;
}
async function load(id){
 if(!idPattern.test(id||''))throw Error('Provide a valid backup ID');
 const folder=await contained(path.join(root,id),root);
 const manifest=JSON.parse(await fs.readFile(await contained(path.join(folder,'manifest.json'),folder),'utf8'));
 if(manifest.version!==1||manifest.id!==id||manifest.status!=='backup-complete'||!same(manifest.databases.map(d=>d.source),databases))throw Error('Incomplete/unrecognized backup');
 for(const d of manifest.databases){if(d.file!==d.source+'.dump'||await fileHash(await contained(path.join(folder,d.file),folder))!==d.sha256)throw Error('Database archive checksum mismatch');}
 for(const m of manifest.media){if(!/^media\/[^/\\:]+$/.test(m.file)||await fileHash(await contained(path.join(folder,m.file),folder))!==m.sha256)throw Error('Media checksum mismatch');}
 return {folder,manifest};
}
async function verify(id,keep=false){
 const {folder,manifest}=await load(id),admin=await connect('postgres');
 const suffix=crypto.randomBytes(8).toString('hex'),role='office_recovery_'+suffix;
 const created=[];let roleCreated=false;
 const result={id,startedAt:new Date().toISOString(),mode:keep?'restore-new':'drill',databases:[],verificationChecks:[],media:manifest.media.length,status:'running'};
 try{
  await admin.query('CREATE ROLE '+q(role)+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');roleCreated=true;
  for(const entry of manifest.databases){
   const target='office_restore_'+(entry.source.startsWith('permit')?'permit_':'queue_')+suffix;
   await admin.query('CREATE DATABASE '+q(target)+' OWNER '+q(role)+' TEMPLATE template0');created.push(target);
   await admin.query('REVOKE ALL ON DATABASE '+q(target)+' FROM PUBLIC');
   await command('pg_restore',['--dbname='+target,'--role='+role,'--no-owner','--no-privileges','--exit-on-error','--single-transaction',path.join(folder,entry.file)]);
   const restored=await connect(target);
   try{
    await restored.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await restored.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC');
    await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actual=await describe(restored);
    const checks=compareDescription(actual,entry);result.verificationChecks.push({source:entry.source,...checks});
    if(!checks.dataMatches||!checks.schemaMatches||!checks.foreignKeysMatch)throw Error('Restored schema/record checksum mismatch');
    if(actual.sequences.length!==entry.sequences.length)throw Error('Sequence count mismatch');
    for(const seq of actual.sequences){
     const original=entry.sequences.find(s=>s.sequencename===seq.sequencename);
     const next=s=>BigInt(s.last_value)+(s.is_called?BigInt(s.increment_by):0n);
     if(!original||next(seq)<next(original))throw Error('Restored identity moved backwards');
     if(['start_value','increment_by','min_value','max_value','cycle'].some(key=>seq[key]!==original[key]))throw Error('Restored sequence definition differs');
    }
    // Verify generated IDs are above every restored identity value without consuming IDs.
    const {rows:identities}=await restored.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND is_identity='YES'");
    for(const identity of identities){
     const {rows:[max]}=await restored.query('SELECT max('+q(identity.column_name)+')::text AS value FROM public.'+q(identity.table_name));
     const {rows:[s]}=await restored.query('SELECT pg_get_serial_sequence($1,$2) AS name',['public.'+identity.table_name,identity.column_name]);
     const seq=actual.sequences.find(sq=>'public.'+sq.sequencename===s.name);
     if(!seq||(max.value!==null&&BigInt(seq.last_value)+(seq.is_called?BigInt(seq.increment_by):0n)<=BigInt(max.value)))throw Error('Restored identity would duplicate an existing record');
    }
    await restored.query('ROLLBACK');
    result.databases.push({source:entry.source,target,tables:actual.tables.length,rows:actual.tables.reduce((n,t)=>n+t.rows,0),foreignKeys:actual.foreignKeys,verified:true});
   }finally{await restored.end();}
  }
  const restoredMedia=path.join(folder,'recovered-media-'+suffix);await fs.mkdir(restoredMedia);
  for(const m of manifest.media){const destination=path.join(restoredMedia,path.basename(m.file));await fs.copyFile(path.join(folder,m.file),destination,nativeFs.constants.COPYFILE_EXCL);if(await fileHash(destination)!==m.sha256)throw Error('Restored media mismatch');}
  if(keep){result.mediaDirectory=restoredMedia;result.ownerRole=role;}
  else{for(const m of manifest.media)await fs.unlink(await contained(path.join(restoredMedia,path.basename(m.file)),restoredMedia));await fs.rmdir(restoredMedia);}
  result.status='passed';
 }catch(error){
  result.status='failed';result.errorCode=error.code||'VALIDATION';throw error;
 }finally{
  if(!keep||result.status!=='passed'){
   for(const target of created){if(!target.endsWith(suffix)||!/^office_restore_(permit|queue)_[a-f0-9]{16}$/.test(target))throw Error('Cleanup guard failed');await admin.query('DROP DATABASE '+q(target));}
   if(roleCreated)await admin.query('DROP ROLE '+q(role));result.temporaryDatabasesRemoved=true;
  }
  result.completedAt=new Date().toISOString();await json(path.join(folder,'recovery-'+suffix+'.json'),result);await admin.end();
 }
 console.log(JSON.stringify(result));return result;
}
async function main(){
 if(!password)throw Error('Use Postgres-Backup.ps1');
 if(root===project||root.startsWith(project+path.sep))throw Error('Backups must be outside the project');
 if((await fs.lstat(root)).isSymbolicLink())throw Error('Unsafe backup root');
 const lock=path.join(root,'.operation.lock');const handle=await fs.open(lock,'wx');
 try{
  await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  const action=process.argv[2]||'backup',id=process.argv[3];let result;
  if(action==='list'){
   for(const name of (await fs.readdir(root)).filter(n=>idPattern.test(n)).sort()){
    try{const {manifest}=await load(name);console.log(JSON.stringify({id:name,status:'checksum-verified',createdAt:manifest.createdAt,databases:manifest.databases.map(d=>({name:d.source,rows:d.tables.reduce((n,t)=>n+t.rows,0)})),media:manifest.media.length}));}
    catch{console.log(JSON.stringify({id:name,status:'incomplete-or-checksum-failed'}));}
   }return;
  }
  if(action==='backup')result=await verify(await create());
  else if(action==='verify'||action==='restore-new')result=await verify(id,action==='restore-new');
  else throw Error('Unknown operation');
  await json(path.join(root,'latest-operation.json'),{status:'passed',action,completedAt:new Date().toISOString(),...result});
 }catch(e){await json(path.join(root,'latest-operation.json'),{status:'failed',at:new Date().toISOString(),code:e.code||'VALIDATION',message:e.message.includes('password')?'Operation failed':e.message});console.error('Backup/recovery failed: '+(e.code||'VALIDATION')+'. Inspect latest-operation.json.');process.exitCode=1;}
 finally{await handle.close();await fs.unlink(lock);}
}
if(require.main===module)main().catch(()=>{console.error('Backup preflight failed; check the private directory, credentials and operation lock.');process.exitCode=1;});
module.exports={hash,idPattern,load,contained,compareDescription,normalizeConstraintDefinition};
