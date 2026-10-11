/** Read-only cutover comparison. Emits primary keys and changed field names, never row contents. */
const fs=require('node:fs/promises'),path=require('node:path');
const mysql=require('../monitorBP backend/node_modules/mysql2/promise'),{Client}=require('pg');
const inventory=require('./mysql-schema-inventory.json');
const {settings}=require('../monitorBP backend/maintenance/permit-backup');
const skipped=new Set(['permit_sessions','permit_presence','active_workstations']);
async function main(){
 const configs=JSON.parse(process.env.OFFICE_COMPARE_CONNECTIONS||'[]');delete process.env.OFFICE_COMPARE_CONNECTIONS;
 const db=await mysql.createConnection({...settings().connection,database:undefined,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
 const report={at:new Date().toISOString(),readOnly:true,databases:[]};
 try{
  await db.query("SET SESSION time_zone='+00:00'");await db.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  for(const source of ['permit_system','queue_system']){
   const config=configs.find(c=>c.database===source+'_migration');if(!config||config.host!=='localhost')throw Error('Missing expected connection');
   const pg=new Client(config);await pg.connect();
   const summary={source,target:config.database,tables:[]};report.databases.push(summary);
   try{
    await pg.query("SET TIME ZONE 'UTC'");await pg.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const s=inventory.databases[source];
    for(const {TABLE_NAME:table} of s.tables){
     if(skipped.has(table))continue;
     const cols=s.columns.filter(c=>c.TABLE_NAME===table),keys=s.indexes.filter(i=>i.TABLE_NAME===table&&i.INDEX_NAME==='PRIMARY').map(i=>i.COLUMN_NAME);
     function projection(c,dialect){
      const n=c.COLUMN_NAME,q=dialect==='mysql'?'`'+n+'`':'"'+n+'"';
      if(c.COLUMN_TYPE==='timestamp'||c.COLUMN_TYPE.startsWith('datetime'))return dialect==='mysql'?`DATE_FORMAT(${q},'%Y-%m-%d %H:%i:%s.%f') AS ${q}`:`to_char(${q},'YYYY-MM-DD HH24:MI:SS.US') AS ${q}`;
      if(c.COLUMN_TYPE==='date')return dialect==='mysql'?`DATE_FORMAT(${q},'%Y-%m-%d') AS ${q}`:`to_char(${q},'YYYY-MM-DD') AS ${q}`;
      return dialect==='mysql'?`CAST(${q} AS CHAR CHARACTER SET utf8mb4) AS ${q}`:`${q}::text AS ${q}`;
     }
     const [original]=await db.query('SELECT '+cols.map(c=>projection(c,'mysql')).join(',')+' FROM `'+source+'`.`'+table+'`');
     const {rows:current}=await pg.query('SELECT '+cols.map(c=>projection(c,'pg')).join(',')+' FROM public."'+table+'"');
     const key=r=>JSON.stringify(keys.map(k=>r[k]));
     const left=new Map(original.map(r=>[key(r),r])),right=new Map(current.map(r=>[key(r),r]));
     const changed=[];for(const [id,row] of left){const other=right.get(id);if(other){const fields=cols.map(c=>c.COLUMN_NAME).filter(k=>row[k]!==other[k]);if(fields.length)changed.push({key:JSON.parse(id),fields});}}
     summary.tables.push({table,mysqlRows:original.length,postgresRows:current.length,mysqlOnly:[...left.keys()].filter(k=>!right.has(k)).map(JSON.parse),postgresOnly:[...right.keys()].filter(k=>!left.has(k)).map(JSON.parse),changed});
    }
   }finally{await pg.end();}
  }
 }finally{await db.end();}
 await fs.writeFile(path.join(__dirname,'cutover-comparison.json'),JSON.stringify(report,null,2)+'\n');
 for(const d of report.databases)console.log(JSON.stringify({database:d.source,differences:d.tables.filter(t=>t.mysqlOnly.length||t.postgresOnly.length||t.changed.length)}));
}
main().catch(e=>{console.error('Read-only comparison failed: '+(e.code||'VALIDATION'));process.exitCode=1});
