const test=require('node:test'),assert=require('node:assert/strict');
const configFor=require('./postgres-config');
const local={source:'permit_system',host:'localhost',port:5432,
 database:'permit_system_migration',user:'local_user',password:'local-test-only'};
const cloud='postgresql://cloud_user:test-only%3Apassword@sample.neon.tech/ojt-permits-test?sslmode=require&channel_binding=require';

test('cloud permit connections use Neon, verified TLS, and the Manila session timezone',()=>{
 const config=configFor('permit_system',{PERMIT_DATABASE_URL:cloud});
 const url=new URL(config.connectionString);
 assert.equal(url.hostname,'sample.neon.tech');
 assert.equal(url.pathname,'/ojt-permits-test');
 assert.equal(decodeURIComponent(url.password),'test-only:password');
 assert.equal(url.searchParams.get('sslmode'),'verify-full');
 assert.equal(url.searchParams.get('channel_binding'),'require');
 assert.equal(config.enableChannelBinding,true);
 assert.match(config.options,/timezone=Asia\/Manila/);
 assert.equal(config.connectionTimeoutMillis,15000);
});

test('local startup keeps its exact database, credentials and connection timeout',()=>{
 const config=configFor('permit_system',{OFFICE_PG_CONNECTIONS:JSON.stringify([local])});
 for(const field of ['host','port','database','user','password'])assert.equal(config[field],local[field]);
 assert.equal(config.connectionTimeoutMillis,5000);
 assert.equal(config.connectionString,undefined);
});

test('permit URL never redirects queue connections into the permit database',()=>{
 const queue={...local,source:'queue_system',database:'queue_system_migration'};
 const env={PERMIT_DATABASE_URL:cloud,OFFICE_PG_CONNECTIONS:JSON.stringify([local,queue])};
 assert.equal(configFor('queue_system',env).database,'queue_system_migration');
 assert.equal(configFor('queue_system',env).connectionString,undefined);
 assert.throws(()=>configFor('queue_system',{PERMIT_DATABASE_URL:cloud}),/credentials are not loaded/);
});

test('cloud queue and staff accounts use separate destinations with verified TLS',()=>{
 const env={QUEUE_DATABASE_URL:'postgresql://queue_user:test-only@sample.neon.tech/ojt-queue-test?sslmode=require',PERMIT_DATABASE_URL:cloud};
 const queue=configFor('queue_system',env),permit=configFor('permit_system',env);
 assert.equal(new URL(queue.connectionString).pathname,'/ojt-queue-test');
 assert.equal(new URL(permit.connectionString).pathname,'/ojt-permits-test');
 assert.equal(new URL(queue.connectionString).searchParams.get('sslmode'),'verify-full');
 assert.equal(queue.enableChannelBinding,true);
 assert.throws(()=>configFor('permit_system',{QUEUE_DATABASE_URL:env.QUEUE_DATABASE_URL}),/credentials are not loaded/);
 assert.throws(()=>configFor('queue_system',{...env,QUEUE_DATABASE_URL:'https://user:private-secret@example.test/db'}),error=>{
  assert.match(error.message,/QUEUE_DATABASE_URL/);assert.ok(!error.message.includes('private-secret'));return true;
 });
});

test('malformed cloud URLs fail without including their secrets or falling back locally',()=>{
 for(const url of ['postgresql://user:private-secret@[bad/db','https://user:private-secret@example.test/db','postgresql://user:private-secret@host/']) {
  assert.throws(()=>configFor('permit_system',{PERMIT_DATABASE_URL:url,OFFICE_PG_CONNECTIONS:JSON.stringify([local])}),error=>{
   assert.match(error.message,/PERMIT_DATABASE_URL/);
   assert.ok(!error.message.includes('private-secret'));
   assert.ok(!error.input);
   return true;
  });
 }
});

test('workflow connections keep the permit alias and resolve the same cloud destination',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const configs=[];
 class Pool {
  constructor(config){configs.push(config);}
  async query(){return {command:'SELECT',rows:[{ok:1}],fields:[],rowCount:1};}
  async end(){}
 }
 const context={module:{exports:{}},console,
  process:{env:{DB_ENGINE:'postgres',PERMIT_DATABASE_URL:cloud}},
  require(name){
   if(name==='pg')return {Pool,types:{getTypeParser:()=>value=>value}};
   if(name==='./postgres-config')return database=>configFor(database,{PERMIT_DATABASE_URL:cloud});
   return require(name);
  }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'index.js'),'utf8'),context);
 const db=context.module.exports.createConnection({database:'permit_system',dateStrings:['DATE']});
 const transaction=context.module.exports.createConnection({database:db.config.database}).promise();
 assert.equal(db.config.database,'permit_system');
 await transaction.beginTransaction();
 await transaction.query('SELECT 1');
 await transaction.rollback();
 assert.equal(configs.length,2);
 for(const config of configs){
  assert.equal(config.connectionString,configFor('permit_system',{PERMIT_DATABASE_URL:cloud}).connectionString);
  assert.equal(config.max,1);
 }
 await transaction.end();await db.end();
});
