/** Read-only migration inventory: schema metadata and counts, never account/visitor rows. */
const fs=require('node:fs/promises');
const path=require('node:path');
const mysql=require('../monitorBP backend/node_modules/mysql2/promise');
const {settings}=require('../monitorBP backend/maintenance/permit-backup');
async function main(){
 const db=await mysql.createConnection({...settings().connection,database:undefined});
 const report={capturedAt:new Date().toISOString(),status:'Preparation only; no PostgreSQL schema or application cutover performed',databases:{}};
 try{
  for(const database of ['permit_system','queue_system']){
   const [tables]=await db.query('SELECT TABLE_NAME,ENGINE,AUTO_INCREMENT,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=? ORDER BY TABLE_NAME',[database,'BASE TABLE']);
   const [columns]=await db.query('SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION',[database]);
   const [indexes]=await db.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',[database]);
   const [foreignKeys]=await db.query('SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION',[database]);
   for(const table of tables){if(!/^[A-Za-z0-9_]+$/.test(table.TABLE_NAME))throw Error('Unsupported table name');const [[row]]=await db.query('SELECT COUNT(*) AS count FROM `'+database+'`.`'+table.TABLE_NAME+'`');table.rowCount=Number(row.count);}
   const [checks]=await db.query('SELECT TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? ORDER BY TABLE_NAME,CONSTRAINT_NAME',[database]);
   report.databases[database]={tables,columns,indexes,foreignKeys,checks};
  }
 }finally{await db.end()}
 await fs.writeFile(path.join(__dirname,'mysql-schema-inventory.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(Object.fromEntries(Object.entries(report.databases).map(([name,data])=>[name,{tables:data.tables.length,rows:data.tables.reduce((n,t)=>n+t.rowCount,0),relationships:data.foreignKeys.length}]))));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
