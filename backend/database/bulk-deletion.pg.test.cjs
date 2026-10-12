// All records and cascades are temporary fixtures. No office records are mutated.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const createWorkflow = require('../monitorBP backend/bulkDeletionWorkflow');
const adapter = require('./index');
const testConnections = JSON.parse(process.env.OFFICE_PG_CONNECTIONS || '[]');
if (adapter.dialect !== 'postgres' || !testConnections.some(c => c.source === 'permit_system' && c.database === 'permit_system_test')) throw Error('Bulk deletion tests require the isolated permit_system_test database.');

async function fixture(t) {
    const pool = adapter.createPool({database:'permit_system'}), db = await pool.getConnection();
    t.after(async () => { await db.end(); await pool.end(); });
    const tables = {
        users: 'id INT PRIMARY KEY,username VARCHAR(50),role VARCHAR(20),is_active INT,is_verified INT',
        permits: 'id INT PRIMARY KEY,project_title VARCHAR(255),permit_date DATE',
        occupancy_permits: 'id INT PRIMARY KEY,project_title VARCHAR(255),date_applied DATE',
        permit_lots: 'id INT PRIMARY KEY,permit_id INT REFERENCES permits(id) ON DELETE CASCADE,lot_number VARCHAR(100)',
        sub_permits: 'id INT PRIMARY KEY,permit_id INT REFERENCES permits(id) ON DELETE CASCADE,sub_project_title VARCHAR(255)',
        permit_routing_matrix: 'id INT PRIMARY KEY,permit_id INT REFERENCES permits(id) ON DELETE CASCADE,sub_permit_id INT REFERENCES sub_permits(id) ON DELETE CASCADE,discipline_name VARCHAR(100),signature_status VARCHAR(30),feedback_remarks TEXT',
        occupancy_routing_matrix: 'id INT PRIMARY KEY,occupancy_id INT REFERENCES occupancy_permits(id) ON DELETE CASCADE,discipline_name VARCHAR(100),signature_status VARCHAR(30),feedback_remarks TEXT',
        permit_inspections: 'id INT PRIMARY KEY,permit_id INT REFERENCES permits(id) ON DELETE CASCADE,findings TEXT',
        occupancy_inspections: 'id INT PRIMARY KEY,occupancy_id INT REFERENCES occupancy_permits(id) ON DELETE CASCADE,findings TEXT',
        occupancy_checklists: 'id INT PRIMARY KEY,occupancy_id INT REFERENCES occupancy_permits(id) ON DELETE CASCADE,checklist_state JSON',
        permit_change_requests: 'id INT PRIMARY KEY,permit_id INT REFERENCES permits(id) ON DELETE CASCADE,changes JSON,status VARCHAR(30)',
        occupancy_change_requests: 'id INT PRIMARY KEY,occupancy_id INT REFERENCES occupancy_permits(id) ON DELETE CASCADE,changes JSON,status VARCHAR(30)',
        permit_final_reviews: 'id INT PRIMARY KEY,kind VARCHAR(16),project_id INT,decision VARCHAR(30),snapshot JSON',
        project_records: 'id SERIAL PRIMARY KEY,kind VARCHAR(16),project_id INT,project_title VARCHAR(255),actor_id INT,actor_name VARCHAR(100),actor_role VARCHAR(20),category VARCHAR(16),outcome VARCHAR(20),message TEXT,details TEXT,request_key VARCHAR(100) UNIQUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        deletion_blocker: 'permit_id INT REFERENCES permits(id),occupancy_id INT REFERENCES occupancy_permits(id)'
    };
    for (const [table, columns] of Object.entries(tables)) await db.query('CREATE TEMP TABLE ' + table + ' (' + columns + ')');
    await db.query("INSERT INTO users VALUES (1,'operator','operator',1,1),(2,'boss','admin',1,1),(3,'it','superadmin',1,1),(4,'inactive','operator',0,1)");
    await db.query("INSERT INTO permits VALUES (10,'Building A','2026-10-01'),(20,'Building B','2026-10-02')");
    await db.query("INSERT INTO occupancy_permits VALUES (10,'Occupancy A','2026-10-01'),(20,'Occupancy B','2026-10-02')");
    await db.query("INSERT INTO permit_lots VALUES (1,10,'Lot 1');");
    await db.query("INSERT INTO sub_permits VALUES (7,10,'Annex')");
    await db.query("INSERT INTO permit_routing_matrix VALUES (1,10,NULL,'Electrical','Approved','Historical station remark'),(2,NULL,7,'Sanitary','Pending','Sub-permit remark')");
    await db.query("INSERT INTO occupancy_routing_matrix VALUES (1,10,'Sanitary','Approved','Occupancy remark')");
    await db.query("INSERT INTO occupancy_inspections VALUES (1,10,'Inspection history')");
    await db.query("INSERT INTO occupancy_checklists VALUES (1,10,'{\"documents\":true}')");
    await db.query("INSERT INTO permit_change_requests VALUES (1,10,'{\"project_title\":\"Proposed\"}','approved')");
    await db.query("INSERT INTO occupancy_change_requests VALUES (1,10,'{\"remark\":\"Old request\"}','rejected')");
    await db.query("INSERT INTO permit_final_reviews VALUES (1,'permits',10,'approved','{\"history\":\"Original approval\"}'),(2,'occupancy',10,'approved','{\"history\":\"Original approval\"}')");
    await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ' + Object.keys(tables).map(table => 'pg_temp.' + table).join(',') + ' TO permit_app_migration');
    await db.query('GRANT USAGE,SELECT ON SEQUENCE pg_temp.project_records_id_seq TO permit_app_migration');
    await db.query('SET ROLE permit_app_migration');
    const service = createWorkflow(async () => ({...db,end:async()=>{},release:()=>{}}));
    async function call(handler, {role='operator', userId=role==='admin'?2:role==='superadmin'?3:1, body={}, id=1} = {}) {
        const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
        await handler({user:{id:userId,role},body,params:{id}},res);
        return res;
    }
    const read = async (kind='permits') => (await call(service.status(kind))).body;
    async function submit(kind='permits') {
        const preview=await read(kind);
        return call(service.submit(kind),{body:{confirmation:'DELETE ALL',version:preview.version}});
    }
    const review=(kind,id,decision='approve',options={}) => call(service.review(kind,decision),{role:'admin',id,body:{confirmation:'DELETE ALL'},...options});
    const rows=async table => (await db.query('SELECT * FROM ' + table + ' ORDER BY id'))[0];
    return {db,service,call,read,submit,review,rows};
}

for (const kind of ['permits','occupancy']) {
    const table=kind==='permits'?'permits':'occupancy_permits',other=kind==='permits'?'occupancy_permits':'permits';
    test(kind+': request retains records, blocks unauthorized review and suppresses duplicates',async t=>{
        const f=await fixture(t), submitted=await f.submit(kind);
        assert.equal(submitted.body.pending,true);assert.equal(submitted.body.count,2);
        assert.equal((await f.rows(table)).length,2);
        const duplicate=await f.submit(kind);assert.equal(duplicate.body.duplicate,true);
        assert.equal((await f.service.pending(kind)).length,1);
        for(const role of ['operator','superadmin'])assert.equal((await f.review(kind,submitted.body.requestId,'approve',{role})).code,403);
        assert.equal((await f.review(kind,submitted.body.requestId,'approve',{userId:1})).code,403);
        assert.equal((await f.call(f.service.submit(kind),{role:'admin',body:{confirmation:'DELETE ALL'}})).code,403);
        assert.equal((await f.call(f.service.submit(kind),{userId:4})).code,403);
        assert.equal((await f.rows(table)).length,2);assert.equal((await f.rows(other)).length,2);
    });
    test(kind+': approval cascades only the requested registry and retains archived records and history',async t=>{
        const f=await fixture(t),submitted=await f.submit(kind),id=submitted.body.requestId;
        assert.equal((await f.review(kind,id,'approve',{body:{}})).code,400);
        const result=await f.review(kind,id);assert.equal(result.code,200);assert.equal(result.body.deletedCount,2);
        assert.equal((await f.rows(table)).length,0);assert.equal((await f.rows(other)).length,2);
        assert.equal((await f.rows('users')).length,4);assert.equal((await f.rows('permit_final_reviews')).length,2);
        for(const child of kind==='permits'?['permit_lots','sub_permits','permit_routing_matrix','permit_change_requests']:['occupancy_routing_matrix','occupancy_inspections','occupancy_checklists','occupancy_change_requests'])assert.equal((await f.rows(child)).length,0,child);
        const audit=await f.rows('project_records'),request=audit.find(r=>r.id===id),archive=JSON.parse(request.details);
        assert.equal(request.outcome,'approved');assert.equal(request.request_key,null);assert.equal(archive.reviewed_by,'boss');assert.equal(archive.projects.length,2);assert.equal(archive.projects[0].requests.length,1);assert.equal(archive.projects[0].matrix.length,1);assert.equal(archive.projects[0].final_reviews.length,1);
        assert.equal(audit.filter(r=>r.category==='activity'&&r.actor_name==='boss').length,2);
        assert.equal((await f.review(kind,id)).code,409);assert.equal((await f.read(kind)).pending,null);
        assert.equal((await f.submit(kind)).code,400);
    });
    test(kind+': decline keeps every record and allows a fresh request',async t=>{
        const f=await fixture(t),submitted=await f.submit(kind);
        assert.equal((await f.review(kind,submitted.body.requestId,'reject')).body.success,true);
        assert.equal((await f.rows(table)).length,2);
        assert.equal((await f.review(kind,submitted.body.requestId)).code,409);
        assert.equal((await f.submit(kind)).body.pending,true);
    });
    test(kind+': changed station data blocks deletion; newly created permits are excluded',async t=>{
        const f=await fixture(t),submitted=await f.submit(kind);
        const matrix=kind==='permits'?'permit_routing_matrix':'occupancy_routing_matrix';
        await f.db.query('UPDATE '+matrix+' SET feedback_remarks=? WHERE id=1',['Changed after submission']);
        const stale=await f.review(kind,submitted.body.requestId);assert.equal(stale.code,409);assert.equal(stale.body.conflict,true);assert.equal((await f.rows(table)).length,2);
        const fresh=await f.submit(kind);assert.equal(fresh.body.count,2);
        await f.db.query('INSERT INTO '+table+' VALUES (30,?,?)',['Created later','2026-10-03']);
        assert.equal((await f.review(kind,fresh.body.requestId)).body.deletedCount,2);
        assert.deepEqual((await f.rows(table)).map(r=>r.id),[30]);
    });
    test(kind+': failure rolls back deletion, approval status and per-project audit together',async t=>{
        const f=await fixture(t),submitted=await f.submit(kind);
        await f.db.query('INSERT INTO deletion_blocker ('+(kind==='permits'?'permit_id':'occupancy_id')+') VALUES (10)');
        const failed=await f.review(kind,submitted.body.requestId);assert.equal(failed.code,503);
        assert.equal((await f.rows(table)).length,2);assert.equal((await f.rows('project_records')).length,1);assert.equal((await f.read(kind)).pending.id,submitted.body.requestId);
        await f.db.query('DELETE FROM deletion_blocker');
        assert.equal((await f.review(kind,submitted.body.requestId)).body.success,true);
    });
}
test('preview scope and explicit confirmation are required; both registries can have separate pending requests',async t=>{
    const f=await fixture(t),preview=await f.read();
    assert.equal((await f.call(f.service.submit('permits'),{body:{version:preview.version}})).code,400);
    await f.db.query("INSERT INTO permits VALUES (30,'New project','2026-10-03')");
    assert.equal((await f.call(f.service.submit('permits'),{body:{confirmation:'DELETE ALL',version:preview.version}})).code,409);
    const building=await f.submit('permits'),occupancy=await f.submit('occupancy');
    assert.equal(building.body.count,3);assert.equal(occupancy.body.count,2);
    assert.equal((await f.rows('project_records')).length,2);
});

test('new or edited Building inspections invalidate pending bulk deletion and are archived on fresh approval',async t=>{
    const f=await fixture(t),empty=await f.submit('permits');
    await f.db.query("INSERT INTO permit_inspections VALUES (1,10,'Building inspection findings')");
    assert.equal((await f.review('permits',empty.body.requestId)).body.conflict,true);
    const submitted=await f.submit('permits');
    await f.db.query("UPDATE permit_inspections SET findings='Edited findings' WHERE id=1");
    assert.equal((await f.review('permits',submitted.body.requestId)).body.conflict,true);
    const fresh=await f.submit('permits');
    assert.equal((await f.review('permits',fresh.body.requestId)).body.success,true);
    assert.equal((await f.rows('permit_inspections')).length,0);
    const archive=JSON.parse((await f.rows('project_records')).find(row=>row.id===fresh.body.requestId).details);
    assert.equal(archive.projects[0].inspections[0].findings,'Edited findings');
    assert.equal((await f.rows('occupancy_inspections')).length,1);
});
