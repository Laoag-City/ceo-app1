// All database tables are connection-local TEMPORARY tables; live data is untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const create = require('./projectRecords');
async function fixture(t) {
    const conn = await mysql.createConnection({host:'localhost',user:'root',password:'',database:'permit_system'});
    t.after(() => conn.end());
    await conn.query('CREATE TEMPORARY TABLE users (id INT PRIMARY KEY,username VARCHAR(50),role VARCHAR(20),is_active INT,is_verified INT)');
    await conn.query('CREATE TEMPORARY TABLE permit_user_profiles (user_id INT PRIMARY KEY,display_name VARCHAR(80))');
    await conn.query("INSERT INTO users VALUES (1,'Operator A','operator',1,1),(2,'Admin B','admin',1,1),(3,'Inactive','operator',0,1)");
    for (const table of ['permits','occupancy_permits']) {
        await conn.query(`CREATE TEMPORARY TABLE ${table} (id INT PRIMARY KEY, project_title VARCHAR(100))`);
        await conn.query(`INSERT INTO ${table} VALUES (10,'Project Ten'),(20,'Project Twenty')`);
    }
    await conn.query('CREATE TEMPORARY TABLE permit_change_requests (id INT,permit_id INT,change_type VARCHAR(30))');
    await conn.query("INSERT INTO permit_change_requests VALUES (5,10,'delete')");
    await conn.query('CREATE TEMPORARY TABLE sub_permits (id INT,permit_id INT)');
    await conn.query('INSERT INTO sub_permits VALUES (4,10)');
    const service = create({promise:() => ({query:(sql,args) => conn.query(sql.replace('CREATE TABLE IF NOT EXISTS project_records','CREATE TEMPORARY TABLE IF NOT EXISTS project_records'),args)})});
    const routes = {};
    service.routes({get:(path,fn)=>routes.get=fn,post:(path,fn)=>routes.post=fn});
    const req = (kind='permits', id='10', body={}) => ({user:{id:1,role:'operator'},params:{kind,id},query:{},body,get:key=>key==='x-user-id'?'1':'operator'});
    const response = () => { let done;const completed=new Promise(resolve=>done=resolve);return {statusCode:200,locals:{},status(n){this.statusCode=n;return this;},json(body){this.body=body;done();return this;},completed}; };
    return {conn,service,routes,req,response};
}
test('comments validate authors/content, persist once on retry, and isolate project/type feeds', async t => {
    const f=await fixture(t);const key='11111111-1111-4111-8111-111111111111';
    for(let i=0;i<2;i++){const res=f.response();await f.routes.post(f.req('permits','10',{message:'Reminder <script>text</script>',requestId:key}),res);assert.equal(res.body.success,true);}
    let [rows]=await f.conn.query('SELECT * FROM project_records');assert.equal(rows.length,1);assert.equal(rows[0].actor_name,'Operator A');
    for(const [kind,id,count] of [['permits','10',1],['permits','20',0],['occupancy','10',0]]){const res=f.response();await f.routes.get(f.req(kind,id),res);assert.equal(res.body.records.length,count);}
    let res=f.response();await f.routes.post(f.req('permits','10',{message:'Different',requestId:key}),res);assert.equal(res.statusCode,409);
    res=f.response();await f.routes.post(f.req('permits','10',{message:'   ',requestId:key}),res);assert.equal(res.statusCode,400);
    res=f.response();const inactive=f.req();inactive.user={id:3,role:'operator'};await f.routes.get(inactive,res);assert.equal(res.statusCode,403);
});

test('approved operator deletion retains filing metadata for monthly reporting, while failure is not a successful archive',async t=>{
 const f=await fixture(t);await f.conn.query('ALTER TABLE permits ADD COLUMN permit_date DATE');await f.conn.query("UPDATE permits SET permit_date='2026-10-01' WHERE id=10");
 const req=f.req();Object.assign(req,{path:'/api/permits/change-requests/5/approve',method:'PUT',body:{},user:{id:2,role:'admin'}});const res=f.response();
 await f.service.audit(req,res,()=>{f.conn.query('DELETE FROM permits WHERE id=10').then(()=>res.json({success:true}))});await res.completed;
 const [rows]=await f.conn.query('SELECT * FROM project_records');assert.equal(rows.length,1);assert.equal(rows[0].outcome,'saved');const detail=JSON.parse(rows[0].details);assert.equal(detail.deletion.mode,'approved_request');assert.equal(detail.deletion.project.record.id,10);assert.equal(require('./monthlyReports').day(detail.deletion.project.record.permit_date),'2026-10-01');
});
test('audits direct actions, sub-permit ownership, pending approvals and failed requests truthfully', async t => {
    const f=await fixture(t);
    async function action(path,body,result,status=200){const req=f.req();Object.assign(req,{path,method:'POST',body});const res=f.response();await f.service.audit(req,res,()=>{res.status(status).json(result);});await res.completed;return res;}
    await action('/api/matrix/add',{sub_permit_id:4,discipline_name:'Structural'},{success:true});
    await action('/api/permits/10',{project_title:'Requested project change'}, {success:true,pending:true});
    await action('/api/permits/10/signatures',{}, {success:false},400);
    const res=f.response();await f.routes.get(f.req(),res);assert.equal(res.body.records.length,2);
    assert.match(res.body.records[0].message,/Submitted for administrator approval/);
    assert.equal(res.body.records[1].message,'Added station');assert.match(res.body.records[1].details,/Structural/);
});
test('deletion history survives deletion; duplicate deletion submissions do not appear as new requests',async t=>{
    const f=await fixture(t);
    const req=f.req();Object.assign(req,{path:'/api/permits/change-requests/5/approve',method:'PUT'});req.user={id:2,role:'admin'};
    const res=f.response();await f.service.audit(req,res,()=>{f.conn.query('DELETE FROM permits WHERE id=10').then(()=>res.json({success:true}));});await res.completed;
    const [rows]=await f.conn.query('SELECT * FROM project_records');assert.equal(rows.length,1);assert.equal(rows[0].project_id,10);assert.equal(rows[0].actor_name,'Admin B');assert.match(rows[0].message,/Approved project deletion/);
    const duplicate=f.req();Object.assign(duplicate,{path:'/api/permits/20',method:'DELETE'});const out=f.response();await f.service.audit(duplicate,out,()=>out.json({success:true,pending:true,duplicate:true}));await out.completed;
    const feed=f.response();await f.routes.get(f.req('permits','20'),feed);assert.equal(feed.body.records.length,0);
});
test('create events use newly created ID and unconfirmed intents remain visibly unconfirmed',async t=>{
    const f=await fixture(t);const req=f.req();Object.assign(req,{path:'/api/occupancy',method:'POST',body:{project_title:'New'}});const res=f.response();
    await f.service.audit(req,res,()=>{res.locals.projectRecordId=20;res.json({success:true});});await res.completed;
    const interrupted=f.req();Object.assign(interrupted,{path:'/api/occupancy/20/checklist',method:'PUT'});await f.service.audit(interrupted,f.response(),()=>{});
    const feed=f.response();await f.routes.get(f.req('occupancy','20'),feed);assert.equal(feed.body.records.length,2);assert.equal(feed.body.records[0].outcome,'unconfirmed');assert.equal(feed.body.records[1].message,'Created project');
});
