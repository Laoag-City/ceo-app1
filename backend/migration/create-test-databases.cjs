/** Copies PostgreSQL migration rows to isolated test databases without disconnecting pgAdmin. */
const {Client}=require('pg'),fs=require('node:fs/promises'),path=require('node:path');
const inventory=require('./mysql-schema-inventory.json');
const config={host:'localhost',port:5432,user:'postgres',password:process.env.MIGRATION_PG_PASSWORD};
delete process.env.MIGRATION_PG_PASSWORD;
async function main(){
 const admin=new Client({...config,database:'postgres'});await admin.connect();
 try{for(const kind of ['permit','queue']){
  const source=kind+'_system',target=source+'_test';
  if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw Error('Existing test database');
  await admin.query('CREATE DATABASE '+target+' TEMPLATE template0');
  await admin.query('REVOKE ALL ON DATABASE '+target+' FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE '+target+' TO '+kind+'_app_migration');
  const from=new Client({...config,database:source+'_migration'}),to=new Client({...config,database:target});
  await from.connect();await to.connect();
  try{
   await to.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
   await to.query('GRANT USAGE ON SCHEMA public TO '+kind+'_app_migration');
   const schema=await fs.readFile(path.join(__dirname,source+'_migration.sql'),'utf8');
   await to.query(schema.replaceAll(source+'_migration',target));
   await from.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await to.query('BEGIN');
   const s=inventory.databases[source],remaining=new Set(s.tables.map(t=>t.TABLE_NAME));
   while(remaining.size){
    const ready=[...remaining].filter(t=>!s.foreignKeys.some(f=>f.TABLE_NAME===t&&remaining.has(f.REFERENCED_TABLE_NAME)));
    if(!ready.length)throw Error('Cyclic schema');
    for(const table of ready){
     const cols=s.columns.filter(c=>c.TABLE_NAME===table).map(c=>c.COLUMN_NAME);
     const result=await from.query({text:'SELECT * FROM public.'+table,types:{getTypeParser:()=>v=>v}});
     for(const row of result.rows)await to.query('INSERT INTO public.'+table+' ('+cols.join(',')+') VALUES ('+cols.map((c,i)=>'$'+(i+1)).join(',')+')',cols.map(c=>row[c]));
     remaining.delete(table);
    }
   }
   await to.query('COMMIT');await from.query('ROLLBACK');
   if(kind==='queue') {
    await to.query(await fs.readFile(path.join(__dirname,'queue-runtime.sql'),'utf8'));
    await to.query(await fs.readFile(path.join(__dirname,'queue-playlist.sql'),'utf8'));
   }
   console.log('Created populated isolated test database: '+target);
  }finally{await from.end();await to.end();}
 }}finally{await admin.end();}
}
main().catch(e=>{console.error('Test setup failed: '+(e.code||'VALIDATION'));process.exitCode=1;});
