const test=require('node:test'),assert=require('node:assert/strict');
const mysql=require('mysql2/promise'),create=require('./inspectionWorkflow');
test('blank/whitespace, impossible dates and invalid choices are rejected',()=>{
    const valid={inspection_type:'Preliminary',inspection_date:'2026-09-17',inspector_name:'Inspector',result:'Scheduled',findings:'Site visit scheduled.',next_inspection_date:null};
    assert.doesNotThrow(()=>create.validate(valid));
    for(const key of ['inspector_name','findings','inspection_date'])for(const blank of ['', '   '])assert.throws(()=>create.validate({...valid,[key]:blank}));
    for(const changes of [{inspection_date:'2026-02-30'},{next_inspection_date:'2026-09-16'},{result:'anything'},{inspection_type:''}])assert.throws(()=>create.validate({...valid,...changes}));
});
async function fixture(t){
    const db=await mysql.createConnection({host:'localhost',user:'root',password:'',database:'permit_system'});t.after(()=>db.end());
    // Connection-local temporary tables shadow production tables. No live rows touched.
    for(const [table,columns] of Object.entries({users:'id INT PRIMARY KEY,role VARCHAR(20),is_active INT,is_verified INT',occupancy_permits:'id INT PRIMARY KEY',occupancy_inspections:'id INT PRIMARY KEY,occupancy_id INT,inspector_name VARCHAR(150),findings TEXT',occupancy_change_requests:'id INT AUTO_INCREMENT PRIMARY KEY,occupancy_id INT,requested_by INT,change_type VARCHAR(50),changes JSON,status VARCHAR(20),remarks TEXT,reviewed_by VARCHAR(50),reviewed_at TIMESTAMP NULL'}))await db.query(`CREATE TEMPORARY TABLE ${table} (${columns}) ENGINE=InnoDB`);
    await db.query("INSERT INTO users VALUES (1,'operator',1,1),(2,'admin',1,1),(3,'superadmin',1,1)");
    await db.query('INSERT INTO occupancy_permits VALUES (10),(20)');
    await db.query("INSERT INTO occupancy_inspections VALUES (50,10,'Inspector','Original'),(51,10,'Inspector','Keep'),(60,20,'Other','Other')");
    const workflow=create(async()=>({query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),end:async()=>{}}));
    async function call(handler,{id=10,inspId=50,role='operator',user=role==='operator'?1:role==='admin'?2:3}={}){
        const row=(await db.query('SELECT * FROM occupancy_inspections WHERE id=? AND occupancy_id=?',[inspId,id]))[0][0];
        const version=require('./recordVersion').hash(row||null);
        const req={user:{id:user,role},params:{id,inspId},get:n=>n==='x-record-version'?version:n==='x-user-id'?String(user):role};
        const res={code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};
        await handler(req,res,()=>{res.next=true});return res;
    }
    return {db,workflow,call};
}
test('operator request preserves inspection; duplicate blocked; approval removes only requested inspection',async t=>{
    const {db,workflow,call}=await fixture(t);
    assert.equal((await call(workflow.submit)).body.pending,true);
    assert.equal((await db.query('SELECT * FROM occupancy_inspections'))[0].length,3);
    assert.equal((await call(workflow.submit)).code,409);
    assert.equal((await db.query('SELECT * FROM occupancy_change_requests'))[0].length,1);
    assert.equal((await call(workflow.review('approve'),{id:1,role:'admin'})).body.success,true);
    assert.deepEqual((await db.query('SELECT id FROM occupancy_inspections ORDER BY id'))[0].map(r=>r.id),[51,60]);
    assert.equal((await db.query('SELECT * FROM occupancy_permits'))[0].length,2);
    assert.equal((await call(workflow.review('approve'),{id:1,role:'admin'})).code,409);
});
test('decline preserves record and allows a fresh request',async t=>{
    const {db,workflow,call}=await fixture(t);await call(workflow.submit);
    assert.equal((await call(workflow.review('reject'),{id:1,role:'superadmin'})).body.success,true);
    assert.equal((await db.query('SELECT * FROM occupancy_inspections WHERE id=50'))[0].length,1);
    assert.equal((await call(workflow.submit)).body.pending,true);
});
test('changed inspection blocks approval, unauthorized and cross-project requests fail',async t=>{
    const {db,workflow,call}=await fixture(t);
    assert.equal((await call(workflow.submit,{inspId:60})).code,404);
    await call(workflow.submit);
    assert.equal((await call(workflow.review('approve'),{id:1})).code,403);
    await db.query("UPDATE occupancy_inspections SET findings='Updated' WHERE id=50");
    assert.equal((await call(workflow.review('approve'),{id:1,role:'admin'})).body.conflict,true);
    assert.equal((await db.query('SELECT findings FROM occupancy_inspections WHERE id=50'))[0][0].findings,'Updated');
    assert.equal((await call(workflow.submit)).body.pending,true);
});
test('administrator direct delete remains supported and other request types pass through',async t=>{
    const {db,workflow,call}=await fixture(t);
    assert.equal((await call(workflow.submit,{role:'admin'})).body.pending,undefined);
    assert.equal((await db.query('SELECT * FROM occupancy_inspections WHERE id=50'))[0].length,0);
    assert.equal((await call(workflow.review('approve'),{id:999,role:'admin'})).next,true);
});
