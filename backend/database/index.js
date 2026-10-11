/** Dual-driver boundary. PostgreSQL is the default after the approved cutover.
 * PostgreSQL preserves the existing callback/[rows,fields]/insertId contract so
 * authorization and workflow modules use the same code. Transactions always own
 * a dedicated client. Runtime roles never run schema migrations.
 */
const dialect = process.env.DB_ENGINE || 'postgres';
if(!['mysql','postgres'].includes(dialect))throw Error('Unsupported DB_ENGINE');
const {convert,bind,identityTables}=require('./postgres-sql');
const configFor=require('./postgres-config');
function wrap(executor,config,{release,end}={}) {
 const {types}=require('pg');
 const parsers={getTypeParser(oid,format){
  if(oid===1082&&config.dateStrings?.includes('DATE'))return v=>v;
  if(oid===20)return value=>{const n=Number(value);return Number.isSafeInteger(n)?n:value;};
  return types.getTypeParser(oid,format);
 }};
 async function run(sql,args=[]) {
  const converted=convert(sql,args);
  const bound=bind(converted.sql,converted.args);
  let text=bound.sql.replace(/;\s*$/,'');
  const table=/^\s*INSERT INTO\s+([a-z_]+)/i.exec(text)?.[1];
  if(table&&identityTables.has(table)&&! /\bRETURNING\b/i.test(text))text+=' RETURNING id';
  try {
   const result=await executor.query({text,values:bound.args,types:parsers});
   const write=['INSERT','UPDATE','DELETE'].includes(result.command);
   return [write?{affectedRows:result.rowCount,insertId:result.rows[0]?.id||0}:result.rows,result.fields];
  }catch(e){
   // Avoid returning confidential constraint details to API callers.
   const safe=Object.assign(new Error('Database operation failed ('+(e.code||'unknown')+').'),{code:e.code});
   console.error('PostgreSQL query failed:',e.code, text.slice(0,100).replace(/\s+/g,' '));
   throw safe;
  }
 }
 const promise={dialect:'postgres',query:run,execute:run,beginTransaction:()=>executor.query('BEGIN'),commit:()=>executor.query('COMMIT'),rollback:()=>executor.query('ROLLBACK'),end:async()=>{if(end)await end();else if(release)release();},release:()=>release?.()};
 return {dialect:'postgres',config,query(sql,args,cb){if(typeof args==='function'){cb=args;args=[];}const task=run(sql,args);if(cb){task.then(([rows,fields])=>cb(null,rows,fields),cb);return;}return task;},promise:()=>promise,connect(cb){executor.query('SELECT 1').then(()=>cb(null),cb);},end:promise.end,...(release?{release:promise.release}:{} )};
}
function createConnection(config){
 if(dialect==='mysql')return require('../monitorBP backend/node_modules/mysql2').createConnection(config);
 const {Pool}=require('pg');
 // A max-one pool owns one connection for this workflow for its entire lifetime.
 const pool=new Pool({...configFor(config.database),max:1});
 return wrap(pool,config,{end:()=>pool.end()});
}
function createPool(config){
 if(dialect==='mysql')return require('../queue backend/node_modules/mysql2/promise').createPool(config);
 const {Pool}=require('pg'),pool=new Pool(configFor(config.database));
 const wrapped=wrap(pool,config,{end:()=>pool.end()});
 const result=wrapped.promise();
 result.getConnection=async()=>{const client=await pool.connect();return wrap(client,config,{release:()=>client.release()}).promise();};
 return result;
}
module.exports={dialect,createConnection,createPool};
