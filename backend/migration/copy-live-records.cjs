/** Live MySQL -> isolated PostgreSQL copy. No backup reader, no source writes.
 * Reads both InnoDB schemas in one read-only consistent snapshot. Copies only into
 * empty, allowlisted target tables. Keeps values in memory; reports contain metadata
 * only. Target databases commit separately; report records any partial completion.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('../monitorBP backend/node_modules/mysql2/promise');
const {Client} = require('pg');
const {settings} = require('../monitorBP backend/maintenance/permit-backup');
const inventory = require('./mysql-schema-inventory.json');
const exclusions = new Set(['permit_sessions','permit_presence','active_workstations']);
const sources = ['permit_system','queue_system'];
const name = n => {if(!/^[a-z_]+$/.test(n)) throw Error('Unexpected identifier'); return n;};
const pgq = n => '"'+name(n)+'"';
const myq = n => '`'+name(n)+'`';
const reportFile = path.join(__dirname,'postgres-live-transfer.json');
const report = {startedAt:new Date().toISOString(),source:'Live MySQL read-only consistent snapshot; no backup input',status:'started',databases:[]};
const save = () => fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
function columnsFor(s,t) { return s.columns.filter(c=>c.TABLE_NAME===t); }
function projection(c, dialect) {
 const col=dialect==='mysql'?myq(c.COLUMN_NAME):pgq(c.COLUMN_NAME);
 if(c.COLUMN_TYPE==='timestamp'||c.COLUMN_TYPE.startsWith('datetime')) return dialect==='mysql'
  ? `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s.%f') AS ${col}`
  : `to_char(${col}, 'YYYY-MM-DD HH24:MI:SS.US') AS ${col}`;
 if(c.COLUMN_TYPE==='date') return dialect==='mysql'?`DATE_FORMAT(${col}, '%Y-%m-%d') AS ${col}`:`to_char(${col}, 'YYYY-MM-DD') AS ${col}`;
 return dialect==='mysql'?`CAST(${col} AS CHAR CHARACTER SET utf8mb4) AS ${col}`:`${col}::text AS ${col}`;
}
function canonical(rows,columns) {return rows.map(r=>JSON.stringify(columns.map(c=>r[c.COLUMN_NAME]))).sort();}
function orderedTables(s) {
 const ordered=[], remaining=new Set(s.tables.map(t=>t.TABLE_NAME));
 while(remaining.size) {
  const ready=[...remaining].filter(t=>!s.foreignKeys.some(f=>f.TABLE_NAME===t&&remaining.has(f.REFERENCED_TABLE_NAME)));
  if(!ready.length) throw Error('Cyclic foreign keys require review');
  for(const t of ready){ordered.push(t);remaining.delete(t);}
 }
 return ordered;
}
async function main(){
 const password=process.env.MIGRATION_PG_PASSWORD;
 delete process.env.MIGRATION_PG_PASSWORD;
 if(!password) throw Error('Use Copy-LiveRecords.ps1 to supply private credentials');
 // Refuse an accidental second transfer/report overwrite. Never clear existing data.
 try {await fs.access(reportFile);throw Error('Existing transfer report: inspect before another copy');} catch(e){if(e.code!=='ENOENT')throw e;}
 const config=settings().connection;
 if(config.host!=='localhost'||Number(config.port)!==3306||config.database!=='permit_system') throw Error('Unexpected source connection; review both live server configurations');
 let db;
 const targets=[];
 try {
  db=await mysql.createConnection({...config,database:undefined,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  await db.query("SET SESSION time_zone='+00:00'");
  await db.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  report.snapshotAt=new Date().toISOString();
  await save();
  for(const source of sources) {
   const schema=inventory.databases[source];
   const [actualCols]=await db.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION',[source]);
   const keys=['TABLE_NAME','COLUMN_NAME','COLUMN_TYPE','IS_NULLABLE','COLUMN_DEFAULT','EXTRA','COLLATION_NAME'];
   if(JSON.stringify(actualCols.map(c=>keys.map(k=>c[k])))!==JSON.stringify(schema.columns.map(c=>keys.map(k=>c[k])))) throw Error('Source schema changed: '+source);
   const [liveTables]=await db.query("SELECT TABLE_NAME,ENGINE,AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",[source]);
   if(liveTables.length!==schema.tables.length||liveTables.some(t=>t.ENGINE!=='InnoDB'))throw Error('Unsupported source table change');
   const target=source+'_migration';
   const pg=new Client({host:'localhost',port:5432,user:'postgres',password,database:target,connectionTimeoutMillis:10000});
   await pg.connect();
   const entry={source,target,state:'preflight',tables:[]};
   targets.push({pg,entry}); report.databases.push(entry);
   await pg.query('BEGIN');
   await pg.query("SET LOCAL TIME ZONE 'UTC'");
   await pg.query("SET LOCAL lock_timeout='5s'");
   await pg.query("SET LOCAL statement_timeout='60s'");
   await pg.query('LOCK TABLE '+schema.tables.map(t=>'public.'+pgq(t.TABLE_NAME)).join(',')+' IN ACCESS EXCLUSIVE MODE');
   for(const t of schema.tables) {
    const {rows:[row]}=await pg.query('SELECT count(*) AS count FROM public.'+pgq(t.TABLE_NAME));
    if(row.count!=='0')throw Error('Target is not empty: '+target+'.'+t.TABLE_NAME);
   }
   for(const table of orderedTables(schema)) {
    const cols=columnsFor(schema,table);
    const [rows]=await db.query('SELECT '+cols.map(c=>projection(c,'mysql')).join(',')+' FROM '+myq(source)+'.'+myq(table));
    const detail={table,sourceRows:rows.length,copiedRows:0,verified:false};entry.tables.push(detail);
    if(exclusions.has(table)) {detail.excluded='Temporary authentication/presence/workstation state';detail.verified=true;continue;}
    for(const c of cols) for(const row of rows) {
     const value=row[c.COLUMN_NAME];
     if(value===null)continue;
     if(value.includes('\0'))throw Error('Unsupported NUL value in '+table+'.'+c.COLUMN_NAME);
     if((c.COLUMN_TYPE==='date'||c.COLUMN_TYPE==='timestamp'||c.COLUMN_TYPE.startsWith('datetime'))&&/^0000-|^\d{4}-00-|^\d{4}-\d{2}-00/.test(value))throw Error('Invalid calendar value in '+table+'.'+c.COLUMN_NAME);
     if(c.COLUMN_TYPE.includes('bigint')) {const n=BigInt(value);if(n>9223372036854775807n||n< -9223372036854775808n)throw Error('Bigint overflow in '+table+'.'+c.COLUMN_NAME);}
    }
    const insert='INSERT INTO public.'+pgq(table)+' ('+cols.map(c=>pgq(c.COLUMN_NAME)).join(',')+') VALUES ('+cols.map((c,i)=>'$'+(i+1)).join(',')+')';
    for(const row of rows) await pg.query(insert,cols.map(c=>row[c.COLUMN_NAME]));
    const result=await pg.query('SELECT '+cols.map(c=>projection(c,'postgres')).join(',')+' FROM public.'+pgq(table));
    if(JSON.stringify(canonical(rows,cols))!==JSON.stringify(canonical(result.rows,cols)))throw Error('Exact value verification failed: '+table);
    detail.copiedRows=rows.length;detail.verified=true;
    const identity=cols.find(c=>c.EXTRA==='auto_increment');
    if(identity) {
     let next=BigInt(liveTables.find(t=>t.TABLE_NAME===table).AUTO_INCREMENT||1);
     for(const row of rows){const id=BigInt(row[identity.COLUMN_NAME]);if(id>=next)next=id+1n;}
     const max=identity.COLUMN_TYPE.startsWith('int(')?2147483647n:9223372036854775807n;
     if(next>max)throw Error('Identity capacity exceeded: '+table);
     const {rows:[seq]}=await pg.query('SELECT pg_get_serial_sequence($1,$2) AS name',['public.'+table,identity.COLUMN_NAME]);
     if(!/^public\.[a-z_]+$/.test(seq.name))throw Error('Unexpected identity sequence');
     const {rows:[state]}=await pg.query('SELECT last_value::text,is_called FROM '+seq.name);
     const existing=BigInt(state.last_value)+(state.is_called?1n:0n);if(existing>next)next=existing;
     // ALTER RESTART is transactional, unlike setval: failed copies leave no changed counters.
     await pg.query('ALTER SEQUENCE '+seq.name+' RESTART WITH '+next.toString());
     const {rows:[confirmed]}=await pg.query('SELECT last_value::text,is_called FROM '+seq.name);
     if(confirmed.last_value!==next.toString()||confirmed.is_called)throw Error('Sequence verification failed');
     detail.nextId=next.toString();
    }
   }
   entry.state='verified-uncommitted';await save();
   console.log(target+': all copied values verified before commit');
  }
  // Both independent databases have passed before either is committed.
  for(const {pg,entry} of targets){await pg.query('COMMIT');entry.state='committed';await save();}
  await db.query('ROLLBACK'); // End read-only source snapshot; no source writes occurred.
  report.status='passed';report.completedAt=new Date().toISOString();await save();
  for(const {entry} of targets)console.log(JSON.stringify({database:entry.target,rows:entry.tables.reduce((n,t)=>n+t.copiedRows,0),excludedTemporaryRows:entry.tables.filter(t=>t.excluded).reduce((n,t)=>n+t.sourceRows,0),status:entry.state}));
 } catch(error) {
  for(const {pg,entry} of targets) if(entry.state!=='committed'){await pg.query('ROLLBACK').catch(()=>{});entry.state='rolled-back';}
  report.status=targets.some(t=>t.entry.state==='committed')?'partial-commit-review-required':'failed';
  // PostgreSQL/MySQL messages may contain confidential row values. Store only safe codes.
  report.errorCode=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'VALIDATION_OR_CONNECTION_FAILURE';
  await save();
  console.error('Transfer failed; code '+report.errorCode+'. No source data changed. Review metadata report.');
  process.exitCode=1;
 } finally {if(db)await db.end();for(const {pg} of targets)await pg.end();}
}
main().catch(()=>{console.error('Transfer preflight failed; no copy started. Inspect setup and existing report.');process.exitCode=1;});
